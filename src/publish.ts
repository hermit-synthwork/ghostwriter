import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "./lib/env.ts";
import { resolveEpisodeDir, loadStory, panelFile, type Status } from "./lib/story.ts";

/**
 * Phase 1 (now): assemble an upload-ready bundle and stop — the TikTok/IG
 * accounts don't exist yet, so there's nothing to post to.
 * Phase 2: when ZERNIO_API_KEY + account IDs are set, post the carousel via
 * Zernio. That call is intentionally NOT implemented until it can be tested
 * against real accounts.
 */

const FORMAT = (process.argv.find((a) => a === "4x5" || a === "9x16") ?? "4x5") as "4x5" | "9x16";

async function main() {
  loadEnv();
  const episodeDir = resolveEpisodeDir(process.argv[2]);
  const story = loadStory(episodeDir);

  const statusPath = join(episodeDir, "status.json");
  const status = existsSync(statusPath)
    ? (JSON.parse(readFileSync(statusPath, "utf8")) as Status)
    : null;
  if (status?.status !== "approved") {
    throw new Error(
      `Episode "${story.slug}" is not approved (status: ${status?.status ?? "none"}). ` +
        `Run  npm run approve ${story.slug}  first.`,
    );
  }

  // Assemble ordered upload bundle
  const uploadDir = join(episodeDir, "upload");
  mkdirSync(uploadDir, { recursive: true });
  const srcDir = join(episodeDir, "panels", `final-${FORMAT}`);
  if (!existsSync(join(srcDir, panelFile(story.panels[0]!.n)))) {
    throw new Error(`No composed panels in ${srcDir}. Run  npm run compose ${story.slug}  first.`);
  }
  story.panels.forEach((p, i) => {
    copyFileSync(
      join(srcDir, panelFile(p.n)),
      join(uploadDir, `${String(i + 1).padStart(2, "0")}.png`),
    );
  });
  copyFileSync(join(episodeDir, "caption.txt"), join(uploadDir, "caption.txt"));

  const key = process.env.ZERNIO_API_KEY;
  const tiktok = process.env.ZERNIO_TIKTOK_ACCOUNT_ID;
  const ig = process.env.ZERNIO_IG_ACCOUNT_ID;

  console.log(`\nGhostwriter · publish · ${story.slug} (${FORMAT})\n`);
  console.log(`✓ upload bundle ready: ${uploadDir}`);
  console.log(`  ${story.panels.length} slides + caption.txt\n`);

  if (!key || !tiktok || !ig) {
    console.log("⏸  Zernio not configured — nothing posted (expected for now).");
    console.log("   Accounts don't exist yet. When they do:");
    console.log("   1. create the TikTok + IG handles, connect them in Zernio");
    console.log("   2. put ZERNIO_API_KEY / ZERNIO_TIKTOK_ACCOUNT_ID / ZERNIO_IG_ACCOUNT_ID in .env");
    console.log("   3. implement the Zernio carousel call in src/publish.ts (Phase 2)\n");
    console.log(`   Meanwhile, post ${uploadDir} manually in the TikTok / Instagram apps.\n`);
    return;
  }

  throw new Error(
    "Zernio credentials are set but the Phase 2 posting call isn't implemented yet. " +
      "Implement it here, then re-run.",
  );
}

main().catch((err) => {
  console.error("\n✗ " + (err as Error).message + "\n");
  process.exit(1);
});
