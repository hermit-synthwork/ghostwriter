import { test } from "node:test";
import assert from "node:assert/strict";
import { zernioKeyVar, resolveZernioKey } from "../src/lib/zernio.ts";

test("zernioKeyVar derives ZERNIO_API_KEY_<ID> and sanitises the id", () => {
  assert.equal(zernioKeyVar("wuxia"), "ZERNIO_API_KEY_WUXIA");
  assert.equal(zernioKeyVar("singlish-review"), "ZERNIO_API_KEY_SINGLISH_REVIEW");
});

test("resolveZernioKey prefers the tenant's dedicated key", () => {
  const r = resolveZernioKey("wuxia", { ZERNIO_API_KEY_WUXIA: "w1", ZERNIO_API_KEY: "shared" });
  assert.deepEqual(r, { varName: "ZERNIO_API_KEY_WUXIA", key: "w1" });
});

test("resolveZernioKey falls back to the shared key", () => {
  const r = resolveZernioKey("wuxia", { ZERNIO_API_KEY: "shared" });
  assert.deepEqual(r, { varName: "ZERNIO_API_KEY", key: "shared" });
});

test("resolveZernioKey ignores a blank dedicated key", () => {
  const r = resolveZernioKey("wuxia", { ZERNIO_API_KEY_WUXIA: "   ", ZERNIO_API_KEY: "shared" });
  assert.equal(r.varName, "ZERNIO_API_KEY");
});

test("resolveZernioKey throws naming both vars when neither is set", () => {
  assert.throws(() => resolveZernioKey("wuxia", {}), /ZERNIO_API_KEY_WUXIA.*ZERNIO_API_KEY/s);
});
