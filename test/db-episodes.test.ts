import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { testDb, resetTables } from "./db-helpers.ts";
import { tenant } from "../src/db/schema.ts";
import {
  createEpisode, setEpisodeStatus, getEpisode, recentEpisodes, nextEpisodeNumber, seriesRecap, latestEpisodeStatus,
} from "../src/db/episodes.ts";
import type { Story } from "../src/lib/story.ts";

const story = {
  date: "2026-08-31", slug: "kopi-run", genre: "funny", title: "Kopi Run",
  logline: "x", cast: [{ name: "A", description: "d", visual_tags: ["t"] }],
  panels: Array.from({ length: 6 }, (_, i) => ({
    n: i + 1, scene: "s", camera: "wide", characters: [], narration: null, dialogue: [],
  })),
  caption: "c", hashtags: ["sg"],
} as unknown as Story;

beforeEach(async () => {
  await resetTables("episode", "tenant");
  await testDb.insert(tenant).values({
    id: "acme", displayName: "A", styleKey: "manga-ink", niche: "n",
    genres: "funny", autonomy: "review_each",
    cadence: { days: [1], time: "09:00", tz: "UTC" }, publish: {},
  });
});

test("createEpisode inserts a generating row with a blob prefix", async () => {
  const { id, blobPrefix } = await createEpisode("acme", story);
  assert.match(blobPrefix, new RegExp(`^episodes/acme/${id}$`));
  const row = await getEpisode(id);
  assert.equal(row.status, "generating");
  assert.equal(row.slug, "kopi-run");
  assert.equal(row.title, "Kopi Run");
});

test("setEpisodeStatus patches caption/hashtags/status", async () => {
  const { id } = await createEpisode("acme", story);
  await setEpisodeStatus(id, "ready", { caption: "final", hashtags: ["#sg", "#kopi"] });
  const row = await getEpisode(id);
  assert.equal(row.status, "ready");
  assert.equal(row.caption, "final");
  assert.deepEqual(row.hashtags, ["#sg", "#kopi"]);
});

test("nextEpisodeNumber counts live episodes; a failed one frees its number", async () => {
  assert.equal(await nextEpisodeNumber("acme"), 1);
  const one = await createEpisode("acme", story, { episodeNumber: 1 });
  assert.equal(await nextEpisodeNumber("acme"), 2);
  await setEpisodeStatus(one.id, "failed", { error: "boom" });
  assert.equal(await nextEpisodeNumber("acme"), 1);
});

test("seriesRecap returns only canon episodes, oldest first, with the stored recap", async () => {
  const mk = async (n: number, status: "posted" | "approved" | "ready" | "rejected") => {
    const { id } = await createEpisode("acme", { ...story, slug: `ep-${n}`, title: `EP${n}` }, { episodeNumber: n });
    await setEpisodeStatus(id, status, {
      storyJson: { ...story, series: { episode: n, beat: "b", recap: `recap ${n}`, cliffhanger: n === 2 ? "hook" : null } },
    });
  };
  await mk(1, "posted");
  await mk(2, "approved");
  await mk(3, "ready");
  await mk(4, "rejected");
  const recap = await seriesRecap("acme", 4);
  assert.deepEqual(recap, [
    { episode: 1, title: "EP1", recap: "recap 1", cliffhanger: null },
    { episode: 2, title: "EP2", recap: "recap 2", cliffhanger: "hook" },
  ]);
});

test("latestEpisodeStatus reports the newest episode's status", async () => {
  assert.equal(await latestEpisodeStatus("acme"), null);
  const { id } = await createEpisode("acme", story);
  assert.equal(await latestEpisodeStatus("acme"), "generating");
  await setEpisodeStatus(id, "ready");
  assert.equal(await latestEpisodeStatus("acme"), "ready");
});

test("recentEpisodes returns newest-first meta", async () => {
  const a = await createEpisode("acme", { ...story, slug: "a", title: "A" });
  const b = await createEpisode("acme", { ...story, slug: "b", title: "B" });
  const meta = await recentEpisodes("acme", 5);
  assert.equal(meta[0]!.title, "B");
  assert.equal(meta[1]!.title, "A");
  assert.match(meta[0]!.date, /^\d{4}-\d{2}-\d{2}$/);
});
