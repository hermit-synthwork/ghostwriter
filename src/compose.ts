import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./lib/env.ts";
import { resolveEpisodeDir, loadStory, panelFile } from "./lib/story.ts";
import { normalize916, crop45, overlay, solid, W, H_916, H_45 } from "./lib/image.ts";
import { renderOverlaySvg } from "./lib/letter.ts";
import brand from "../config/brand.json" with { type: "json" };

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

async function main() {
  const episodeDir = resolveEpisodeDir(process.argv[2]);
  const story = loadStory(episodeDir);
  const rawDir = join(episodeDir, "panels", "raw");
  const dir916 = join(episodeDir, "panels", "final-9x16");
  const dir45 = join(episodeDir, "panels", "final-4x5");
  mkdirSync(dir916, { recursive: true });
  mkdirSync(dir45, { recursive: true });

  console.log(`\nGhostwriter · compose · ${story.slug} (${story.panels.length} panels)\n`);

  for (const panel of story.panels) {
    const rawPath = join(rawDir, panelFile(panel.n));
    let base916: Buffer;

    if (existsSync(rawPath)) {
      base916 = await normalize916(readFileSync(rawPath));
    } else if (USE_PLACEHOLDER) {
      base916 = await solid(W, H_916, placeholderColor(panel.n));
    } else {
      throw new Error(
        `Missing raw panel: ${rawPath}\n  Run  npm run art ${story.slug}  first, ` +
          `or  npm run compose ${story.slug} -- --placeholder  to preview lettering offline.`,
      );
    }

    const svg916 = await renderOverlaySvg(panel, story, brand, { w: W, h: H_916 });
    writeFileSync(join(dir916, panelFile(panel.n)), await overlay(base916, svg916));

    const base45 = await crop45(base916);
    const svg45 = await renderOverlaySvg(panel, story, brand, { w: W, h: H_45 });
    writeFileSync(join(dir45, panelFile(panel.n)), await overlay(base45, svg45));

    console.log(`• panel ${panel.n}: 9x16 + 4x5 written`);
  }

  console.log(`\n✓ finals in ${dir916}\n           ${dir45}`);
  console.log("  next: npm run review " + story.slug + "\n");
}

main().catch((err) => {
  console.error("\n✗ " + (err as Error).message + "\n");
  process.exit(1);
});
