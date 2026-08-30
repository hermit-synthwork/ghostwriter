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

- `config/style-bible.md` — the frozen house style, prepended to every art prompt
- `assets/style-ref.png` — generated once, passed as an image reference on every panel
- per-episode character sheet — generated first, passed as a second reference so the one-off cast stays consistent within the episode

## Setup

```bash
npm install
cp .env.example .env   # then paste your GEMINI_API_KEY
```

Only `npm run art` needs the key. `compose` / `review` run offline.
