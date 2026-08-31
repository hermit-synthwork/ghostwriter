import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../src/lib/env.ts";
import { estimateCents, logUsage, readUsage } from "../src/lib/usage.ts";

afterEach(() => rmSync(join(REPO_ROOT, "usage", "unit-t.jsonl"), { force: true }));

test("estimateCents: 10 images at ~$0.03 each ≈ 30c", () => {
  assert.equal(estimateCents("image", 10), 30);
});

test("estimateCents: story tokens billed per-1k, rounded up", () => {
  assert.equal(estimateCents("story_tokens", 3200), 1); // <= 1c floor for a short story
});

test("logUsage appends a JSONL line that readUsage parses back", () => {
  logUsage("unit-t", { kind: "image", qty: 8, keyOwner: "platform" });
  logUsage("unit-t", { kind: "post", qty: 2, keyOwner: "platform" });
  const rows = readUsage("unit-t");
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.kind, "image");
  assert.equal(rows[0]!.qty, 8);
  assert.equal(rows[0]!.costCents, 24);
  assert.equal(rows[1]!.kind, "post");
});

test("logUsage rejects a tenantId with path separators", () => {
  assert.throws(() => logUsage("../evil", { kind: "post", qty: 1, keyOwner: "platform" }), /invalid tenantId/);
});
