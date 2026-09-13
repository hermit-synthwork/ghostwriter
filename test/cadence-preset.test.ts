import { test } from "node:test";
import assert from "node:assert/strict";
import { cadenceDaysForPreset } from "../web/lib/styles.ts";

test("daily posts every day of the week", () => {
  assert.deepEqual(cadenceDaysForPreset("daily", 3), [0, 1, 2, 3, 4, 5, 6]);
});

test("every-2-days is the fixed Sun/Tue/Thu/Sat pattern regardless of signup day", () => {
  assert.deepEqual(cadenceDaysForPreset("every-2-days", 0), [0, 2, 4, 6]);
  assert.deepEqual(cadenceDaysForPreset("every-2-days", 5), [0, 2, 4, 6]);
});

test("weekly posts on the signup weekday", () => {
  assert.deepEqual(cadenceDaysForPreset("weekly", 4), [4]);
});
