/**
 * The self-serve style picker. `key` must match a `styles/<key>/` directory in
 * the root engine repo (resolveStyle in src/lib/style.ts) — these are the 5
 * styles actually shipped there today (see `listStyleKeys` in that repo's
 * test/style.test.ts). Preview images are duplicated into public/styles/ since
 * this Next.js app is a separate deploy with no access to the root repo's files
 * at runtime.
 */
export interface StyleOption {
  key: string;
  label: string;
  blurb: string;
  /** /styles/<key>.jpg in public/ — a resized copy of the engine's style-ref.png. */
  previewSrc: string;
}

export const STYLES: StyleOption[] = [
  {
    key: "graphic-novel-noir",
    label: "Graphic Novel Noir",
    blurb: "Moody ink and shadow — the original Ghostwriter house style.",
    previewSrc: "/styles/graphic-novel-noir.jpg",
  },
  {
    key: "manga-ink",
    label: "Manga Ink",
    blurb: "Clean black-and-white manga linework with screentone shading.",
    previewSrc: "/styles/manga-ink.jpg",
  },
  {
    key: "retro-halftone",
    label: "Retro Halftone",
    blurb: "Vintage newsprint halftone dots, bold and punchy.",
    previewSrc: "/styles/retro-halftone.jpg",
  },
  {
    key: "wuxia-manhua",
    label: "Wuxia Manhua",
    blurb: "Flowing martial-arts manhua linework for jianghu tales.",
    previewSrc: "/styles/wuxia-manhua.jpg",
  },
  {
    key: "japanese-anime",
    label: "Japanese Anime",
    blurb: "Bright, expressive anime-style cel shading.",
    previewSrc: "/styles/japanese-anime.jpg",
  },
];

export const GENRES = [
  { key: "funny", label: "Funny" },
  { key: "horror", label: "Horror" },
  { key: "wuxia", label: "Wuxia" },
  { key: "both", label: "Funny + Horror" },
] as const;

export const CADENCE_PRESETS = [
  { key: "daily", label: "Daily" },
  { key: "every-2-days", label: "Every 2 days" },
  { key: "weekly", label: "Weekly" },
] as const;

export type CadencePreset = (typeof CADENCE_PRESETS)[number]["key"];

/** The engine's cadence is a fixed weekday set (see tenant.cadence in
 *  src/db/schema.ts), not a rolling "every N days" cycle — approximate presets
 *  as fixed weekly patterns. `signupDay` (0=Sun..6=Sat) anchors only the
 *  "weekly" preset to the day the user actually signed up on; "every-2-days"
 *  is the same fixed Sun/Tue/Thu/Sat pattern the existing `singlish` tenant
 *  already uses, since 2-day spacing can't divide evenly into a 7-day week
 *  regardless of anchor day. */
export function cadenceDaysForPreset(preset: CadencePreset, signupDay: number): number[] {
  switch (preset) {
    case "daily":
      return [0, 1, 2, 3, 4, 5, 6];
    case "every-2-days":
      return [0, 2, 4, 6];
    case "weekly":
      return [signupDay];
  }
}
