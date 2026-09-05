import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/server/session";
import { getEnv } from "@/lib/server/env";
import { getStripe } from "@/lib/server/stripe";

const RETURN_PATHS: Record<string, string> = { bookisdom: "/bookisdom/dashboard", lifemap: "/lifemap/pricing" };

export async function POST(request: NextRequest) {
  const { user, unavailable } = await getAuth();
  if (unavailable) return unavailable; // 503: server misconfigured — an honest status, not a crash
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional { returnTo: "bookisdom" | "lifemap" } so each product returns to its own page.
  let returnTo = "/lifemap/pricing";
  try {
    const body = (await request.json()) as { returnTo?: string };
    if (body?.returnTo && body.returnTo in RETURN_PATHS) returnTo = RETURN_PATHS[body.returnTo];
  } catch {
    /* no body — keep default */
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
    success_url: `${env.NEXTAUTH_URL}${returnTo}?success=1`,
    cancel_url: `${env.NEXTAUTH_URL}${returnTo}?canceled=1`,
    client_reference_id: user.id,
    metadata: { userId: user.id, plan: "pro" },
  });

  return NextResponse.json({ url: session.url });
}
