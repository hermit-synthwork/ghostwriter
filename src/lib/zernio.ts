import { requireEnv } from "./env.ts";

const BASE = "https://zernio.com/api/v1";

const KEY_HINT =
  "Create one in the Zernio dashboard → API Keys.";

/** Env-var name for a tenant's dedicated Zernio account key: `ZERNIO_API_KEY_<ID>`,
 *  tenant id uppercased with every non-alphanumeric run collapsed to `_`. */
export function zernioKeyVar(tenantId: string): string {
  return `ZERNIO_API_KEY_${tenantId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

/** Resolve the Zernio key for a tenant: its dedicated key if `ZERNIO_API_KEY_<ID>`
 *  is set, otherwise the shared `ZERNIO_API_KEY`. Returns the chosen var name too so
 *  callers can report which one to set. Throws (key-last) when neither exists. */
export function resolveZernioKey(
  tenantId: string,
  env: Record<string, string | undefined> = process.env,
): { varName: string; key: string } {
  const dedicated = zernioKeyVar(tenantId);
  const d = env[dedicated];
  if (d && d.trim()) return { varName: dedicated, key: d.trim() };
  const shared = env.ZERNIO_API_KEY;
  if (shared && shared.trim()) return { varName: "ZERNIO_API_KEY", key: shared.trim() };
  throw new Error(
    `Missing Zernio credential for tenant "${tenantId}": set ${dedicated} ` +
      `(a dedicated Zernio account) or ZERNIO_API_KEY (shared). ${KEY_HINT}`,
  );
}

function auth(apiKey?: string): string {
  return `Bearer ${apiKey ?? requireEnv("ZERNIO_API_KEY", `${KEY_HINT} Var: ZERNIO_API_KEY`)}`;
}

async function api<T>(path: string, init: RequestInit, apiKey?: string): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: auth(apiKey), "Content-Type": "application/json", ...(init.headers ?? {}) },
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
  apiKey?: string,
): Promise<string> {
  const { uploadUrl, publicUrl } = await api<Presign>("/media/presign", {
    method: "POST",
    body: JSON.stringify({ filename, contentType }),
  }, apiKey);
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

export type PublishMode = "draft" | "now" | "schedule";

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
  /** For mode "schedule": local wall-clock "YYYY-MM-DDTHH:MM:SS" + IANA `timezone`. */
  scheduledFor?: string;
  timezone?: string;
  apiKey?: string;
}): Promise<CreatedPost> {
  const body: Record<string, unknown> = {
    content: opts.content,
    mediaItems: opts.mediaUrls.map((url) => ({ type: "image", url })),
    platforms: [{ platform: opts.platform, accountId: opts.accountId }],
  };
  if (opts.mode === "now") {
    body.publishNow = true;
  } else if (opts.mode === "schedule") {
    if (!opts.scheduledFor || !opts.timezone) {
      throw new Error('createPost mode "schedule" needs scheduledFor + timezone');
    }
    body.scheduledFor = opts.scheduledFor;
    body.timezone = opts.timezone;
  } else {
    body.isDraft = true;
  }

  return api<CreatedPost>("/posts", { method: "POST", body: JSON.stringify(body) }, opts.apiKey);
}
