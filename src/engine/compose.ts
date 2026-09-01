import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { panelFile, type Story } from "../lib/story.ts";
import { resolveStyle } from "../lib/style.ts";
import { normalize916, crop45, overlay, W, H_916, H_45 } from "../lib/image.ts";
import { renderOverlaySvg, type OverlayBrand } from "../lib/letter.ts";
import { putPanel } from "../lib/blob.ts";
import { REPO_ROOT } from "../lib/env.ts";
import type { TenantConfig } from "../lib/tenant.ts";

/** Blob URLs for every composed panel of one episode, in panel order. */
export interface PanelUrls {
  "4x5": string[];
  "9x16": string[];
}

/** First publish handle for this tenant, guaranteed to start with "@". */
function firstHandle(tenant: TenantConfig): string {
  const raw =
    tenant.publish.instagram?.handle ?? tenant.publish.tiktok?.handle ?? tenant.id;
  return raw.startsWith("@") ? raw : `@${raw}`;
}

/**
 * Build the overlay brand for an episode: display name + handle from the tenant,
 * colours from the resolved style (story override first, then tenant default).
 */
export function brandFor(tenant: TenantConfig, story: Story): OverlayBrand {
  const tokens = resolveStyle(story.styleKey ?? tenant.styleKey).tokens;
  return {
    displayName: tenant.displayName,
    handle: firstHandle(tenant),
    tokens,
    lang: tenant.language,
  };
}

/**
 * Letter every raw panel of one episode: normalise to 9x16, burn in the SVG
 * overlay, then centre-crop to 4x5. Each final is encoded to JPEG and uploaded
 * to Vercel Blob; the returned URLs (panel order) are what the episode row and
 * downstream publishers consume. Raw panels must already exist in
 * `.cache/<episodeId>/` (run the art engine first).
 */
export async function composeEpisode(
  tenant: TenantConfig,
  episodeId: string,
  blobPrefix: string,
  story: Story,
): Promise<PanelUrls> {
  const cacheDir = join(REPO_ROOT, ".cache", episodeId);
  const brand = brandFor(tenant, story);
  const urls: PanelUrls = { "4x5": [], "9x16": [] };

  console.log(`\nGhostwriter · compose · ${story.slug} (${story.panels.length} panels)\n`);

  for (const panel of story.panels) {
    const rawPath = join(cacheDir, panelFile(panel.n));
    if (!existsSync(rawPath)) {
      throw new Error(
        `Missing raw panel: ${rawPath}\n  Run  npm run art ${story.slug}  first.`,
      );
    }

    const base916 = await normalize916(readFileSync(rawPath));
    const svg916 = await renderOverlaySvg(panel, story, brand, { w: W, h: H_916 });
    const buf916 = await overlay(base916, svg916);

    const base45 = await crop45(base916);
    const svg45 = await renderOverlaySvg(panel, story, brand, { w: W, h: H_45 });
    const buf45 = await overlay(base45, svg45);

    const jpg9 = await sharp(buf916)
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer();
    const jpg45 = await sharp(buf45)
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer();

    const url9 = await putPanel(blobPrefix, "9x16", panel.n, jpg9);
    const url45 = await putPanel(blobPrefix, "4x5", panel.n, jpg45);
    urls["9x16"].push(url9);
    urls["4x5"].push(url45);

    console.log(`• panel ${panel.n}: 9x16 + 4x5 uploaded`);
  }

  console.log(`\n✓ ${story.panels.length} panels → ${blobPrefix}\n`);
  return urls;
}
