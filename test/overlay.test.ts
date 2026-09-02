import { test } from "node:test";
import assert from "node:assert/strict";
import { renderOverlaySvg } from "../src/lib/letter.ts";
import type { Story, Panel } from "../src/lib/story.ts";

const story = { title: "T", panels: [{}, {}, {}] } as unknown as Story;
const tokens = { ink: "#0E0E10", paper: "#EDE7DB", accent: "#7A2E2E" };
const brand = { displayName: "NIGHT SHIFT", handle: "@nightshift", tokens };
const size = { w: 1080, h: 1350 };

const withText: Panel = {
  n: 2, scene: "", camera: "", characters: [],
  narration: "She should not have looked back.", narration_pos: "top",
  dialogue: [{ speaker: "Mara", text: "Hello?", bubble_pos: [0.5, 0.4] }],
};
const bare: Panel = { ...withText, narration: null, dialogue: [] };

test("renderOverlaySvg produces a sized SVG with rendered glyph paths", async () => {
  const svg = await renderOverlaySvg(withText, story, brand, size);
  assert.match(svg, /^<svg/);
  assert.match(svg, /width="1080"/);
  assert.match(svg, /height="1350"/);
  assert.match(svg, /<path/); // glyphs are rendered as vector outlines
});

test("narration + dialogue add rendered content to the overlay", async () => {
  const full = await renderOverlaySvg(withText, story, brand, size);
  const empty = await renderOverlaySvg(bare, story, brand, size);
  // header + watermark + counter are in both; narration box + speech bubble only in `full`
  assert.ok(full.length > empty.length + 500, `expected full (${full.length}) >> empty (${empty.length})`);
});

test("a zh-Hans brand renders Chinese lettering as glyph paths", async () => {
  const cnPanel: Panel = {
    n: 2, scene: "", camera: "", characters: [],
    narration: "铁鹤谱在三夜前从宗门密库消失。", narration_pos: "top",
    dialogue: [{ speaker: "胡长老", text: "坐下，姑娘。", bubble_pos: [0.5, 0.4] }],
  };
  const svg = await renderOverlaySvg(cnPanel, story, { ...brand, lang: "zh-Hans" }, size);
  assert.match(svg, /^<svg/);
  assert.match(svg, /<path/); // Han glyphs rendered as outlines, not tofu <rect>s
  const bare = await renderOverlaySvg({ ...cnPanel, narration: null, dialogue: [] }, story, { ...brand, lang: "zh-Hans" }, size);
  assert.ok(svg.length > bare.length + 500);
});

/** y of the speech bubble's paper-filled rounded rect (borderRadius 26). */
function bubbleY(svg: string): number {
  const m = svg.match(/<path x="\d+" y="(\d+)"[^>]*fill="#EDE7DB"[^>]*a26,26/);
  assert.ok(m, "no speech bubble found in overlay");
  return Number(m[1]);
}

test("dialogue lands in the bottom band even when bubble_pos hints the top", async () => {
  // The art model keeps the bottom calm but composes heads into the top ~20%,
  // so a top-hinted bubble used to cover faces. bubble_pos y is now ignored.
  const topHinted: Panel = {
    ...withText, narration: null,
    dialogue: [{ speaker: "Mara", text: "Hello?", bubble_pos: [0.5, 0.15] }],
  };
  const y = bubbleY(await renderOverlaySvg(topHinted, story, brand, size));
  assert.ok(y > size.h / 2, `expected bubble in bottom half, got y=${y} of ${size.h}`);
});

test("dialogue flips to the top band only when narration owns the bottom", async () => {
  const botNarr: Panel = {
    ...withText, narration: "She should not have looked back.", narration_pos: "bottom",
    dialogue: [{ speaker: "Mara", text: "Hello?", bubble_pos: [0.5, 0.88] }],
  };
  const y = bubbleY(await renderOverlaySvg(botNarr, story, brand, size));
  assert.ok(y < size.h / 2, `expected bubble in top half, got y=${y} of ${size.h}`);
});

test("the speaker label sits on a filled plate so it stays legible over dark art", async () => {
  const svg = await renderOverlaySvg(
    { ...withText, narration: null } as Panel, story, brand, size,
  );
  // ink-filled rounded rect at borderRadius 6 — the speaker chip behind "MARA"
  assert.match(svg, /<path x="\d+" y="\d+"[^>]*fill="#0E0E10"[^>]*a6,6/);
});
