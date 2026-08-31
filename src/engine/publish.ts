import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { requireEnv } from "../lib/env.ts";
import { panelFile, type Story, type Status } from "../lib/story.ts";
import { uploadImage, createPost, type PublishMode } from "../lib/zernio.ts";
import { logUsage } from "../lib/usage.ts";
import type { TenantConfig } from "../lib/tenant.ts";

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

/** Convert one format's final panels to JPEG and upload them; returns the media URLs. */
async function jpegPanels(
  episodeDir: string,
  slug: string,
  panels: number[],
  format: string,
): Promise<string[]> {
  const srcDir = join(episodeDir, "panels", `final-${format}`);
  const urls: string[] = [];
  for (const n of panels) {
    const src = join(srcDir, panelFile(n));
    if (!existsSync(src)) {
      throw new Error(`Missing ${format} panel: ${src}. Run  npm run compose ${slug}.`);
    }
    const jpg = await sharp(readFileSync(src))
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer();
    urls.push(await uploadImage(jpg, `${slug}-${format}-${panelFile(n).replace(".png", ".jpg")}`));
    console.log(`    panel ${n} (${(jpg.length / 1024).toFixed(0)} KB)`);
  }
  return urls;
}

/**
 * Publish one approved episode's carousel to every platform configured in
 * `tenant.publish` (or just `only`, when given).
 *
 *   mode "draft" → create a draft post per platform in Zernio (safe default)
 *   mode "now"   → publish immediately and flip status.json to "posted"
 *
 * `ZERNIO_API_KEY` is a platform-level credential (key-last: this exits with a
 * clear message if it is missing). Panels of the same format are uploaded once
 * and shared across platforms.
 */
export async function publishEpisode(
  tenant: TenantConfig,
  episodeDir: string,
  story: Story,
  mode: PublishMode,
  only?: string | null,
): Promise<{ platform: string; handle: string; postId: string }[]> {
  requireEnv("ZERNIO_API_KEY", "Create one in the Zernio dashboard → API Keys. Var: ZERNIO_API_KEY");

  const targets = selectTargets(tenant, only);

  const statusPath = join(episodeDir, "status.json");
  const status = existsSync(statusPath)
    ? (JSON.parse(readFileSync(statusPath, "utf8")) as Status)
    : null;
  if (status?.status !== "approved" && status?.status !== "posted") {
    throw new Error(
      `Episode "${story.slug}" is not approved (status: ${status?.status ?? "none"}). ` +
        `Run  npm run approve ${story.slug}  first.`,
    );
  }
  if (story.panels.length < 2 || story.panels.length > 10) {
    throw new Error(`Carousels need 2-10 images (episode has ${story.panels.length}).`);
  }
  if (!existsSync(join(episodeDir, "caption.txt"))) {
    throw new Error(`No caption.txt. Run  npm run review ${story.slug}.`);
  }

  const content = readFileSync(join(episodeDir, "caption.txt"), "utf8").trim();
  const panelNums = story.panels.map((p) => p.n);
  const uploadCache = new Map<string, string[]>(); // format → media urls
  const results: { platform: string; handle: string; postId: string }[] = [];

  console.log(
    `\nGhostwriter · publish · ${story.slug} → ${targets.map((t) => t.platform).join(", ")} (${mode})\n`,
  );

  for (const t of targets) {
    console.log(`• ${t.platform} / @${t.handle}  (${t.format})`);
    let urls = uploadCache.get(t.format);
    if (!urls) {
      urls = await jpegPanels(episodeDir, story.slug, panelNums, t.format);
      uploadCache.set(t.format, urls);
    } else {
      console.log(`    reusing ${t.format} uploads`);
    }
    const created = await createPost({
      content,
      mediaUrls: urls,
      platform: t.platform,
      accountId: t.accountId,
      mode,
    });
    const postId = created.post?._id ?? created._id ?? "(id not returned)";
    results.push({ platform: t.platform, handle: t.handle, postId });
    logUsage(tenant.id, { kind: "post", qty: 1, keyOwner: "platform" });
    console.log(`  → ${mode === "now" ? "published" : "draft"}: ${postId}\n`);
  }

  if (mode === "now") {
    writeFileSync(
      statusPath,
      JSON.stringify(
        {
          status: "posted",
          created: status?.created ?? new Date().toISOString(),
          approvedAt: status?.approvedAt,
          postedAt: new Date().toISOString(),
          posts: results,
        },
        null,
        2,
      ) + "\n",
    );
    console.log("✓ published:");
    for (const r of results) console.log(`  ${r.platform}  @${r.handle}  ${r.postId}`);
    console.log("\n  verify: open each profile and hard-refresh.\n");
  } else {
    console.log("✓ drafts created in Zernio — review + publish there, or:");
    console.log(`  npm run publish ${story.slug} -- --now\n`);
  }

  return results;
}
