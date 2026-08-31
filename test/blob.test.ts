import { test } from "node:test";
import assert from "node:assert/strict";
import { panelBlobKey } from "../src/lib/blob.ts";

test("panelBlobKey builds the object path", () => {
  assert.equal(
    panelBlobKey("episodes/acme/abc-123", "4x5", 3),
    "episodes/acme/abc-123/final-4x5/03.jpg",
  );
});
