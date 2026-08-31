# Ghostwriter

A pipeline that writes original funny/horror short stories and renders them as
illustrated comic-panel carousels (4:5 + 9:16) for TikTok/IG.

## How it works

The engine is scheduled and multi-tenant. One run walks every tenant whose
cadence is due, writes an original 6–8 panel story headlessly (no human in the
loop), generates the art, composites the lettering, and — for autonomous
tenants — hands the carousel to Zernio as a draft.

```bash
npm run run                              # all due tenants — this is the cron entrypoint
npm run run -- --tenant <id> --dry       # one tenant, generate but don't publish (testing)
```

`--dry` still writes the episode + usage rows to Neon and the panels to Blob; it
just skips the Zernio call.

**Cron:**

```bash
*/15 * * * * cd /path/to/ghostwriter && npm run run
```

## Where state lives

- **Tenants** — rows in the Neon `tenant` table. `src/db/seed.ts` seeds
  `singlish` (autonomous) and `singlish-review` (review_each); `npm run db:seed`
  is idempotent (`onConflictDoNothing`). Inspect with `npm run db:studio`. There
  are no more `tenants/*.json` files.
- **Episodes and usage** — rows in Neon (`episode`, `usage_event`, `run`).
- **Final panels** — JPEGs in Vercel Blob at
  `episodes/<tenantId>/<episodeId>/final-4x5/NN.jpg` and `.../final-9x16/NN.jpg`.
- **Raw panel PNGs** — scratch only, in `.cache/<episodeId>/` (gitignored,
  swept after ~7 days).

## Review / approve

The human review-and-approve gate is a separate web app (sub-project C), not a
local step. Autonomous tenants publish a Zernio draft directly; `review_each`
tenants stop at `status='ready'` for that app to pick up.

## Consistency model

- `styles/<key>/style-bible.md` — the frozen house style for that style,
  prepended to every art prompt. Shipped styles: `graphic-novel-noir`,
  `manga-ink`, `retro-halftone`.
- `styles/<key>/style-ref.png` — committed once per style, passed as an image
  reference on every panel.
- per-episode character sheet — generated first, passed as a second reference so
  the one-off cast stays consistent within the episode.

## Setup

```bash
npm install
cp .env.example .env
```

`.env` needs:

- `DATABASE_URL` — Neon (default branch)
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob store
- `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `ZERNIO_API_KEY`

`DATABASE_URL_TEST` — a Neon test branch — is only needed for `npm test`.

```bash
npm run db:migrate    # apply schema (idempotent)
npm run db:seed       # seed tenants (idempotent)
```

Deploying the VPS cron over from the old Phase-0 filesystem engine:
see `docs/deploy-vps.md`.
