import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { testDb, resetTables } from "./db-helpers.ts";
import { tenant } from "../src/db/schema.ts";
import { listActiveTenants, getTenant } from "../src/lib/tenant.ts";

const row = {
  id: "acme", ownerUserId: null, displayName: "ACME", styleKey: "manga-ink",
  niche: "n", genres: "funny" as const, autonomy: "review_each" as const,
  cadence: { days: [1, 3, 5], time: "09:00", tz: "Asia/Singapore" },
  publish: { instagram: { accountId: "ig1", handle: "acme", format: "4x5" as const } },
};

beforeEach(() => resetTables("tenant"));

test("getTenant maps a row to TenantConfig", async () => {
  await testDb.insert(tenant).values(row);
  const t = await getTenant("acme");
  assert.equal(t.id, "acme");
  assert.equal(t.autonomy, "review_each");
  assert.equal(t.publish.instagram?.handle, "acme");
  assert.equal(t.geminiKey, undefined);
  assert.equal(t.language, "en"); // column default when the row omits it
});

test("getTenant carries a non-default language", async () => {
  await testDb.insert(tenant).values({ ...row, id: "cn", language: "zh-Hans" });
  const t = await getTenant("cn");
  assert.equal(t.language, "zh-Hans");
});

test("getTenant throws for a missing id", async () => {
  await assert.rejects(() => getTenant("nope"), /no tenant/i);
});

test("getTenant rejects an unsafe id without querying", async () => {
  await assert.rejects(() => getTenant("../evil"), /unsafe tenant id/i);
});

test("listActiveTenants returns only active rows", async () => {
  await testDb.insert(tenant).values([row, { ...row, id: "paused", active: false }]);
  const ids = (await listActiveTenants()).map((t) => t.id);
  assert.deepEqual(ids, ["acme"]);
});
