import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { loadEnv, requireEnv, REPO_ROOT } from "./lib/env.ts";
import { resolveEpisodeDir, loadStory, panelFile, type Status } from "./lib/story.ts";
import { uploadImage, createPost, type PublishMode } from "./lib/zernio.ts";

/**
 * Publish an approved episode's carousel to every platform in config/publish.json.
 *
 *   npm run publish <slug>                  → DRAFT post per platform (default; safe)
 *   npm run publish <slug> -- --now         → publish immediately
 *   npm run publish <slug> -- --only tiktok → just one platform
 */

interface Target {
  accountId: string;
  handle: string;
  format: "4x5" | "9x16";
}
type PublishConfig = Record<string, Target | string>;

const MODE: PublishMode = process.argv.includes("--now") ? "now" : "draft";
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;

async function jpegPanels(episodeDir: string, slug: string, panels: number[], format: string) {
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
  if (story.panels.length < 2 || story.panels.length > 10) {
    throw new Error(`Carousels need 2-10 images (episode has ${story.panels.length}).`);
  }
  if (!existsSync(join(episodeDir, "caption.txt"))) {
    throw new Error(`No caption.txt. Run  npm run review ${story.slug}.`);
  }

  const cfg = JSON.parse(
    readFileSync(join(REPO_ROOT, "config", "publish.json"), "utf8"),
  ) as PublishConfig;
  const targets = Object.entries(cfg).filter(
    ([k, v]) => k !== "_comment" && typeof v === "object" && (!ONLY || k === ONLY),
  ) as [string, Target][];
  if (targets.length === 0) {
    throw new Error(ONLY ? `No "${ONLY}" block in config/publish.json` : "No publish targets configured");
  }

  const content = readFileSync(join(episodeDir, "caption.txt"), "utf8").trim();
  const panelNums = story.panels.map((p) => p.n);
  const uploadCache = new Map<string, string[]>(); // format → media urls
  const results: { platform: string; handle: string; postId: string }[] = [];

  console.log(`\nGhostwriter · publish · ${story.slug} → ${targets.map(([p]) => p).join(", ")} (${MODE})\n`);

  for (const [platform, t] of targets) {
    console.log(`• ${platform} / @${t.handle}  (${t.format})`);
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
      platform,
      accountId: t.accountId,
      mode: MODE,
    });
    const postId = created.post?._id ?? created._id ?? "(id not returned)";
    results.push({ platform, handle: t.handle, postId });
    console.log(`  → ${MODE === "now" ? "published" : "draft"}: ${postId}\n`);
  }

  if (MODE === "now") {
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
}

main().catch((err) => {
  console.error("\n✗ " + (err as Error).message + "\n");
  process.exit(1);
});
