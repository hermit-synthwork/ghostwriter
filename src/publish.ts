import { resolveEpisodeDir, loadStory } from "./lib/story.ts";
import { loadLocalTenant } from "./lib/tenant.ts";
import { publishEpisode } from "./engine/publish.ts";
import { loadEnv } from "./lib/env.ts";

/**
 * Thin CLI wrapper around the publish engine for local single-episode dev.
 * Publish targets come from `tenants/local.json` (its `publish` block) — see
 * README. The scheduled multi-tenant runner (src/run.ts) calls
 * `publishEpisode` directly instead.
 *
 *   npm run publish <slug>                  → DRAFT post per platform (default; safe)
 *   npm run publish <slug> -- --now         → publish immediately
 *   npm run publish <slug> -- --only tiktok → just one platform
 */

loadEnv();
const episodeDir = resolveEpisodeDir(process.argv[2]);
const story = loadStory(episodeDir);
const mode = process.argv.includes("--now") ? "now" : "draft";
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

const tenant = loadLocalTenant(story);
if (Object.keys(tenant.publish).length === 0) {
  throw new Error(
    'No publish targets — create tenants/local.json with a "publish" block (see README).',
  );
}

const res = await publishEpisode(tenant, episodeDir, story, mode, only);
console.log(res);
