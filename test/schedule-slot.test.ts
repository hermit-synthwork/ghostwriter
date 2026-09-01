import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleSlot, zonedWallClockToUtc } from "../src/run.ts";
import type { TenantConfig } from "../src/lib/tenant.ts";

const t: TenantConfig = {
  id: "w", displayName: "W", styleKey: "wuxia-manhua", niche: "x",
  language: "zh-Hans", genres: "wuxia", autonomy: "scheduled",
  cadence: { days: [1, 3, 5], time: "09:00", tz: "Asia/Singapore" },
  publish: {},
};

test("scheduleSlot uses today's cadence.time when the trigger ran before it", () => {
  // 2026-09-07 00:00 UTC = 08:00 SGT (before 09:00)
  const slot = scheduleSlot(t, new Date("2026-09-07T00:00:00Z"));
  assert.deepEqual(slot, { at: "2026-09-07T09:00:00", tz: "Asia/Singapore" });
});

test("scheduleSlot falls back to ~2h out when the trigger ran after cadence.time", () => {
  // 2026-09-07 05:00 UTC = 13:00 SGT (after 09:00) → +2h → 15:00 SGT same day
  const slot = scheduleSlot(t, new Date("2026-09-07T05:00:00Z"));
  assert.equal(slot.tz, "Asia/Singapore");
  assert.equal(slot.at, "2026-09-07T15:00:00");
});

test("zonedWallClockToUtc converts a Singapore wall clock to the right instant", () => {
  // 09:00 Asia/Singapore (UTC+8, no DST) == 01:00 UTC
  assert.equal(
    zonedWallClockToUtc("2026-09-07T09:00:00", "Asia/Singapore").toISOString(),
    "2026-09-07T01:00:00.000Z",
  );
});
