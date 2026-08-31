import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./env.ts";

export const EPISODES_DIR = join(REPO_ROOT, "episodes");

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

/**
 * Resolve an episode directory from a CLI arg. Accepts:
 *   - absolute or relative path to an episode folder
 *   - a slug or "<date>-<slug>" under episodes/
 *   - nothing → the most recently modified episode folder
 */
export function resolveEpisodeDir(arg?: string): string {
  if (arg) {
    if (existsSync(arg) && statSync(arg).isDirectory()) return arg;
    const direct = join(EPISODES_DIR, arg);
    if (existsSync(direct)) return direct;
    const match = listEpisodes().find((k) => {
      const base = k.split(/[\\/]/).pop()!;
      return base === arg || base.endsWith("-" + arg);
    });
    if (match) return join(EPISODES_DIR, match);
    throw new Error(`No episode matching "${arg}" under ${EPISODES_DIR}`);
  }
  const all = listEpisodes();
  if (all.length === 0) throw new Error(`No episodes yet under ${EPISODES_DIR}`);
  const latest = all
    .map((key) => ({ key, mtime: statSync(join(EPISODES_DIR, key)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]!;
  return join(EPISODES_DIR, latest.key);
}

/**
 * Episode keys for the 2-level layout `episodes/<tenant>/<episode>/story.json`,
 * returned as `join(tenant, episode)` so `join(EPISODES_DIR, key)` still resolves.
 * Defensively also picks up any leftover flat `episodes/<x>/story.json` (old layout).
 */
export function listEpisodes(): string[] {
  if (!existsSync(EPISODES_DIR)) return [];
  const keys: string[] = [];
  for (const tenant of readdirSync(EPISODES_DIR)) {
    const tenantPath = join(EPISODES_DIR, tenant);
    if (!statSync(tenantPath).isDirectory()) continue;
    // old flat layout: episodes/<x>/story.json
    if (existsSync(join(tenantPath, "story.json"))) {
      keys.push(tenant);
      continue;
    }
    // current layout: episodes/<tenant>/<episode>/story.json
    for (const ep of readdirSync(tenantPath)) {
      const epPath = join(tenantPath, ep);
      if (statSync(epPath).isDirectory() && existsSync(join(epPath, "story.json"))) {
        keys.push(join(tenant, ep));
      }
    }
  }
  return keys;
}

export function panelFile(n: number): string {
  return `panel-${String(n).padStart(2, "0")}.png`;
}

export function episodeDirFor(tenantId: string, date: string, slug: string): string {
  for (const seg of [tenantId, slug]) {
    if (!/^[A-Za-z0-9_-]+$/.test(seg)) throw new Error(`unsafe path segment: ${seg}`);
  }
  return join(EPISODES_DIR, tenantId, `${date}-${slug}`);
}
