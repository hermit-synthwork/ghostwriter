import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Genre = "funny" | "horror";

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
}

export interface Status {
  status: "draft" | "approved" | "posted";
  created: string;
  approvedAt?: string;
  postedAt?: string;
}

export function loadStory(episodeDir: string): Story {
  const raw = readFileSync(join(episodeDir, "story.json"), "utf8");
  const s = JSON.parse(raw) as Story;
  validateStory(s);
  return s;
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

export function panelFile(n: number): string {
  return `panel-${String(n).padStart(2, "0")}.png`;
}
