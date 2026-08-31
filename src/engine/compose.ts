import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { panelFile, type Story } from "../lib/story.ts";
import { resolveStyle } from "../lib/style.ts";
import { normalize916, crop45, overlay, W, H_916, H_45 } from "../lib/image.ts";
import { renderOverlaySvg, type OverlayBrand } from "../lib/letter.ts";
import type { TenantConfig } from "../lib/tenant.ts";

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
  return { displayName: tenant.displayName, handle: firstHandle(tenant), tokens };
}

/**
 * Letter every raw panel of one episode: normalise to 9x16, burn in the SVG
 * overlay, write final-9x16, then centre-crop to 4x5 and write final-4x5.
 * Requires the raw panels to already exist (run the art engine first) — there
 * is no placeholder path here; that stays in the `npm run compose` CLI wrapper.
 */
export async function composeEpisode(
  tenant: TenantConfig,
  episodeDir: string,
  story: Story,
): Promise<void> {
  const rawDir = join(episodeDir, "panels", "raw");
  const dir916 = join(episodeDir, "panels", "final-9x16");
  const dir45 = join(episodeDir, "panels", "final-4x5");
  mkdirSync(dir916, { recursive: true });
  mkdirSync(dir45, { recursive: true });

  const brand = brandFor(tenant, story);

  console.log(`\nGhostwriter · compose · ${story.slug} (${story.panels.length} panels)\n`);

  for (const panel of story.panels) {
    const rawPath = join(rawDir, panelFile(panel.n));
    if (!existsSync(rawPath)) {
      throw new Error(
        `Missing raw panel: ${rawPath}\n  Run  npm run art ${story.slug}  first.`,
      );
    }

    const base916 = await normalize916(readFileSync(rawPath));
    const svg916 = await renderOverlaySvg(panel, story, brand, { w: W, h: H_916 });
    writeFileSync(join(dir916, panelFile(panel.n)), await overlay(base916, svg916));

    const base45 = await crop45(base916);
    const svg45 = await renderOverlaySvg(panel, story, brand, { w: W, h: H_45 });
    writeFileSync(join(dir45, panelFile(panel.n)), await overlay(base45, svg45));

    console.log(`• panel ${panel.n}: 9x16 + 4x5 written`);
  }

  console.log(`\n✓ finals in ${dir916}\n           ${dir45}`);
}
