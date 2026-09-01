import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStoryMessages } from "../src/write-story.ts";

test("buildStoryMessages embeds genre, niche, the style bible, and the JSON schema", () => {
  const { system, user } = buildStoryMessages({
    genre: "horror",
    niche: "night shift workers",
    styleKey: "graphic-novel-noir",
    priorTitles: ["The Vending Machine"],
  });
  assert.match(system, /6[–-]8 panels/);
  assert.match(system, /"bubble_pos"/);
  assert.match(system, /PG-13/i);
  assert.match(user, /night shift workers/);
  assert.match(user, /horror/);
  assert.match(user, /The Vending Machine/);        // avoid repeating a prior title
  assert.match(user, /house style/i);               // style bible is included
});

test("buildStoryMessages carries wuxia guidance and the wuxia genre word", () => {
  const { system, user } = buildStoryMessages({
    genre: "wuxia",
    niche: "jianghu sword-and-honour vignettes",
    styleKey: "wuxia-manhua",
    priorTitles: [],
  });
  assert.match(system, /6[–-]8 panels/);            // shared anchor unchanged
  assert.match(system, /"bubble_pos"/);             // shared anchor unchanged
  assert.match(system, /wuxia/);
  assert.match(system, /bloodless/);
  assert.match(system, /horror\|funny\|wuxia/);     // JSON shape line
  assert.match(user, /wuxia/);
  assert.match(user, /jianghu sword-and-honour vignettes/);
});
