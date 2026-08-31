---
name: ghostwriter
description: Produce one Ghostwriter comic-carousel episode for TikTok/IG — an original funny or horror short story rendered as 6–8 illustrated comic panels in the frozen house style, plus caption and hashtags, ending at a local review gate. Use when the user runs /ghostwriter, says "new ghostwriter episode", "make a comic carousel", "draft a horror/funny comic story", or wants the next post for the comic account.
---

# Ghostwriter — draft one episode

Run this from the `ghostwriter` repo. One invocation produces a review-ready
carousel; the user approves or tweaks before anything is published.

/ Optional argument: `funny` or `horror` forces the genre.

## Step 1 — pick the genre

1. If the invocation arg is `funny` or `horror`, use it.
2. Else read the most recent `episodes/local/*/story.json` (by folder date) and pick the
   **opposite** of its `genre` to keep the feed varied.
3. If there are no episodes yet, default to `horror`.

## Step 2 — write the story

Write an original, self-contained micro-story built for a swipe carousel:

- **6–8 panels.** Panel 1 is a hook (a striking image + a question the reader
  needs answered). The final panel lands the twist (horror) or the punchline
  (funny). One clean arc, no filler.
- **Fresh cast, 2–4 characters.** Give each a distinct silhouette and 2–4
  `visual_tags` (a garment, a prop, hair, build) so the artist can keep them
  consistent. No recurring characters between episodes.
- **Original only.** Do not adapt Reddit posts, creepypasta, or existing bits.
- **Keep it PG-13 and platform-safe** — see the checklist below.

### story.json schema

Write to `episodes/local/<YYYY-MM-DD>-<slug>/story.json` where `<slug>` is 2–4 kebab
words from the title. `<YYYY-MM-DD>` is today. The `npm run` wrappers below take
just the `<slug>` and resolve the directory themselves.

```jsonc
{
  "date": "2026-08-31",
  "slug": "the-last-carriage",
  "genre": "horror",
  "title": "The Last Carriage",
  "logline": "One sentence, no spoiler — what the reader thinks they're getting.",
  "cast": [
    { "name": "Mara", "description": "late-20s commuter, tired, practical",
      "visual_tags": ["mustard raincoat", "canvas tote", "short black bob"] }
  ],
  "panels": [
    {
      "n": 1,
      "scene": "What is DRAWN in the panel. Concrete, visual, no dialogue text. "
             + "Describe subject, setting, mood, light.",
      "camera": "wide | mid | close | low angle | over-shoulder | etc.",
      "characters": ["Mara"],
      "narration": "Optional caption for this panel, or null. <=180 chars. "
                 + "Use at most one per panel; skip it when the art + dialogue carry the beat.",
      "narration_pos": "top",
      "dialogue": [
        { "speaker": "Mara", "text": "<=60 chars, one balloon", "bubble_pos": [0.32, 0.4] }
      ],
      "sfx": "optional single hand-drawn word e.g. KRRK — omit if none"
    }
  ],
  "caption": "Hook line. 1–2 line tease. Soft follow CTA. No spoiler.",
  "hashtags": ["comics", "horrorcomics", "webcomic", "scarystories", "..."]
}
```

Rules for the fields:

- `scene` describes **only what is illustrated** — never put speech or caption
  text in it. The art model is told to draw no lettering.
- `bubble_pos` is `[x, y]` as fractions `0..1` of the panel; point it near the
  speaker's head, away from faces. Panels render at 9:16 and are centre-cropped
  to 4:5, so keep important bubbles between `y` 0.18 and 0.78.
- `narration` carries voice/time-jumps/interiority. 0–1 per panel, often 0.
- 6–12 `hashtags`: mix broad (`comics`, `storytime`) with niche
  (`liminalhorror`, `sliceoflifecomic`).

### Safety checklist (must pass before saving)

- Horror = dread, shadow, implication. **No** gore, wounds, blood pooling, body
  horror, or on-panel death detail.
- No real, named people or public figures; no real brands as plot elements.
- No hate, slurs, or targeting of protected groups.
- No depiction or how-to of self-harm, suicide, or drug use.
- No sexual content; characters clothed.
- Nothing that reads as harassment of a real private individual.

If a beat needs one of these to work, rewrite the beat.

## Step 3 — generate art

```bash
npm run art <slug>
```

- This needs `GEMINI_API_KEY` in `.env`. If the command reports it missing,
  **stop and tell the user** exactly that — do not fake or skip art.
- It generates `styles/<styleKey>/style-ref.png` once (reused forever), then a
  per-episode `character-sheet.png`, then each panel into `panels/raw/`. Re-running
  only fills in missing panels; delete a panel PNG to force a redo.
- Rough cost: ~$0.30–0.80 for a full episode. Per-image usage is logged to
  `usage/local.jsonl`.

## Step 4 — compose + review

```bash
npm run compose <slug>
npm run review <slug>
```

`compose` adds narration boxes, speech bubbles, header, page counter and
watermark, and writes both `panels/final-9x16/` and `panels/final-4x5/`.
`review` writes `caption.txt` and `review.html`.

Then: **open the `review.html` that `npm run review` prints** for the user (it
emits the exact `open ...` command), give them a 3–4 line summary (title,
logline, panel count, the twist), and wait.

## Step 5 — respond to the user's call

- **Approve:** `npm run approve <slug>`, then publish via Zernio:
  - `npm run publish <slug>` → creates a **draft** post per platform (safe
    default; the user publishes from the Zernio dashboard/app).
  - `npm run publish <slug> -- --now` → publishes immediately. Only run this on
    the user's explicit instruction in the conversation — it's a public post.
  - `npm run publish <slug> -- --only tiktok` → one platform.
  - Targets come from `tenants/local.json` (its `publish` block): Instagram
    `@bennysynthwork` (4:5 set) and TikTok `@ebiyasg` (9:16 set).
  - Needs `ZERNIO_API_KEY` in `.env`. If missing, stop and tell the user.
- **Copy tweak only:** edit `story.json` (narration/dialogue/caption), re-run
  `npm run compose <slug>` then `npm run review <slug>`. No art cost.
- **Art tweak:** edit the relevant `panels[].scene`/`camera`, delete that
  `panels/raw/panel-NN.png`, re-run `npm run art <slug>` then compose + review.

## Notes

- Offline preview of lettering without spending on art:
  `npm run compose <slug> -- --placeholder`.
- Don't edit `styles/graphic-novel-noir/style-bible.md` casually — it's the
  consistency anchor. If you do change it, delete
  `styles/graphic-novel-noir/style-ref.png` so it regenerates.

## Engine mode

`/ghostwriter` and the `npm run art|compose|review|publish` wrappers work for one-off local episodes; they use `tenants/local.json` (gitignored, create your own) or fall back to a built-in default. For scheduled multi-tenant generation, see **`npm run run`** in the README ("Engine (multi-tenant)" section).
