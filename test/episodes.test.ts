import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { EPISODES_DIR, listEpisodes, resolveEpisodeDir } from "../src/lib/story.ts";

const TENANT = "tfix";
const EP = "2099-01-01-probe-slug";
const KEY = join(TENANT, EP);
const tenantDir = join(EPISODES_DIR, TENANT);
const epDir = join(tenantDir, EP);

function seed(): void {
  mkdirSync(epDir, { recursive: true });
  writeFileSync(
    join(epDir, "story.json"),
    JSON.stringify({
      date: "2099-01-01",
      slug: "probe-slug",
      genre: "funny",
      title: "Probe Slug",
      logline: "A test fixture episode.",
      cast: [{ name: "T", description: "tester", visual_tags: ["hat"] }],
      panels: [],
      caption: "cap",
      hashtags: ["comics"],
    }),
  );
}

afterEach(() => rmSync(tenantDir, { recursive: true, force: true }));

test("listEpisodes includes the 2-level key <tenant>/<episode>", () => {
  seed();
  assert.ok(listEpisodes().includes(KEY), `expected ${KEY} in ${JSON.stringify(listEpisodes())}`);
});

test("resolveEpisodeDir matches on the last path segment (bare slug)", () => {
  seed();
  const dir = resolveEpisodeDir("probe-slug");
  assert.ok(dir.endsWith(KEY), `expected path ending ${KEY}, got ${dir}`);
});

test("resolveEpisodeDir resolves a full <tenant>/<episode> arg", () => {
  seed();
  const dir = resolveEpisodeDir(KEY);
  assert.ok(dir.endsWith(KEY), `expected path ending ${KEY}, got ${dir}`);
});

test("resolveEpisodeDir throws for an unknown slug", () => {
  seed();
  assert.throws(() => resolveEpisodeDir("no-such-slug-here"), /No episode matching/);
});
