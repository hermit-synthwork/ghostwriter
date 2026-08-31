import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHashtags } from "../src/engine/review.ts";

test("formatHashtags collapses multi-word tags into single tokens", () => {
  assert.equal(
    formatHashtags(["horror comic", "#night shift horror", "quietDread"]),
    "#horrorcomic #nightshifthorror #quietDread",
  );
});

test("formatHashtags drops empties and stray punctuation", () => {
  assert.equal(formatHashtags(["  ", "!!!", "web-comic", "#"]), "#webcomic");
});
