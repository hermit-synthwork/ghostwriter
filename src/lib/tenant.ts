import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { tenant, type TenantRow } from "../db/schema.ts";

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

function toConfig(r: TenantRow): TenantConfig {
  return {
    id: r.id, displayName: r.displayName, styleKey: r.styleKey, niche: r.niche,
    genres: r.genres, autonomy: r.autonomy, cadence: r.cadence,
    publish: r.publish, geminiKey: undefined, // BYO wired in sub-project B
  };
}

export async function listActiveTenants(): Promise<TenantConfig[]> {
  const rows = await db.select().from(tenant).where(eq(tenant.active, true));
  return rows.map(toConfig);
}

export async function getTenant(id: string): Promise<TenantConfig> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`unsafe tenant id: ${id}`);
  const [r] = await db.select().from(tenant).where(eq(tenant.id, id)).limit(1);
  if (!r) throw new Error(`no tenant "${id}"`);
  return toConfig(r);
}
