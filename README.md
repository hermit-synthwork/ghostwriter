# Ghostwriter

A Claude Code pipeline that writes original funny/horror short stories and renders
them as illustrated comic-panel carousels (4:5 + 9:16) for TikTok/IG, with a local
review gate.

## How it works

Run **`/ghostwriter`** in Claude Code (optionally `/ghostwriter horror` or
`/ghostwriter funny`). One run:

1. Claude writes an original 6–8 panel story + art direction + caption → `episodes/<date>-<slug>/story.json`
2. `npm run art` — generates the style ref (once), a per-episode character sheet, and each panel via Gemini, keeping one frozen house style
3. `npm run compose` — composites narration boxes, speech bubbles, header, page counter and watermark; outputs `panels/final-4x5/` and `panels/final-9x16/`
4. `npm run review` — writes `caption.txt` and `review.html`
5. You open `review.html`, approve or tweak. `npm run approve <episode>` marks it ready.
6. `npm run publish <episode>` — **deferred** until the TikTok/IG accounts exist (then: Zernio auto-post).

## Consistency model

- `styles/<key>/style-bible.md` — the frozen house style for that style, prepended to every art prompt. There's a menu of styles: `graphic-novel-noir`, `manga-ink`, `retro-halftone`
- `styles/<key>/style-ref.png` — generated once per style, passed as an image reference on every panel
- per-episode character sheet — generated first, passed as a second reference so the one-off cast stays consistent within the episode

## Setup

```bash
npm install
cp .env.example .env   # then paste your GEMINI_API_KEY, ANTHROPIC_API_KEY, ZERNIO_API_KEY
```

Create `tenants/local.json` (gitignored; see Local Configuration below). The `/ghostwriter` skill and `npm run art|compose|review|publish` wrappers use it for one-off local episodes.

## Local Configuration

The single-tenant `tenants/local.json` is used by `/ghostwriter` and the CLI wrappers (`npm run art`, `npm run compose`, `npm run review`, `npm run publish`). It's gitignored — create your own:

```json
{
  "id": "local",
  "displayName": "GHOSTWRITER",
  "styleKey": "graphic-novel-noir",
  "niche": "everyday life with a strange edge",
  "genres": "both",
  "autonomy": "review_each",
  "cadence": { "days": [1,3,5], "time": "09:00", "tz": "Asia/Singapore" },
  "publish": {
    "instagram": { "accountId": "6a911cf277555aae013ed010", "handle": "bennysynthwork", "format": "4x5" },
    "tiktok": { "accountId": "6a94ee1077555aae012c1ca6", "handle": "ebiyasg", "format": "9x16" }
  }
}
```

## Engine (multi-tenant)

The core engine runs a scheduled multi-tenant story generator. Configuration is per-tenant in `tenants/<id>.json` files (see examples in `tenants/demo-a.json` and `tenants/demo-b.json`).

**Styles:** Three shipped style palettes are available:
- `graphic-novel-noir` — noir palette, high contrast
- `manga-ink` — black-and-white manga style
- `retro-halftone` — retro halftone dots

**Commands:**

- `npm run run -- --tenant demo-a --dry` — single-tenant dry run; outputs panels, caption, and review bundle without publishing
- `npm run run` — generate episodes for all tenants due according to their cadences

**Cron scheduler:**

Add this line to your crontab to run the engine every 15 minutes:

```bash
*/15 * * * * cd /path/to/ghostwriter && npm run run
```

**Environment:** The engine requires `ANTHROPIC_API_KEY` (in `.env`) alongside `GEMINI_API_KEY` and `ZERNIO_API_KEY`, since story generation is now headless.
