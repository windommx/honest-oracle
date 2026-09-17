import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/server/env";
import { getStripe } from "@/lib/server/stripe";

export async function POST(request: NextRequest) {
  const env = getEnv();
  const stripe = getStripe();
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Billing is not configured" },
      { status: 501 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const payload = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = (session.metadata as Record<string, string> | null)?.userId;
    // A completed session is not a paid one. In subscription mode an SCA
    // challenge that fails, or a delayed notification method, completes the
    // session with payment_status "unpaid" and the subscription "incomplete".
    // Granting Pro on that alone handed out the paid tier for nothing.
    const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
    if (userId && paid) {
      await prisma.subscription.updateMany({
        where: { userId },
        data: {
          status: "active",
          stripeSubscriptionId: (session.subscription as string) ?? null,
        },
      });
      await prisma.user.update({
        where: { id: userId },
        data: { plan: "pro" },
      });
    }
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object;

    // Three ways to learn whose subscription this is, in descending order of
    // directness. Metadata is set on new subscriptions by the checkout route,
    // but every subscription created before that fix has none — and those are
    // exactly the customers whose cancellations were being dropped. The two
    // lookups recover them from our own record.
    let userId = (sub.metadata as Record<string, string> | null)?.userId;
    if (!userId) {
      const known =
        (await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: sub.id as string },
          select: { userId: true },
        })) ??
        (typeof sub.customer === "string"
          ? await prisma.subscription.findFirst({
              where: { stripeCustomerId: sub.customer },
              select: { userId: true },
            })
          : null);
      userId = known?.userId;
    }

    // Webhook delivery is at-least-once and unordered, so a retried "active"
    // can arrive after a "canceled" and silently restore the paid tier. Ask
    // Stripe what is true now rather than trusting the order of the post.
    let status = sub.status as string;
    let currentPeriodEnd =
      typeof sub.current_period_end === "number"
        ? new Date(sub.current_period_end * 1000)
        : null;
    let cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
    if (event.type === "customer.subscription.updated") {
      try {
        const live = await stripe.subscriptions.retrieve(sub.id as string);
        status = live.status;
        currentPeriodEnd =
          typeof live.current_period_end === "number"
            ? new Date(live.current_period_end * 1000)
            : null;
        cancelAtPeriodEnd = Boolean(live.cancel_at_period_end);
      } catch {
        // Stripe unreachable: fall back to the payload we were handed. It is
        // the same information, just without the ordering guarantee.
      }
    }
    if (event.type === "customer.subscription.deleted") status = "canceled";

    if (userId) {
      await prisma.subscription.updateMany({
        where: { userId },
        data: {
          status,
          currentPeriodEnd,
          cancelAtPeriodEnd,
          stripeSubscriptionId: sub.id as string,
        },
      });

      const active = status === "active" || status === "trialing";
      await prisma.user.update({
        where: { id: userId },
        data: { plan: active ? "pro" : "free" },
      });
    }
  }

  return NextResponse.json({ received: true });
}
