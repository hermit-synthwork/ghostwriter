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

export interface PostSpec {
  content: string;
  mediaUrls: string[];
  platform: string;
  accountId: string;
  mode: PublishMode;
  /** For mode "schedule": local wall-clock "YYYY-MM-DDTHH:MM:SS" + IANA `timezone`. */
  scheduledFor?: string;
  timezone?: string;
  apiKey?: string;
}

/** TikTok photo-carousel titles are capped at 90 chars with hashtags stripped;
 *  the real caption goes in `tiktokSettings.description`. Take the caption's
 *  first line (before the hashtag block). */
export function tiktokTitle(content: string): string {
  return content.split("\n\n")[0]!.replace(/#\S+/g, "").trim().slice(0, 90);
}

/**
 * Build the `POST /posts` body. TikTok needs `tiktokSettings` at the top level
 * (privacy + the two legal-consent flags + `media_type: "photo"`), and always
 * goes via Creator Inbox (`draft: true`) — TikTok's direct photo-post endpoint
 * is audit-gated and frequently at capacity, so the reliable path is: Zernio
 * delivers to the account's inbox, the creator taps "Post" once in the app.
 * Instagram uses the caption+hashtags string directly as `content`.
 */
export function buildPostBody(opts: PostSpec): Record<string, unknown> {
  const body: Record<string, unknown> = {
    content: opts.content,
    mediaItems: opts.mediaUrls.map((url) => ({ type: "image", url })),
    platforms: [{ platform: opts.platform, accountId: opts.accountId }],
  };

  if (opts.platform === "tiktok") {
    body.content = tiktokTitle(opts.content);
    body.tiktokSettings = {
      draft: true, // Creator Inbox — creator finalises in the TikTok app
      media_type: "photo",
      photo_cover_index: 0,
      privacy_level: "PUBLIC_TO_EVERYONE",
      allow_comment: true,
      auto_add_music: true,
      content_preview_confirmed: true, // TikTok legal requirement; must be true
      express_consent_given: true, //     "
      description: opts.content, // full caption + hashtags, up to 4000 chars
    };
  }

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
  return body;
}

export async function createPost(opts: PostSpec): Promise<CreatedPost> {
  return api<CreatedPost>(
    "/posts",
    { method: "POST", body: JSON.stringify(buildPostBody(opts)) },
    opts.apiKey,
  );
}
