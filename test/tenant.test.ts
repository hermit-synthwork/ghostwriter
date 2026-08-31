import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTenant, listTenants } from "../src/lib/tenant.ts";

test("loadTenant reads a tenant file and returns typed config", () => {
  const t = loadTenant("singlish");
  assert.equal(t.id, "singlish");
  assert.equal(t.genres, "funny");
  assert.equal(t.autonomy, "autonomous");
  assert.equal(t.publish.instagram?.format, "4x5");
});

test("loadTenant throws a clear error for a missing tenant", () => {
  assert.throws(() => loadTenant("nope"), /no tenant.*nope/i);
});

test("loadTenant rejects an unsafe id", () => {
  assert.throws(() => loadTenant("../evil"), /unsafe tenant id/i);
});

test("listTenants discovers configs and excludes local.json", () => {
  const ids = listTenants().map((t) => t.id);
  assert.ok(ids.includes("singlish"), `expected "singlish" in ${JSON.stringify(ids)}`);
  assert.ok(!ids.includes("local"), "local.json must not be a scheduled tenant");
});
