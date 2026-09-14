export type Genre = "funny" | "horror" | "wuxia" | "drama";

export interface CastMember {
  name: string;
  description: string;
  visual_tags: string[];
}

export interface Dialogue {
  speaker: string;
  text: string;
  /** [x, y] as fractions 0..1 of the panel, where the balloon tail points. */
  bubble_pos: [number, number];
  /** Serialized lines only: subtitle translations of `text`. */
  zh?: string;
  ja?: string;
}

export interface Panel {
  n: number;
  scene: string;
  camera: string;
  characters: string[];
  /** Narration/caption text for this panel, or null for none. */
  narration: string | null;
  /** Where the narration sits when present. */
  narration_pos?: "top" | "bottom";
  dialogue: Dialogue[];
  /** Optional hand-drawn SFX word baked into the art. */
  sfx?: string;
  /** Serialized lines only: translations of `narration`. */
  narration_zh?: string | null;
  narration_ja?: string | null;
}

/** Continuity metadata for a serialized episode (stored inside story_json). */
export interface SeriesMeta {
  episode: number;
  beat: string;
  /** Internal, spoilers allowed — fed to the next episode's prompt, never shown. */
  recap: string;
  cliffhanger: string | null;
}

export interface Story {
  date: string;
  slug: string;
  genre: Genre;
  title: string;
  logline: string;
  cast: CastMember[];
  panels: Panel[];
  caption: string;
  hashtags: string[];
  styleKey?: string;
  niche?: string;
  series?: SeriesMeta;
  title_zh?: string;
  title_ja?: string;
  caption_zh?: string;
  caption_ja?: string;
}

export interface Status {
  status: "draft" | "approved" | "posted";
  created: string;
  approvedAt?: string;
  postedAt?: string;
}

export function validateStory(s: Story): void {
  const problems: string[] = [];
  if (!s.slug) problems.push("missing slug");
  if (s.slug && !/^[a-z0-9-]+$/.test(s.slug))
    problems.push(`slug must be kebab-case [a-z0-9-] (got "${s.slug}")`);
  if (!s.genre) problems.push("missing genre");
  if (!Array.isArray(s.cast) || s.cast.length === 0) problems.push("empty cast");
  if (!Array.isArray(s.panels) || s.panels.length < 4 || s.panels.length > 10)
    problems.push(`panels must be 4-10 (got ${s.panels?.length ?? 0})`);
  s.panels?.forEach((p, i) => {
    if (typeof p.n !== "number") problems.push(`panel ${i}: missing n`);
    if (!p.scene) problems.push(`panel ${p.n}: missing scene`);
    p.dialogue?.forEach((d, j) => {
      if (!d.text) problems.push(`panel ${p.n} dialogue ${j}: missing text`);
      if (
        !Array.isArray(d.bubble_pos) ||
        d.bubble_pos.length !== 2 ||
        d.bubble_pos.some((v) => typeof v !== "number" || v < 0 || v > 1)
      )
        problems.push(`panel ${p.n} dialogue ${j}: bubble_pos must be [0..1, 0..1]`);
    });
  });
  if (!s.caption) problems.push("missing caption");
  if (!Array.isArray(s.hashtags) || s.hashtags.length === 0) problems.push("missing hashtags");
  if (problems.length) {
    throw new Error("Invalid story.json:\n  - " + problems.join("\n  - "));
  }
}

/** The subset of a series' canon that validation needs (keeps this module fs-free). */
export interface SeriesCanon {
  names: string[];
  maxGuests: number;
}

const HAN = /\p{Script=Han}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * Extra rules for a serialized episode on top of `validateStory`. Short Japanese
 * lines can be all kanji (了解。), so kana is checked across the episode's
 * Japanese lines together, and each line must differ from its Chinese line —
 * that still rejects Chinese pasted into the Japanese field.
 */
export function validateSeriesStory(s: Story, canon: SeriesCanon): void {
  validateStory(s);
  const problems: string[] = [];
  if (s.genre !== "drama" && s.genre !== "funny") problems.push(`series genre must be drama or funny (got "${s.genre}")`);
  if (s.panels.length < 6 || s.panels.length > 8) problems.push(`series panels must be 6-8 (got ${s.panels.length})`);
  if (!s.series || typeof s.series.episode !== "number") problems.push("missing series.episode");
  if (!s.series?.recap) problems.push("missing series.recap");

  const jaLines: string[] = [];
  const zhLines: string[] = [];
  const guests = new Set<string>();
  for (const p of s.panels) {
    if ((p.dialogue?.length ?? 0) > 2) problems.push(`panel ${p.n}: at most 2 dialogue lines (got ${p.dialogue.length})`);
    p.dialogue?.forEach((d, j) => {
      if (!d.zh) problems.push(`panel ${p.n} dialogue ${j}: missing zh`);
      if (!d.ja) problems.push(`panel ${p.n} dialogue ${j}: missing ja`);
      if (d.zh && d.ja && d.zh.trim() === d.ja.trim()) problems.push(`panel ${p.n} dialogue ${j}: ja is identical to zh`);
      if (d.zh) zhLines.push(d.zh);
      if (d.ja) jaLines.push(d.ja);
      if (d.speaker && !canon.names.includes(d.speaker)) guests.add(d.speaker);
    });
    if (p.narration) {
      if (!p.narration_zh) problems.push(`panel ${p.n}: missing narration_zh`);
      if (!p.narration_ja) problems.push(`panel ${p.n}: missing narration_ja`);
      if (p.narration_zh) zhLines.push(p.narration_zh);
      if (p.narration_ja) jaLines.push(p.narration_ja);
    }
  }
  for (const c of s.cast ?? []) if (!canon.names.includes(c.name)) guests.add(c.name);
  if (guests.size > canon.maxGuests) {
    problems.push(`at most ${canon.maxGuests} guest character(s) (got ${[...guests].join(", ")})`);
  }
  if (!s.caption_zh) problems.push("missing caption_zh");
  if (!s.caption_ja) problems.push("missing caption_ja");
  if (s.caption_zh) zhLines.push(s.caption_zh);
  if (s.caption_ja) jaLines.push(s.caption_ja);
  if (zhLines.length && !zhLines.some((l) => HAN.test(l))) problems.push("zh text contains no Chinese characters");
  if (jaLines.length && !jaLines.some((l) => KANA.test(l))) problems.push("ja text contains no kana — looks like it isn't Japanese");

  if (problems.length) {
    throw new Error("Invalid series story.json:\n  - " + problems.join("\n  - "));
  }
}

export function panelFile(n: number): string {
  return `panel-${String(n).padStart(2, "0")}.png`;
}
