import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listTenants, loadTenant, isDue, type TenantConfig } from "./lib/tenant.ts";
import { episodeDirFor, EPISODES_DIR, loadStory, type Story } from "./lib/story.ts";
import { writeStory } from "./write-story.ts";
import { generateArt } from "./engine/art.ts";
import { composeEpisode } from "./engine/compose.ts";
import { writeReviewBundle } from "./engine/review.ts";
import { publishEpisode } from "./engine/publish.ts";
import { localParts } from "./lib/tenant.ts";
import { writeFileSync, mkdirSync } from "node:fs";

export interface RunPlanItem { tenantId: string; genre: "funny" | "horror" }

function lastEpisodeMeta(tenantId: string): { date: string | null; genre: string | null; titles: string[] } {
  const dir = join(EPISODES_DIR, tenantId);
  if (!existsSync(dir)) return { date: null, genre: null, titles: [] };
  const eps = readdirSync(dir).filter((d) => existsSync(join(dir, d, "story.json"))).sort();
  if (eps.length === 0) return { date: null, genre: null, titles: [] };
  const titles = eps.slice(-5).map((d) => loadStory(join(dir, d)).title);
  const latest = loadStory(join(dir, eps[eps.length - 1]!));
  return { date: eps[eps.length - 1]!.slice(0, 10), genre: latest.genre, titles };
}

export function resolveRunPlan(tenants: TenantConfig[], now: Date): RunPlanItem[] {
  const plan: RunPlanItem[] = [];
  for (const t of tenants) {
    const meta = lastEpisodeMeta(t.id);
    if (!isDue(t, now, meta.date)) continue;
    const genre: "funny" | "horror" =
      t.genres !== "both" ? t.genres :
      meta.genre === "horror" ? "funny" : "horror";
    plan.push({ tenantId: t.id, genre });
  }
  return plan;
}

export async function runDueTenants(opts: {
  tenantId?: string; now?: Date; dry?: boolean; now_publish?: boolean;
}): Promise<void> {
  const now = opts.now ?? new Date();
  const tenants = opts.tenantId ? [loadTenant(opts.tenantId)] : listTenants();
  const plan = opts.tenantId
    ? tenants.map((t) => ({ tenantId: t.id, genre: (t.genres !== "both" ? t.genres : "horror") as "funny" | "horror" }))
    : resolveRunPlan(tenants, now);

  for (const item of plan) {
    const t = loadTenant(item.tenantId);
    const meta = lastEpisodeMeta(t.id);
    const story = await writeStory({ genre: item.genre, niche: t.niche, styleKey: t.styleKey, priorTitles: meta.titles });
    const date = localParts(now, t.cadence.tz).date;
    const dir = episodeDirFor(t.id, date, story.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "story.json"), JSON.stringify(story, null, 2) + "\n");
    console.log(`\n[${t.id}] ${story.genre} · ${story.title}  → ${dir}`);

    await generateArt(t, dir, story);
    await composeEpisode(t, dir, story);
    writeReviewBundle(dir, story);

    if (t.autonomy === "autonomous" && !opts.dry) {
      const mode = opts.now_publish ? "now" : "draft";
      const res = await publishEpisode(t, dir, story, mode);
      console.log(`[${t.id}] ${mode}:`, res.map((r) => `${r.platform}=${r.postId}`).join(" "));
    } else {
      console.log(`[${t.id}] ready — autonomy=${t.autonomy}${opts.dry ? " (dry)" : ""}, not published`);
    }
  }
  if (plan.length === 0) console.log("no tenants due");
}

// CLI: tsx src/run.ts [--tenant id] [--dry] [--now]
if (process.argv[1]?.endsWith("run.ts")) {
  try {
    const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i === -1 ? undefined : process.argv[i + 1]; };
    await runDueTenants({
      tenantId: arg("tenant"),
      dry: process.argv.includes("--dry"),
      now_publish: process.argv.includes("--now"),
    });
  } catch (err) {
    console.error("\n✗ " + (err as Error).message + "\n");
    process.exit(1);
  }
}
