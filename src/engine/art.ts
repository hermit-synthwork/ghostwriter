import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { panelFile, type Story, type Panel } from "../lib/story.ts";
import { resolveStyle, type ResolvedStyle } from "../lib/style.ts";
import { generateImage, type RefImage } from "../gemini.ts";
import { logUsage } from "../lib/usage.ts";
import { REPO_ROOT } from "../lib/env.ts";
import type { TenantConfig } from "../lib/tenant.ts";

/** House-style preamble prepended to the style-ref and character-sheet prompts. */
function styleHeader(styleBible: string): string {
  return (
    styleBible +
    "\n\nRender in exactly this house style. Comic panel illustration only — " +
    "absolutely no speech balloons, caption boxes, or readable text in the image."
  );
}

/**
 * Load a reference image, deriving its MIME type from the file's magic bytes
 * rather than its extension. The committed `style-ref.png` files are JPEG bytes
 * despite the `.png` name; the per-episode character sheet is a real PNG.
 */
function imageRef(path: string): RefImage {
  const data = readFileSync(path);
  const mimeType =
    data[0] === 0xff && data[1] === 0xd8
      ? "image/jpeg"
      : data[0] === 0x89 && data[1] === 0x50
        ? "image/png"
        : "image/png";
  return { data, mimeType };
}

/**
 * Pure prompt builder for a single story panel. Kept assertion-locked by
 * test/art-prompt.test.ts — do not change the wording without updating that test.
 */
export function buildPanelPrompt(styleBible: string, story: Story, panel: Panel): string {
  const present = panel.characters.length
    ? `Characters present (match the model sheet exactly): ${panel.characters.join(", ")}.`
    : "No characters in frame.";
  const sfx = panel.sfx
    ? ` Integrate a single hand-drawn comic SFX word "${panel.sfx}" into the illustration.`
    : "";
  return (
    styleBible +
    "\n\nRender in exactly this house style. Comic panel illustration only — " +
    "absolutely no speech balloons, caption boxes, or readable text in the image.\n\n" +
    `PANEL ${panel.n} of ${story.panels.length} — ${story.genre} story "${story.title}".\n` +
    `Scene: ${panel.scene}\nCamera: ${panel.camera}\n${present}\n` +
    "Composition: keep faces and key action within the central vertical 80%. " +
    "Keep the top ~18% and bottom ~22% visually calm (plain wall, sky, floor or shadow) for caption bars." +
    sfx
  );
}

/** Require a committed house-style key-art reference for this style. */
function ensureStyleRef(style: ResolvedStyle): void {
  if (!style.hasRef) {
    throw new Error(
      `style "${style.key}" has no committed style-ref.png — pre-generate and commit it`,
    );
  }
}

/** Generate the character model sheet for this episode. Returns its path. */
async function generateCharacterSheet(
  tenant: TenantConfig,
  episodeId: string,
  rawDir: string,
  story: Story,
  style: ResolvedStyle,
): Promise<string> {
  const out = join(rawDir, "character-sheet.png");
  const cast = story.cast
    .map(
      (c) =>
        `• ${c.name}: ${c.description}. Signature details: ${c.visual_tags.join(", ")}.`,
    )
    .join("\n");
  console.log(`• generating character sheet (${story.cast.length} cast)`);
  const { png } = await generateImage(
    styleHeader(style.bible) +
      "\n\nProduce a CHARACTER MODEL SHEET on a plain bone background: for each character, " +
      "a full-body pose and a head close-up, clearly separated, evenly lit, neutral expression. " +
      "Keep proportions and details identical to how they must appear in the story panels.\n\n" +
      `Cast:\n${cast}`,
    [imageRef(style.refPath)],
    "16:9",
    undefined,
  );
  mkdirSync(rawDir, { recursive: true });
  writeFileSync(out, png);
  await logUsage(tenant.id, { episodeId, kind: "image", qty: 1, keyOwner: "platform" });
  return out;
}

/** Generate every raw panel image for the episode (skips ones already on disk). */
async function generatePanels(
  tenant: TenantConfig,
  episodeId: string,
  rawDir: string,
  story: Story,
  style: ResolvedStyle,
  sheetPath: string,
): Promise<void> {
  const refs = [imageRef(style.refPath), imageRef(sheetPath)];

  for (const panel of story.panels) {
    const dest = join(rawDir, panelFile(panel.n));
    if (existsSync(dest)) {
      console.log(`• panel ${panel.n}: exists, skipping`);
      continue;
    }
    const prompt = buildPanelPrompt(style.bible, story, panel);
    console.log(`• panel ${panel.n}/${story.panels.length}: generating`);
    const { png } = await generateImage(prompt, refs, "9:16", undefined);
    writeFileSync(dest, png);
    await logUsage(tenant.id, { episodeId, kind: "image", qty: 1, keyOwner: "platform" });
  }
}

/**
 * Render all art for one episode of one tenant: the per-style key-art reference
 * (must be committed), the episode character sheet, and every raw panel.
 * Style resolves from the story override first, then the tenant default.
 * Raw panels and the character sheet are transient — they land in
 * `.cache/<episodeId>/` and are not committed or uploaded to blob storage.
 * Usage is logged to the DB after each successful image.
 */
export async function generateArt(
  tenant: TenantConfig,
  episodeId: string,
  story: Story,
): Promise<void> {
  const style = resolveStyle(story.styleKey ?? tenant.styleKey);
  console.log(
    `\nGhostwriter · art · ${story.slug} (${story.genre}, ${story.panels.length} panels, style=${style.key})\n`,
  );

  const rawDir = join(REPO_ROOT, ".cache", episodeId);
  mkdirSync(rawDir, { recursive: true });

  ensureStyleRef(style);
  const sheet = await generateCharacterSheet(tenant, episodeId, rawDir, story, style);
  await generatePanels(tenant, episodeId, rawDir, story, style, sheet);

  console.log(`\n✓ raw panels in ${rawDir}`);
}
