import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { panelFile, type Story, type Panel } from "../lib/story.ts";
import { resolveStyle, type ResolvedStyle } from "../lib/style.ts";
import { generateImage, type RefImage } from "../gemini.ts";
import { logUsage } from "../lib/usage.ts";
import type { TenantConfig } from "../lib/tenant.ts";

/** House-style preamble prepended to the style-ref and character-sheet prompts. */
function styleHeader(styleBible: string): string {
  return (
    styleBible +
    "\n\nRender in exactly this house style. Comic panel illustration only — " +
    "absolutely no speech balloons, caption boxes, or readable text in the image."
  );
}

function pngRef(path: string): RefImage {
  return { data: readFileSync(path), mimeType: "image/png" };
}

function keyOwner(tenant: TenantConfig): "platform" | "tenant" {
  return tenant.geminiKey ? "tenant" : "platform";
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

/** Generate the one-time house-style key-art reference for this style, if missing. */
async function ensureStyleRef(tenant: TenantConfig, style: ResolvedStyle): Promise<void> {
  if (style.hasRef) return;
  console.log(`• style-ref for "${style.key}" missing — generating house-style key art (one time)`);
  const { png } = await generateImage(
    styleHeader(style.bible) +
      "\n\nSubject for this reference frame: an empty city bus-stop bench at dusk, " +
      "one flickering streetlight, long shadows. Establish palette, linework, halftone, border.",
    [],
    "9:16",
    tenant.geminiKey,
  );
  mkdirSync(dirname(style.refPath), { recursive: true });
  writeFileSync(style.refPath, png);
  logUsage(tenant.id, { kind: "image", qty: 1, keyOwner: keyOwner(tenant) });
}

/** Generate the character model sheet for this episode. Returns its path. */
async function generateCharacterSheet(
  tenant: TenantConfig,
  episodeDir: string,
  story: Story,
  style: ResolvedStyle,
): Promise<string> {
  const out = join(episodeDir, "character-sheet.png");
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
    [pngRef(style.refPath)],
    "16:9",
    tenant.geminiKey,
  );
  mkdirSync(episodeDir, { recursive: true });
  writeFileSync(out, png);
  logUsage(tenant.id, { kind: "image", qty: 1, keyOwner: keyOwner(tenant) });
  return out;
}

/** Generate every raw panel image for the episode (skips ones already on disk). */
async function generatePanels(
  tenant: TenantConfig,
  episodeDir: string,
  story: Story,
  style: ResolvedStyle,
  sheetPath: string,
): Promise<void> {
  const rawDir = join(episodeDir, "panels", "raw");
  mkdirSync(rawDir, { recursive: true });
  const refs = [pngRef(style.refPath), pngRef(sheetPath)];

  for (const panel of story.panels) {
    const dest = join(rawDir, panelFile(panel.n));
    if (existsSync(dest)) {
      console.log(`• panel ${panel.n}: exists, skipping`);
      continue;
    }
    const prompt = buildPanelPrompt(style.bible, story, panel);
    console.log(`• panel ${panel.n}/${story.panels.length}: generating`);
    const { png } = await generateImage(prompt, refs, "9:16", tenant.geminiKey);
    writeFileSync(dest, png);
    logUsage(tenant.id, { kind: "image", qty: 1, keyOwner: keyOwner(tenant) });
  }
}

/**
 * Render all art for one episode of one tenant: the per-style key-art reference
 * (once per style), the episode character sheet, and every raw panel.
 * Style resolves from the story override first, then the tenant default.
 * Usage is logged to usage/<tenant>.jsonl after each successful image.
 */
export async function generateArt(
  tenant: TenantConfig,
  episodeDir: string,
  story: Story,
): Promise<void> {
  const style = resolveStyle(story.styleKey ?? tenant.styleKey);
  console.log(
    `\nGhostwriter · art · ${story.slug} (${story.genre}, ${story.panels.length} panels, style=${style.key})\n`,
  );

  await ensureStyleRef(tenant, style);
  const sheet = await generateCharacterSheet(tenant, episodeDir, story, style);
  await generatePanels(tenant, episodeDir, story, style, sheet);

  console.log(`\n✓ raw panels in ${join(episodeDir, "panels", "raw")}`);
}
