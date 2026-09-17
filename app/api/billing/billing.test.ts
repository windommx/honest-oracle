import { describe, it, expect, vi, beforeEach } from "vitest";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Billing webhook tests.                                                  ║
// ║                                                                          ║
// ║  The pricing page promises "ยกเลิกได้ทุกเมื่อ … กลับไปอยู่ภายใต้เพดาน    ║
// ║  ของแผนฟรี" — cancel any time and drop back to the free plan's caps.     ║
// ║  That promise was not kept: Stripe does not copy Checkout Session        ║
// ║  metadata onto the Subscription it creates, so every                     ║
// ║  customer.subscription.* event arrived with empty metadata and the       ║
// ║  downgrade branch never ran. Pro was permanent and, after the first      ║
// ║  month, free.                                                            ║
// ║                                                                          ║
// ║  These mock Stripe and Prisma and assert what the handler writes.        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const { db, stripe } = vi.hoisted(() => ({
  db: {
    subscription: { updateMany: vi.fn(), findFirst: vi.fn() },
    user: { update: vi.fn() },
  },
  stripe: {
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/stripe", () => ({ getStripe: () => stripe }));
vi.mock("@/lib/server/env", () => ({
  getEnv: () => ({ STRIPE_WEBHOOK_SECRET: "whsec_test", NEXTAUTH_URL: "https://app.test" }),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stagePlan } from "@/lib/stagelab/plans";
import { POST } from "./webhook/route";

const post = () =>
  POST(
    new Request("https://app.test/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    }) as never,
  );

const planWritten = () =>
  db.user.update.mock.calls.map((c) => (c[0] as { data: { plan: string } }).data.plan);

beforeEach(() => {
  vi.clearAllMocks();
  db.subscription.findFirst.mockResolvedValue(null);
  db.subscription.updateMany.mockResolvedValue({ count: 1 });
  db.user.update.mockResolvedValue({});
});

describe("a cancelled subscription downgrades the customer", () => {
  it("finds the owner from our own record when Stripe sends no metadata", async () => {
    // Every subscription created before the checkout route started setting
    // subscription_data.metadata has none. Those are exactly the customers
    // whose cancellations were being dropped on the floor.
    db.subscription.findFirst.mockResolvedValueOnce({ userId: "u-legacy" });
    stripe.webhooks.constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", customer: "cus_1", metadata: {}, status: "canceled" } },
    });

    await post();

    expect(db.user.update).toHaveBeenCalledTimes(1);
    expect(db.user.update.mock.calls[0][0]).toMatchObject({
      where: { id: "u-legacy" },
      data: { plan: "free" },
    });
  });

  it("falls back to the customer id when the subscription id is unknown", async () => {
    db.subscription.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: "u-by-customer" });
    stripe.webhooks.constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_x", customer: "cus_9", metadata: {}, status: "canceled" } },
    });

    await post();

    expect(planWritten()).toEqual(["free"]);
    expect(db.subscription.findFirst.mock.calls[1][0]).toMatchObject({
      where: { stripeCustomerId: "cus_9" },
    });
  });

  it("treats a deletion as cancelled whatever status the payload carries", async () => {
    stripe.webhooks.constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { id: "s", customer: "c", metadata: { userId: "u" }, status: "active" } },
    });

    await post();

    expect(planWritten()).toEqual(["free"]);
  });
});

describe("an unpaid session does not buy anything", () => {
  it("refuses to grant Pro on a completed-but-unpaid checkout", async () => {
    // An SCA challenge that fails still completes the session, with
    // payment_status "unpaid" and the subscription "incomplete".
    stripe.webhooks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { metadata: { userId: "u" }, payment_status: "unpaid", status: "open" } },
    });

    await post();

    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.subscription.updateMany).not.toHaveBeenCalled();
  });

  it("grants Pro when the session is actually paid", async () => {
    stripe.webhooks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: { metadata: { userId: "u" }, payment_status: "paid", subscription: "sub_1" },
      },
    });

    await post();

    expect(planWritten()).toEqual(["pro"]);
  });
});

describe("out-of-order delivery cannot restore a cancelled plan", () => {
  it("asks Stripe for the current state rather than trusting the payload", async () => {
    // Webhook delivery is at-least-once and unordered: a retried "active"
    // can land after a "canceled".
    stripe.subscriptions.retrieve.mockResolvedValue({
      status: "canceled",
      current_period_end: 1700000000,
      cancel_at_period_end: true,
    });
    stripe.webhooks.constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: { id: "sub_1", customer: "c", metadata: { userId: "u" }, status: "active" },
      },
    });

    await post();

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_1");
    expect(planWritten()).toEqual(["free"]);
  });

  it("uses the payload if Stripe cannot be reached, rather than failing the hook", async () => {
    stripe.subscriptions.retrieve.mockRejectedValue(new Error("network"));
    stripe.webhooks.constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: { id: "sub_1", customer: "c", metadata: { userId: "u" }, status: "active" },
      },
    });

    const res = await post();

    expect(res.status).toBe(200);
    expect(planWritten()).toEqual(["pro"]);
  });
});

describe("the plans we sell are the plans we can assign", () => {
  it("puts the tenant id where the subscription webhook will look for it", () => {
    // Static, because mocking Stripe's checkout builder would only assert the
    // mock. The failure this guards is an omission, and an omission is
    // exactly what a static read can see.
    const src = readFileSync(join(__dirname, "checkout", "route.ts"), "utf8");
    expect(src, "Session metadata is not copied onto the Subscription")
      .toMatch(/subscription_data:\s*\{\s*metadata:/);
  });

  it("does not drop a premium customer to free StageLab limits", () => {
    // "premium" is sold at ฿599 and unlocks the public Oracle API. stagePlan
    // did not recognise it, so it fell through to the free branch and a
    // customer paying more than Pro got the Free caps.
    expect(stagePlan("premium").limits).toEqual(stagePlan("pro").limits);
    expect(stagePlan("free").key).toBe("free");
    expect(stagePlan("nonsense").key).toBe("free");
  });

  it("lets an administrator assign every plan the pricing pages sell", () => {
    const src = readFileSync(join(__dirname, "..", "admin", "users", "[id]", "route.ts"), "utf8");
    const enumLine = src.match(/plan:\s*z\.enum\(\[([^\]]*)\]\)/);
    expect(enumLine, "the admin plan enum must be findable").not.toBeNull();
    for (const plan of ["free", "pro", "premium", "team"]) {
      expect(enumLine![1], `${plan} is sold but cannot be assigned`).toContain(`"${plan}"`);
    }
  });
});
