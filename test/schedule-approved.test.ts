import { test } from "node:test";
import assert from "node:assert/strict";
import { eligibleForApprovedSweep } from "../src/engine/publish.ts";

test("approved episode on a review_each tenant is eligible", () => {
  assert.equal(eligibleForApprovedSweep("approved", "review_each"), true);
});

test("approved episode on a review_weekly tenant is eligible", () => {
  assert.equal(eligibleForApprovedSweep("approved", "review_weekly"), true);
});

test("approved episode on an autonomous tenant is NOT eligible (its draft already lives in Zernio)", () => {
  assert.equal(eligibleForApprovedSweep("approved", "autonomous"), false);
});

test("approved episode on a scheduled tenant is NOT eligible", () => {
  assert.equal(eligibleForApprovedSweep("approved", "scheduled"), false);
});

test("a non-approved status is never eligible, whatever the autonomy", () => {
  for (const s of ["generating", "ready", "scheduled", "posted", "failed", "rejected"]) {
    assert.equal(eligibleForApprovedSweep(s, "review_each"), false, `${s} should not be eligible`);
  }
});
