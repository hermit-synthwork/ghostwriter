import { test } from "node:test";
import assert from "node:assert/strict";
import { selectTargets } from "../src/engine/publish.ts";
import type { TenantConfig } from "../src/lib/tenant.ts";

const t = {
  id: "x", displayName: "X", styleKey: "manga-ink", niche: "y", genres: "both",
  autonomy: "autonomous", cadence: { days: [1], time: "09:00", tz: "UTC" },
  publish: {
    instagram: { accountId: "ig1", handle: "ighandle", format: "4x5" },
    tiktok: { accountId: "tt1", handle: "tthandle", format: "9x16" },
  },
} as TenantConfig;

test("selectTargets returns all configured platforms by default", () => {
  assert.deepEqual(selectTargets(t).map((x) => x.platform).sort(), ["instagram", "tiktok"]);
});

test("selectTargets --only scopes to one platform", () => {
  assert.deepEqual(selectTargets(t, "tiktok").map((x) => x.platform), ["tiktok"]);
});

test("selectTargets throws when --only names an unconfigured platform", () => {
  assert.throws(() => selectTargets(t, "youtube"), /youtube/);
});
