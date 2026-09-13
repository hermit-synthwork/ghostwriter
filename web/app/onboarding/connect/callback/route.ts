import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { attachInstagramAccount, getMyTenantByProfileId } from "@/lib/tenants";

/**
 * Zernio redirects the browser here after the Instagram OAuth dance, appending
 * `connected=instagram&profileId&accountId&username` on success or `error=...`
 * on failure. It carries Zernio's profileId, not our tenant id — we look the
 * tenant up by profileId and check ownership against the Clerk session, so a
 * forged callback can't attach an account to someone else's tenant.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

  const sp = req.nextUrl.searchParams;
  const errorUrl = (params: URLSearchParams) =>
    NextResponse.redirect(new URL(`/onboarding/connect/error?${params}`, req.url));

  if (sp.get("error")) return errorUrl(sp);

  const profileId = sp.get("profileId");
  const accountId = sp.get("accountId");
  if (sp.get("connected") !== "instagram" || !profileId || !accountId) {
    return errorUrl(new URLSearchParams({ error: "unexpected_response" }));
  }

  const tenant = await getMyTenantByProfileId(profileId, userId);
  if (!tenant) return errorUrl(new URLSearchParams({ error: "tenant_mismatch" }));

  await attachInstagramAccount(tenant.id, userId, { accountId, handle: sp.get("username") ?? "" });
  return NextResponse.redirect(new URL("/onboarding/payment", req.url));
}
