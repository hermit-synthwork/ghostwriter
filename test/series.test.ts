import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSeries, listSeriesKeys, canonicalNames, localName } from "../src/lib/series.ts";
import { validateSeriesStory, type Story, type Panel } from "../src/lib/story.ts";

test("resolveSeries loads the tidebreaker canon with committed sheets", () => {
  const s = resolveSeries("tidebreaker");
  assert.equal(s.title.en, "TIDEBREAKER");
  assert.equal(s.styleKey, "mecha-anime");
  assert.equal(s.hasSheets, true);
  assert.match(s.bible, /Kaigan Port/);
  assert.ok(s.cast.some((c) => c.name === "Hana"));
  assert.ok(s.mechs.some((m) => m.name === "Ashgull"));
  assert.ok(listSeriesKeys().includes("tidebreaker"));
});

test("canonicalNames and localName cover cast and frames; guests keep their name", () => {
  const s = resolveSeries("tidebreaker");
  assert.ok(canonicalNames(s).includes("PIPPA"));
  assert.ok(canonicalNames(s).includes("Halcyon"));
  assert.equal(localName(s, "Hana", "zh"), "花");
  assert.equal(localName(s, "Hana", "ja"), "ハナ");
  assert.equal(localName(s, "Dock Clerk", "ja"), "Dock Clerk");
});

test("resolveSeries throws for unknown or unsafe keys", () => {
  assert.throws(() => resolveSeries("nope"), /unknown series.*nope/i);
  assert.throws(() => resolveSeries("../styles"), /unsafe series key/);
});

const canon = { names: ["Hana", "Gen", "PIPPA", "Yui", "Ashgull", "Halcyon"], maxGuests: 1 };

function panel(n: number, over: Partial<Panel> = {}): Panel {
  return {
    n, scene: "Ashgull braces on the storm wall", camera: "wide", characters: ["Hana", "Ashgull"],
    narration: null, narration_pos: "top",
    dialogue: [{ speaker: "Hana", text: "Hold the wall!", zh: "守住防波墙！", ja: "壁を守って！", bubble_pos: [0.5, 0.88] }],
    ...over,
  };
}

function story(over: Partial<Story> = {}): Story {
  return {
    date: "2026-09-15", slug: "the-last-pilot-quits", genre: "drama", title: "The Last Pilot Quits",
    title_zh: "最后的驾驶员", title_ja: "最後のパイロット", logline: "A rookie climbs in.",
    series: { episode: 1, beat: "beat 1", recap: "Hana held the wall.", cliffhanger: "Who was piloting?" },
    cast: [{ name: "Hana", description: "d", visual_tags: ["t"] }],
    panels: Array.from({ length: 6 }, (_, i) => panel(i + 1)),
    caption: "Hold the wall.", caption_zh: "守住防波墙。", caption_ja: "壁を守れ。",
    hashtags: ["mecha", "anime"],
    ...over,
  };
}

test("validateSeriesStory accepts a well-formed serialized episode", () => {
  assert.doesNotThrow(() => validateSeriesStory(story(), canon));
});

test("an all-kanji Japanese line is fine when the episode's Japanese has kana elsewhere", () => {
  const s = story();
  s.panels[0]!.dialogue[0]!.ja = "了解。";
  assert.doesNotThrow(() => validateSeriesStory(s, canon));
});

test("validateSeriesStory rejects missing or copied-over Japanese", () => {
  const missing = story();
  delete missing.panels[1]!.dialogue[0]!.ja;
  assert.throws(() => validateSeriesStory(missing, canon), /missing ja/);

  const copied = story();
  copied.panels[2]!.dialogue[0]!.ja = copied.panels[2]!.dialogue[0]!.zh!;
  assert.throws(() => validateSeriesStory(copied, canon), /ja is identical to zh/);

  const chineseAsJapanese = story({ caption_ja: "守住墙。" });
  chineseAsJapanese.panels.forEach((p, i) => { p.dialogue[0]!.ja = `准备出发${i}`; });
  assert.throws(() => validateSeriesStory(chineseAsJapanese, canon), /no kana/);
});

test("validateSeriesStory enforces 6-8 panels, 2 lines per panel, and one guest", () => {
  assert.throws(() => validateSeriesStory(story({ panels: [1, 2, 3, 4, 5].map((n) => panel(n)) }), canon), /series panels must be 6-8/);

  const chatty = story();
  const line = chatty.panels[0]!.dialogue[0]!;
  chatty.panels[0]!.dialogue = [line, line, line];
  assert.throws(() => validateSeriesStory(chatty, canon), /at most 2 dialogue lines/);

  const crowded = story({
    cast: [
      { name: "Hana", description: "d", visual_tags: ["t"] },
      { name: "Dock Clerk", description: "d", visual_tags: ["t"] },
      { name: "Fish Seller", description: "d", visual_tags: ["t"] },
    ],
  });
  assert.throws(() => validateSeriesStory(crowded, canon), /at most 1 guest/);
});

test("validateSeriesStory requires narration translations and series metadata", () => {
  const narrated = story();
  narrated.panels[0]!.narration = "The storm hit at midnight.";
  assert.throws(() => validateSeriesStory(narrated, canon), /missing narration_zh/);

  assert.throws(() => validateSeriesStory(story({ series: undefined }), canon), /missing series\.episode/);
  assert.throws(() => validateSeriesStory(story({ genre: "horror" }), canon), /drama or funny/);
});
