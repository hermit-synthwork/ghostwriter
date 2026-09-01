import { eq } from "drizzle-orm";
import { loadEnv } from "../lib/env.ts";
import { uploadImage, createPost, resolveZernioKey, type PublishMode } from "../lib/zernio.ts";
import { logUsage } from "../lib/usage.ts";
import { getEpisode, setEpisodeStatus } from "../db/episodes.ts";
import { db } from "../db/client.ts";
import { episode } from "../db/schema.ts";
import { getTenant, type TenantConfig } from "../lib/tenant.ts";
import { scheduleSlot, zonedWallClockToUtc } from "../lib/schedule.ts";

export type { PublishMode };

export interface PubTarget {
  platform: "instagram" | "tiktok";
  accountId: string;
  handle: string;
  format: "4x5" | "9x16";
}

/**
 * Resolve which platforms to publish to from `tenant.publish`.
 * `only` scopes to a single platform; naming an unconfigured one throws.
 * Output shape is locked by test/select-targets.test.ts.
 */
export function selectTargets(tenant: TenantConfig, only?: string | null): PubTarget[] {
  const all = (["instagram", "tiktok"] as const)
    .filter((p) => tenant.publish[p])
    .map((p) => ({ platform: p, ...tenant.publish[p]! }));
  if (!only) return all;
  const one = all.filter((t) => t.platform === only);
  if (one.length === 0) throw new Error(`Tenant "${tenant.id}" has no "${only}" target configured`);
  return one;
}

/**
 * Publish one approved episode's carousel to every platform configured in the
 * tenant's `publish` block (or just `only`, when given). Reads the episode +
 * tenant from Neon and the composed panel JPEGs from the Blob URLs on
 * `episode.panelUrls` — nothing touches the filesystem.
 *
 *   mode "draft" → create a draft post per platform in Zernio (safe default)
 *   mode "now"   → publish immediately and flip the episode row to "posted"
 *
 * The Zernio key is resolved per tenant: `ZERNIO_API_KEY_<TENANT_ID>` if set (a
 * dedicated Zernio account), else the shared `ZERNIO_API_KEY` (key-last: throws
 * a clear message if neither exists). Panels of the same format are fetched +
 * uploaded to Zernio once and shared across platforms.
 */
export async function publishEpisode(
  tenantId: string,
  episodeId: string,
  mode: PublishMode,
  only?: string | null,
  /** mode "schedule" only: local wall-clock "YYYY-MM-DDTHH:MM:SS" + IANA timezone. */
  schedule?: { at: string; tz: string },
): Promise<{ platform: string; handle: string; postId: string }[]> {
  if (mode === "schedule" && (!schedule?.at || !schedule?.tz)) {
    throw new Error('publishEpisode mode "schedule" needs a { at, tz }');
  }
  loadEnv();
  const { varName: zernioVar, key: zernioKey } = resolveZernioKey(tenantId);

  const tenant = await getTenant(tenantId);
  const ep = await getEpisode(episodeId);

  if (ep.status !== "approved" && ep.status !== "posted") {
    throw new Error(`episode ${episodeId} is not approved (status: ${ep.status})`);
  }

  const content = `${ep.caption}\n\n${ep.hashtags.join(" ")}`.trim();
  const targets = selectTargets(tenant, only);
  const uploadCache = new Map<string, string[]>(); // format → Zernio media urls
  const results: { platform: string; handle: string; postId: string }[] = [];

  console.log(
    `\nGhostwriter · publish · ${ep.slug} → ${targets.map((t) => t.platform).join(", ")} (${mode}) · via ${zernioVar}\n`,
  );

  for (const target of targets) {
    console.log(`• ${target.platform} / @${target.handle}  (${target.format})`);

    const panelUrls = ep.panelUrls?.[target.format];
    if (!panelUrls?.length) {
      throw new Error(`episode ${episodeId} has no composed panels for ${target.format}`);
    }

    let mediaUrls = uploadCache.get(target.format);
    if (!mediaUrls) {
      mediaUrls = [];
      for (const [i, url] of panelUrls.entries()) {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`fetch panel ${i + 1} (${target.format}) → ${res.status}: ${url}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const name = `${ep.slug}-${target.format}-${String(i + 1).padStart(2, "0")}.jpg`;
        mediaUrls.push(await uploadImage(buf, name, "image/jpeg", zernioKey));
        console.log(`    panel ${i + 1} (${(buf.length / 1024).toFixed(0)} KB)`);
      }
      uploadCache.set(target.format, mediaUrls);
    } else {
      console.log(`    reusing ${target.format} uploads`);
    }

    const created = await createPost({
      content,
      mediaUrls,
      platform: target.platform,
      accountId: target.accountId,
      mode,
      scheduledFor: schedule?.at,
      timezone: schedule?.tz,
      apiKey: zernioKey,
    });
    const postId = created.post?._id ?? created._id ?? "(id not returned)";
    results.push({ platform: target.platform, handle: target.handle, postId });
    await logUsage(tenantId, { episodeId, kind: "post", qty: 1, keyOwner: "platform" });
    const verb = mode === "now" ? "published" : mode === "schedule" ? `scheduled ${schedule!.at} ${schedule!.tz}` : "draft";
    console.log(`  → ${verb}: ${postId}\n`);
  }

  if (mode === "now") {
    await setEpisodeStatus(episodeId, "posted", { postedAt: new Date(), posts: results });
    console.log("✓ published:");
    for (const r of results) console.log(`  ${r.platform}  @${r.handle}  ${r.postId}`);
    console.log("\n  verify: open each profile and hard-refresh.\n");
  } else if (mode === "schedule") {
    console.log(`✓ scheduled in Zernio for ${schedule!.at} ${schedule!.tz} — cancel there if needed.\n`);
  } else {
    console.log("✓ drafts created in Zernio — review + publish there.\n");
  }

  return results;
}

/**
 * An episode row is picked up by the approved-episode sweep only when it sits at
 * `status='approved'` AND its tenant is one of the review autonomies. This keeps
 * the sweep off `autonomous` tenants (whose episodes also land on `approved`
 * after a Zernio draft is created) and off `scheduled` ones.
 * Pure — locked by test/schedule-approved.test.ts.
 */
export function eligibleForApprovedSweep(
  status: string,
  autonomy: TenantConfig["autonomy"],
): boolean {
  return status === "approved" && (autonomy === "review_each" || autonomy === "review_weekly");
}

/**
 * Take every episode a human approved in the review app and hand it to Zernio as
 * a *scheduled* post for that tenant's `cadence.time` (today if still ahead, else
 * ~2h out). The episode row goes to `status='scheduled'` with `scheduledFor`
 * set. Approving at 2am still means it posts at 09:00. A failure marks that one
 * episode `failed` and the sweep moves on. Returns the ids it scheduled.
 * Called by the VPS cron (`src/schedule-approved.ts`) on a short interval.
 */
export async function scheduleApproved(): Promise<string[]> {
  const rows = await db
    .select({ id: episode.id, tenantId: episode.tenantId, status: episode.status })
    .from(episode)
    .where(eq(episode.status, "approved"));

  const now = new Date();
  const scheduled: string[] = [];
  for (const r of rows) {
    let tenant: TenantConfig;
    try {
      tenant = await getTenant(r.tenantId);
    } catch (err) {
      console.error(`[${r.tenantId}] skip approved ${r.id}: ${(err as Error).message}`);
      continue;
    }
    if (!eligibleForApprovedSweep(r.status, tenant.autonomy)) continue;

    try {
      const slot = scheduleSlot(tenant, now);
      const res = await publishEpisode(r.tenantId, r.id, "schedule", null, slot);
      await setEpisodeStatus(r.id, "scheduled", {
        scheduledFor: zonedWallClockToUtc(slot.at, slot.tz),
        posts: res,
      });
      scheduled.push(r.id);
      console.log(`[${r.tenantId}] scheduled approved ${r.id} for ${slot.at} ${slot.tz}: ${res.map((x) => `${x.platform}=${x.postId}`).join(" ")}`);
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[${r.tenantId}] schedule approved ${r.id} FAILED: ${message}`);
      try {
        await setEpisodeStatus(r.id, "failed", { error: message });
      } catch (e) {
        console.error(`[${r.tenantId}] could not mark ${r.id} failed: ${(e as Error).message}`);
      }
    }
  }
  return scheduled;
}
