import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStyle, listStyleKeys } from "../src/lib/style.ts";

test("resolveStyle returns bible text + tokens for a known style", () => {
  const s = resolveStyle("graphic-novel-noir");
  assert.match(s.bible, /house style/i);
  assert.equal(s.tokens.ink, "#0E0E10");
  assert.equal(s.hasRef, true);
  assert.match(s.refPath, /styles\/graphic-novel-noir\/style-ref\.png$/);
});

test("resolveStyle reports hasRef=false when the ref png is absent", () => {
  const s = resolveStyle("manga-ink");
  assert.equal(s.hasRef, false);
});

test("resolveStyle throws for an unknown style", () => {
  assert.throws(() => resolveStyle("bogus"), /unknown style.*bogus/i);
});

test("listStyleKeys includes the three shipped styles", () => {
  assert.deepEqual(
    listStyleKeys().sort(),
    ["graphic-novel-noir", "manga-ink", "retro-halftone"],
  );
});
