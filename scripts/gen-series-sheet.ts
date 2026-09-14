/**
 * One-off generator for a serialized line's visual canon. Writes numbered
 * candidates to `.cache/series-candidates/<seriesKey>/` for a human to eyeball;
 * the chosen file is copied into place by hand and committed:
 *   ref  → styles/<styleKey>/style-ref.png
 *   cast → series/<seriesKey>/cast-sheet.png
 *   mech → series/<seriesKey>/mech-sheet.png
 *
 *   npx tsx scripts/gen-series-sheet.ts <seriesKey> ref|cast|mech [count]
 *
 * `cast` and `mech` pass the committed style-ref as a reference, so generate and
 * approve the style-ref first. Each image costs one Gemini call.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, REPO_ROOT } from "../src/lib/env.ts";
import { generateImage } from "../src/gemini.ts";
import { resolveStyle } from "../src/lib/style.ts";
import { styleHeader, imageRef } from "../src/engine/art.ts";

interface Figure { name: string; description: string; visual_tags: string[] }
interface CastFile { styleKey: string; cast: Figure[]; mechs: Figure[] }

const [seriesKey, kind, countArg] = process.argv.slice(2);
if (!seriesKey || !["ref", "cast", "mech"].includes(kind ?? "")) {
  console.error("usage: npx tsx scripts/gen-series-sheet.ts <seriesKey> ref|cast|mech [count]");
  process.exit(1);
}
const count = Math.max(1, Math.min(4, Number(countArg ?? 2)));

loadEnv();
const castFile = JSON.parse(
  readFileSync(join(REPO_ROOT, "series", seriesKey, "cast.json"), "utf8"),
) as CastFile;
const style = resolveStyle(castFile.styleKey);
const outDir = join(REPO_ROOT, ".cache", "series-candidates", seriesKey);
mkdirSync(outDir, { recursive: true });

const lines = (figs: Figure[]) =>
  figs.map((f) => `• ${f.name}: ${f.description}. Signature details: ${f.visual_tags.join(", ")}.`).join("\n");

const NO_TEXT =
  " Absolutely no text, names, labels, numbers, logos, emblems, insignia, or markings anywhere in the image.";

let prompt: string;
let refs: ReturnType<typeof imageRef>[] = [];
let aspect: "9:16" | "16:9";

if (kind === "ref") {
  aspect = "9:16";
  prompt =
    style.bible +
    "\n\nReference key-art frame establishing this house style: ONE single continuous illustration that runs " +
    "seamlessly to all four edges of the frame, like a full-screen phone wallpaper — no borders, no frames, " +
    "no letterbox bars, no flat colour strips, no panel divisions. A battered grey industrial piloted frame with " +
    "faded orange forearm stripes braces against a crashing wave on a rain-lashed harbour storm wall at night, " +
    "work floodlights blazing, harpoon cable taut, a faceless barnacle-crusted drone clawing up the wall below; " +
    "cranes, canals and neon city lights in the distance. The stormy sky continues to the very top edge and the " +
    "wet storm wall continues to the very bottom edge." +
    NO_TEXT;
} else {
  if (!style.hasRef) throw new Error(`style "${style.key}" has no style-ref.png yet — approve and commit the ref first`);
  refs = [imageRef(style.refPath)];
  aspect = "16:9";
  prompt =
    kind === "cast"
      ? styleHeader(style.bible) +
        "\n\nProduce a CHARACTER MODEL SHEET on a plain light-grey background: for each character, a full-body " +
        "standing pose and a head close-up, clearly separated in a tidy row, evenly lit, neutral expression. " +
        "For a character described as a screen face, draw only that small dashboard screen with its face. " +
        "Keep proportions, hair, costume and props identical to how they must appear in every episode." +
        NO_TEXT +
        `\n\nCast:\n${lines(castFile.cast)}`
      : styleHeader(style.bible) +
        "\n\nProduce a MECH MODEL SHEET on a plain light-grey background: for each piloted frame, a front view, " +
        "a side view and a three-quarter view, full body, clearly separated in a tidy row, evenly lit, with a tiny " +
        "plain human silhouette beside each for scale. Original industrial designs; keep shapes, colours, plating, " +
        "weapons and damage identical to how they must appear in every episode." +
        NO_TEXT +
        `\n\nFrames:\n${lines(castFile.mechs)}`;
}

for (let i = 1; i <= count; i++) {
  const { png } = await generateImage(prompt, refs, aspect);
  const out = join(outDir, `${kind}-${i}.png`);
  writeFileSync(out, png);
  console.log(`${kind} candidate ${i}/${count}: ${out} (${png.length} bytes)`);
}
if (!existsSync(outDir)) process.exit(1);
