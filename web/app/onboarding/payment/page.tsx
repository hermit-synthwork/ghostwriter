import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getMyLatestTenant } from "@/lib/tenants";
import { STYLES, GENRES } from "@/lib/styles";
import { activeFoundingPromotionCode } from "@/lib/stripe";
import { createCheckoutSessionAction } from "./actions";

export const dynamic = "force-dynamic";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function PaymentPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const tenant = await getMyLatestTenant(userId);
  if (!tenant) redirect("/onboarding");
  if (tenant.onboardingStatus === "pending_connect") redirect("/onboarding");
  if (tenant.onboardingStatus === "active") redirect("/");

  const promo = await activeFoundingPromotionCode();
  const style = STYLES.find((s) => s.key === tenant.styleKey)?.label ?? tenant.styleKey;
  const genre = GENRES.find((g) => g.key === tenant.genres)?.label ?? tenant.genres;
  const days = tenant.cadence.days.length === 7 ? "Daily" : tenant.cadence.days.map((d) => DAY[d]).join(" · ");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-zinc-100">Start your subscription</h1>

      {tenant.onboardingStatus === "payment_failed" && (
        <p className="text-sm text-red-400">Your last payment didn&apos;t go through — restart your subscription below.</p>
      )}

      <dl className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/50 text-sm">
        <Row label="Instagram" value={tenant.publish.instagram ? `@${tenant.publish.instagram.handle}` : "—"} />
        <Row label="Style" value={style} />
        <Row label="Genre" value={genre} />
        <Row label="Niche" value={tenant.niche} />
        <Row label="Posts" value={`${days} at ${tenant.cadence.time}`} />
      </dl>

      <div>
        {promo ? (
          <p className="text-sm text-zinc-300">
            <span className="text-zinc-500 line-through">$138/mo</span>{" "}
            <span className="font-semibold text-amber-300">$70/mo</span> — founding member price, locked in for as long as
            you stay subscribed.
          </p>
        ) : (
          <p className="text-sm text-zinc-300">$138/month. Cancel anytime.</p>
        )}
      </div>

      <form action={createCheckoutSessionAction}>
        <button
          type="submit"
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
        >
          Continue to payment
        </button>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-3 py-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right text-zinc-200">{value}</dd>
    </div>
  );
}
