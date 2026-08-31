import { requireEnv } from "../lib/env.ts";
import { uploadImage, createPost, type PublishMode } from "../lib/zernio.ts";
import { logUsage } from "../lib/usage.ts";
import { getEpisode, setEpisodeStatus } from "../db/episodes.ts";
import { getTenant, type TenantConfig } from "../lib/tenant.ts";

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
 * `ZERNIO_API_KEY` is a platform-level credential (key-last: this throws a
 * clear message if it is missing). Panels of the same format are fetched +
 * uploaded to Zernio once and shared across platforms.
 */
export async function publishEpisode(
  tenantId: string,
  episodeId: string,
  mode: PublishMode,
  only?: string | null,
): Promise<{ platform: string; handle: string; postId: string }[]> {
  requireEnv("ZERNIO_API_KEY", "Create one in the Zernio dashboard → API Keys. Var: ZERNIO_API_KEY");

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
    `\nGhostwriter · publish · ${ep.slug} → ${targets.map((t) => t.platform).join(", ")} (${mode})\n`,
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
        mediaUrls.push(await uploadImage(buf, name));
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
    });
    const postId = created.post?._id ?? created._id ?? "(id not returned)";
    results.push({ platform: target.platform, handle: target.handle, postId });
    await logUsage(tenantId, { episodeId, kind: "post", qty: 1, keyOwner: "platform" });
    console.log(`  → ${mode === "now" ? "published" : "draft"}: ${postId}\n`);
  }

  if (mode === "now") {
    await setEpisodeStatus(episodeId, "posted", { postedAt: new Date(), posts: results });
    console.log("✓ published:");
    for (const r of results) console.log(`  ${r.platform}  @${r.handle}  ${r.postId}`);
    console.log("\n  verify: open each profile and hard-refresh.\n");
  } else {
    console.log("✓ drafts created in Zernio — review + publish there.\n");
  }

  return results;
}
