import Anthropic from "@anthropic-ai/sdk";
import { loadEnv, requireEnv } from "./lib/env.ts";
import { resolveStyle } from "./lib/style.ts";
import { resolveSeries, canonicalNames, type ResolvedSeries } from "./lib/series.ts";
import { validateStory, validateSeriesStory, type Genre, type Story } from "./lib/story.ts";
import type { SeriesRecap } from "./db/episodes.ts";

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
    "narration": "<=120 chars or null; at most one per panel, often null — keep it short, its box sits over the art",
    "narration_pos": "top|bottom",
    "dialogue": [{ "speaker": "name", "text": "<=60 chars", "bubble_pos": [0.3, 0.4] }],
    "sfx": "optional single word e.g. KRRK, omit if none"
  }],
  "caption": "hook line + 1-2 line tease + soft follow CTA, no spoiler",
  "hashtags": ["6-12 single-word tags, no spaces, no # prefix, mix broad + niche"]
}
bubble_pos = [x,y] fractions 0..1. Dialogue is composited into the calm top or bottom band, never over the art: set y ≈ 0.12 for the top band or y ≈ 0.88 for the bottom band — pick the band that is clear of the panel's main subject and opposite to any narration on that panel. x is a left/right lean only.`;

const SERIES_SYSTEM = `You write the next episode of a serialized anime comic told as a swipe carousel, and return ONLY a JSON object.

Rules:
- This is one episode of a continuing series. Follow the SERIES BIBLE exactly — its world, fixed facts, cast, frames and season arc — and never contradict earlier episodes in the RECAP.
- 6–8 panels. Panel 1 hooks; from episode 2 onward it may open on a quick "previously" beat. The final panel lands a turn or a cliffhanger — the season story does not have to resolve.
- Recurring cast and frames use their canonical names exactly as given in CANON, in "speaker", "characters" and "cast". When a recurring member appears, copy their description and visual_tags from CANON into "cast". At most one new guest character per episode; give a guest a distinct silhouette and 2–4 visual_tags.
- "genre" is "drama" for most episodes and "funny" for a comic-relief episode (about one in four, and on arc beats the bible marks as comic relief). A drama episode may hold one light beat, never mocking the stakes.
- At most 2 dialogue lines per panel. Narration sits at the TOP only ("narration_pos": "top") — the bottom of every panel is reserved for subtitles.
- Subtitles: every dialogue line carries "zh" (Simplified Chinese with full-width punctuation, <=16 characters) and "ja" (natural Japanese, <=24 characters) translations of "text". Every non-null "narration" carries "narration_zh" and "narration_ja". Use the canonical zh/ja names from CANON inside translations.
- Original only: frames, factions and names must never resemble an existing mecha franchise (Gundam, Evangelion, Macross, Pacific Rim, BattleTech/MechWarrior, Code Geass). No emblems, insignia, unit numbers or readable markings in any scene.
- PG-13 and platform-safe: action is bloodless and machine-on-machine — machines dent, spark and fall apart; people are never wounded or killed. No real named people or brands. No hate/slurs. No sexual content.

Return exactly this shape (no markdown fence, no prose):
{
  "date": "YYYY-MM-DD", "slug": "kebab-2-4-words", "genre": "drama|funny",
  "title": "...", "title_zh": "...", "title_ja": "...",
  "logline": "one sentence, no spoiler",
  "series": { "episode": 1, "beat": "which season beat this episode covers", "recap": "<=300 chars, internal, spoilers OK: what happened and what changed", "cliffhanger": "the open question this episode ends on, or null" },
  "cast": [{ "name": "...", "description": "...", "visual_tags": ["..."] }],
  "panels": [{
    "n": 1, "scene": "what is DRAWN — concrete, visual, NO dialogue text, no insignia or markings",
    "camera": "wide|mid|close|low angle|over-shoulder|cockpit|...",
    "characters": ["canonical name"],
    "narration": "<=80 chars or null", "narration_zh": "... or null", "narration_ja": "... or null",
    "narration_pos": "top",
    "dialogue": [{ "speaker": "canonical name", "text": "<=48 chars", "zh": "<=16 chars", "ja": "<=24 chars", "bubble_pos": [0.5, 0.88] }],
    "sfx": "optional single word e.g. KRRNCH, omit if none"
  }],
  "caption": "English hook line + 1-2 line tease + soft follow CTA, no spoiler",
  "caption_zh": "<=60 chars", "caption_ja": "<=80 chars",
  "hashtags": ["6-12 single-word tags, no spaces, no # prefix, mix broad + niche"]
}
bubble_pos = [x,y] fractions 0..1. Dialogue is composited into the bottom band just above the subtitles, so use y ≈ 0.88. x is a left/right lean only.`;

export interface StoryInput {
  genre: Genre | "drama_funny";
  niche: string;
  styleKey: string;
  /** BCP-47-ish tenant language. Missing / "en" = English. "zh-Hans" = Simplified Chinese. */
  language?: string;
  priorTitles: string[];
  /** Serialized lines only: the canon, this episode's number, and the canon episodes before it. */
  series?: { resolved: ResolvedSeries; episodeNumber: number; recap: SeriesRecap[] };
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
      `"description" and "visual_tags". In Chinese text use full-width punctuation ` +
      `（，。、！？：等），never ASCII commas / periods / question marks. Chinese is dense — ` +
      `cap "dialogue.text" at about 18 characters, "narration" at about 34, "caption" at about 120.`
    );
  }
  return `\n\nLANGUAGE: Write every reader-facing string ("title", "logline", "dialogue.text", "narration", "caption", "hashtags") in the language tagged "${language}". Keep "slug", "scene", "camera", and cast "description"/"visual_tags" in English.`;
}

export function buildStoryMessages(input: StoryInput): { system: string; user: string } {
  if (input.series) return buildSeriesStoryMessages(input, input.series);
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

function buildSeriesStoryMessages(
  input: StoryInput,
  series: NonNullable<StoryInput["series"]>,
): { system: string; user: string } {
  const style = resolveStyle(input.styleKey);
  const today = new Date().toISOString().slice(0, 10);
  const { resolved, episodeNumber, recap } = series;
  const canon = {
    cast: resolved.cast,
    frames: resolved.mechs,
  };
  const recapText = recap.length
    ? recap
        .map((r) => `EP ${r.episode} · ${r.title} — ${r.recap}${r.cliffhanger ? ` Ends on: ${r.cliffhanger}` : ""}`)
        .join("\n")
    : "None — this is the first episode.";
  const user =
    `Series: ${resolved.title.en} (${resolved.title.zh} / ${resolved.title.ja})\n` +
    `Episode number: ${episodeNumber}\n` +
    `Date for the "date" field: ${today}\n` +
    `Genre mix: drama with comic relief — choose "drama" or "funny" for this episode by the rules.\n` +
    `Account niche: ${input.niche}\n\n` +
    `This episode covers season beat ${episodeNumber} of the arc in the bible. After the last listed beat, ` +
    `continue into the next season from the final cliffhanger.\n\n` +
    `SERIES BIBLE:\n\n${resolved.bible}\n\n` +
    `CANON (use these names exactly):\n${JSON.stringify(canon, null, 2)}\n\n` +
    `RECAP (earlier episodes, oldest first):\n${recapText}\n\n` +
    `The art will be drawn in this house style — keep scenes achievable in it:\n\n${style.bible}`;
  return { system: SERIES_SYSTEM, user };
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
      if (input.series) {
        // The engine owns numbering; never trust the model's episode number.
        json.series = { ...(json.series ?? {}), episode: input.series.episodeNumber };
        validateSeriesStory(json as Story, {
          names: canonicalNames(input.series.resolved),
          maxGuests: input.series.resolved.maxGuests,
        });
      } else {
        validateStory(json as Story);
      }
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
//      tsx src/write-story.ts --series tidebreaker --episode 1   (drafts a series episode, no art)
if (process.argv[1]?.endsWith("write-story.ts")) {
  const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i === -1 ? undefined : process.argv[i + 1]; };
  const seriesKey = arg("series");
  const resolved = seriesKey ? resolveSeries(seriesKey) : undefined;
  const { story } = await writeStory({
    genre: resolved ? "drama_funny" : ((arg("genre") as Genre) ?? "horror"),
    niche: arg("niche") ?? (resolved ? `${resolved.title.en} — follow the series bible` : "everyday life with a strange edge"),
    styleKey: resolved ? resolved.styleKey : (arg("style") ?? "graphic-novel-noir"),
    language: arg("lang") ?? "en",
    priorTitles: [],
    series: resolved ? { resolved, episodeNumber: Number(arg("episode") ?? 1), recap: [] } : undefined,
  });
  process.stdout.write(JSON.stringify(story, null, 2) + "\n");
}
