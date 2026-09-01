---
name: ghostwriter
description: The story spec for one Ghostwriter comic-carousel episode — an original funny or horror short story told in 6–8 illustrated comic panels in the frozen house style, plus caption and hashtags. This is the human-readable reference for what the headless engine's story prompt encodes. Use when the user runs /ghostwriter, says "new ghostwriter episode", "make a comic carousel", "draft a horror/funny comic story", or asks how a story is structured.
---

# Ghostwriter — the episode spec

Story generation is **DB-backed and headless**. The engine writes the story
itself; this file is the reference for the shape it produces and the rules it
follows.

## Generating an episode

```bash
npm run run -- --tenant <id> --dry
```

One episode for that tenant: the engine writes an original story, generates the
art (raw PNGs cached under `.cache/<episodeId>/`), composites the lettering,
uploads the final panels to Vercel Blob, and inserts an `episode` row with
`status='ready'`. `--dry` skips publishing. Drop `--dry` (autonomous tenants
only) to also push a Zernio draft.

Inspect the result with `npm run db:studio` (the `episode`, `usage_event`, and
`run` tables). There is no local review bundle anymore — the human
review/approve UI is sub-project C (the web app).

`--tenant` is a debug/preview affordance, not the scheduled path: it runs that
one tenant **regardless of its cadence** (no `isDue` gate) and, for a
`genres: "both"` tenant, uses a fixed genre rather than alternating. The real
schedule is the bare `npm run run` invoked by cron.

## Genre alternation

The engine alternates genre against the tenant's recent episodes (last episode
horror → next funny, and vice versa), unless the tenant is pinned to one genre.
First episode for a tenant defaults to `horror`.

## The story

An original, self-contained micro-story built for a swipe carousel:

- **6–8 panels.** Panel 1 is a hook (a striking image + a question the reader
  needs answered). The final panel lands the twist (horror) or the punchline
  (funny). One clean arc, no filler.
- **Fresh cast, 2–4 characters.** Give each a distinct silhouette and 2–4
  `visual_tags` (a garment, a prop, hair, build) so the artist can keep them
  consistent. No recurring characters between episodes.
- **Original only.** Do not adapt Reddit posts, creepypasta, or existing bits.
- **Keep it PG-13 and platform-safe** — see the checklist below.

### story.json schema

The story object is persisted to the `episode.story_json` column by the engine —
it is not written to a file by hand. `<slug>` is 2–4 kebab words from the title;
`date` is the run date.

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

### Safety checklist (must pass)

- Horror = dread, shadow, implication. **No** gore, wounds, blood pooling, body
  horror, or on-panel death detail.
- No real, named people or public figures; no real brands as plot elements.
- No hate, slurs, or targeting of protected groups.
- No depiction or how-to of self-harm, suicide, or drug use.
- No sexual content; characters clothed.
- Nothing that reads as harassment of a real private individual.

If a beat needs one of these to work, rewrite the beat.

## Consistency model

- `styles/<key>/style-bible.md` — the frozen house style, prepended to every art
  prompt. Don't edit it casually; if you do, regenerate that style's
  `style-ref.png` out-of-band and commit the new file.
- `styles/<key>/style-ref.png` — committed once per style, passed as an image
  reference on every panel. **A missing `style-ref.png` now hard-fails every run
  for that style** — the engine no longer auto-generates it.
- per-episode character sheet — generated first, passed as a second reference so
  the one-off cast stays consistent within the episode.
