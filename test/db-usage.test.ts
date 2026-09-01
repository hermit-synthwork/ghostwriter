import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { testDb, resetTables } from "./db-helpers.ts";
import { tenant } from "../src/db/schema.ts";
import { estimateCents, logUsage } from "../src/lib/usage.ts";

beforeEach(async () => {
  await resetTables("usage_event", "tenant");
  await testDb.insert(tenant).values({
    id: "acme", displayName: "A", styleKey: "manga-ink", niche: "n",
    genres: "funny", autonomy: "review_each",
    cadence: { days: [1], time: "09:00", tz: "UTC" }, publish: {},
  });
});

test("estimateCents unchanged (10 images ≈ 30c, 3200 tokens = 1c, post = 0)", () => {
  assert.equal(estimateCents("image", 10), 30);
  assert.equal(estimateCents("story_tokens", 3200), 1);
  assert.equal(estimateCents("post", 1), 0);
});

test("logUsage inserts a row with computed cost", async () => {
  await logUsage("acme", { kind: "image", qty: 8, keyOwner: "platform" });
  const rows = await testDb.execute(sql`select kind, qty, cost_cents, key_owner from usage_event`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.cost_cents, 24);
});

test("tenant-owned image key logs zero platform cost", async () => {
  await logUsage("acme", { kind: "image", qty: 8, keyOwner: "tenant" });
  const rows = await testDb.execute(sql`select cost_cents from usage_event`);
  assert.equal(rows[0]!.cost_cents, 0);
});
