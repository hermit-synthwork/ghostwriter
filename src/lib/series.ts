import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./env.ts";

export const SERIES_DIR = join(REPO_ROOT, "series");

/** A recurring character or frame, with its canonical name in every lettered language. */
export interface SeriesFigure {
  name: string;
  name_zh: string;
  name_ja: string;
  description: string;
  visual_tags: string[];
}

export interface ResolvedSeries {
  key: string;
  title: { en: string; zh: string; ja: string };
  styleKey: string;
  bible: string;
  cast: SeriesFigure[];
  mechs: SeriesFigure[];
  maxGuests: number;
  castSheetPath: string;
  mechSheetPath: string;
  hasSheets: boolean;
}

export function listSeriesKeys(): string[] {
  if (!existsSync(SERIES_DIR)) return [];
  return readdirSync(SERIES_DIR).filter((d) => {
    const p = join(SERIES_DIR, d);
    return statSync(p).isDirectory() && existsSync(join(p, "series-bible.md"));
  });
}

export function resolveSeries(key: string): ResolvedSeries {
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error(`unsafe series key: ${key}`);
  const dir = join(SERIES_DIR, key);
  if (!existsSync(join(dir, "series-bible.md"))) {
    throw new Error(`Unknown series "${key}" — have: ${listSeriesKeys().join(", ")}`);
  }
  const canon = JSON.parse(readFileSync(join(dir, "cast.json"), "utf8")) as {
    title: ResolvedSeries["title"];
    styleKey: string;
    cast: SeriesFigure[];
    mechs?: SeriesFigure[];
    maxGuests?: number;
  };
  const castSheetPath = join(dir, "cast-sheet.png");
  const mechSheetPath = join(dir, "mech-sheet.png");
  return {
    key,
    title: canon.title,
    styleKey: canon.styleKey,
    bible: readFileSync(join(dir, "series-bible.md"), "utf8"),
    cast: canon.cast,
    mechs: canon.mechs ?? [],
    maxGuests: canon.maxGuests ?? 1,
    castSheetPath,
    mechSheetPath,
    hasSheets: existsSync(castSheetPath) && existsSync(mechSheetPath),
  };
}

/** Series panels are drawn against committed, hand-approved model sheets — never regenerated. */
export function ensureSeriesSheets(s: ResolvedSeries): void {
  if (!s.hasSheets) {
    throw new Error(
      `series "${s.key}" is missing cast-sheet.png or mech-sheet.png — generate with scripts/gen-series-sheet.ts, approve, and commit`,
    );
  }
}

/** Every canonical name a speaker or `panel.characters` entry may use. */
export function canonicalNames(s: ResolvedSeries): string[] {
  return [...s.cast, ...s.mechs].map((f) => f.name);
}

/** Localized name for subtitles; a one-off guest keeps the name the story gave it. */
export function localName(s: ResolvedSeries, name: string, lang: "zh" | "ja"): string {
  const f = [...s.cast, ...s.mechs].find((x) => x.name === name);
  if (!f) return name;
  return lang === "zh" ? f.name_zh : f.name_ja;
}
