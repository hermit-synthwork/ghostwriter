/**
 * Local single-episode art CLI: `npm run art [episode]`.
 * Thin wrapper around the reusable engine — synthesises a "local" tenant and
 * delegates to generateArt. The scheduled multi-tenant runner (run.ts) calls
 * generateArt directly, once per tenant.
 */
import { resolveEpisodeDir, loadStory } from "./lib/story.ts";
import { loadLocalTenant } from "./lib/tenant.ts";
import { generateArt } from "./engine/art.ts";

try {
  const episodeDir = resolveEpisodeDir(process.argv[2]);
  const story = loadStory(episodeDir);
  await generateArt(loadLocalTenant(story), episodeDir, story);
  console.log("  next: npm run compose " + story.slug + "\n");
} catch (err) {
  console.error("\n✗ " + (err as Error).message + "\n");
  process.exit(1);
}
