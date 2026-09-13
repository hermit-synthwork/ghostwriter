import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getMyLatestTenant } from "@/lib/tenants";
import { AutoRefresh } from "./AutoRefresh";

export const dynamic = "force-dynamic";

export default async function CompletePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const tenant = await getMyLatestTenant(userId);
  if (!tenant) redirect("/onboarding");

  // The browser usually lands here a moment before Stripe's webhook flips the
  // tenant active — poll until it does.
  if (tenant.onboardingStatus !== "active") {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold text-zinc-100">Activating your account…</h1>
        <p className="text-sm text-zinc-400">Confirming your payment with Stripe. This usually takes a few seconds.</p>
        <AutoRefresh />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-zinc-100">You&apos;re live</h1>
      <p className="text-sm text-zinc-400">
        Ghostwriter will write and post your first comic on your next scheduled day
        {tenant.publish.instagram ? ` to @${tenant.publish.instagram.handle}` : ""}.
      </p>
      <Link href="/" className="inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500">
        Go to dashboard
      </Link>
    </div>
  );
}
