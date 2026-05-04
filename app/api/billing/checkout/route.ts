import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { getEnv } from "@/lib/server/env";
import { getStripe } from "@/lib/server/stripe";

export async function POST(_request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = getEnv();
  const stripe = getStripe();
  if (!stripe || !env.STRIPE_PRICE_ID_PRO) {
    return NextResponse.json(
      { error: "Billing is not configured" },
      { status: 501 }
    );
  }

  const existing = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });

  let customerId = existing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
  }

  await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      provider: "stripe",
      plan: "pro",
      status: "pending",
      stripeCustomerId: customerId,
    },
    update: { stripeCustomerId: customerId },
  });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: env.STRIPE_PRICE_ID_PRO, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${env.NEXTAUTH_URL}/oracle/pricing?success=1`,
    cancel_url: `${env.NEXTAUTH_URL}/oracle/pricing?canceled=1`,
    client_reference_id: user.id,
    metadata: { userId: user.id, plan: "pro" },
  });

  return NextResponse.json({ url: session.url });
}
