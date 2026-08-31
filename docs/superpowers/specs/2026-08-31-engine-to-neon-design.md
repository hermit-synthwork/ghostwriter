# Sub-project A: Engine → Neon — design

## Context

Phase 0 built a filesystem-first multi-tenant engine: tenants are `tenants/*.json`,
episodes are directories under `episodes/<tenant>/<slug>/`, usage is JSONL, panels
are PNGs on disk, and `review.html` is the review surface. That works for one
operator on one box. It does not work for a hosted product where a Next.js PWA
(sub-project C) and an HTTP API (sub-project B) need to read the episode queue,
show panel previews, and drive approve/publish from anywhere.

**A moves the engine's state into Neon Postgres and Vercel Blob, with no change to
what it generates.** The VPS cron stays as the trigger (`npm run run`). After A,
there is a single source of truth (Neon) that B and C build on, and the on-disk
`episodes/`, `tenants/`, `usage/`, `review.html` artifacts are gone.

This is the parent SaaS design's "Phase 1 moves this into Neon; the shape stays" —
now its own spec because the public-product decision made Phase 1 large enough to
decompose (A engine→Neon, B API, C web PWA, D Stripe billing, E landing,
F content-safety gate).

## Provisioned already

- **Neon project** `ghostwriter` — id `summer-glitter-25536361`, region
  `aws-ap-southeast-1` (Singapore), pg17, default branch `br-cool-sea-b35d1pq6`,
  db `neondb`. `DATABASE_URL` (pooled) is in `~/ghostwriter/.env`.
- The VPS that runs the cron is in the US/EU → cross-region queries to Neon SG.
  Acceptable: `runDueTenants()` is a batch job doing ~tens of queries per episode
  against a run that already takes ~90s for art. Neon stays SG because the app +
  operator are SG.

## Decisions

| Area | Choice |
|---|---|
| ORM / migrations | **Drizzle** (`drizzle-orm` + `drizzle-kit`). Schema-as-TS in `src/db/schema.ts`, shared verbatim by B and C later. |
| DB driver (engine) | `postgres` (postgres.js) via `drizzle-orm/postgres-js` — fine for a short-lived cron process on the pooled URL. B will use `@neondatabase/serverless` against the same schema. |
| Panel storage | **Vercel Blob** (`@vercel/blob`), private store. VPS writes final JPEGs; B mints signed read URLs for C. |
| Raw panels | Local transient cache `.cache/<episodeId>/panel-NN.png` on the VPS (so a re-run doesn't re-pay for art). Pruned after success + on age. Never uploaded. |
| Styles | Stay as repo files `styles/<key>/` (frozen platform assets, git-versioned, deployed with the code). **All three style-refs must be committed** — no runtime style-ref generation on a hosted engine; `gen-art` errors if a style's `style-ref.png` is missing. (Pre-generate + commit `retro-halftone`'s.) |
| Review surface | Deleted. `review.html` / `caption.txt` / `status.json` files go away — the "bundle" is now the `episode` row (story_json, caption, hashtags, status) that C renders. |
| CLI surface | Keep `npm run run` (cron entry, now `--tenant <id>` queries the DB), `npm run story`, `npm run smoke`, `npm run db:*`, `npm test`. **Retire** `npm run art|compose|review|approve|publish` and `tenants/*.json` + `tenants/local.json`. |
| Publish behaviour | Unchanged from Phase 0 and stays in `src/engine/publish.ts`: `autonomy: "autonomous"` → `run.ts` calls `publishEpisode` inline (creates a Zernio **draft**, never `--now`); `review_each` / `review_weekly` → episode stops at `status: "ready"`. B later calls `publishEpisode` on the app's approval for review-gated tenants. A does not add a publish worker. |
| Local dev + CI | `create_branch` off the default branch → a `dev` branch and a `test` branch; point local `DATABASE_URL` at `dev`, the DB integration tests at `test` (migrations applied to both). No local Postgres. |

## Data model (Drizzle, `src/db/schema.ts`)

Enums: `genre` (`funny`,`horror`), `autonomy` (`autonomous`,`review_each`,`review_weekly`),
`episode_status` (`generating`,`ready`,`approved`,`scheduled`,`posted`,`failed`,`rejected`),
`usage_kind` (`image`,`story_tokens`,`post`), `key_owner` (`platform`,`tenant`).

- **tenant** — `id` (text pk, kebab), `owner_user_id` (text, Clerk id; null for
  seed/admin rows in A), `display_name`, `style_key`, `niche` (text), `genres`
  (`genre` \| `'both'`), `autonomy`, `cadence` (jsonb `{days:number[],time:string,tz:string}`),
  `publish` (jsonb `{instagram?:{accountId,handle,format},tiktok?:{...}}`),
  `gemini_key_encrypted` (text, nullable), `active` (bool, default true),
  `created_at`, `updated_at`.
- **episode** — `id` (uuid pk), `tenant_id` (fk), `slug`, `genre`, `title`,
  `logline`, `story_json` (jsonb — the full validated Story), `caption` (text),
  `hashtags` (text[]), `status` (`episode_status`), `blob_prefix` (text —
  `episodes/<tenant_id>/<episode_id>`), `scheduled_for` (timestamptz, null),
  `posts` (jsonb — `[{platform,handle,postId}]`, null), `error` (text, null),
  `created_at`, `approved_at` (null), `posted_at` (null).
  Index `(tenant_id, created_at desc)`.
- **usage_event** — `id` (uuid pk), `tenant_id` (fk), `episode_id` (fk, null for
  style-ref), `kind` (`usage_kind`), `qty` (int), `key_owner` (`key_owner`),
  `cost_cents` (int), `note` (text, null), `created_at`. Index `(tenant_id, created_at)`.
- **run** — `id` (uuid pk), `started_at`, `finished_at` (null until done),
  `tenants_due` (int), `tenants_ok` (int), `tenants_failed` (int),
  `errors` (jsonb — `[{tenantId,message}]`). One row per `runDueTenants()` call,
  for observability. **No `SELECT … FOR UPDATE SKIP LOCKED` job queue in A** — the
  cron loop is serial; a real queue lands when B/C parallelise generation.

Migrations live in `migrations/` (drizzle-kit generated). `npm run db:generate`
(diff schema → SQL), `npm run db:migrate` (apply). Applied to the Neon project's
default branch as part of A; B/C re-run the same migrations on deploy.

## Module changes (`src/`)

| File | Change |
|---|---|
| `src/db/client.ts` | **new** — `db` (drizzle instance over postgres.js), reads `DATABASE_URL` via `loadEnv()` + `requireEnv`. |
| `src/db/schema.ts` | **new** — the tables/enums above. |
| `src/lib/tenant.ts` | Replace file IO. `TenantConfig` type now `= typeof tenant.$inferSelect` (or a mapped view). `listActiveTenants(): Promise<TenantConfig[]>` (`where active = true`), `getTenant(id): Promise<TenantConfig>`. Keep `isDue` / `localParts` **unchanged** (pure). Drop `loadTenant` file version, `listTenants` file scan, `loadLocalTenant`, `TENANTS_DIR`, `safeTenantId` (id validation moves to a zod/drizzle check on insert — B's onboarding — but keep a `/^[a-z0-9-]+$/` assert in `getTenant`). **BYO Gemini key is NOT used in A** — `generateArt` always passes `undefined` (platform key); the `gemini_key_encrypted` column is created for forward-compat but stays unread until B adds decryption. |
| `src/lib/usage.ts` | `logUsage(tenantId, {episodeId?, kind, qty, keyOwner, note?})` → `insert into usage_event`. `estimateCents` unchanged. Drop `readUsage` file version (B queries the table). |
| `src/lib/story.ts` | Keep `Story`/`Panel`/`validateStory`/`panelFile`. **Remove** `EPISODES_DIR`, `resolveEpisodeDir`, `listEpisodes`, `episodeDirFor`. **Add** `src/db/episodes.ts`: `createEpisode(tenantId, story) → {id, blobPrefix}` (status `generating`), `setEpisodeStatus(id, status, patch?)`, `getEpisode(id)`, `recentEpisodes(tenantId, n) → {date, genre, title}[]` (replaces the filesystem `lastEpisodeMeta`). |
| `src/lib/blob.ts` | **new** — `putPanel(blobPrefix, format, n, jpeg): Promise<string>` (→ `<prefix>/final-<format>/NN.jpg`, `access:"public"` off), `putStyleRefIfMissing` is **removed** (refs are committed). Uses `@vercel/blob` + `BLOB_READ_WRITE_TOKEN`. |
| `src/engine/art.ts` | Raw panels → `.cache/<episodeId>/`. `resolveStyle` unchanged. If `!style.hasRef` → **throw** (was: generate). `logUsage` calls gain `episodeId`. `generateImage(..., undefined)` — platform Gemini key only in A (see tenant row). |
| `src/engine/compose.ts` | For each panel: normalise/crop as now, then `putPanel(...)` to Blob for both formats instead of writing `panels/final-*/`. `renderOverlaySvg` untouched. |
| `src/engine/review.ts` | Replace `writeReviewBundle` with `finalizeEpisode(episodeId, story)`: `setEpisodeStatus(id, "ready", { caption, hashtags: formatHashtags(...), storyJson: story })`. Keep `formatHashtags`. No files. |
| `src/engine/publish.ts` | `publishEpisode(tenantId, episodeId, mode, only?)`: load episode + tenant from DB, pull the `final-<format>` JPEGs from Blob (fetch the URLs), `uploadImage`→Zernio→`createPost` as now, `logUsage(kind:"post")`, on `now` set status `posted` + `posts`; on `draft` leave status. Return `{platform,handle,postId}[]`. |
| `src/run.ts` | `runDueTenants({tenantId?,dry?,now_publish?})`: open a `run` row; tenants = `getTenant(id)` or `listActiveTenants()`; `resolveRunPlan` uses `recentEpisodes()` for `isDue`'s `lastEpisodeDate` + genre alternation; per tenant in a try/catch → `createEpisode` → `generateArt` → `composeEpisode` → `finalizeEpisode` → autonomy gate (`autonomous && !dry` → `setEpisodeStatus(id,"approved",{approvedAt})` then `publishEpisode(...,"draft")`; else leave `ready`); accumulate ok/failed; close the `run` row; `process.exitCode = 1` if any failed. |
| `src/write-story.ts` | `writeStory(...)` returns **`{ story: Story; usageTokens: number }`** (was `Promise<Story>`); it no longer calls `logUsage` itself. `run.ts` logs `usage_event(kind:"story_tokens", qty:usageTokens, episodeId)` after `createEpisode`. `StoryInput` drops `tenantId` (only needed for the removed self-log). `buildStoryMessages` + its test unchanged. The `--story` CLI prints `result.story`. |
| `package.json` | add `db:generate`,`db:migrate`,`db:studio`; remove `art`,`compose`,`review`,`approve`,`publish`. deps: `drizzle-orm`, `postgres`, `@vercel/blob`; dev: `drizzle-kit`. |
| `src/lib/env.ts` | unchanged (`requireEnv` covers `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`). |
| delete | `tenants/` (all), `src/approve.ts`, `src/build-review.ts`, `src/gen-art.ts`, `src/compose.ts` (the CLI wrappers — engine funcs stay), `episodes/` from the repo, `.gitignore` lines for `episodes/**` + `usage/` + `tenants/local.json`. |

Existing tests that assert filesystem behaviour (`episodes.test.ts`,
`tenant.test.ts` file cases, `usage.test.ts` file round-trip, `run-plan.test.ts`)
are rewritten against the DB. `isDue`/`cadence`, `style`, `overlay`, `review`
(`formatHashtags`), `select-targets`, `write-story` (`buildStoryMessages`),
`gemini-key` tests are unaffected.

## Seed / migration

- `src/db/seed.ts` (run once, `npm run db:seed`): insert the `singlish` tenant row
  from `tenants/singlish.json`'s current values (`owner_user_id` null), plus a
  second `review_each` tenant `singlish-review` (same niche/style, `autonomy='review_each'`)
  used by verification #4 so #4 and #5 don't fight over one tenant's autonomy.
- **Cut-over sequencing:** the Phase-0 filesystem cron keeps running `singlish`
  until A is merged and deployed to the VPS. On cut-over: `git pull` on the VPS,
  `npm ci`, `npm run db:migrate` (no-op if B already did), swap the crontab
  command (same `npm run run`). The three already-scheduled Zernio posts
  (Sep 1/3/5) are unaffected — they live in Zernio, not our DB.

## Credentials the user must supply

- **`DATABASE_URL`** — done (in `.env`).
- **`BLOB_READ_WRITE_TOKEN`** — the one blocker. Create a Vercel Blob store
  (Vercel dashboard → Storage → Blob, or `vercel blob store add ghostwriter`),
  copy the `BLOB_READ_WRITE_TOKEN`, put it in `~/ghostwriter/.env` and later in
  the VPS `.env` + Vercel project env. Implementation should load the
  `vercel:vercel-storage` skill for exact CLI/SDK steps. Nothing in `compose`
  can be verified end-to-end without it — stop and ask, don't stub.

## Verification

1. **Schema:** `npm run db:migrate` against the Neon project → `run_sql`
   `\dt` shows `tenant, episode, usage_event, run`; enums exist.
2. **Seed:** singlish tenant row present; `listActiveTenants()` returns it;
   `getTenant("singlish")` matches the old JSON values.
3. **Unit:** `npm test` green — pure-logic tests unchanged; DB helper tests hit a
   Neon `test` branch with migrations applied (gated on `DATABASE_URL`).
   `npx tsc --noEmit` 0.
4. **Dry run, review-gated:** `npm run run -- --tenant singlish-review --dry`:
   - a `run` row opens and closes with `tenants_ok=1`
   - one `episode` row, `status='ready'`, `story_json`/`caption`/`hashtags`
     populated, `blob_prefix` set
   - `final-4x5/NN.jpg` + `final-9x16/NN.jpg` (8 each) exist in Vercel Blob under
     the prefix; **no `episodes/` dir on disk**
   - `usage_event` rows: 1 `story_tokens` + 9 `image`, `cost_cents` set
   - console prints "ready — not published"; no Zernio call
5. **Autonomous path:** singlish (`autonomy='autonomous'`) `npm run run -- --tenant singlish`
   → episode `status='approved'` then a Zernio **draft** created (verify via
   `posts_list status=draft`); `usage_event` gains a `post` row. `status` stays
   `approved` (draft mode doesn't flip to `posted`).
6. **Idempotency:** immediately re-run bare `npm run run` on a due day → the
   same-day guard (now via `recentEpisodes`) yields "no tenants due"; no 2nd
   episode row.
7. **Style-ref guard:** rename a style's `style-ref.png` away → `npm run run`
   for a tenant on that style fails with a clear "commit a style-ref for
   <key>" error, `run` row `tenants_failed=1`, episode `status='failed'` + `error`.
8. **Regression:** `styles/`, `renderOverlaySvg` lettering, `formatHashtags`,
   `isDue` timezone math all still pass their tests.

## Out of scope (later sub-projects)

- The HTTP API / any endpoint (B).
- Signed blob read URLs for the client (B).
- Push notifications on `status='ready'` (C).
- `SELECT … FOR UPDATE SKIP LOCKED` job queue / parallel generation (B or C).
- Gemini BYO-key **validation** + encryption-at-rest key management (B onboarding).
- Content-safety classifier before art spend (F).
- Moving the cron off the VPS to Vercel Cron (explicitly not doing — decided).
