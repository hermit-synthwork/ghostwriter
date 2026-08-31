import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveGeminiKey } from "../src/gemini.ts";

test("resolveGeminiKey prefers an explicit key over the env var", () => {
  assert.equal(resolveGeminiKey("explicit-123", "env-999"), "explicit-123");
});

test("resolveGeminiKey falls back to the env var", () => {
  assert.equal(resolveGeminiKey(undefined, "env-999"), "env-999");
});

test("resolveGeminiKey throws a key-last message when neither is set", () => {
  assert.throws(() => resolveGeminiKey(undefined, undefined), /GEMINI_API_KEY/);
});
