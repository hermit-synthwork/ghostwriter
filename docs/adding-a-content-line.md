# Adding a content line

A "content line" = a tenant that produces carousels in a distinct look and voice.
Sometimes it reuses an existing style + genre (just a new `niche` + publish target);
sometimes it needs a new house style and/or a new genre value. The **wuxia** line
(added 2026-09-01) is the worked example below — it needed both. The **anime**
line (added 2026-09-07) is the lighter case: a new `japanese-anime` style but
**no** new genre — it rides the existing `funny` arc, so it skipped section 2
entirely (no schema migration, no tsc-union edits).

## 0. Decide the scope

- **New style?** Yes if the visual idiom is genuinely different from the
  shipped ones (`graphic-novel-noir`, `manga-ink`, `retro-halftone`,
  `wuxia-manhua`, `japanese-anime`, `ninja-anime`, `mecha-anime`).
- **New genre value?** Yes if the story *shape* differs — the engine knows
  `funny` (punchline), `horror` (dread/twist), `wuxia` (decisive turn) and `drama`
  (serialized turn or cliffhanger). A line that is "funny but about X" is just a new
  `niche`, not a new genre.
- **Standalone or serialized?** Standalone lines get a fresh cast every episode.
  A serialized line (recurring cast, continuing arc, recaps) is supported — follow
  §6 on top of §1–§5.
- **Autonomy** — `review_each` (every episode waits for manual approval),
  `autonomous` (engine approves + pushes a Zernio **draft**, you publish there), or
  `scheduled` (engine approves + creates a **scheduled** Zernio post for that day at
  `cadence.time` — no human step; cancel in Zernio's queue if needed). For
  `scheduled`, `cadence.time` is the publish time and the trigger must run a few
  hours earlier (see `docs/deploy-vps.md`).
- **Publish target** — an Instagram (or TikTok) `accountId` already connected in
  Zernio. Reuse `@bennysynthwork` to test, swap later. **Instagram** auto-publishes
  (draft / scheduled / now all work headless). **TikTok** photo carousels always go
  via **Creator Inbox** (`tiktokSettings.draft: true`) — TikTok's direct photo-post
  API is audit-gated and often at capacity, so the reliable path is: the run
  delivers the post to the account's TikTok inbox and a human taps "Post" once in
  the app (caption + photos already attached). So a `scheduled` tenant is fully
  hands-off on IG but needs one tap per episode on TikTok.
- **Which Zernio account** — by default every tenant publishes with the shared
  `ZERNIO_API_KEY`. To give a line its own Zernio account (separate billing /
  account limits / isolation), set `ZERNIO_API_KEY_<TENANT_ID>` in `.env` (id
  uppercased, non-alphanumeric → `_`, e.g. `ZERNIO_API_KEY_WUXIA`). `publishEpisode`
  picks it up automatically; the target `accountId` in the tenant row must be an
  account connected inside *that* Zernio.

## 1. Style assets — `styles/<key>/`

Three files, all required (`resolveStyle` throws without the bible; `ensureStyleRef`
hard-fails every run without the ref):

- **`style-bible.md`** — match the compact template (`styles/manga-ink/style-bible.md`):
  `# Ghostwriter house style — <key> (FROZEN)` H1, one rendering paragraph, a `Tone:`
  paragraph, a `Characters:` paragraph, then the four shared hard-rule bullets
  (no lettering in the image; faces + action in the central vertical 80%; top ~18% /
  bottom ~22% calm for caption bars; SFX-word exception). Prepended verbatim to every
  art prompt.
- **`tokens.json`** — one line, `{ "ink": "#…", "paper": "#…", "accent": "#…" }`, keys
  in that order. These three colours drive **every burned-in overlay element**: name
  chip (bg `ink`, text `paper`), narration box (bg `ink`, left border `accent`),
  speech bubble (fill `paper`, outline `ink`, speaker label `accent`). Check the
  `accent`-on-`paper` contrast stays legible.
- **`style-ref.png`** — generate once, eyeball, commit. From the repo root with
  `GEMINI_API_KEY` in `.env`:
  ```bash
  tsx -e '
  import { generateImage } from "./src/gemini.ts";
  import { readFileSync, writeFileSync } from "node:fs";
  const bible = readFileSync("styles/<key>/style-bible.md","utf8");
  const { png } = await generateImage(
    bible + "\n\nReference key-art frame establishing this house style: <one strong on-genre scene>. No lettering.",
    [], "9:16");
  writeFileSync("styles/<key>/style-ref.png", png);
  '
  ```
  The bytes write straight to `.png` (they are usually JPEG; `imageRef` in
  `src/engine/art.ts` sniffs the magic bytes). Open it — on-palette, on-idiom, **no
  lettering**, calm top/bottom bands. Off-style → tune the rendering paragraph and
  the scene sentence, regenerate (~3¢ each). Then `git add styles/<key>/style-ref.png`.

Update `test/style.test.ts`: add `<key>` to the "shipped styles" list, and (optional)
a `resolveStyle("<key>")` bible/tokens/`hasRef` test.

## 2. New genre value (only if adding one)

1. **`src/db/schema.ts`** — append the value **last** in both `pgEnum` arrays:
   `genreEnum` (episode-level: `funny|horror|<new>`) and `genresEnum` (tenant-level:
   `funny|horror|both|<new>`).
2. **Widen the TS unions** everywhere `"funny" | "horror"` appears — the compiler
   (`npx tsc --noEmit`, `src/**` only) forces this to travel with the schema edit:
   `src/lib/story.ts` (`Genre`), `src/write-story.ts` (`StoryInput.genre` + CLI cast),
   `src/run.ts` (`RunPlanItem`, the `const genre:` annotation, the `--tenant` cast —
   three sites), `src/db/episodes.ts` (`EpisodeMeta.genre`), `src/lib/tenant.ts`
   (`TenantConfig.genres`).
3. **`src/write-story.ts` SYSTEM string** — extend the one shared string, do **not**
   add a per-genre branch: the arc-shape rule gets a `(<new>)` clause; add a rule
   describing the new arc shape and any allowed flavour; extend the "original only"
   rule and the PG-13 safety rule with genre-specific limits; update the JSON-shape
   `"genre": "…"` line. The USER builder already interpolates `Genre: ${input.genre}`.
4. **`npm run db:generate`** → new `migrations/000N_*.sql`. Inspect it — expect
   `ALTER TYPE "public"."<enum>" ADD VALUE '<new>';` (×2). If drizzle-kit proposes
   dropping/recreating the enum, hand-write the file instead. Hand-edit to
   `ADD VALUE IF NOT EXISTS '<new>'` for idempotency across branches.
5. **Apply:** `npm run db:migrate` (dev), `npm run db:migrate:test` (test). **Prod
   runs at the VPS cut-over** (`docs/deploy-vps.md`) — the migration must land before
   a tenant using the new value is active, or `run` errors on the first episode.
6. **Verify per branch:**
   ```bash
   tsx -e 'import {db,closeDb} from "./src/db/client.ts"; import {sql} from "drizzle-orm";
   const r=await db.execute(sql`select enum_range(null::genre) g, enum_range(null::genres) gs`);
   console.log(r[0]); await closeDb();'
   ```
   Add an `enum_range` assertion to `test/db-schema.test.ts`.
   - Neon is PG17 → `ADD VALUE` runs fine inside drizzle's migration transaction (the
     file never *uses* the value). If a pooled-conn "cannot run inside a transaction
     block" ever appears, run the `IF NOT EXISTS` statements via `mcp__neon__run_sql`
     (no txn) per branch, then re-run `db:migrate` (recorded no-op).

## 3. Tenant row — `src/db/seed.ts`

Add an object to the `db.insert(tenant).values([...])` array:

```ts
const <id> = {
  id: "<id>", ownerUserId: null, displayName: "<CHIP NAME>", styleKey: "<key>",
  niche: "<the whole creative brief — one long string, ~500 chars, like `singlish`>",
  genres: "<genre>" as const, autonomy: "review_each" as const,
  cadence: { days: [0, 2, 4, 6], time: "09:00", tz: "Asia/Singapore" },
  publish: { instagram: { accountId: "<zernio account id>", handle: "<handle>", format: "4x5" as const } },
};
```

`displayName` is the chip burned onto every panel. `onConflictDoNothing` on the
insert means re-seeding is safe but will **not** update an existing row — later edits
(niche tweaks, swapping to a dedicated IG account) are an `UPDATE` via `npm run
db:studio` or SQL:

```sql
UPDATE tenant
SET publish = jsonb_set(jsonb_set(publish,'{instagram,accountId}','"<NEW_ID>"'),
                        '{instagram,handle}','"<new_handle>"'),
    updated_at = now()
WHERE id = '<id>';
```

Run `npm run db:seed` (dev) and, so DB tests + the dry run resolve it,
`DATABASE_URL=$DATABASE_URL_TEST npm run db:seed` (test). Prod seed is part of the
VPS cut-over.

## 4. Docs

Update `.claude/skills/ghostwriter/SKILL.md` — the frontmatter `description`, the
"Genre" section, "The story" bullets, the story.json `"genre"` line, and the safety
checklist — so the human-readable spec covers the new line.

## 5. Verify end to end

```bash
npx tsc --noEmit          # 0
npm test                  # all green (--test-concurrency=1)
npm run run -- --tenant <id> --dry
```

Then check the new `episode` row: `status='ready'`, `genre='<genre>'`,
`story_json.genre` matches, `blob_prefix='episodes/<id>/<uuid>'`, `panel_urls`
populated; `usage_event` has one `story_tokens` + N `image` rows; the `run` row
closed with `tenants_ok=1`. Panels land in Vercel Blob under `episodes/<id>/<uuid>/`.
Nothing posts (`review_each` + `--dry`).

## 6. Serialized lines

A serialized line is a tenant with `series_key` set. The worked example is
**TIDEBREAKER** (`series/tidebreaker/`, tenant `mecha`, style `mecha-anime`):
the same pilot and frames every week, a numbered season arc, and every panel lettered
with English bubbles plus a 中文 / 日本語 subtitle strip.

1. **Canon — `series/<key>/`** (committed; the VPS runs from git):
   - `series-bible.md` — world, fixed facts, main cast, frames/props, design rules, the
     numbered season arc (one beat per episode), comic-relief rules, tone, banned
     lookalikes. Get the operator's approval before generating anything.
   - `cast.json` — `{ title: {en, zh, ja}, styleKey, cast: [...], mechs: [...], maxGuests }`;
     every figure has `name`, `name_zh`, `name_ja`, `description`, `visual_tags`. Names
     here are the only names the writer may use for recurring characters.
   - `cast-sheet.png` + `mech-sheet.png` — model sheets passed as references on **every**
     panel of every episode (never regenerated per episode). Generate candidates, pick,
     copy into place:
     ```bash
     npx tsx scripts/gen-series-sheet.ts <key> ref 2    # style-ref candidates (then copy to styles/<styleKey>/)
     npx tsx scripts/gen-series-sheet.ts <key> cast 2   # needs the style-ref committed first
     npx tsx scripts/gen-series-sheet.ts <key> mech 2
     ```
     Candidates land in `.cache/series-candidates/<key>/`. Reject any with printed
     labels, insignia, lookalike designs or bordered strips — the panels copy them.
2. **Tenant** — `series_key: "<key>"`, `style_key` = the canon's `styleKey`,
   `genres: "drama_funny"` (the writer picks `drama` or `funny` per episode),
   `autonomy: "review_each"` for the first episodes, `active: false` until a dry run
   has been reviewed. Prod insert: a `docs/cutover-*.sql` like
   `docs/cutover-2026-09-15-mecha-series.sql`.
3. **What the engine does differently** (all keyed off `tenant.seriesKey`):
   - `write-story.ts` uses the separate `SERIES_SYSTEM` prompt with the bible, canon
     JSON, `Episode number: N` and a recap of the last 4 canon episodes
     (approved/scheduled/posted, from `story_json.series`). The standalone prompt is
     unchanged.
   - `validateSeriesStory` — 6–8 panels, ≤2 dialogue lines per panel, `zh`/`ja` on every
     line, narration translations, `caption_zh`/`caption_ja`, at most `maxGuests`
     non-canonical names.
   - `episode.episode_number` is assigned by the engine (`nextEpisodeNumber`); a failed
     or rejected episode frees its number for the retry.
   - `resolveRunPlan` skips the tenant while its newest episode is still `ready`, so a
     story never builds on an unreviewed episode.
   - `art.ts` passes `[style-ref, cast-sheet, mech-sheet]` (+ a per-episode sheet only
     for a one-off guest).
   - `letter.ts` pins narration top (with translations) and stacks English bubbles
     above the subtitle strip; the caption becomes `EP NN · title` + English + 中文 + 日本語.
4. **Draft a story without art** (~1–2¢) to sanity-check the canon and translations:
   `npx tsx src/write-story.ts --series <key> --episode 1`.
5. **Instagram cap** — Zernio/Instagram carousels allow at most 10 images, and
   `buildPostBody` refuses more.
