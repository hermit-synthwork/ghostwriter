import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveStyle, listStyleKeys, STYLES_DIR } from "../src/lib/style.ts";

const NOREF = join(STYLES_DIR, "__test-noref__");
afterEach(() => rmSync(NOREF, { recursive: true, force: true }));

test("resolveStyle returns bible text + tokens for a known style", () => {
  const s = resolveStyle("graphic-novel-noir");
  assert.match(s.bible, /house style/i);
  assert.equal(s.tokens.ink, "#0E0E10");
  assert.equal(s.hasRef, true);
  assert.match(s.refPath, /styles\/graphic-novel-noir\/style-ref\.png$/);
});

test("resolveStyle reports hasRef=false when the ref png is absent", () => {
  mkdirSync(NOREF, { recursive: true });
  writeFileSync(join(NOREF, "style-bible.md"), "# test\nno lettering\n");
  writeFileSync(join(NOREF, "tokens.json"), '{ "ink": "#000", "paper": "#fff", "accent": "#f00" }');
  const s = resolveStyle("__test-noref__");
  assert.equal(s.hasRef, false);
  assert.match(s.refPath, /__test-noref__\/style-ref\.png$/);
});

test("resolveStyle throws for an unknown style", () => {
  assert.throws(() => resolveStyle("bogus"), /unknown style.*bogus/i);
});

test("listStyleKeys includes the four shipped styles", () => {
  assert.deepEqual(
    listStyleKeys().sort(),
    ["graphic-novel-noir", "manga-ink", "retro-halftone", "wuxia-manhua"],
  );
});

test("resolveStyle returns bible + tokens for wuxia-manhua", () => {
  const s = resolveStyle("wuxia-manhua");
  assert.match(s.bible, /wuxia-manhua \(FROZEN\)/);
  assert.equal(s.tokens.ink, "#1B1712");
  assert.equal(s.tokens.paper, "#EDE3D1");
  assert.equal(s.tokens.accent, "#B83B24");
});

test("wuxia-manhua has a committed style-ref", () => {
  assert.equal(resolveStyle("wuxia-manhua").hasRef, true);
});
