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

/** Rounded bold Simplified-Chinese comic face for the burned-in lettering of zh tenants. */
const ZCOOL_KUAILE = "ZCOOL KuaiLe";
const isCjk = (lang?: string): boolean => !!lang && lang.startsWith("zh");
/** Narration-box face: Chinese comic for zh tenants, else the Latin body face. */
const bodyFace = (lang?: string): string => (isCjk(lang) ? ZCOOL_KUAILE : "Comic Neue");
/** Speech-bubble + speaker-label face: Chinese comic for zh tenants, else the Latin display face. */
const displayFace = (lang?: string): string => (isCjk(lang) ? ZCOOL_KUAILE : "Bangers");

/* ----------------------------- fonts ----------------------------- */

const FONT_DIR_BANGERS = join(REPO_ROOT, "node_modules/@fontsource/bangers/files");
const FONT_DIR_COMIC = join(REPO_ROOT, "node_modules/@fontsource/comic-neue/files");
const FONT_DIR_ZCOOL = join(REPO_ROOT, "node_modules/@fontsource/zcool-kuaile/files");

let fontCache: SatoriFont[] | null = null;

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
): El {
  return el(
    "div",
    {
      style: {
        display: "flex",
        position: "absolute",
        left: MARGIN,
        width: w - MARGIN * 2,
        [atTop ? "top" : "bottom"]: atTop ? 120 : bottomSafe + 20,
        background: tokens.ink,
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

/* ----------------------------- render ----------------------------- */

export async function renderOverlaySvg(
  panel: Panel,
  story: Story,
  brand: OverlayBrand,
  size: { w: number; h: number },
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

  const topNarr = !!panel.narration && (panel.narration_pos ?? "top") === "top";
  const botNarr = !!panel.narration && panel.narration_pos === "bottom";

  if (panel.narration) {
    children.push(narrationBox(panel.narration, topNarr, w, h, bottomSafe, tokens, brand.lang));
  }

  const dl = panel.dialogue ?? [];
  if (dl.length) {
    children.push(dialogueBand(dl, w, tokens, topNarr, botNarr, brand.lang));
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

  // page counter — always rendered
  children.push(
    el(
      "div",
      { style: { display: "flex", position: "absolute", bottom: 28, right: MARGIN } },
      chip(`${panel.n}/${story.panels.length}`, tokens),
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

  return satori(root as unknown as ReactNode, { width: w, height: h, fonts: fonts() });
}
