import "server-only";

const BASE = "https://zernio.com/api/v1";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} is not set (web/.env.local, or the Vercel project env)`);
  return v.trim();
}

function auth(): string {
  return `Bearer ${requireEnv("ZERNIO_API_KEY")}`;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
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

interface ProfileResponse {
  profile: { _id: string; name: string };
}

/**
 * One Zernio profile per self-serve tenant. The tenant's own kebab-case `id` is
 * the profile name — it's already unique (our PK), unlike `displayName` which a
 * user could type as a duplicate. The `Idempotency-Key` makes a retried call
 * (double-click, network blip) replay the same profile instead of 409'ing.
 */
export async function createProfile(tenantId: string): Promise<string> {
  const { profile } = await api<ProfileResponse>("/profiles", {
    method: "POST",
    headers: { "Idempotency-Key": tenantId },
    body: JSON.stringify({ name: tenantId }),
  });
  return profile._id;
}

interface ConnectResponse {
  authUrl: string;
}

/**
 * Instagram's default `instagram_login` connect flow hosts the entire OAuth +
 * account-selection UI on Zernio's side — redirect the browser to the
 * returned `authUrl`. Zernio's own callback then appends
 * `connected=instagram&profileId=...&accountId=...&username=...` (success) or
 * `error=...` (failure) onto `redirectUrl`, preserving any existing query string.
 */
export async function connectInstagramUrl(profileId: string, redirectUrl: string): Promise<string> {
  const qs = new URLSearchParams({ profileId, redirect_url: redirectUrl });
  const { authUrl } = await api<ConnectResponse>(`/connect/instagram?${qs}`);
  return authUrl;
}
