import Stripe from "stripe";
import { getEnv } from "@/lib/server/env";

export function getStripe() {
  const env = getEnv();
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });
}
