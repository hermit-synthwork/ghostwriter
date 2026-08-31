import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPanelPrompt } from "../src/engine/art.ts";
import type { Story, Panel } from "../src/lib/story.ts";

const story = { title: "T", genre: "horror", panels: [{}, {}] } as unknown as Story;
const panel: Panel = {
  n: 2, scene: "a lift door opens on a dark corridor", camera: "wide",
  characters: ["Mara"], narration: null, dialogue: [], sfx: "DING",
};

test("buildPanelPrompt includes the style bible, scene, camera, SFX, and the no-lettering rule", () => {
  const p = buildPanelPrompt("HOUSE STYLE: ink and halftone", story, panel);
  assert.match(p, /HOUSE STYLE: ink and halftone/);
  assert.match(p, /a lift door opens on a dark corridor/);
  assert.match(p, /camera:\s*wide/i);
  assert.match(p, /DING/);
  assert.match(p, /no.*(speech balloons|lettering|text)/i);
  assert.match(p, /central vertical 80%/);
});
