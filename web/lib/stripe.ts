import "server-only";
import Stripe from "stripe";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} is not set (web/.env.local, or the Vercel project env)`);
  return v.trim();
}

// Lazy singleton, same reasoning as lib/db.ts: don't touch STRIPE_SECRET_KEY at
// module load so `next build` still works without it set.
let _stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return _stripe;
}

/**
 * The "first 50 signups at $70/mo forever" promo, checked live against Stripe
 * on every checkout rather than hardcoding "50" here — Stripe's own
 * `max_redemptions` stays the single source of truth. Returns null once
 * exhausted, absent, or inactive, so callers fall back to a plain checkout.
 */
export async function activeFoundingPromotionCode(): Promise<Stripe.PromotionCode | null> {
  const code = process.env.STRIPE_FOUNDING_PROMO_CODE;
  if (!code) return null;
  const stripe = getStripe();
  const { data } = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
  const promo = data[0];
  if (!promo) return null;
  if (promo.max_redemptions != null && promo.times_redeemed >= promo.max_redemptions) return null;
  return promo;
}
