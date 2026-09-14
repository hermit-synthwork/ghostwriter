import { readFileSync } from "node:fs";
import { join } from "node:path";
import satori, { type SatoriOptions } from "satori";
import type { ReactNode } from "react";
import { REPO_ROOT } from "./env.ts";
import type { Panel, Story } from "./story.ts";
import type { StyleTokens } from "./style.ts";

type SatoriFont = SatoriOptions["fonts"][number];

/** Brand/colour info the overlay needs, resolved from a tenant + its style. */
export interface OverlayBrand {
  displayName: string;
  handle: string;
  tokens: StyleTokens;
  /** Tenant language ("en" | "zh-Hans"); picks the burned-in lettering face. */
  lang?: string;
}

/** One dialogue line's subtitles, speaker names already localized. */
export interface SubtitlePair {
  zh: string;
  ja: string;
}

/**
 * Serialized lines: English stays in the bubbles; translations go in a subtitle
 * strip at the bottom and under the narration. Passing options switches the
 * panel to that layout (narration pinned top, dialogue + strip bottom).
 */
export interface OverlayOptions {
  subtitles: SubtitlePair[];
  narration?: { zh: string | null; ja: string | null };
}

/** Rounded bold Simplified-Chinese comic face for the burned-in lettering of zh tenants. */
const ZCOOL_KUAILE = "ZCOOL KuaiLe";
/** Rounded Japanese face for subtitle lines. */
const MPLUS_ROUNDED = "M PLUS Rounded 1c";
const isCjk = (lang?: string): boolean => !!lang && lang.startsWith("zh");
/** Narration-box face: Chinese comic for zh tenants, else the Latin body face. */
const bodyFace = (lang?: string): string => (isCjk(lang) ? ZCOOL_KUAILE : "Comic Neue");
/** Speech-bubble + speaker-label face: Chinese comic for zh tenants, else the Latin display face. */
const displayFace = (lang?: string): string => (isCjk(lang) ? ZCOOL_KUAILE : "Bangers");

/** `#RRGGBB` → `rgba(r, g, b, a)`. Used to render the narration box as a scrim
 * so the artwork reads through it instead of being covered by a solid slab. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ----------------------------- fonts ----------------------------- */

const FONT_DIR_BANGERS = join(REPO_ROOT, "node_modules/@fontsource/bangers/files");
const FONT_DIR_COMIC = join(REPO_ROOT, "node_modules/@fontsource/comic-neue/files");
const FONT_DIR_ZCOOL = join(REPO_ROOT, "node_modules/@fontsource/zcool-kuaile/files");
const FONT_DIR_MPLUS = join(REPO_ROOT, "node_modules/@fontsource/m-plus-rounded-1c/files");

let fontCache: SatoriFont[] | null = null;
let jaFontCache: SatoriFont[] | null = null;

function fonts(): SatoriFont[] {
  if (fontCache) return fontCache;
  const cjk = readFileSync(join(FONT_DIR_ZCOOL, "zcool-kuaile-chinese-simplified-400-normal.woff"));
  fontCache = [
    {
      name: "Bangers",
      data: readFileSync(join(FONT_DIR_BANGERS, "bangers-latin-400-normal.woff")),
      weight: 400,
      style: "normal",
    },
    {
      name: "Comic Neue",
      data: readFileSync(join(FONT_DIR_COMIC, "comic-neue-latin-400-normal.woff")),
      weight: 400,
      style: "normal",
    },
    {
      name: "Comic Neue",
      data: readFileSync(join(FONT_DIR_COMIC, "comic-neue-latin-700-normal.woff")),
      weight: 700,
      style: "normal",
    },
    { name: ZCOOL_KUAILE, data: cjk, weight: 400, style: "normal" },
    { name: ZCOOL_KUAILE, data: cjk, weight: 700, style: "normal" },
  ];
  return fontCache;
}

/** The Japanese face is only read from disk when a panel actually has Japanese subtitles. */
function fontsWithJapanese(): SatoriFont[] {
  if (!jaFontCache) {
    jaFontCache = [
      ...fonts(),
      {
        name: MPLUS_ROUNDED,
        data: readFileSync(join(FONT_DIR_MPLUS, "m-plus-rounded-1c-japanese-700-normal.woff")),
        weight: 700,
        style: "normal",
      },
    ];
  }
  return jaFontCache;
}

/* -------------------------- hyperscript -------------------------- */
/* satori accepts a React-like element tree; we build it without JSX. */

type El = { type: string; props: Record<string, unknown> };

function el(
  type: string,
  props: Record<string, unknown> = {},
  ...children: (El | string | null | false | undefined)[]
): El {
  const kids = children.filter((c): c is El | string => c !== null && c !== false && c !== undefined);
  return { type, props: { ...props, children: kids.length === 1 ? kids[0] : kids } };
}

/* ----------------------------- pieces ----------------------------- */

const MARGIN = 48;

function chip(text: string, tokens: StyleTokens, extra: Record<string, unknown> = {}): El {
  return el(
    "div",
    {
      style: {
        display: "flex",
        background: tokens.ink,
        color: tokens.paper,
        fontFamily: "Bangers",
        fontSize: 30,
        letterSpacing: 1,
        padding: "6px 16px",
        borderRadius: 8,
        ...extra,
      },
    },
    text,
  );
}

function narrationBox(
  text: string,
  atTop: boolean,
  w: number,
  h: number,
  bottomSafe: number,
  tokens: StyleTokens,
  lang?: string,
  translations?: { zh: string | null; ja: string | null },
): El {
  const sub = (line: string | null, face: string, size: number): El | null =>
    line
      ? el(
          "div",
          { style: { display: "flex", color: tokens.paper, fontFamily: face, fontWeight: 700, fontSize: size, lineHeight: 1.35, opacity: 0.9 } },
          line,
        )
      : null;
  return el(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "absolute",
        left: MARGIN,
        width: w - MARGIN * 2,
        [atTop ? "top" : "bottom"]: atTop ? 120 : bottomSafe + 20,
        background: hexToRgba(tokens.ink, 0.8),
        borderLeft: `6px solid ${tokens.accent}`,
        borderRadius: 8,
        padding: "22px 30px",
      },
    },
    el(
      "div",
      {
        style: {
          display: "flex",
          color: tokens.paper,
          fontFamily: bodyFace(lang),
          fontWeight: 700,
          fontSize: isCjk(lang) ? 36 : 39,
          lineHeight: isCjk(lang) ? 1.4 : 1.28,
        },
      },
      text,
    ),
    translations ? sub(translations.zh, ZCOOL_KUAILE, 28) : null,
    translations ? sub(translations.ja, MPLUS_ROUNDED, 26) : null,
  );
}

/**
 * One speech bubble (speaker label + rounded bubble). Carries no position —
 * `dialogueBand` stacks these inside a reserved top/bottom band so nothing
 * ever lands over a face or the key action.
 */
function speechBubble(speaker: string, text: string, maxW: number, tokens: StyleTokens, lang?: string): El {
  return el(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        maxWidth: maxW,
      },
    },
    speaker
      ? el(
          "div",
          {
            style: {
              display: "flex",
              fontFamily: displayFace(lang),
              fontSize: isCjk(lang) ? 28 : 22,
              background: tokens.ink,
              color: tokens.accent,
              letterSpacing: isCjk(lang) ? 0 : 1,
              padding: "2px 12px",
              borderRadius: 6,
              marginBottom: 4,
            },
          },
          isCjk(lang) ? speaker : speaker.toUpperCase(),
        )
      : null,
    el(
      "div",
      {
        style: {
          display: "flex",
          background: tokens.paper,
          border: `4px solid ${tokens.ink}`,
          borderRadius: 26,
          padding: "16px 26px",
          fontFamily: displayFace(lang),
          fontSize: isCjk(lang) ? 36 : 40,
          lineHeight: isCjk(lang) ? 1.45 : 1.15,
          color: tokens.ink,
          letterSpacing: isCjk(lang) ? 1 : 0.5,
          textAlign: "center",
        },
      },
      text,
    ),
  );
}

/**
 * Stack every speech bubble of a panel inside one reserved band. Band choice:
 * opposite to a narration box if the panel has one, else the top/bottom hinted
 * by the first bubble_pos y. Bubbles never float over the central art.
 */
function dialogueBand(
  dialogue: NonNullable<Panel["dialogue"]>,
  w: number,
  tokens: StyleTokens,
  topNarr: boolean,
  botNarr: boolean,
  lang?: string,
): El {
  // The art model keeps the bottom band calm but routinely composes heads into the
  // top ~20%, so bubbles hinted there still land on faces. Always prefer the bottom;
  // only go top when a narration box already owns it. bubble_pos y is ignored.
  const band: "top" | "bottom" = botNarr ? "top" : "bottom";
  const maxW = Math.min(760, w - MARGIN * 2);
  return el(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        position: "absolute",
        left: MARGIN,
        width: w - MARGIN * 2,
        ...(band === "top" ? { top: topNarr ? 300 : 128 } : { bottom: botNarr ? 300 : 128 }),
      },
    },
    ...dialogue.map((d) => speechBubble(d.speaker ?? "", d.text, maxW, tokens, lang)),
  );
}

/** Full-width scrim with each dialogue line's Chinese row then Japanese row. */
function subtitleStrip(pairs: SubtitlePair[], w: number, tokens: StyleTokens): El {
  const row = (text: string, face: string, size: number): El =>
    el(
      "div",
      { style: { display: "flex", color: tokens.paper, fontFamily: face, fontWeight: 700, fontSize: size, lineHeight: 1.3 } },
      text,
    );
  return el(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 4,
        width: w - MARGIN * 2,
        background: hexToRgba(tokens.ink, 0.8),
        borderTop: `3px solid ${tokens.accent}`,
        borderRadius: 8,
        padding: "12px 22px",
      },
    },
    ...pairs.flatMap((p) => [row(p.zh, ZCOOL_KUAILE, 28), row(p.ja, MPLUS_ROUNDED, 26)]),
  );
}

/** Serialized layout: English bubbles stacked directly above the subtitle strip, bottom-anchored. */
function subtitledDialogueColumn(
  dialogue: NonNullable<Panel["dialogue"]>,
  pairs: SubtitlePair[],
  w: number,
  bottomSafe: number,
  tokens: StyleTokens,
): El {
  const maxW = Math.min(760, w - MARGIN * 2);
  return el(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        position: "absolute",
        left: MARGIN,
        width: w - MARGIN * 2,
        bottom: bottomSafe + 8,
      },
    },
    ...dialogue.map((d) => speechBubble(d.speaker ?? "", d.text, maxW, tokens)),
    pairs.length ? subtitleStrip(pairs, w, tokens) : null,
  );
}

/* ----------------------------- render ----------------------------- */

export async function renderOverlaySvg(
  panel: Panel,
  story: Story,
  brand: OverlayBrand,
  size: { w: number; h: number },
  opts?: OverlayOptions,
): Promise<string> {
  const { w, h } = size;
  const { tokens } = brand;
  const bottomSafe = 84; // reserved band for watermark + page counter
  const children: (El | null)[] = [];

  // header — always rendered
  children.push(
    el(
      "div",
      { style: { display: "flex", position: "absolute", top: 36, left: MARGIN } },
      chip(brand.displayName, tokens),
    ),
  );

  const dl = panel.dialogue ?? [];

  if (opts) {
    // Serialized layout: narration always top (with translations), bubbles + subtitles bottom.
    if (panel.narration) {
      children.push(narrationBox(panel.narration, true, w, h, bottomSafe, tokens, undefined, opts.narration));
    }
    if (dl.length) {
      children.push(subtitledDialogueColumn(dl, opts.subtitles, w, bottomSafe, tokens));
    }
  } else {
    const topNarr = !!panel.narration && (panel.narration_pos ?? "top") === "top";
    const botNarr = !!panel.narration && panel.narration_pos === "bottom";

    if (panel.narration) {
      children.push(narrationBox(panel.narration, topNarr, w, h, bottomSafe, tokens, brand.lang));
    }
    if (dl.length) {
      children.push(dialogueBand(dl, w, tokens, topNarr, botNarr, brand.lang));
    }
  }

  // watermark — always rendered
  children.push(
    el(
      "div",
      {
        style: {
          display: "flex",
          position: "absolute",
          bottom: 28,
          left: 0,
          width: w,
          justifyContent: "center",
        },
      },
      chip(brand.handle, tokens, {
        fontFamily: "Comic Neue",
        fontWeight: 700,
        fontSize: 24,
        opacity: 0.85,
      }),
    ),
  );

  // page counter — always rendered. Bold Comic Neue, not Bangers: in Bangers a
  // "7" is nearly indistinguishable from a "1" at chip size.
  children.push(
    el(
      "div",
      { style: { display: "flex", position: "absolute", bottom: 28, right: MARGIN } },
      chip(`${panel.n}/${story.panels.length}`, tokens, { fontFamily: "Comic Neue", fontWeight: 700, fontSize: 28 }),
    ),
  );

  const root = el(
    "div",
    {
      style: {
        display: "flex",
        position: "relative",
        width: w,
        height: h,
      },
    },
    ...children,
  );

  const needsJapanese = !!opts && (opts.subtitles.some((p) => p.ja) || !!opts.narration?.ja);
  return satori(root as unknown as ReactNode, {
    width: w,
    height: h,
    fonts: needsJapanese ? fontsWithJapanese() : fonts(),
  });
}
