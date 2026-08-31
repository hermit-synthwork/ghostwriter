import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./env.ts";
import type { Story } from "./story.ts";

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
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`unsafe tenant id: ${id}`);
  const path = join(TENANTS_DIR, `${id}.json`);
  if (!existsSync(path)) throw new Error(`No tenant "${id}" at ${path}`);
  const t = JSON.parse(readFileSync(path, "utf8")) as TenantConfig;
  if (t.id !== id) throw new Error(`Tenant file ${id}.json has mismatched id "${t.id}"`);
  return t;
}

/**
 * Synthesise a TenantConfig for local single-episode dev (`npm run art`).
 * Reads `tenants/local.json` if present (merged over the defaults so a partial
 * file works), otherwise returns a built-in default. `id: "local"` is already
 * filesystem-safe, so no sanitising is needed.
 */
export function loadLocalTenant(story: Story): TenantConfig {
  const defaults: TenantConfig = {
    id: "local",
    displayName: "GHOSTWRITER",
    styleKey: story.styleKey ?? "graphic-novel-noir",
    niche: "everyday life with a strange edge",
    genres: "both",
    autonomy: "review_each",
    cadence: { days: [1, 3, 5], time: "09:00", tz: "Asia/Singapore" },
    publish: {},
    geminiKey: undefined,
  };
  const path = join(TENANTS_DIR, "local.json");
  if (!existsSync(path)) return defaults;
  const override = JSON.parse(readFileSync(path, "utf8")) as Partial<TenantConfig>;
  return { ...defaults, ...override, id: "local" };
}

export function listTenants(): TenantConfig[] {
  if (!existsSync(TENANTS_DIR)) return [];
  return readdirSync(TENANTS_DIR)
    .filter((f) => f.endsWith(".json") && f !== "local.json")
    .map((f) => loadTenant(f.replace(/\.json$/, "")));
}

export function localParts(now: Date, tz: string): { weekday: number; hhmm: string; date: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit",
    year: "numeric", month: "2-digit", day: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[p.weekday as string]!,
    hhmm: `${p.hour}:${p.minute}`,
    date: `${p.year}-${p.month}-${p.day}`,
  };
}

export function isDue(t: TenantConfig, now: Date, lastEpisodeDate: string | null): boolean {
  const { weekday, hhmm, date } = localParts(now, t.cadence.tz);
  if (!t.cadence.days.includes(weekday)) return false;
  if (hhmm < t.cadence.time) return false;
  if (lastEpisodeDate === date) return false;
  return true;
}
