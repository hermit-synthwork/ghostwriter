import { join } from "node:path";
import { resolveEpisodeDir, loadStory } from "./lib/story.ts";
import { writeReviewBundle } from "./engine/review.ts";

/**
 * Thin CLI wrapper around the review-bundle writer for local single-episode dev.
 * The scheduled multi-tenant runner (src/run.ts) calls `writeReviewBundle`
 * directly instead.
 *
 *   npm run review [slug]   → writes caption.txt, status.json (draft), review.html
 */

try {
  const episodeDir = resolveEpisodeDir(process.argv[2]);
  const story = loadStory(episodeDir);

  writeReviewBundle(episodeDir, story);

  const outPath = join(episodeDir, "review.html");
  console.log(`\n✓ ${join(episodeDir, "caption.txt")}`);
  console.log(`✓ ${outPath}`);
  console.log(`\n  open it:  open "${outPath}"\n`);
} catch (err) {
  console.error("\n✗ " + (err as Error).message + "\n");
  process.exit(1);
}
