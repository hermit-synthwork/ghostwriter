# Engine → Neon (Sub-project A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Ghostwriter engine's state (tenants, episodes, usage, panels) from the filesystem to Neon Postgres + Vercel Blob, with zero change to what it generates. The VPS cron (`npm run run`) stays as the trigger.

**Architecture:** A Drizzle schema in `src/db/schema.ts` (4 tables: `tenant`, `episode`, `usage_event`, `run`) becomes the single source of truth, shared verbatim by sub-projects B (API) and C (web app) later. `src/lib/tenant.ts` / `src/lib/usage.ts` / a new `src/db/episodes.ts` replace filesystem reads/writes. `src/lib/blob.ts` puts final panel JPEGs in Vercel Blob. The `src/engine/*` functions keep their logic; only their I/O boundary changes. `src/run.ts` opens a `run` row, loops active tenants, and writes episode rows. The `art|compose|review|approve|publish` CLI wrappers and `tenants/*.json` are deleted.

**Tech Stack:** Node 25 / TypeScript strict / `tsx` / `node:test`; `drizzle-orm` + `postgres` (postgres.js) + `drizzle-kit`; `@vercel/blob`; existing `@anthropic-ai/sdk`, `@google/genai`, `satori`, `sharp`.

**Spec:** `docs/superpowers/specs/2026-08-31-engine-to-neon-design.md`

## Global Constraints

- Node **22+**, ESM only (`"type": "module"`), TS strict, `allowImportingTsExtensions` on → local imports use the `.ts` suffix.
- Key-last: a missing `DATABASE_URL`, `DATABASE_URL_TEST`, `BLOB_READ_WRITE_TOKEN`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, or `ZERNIO_API_KEY` → exit via `requireEnv`, STOP, ask the user. Never mock/fake a credential.
- **Neon project** `ghostwriter` = `summer-glitter-25536361`, region `aws-ap-southeast-1`. Branches: `dev` = `br-solitary-water-b39dpvr5` (→ `.env` `DATABASE_URL`), `test` = `br-lively-dream-b3bwz850` (→ `.env` `DATABASE_URL_TEST`), default/prod = `br-cool-sea-b35d1pq6` (VPS + Vercel, not used by this plan). All connection strings are already in `~/ghostwriter/.env`.
- Only new deps: `drizzle-orm`, `postgres`, `@vercel/blob`, and dev `drizzle-kit`. No others.
- One commit per task minimum. `npx tsc --noEmit` must be 0 errors at the end of every task. `npm test` green at the end of every task (DB tests skip cleanly when `DATABASE_URL_TEST` is unset, but it IS set — they run).
- Anthropic model `claude-sonnet-5`; Gemini image model default `gemini-3.1-flash-image`.
- No behavioural change to generated stories, art, lettering, or Zernio posts. `renderOverlaySvg`, `buildPanelPrompt`, `buildStoryMessages`, `formatHashtags`, `isDue`, `localParts`, `estimateCents`, `resolveStyle` are **frozen** — do not touch their logic.
- DB tests: connect to `DATABASE_URL_TEST`, `TRUNCATE ... RESTART IDENTITY CASCADE` the touched tables in `beforeEach`, never touch `DATABASE_URL`.

---

## File Structure

**New:**
- `src/db/schema.ts` — enums + `tenant`, `episode`, `usageEvent`, `run` tables (Drizzle)
- `src/db/client.ts` — `db` (drizzle over postgres.js), `closeDb()`
- `src/db/episodes.ts` — `createEpisode`, `setEpisodeStatus`, `getEpisode`, `recentEpisodes`
- `src/db/seed.ts` — inserts `singlish` + `singlish-review` tenant rows
- `src/lib/blob.ts` — `putPanel`, `panelBlobKey`
- `drizzle.config.ts`
- `migrations/` — drizzle-kit generated SQL
- `test/db-helpers.ts` — `withTestDb()` / truncate helper for DB tests
- `test/db-tenant.test.ts`, `test/db-usage.test.ts`, `test/db-episodes.test.ts`, `test/db-run.test.ts`
- `docs/deploy-vps.md` — cut-over runbook

**Modified:**
- `src/lib/tenant.ts` — DB reads; keep `isDue`/`localParts`; drop file IO + `loadLocalTenant`/`TENANTS_DIR`
- `src/lib/usage.ts` — `logUsage` inserts a row; drop `readUsage` + file paths; keep `estimateCents`
- `src/lib/story.ts` — remove `EPISODES_DIR`/`resolveEpisodeDir`/`listEpisodes`/`episodeDirFor`; keep `Story`/`Panel`/`validateStory`/`panelFile`
- `src/lib/env.ts` — unchanged (helpers already generic)
- `src/write-story.ts` — `writeStory` returns `{ story, usageTokens }`; drop self-`logUsage`; `StoryInput` drops `tenantId`
- `src/engine/art.ts` — raw → `.cache/<episodeId>/`; `!hasRef` → throw; `generateImage(..., undefined)`; `logUsage` gains `episodeId`
- `src/engine/compose.ts` — final JPEGs → `putPanel` (blob), not disk
- `src/engine/review.ts` — `writeReviewBundle` → `finalizeEpisode(episodeId, story)` (DB); keep `formatHashtags`
- `src/engine/publish.ts` — `publishEpisode(tenantId, episodeId, mode, only?)` reads DB + blob
- `src/run.ts` — `run` row + DB tenants + `recentEpisodes`-driven `isDue`
- `package.json` — add `db:generate`/`db:migrate`/`db:migrate:test`/`db:seed`/`db:studio`; remove `art`/`compose`/`review`/`approve`/`publish`; add deps
- `.gitignore` — drop `episodes/**`, `usage/`, `tenants/local.json`; add `.cache/`, `migrations/meta/_journal.json` stays tracked
- `tsconfig.json` — unchanged unless a dep needs `types`

**Deleted:**
- `src/gen-art.ts`, `src/compose.ts`, `src/build-review.ts`, `src/approve.ts`, `src/publish.ts` (CLI wrappers)
- `tenants/singlish.json`, `tenants/local.json`, the `tenants/` dir
- `test/episodes.test.ts` (replaced by `test/db-episodes.test.ts`)
- `episodes/` (already gitignored/untracked — just `rm -rf`)

---

## Task 1: DB deps, Drizzle schema, client, migrations

**Files:**
- Modify: `package.json`
- Create: `drizzle.config.ts`, `src/db/schema.ts`, `src/db/client.ts`
- Test: `test/db-helpers.ts`, `test/db-schema.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/db/schema.ts
  export const genreEnum, autonomyEnum, episodeStatusEnum, usageKindEnum, keyOwnerEnum
  export const tenant, episode, usageEvent, run   // pgTable objects
  export type TenantRow = typeof tenant.$inferSelect
  export type EpisodeRow = typeof episode.$inferSelect
  // src/db/client.ts
  export const db            // drizzle(postgres(DATABASE_URL))
  export function closeDb(): Promise<void>
  // test/db-helpers.ts
  export const testDb        // drizzle(postgres(DATABASE_URL_TEST))
  export async function resetTables(...names: string[]): Promise<void>  // TRUNCATE ... RESTART IDENTITY CASCADE
  ```

- [ ] **Step 1: Install deps**

```bash
npm install drizzle-orm postgres @vercel/blob
npm install -D drizzle-kit
```

- [ ] **Step 2: `package.json` scripts**

Add to `"scripts"` (keep `smoke`, `typecheck`, `test`, `run`, `story`; DELETE `art`, `compose`, `review`, `approve`, `publish` — they break in later tasks, remove now):
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:migrate:test": "DATABASE_URL=$DATABASE_URL_TEST drizzle-kit migrate",
"db:seed": "tsx src/db/seed.ts",
"db:studio": "drizzle-kit studio"
```

- [ ] **Step 3: `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";
process.loadEnvFile?.(".env");
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 4: `src/db/schema.ts`**

```ts
import { pgTable, pgEnum, text, integer, boolean, timestamp, jsonb, uuid, index } from "drizzle-orm/pg-core";

export const genreEnum = pgEnum("genre", ["funny", "horror"]);
export const genresEnum = pgEnum("genres", ["funny", "horror", "both"]);
export const autonomyEnum = pgEnum("autonomy", ["autonomous", "review_each", "review_weekly"]);
export const episodeStatusEnum = pgEnum("episode_status", [
  "generating", "ready", "approved", "scheduled", "posted", "failed", "rejected",
]);
export const usageKindEnum = pgEnum("usage_kind", ["image", "story_tokens", "post"]);
export const keyOwnerEnum = pgEnum("key_owner", ["platform", "tenant"]);

export const tenant = pgTable("tenant", {
  id: text("id").primaryKey(), // kebab-case
  ownerUserId: text("owner_user_id"), // Clerk id; null for seed rows
  displayName: text("display_name").notNull(),
  styleKey: text("style_key").notNull(),
  niche: text("niche").notNull(),
  genres: genresEnum("genres").notNull(),
  autonomy: autonomyEnum("autonomy").notNull(),
  cadence: jsonb("cadence").notNull().$type<{ days: number[]; time: string; tz: string }>(),
  publish: jsonb("publish").notNull().$type<{
    instagram?: { accountId: string; handle: string; format: "4x5" | "9x16" };
    tiktok?: { accountId: string; handle: string; format: "4x5" | "9x16" };
  }>(),
  geminiKeyEncrypted: text("gemini_key_encrypted"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const episode = pgTable(
  "episode",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull().references(() => tenant.id),
    slug: text("slug").notNull(),
    genre: genreEnum("genre").notNull(),
    title: text("title").notNull(),
    logline: text("logline").notNull(),
    storyJson: jsonb("story_json").notNull(),
    caption: text("caption").notNull().default(""),
    hashtags: text("hashtags").array().notNull().default([]),
    status: episodeStatusEnum("status").notNull().default("generating"),
    blobPrefix: text("blob_prefix").notNull(),
    panelUrls: jsonb("panel_urls").$type<{ "4x5": string[]; "9x16": string[] }>(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    posts: jsonb("posts").$type<{ platform: string; handle: string; postId: string }[]>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
  },
  (t) => [index("episode_tenant_created_idx").on(t.tenantId, t.createdAt.desc())],
);

export const usageEvent = pgTable(
  "usage_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull().references(() => tenant.id),
    episodeId: uuid("episode_id").references(() => episode.id),
    kind: usageKindEnum("kind").notNull(),
    qty: integer("qty").notNull(),
    keyOwner: keyOwnerEnum("key_owner").notNull(),
    costCents: integer("cost_cents").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

export const run = pgTable("run", {
  id: uuid("id").primaryKey().defaultRandom(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  tenantsDue: integer("tenants_due").notNull().default(0),
  tenantsOk: integer("tenants_ok").notNull().default(0),
  tenantsFailed: integer("tenants_failed").notNull().default(0),
  errors: jsonb("errors").$type<{ tenantId: string; message: string }[]>().notNull().default([]),
});
```

- [ ] **Step 5: `src/db/client.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadEnv, requireEnv } from "../lib/env.ts";
import * as schema from "./schema.ts";

loadEnv();
const sql = postgres(requireEnv("DATABASE_URL", "Neon connection string. Var: DATABASE_URL"), {
  max: 4,
  prepare: false, // pooled endpoint
});
export const db = drizzle(sql, { schema });
export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
```

- [ ] **Step 6: `test/db-helpers.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql as raw } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";

process.loadEnvFile?.(new URL("../.env", import.meta.url).pathname);
const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST is not set — DB tests need the Neon `test` branch");

const client = postgres(url, { max: 2, prepare: false });
export const testDb = drizzle(client, { schema });

export async function resetTables(...names: string[]): Promise<void> {
  if (names.length === 0) names = ["run", "usage_event", "episode", "tenant"];
  await testDb.execute(raw.raw(`TRUNCATE TABLE ${names.join(", ")} RESTART IDENTITY CASCADE`));
}
```

- [ ] **Step 7: Generate + apply migrations (dev + test branches)**

```bash
npm run db:generate           # writes migrations/0000_*.sql
npm run db:migrate            # applies to DATABASE_URL (dev branch)
npm run db:migrate:test       # applies to DATABASE_URL_TEST (test branch)
```
Commit `migrations/` (including `migrations/meta/`).

- [ ] **Step 8: Write the schema test**

`test/db-schema.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { testDb } from "./db-helpers.ts";

test("all four tables exist on the test branch", async () => {
  const rows = await testDb.execute(sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name`);
  const names = rows.map((r: Record<string, unknown>) => r.table_name);
  for (const t of ["episode", "run", "tenant", "usage_event"]) {
    assert.ok(names.includes(t), `missing table ${t}`);
  }
});

test("episode_status enum has the 7 states", async () => {
  const rows = await testDb.execute(sql`select enum_range(null::episode_status) as r`);
  assert.match(String(rows[0]!.r), /generating.*ready.*approved.*scheduled.*posted.*failed.*rejected/);
});
```

- [ ] **Step 9: Run tests + typecheck**

Run: `npm test` → new schema tests pass; existing filesystem tests still pass (they're not touched yet).
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json drizzle.config.ts src/db/ test/db-helpers.ts test/db-schema.test.ts migrations/
git commit -m "feat(db): drizzle schema (tenant/episode/usage_event/run) + Neon client + migrations"
```

---

## Task 2: `tenant.ts` → DB + seed

**Files:**
- Modify: `src/lib/tenant.ts`
- Create: `src/db/seed.ts`
- Test: rewrite `test/tenant.test.ts` → keep `isDue`/`localParts` cases; move discovery cases to `test/db-tenant.test.ts`

**Interfaces:**
- Consumes: `db` (Task 1), `tenant` table, `TenantRow`
- Produces:
  ```ts
  export interface TenantConfig {  // app-facing shape, mapped from TenantRow
    id: string; displayName: string; styleKey: string; niche: string;
    genres: "funny" | "horror" | "both";
    autonomy: "autonomous" | "review_each" | "review_weekly";
    cadence: { days: number[]; time: string; tz: string };
    publish: { instagram?: PublishTarget; tiktok?: PublishTarget };
    geminiKey?: string;   // always undefined in A (BYO wired in B)
  }
  export interface PublishTarget { accountId: string; handle: string; format: "4x5" | "9x16" }
  export function isDue(t: TenantConfig, now: Date, lastEpisodeDate: string | null): boolean   // UNCHANGED
  export function localParts(now: Date, tz: string): { weekday: number; hhmm: string; date: string }  // UNCHANGED
  export async function listActiveTenants(): Promise<TenantConfig[]>
  export async function getTenant(id: string): Promise<TenantConfig>
  ```

- [ ] **Step 1: Write the failing DB test**

`test/db-tenant.test.ts`:
```ts
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { testDb, resetTables } from "./db-helpers.ts";
import { tenant } from "../src/db/schema.ts";
import { listActiveTenants, getTenant } from "../src/lib/tenant.ts";

const row = {
  id: "acme", ownerUserId: null, displayName: "ACME", styleKey: "manga-ink",
  niche: "n", genres: "funny" as const, autonomy: "review_each" as const,
  cadence: { days: [1, 3, 5], time: "09:00", tz: "Asia/Singapore" },
  publish: { instagram: { accountId: "ig1", handle: "acme", format: "4x5" as const } },
};

beforeEach(() => resetTables("tenant"));

test("getTenant maps a row to TenantConfig", async () => {
  await testDb.insert(tenant).values(row);
  const t = await getTenant("acme");
  assert.equal(t.id, "acme");
  assert.equal(t.autonomy, "review_each");
  assert.equal(t.publish.instagram?.handle, "acme");
  assert.equal(t.geminiKey, undefined);
});

test("getTenant throws for a missing id", async () => {
  await assert.rejects(() => getTenant("nope"), /no tenant/i);
});

test("getTenant rejects an unsafe id without querying", async () => {
  await assert.rejects(() => getTenant("../evil"), /unsafe tenant id/i);
});

test("listActiveTenants returns only active rows", async () => {
  await testDb.insert(tenant).values([row, { ...row, id: "paused", active: false }]);
  const ids = (await listActiveTenants()).map((t) => t.id);
  assert.deepEqual(ids, ["acme"]);
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test` → `listActiveTenants`/`getTenant` not exported.

- [ ] **Step 3: Rewrite `src/lib/tenant.ts`**

- Keep `isDue` and `localParts` **byte-for-byte** — move them to the top, unchanged.
- Delete: `TENANTS_DIR`, `loadTenant` (file), `listTenants` (file), `loadLocalTenant`, the `node:fs` imports.
- Add:
```ts
import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { tenant, type TenantRow } from "../db/schema.ts";

function toConfig(r: TenantRow): TenantConfig {
  return {
    id: r.id, displayName: r.displayName, styleKey: r.styleKey, niche: r.niche,
    genres: r.genres, autonomy: r.autonomy, cadence: r.cadence,
    publish: r.publish, geminiKey: undefined, // BYO wired in sub-project B
  };
}

export async function listActiveTenants(): Promise<TenantConfig[]> {
  const rows = await db.select().from(tenant).where(eq(tenant.active, true));
  return rows.map(toConfig);
}

export async function getTenant(id: string): Promise<TenantConfig> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`unsafe tenant id: ${id}`);
  const [r] = await db.select().from(tenant).where(eq(tenant.id, id)).limit(1);
  if (!r) throw new Error(`no tenant "${id}"`);
  return toConfig(r);
}
```
Keep the `TenantConfig` / `PublishTarget` interfaces (the shape the engine already consumes).

- [ ] **Step 4: Trim `test/tenant.test.ts`**

Remove the `loadTenant`/`listTenants` file cases (now in `db-tenant.test.ts`). Keep nothing that imports removed symbols. If the file ends up empty, delete it — the `isDue`/`localParts` cases already live in `test/cadence.test.ts` (verify; if not, keep them here).

- [ ] **Step 5: `src/db/seed.ts`**

```ts
import { db, closeDb } from "./client.ts";
import { tenant } from "./schema.ts";

const singlish = {
  id: "singlish", ownerUserId: null, displayName: "LAH", styleKey: "manga-ink",
  niche: "Slice-of-life comedy about Gen Z Singaporeans in everyday local situations — kopitiam and hawker centre, MRT and bus, void deck, BTO and living with parents, NS, exams, internships and first jobs, CCA, side hustles, family group chats. Dialogue is natural spoken Singlish (lah, leh, sia, walao, bojio, chope, sian, paiseh, shiok, can or not, don't play play) — write speech the way Singaporeans actually talk, not textbook English. Each story builds to a punchline that lands on a relatable local truth or a small everyday injustice. Warm and self-deprecating, never mean-spirited; PG-13, mild language only.",
  genres: "funny" as const, autonomy: "autonomous" as const,
  cadence: { days: [0, 2, 4, 6], time: "09:00", tz: "Asia/Singapore" },
  publish: { instagram: { accountId: "6a911cf277555aae013ed010", handle: "bennysynthwork", format: "4x5" as const } },
};

await db.insert(tenant).values([
  singlish,
  { ...singlish, id: "singlish-review", displayName: "LAH (review)", autonomy: "review_each" as const },
]).onConflictDoNothing();
console.log("seeded singlish + singlish-review");
await closeDb();
```

- [ ] **Step 6: Seed the dev branch + verify**

```bash
npm run db:seed
```
Then verify via a `psql`-style check or the Neon `run_sql` tool: `select id, autonomy from tenant;` → two rows.

- [ ] **Step 7: Tests + typecheck**

`npm test` (db-tenant + all prior green), `npx tsc --noEmit` 0.
Note: `src/run.ts`, `src/engine/*` will NOT typecheck yet (they call the removed `loadTenant`). That is expected until Task 10 — **the gate for Tasks 2–9 is `npm test` + no NEW type errors in the file you touched**; `src/run.ts` + wrappers stay broken until their tasks. Run `npx tsc --noEmit 2>&1 | grep -v "src/run.ts\|src/gen-art.ts\|src/compose.ts\|src/build-review.ts\|src/approve.ts\|src/publish.ts"` to confirm nothing else regressed.

- [ ] **Step 8: Commit**

```bash
git add src/lib/tenant.ts src/db/seed.ts test/tenant.test.ts test/db-tenant.test.ts
git commit -m "feat(db): tenant reads from Neon (listActiveTenants/getTenant); seed singlish"
```

---

## Task 3: `usage.ts` → DB

**Files:**
- Modify: `src/lib/usage.ts`
- Test: delete `test/usage.test.ts`; create `test/db-usage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type UsageKind = "image" | "story_tokens" | "post";
  export function estimateCents(kind: UsageKind, qty: number): number   // UNCHANGED
  export async function logUsage(tenantId: string, e: {
    episodeId?: string; kind: UsageKind; qty: number;
    keyOwner: "platform" | "tenant"; note?: string;
  }): Promise<void>
  ```

- [ ] **Step 1: Write the failing test**

`test/db-usage.test.ts`:
```ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { testDb, resetTables } from "./db-helpers.ts";
import { tenant } from "../src/db/schema.ts";
import { estimateCents, logUsage } from "../src/lib/usage.ts";

beforeEach(async () => {
  await resetTables("usage_event", "tenant");
  await testDb.insert(tenant).values({
    id: "acme", displayName: "A", styleKey: "manga-ink", niche: "n",
    genres: "funny", autonomy: "review_each",
    cadence: { days: [1], time: "09:00", tz: "UTC" }, publish: {},
  });
});

test("estimateCents unchanged (10 images ≈ 30c, 3200 tokens = 1c, post = 0)", () => {
  assert.equal(estimateCents("image", 10), 30);
  assert.equal(estimateCents("story_tokens", 3200), 1);
  assert.equal(estimateCents("post", 1), 0);
});

test("logUsage inserts a row with computed cost", async () => {
  await logUsage("acme", { kind: "image", qty: 8, keyOwner: "platform" });
  const rows = await testDb.execute(sql`select kind, qty, cost_cents, key_owner from usage_event`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.cost_cents, 24);
});

test("tenant-owned image key logs zero platform cost", async () => {
  await logUsage("acme", { kind: "image", qty: 8, keyOwner: "tenant" });
  const rows = await testDb.execute(sql`select cost_cents from usage_event`);
  assert.equal(rows[0]!.cost_cents, 0);
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Rewrite `src/lib/usage.ts`**

Keep `UsageKind`, `RATE_CENTS`, `estimateCents` **exactly**. Replace `logUsage`/`readUsage`/`safeTenantId`/file paths with:
```ts
import { db } from "../db/client.ts";
import { usageEvent } from "../db/schema.ts";

export async function logUsage(
  tenantId: string,
  e: { episodeId?: string; kind: UsageKind; qty: number; keyOwner: "platform" | "tenant"; note?: string },
): Promise<void> {
  const costCents = e.keyOwner === "tenant" && e.kind === "image" ? 0 : estimateCents(e.kind, e.qty);
  await db.insert(usageEvent).values({
    tenantId, episodeId: e.episodeId ?? null, kind: e.kind, qty: e.qty,
    keyOwner: e.keyOwner, costCents, note: e.note ?? null,
  });
}
```
(`tenantId` no longer needs a path guard — it's a bound parameter, and FK-checked.)

- [ ] **Step 4: Tests + typecheck** — `npm test` green; scoped tsc (per Task 2 Step 7 note) clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/usage.ts test/usage.test.ts test/db-usage.test.ts
git commit -m "feat(db): usage_event rows replace the JSONL log"
```

---

## Task 4: `src/db/episodes.ts` + strip story.ts filesystem helpers

**Files:**
- Create: `src/db/episodes.ts`
- Modify: `src/lib/story.ts`
- Test: delete `test/episodes.test.ts`; create `test/db-episodes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/db/episodes.ts
  export interface EpisodeMeta { date: string; genre: "funny" | "horror"; title: string }
  export async function createEpisode(tenantId: string, story: Story): Promise<{ id: string; blobPrefix: string }>
  export async function setEpisodeStatus(id: string, status: EpisodeStatus,
    patch?: Partial<{ caption: string; hashtags: string[]; storyJson: unknown;
      panelUrls: { "4x5": string[]; "9x16": string[] };
      scheduledFor: Date; posts: { platform: string; handle: string; postId: string }[];
      error: string; approvedAt: Date; postedAt: Date }>): Promise<void>
  export async function getEpisode(id: string): Promise<EpisodeRow>
  export async function recentEpisodes(tenantId: string, n: number): Promise<EpisodeMeta[]>  // newest first
  ```
  `blobPrefix = `episodes/${tenantId}/${episodeId}``. `date` in `EpisodeMeta` is `createdAt` as `YYYY-MM-DD` in **UTC** — see note in Task 10 about the `isDue` contract.

- [ ] **Step 1: Failing test** `test/db-episodes.test.ts`

```ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { testDb, resetTables } from "./db-helpers.ts";
import { tenant } from "../src/db/schema.ts";
import { createEpisode, setEpisodeStatus, getEpisode, recentEpisodes } from "../src/db/episodes.ts";
import type { Story } from "../src/lib/story.ts";

const story = {
  date: "2026-08-31", slug: "kopi-run", genre: "funny", title: "Kopi Run",
  logline: "x", cast: [{ name: "A", description: "d", visual_tags: ["t"] }],
  panels: Array.from({ length: 6 }, (_, i) => ({
    n: i + 1, scene: "s", camera: "wide", characters: [], narration: null, dialogue: [],
  })),
  caption: "c", hashtags: ["sg"],
} as unknown as Story;

beforeEach(async () => {
  await resetTables("episode", "tenant");
  await testDb.insert(tenant).values({
    id: "acme", displayName: "A", styleKey: "manga-ink", niche: "n",
    genres: "funny", autonomy: "review_each",
    cadence: { days: [1], time: "09:00", tz: "UTC" }, publish: {},
  });
});

test("createEpisode inserts a generating row with a blob prefix", async () => {
  const { id, blobPrefix } = await createEpisode("acme", story);
  assert.match(blobPrefix, new RegExp(`^episodes/acme/${id}$`));
  const row = await getEpisode(id);
  assert.equal(row.status, "generating");
  assert.equal(row.slug, "kopi-run");
  assert.equal(row.title, "Kopi Run");
});

test("setEpisodeStatus patches caption/hashtags/status", async () => {
  const { id } = await createEpisode("acme", story);
  await setEpisodeStatus(id, "ready", { caption: "final", hashtags: ["#sg", "#kopi"] });
  const row = await getEpisode(id);
  assert.equal(row.status, "ready");
  assert.equal(row.caption, "final");
  assert.deepEqual(row.hashtags, ["#sg", "#kopi"]);
});

test("recentEpisodes returns newest-first meta", async () => {
  const a = await createEpisode("acme", { ...story, slug: "a", title: "A" });
  const b = await createEpisode("acme", { ...story, slug: "b", title: "B" });
  const meta = await recentEpisodes("acme", 5);
  assert.equal(meta[0]!.title, "B");
  assert.equal(meta[1]!.title, "A");
  assert.match(meta[0]!.date, /^\d{4}-\d{2}-\d{2}$/);
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement `src/db/episodes.ts`**

```ts
import { desc, eq } from "drizzle-orm";
import { db } from "./client.ts";
import { episode, type EpisodeRow } from "./schema.ts";
import type { Story } from "../lib/story.ts";

export type EpisodeStatus = EpisodeRow["status"];
export interface EpisodeMeta { date: string; genre: "funny" | "horror"; title: string }

export async function createEpisode(tenantId: string, story: Story): Promise<{ id: string; blobPrefix: string }> {
  const [row] = await db.insert(episode).values({
    tenantId, slug: story.slug, genre: story.genre, title: story.title,
    logline: story.logline, storyJson: story, blobPrefix: "pending",
  }).returning({ id: episode.id });
  const id = row!.id;
  const blobPrefix = `episodes/${tenantId}/${id}`;
  await db.update(episode).set({ blobPrefix }).where(eq(episode.id, id));
  return { id, blobPrefix };
}

export async function setEpisodeStatus(id: string, status: EpisodeStatus, patch: Record<string, unknown> = {}): Promise<void> {
  await db.update(episode).set({ status, ...patch }).where(eq(episode.id, id));
}

export async function getEpisode(id: string): Promise<EpisodeRow> {
  const [row] = await db.select().from(episode).where(eq(episode.id, id)).limit(1);
  if (!row) throw new Error(`no episode ${id}`);
  return row;
}

export async function recentEpisodes(tenantId: string, n: number): Promise<EpisodeMeta[]> {
  const rows = await db.select({ createdAt: episode.createdAt, genre: episode.genre, title: episode.title })
    .from(episode).where(eq(episode.tenantId, tenantId)).orderBy(desc(episode.createdAt)).limit(n);
  return rows.map((r) => ({ date: r.createdAt.toISOString().slice(0, 10), genre: r.genre, title: r.title }));
}
```

- [ ] **Step 4: Strip `src/lib/story.ts`**

Delete `EPISODES_DIR`, `resolveEpisodeDir`, `listEpisodes`, `episodeDirFor`, and the `readdirSync`/`statSync`/`existsSync` imports. Keep `Story`, `Panel`, `Dialogue`, `CastMember`, `Genre`, `Status` (still used by types), `validateStory`, `panelFile`. Delete `test/episodes.test.ts`.

- [ ] **Step 5: Tests + typecheck** — `npm test` green; scoped tsc clean (run.ts still broken, expected).

- [ ] **Step 6: Commit**

```bash
git add src/db/episodes.ts src/lib/story.ts test/episodes.test.ts test/db-episodes.test.ts
git commit -m "feat(db): episode rows + recentEpisodes; drop filesystem episode helpers"
```

---

## Task 5: `src/lib/blob.ts`

**Files:**
- Create: `src/lib/blob.ts`
- Test: `test/blob.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function panelBlobKey(blobPrefix: string, format: "4x5" | "9x16", n: number): string
  export async function putPanel(blobPrefix: string, format: "4x5" | "9x16", n: number, jpeg: Buffer): Promise<string>  // returns the blob URL
  ```

- [ ] **Step 1: Failing test** `test/blob.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { panelBlobKey } from "../src/lib/blob.ts";

test("panelBlobKey builds the object path", () => {
  assert.equal(
    panelBlobKey("episodes/acme/abc-123", "4x5", 3),
    "episodes/acme/abc-123/final-4x5/03.jpg",
  );
});
```
(The `putPanel` round-trip is a manual verification step — it needs `BLOB_READ_WRITE_TOKEN` and hits the network. Do NOT add a networked unit test.)

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement `src/lib/blob.ts`**

```ts
import { put } from "@vercel/blob";
import { loadEnv, requireEnv } from "./env.ts";

export function panelBlobKey(blobPrefix: string, format: "4x5" | "9x16", n: number): string {
  return `${blobPrefix}/final-${format}/${String(n).padStart(2, "0")}.jpg`;
}

export async function putPanel(
  blobPrefix: string, format: "4x5" | "9x16", n: number, jpeg: Buffer,
): Promise<string> {
  loadEnv();
  const token = requireEnv("BLOB_READ_WRITE_TOKEN", "Vercel Blob store token. Var: BLOB_READ_WRITE_TOKEN");
  const { url } = await put(panelBlobKey(blobPrefix, format, n), jpeg, {
    access: "public", token, contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true,
  });
  return url;
}
```
Note: `access: "public"` is the only value `@vercel/blob` `put` accepts today; the store itself is private-by-project and B will front reads with signed/authorized routes. Document this in a comment.

- [ ] **Step 4: Tests + typecheck** — `npm test` green; scoped tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/blob.ts test/blob.test.ts
git commit -m "feat(blob): putPanel() uploads final panel JPEGs to Vercel Blob"
```

---

## Task 6: `write-story.ts` returns usage

**Files:**
- Modify: `src/write-story.ts`
- Test: `test/write-story.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface StoryInput { genre: "funny" | "horror"; niche: string; styleKey: string; priorTitles: string[] }  // tenantId removed
  export function buildStoryMessages(input: StoryInput): { system: string; user: string }   // UNCHANGED
  export function writeStory(input: StoryInput): Promise<{ story: Story; usageTokens: number }>   // was Promise<Story>
  ```

- [ ] **Step 1: Update the test**

In `test/write-story.test.ts`, the `buildStoryMessages({...})` literal(s): remove the `tenantId: "t"` field. (No other test change — the network path stays unverified by design.)

- [ ] **Step 2: Run it, verify it fails** — TS error on the extra `tenantId`, or the assertion still referencing it.

- [ ] **Step 3: Edit `src/write-story.ts`**

- `StoryInput`: remove `tenantId`.
- Remove the `import { logUsage } ...` and the `logUsage(...)` call on the success path.
- On success, instead of `return json as Story;`, compute
  `const usageTokens = (res.usage.input_tokens ?? 0) + (res.usage.output_tokens ?? 0);`
  and `return { story: json as Story, usageTokens };`.
- The 2nd-attempt `throw` and the `stop_reason` (refusal / max_tokens) throws are unchanged.
- CLI block: `const { story } = await writeStory({...})` then `process.stdout.write(JSON.stringify(story, null, 2) + "\n");` — and drop `tenantId` from that synthetic input too.

- [ ] **Step 4: Tests + typecheck** — `npm test` green (`buildStoryMessages` test passes); scoped tsc clean (`run.ts` still broken).

- [ ] **Step 5: Commit**

```bash
git add src/write-story.ts test/write-story.test.ts
git commit -m "feat(engine): writeStory returns {story, usageTokens}; run.ts will log it"
```

---

## Task 7: `art.ts` → cache dir + committed style-refs

**Files:**
- Modify: `src/engine/art.ts`
- Create: `styles/retro-halftone/style-ref.png` (generated once, committed)
- Test: `test/art-prompt.test.ts` (only a signature check)

**Interfaces:**
- Consumes: `generateImage` (`src/gemini.ts`, unchanged), `resolveStyle`, `logUsage` (now async, gains `episodeId`), `createEpisode` output (`blobPrefix` unused here; raw stays local)
- Produces: `generateArt(tenant: TenantConfig, episodeId: string, story: Story): Promise<void>` — signature changes from `(tenant, episodeDir, story)` to `(tenant, episodeId, story)`; raw panels land in `.cache/<episodeId>/panel-NN.png`.

- [ ] **Step 1: Pre-generate the missing style-ref** (controller or a one-off; needs `GEMINI_API_KEY`)

```bash
tsx -e '
import { generateImage } from "./src/gemini.ts";
import { readFileSync, writeFileSync } from "node:fs";
const bible = readFileSync("styles/retro-halftone/style-bible.md","utf8");
const { png } = await generateImage(bible + "\n\nReference key-art frame establishing this house style: an empty HDB void deck at dusk, one flickering fluorescent tube, long shadows. No lettering.", [], "9:16");
writeFileSync("styles/retro-halftone/style-ref.png", png);
'
```
Verify it opens and looks on-style; commit it with this task.

- [ ] **Step 2: Failing/updated test** `test/art-prompt.test.ts`

`buildPanelPrompt` is unchanged and its assertions stand. Add one line asserting the new `generateArt` arity is `(tenant, episodeId, story)` is not unit-testable without the network — instead just confirm `buildPanelPrompt` still exported and matches. No new test needed; this task is covered by the manual dry-run verification. (If the file imports anything removed, fix it.)

- [ ] **Step 3: Edit `src/engine/art.ts`**

- Signature: `generateArt(tenant, episodeId: string, story)`.
- `const rawDir = join(REPO_ROOT, ".cache", episodeId); mkdirSync(rawDir, { recursive: true });` — raw panel PNGs go here (keep the "skip if exists" regen behaviour).
- `ensureStyleRef`: replace generation with `if (!style.hasRef) throw new Error(\`style "${style.key}" has no committed style-ref.png — pre-generate and commit it\`);`
- character sheet: still generated per-episode, but write it to `rawDir/character-sheet.png` (transient, not committed, not blob).
- `generateImage(prompt, refs, "9:16", undefined)` — explicit `undefined` for the API key (platform key; BYO in B).
- Every `logUsage(...)` call: `await logUsage(tenant.id, { episodeId, kind: "image", qty: 1, keyOwner: "platform" })`.
- Remove any remaining `episodeDir` / `cost.log` references.

- [ ] **Step 4: Tests + typecheck** — `npm test` green; scoped tsc clean (`run.ts`, `compose.ts` wrapper still broken).

- [ ] **Step 5: Commit**

```bash
git add src/engine/art.ts styles/retro-halftone/style-ref.png test/art-prompt.test.ts
git commit -m "feat(engine): generateArt(tenant, episodeId, story) — raw to .cache, refs must be committed"
```

---

## Task 8: `compose.ts` → Blob + `review.ts` → DB

**Files:**
- Modify: `src/engine/compose.ts`, `src/engine/review.ts`
- Delete: `src/compose.ts`, `src/build-review.ts` (CLI wrappers)
- Test: `test/overlay.test.ts` + `test/review.test.ts` unchanged (pure); confirm they still pass.

**Interfaces:**
- Produces:
  ```ts
  // src/engine/compose.ts
  export interface PanelUrls { "4x5": string[]; "9x16": string[] }
  export function composeEpisode(tenant: TenantConfig, episodeId: string, blobPrefix: string, story: Story): Promise<PanelUrls>
  // src/engine/review.ts
  export function formatHashtags(tags: string[]): string   // UNCHANGED
  export function finalizeEpisode(episodeId: string, story: Story, panelUrls: PanelUrls): Promise<void>
  ```

- [ ] **Step 1: Edit `src/engine/compose.ts`**

- Signature: `composeEpisode(tenant, episodeId, blobPrefix, story)`.
- Read raw panels from `.cache/<episodeId>/panel-NN.png` (not an episode dir).
- Per panel, after building the 9x16 and 4x5 buffers exactly as now: convert each to JPEG (`sharp(buf).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer()`) and `await putPanel(blobPrefix, "9x16", p.n, jpg9)` / `putPanel(blobPrefix, "4x5", p.n, jpg45)`. Push each returned URL into `urls["9x16"]` / `urls["4x5"]` (in panel order). No `panels/final-*` dirs.
- Return `urls: PanelUrls`.
- `brandFor` and the `normalize916`/`crop45`/`overlay`/`renderOverlaySvg` flow are unchanged.
- Drop the `--placeholder` code path from the engine (it lived in the CLI wrapper, which is being deleted).

- [ ] **Step 2: Edit `src/engine/review.ts`**

- Keep `formatHashtags` exactly.
- Replace `writeReviewBundle(episodeDir, story)` with:
  ```ts
  export async function finalizeEpisode(episodeId: string, story: Story, panelUrls: PanelUrls): Promise<void> {
    await setEpisodeStatus(episodeId, "ready", {
      caption: story.caption,
      hashtags: formatHashtags(story.hashtags).split(" ").filter(Boolean),
      storyJson: story,
      panelUrls,
    });
  }
  ```
  (Import `setEpisodeStatus` from `../db/episodes.ts`, `PanelUrls` from `./compose.ts`.) Delete all the `review.html` / `caption.txt` / `status.json` generation.

- [ ] **Step 3: Delete the wrappers**

```bash
git rm src/compose.ts src/build-review.ts
```

- [ ] **Step 4: Tests + typecheck** — `npm test` green (`overlay`, `review` pure tests pass); scoped tsc clean (only `run.ts` + `gen-art.ts`/`approve.ts`/`publish.ts` wrappers left broken).

- [ ] **Step 5: Commit**

```bash
git add src/engine/compose.ts src/engine/review.ts src/compose.ts src/build-review.ts
git commit -m "feat(engine): composeEpisode → Vercel Blob; finalizeEpisode → episode row"
```

---

## Task 9: `publish.ts` → DB + Blob

**Files:**
- Modify: `src/engine/publish.ts`
- Delete: `src/publish.ts` (CLI wrapper)
- Test: `test/select-targets.test.ts` — adapt if `selectTargets`'s input shape shifts (it takes a `TenantConfig`; unchanged).

**Interfaces:**
- Produces:
  ```ts
  export type PublishMode = "draft" | "now";
  export interface PubTarget { platform: "instagram" | "tiktok"; accountId: string; handle: string; format: "4x5" | "9x16" }
  export function selectTargets(tenant: TenantConfig, only?: string | null): PubTarget[]   // UNCHANGED
  export function publishEpisode(tenantId: string, episodeId: string, mode: PublishMode, only?: string | null): Promise<{ platform: string; handle: string; postId: string }[]>
  ```

- [ ] **Step 1: Edit `src/engine/publish.ts`**

- `publishEpisode(tenantId, episodeId, mode, only?)`:
  - `const tenant = await getTenant(tenantId); const ep = await getEpisode(episodeId);`
  - Guard: `if (ep.status !== "approved" && ep.status !== "posted") throw new Error(...)` (same rule as Phase 0).
  - `const content = \`${ep.caption}\n\n${ep.hashtags.join(" ")}\`;`
  - targets = `selectTargets(tenant, only)`.
  - Per target: `const urls = ep.panelUrls?.[target.format]; if (!urls?.length) throw new Error("episode has no composed panels for " + target.format);` Then for each URL in order: `fetch(url)` → `Buffer.from(await res.arrayBuffer())` → `uploadImage(buf, ...)` to Zernio (exactly as Phase 0, but bytes come from Blob not disk). Cache uploads by `target.format` so IG+TikTok on the same format upload once.
  - No convert-to-JPEG step (Blob already holds q90 JPEGs).
  - `await logUsage(tenantId, { episodeId, kind: "post", qty: 1, keyOwner: "platform" })` after each `createPost`.
  - `mode === "now"` → `setEpisodeStatus(episodeId, "posted", { postedAt: new Date(), posts: results })`. `draft` → leave status.
  - Return `results`.

- [ ] **Step 2: Delete `src/publish.ts`** — `git rm src/publish.ts`.

- [ ] **Step 3: Tests + typecheck** — `npm test` green (`select-targets` passes); scoped tsc clean (only `run.ts`, `gen-art.ts`, `approve.ts` left).

- [ ] **Step 4: Commit**

```bash
git add src/engine/publish.ts src/publish.ts test/select-targets.test.ts
git commit -m "feat(engine): publishEpisode(tenantId, episodeId, mode) reads DB + Blob"
```

---

## Task 10: `run.ts` orchestrator → DB

**Files:**
- Modify: `src/run.ts`
- Test: rewrite `test/run-plan.test.ts` → `test/db-run.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RunPlanItem { tenantId: string; genre: "funny" | "horror" }
  export async function resolveRunPlan(tenants: TenantConfig[], now: Date): Promise<RunPlanItem[]>   // now async (recentEpisodes)
  export async function runDueTenants(opts: { tenantId?: string; now?: Date; dry?: boolean; nowPublish?: boolean }): Promise<void>
  ```

- [ ] **Step 1: Failing test** `test/db-run.test.ts`

```ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { testDb, resetTables } from "./db-helpers.ts";
import { tenant } from "../src/db/schema.ts";
import { resolveRunPlan } from "../src/run.ts";
import type { TenantConfig } from "../src/lib/tenant.ts";
import { createEpisode } from "../src/db/episodes.ts";

const mk = (o: Partial<TenantConfig>): TenantConfig => ({
  id: "t", displayName: "T", styleKey: "manga-ink", niche: "n", genres: "both",
  autonomy: "autonomous", cadence: { days: [1, 3, 5], time: "09:00", tz: "Asia/Singapore" },
  publish: {}, ...o,
});
const mon0930sg = new Date("2026-08-31T01:30:00Z"); // Monday 09:30 SGT

beforeEach(async () => {
  await resetTables("episode", "tenant");
  await testDb.insert(tenant).values({ ...mk({ id: "a" }), ownerUserId: null } as never);
});

test("resolveRunPlan includes a due tenant with no episode today", async () => {
  const plan = await resolveRunPlan([mk({ id: "a" })], mon0930sg);
  assert.equal(plan.length, 1);
  assert.ok(["funny", "horror"].includes(plan[0]!.genre));
});

test("resolveRunPlan skips a tenant that already has an episode today", async () => {
  await createEpisode("a", { slug: "x", genre: "horror", title: "X", logline: "l", panels: [{}, {}] } as never);
  const plan = await resolveRunPlan([mk({ id: "a" })], mon0930sg);
  assert.deepEqual(plan, []);
});

test("resolveRunPlan skips a non-scheduled weekday", async () => {
  const tue = new Date("2026-09-01T01:30:00Z");
  assert.deepEqual(await resolveRunPlan([mk({ id: "a" })], tue), []);
});
```
Note: `recentEpisodes` returns `date` in **UTC**. `createEpisode` above stamps `createdAt = now()` (server UTC). The test's `mon0930sg` is `2026-08-31T01:30Z` → UTC date `2026-08-31`. `isDue`'s `localParts(now, tz).date` for `Asia/Singapore` is also `2026-08-31`. They line up here. **Real-world caveat (document, don't fix in A):** for a tenant near a date boundary, "episode today" is judged in UTC while the cadence gate is judged in tenant-local time — a sub-project-B refinement. Add a `// TODO(B): compare dates in tenant tz` comment at the `recentEpisodes` call.

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Rewrite `src/run.ts`**

```ts
import { listActiveTenants, getTenant, isDue, localParts, type TenantConfig } from "./lib/tenant.ts";
import { recentEpisodes, createEpisode, setEpisodeStatus } from "./db/episodes.ts";
import { logUsage } from "./lib/usage.ts";
import { writeStory } from "./write-story.ts";
import { generateArt } from "./engine/art.ts";
import { composeEpisode } from "./engine/compose.ts";
import { finalizeEpisode } from "./engine/review.ts";
import { publishEpisode } from "./engine/publish.ts";
import { db, closeDb } from "./db/client.ts";
import { run as runTbl } from "./db/schema.ts";
import { eq } from "drizzle-orm";

export interface RunPlanItem { tenantId: string; genre: "funny" | "horror" }

export async function resolveRunPlan(tenants: TenantConfig[], now: Date): Promise<RunPlanItem[]> {
  const plan: RunPlanItem[] = [];
  for (const t of tenants) {
    const recent = await recentEpisodes(t.id, 5); // TODO(B): compare dates in tenant tz
    const last = recent[0]?.date ?? null;
    if (!isDue(t, now, last)) continue;
    const genre: "funny" | "horror" =
      t.genres !== "both" ? t.genres : recent[0]?.genre === "horror" ? "funny" : "horror";
    plan.push({ tenantId: t.id, genre });
  }
  return plan;
}

export async function runDueTenants(opts: {
  tenantId?: string; now?: Date; dry?: boolean; nowPublish?: boolean;
}): Promise<void> {
  const now = opts.now ?? new Date();
  const tenants = opts.tenantId ? [await getTenant(opts.tenantId)] : await listActiveTenants();
  const plan = opts.tenantId
    ? tenants.map((t) => ({ tenantId: t.id, genre: (t.genres !== "both" ? t.genres : "horror") as "funny" | "horror" }))
    : await resolveRunPlan(tenants, now);

  const [runRow] = await db.insert(runTbl).values({ tenantsDue: plan.length }).returning({ id: runTbl.id });
  const runId = runRow!.id;
  let ok = 0, failed = 0;
  const errors: { tenantId: string; message: string }[] = [];

  for (const item of plan) {
    try {
      const t = await getTenant(item.tenantId);
      const recent = await recentEpisodes(t.id, 5);
      const { story, usageTokens } = await writeStory({
        genre: item.genre, niche: t.niche, styleKey: t.styleKey,
        priorTitles: recent.map((r) => r.title),
      });
      const { id: episodeId, blobPrefix } = await createEpisode(t.id, story);
      await logUsage(t.id, { episodeId, kind: "story_tokens", qty: usageTokens, keyOwner: "platform" });
      console.log(`\n[${t.id}] ${story.genre} · ${story.title} → episode ${episodeId}`);

      await generateArt(t, episodeId, story);
      const panelUrls = await composeEpisode(t, episodeId, blobPrefix, story);
      await finalizeEpisode(episodeId, story, panelUrls);

      if (t.autonomy === "autonomous" && !opts.dry) {
        await setEpisodeStatus(episodeId, "approved", { approvedAt: new Date() });
        const mode = opts.nowPublish ? "now" : "draft";
        const res = await publishEpisode(t.id, episodeId, mode);
        console.log(`[${t.id}] ${mode}: ${res.map((r) => `${r.platform}=${r.postId}`).join(" ")}`);
      } else {
        console.log(`[${t.id}] ready — autonomy=${t.autonomy}${opts.dry ? " (dry)" : ""}, not published`);
      }
      ok++;
    } catch (err) {
      failed++;
      const message = (err as Error).message;
      errors.push({ tenantId: item.tenantId, message });
      console.error(`[${item.tenantId}] FAILED: ${message}`);
    }
  }

  await db.update(runTbl).set({ finishedAt: new Date(), tenantsOk: ok, tenantsFailed: failed, errors })
    .where(eq(runTbl.id, runId));
  if (plan.length === 0) console.log("no tenants due");
  if (failed > 0) process.exitCode = 1;
}

// CLI: tsx src/run.ts [--tenant id] [--dry] [--now]
if (process.argv[1]?.endsWith("run.ts")) {
  const arg = (k: string) => {
    const i = process.argv.indexOf(`--${k}`);
    const v = i === -1 ? undefined : process.argv[i + 1];
    return v && !v.startsWith("--") ? v : undefined;
  };
  try {
    await runDueTenants({
      tenantId: arg("tenant"),
      dry: process.argv.includes("--dry"),
      nowPublish: process.argv.includes("--now"),
    });
  } catch (err) {
    console.error("\n✗ " + (err as Error).message + "\n");
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
```
Note: when a `failed` tenant leaves a half-built `episode` row (status still `generating`), set it to `failed` with the error in the catch — add `if (episodeId) await setEpisodeStatus(episodeId, "failed", { error: message });` (hoist `let episodeId` above the try).

- [ ] **Step 4: Tests + typecheck** — `npm test` green; **now run the FULL `npx tsc --noEmit`** — it must be 0 errors (all consumers updated). If `gen-art.ts` / `approve.ts` still exist and break, they're deleted in Task 11 — but they should already be gone; if not, delete them here.

- [ ] **Step 5: Commit**

```bash
git add src/run.ts test/run-plan.test.ts test/db-run.test.ts
git commit -m "feat(engine): run.ts orchestrator on Neon — run rows, DB tenants, DB isDue"
```

---

## Task 11: Cleanup, scripts, gitignore, deploy runbook

**Files:**
- Delete: `src/gen-art.ts`, `src/approve.ts`, `tenants/` (dir), `episodes/` (untracked)
- Modify: `package.json`, `.gitignore`, `README.md`
- Create: `docs/deploy-vps.md`

- [ ] **Step 1: Delete remaining Phase-0 filesystem artifacts**

```bash
git rm -r src/gen-art.ts src/approve.ts tenants/
rm -rf episodes/ usage/ .cache/
```

- [ ] **Step 2: `package.json`** — confirm `scripts` is exactly: `smoke`, `typecheck`, `test`, `run`, `story`, `db:generate`, `db:migrate`, `db:migrate:test`, `db:seed`, `db:studio`. No `art`/`compose`/`review`/`approve`/`publish`.

- [ ] **Step 3: `.gitignore`** — remove `episodes/*/*/…`, `usage/`, `tenants/local.json` lines. Add:
```
.cache/
```
Keep `node_modules/`, `.env`, `.env.local`, `*.log`, `.DS_Store`, `.superpowers/`, `assets/smoke.png`. `migrations/` stays **tracked**.

- [ ] **Step 4: `README.md`** — replace the "Engine (multi-tenant)" + local-config sections: tenants now live in Neon (`npm run db:seed` / `db:studio`), episodes + usage in Neon, panels in Vercel Blob. `.env` needs `DATABASE_URL` + `BLOB_READ_WRITE_TOKEN` alongside the three API keys. The only commands are `npm run run` (cron) and `npm run run -- --tenant <id> --dry` (test).

- [ ] **Step 5: `docs/deploy-vps.md`** — the cut-over runbook:
```markdown
# VPS cut-over (Phase 0 filesystem cron → Neon engine)

1. On the VPS: `git pull && npm ci`
2. Add to the VPS `.env`: DATABASE_URL (Neon **default** branch — ep-round-resonance-…),
   BLOB_READ_WRITE_TOKEN. (Keep the existing GEMINI/ANTHROPIC/ZERNIO keys.)
3. `npm run db:migrate` (idempotent).
4. `npm run db:seed` (idempotent — `onConflictDoNothing`).
5. Dry-run once: `npm run run -- --tenant singlish-review --dry`; check the Neon `episode`
   row + Vercel Blob objects.
6. Swap the crontab line — command is unchanged (`npm run run`), so usually nothing to edit.
7. Watch `run.log` + the `run` table for the first live fire.
The 3 posts already scheduled in Zernio (Sep 1/3/5) are independent of this.
```

- [ ] **Step 6: Full verification gate**

Run: `npm test` → all green. `npx tsc --noEmit` → 0.
Run: `git grep -n "episodes/\|tenants/\|writeReviewBundle\|resolveEpisodeDir\|readUsage\|cost.log" src` → no hits.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(engine): delete Phase-0 filesystem surface; README + VPS cut-over runbook"
```

---

## Verification — sub-project A (manual, needs BLOB_READ_WRITE_TOKEN + the 3 API keys)

Prereq: `.env` has `DATABASE_URL`, `DATABASE_URL_TEST`, `BLOB_READ_WRITE_TOKEN`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `ZERNIO_API_KEY`. If `BLOB_READ_WRITE_TOKEN` is missing, STOP and ask the user to create a Vercel Blob store — do not stub.

1. **Schema + seed:** `npm run db:migrate && npm run db:seed`; via the Neon `run_sql` tool: `select id, autonomy from tenant` → `singlish` (autonomous) + `singlish-review` (review_each). `\dt` → `tenant, episode, usage_event, run`.
2. **Unit suite:** `npm test` — pure-logic tests unchanged; `db-*` tests hit the `test` branch and pass. `npx tsc --noEmit` — 0.
3. **Dry run, review-gated:** `npm run run -- --tenant singlish-review --dry`
   - a `run` row opens + closes with `tenants_due=1, tenants_ok=1, tenants_failed=0`
   - one `episode` row: `status='ready'`, `story_json` + `caption` + `hashtags[]` populated, `blob_prefix='episodes/singlish-review/<uuid>'`
   - Vercel Blob (`vercel blob list` or the dashboard): `episodes/singlish-review/<uuid>/final-4x5/01.jpg`..`08.jpg` + `final-9x16/01.jpg`..`08.jpg`
   - **no `episodes/` directory on disk**; `.cache/<uuid>/` holds the raw PNGs
   - `usage_event`: 1 `story_tokens` (qty ≈ 2–4k, cost 1) + 9 `image` (cost 3 each)
   - console: "ready … not published"; no Zernio call
4. **Autonomous + real draft:** `npm run run -- --tenant singlish`
   - episode `status='approved'`, then a Zernio **draft** (verify `posts_list status=draft`), `usage_event` gains a `post` row, status stays `approved`
5. **Idempotency:** immediately `npm run run` (bare) on a due weekday → "no tenants due"; no 2nd episode row for either tenant (same-day guard via `recentEpisodes`).
6. **Style-ref guard:** `git mv styles/manga-ink/style-ref.png /tmp/`, `npm run run -- --tenant singlish-review --dry` → tenant fails with "style … has no committed style-ref.png", `run` row `tenants_failed=1`, that `episode` row `status='failed'` with `error` set. Restore the file.
7. **Cross-region sanity:** the dry run completes in roughly the same wall-clock as Phase 0 (~90s) — DB latency from the US/EU VPS to Neon SG adds seconds, not minutes.
8. **No regressions:** `styles/`, `renderOverlaySvg` lettering (spot-check one blob JPEG visually), `formatHashtags`, `isDue` timezone math all still pass.

## Self-Review notes (author)

- **Spec coverage:** schema (T1), tenant→DB + seed (T2), usage→DB (T3), episodes→DB (T4), blob (T5), write-story return shape (T6), art→cache + committed refs (T7), compose→blob + review→DB (T8), publish→DB+blob (T9), run.ts orchestrator (T10), cleanup + cut-over (T11). Verification mirrors the spec's 8 steps.
- **Deferred to B/C per the spec:** any HTTP endpoint, signed blob read URLs, push on `status='ready'`, `FOR UPDATE SKIP LOCKED` queue, BYO-key decryption, content-safety classifier. The `// TODO(B)` markers (tenant-tz date comparison in `resolveRunPlan`) are intentional.
- **Type-gate caveat:** Tasks 2–9 leave `src/run.ts` (and any not-yet-deleted wrapper) failing `tsc` because they call removed symbols. Each of those tasks gates on `npm test` + a **scoped** tsc (`grep -v` the known-broken files). Task 10 restores a fully-green repo-wide `tsc`; Task 11 keeps it green. Do not treat repo-wide `tsc` as a gate before Task 10.
- **Type consistency:** `TenantConfig`/`PublishTarget` (T2) unchanged in shape from Phase 0 so `src/engine/*` consume them without edits beyond the signature changes noted. `EpisodeRow`/`EpisodeStatus`/`EpisodeMeta` defined once (T1/T4). `writeStory` return type changes exactly once (T6), its one caller (`run.ts`) updated in T10. `generateArt`/`composeEpisode`/`publishEpisode` signatures change once each (T7/T8/T9) and `run.ts` (T10) is the sole caller.
- **Panel URLs (T9):** `composeEpisode` persists the `put()` return URLs to `episode.panel_urls` (jsonb, added in T1); `publishEpisode` reads `ep.panelUrls[format]` and `fetch`es the bytes — no `head()` lookup, no store-base-URL derivation.
