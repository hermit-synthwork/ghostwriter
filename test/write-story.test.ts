import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStoryMessages } from "../src/write-story.ts";
import { resolveSeries } from "../src/lib/series.ts";

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
    language: "en",
    priorTitles: [],
  });
  assert.match(system, /6[–-]8 panels/);            // shared anchor unchanged
  assert.match(system, /"bubble_pos"/);             // shared anchor unchanged
  assert.match(system, /wuxia/);
  assert.match(system, /bloodless/);
  assert.match(system, /horror\|funny\|wuxia/);     // JSON shape line
  assert.match(user, /wuxia/);
  assert.match(user, /jianghu sword-and-honour vignettes/);
  assert.doesNotMatch(user, /简体中文/);            // no CJK instruction for en
});

test("the standalone prompt stays series-free", () => {
  const { system, user } = buildStoryMessages({
    genre: "funny", niche: "office life", styleKey: "manga-ink", priorTitles: [],
  });
  assert.match(system, /No recurring characters/);
  assert.doesNotMatch(system, /SERIES BIBLE/);
  assert.doesNotMatch(user, /Episode number/);
});

test("buildStoryMessages builds a serialized prompt with bible, canon, recap and translations", () => {
  const resolved = resolveSeries("tidebreaker");
  const { system, user } = buildStoryMessages({
    genre: "drama_funny",
    niche: "TIDEBREAKER",
    styleKey: resolved.styleKey,
    priorTitles: [],
    series: {
      resolved,
      episodeNumber: 3,
      recap: [
        { episode: 1, title: "The Last Pilot Quits", recap: "Hana held the wall.", cliffhanger: "Who was piloting?" },
        { episode: 2, title: "Rules of the Yard", recap: "PIPPA booted up.", cliffhanger: null },
      ],
    },
  });
  assert.match(system, /serialized/);
  assert.match(system, /"zh"/);
  assert.match(system, /"ja"/);
  assert.match(system, /drama\|funny/);
  assert.doesNotMatch(system, /No recurring characters/);
  assert.match(user, /Episode number: 3/);
  assert.match(user, /Kaigan Port/);                 // series bible
  assert.match(user, /"name": "Ashgull"/);           // canon JSON
  assert.match(user, /EP 1 · The Last Pilot Quits — Hana held the wall\. Ends on: Who was piloting\?/);
  assert.match(user, /EP 2 · Rules of the Yard/);
  assert.match(user, /mecha-anime \(FROZEN\)/);      // style bible
});

test("buildStoryMessages adds a Simplified-Chinese instruction for a zh tenant", () => {
  const { user } = buildStoryMessages({
    genre: "wuxia",
    niche: "jianghu vignettes",
    styleKey: "wuxia-manhua",
    language: "zh-Hans",
    priorTitles: [],
  });
  assert.match(user, /简体中文/);
  assert.match(user, /dialogue\.text/);   // names the reader-facing fields
  assert.match(user, /slug/i);            // slug stays ASCII
  assert.match(user, /scene/i);           // scene stays English
});
