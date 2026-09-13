"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createProfile, connectInstagramUrl } from "@/lib/zernio";
import {
  createDraftTenant,
  attachZernioProfile,
  getMyLatestTenant,
  type Genre,
} from "@/lib/tenants";
import { cadenceDaysForPreset, type CadencePreset } from "@/lib/styles";

/** Server Actions are public endpoints — proxy.ts doesn't cover them, so each
 *  one re-checks the session itself, mirroring episode/[id]/actions.ts. */
async function requireUserId(): Promise<string> {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) throw new Error("Unauthorized");
  return userId;
}

async function origin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host");
  return `${proto}://${host}`;
}

export interface WizardInput {
  styleKey: string;
  niche: string;
  genre: Genre;
  cadence: CadencePreset;
  /** IANA timezone from the browser — the server's own zone is UTC on Vercel. */
  tz: string;
}

// Returns the Zernio authUrl rather than calling next/navigation's redirect()
// itself: this action is invoked from a client component via a manual
// try/catch + useTransition (not a plain <form action>), and redirect()'s
// NEXT_REDIRECT signal must propagate uncaught to work — a try/catch around
// it would silently swallow the redirect. The caller navigates itself
// (window.location.href) instead, which is also the more natural mechanism
// here since the destination is an external domain (Zernio's OAuth page),
// not an internal Next.js route.
export async function startOnboardingAction(input: WizardInput): Promise<{ authUrl: string }> {
  const userId = await requireUserId();
  const user = await currentUser();

  // Kebab-case, unique: Clerk user id + a short suffix so a user can retry
  // onboarding with a fresh tenant if an earlier attempt gets abandoned.
  const tenantId = `${userId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  const signupDay = new Date().getDay();

  const tenant = await createDraftTenant(userId, {
    id: tenantId,
    displayName: user?.username ?? user?.firstName ?? "My account",
    styleKey: input.styleKey,
    niche: input.niche,
    genres: input.genre,
    cadenceDays: cadenceDaysForPreset(input.cadence, signupDay),
    cadenceTz: input.tz || "UTC",
  });

  const profileId = await createProfile(tenant.id);
  await attachZernioProfile(tenant.id, userId, profileId);

  const redirectUrl = `${await origin()}/onboarding/connect/callback`;
  const authUrl = await connectInstagramUrl(profileId, redirectUrl);
  return { authUrl };
}

/** Re-trigger the connect step for an existing pending_connect tenant — used
 *  when a user leaves mid-OAuth and comes back, or a connect attempt errors.
 *  Invoked from a plain <form action={...}> (see onboarding/page.tsx), so
 *  redirect() here is safe — there's no client-side catch wrapping it. */
export async function reconnectInstagramAction(): Promise<void> {
  const userId = await requireUserId();
  const tenant = await getMyLatestTenant(userId);
  if (!tenant || !tenant.zernioProfileId) {
    throw new Error("No pending account to reconnect — start onboarding again.");
  }
  const redirectUrl = `${await origin()}/onboarding/connect/callback`;
  const authUrl = await connectInstagramUrl(tenant.zernioProfileId, redirectUrl);
  redirect(authUrl);
}
