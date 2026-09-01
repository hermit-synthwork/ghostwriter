import { put } from "@vercel/blob";
import { loadEnv, requireEnv } from "./env.ts";

// Load .env once at import — `requireEnv` below still reads process.env lazily
// inside putPanel so merely importing this module (e.g. for panelBlobKey in a
// test) never triggers requireEnv's process.exit when the token is unset.
loadEnv();

export function panelBlobKey(blobPrefix: string, format: "4x5" | "9x16", n: number): string {
  return `${blobPrefix}/final-${format}/${String(n).padStart(2, "0")}.jpg`;
}

export async function putPanel(
  blobPrefix: string, format: "4x5" | "9x16", n: number, jpeg: Buffer,
): Promise<string> {
  const token = requireEnv("BLOB_READ_WRITE_TOKEN", "Vercel Blob store token. Var: BLOB_READ_WRITE_TOKEN");
  // Note: access: "public" is the only value @vercel/blob put accepts today;
  // the store itself is private-by-project and B fronts reads with signed/authorized routes.
  const { url } = await put(panelBlobKey(blobPrefix, format, n), jpeg, {
    access: "public", token, contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true,
  });
  return url;
}
