import { test } from "node:test";
import assert from "node:assert/strict";
import { eligibleForApprovedPublish } from "../src/engine/publish.ts";

test("approved episode on a review_each tenant is eligible", () => {
  assert.equal(eligibleForApprovedPublish("approved", "review_each"), true);
});

test("approved episode on a review_weekly tenant is eligible", () => {
  assert.equal(eligibleForApprovedPublish("approved", "review_weekly"), true);
});

test("approved episode on an autonomous tenant is NOT eligible (its draft already lives in Zernio)", () => {
  assert.equal(eligibleForApprovedPublish("approved", "autonomous"), false);
});

test("approved episode on a scheduled tenant is NOT eligible", () => {
  assert.equal(eligibleForApprovedPublish("approved", "scheduled"), false);
});

test("a non-approved status is never eligible, whatever the autonomy", () => {
  for (const s of ["generating", "ready", "scheduled", "posted", "failed", "rejected"]) {
    assert.equal(eligibleForApprovedPublish(s, "review_each"), false, `${s} should not be eligible`);
  }
});
