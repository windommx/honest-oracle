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
    if (userId) {
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
    const userId = (sub.metadata as Record<string, string> | null)?.userId;
    const status = sub.status as string;
    const currentPeriodEnd =
      typeof sub.current_period_end === "number"
        ? new Date(sub.current_period_end * 1000)
        : null;
    const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);

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
