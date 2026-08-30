import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { loadEnv, requireEnv, REPO_ROOT } from "./lib/env.ts";
import { resolveEpisodeDir, loadStory, panelFile, type Status } from "./lib/story.ts";
import { uploadImage, createPost, type PublishMode } from "./lib/zernio.ts";

/**
 * Publish an approved episode's carousel to Instagram via Zernio.
 *
 *   npm run publish <slug>            → creates a DRAFT post in Zernio (default; safe)
 *   npm run publish <slug> -- --now   → publishes immediately
 *
 * TikTok is not wired (no connected account). Add a "tiktok" block to
 * config/publish.json + a platform loop here once it exists.
 */

interface PublishConfig {
  instagram: { accountId: string; handle: string; format: "4x5" | "9x16" };
}

const MODE: PublishMode = process.argv.includes("--now") ? "now" : "draft";

async function main() {
  loadEnv();
  requireEnv("ZERNIO_API_KEY", "Create one in the Zernio dashboard → API Keys. Var: ZERNIO_API_KEY");
  const episodeDir = resolveEpisodeDir(process.argv[2]);
  const story = loadStory(episodeDir);

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

  const cfg = JSON.parse(
    readFileSync(join(REPO_ROOT, "config", "publish.json"), "utf8"),
  ) as PublishConfig;
  const { accountId, format } = cfg.instagram;

  if (story.panels.length < 2 || story.panels.length > 10) {
    throw new Error(`Instagram carousels need 2-10 images (episode has ${story.panels.length}).`);
  }

  const srcDir = join(episodeDir, "panels", `final-${format}`);
  const captionPath = join(episodeDir, "caption.txt");
  if (!existsSync(join(srcDir, panelFile(story.panels[0]!.n)))) {
    throw new Error(`No composed ${format} panels in ${srcDir}. Run  npm run compose ${story.slug}.`);
  }
  if (!existsSync(captionPath)) {
    throw new Error(`No caption.txt. Run  npm run review ${story.slug}.`);
  }

  console.log(`\nGhostwriter · publish · ${story.slug} → instagram/@${cfg.instagram.handle} (${format}, ${MODE})\n`);

  const mediaUrls: string[] = [];
  for (const p of story.panels) {
    const jpg = await sharp(readFileSync(join(srcDir, panelFile(p.n))))
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer();
    const url = await uploadImage(jpg, `${story.slug}-${panelFile(p.n).replace(".png", ".jpg")}`);
    mediaUrls.push(url);
    console.log(`• uploaded panel ${p.n}  (${(jpg.length / 1024).toFixed(0)} KB)`);
  }

  const content = readFileSync(captionPath, "utf8").trim();
  const created = await createPost({
    content,
    mediaUrls,
    platform: "instagram",
    accountId,
    mode: MODE,
  });
  const postId = created.post?._id ?? created._id ?? "(id not returned)";

  if (MODE === "now") {
    const st: Status = {
      status: "posted",
      created: status?.created ?? new Date().toISOString(),
      approvedAt: status?.approvedAt,
      postedAt: new Date().toISOString(),
    };
    writeFileSync(statusPath, JSON.stringify(st, null, 2) + "\n");
    console.log(`\n✓ published to Instagram. post id: ${postId}`);
    console.log(`  verify: open the @${cfg.instagram.handle} profile and hard-refresh.\n`);
  } else {
    console.log(`\n✓ draft created in Zernio. post id: ${postId}`);
    console.log(`  review it in the Zernio dashboard, then publish there —`);
    console.log(`  or run:  npm run publish ${story.slug} -- --now\n`);
  }
}

main().catch((err) => {
  console.error("\n✗ " + (err as Error).message + "\n");
  process.exit(1);
});
