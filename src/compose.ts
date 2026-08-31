/**
 * Local single-episode compose CLI: `npm run compose [episode] [-- --placeholder]`.
 * Thin wrapper around the reusable engine — synthesises a "local" tenant and
 * delegates to composeEpisode. The scheduled multi-tenant runner (run.ts) calls
 * composeEpisode directly, once per tenant.
 *
 * `--placeholder` keeps its offline path here (not in the engine): it fabricates
 * flat-colour panels so lettering can be previewed with no art on disk.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveEpisodeDir, loadStory, panelFile, type Story } from "./lib/story.ts";
import { loadLocalTenant } from "./lib/tenant.ts";
import { crop45, overlay, solid, W, H_916, H_45 } from "./lib/image.ts";
import { renderOverlaySvg } from "./lib/letter.ts";
import { composeEpisode, brandFor } from "./engine/compose.ts";

const USE_PLACEHOLDER = process.argv.includes("--placeholder");

/** Deterministic muted colour per panel, for offline placeholder art. */
function placeholderColor(n: number): { r: number; g: number; b: number } {
  const palette = [
    { r: 58, g: 70, b: 82 },
    { r: 78, g: 124, b: 119 },
    { r: 122, g: 46, b: 46 },
    { r: 45, g: 52, b: 60 },
    { r: 90, g: 84, b: 70 },
  ];
  return palette[n % palette.length]!;
}

/** Offline preview: flat-colour bases + the real overlay, no raw panels needed. */
async function composePlaceholder(episodeDir: string, story: Story): Promise<void> {
  const dir916 = join(episodeDir, "panels", "final-9x16");
  const dir45 = join(episodeDir, "panels", "final-4x5");
  mkdirSync(dir916, { recursive: true });
  mkdirSync(dir45, { recursive: true });

  const brand = brandFor(loadLocalTenant(story), story);
  console.log(
    `\nGhostwriter · compose (placeholder) · ${story.slug} (${story.panels.length} panels)\n`,
  );

  for (const panel of story.panels) {
    const base916 = await solid(W, H_916, placeholderColor(panel.n));
    const svg916 = await renderOverlaySvg(panel, story, brand, { w: W, h: H_916 });
    writeFileSync(join(dir916, panelFile(panel.n)), await overlay(base916, svg916));

    const base45 = await crop45(base916);
    const svg45 = await renderOverlaySvg(panel, story, brand, { w: W, h: H_45 });
    writeFileSync(join(dir45, panelFile(panel.n)), await overlay(base45, svg45));

    console.log(`• panel ${panel.n}: 9x16 + 4x5 written`);
  }

  console.log(`\n✓ finals in ${dir916}\n           ${dir45}`);
}

try {
  const episodeDir = resolveEpisodeDir(process.argv[2]);
  const story = loadStory(episodeDir);

  if (USE_PLACEHOLDER) {
    await composePlaceholder(episodeDir, story);
  } else {
    await composeEpisode(loadLocalTenant(story), episodeDir, story);
  }

  console.log("  next: npm run review " + story.slug + "\n");
} catch (err) {
  console.error("\n✗ " + (err as Error).message + "\n");
  process.exit(1);
}
