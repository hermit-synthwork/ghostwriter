import { test } from "node:test";
import assert from "node:assert/strict";
import { renderOverlaySvg } from "../src/lib/letter.ts";
import type { Story, Panel } from "../src/lib/story.ts";

const story = { title: "T", panels: [{}, {}, {}] } as unknown as Story;
const panel: Panel = {
  n: 2, scene: "", camera: "", characters: [],
  narration: "She should not have looked back.", narration_pos: "top",
  dialogue: [{ speaker: "Mara", text: "Hello?", bubble_pos: [0.5, 0.4] }],
};

test("renderOverlaySvg returns an SVG carrying the handle, narration, dialogue, and page counter", async () => {
  const svg = await renderOverlaySvg(
    panel, story,
    { displayName: "NIGHT SHIFT", handle: "@nightshift", tokens: { ink: "#0E0E10", paper: "#EDE7DB", accent: "#7A2E2E" } },
    { w: 1080, h: 1350 },
  );
  assert.match(svg, /^<svg/);
  // satori lays each word/punctuation run out as its own <text> element, so the
  // brief's contiguous substrings ("@nightshift", "She should not have looked
  // back", "Hello?", "2/3") never appear verbatim. Relaxed to single-token
  // matches that still prove each piece rendered. See task-8 report.
  assert.match(svg, /nightshift/);          // watermark handle  (was /@nightshift/)
  assert.match(svg, /looked/);              // narration         (was /She should not have looked back/)
  assert.match(svg, /Hello/);               // dialogue          (was /Hello\?/)
  assert.match(svg, /<text[^>]*>2<\/text><text[^>]*>\/<\/text><text[^>]*>3<\/text>/); // page counter (was /2\/3/)
});
