import { requireEnv } from "./env.ts";

const BASE = "https://zernio.com/api/v1";

const KEY_HINT =
  "Create one in the Zernio dashboard → API Keys. Var: ZERNIO_API_KEY";

function auth(): string {
  return `Bearer ${requireEnv("ZERNIO_API_KEY", KEY_HINT)}`;
}

async function api<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: auth(), "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Zernio ${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

interface Presign {
  uploadUrl: string;
  publicUrl: string;
}

/** presign → PUT the bytes → return the public URL to reference in a post. */
export async function uploadImage(
  bytes: Buffer,
  filename: string,
  contentType = "image/jpeg",
): Promise<string> {
  const { uploadUrl, publicUrl } = await api<Presign>("/media/presign", {
    method: "POST",
    body: JSON.stringify({ filename, contentType }),
  });
  const put = await fetch(uploadUrl, {
    method: "PUT",
    body: new Uint8Array(bytes),
    headers: { "Content-Type": contentType },
  });
  if (!put.ok) {
    throw new Error(`Upload PUT for ${filename} → ${put.status}: ${(await put.text()).slice(0, 300)}`);
  }
  return publicUrl;
}

export type PublishMode = "draft" | "now";

export interface CreatedPost {
  post?: { _id?: string; status?: string };
  _id?: string;
}

export async function createPost(opts: {
  content: string;
  mediaUrls: string[];
  platform: string;
  accountId: string;
  mode: PublishMode;
}): Promise<CreatedPost> {
  const body: Record<string, unknown> = {
    content: opts.content,
    mediaItems: opts.mediaUrls.map((url) => ({ type: "image", url })),
    platforms: [{ platform: opts.platform, accountId: opts.accountId }],
  };
  if (opts.mode === "now") body.publishNow = true;
  else body.isDraft = true;

  return api<CreatedPost>("/posts", { method: "POST", body: JSON.stringify(body) });
}
