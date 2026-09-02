"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { approveEpisode, rejectEpisode, saveCaption } from "@/lib/episodes";

export async function approveAction(id: string, formData: FormData) {
  await approveEpisode(id, String(formData.get("caption") ?? ""));
  revalidatePath("/");
  revalidatePath(`/episode/${id}`);
  redirect("/");
}

export async function rejectAction(id: string) {
  await rejectEpisode(id);
  revalidatePath("/");
  revalidatePath(`/episode/${id}`);
  redirect("/");
}

export async function saveCaptionAction(id: string, formData: FormData) {
  await saveCaption(id, String(formData.get("caption") ?? ""));
  revalidatePath(`/episode/${id}`);
}
