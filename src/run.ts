import { rmSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listActiveTenants, getTenant, isDue, type TenantConfig } from "./lib/tenant.ts";
import { scheduleSlot, zonedWallClockToUtc } from "./lib/schedule.ts";
import { recentEpisodes, createEpisode, setEpisodeStatus } from "./db/episodes.ts";
import { logUsage } from "./lib/usage.ts";
import { writeStory } from "./write-story.ts";
import { generateArt } from "./engine/art.ts";
import { composeEpisode } from "./engine/compose.ts";
import { finalizeEpisode } from "./engine/review.ts";
import { publishEpisode } from "./engine/publish.ts";
import { db, closeDb } from "./db/client.ts";
import { run as runTbl } from "./db/schema.ts";
import { REPO_ROOT, loadEnv, requireEnv } from "./lib/env.ts";
import { eq } from "drizzle-orm";

export interface RunPlanItem { tenantId: string; genre: "funny" | "horror" | "wuxia" }

const CACHE_DIR = join(REPO_ROOT, ".cache");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Housekeeping for `.cache/<episodeId>/` raw-panel dirs. Pass the id of an
 * episode that just finished to drop its cache immediately; every call also
 * sweeps any sibling dir whose mtime is older than ~7 days.
 */
function pruneCache(justFinishedId?: string): void {
  try {
    if (justFinishedId) rmSync(join(CACHE_DIR, justFinishedId), { recursive: true, force: true });
    if (!existsSync(CACHE_DIR)) return;
    const now = Date.now();
    for (const name of readdirSync(CACHE_DIR)) {
      const p = join(CACHE_DIR, name);
      try {
        const st = statSync(p);
        if (st.isDirectory() && now - st.mtimeMs > CACHE_TTL_MS) {
          rmSync(p, { recursive: true, force: true });
        }
      } catch {
        // racing cleanup / vanished dir — ignore
      }
    }
  } catch {
    // never let cache housekeeping fail a run
  }
}

export async function resolveRunPlan(tenants: TenantConfig[], now: Date): Promise<RunPlanItem[]> {
  const plan: RunPlanItem[] = [];
  for (const t of tenants) {
    const recent = await recentEpisodes(t.id, 5); // TODO(B): compare dates in tenant tz
    const last = recent[0]?.date ?? null;
    if (!isDue(t, now, last)) continue;
    const genre: "funny" | "horror" | "wuxia" =
      t.genres !== "both" ? t.genres : recent[0]?.genre === "horror" ? "funny" : "horror";
    plan.push({ tenantId: t.id, genre });
  }
  return plan;
}

export async function runDueTenants(opts: {
  tenantId?: string; now?: Date; dry?: boolean; nowPublish?: boolean;
}): Promise<void> {
  const now = opts.now ?? new Date();
  const tenants = opts.tenantId ? [await getTenant(opts.tenantId)] : await listActiveTenants();
  const plan = opts.tenantId
    ? tenants.map((t) => ({ tenantId: t.id, genre: (t.genres !== "both" ? t.genres : "horror") as "funny" | "horror" | "wuxia" }))
    : await resolveRunPlan(tenants, now);

  if (plan.length === 0) {
    console.log("no tenants due");
    return;
  }

  // Preflight every credential this run will need — fail here, before any DB
  // write or paid API call, with one clear message (key-last workflow).
  loadEnv();
  requireEnv("ANTHROPIC_API_KEY", "console.anthropic.com → API keys. Var: ANTHROPIC_API_KEY");
  requireEnv("GEMINI_API_KEY", "aistudio.google.com/apikey. Var: GEMINI_API_KEY");
  requireEnv("BLOB_READ_WRITE_TOKEN", "Vercel dashboard → Storage → Blob → Tokens. Var: BLOB_READ_WRITE_TOKEN");
  const willPublish = !opts.dry && tenants.some(
    (t) => t.autonomy === "autonomous" && plan.some((p) => p.tenantId === t.id),
  );
  if (willPublish) requireEnv("ZERNIO_API_KEY", "Zernio dashboard → API Keys. Var: ZERNIO_API_KEY");

  const [runRow] = await db.insert(runTbl).values({ tenantsDue: plan.length }).returning({ id: runTbl.id });
  const runId = runRow!.id;
  let ok = 0, failed = 0;
  const errors: { tenantId: string; message: string }[] = [];

  try {
    for (const item of plan) {
      let episodeId: string | undefined;
      try {
        const t = await getTenant(item.tenantId);
        const recent = await recentEpisodes(t.id, 5);
        const { story, usageTokens } = await writeStory({
          genre: item.genre, niche: t.niche, styleKey: t.styleKey, language: t.language,
          priorTitles: recent.map((r) => r.title),
        });
        const ep = await createEpisode(t.id, story);
        episodeId = ep.id;
        await logUsage(t.id, { episodeId, kind: "story_tokens", qty: usageTokens, keyOwner: "platform" });
        console.log(`\n[${t.id}] ${story.genre} · ${story.title} → episode ${episodeId}`);

        await generateArt(t, episodeId, story);
        const panelUrls = await composeEpisode(t, episodeId, ep.blobPrefix, story);
        await finalizeEpisode(episodeId, story, panelUrls);

        if (t.autonomy === "scheduled" && !opts.dry) {
          await setEpisodeStatus(episodeId, "approved", { approvedAt: new Date() });
          const slot = scheduleSlot(t, now);
          const res = await publishEpisode(t.id, episodeId, "schedule", null, slot);
          await setEpisodeStatus(episodeId, "scheduled", {
            scheduledFor: zonedWallClockToUtc(slot.at, slot.tz),
            posts: res,
          });
          console.log(`[${t.id}] scheduled ${slot.at} ${slot.tz}: ${res.map((r) => `${r.platform}=${r.postId}`).join(" ")}`);
        } else if (t.autonomy === "autonomous" && !opts.dry) {
          await setEpisodeStatus(episodeId, "approved", { approvedAt: new Date() });
          const mode = opts.nowPublish ? "now" : "draft";
          const res = await publishEpisode(t.id, episodeId, mode);
          console.log(`[${t.id}] ${mode}: ${res.map((r) => `${r.platform}=${r.postId}`).join(" ")}`);
        } else {
          console.log(`[${t.id}] ready — autonomy=${t.autonomy}${opts.dry ? " (dry)" : ""}, not published`);
        }
        pruneCache(episodeId);
        ok++;
      } catch (err) {
        failed++;
        const message = (err as Error).message;
        errors.push({ tenantId: item.tenantId, message });
        console.error(`[${item.tenantId}] FAILED: ${message}`);
        if (episodeId) {
          try {
            await setEpisodeStatus(episodeId, "failed", { error: message });
          } catch (e) {
            console.error(`[${item.tenantId}] could not mark episode failed: ${(e as Error).message}`);
          }
        }
      }
    }
  } finally {
    await db.update(runTbl).set({ finishedAt: new Date(), tenantsOk: ok, tenantsFailed: failed, errors })
      .where(eq(runTbl.id, runId));
    pruneCache();
  }
  if (failed > 0) process.exitCode = 1;
}

// CLI: tsx src/run.ts [--tenant id] [--dry] [--now]
if (process.argv[1]?.endsWith("run.ts")) {
  const arg = (k: string) => {
    const i = process.argv.indexOf(`--${k}`);
    const v = i === -1 ? undefined : process.argv[i + 1];
    return v && !v.startsWith("--") ? v : undefined;
  };
  try {
    await runDueTenants({
      tenantId: arg("tenant"),
      dry: process.argv.includes("--dry"),
      nowPublish: process.argv.includes("--now"),
    });
  } catch (err) {
    console.error("\n✗ " + (err as Error).message + "\n");
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
