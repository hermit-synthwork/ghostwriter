import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./env.ts";

export const TENANTS_DIR = join(REPO_ROOT, "tenants");

export interface PublishTarget { accountId: string; handle: string; format: "4x5" | "9x16" }
export interface Cadence { days: number[]; time: string; tz: string }
export interface TenantConfig {
  id: string;
  displayName: string;
  styleKey: string;
  niche: string;
  genres: "funny" | "horror" | "both";
  autonomy: "autonomous" | "review_each" | "review_weekly";
  cadence: Cadence;
  publish: { instagram?: PublishTarget; tiktok?: PublishTarget };
  geminiKey?: string;
}

export function loadTenant(id: string): TenantConfig {
  const path = join(TENANTS_DIR, `${id}.json`);
  if (!existsSync(path)) throw new Error(`No tenant "${id}" at ${path}`);
  const t = JSON.parse(readFileSync(path, "utf8")) as TenantConfig;
  if (t.id !== id) throw new Error(`Tenant file ${id}.json has mismatched id "${t.id}"`);
  return t;
}

export function listTenants(): TenantConfig[] {
  if (!existsSync(TENANTS_DIR)) return [];
  return readdirSync(TENANTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => loadTenant(f.replace(/\.json$/, "")));
}
