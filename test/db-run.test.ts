import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { testDb, resetTables } from "./db-helpers.ts";
import { tenant } from "../src/db/schema.ts";
import { resolveRunPlan } from "../src/run.ts";
import type { TenantConfig } from "../src/lib/tenant.ts";
import { createEpisode } from "../src/db/episodes.ts";

const mk = (o: Partial<TenantConfig>): TenantConfig => ({
  id: "t", displayName: "T", styleKey: "manga-ink", niche: "n", genres: "both",
  autonomy: "autonomous", cadence: { days: [1, 3, 5], time: "09:00", tz: "Asia/Singapore" },
  publish: {}, ...o,
});
const mon0930sg = new Date("2026-08-31T01:30:00Z"); // Monday 09:30 SGT

beforeEach(async () => {
  await resetTables("episode", "tenant");
  await testDb.insert(tenant).values({ ...mk({ id: "a" }), ownerUserId: null } as never);
});

test("resolveRunPlan includes a due tenant with no episode today", async () => {
  const plan = await resolveRunPlan([mk({ id: "a" })], mon0930sg);
  assert.equal(plan.length, 1);
  assert.ok(["funny", "horror"].includes(plan[0]!.genre));
});

test("resolveRunPlan honours a single-genre tenant", async () => {
  const plan = await resolveRunPlan([mk({ id: "a", genres: "funny" })], mon0930sg);
  assert.equal(plan.length, 1);
  assert.equal(plan[0]!.genre, "funny");
});

test("resolveRunPlan skips a tenant that already has an episode today", async () => {
  await createEpisode("a", { slug: "x", genre: "horror", title: "X", logline: "l", panels: [{}, {}] } as never);
  const plan = await resolveRunPlan([mk({ id: "a" })], mon0930sg);
  assert.deepEqual(plan, []);
});

test("resolveRunPlan skips a non-scheduled weekday", async () => {
  const tue = new Date("2026-09-01T01:30:00Z");
  assert.deepEqual(await resolveRunPlan([mk({ id: "a" })], tue), []);
});

// Real-world caveat (documented, not fixed in A): recentEpisodes returns `date` in
// UTC while isDue's cadence gate is judged in tenant-local time. For a tenant near a
// date boundary those can disagree — a sub-project-B refinement. See the
// `// TODO(B): compare dates in tenant tz` comment at the recentEpisodes call in run.ts.
