import { test } from "node:test";
import assert from "node:assert/strict";
import { isDue } from "../src/lib/tenant.ts";
import type { TenantConfig } from "../src/lib/tenant.ts";

const base: TenantConfig = {
  id: "t", displayName: "T", styleKey: "graphic-novel-noir", niche: "x",
  genres: "horror", autonomy: "autonomous",
  cadence: { days: [1, 3, 5], time: "09:00", tz: "Asia/Singapore" },
  publish: {},
};

// 2026-08-31 is a Monday. 01:30 UTC = 09:30 Asia/Singapore.
const monday0930sg = new Date("2026-08-31T01:30:00Z");
const monday0830sg = new Date("2026-08-31T00:30:00Z");
const tuesday0930sg = new Date("2026-09-01T01:30:00Z");

test("due on a scheduled weekday after the scheduled time, no episode yet", () => {
  assert.equal(isDue(base, monday0930sg, null), true);
});

test("not due before the scheduled time", () => {
  assert.equal(isDue(base, monday0830sg, null), false);
});

test("not due on a non-scheduled weekday", () => {
  assert.equal(isDue(base, tuesday0930sg, null), false);
});

test("not due if an episode already exists for today (tenant local date)", () => {
  assert.equal(isDue(base, monday0930sg, "2026-08-31"), false);
});

test("due if the last episode was a previous day", () => {
  assert.equal(isDue(base, monday0930sg, "2026-08-28"), true);
});
