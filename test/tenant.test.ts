import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTenant, listTenants } from "../src/lib/tenant.ts";

test("loadTenant reads a tenant file and returns typed config", () => {
  const t = loadTenant("demo-a");
  assert.equal(t.id, "demo-a");
  assert.equal(t.styleKey, "graphic-novel-noir");
  assert.equal(t.autonomy, "autonomous");
  assert.equal(t.publish.instagram?.format, "4x5");
});

test("loadTenant throws a clear error for a missing tenant", () => {
  assert.throws(() => loadTenant("nope"), /no tenant.*nope/i);
});

test("listTenants returns all configs including demo-a and demo-b", () => {
  const ids = listTenants().map((t) => t.id).sort();
  assert.deepEqual(ids, ["demo-a", "demo-b"]);
});
