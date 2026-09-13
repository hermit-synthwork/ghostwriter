import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getMyLatestTenant } from "@/lib/tenants";
import { Wizard } from "./Wizard";
import { reconnectInstagramAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const tenant = await getMyLatestTenant(userId);

  if (!tenant) return <Wizard />;

  switch (tenant.onboardingStatus) {
    case "pending_connect":
      return (
        <div className="space-y-4">
          <h1 className="text-lg font-semibold text-zinc-100">Connect your Instagram</h1>
          <p className="text-sm text-zinc-400">
            Almost there — connect the Instagram account you want {tenant.displayName} to post to.
          </p>
          <form action={reconnectInstagramAction}>
            <button
              type="submit"
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
            >
              Connect Instagram
            </button>
          </form>
        </div>
      );
    case "pending_payment":
      redirect("/onboarding/payment");
    case "active":
      redirect("/");
    case "payment_failed":
    case "canceled":
      redirect("/onboarding/payment");
  }
}
