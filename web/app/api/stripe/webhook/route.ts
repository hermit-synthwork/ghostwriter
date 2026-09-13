import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { activateTenantFromCheckout, syncSubscriptionStatus } from "@/lib/tenants";

const idOf = (v: string | { id: string } | null): string | null => (typeof v === "string" ? v : (v?.id ?? null));

/**
 * Public route (see proxy.ts) — authenticity comes from the Stripe signature,
 * verified against the raw body. Every write is an idempotent update keyed on
 * our own tenant id or the subscription id, so Stripe's at-least-once delivery
 * is harmless. Payment failures arrive as customer.subscription.updated with
 * status past_due/unpaid, so there's no separate invoice handler.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not set" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await req.text(), sig, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const tenantId = s.metadata?.tenantId ?? s.client_reference_id;
      const customerId = idOf(s.customer);
      const subscriptionId = idOf(s.subscription);
      if (tenantId && customerId && subscriptionId) {
        await activateTenantFromCheckout(tenantId, { customerId, subscriptionId });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      await syncSubscriptionStatus(sub.id, event.type === "customer.subscription.deleted" ? "canceled" : sub.status);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
