import Anthropic from "@anthropic-ai/sdk";
import { loadEnv, requireEnv } from "./lib/env.ts";
import { resolveStyle } from "./lib/style.ts";
import { validateStory, type Story } from "./lib/story.ts";

const MODEL = "claude-sonnet-5";

const SYSTEM = `You write original micro-stories for a swipe-carousel comic and return ONLY a JSON object.

Rules:
- 6–8 panels. Panel 1 hooks (striking image + an unanswered question). The final panel lands the twist (horror), the punchline (funny), or the decisive turn — a duel settled, a betrayal revealed, an honour test met (wuxia). One clean arc, no filler.
- Fresh cast, 2–4 characters. Each gets a distinct silhouette and 2–4 visual_tags (garment, prop, hair, build). No recurring characters.
- Wuxia stories are self-contained jianghu vignettes: wandering swordsmen, sects, oaths, debts, revenge, a teahouse or rooftop showdown, a master's last request. Optional xianxia flavour — qi, flight, sworn immortals, a breakthrough, a spirit beast — is colour, not a power system to explain. One clean turn or reveal.
- Original only — do not adapt Reddit posts, creepypasta, or known bits. For wuxia, invent your own sects, houses, and heroes: never reproduce characters, plots, or the identifiable style of any real manhua, film, novel, or artist.
- PG-13 and platform-safe: horror = dread/shadow/implication, never gore, wounds, blood, or body horror; wuxia = stylized, bloodless martial arts — implied strikes, wire-fu motion, a fallen opponent, never blood, wounds, or lingering on injury. No real named people or brands. No hate/slurs. No self-harm or drug how-to. No sexual content.

Return exactly this shape (no markdown fence, no prose):
{
  "date": "YYYY-MM-DD", "slug": "kebab-2-4-words", "genre": "horror|funny|wuxia",
  "title": "...", "logline": "one sentence, no spoiler",
  "cast": [{ "name": "...", "description": "...", "visual_tags": ["..."] }],
  "panels": [{
    "n": 1, "scene": "what is DRAWN — concrete, visual, NO dialogue text",
    "camera": "wide|mid|close|low angle|over-shoulder|...",
    "characters": ["name"],
    "narration": "<=180 chars or null; at most one per panel, often null",
    "narration_pos": "top|bottom",
    "dialogue": [{ "speaker": "name", "text": "<=60 chars", "bubble_pos": [0.3, 0.4] }],
    "sfx": "optional single word e.g. KRRK, omit if none"
  }],
  "caption": "hook line + 1-2 line tease + soft follow CTA, no spoiler",
  "hashtags": ["6-12 single-word tags, no spaces, no # prefix, mix broad + niche"]
}
bubble_pos = [x,y] fractions 0..1; keep important bubbles between y 0.18 and 0.78.`;

export interface StoryInput {
  genre: "funny" | "horror" | "wuxia";
  niche: string;
  styleKey: string;
  /** BCP-47-ish tenant language. Missing / "en" = English. "zh-Hans" = Simplified Chinese. */
  language?: string;
  priorTitles: string[];
}

/** Reader-facing text goes in the tenant's language; art-direction fields stay English. */
function languageBlock(language: string | undefined): string {
  if (!language || language === "en" || language.startsWith("en-")) return "";
  if (language === "zh-Hans" || language === "zh" || language.startsWith("zh-")) {
    return (
      `\n\nLANGUAGE: Write every reader-facing string in Simplified Chinese (简体中文) — ` +
      `"title", "logline", every "dialogue.text", every "narration", "caption", and all ` +
      `"hashtags" (Chinese tags, no # prefix, no spaces). Keep these in English, they are ` +
      `art direction the reader never sees: "slug" (ASCII kebab-case, transliterate or ` +
      `translate the title), every "scene", every "camera", and each cast member's ` +
      `"description" and "visual_tags". Chinese is dense — cap "dialogue.text" at about 18 ` +
      `characters, "narration" at about 34, "caption" at about 120.`
    );
  }
  return `\n\nLANGUAGE: Write every reader-facing string ("title", "logline", "dialogue.text", "narration", "caption", "hashtags") in the language tagged "${language}". Keep "slug", "scene", "camera", and cast "description"/"visual_tags" in English.`;
}

export function buildStoryMessages(input: StoryInput): { system: string; user: string } {
  const style = resolveStyle(input.styleKey);
  const today = new Date().toISOString().slice(0, 10);
  const avoid = input.priorTitles.length
    ? `\n\nDo NOT reuse these recent titles or their premises: ${input.priorTitles.join("; ")}.`
    : "";
  const user =
    `Genre: ${input.genre}\nDate for the "date" field: ${today}\n` +
    `Account niche (every story must fit this): ${input.niche}\n\n` +
    `The art will be drawn in this house style — keep scenes achievable in it:\n\n${style.bible}` +
    languageBlock(input.language) + avoid;
  return { system: SYSTEM, user };
}

export async function writeStory(input: StoryInput): Promise<{ story: Story; usageTokens: number }> {
  loadEnv();
  const apiKey = requireEnv("ANTHROPIC_API_KEY", "console.anthropic.com → API keys. Var: ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey });
  const { system, user } = buildStoryMessages(input);

  for (let attempt = 1; ; attempt++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: user }],
    });

    // A refusal or a max_tokens truncation will recur on retry — fail loudly
    // now instead of surfacing as an opaque "Unexpected end of JSON input".
    if (res.stop_reason === "refusal") {
      throw new Error(
        `write-story refused by safety classifier (category: ${res.stop_details?.category ?? "unknown"})`,
      );
    }
    if (res.stop_reason === "max_tokens") {
      throw new Error("write-story response truncated — raise max_tokens");
    }

    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    try {
      const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
      json.styleKey = input.styleKey;
      json.niche = input.niche;
      validateStory(json as Story);
      const usageTokens = (res.usage.input_tokens ?? 0) + (res.usage.output_tokens ?? 0);
      return { story: json as Story, usageTokens };
    } catch (e) {
      if (attempt >= 2) {
        throw new Error(`write-story: invalid story after 2 attempts: ${(e as Error).message}`);
      }
    }
  }
}

// CLI: tsx src/write-story.ts --genre horror --niche "..." --style graphic-novel-noir
if (process.argv[1]?.endsWith("write-story.ts")) {
  const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i === -1 ? undefined : process.argv[i + 1]; };
  const { story } = await writeStory({
    genre: (arg("genre") as "funny" | "horror" | "wuxia") ?? "horror",
    niche: arg("niche") ?? "everyday life with a strange edge",
    styleKey: arg("style") ?? "graphic-novel-noir",
    language: arg("lang") ?? "en",
    priorTitles: [],
  });
  process.stdout.write(JSON.stringify(story, null, 2) + "\n");
}
