import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRunPlan } from "../src/run.ts";
import type { TenantConfig } from "../src/lib/tenant.ts";

const mk = (over: Partial<TenantConfig>): TenantConfig => ({
  id: "t", displayName: "T", styleKey: "graphic-novel-noir", niche: "n",
  genres: "both", autonomy: "autonomous",
  cadence: { days: [1, 3, 5], time: "09:00", tz: "Asia/Singapore" }, publish: {}, ...over,
});

const mon0930sg = new Date("2026-08-31T01:30:00Z"); // Monday 09:30 SGT

test("resolveRunPlan includes due tenants and picks a genre", () => {
  const plan = resolveRunPlan([mk({ id: "a" })], mon0930sg);
  assert.equal(plan.length, 1);
  assert.equal(plan[0]!.tenantId, "a");
  assert.ok(["funny", "horror"].includes(plan[0]!.genre));
});

test("resolveRunPlan honours a single-genre tenant", () => {
  const plan = resolveRunPlan([mk({ id: "b", genres: "funny" })], mon0930sg);
  assert.equal(plan[0]!.genre, "funny");
});

test("resolveRunPlan skips a tenant not scheduled today", () => {
  const tue = new Date("2026-09-01T01:30:00Z");
  assert.deepEqual(resolveRunPlan([mk({ id: "c" })], tue), []);
});
