"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { approveEpisode, rejectEpisode, saveCaption } from "@/lib/episodes";

/**
 * Server Actions are public endpoints — proxy.ts route protection does not cover
 * them, so each one re-checks the session itself. The userId is then passed down
 * so the mutation is scoped to tenants this user owns.
 */
async function requireUserId(): Promise<string> {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) throw new Error("Unauthorized");
  return userId;
}

export async function approveAction(id: string, formData: FormData) {
  const userId = await requireUserId();
  await approveEpisode(id, userId, String(formData.get("caption") ?? ""));
  revalidatePath("/");
  revalidatePath(`/episode/${id}`);
  redirect("/");
}

export async function rejectAction(id: string) {
  const userId = await requireUserId();
  await rejectEpisode(id, userId);
  revalidatePath("/");
  revalidatePath(`/episode/${id}`);
  redirect("/");
}

export async function saveCaptionAction(id: string, formData: FormData) {
  const userId = await requireUserId();
  await saveCaption(id, String(formData.get("caption") ?? ""), userId);
  revalidatePath(`/episode/${id}`);
}
