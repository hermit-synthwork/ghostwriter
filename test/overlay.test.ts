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
