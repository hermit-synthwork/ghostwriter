import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./lib/env.ts";
import { resolveEpisodeDir, loadStory, panelFile, type Story } from "./lib/story.ts";
import { generateImage, type RefImage } from "./gemini.ts";

const STYLE_BIBLE = readFileSync(join(REPO_ROOT, "config", "style-bible.md"), "utf8");
const STYLE_REF_PATH = join(REPO_ROOT, "assets", "style-ref.png");

function styleHeader(): string {
  return (
    STYLE_BIBLE +
    "\n\nRender in exactly this house style. Comic panel illustration only — " +
    "absolutely no speech balloons, caption boxes, or readable text in the image."
  );
}

function pngRef(path: string): RefImage {
  return { data: readFileSync(path), mimeType: "image/png" };
}

function logCost(episodeDir: string, label: string, model: string, bytes: number): void {
  appendFileSync(
    join(episodeDir, "cost.log"),
    `${new Date().toISOString()}\t${label}\t${model}\t1 image\t${bytes} bytes\n`,
  );
}

async function ensureStyleRef(episodeDir: string): Promise<void> {
  if (existsSync(STYLE_REF_PATH)) return;
  console.log("• style-ref.png missing — generating house-style key art (one time)");
  const { png, model } = await generateImage(
    styleHeader() +
      "\n\nSubject for this reference frame: an empty city bus-stop bench at dusk, " +
      "one flickering streetlight, long shadows. Establish palette, linework, halftone, border.",
    [],
    "9:16",
  );
  writeFileSync(STYLE_REF_PATH, png);
  logCost(episodeDir, "style-ref", model, png.length);
}

async function generateCharacterSheet(episodeDir: string, story: Story): Promise<string> {
  const out = join(episodeDir, "character-sheet.png");
  const cast = story.cast
    .map(
      (c) =>
        `• ${c.name}: ${c.description}. Signature details: ${c.visual_tags.join(", ")}.`,
    )
    .join("\n");
  console.log(`• generating character sheet (${story.cast.length} cast)`);
  const { png, model } = await generateImage(
    styleHeader() +
      "\n\nProduce a CHARACTER MODEL SHEET on a plain bone background: for each character, " +
      "a full-body pose and a head close-up, clearly separated, evenly lit, neutral expression. " +
      "Keep proportions and details identical to how they must appear in the story panels.\n\n" +
      `Cast:\n${cast}`,
    [pngRef(STYLE_REF_PATH)],
    "16:9",
  );
  writeFileSync(out, png);
  logCost(episodeDir, "character-sheet", model, png.length);
  return out;
}

async function generatePanels(episodeDir: string, story: Story, sheetPath: string): Promise<void> {
  const rawDir = join(episodeDir, "panels", "raw");
  mkdirSync(rawDir, { recursive: true });
  const refs = [pngRef(STYLE_REF_PATH), pngRef(sheetPath)];

  for (const panel of story.panels) {
    const dest = join(rawDir, panelFile(panel.n));
    if (existsSync(dest)) {
      console.log(`• panel ${panel.n}: exists, skipping`);
      continue;
    }
    const present = panel.characters.length
      ? `Characters present (match the model sheet exactly): ${panel.characters.join(", ")}.`
      : "No characters in frame.";
    const sfx = panel.sfx
      ? ` Integrate a single hand-drawn comic SFX word "${panel.sfx}" into the illustration.`
      : "";
    const prompt =
      styleHeader() +
      `\n\nPANEL ${panel.n} of ${story.panels.length} — ${story.genre} story "${story.title}".\n` +
      `Scene: ${panel.scene}\n` +
      `Camera: ${panel.camera}\n` +
      `${present}\n` +
      "Composition: keep faces and key action within the central vertical 80%. " +
      "Keep the top ~18% and bottom ~22% visually calm (plain wall, sky, floor or shadow) " +
      "for caption bars." +
      sfx;

    console.log(`• panel ${panel.n}/${story.panels.length}: generating`);
    const { png, model } = await generateImage(prompt, refs, "9:16");
    writeFileSync(dest, png);
    logCost(episodeDir, `panel-${panel.n}`, model, png.length);
  }
}

async function main() {
  const episodeDir = resolveEpisodeDir(process.argv[2]);
  const story = loadStory(episodeDir);
  console.log(`\nGhostwriter · art · ${story.slug} (${story.genre}, ${story.panels.length} panels)\n`);

  await ensureStyleRef(episodeDir);
  const sheet = await generateCharacterSheet(episodeDir, story);
  await generatePanels(episodeDir, story, sheet);

  console.log(`\n✓ raw panels in ${join(episodeDir, "panels", "raw")}`);
  console.log("  next: npm run compose " + story.slug + "\n");
}

main().catch((err) => {
  console.error("\n✗ " + (err as Error).message + "\n");
  process.exit(1);
});
