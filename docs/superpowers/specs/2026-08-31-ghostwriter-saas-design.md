# Ghostwriter SaaS — design

## Context

`~/ghostwriter` is a working single-tenant pipeline: it writes an original
funny/horror short story, renders it as illustrated comic panels in one frozen
house style (4:5 + 9:16), composites lettering, and posts a carousel to Instagram
and TikTok via Zernio. It has published live (`@bennysynthwork` IG carousel,
verified on the profile).

The goal now is to **sell it as a self-serve product**: anyone signs up, connects
their own IG/TikTok, picks a niche + a house style + a cadence, and gets comic
carousels generated and posted for them — fully autonomous or gated by a review
step, their choice. Cheaper subscription tier if they bring their own Gemini key.

The current pipeline becomes the **generation engine**. Everything else is new.

## Decisions locked (from brainstorming)

| Question | Decision |
|---|---|
| Customer | Anyone growing a social account, any vertical. Self-serve. |
| Per-post control | **Per-tenant setting**: `autonomous` \| `review_each` \| `review_weekly`. |
| API keys / cost | **Hybrid**: platform keys by default with a per-tier usage cap; tenant can add their own Gemini key for a cheaper tier + higher cap. |
| MVP | Self-serve dashboard (full app), built in phases. |
| Style | **Fixed menu** of ~6 curated house styles. No per-tenant custom style bible in v1. |
| Social connection | **Self-serve OAuth** via Zernio `connect` endpoint (confirmed supported). |

## Stack (all existing tooling)

| Concern | Choice |
|---|---|
| App + API + marketing site | Next.js App Router on **Vercel** |
| DB | **Neon** Postgres |
| Auth | **Clerk** (Clerk Orgs later, only if agency demand appears) |
| Panel / asset storage | **Vercel Blob** (private) |
| Generation run | **Vercel function** (Fluid, 300s limit; an episode is ~90s) triggered by **Vercel Cron** — no separate worker service in v1 |
| Story text | Anthropic API (`claude-*`), headless |
| Art | Gemini image model (`gemini-3.1-flash-image` default) — platform key or tenant BYO key |
| Posting | **Zernio** — one Zernio team/key, one **profile per tenant**, post per `accountId` |
| Billing | **Stripe** |

## Style menu

~6 named house styles, each a frozen prose style bible + a pre-generated
`style-ref.png` committed as an asset (generated once by us, not per tenant).
Working set: `graphic-novel-noir` (current), `ligne-claire-bright`,
`manga-ink`, `newspaper-strip`, `storybook-gouache`, `retro-halftone`.
Tenant picks one at onboarding; can switch (regenerates nothing — the style-ref
is shared). Adding a style later = author a bible + generate its ref + ship.

## Data model (sketch — Neon)

- **tenant** — `id`, `clerk_user_id`, `status`, `style_key`, `niche` (free text +
  tone flags), `genres` (`funny`/`horror`/`both`), `autonomy`
  (`autonomous`/`review_each`/`review_weekly`), `cadence` (cron-ish: days + local
  time + timezone), `zernio_profile_id`, `gemini_key_encrypted` (nullable),
  `plan`, `created_at`.
- **connected_account** — `id`, `tenant_id`, `platform`, `zernio_account_id`,
  `handle`, `format` (`4x5`/`9x16`), `connected_at`.
- **episode** — `id`, `tenant_id`, `slug`, `genre`, `title`, `logline`,
  `story_json` (jsonb), `status` (`draft`/`generating`/`ready`/`approved`/
  `posted`/`failed`/`rejected`), `panel_blob_prefix`, `caption`, `created_at`,
  `scheduled_for`, `posted_at`, `posts` (jsonb: per-platform ids).
- **job** — `id`, `tenant_id`, `kind` (`generate`/`compose`/`publish`),
  `episode_id`, `run_after`, `attempts`, `state`, `last_error`. Simple
  `SELECT … FOR UPDATE SKIP LOCKED` queue table; no external queue in v1.
- **usage_event** — `id`, `tenant_id`, `kind` (`image`/`story_tokens`/`post`),
  `qty`, `cost_estimate_cents`, `billing_key_owner` (`platform`/`tenant`),
  `created_at`. Drives caps + invoicing.

## Phase plan

### Phase 0 — Tenant-aware engine  *(ships: run N of our own accounts unattended)*

Make the existing pipeline callable per tenant and headless.

- **`src/write-story.ts`** — new. Anthropic API call; system prompt = the story
  spec currently in `SKILL.md`; input = `{ genre, niche, styleKey, priorTitles }`;
  output = validated `story.json`. This replaces the "Claude writes it in-session"
  step.
- **Refactor** `gen-art.ts` / `compose.ts` / `publish.ts` from CLI scripts into
  functions in `src/engine/` that take a **tenant config object** + an episode
  directory. Keep thin CLI wrappers for local dev.
- **Tenant config** — for Phase 0, a `tenants/<id>.json` file:
  `{ id, styleKey, niche, genres, autonomy, cadence, publish: {instagram?,tiktok?}, geminiKey? }`.
  (Phase 1 moves this into Neon; the shape stays.)
- **`src/run.ts`** — `runDueTenants()`: for each active tenant whose cadence is
  due and who has no pending episode, run write-story → gen-art → compose →
  (autonomy gate) → publish (draft or now). Log `usage_event`s to a local file
  in Phase 0.
- **Deploy** — a tiny scheduler: `node src/run.ts` on a cron (local `launchd` or
  a Railway cron) hitting `runDueTenants()`. Phase 1 replaces this with Vercel
  Cron → API route.
- **Style assets restructure** — move `config/style-bible.md` + `assets/style-ref.png`
  to `styles/<key>/style-bible.md` + `styles/<key>/style-ref.png`. The current
  style becomes `styles/graphic-novel-noir/`. Land 2–3 styles so multi-style is
  exercised; `gen-art.ts` takes `styleKey` and resolves the pair.

### Phase 1 — Dashboard + accounts  *(ships: us + hand-picked beta users)*

- Next.js + Clerk + Neon. Port tenant/episode/job/usage tables.
- Dashboard: episode queue with panel previews (from Blob), approve / reject /
  edit-caption, per-tenant settings (style, niche, genres, autonomy, cadence).
- Generation moves to a Vercel function; Vercel Cron every ~15 min calls
  `runDueTenants()` + drains the `job` table.
- Tenants still created by us (admin form / SQL). No signup yet.
- `review_each` → episode sits `ready` until approved in the dashboard.
  `review_weekly` → batch view. `autonomous` → auto-advances to publish.

### Phase 2 — Self-serve onboarding  *(ships: strangers can sign up)*

- Signup (Clerk) → create `tenant` + Zernio `profile`.
- Connect socials: call Zernio `GET /connect/{platform}?profileId&redirect_url`,
  redirect to `authUrl`, handle callback, store `connected_account`.
- Onboarding wizard: pick style (visual menu), describe niche, choose genres,
  set cadence, optionally paste a Gemini key (stored encrypted).
- First episode generated immediately as a sample (not posted) so the user sees
  output before committing.

### Phase 3 — Billing  *(ships: it earns)*

- Stripe Checkout + customer portal. Tiers, e.g.:
  - **BYO-key** — lower price, tenant's Gemini key, higher monthly episode cap.
  - **Managed** — higher price, our key, lower cap; overage blocked (not billed)
    until Phase 4.
- Enforce caps from `usage_event` before each run; soft-warn at 80%.
- COGS per tenant to price against: Zernio connected-account fee
  (**$0 for first 2 platform-wide, then ~$3–6/account/mo graduated**) +
  ~$0.20–0.40 Gemini per episode (managed tier) + Anthropic story tokens
  (cents) + Vercel/Neon overhead.

### Phase 4 — Polish

Analytics (pull post performance from Zernio Analytics API), more styles,
referrals, the Reel/video format (panels → pan/zoom MP4 + track), Clerk Orgs for
agencies.

## Zernio integration notes

- One Zernio API key (ours). One **profile per tenant** (`profiles.create`).
- Connect flow: `GET /api/v1/connect/{platform}?profileId=…&redirect_url=…`
  (Bearer) → `authUrl` → user OAuths → callback → the profile now has a
  connected account; read its `accountId` for posting.
- Posting: `POST /v1/posts` with `platforms:[{platform,accountId}]`, `isDraft` or
  `publishNow`. Already implemented in `src/lib/zernio.ts` + `src/publish.ts`
  (multi-platform, per-format upload reuse).
- **Billing dependency**: Zernio charges per connected account (graduated
  $6→$3→$1, first 2 free). This is a real per-tenant COGS line — must sit inside
  the subscription price. A tenant on IG+TikTok = 2 accounts.
- Media: presign (`POST /v1/media/presign`) → PUT bytes → `publicUrl`. Temp
  storage 7 days; a post publishing within that window copies to permanent.

## Open questions (resolve when the phase lands)

- **Phase 1:** panel preview — serve Blob via signed URLs or proxy through a
  Next route? (lean: signed URLs.)
- **Phase 2:** IG connection via Zernio requires an IG *Business/Creator* account
  linked to a Facebook Page — onboarding must detect and guide this. Confirm
  Zernio's error surface for a personal IG.
- **Phase 2:** Gemini BYO key validation at entry (cheap models-list call) +
  encryption at rest (Neon `pgcrypto` or app-layer KMS).
- **Phase 3:** managed-tier overage — hard-block vs metered billing.
- **Content safety at scale:** the per-episode PG-13 checklist is currently a
  prompt instruction. Multi-tenant needs a real gate — a classifier pass on the
  generated story before art spend, and a takedown path.
- **Abuse:** rate-limit signups; the managed Gemini key is a spend vector.

## Implementation scope

The implementation plan that follows this spec covers **Phase 0 only** —
the tenant-aware, headless engine plus its file-based tenant config and cron
runner. Phases 1–4 get their own spec → plan cycle when they land.

## Verification — Phase 0

1. `tenants/demo-a.json` (style `graphic-novel-noir`, IG only, `autonomous`) and
   `tenants/demo-b.json` (style `manga-ink`, IG+TikTok, `review_each`).
2. `node src/run.ts --tenant demo-a` → episode generated, both formats composed,
   **draft** created in Zernio (autonomy `autonomous` + a `--dry` guard so v0
   never auto-publishes without `--now`). Verify in Zernio dashboard.
3. `node src/run.ts --tenant demo-b` → episode reaches `ready`, no post made.
4. Style check: demo-a and demo-b episodes render in visibly different house
   styles, each internally consistent across its panels.
5. `usage_event` log shows image count + estimated cost per run.
6. `node src/run.ts` (no tenant) → processes only tenants whose cadence is due;
   running twice in the same window does not double-generate.
7. `write-story` output passes `validateStory()` for 20 consecutive runs across
   both genres and 2 niches (no schema drift, panel count 6–8).

## Out of scope (v1 entirely)

Per-tenant custom art styles · video/Reels · non-IG/TikTok platforms ·
team/agency multi-seat · in-app analytics · A/B of captions · scheduling smarter
than fixed weekly slots.
