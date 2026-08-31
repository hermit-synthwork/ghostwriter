import { put } from "@vercel/blob";
import { loadEnv, requireEnv } from "./env.ts";

export function panelBlobKey(blobPrefix: string, format: "4x5" | "9x16", n: number): string {
  return `${blobPrefix}/final-${format}/${String(n).padStart(2, "0")}.jpg`;
}

export async function putPanel(
  blobPrefix: string, format: "4x5" | "9x16", n: number, jpeg: Buffer,
): Promise<string> {
  loadEnv();
  const token = requireEnv("BLOB_READ_WRITE_TOKEN", "Vercel Blob store token. Var: BLOB_READ_WRITE_TOKEN");
  // Note: access: "public" is the only value @vercel/blob put accepts today;
  // the store itself is private-by-project and B fronts reads with signed/authorized routes.
  const { url } = await put(panelBlobKey(blobPrefix, format, n), jpeg, {
    access: "public", token, contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true,
  });
  return url;
}
