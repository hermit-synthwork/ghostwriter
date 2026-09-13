"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getMyLatestTenant } from "@/lib/tenants";
import { getStripe, activeFoundingPromotionCode } from "@/lib/stripe";

export async function createCheckoutSessionAction(): Promise<void> {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) throw new Error("Unauthorized");

  const tenant = await getMyLatestTenant(userId);
  if (!tenant || tenant.onboardingStatus === "pending_connect" || tenant.onboardingStatus === "active") {
    redirect("/onboarding");
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error("STRIPE_PRICE_ID is not set (web/.env.local, or the Vercel project env)");

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const user = await currentUser();
  const promo = await activeFoundingPromotionCode();

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: user?.primaryEmailAddress?.emailAddress,
    client_reference_id: tenant.id,
    metadata: { tenantId: tenant.id },
    subscription_data: { metadata: { tenantId: tenant.id } },
    // Stripe rejects a session that sets both — auto-apply the founding code
    // while it lasts, otherwise let the customer type any other valid code.
    ...(promo ? { discounts: [{ promotion_code: promo.id }] } : { allow_promotion_codes: true }),
    success_url: `${origin}/onboarding/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/onboarding/payment`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  redirect(session.url);
}
