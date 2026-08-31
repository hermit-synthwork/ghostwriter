# Ghostwriter house style (FROZEN)

This description is prepended to every art-generation prompt. Change it only on a
deliberate restyle, then delete `assets/style-ref.png` so it regenerates.

## Medium & rendering

Modern graphic-novel illustration. Clean confident ink linework of even weight,
closed contours, no sketchiness. Bold **spot blacks** for shadow shapes. Flat
color fills with a single soft cel-shade step — no airbrush, no photoreal
gradients. Subtle **halftone dot texture** in mid-shadows only. Every panel framed
by a heavy uniform black border, ~14px, with slightly rounded outer corners.

## Palette

Desaturated and moody. Ink black `#0E0E10`, bone paper `#EDE7DB`, cold slate
`#3A4652`, muted teal `#4E7C77`, dried-blood accent `#7A2E2E`. Warm content
(comedy beats) may push the teal toward `#C9A24B` ochre. Never fully saturated
primaries. Overall low-key value structure, strong silhouette reading.

## Composition

Cinematic staging, clear single focal point per panel, generous negative space.
Characters mid-shot to wide by default; close-ups reserved for punchlines and
scares. Slight low or high camera angles for tension. Backgrounds present but
simplified to essential shapes.

## Tone

Deadpan. Dry wit for the funny stories; quiet dread for the horror ones — unease
over gore. Horror stays PG-13: no blood pooling, no wounds, no body horror.
Suggestion and shadow do the work.

## Characters

A fresh cast every episode. Ordinary, slightly stylised proportions (heads a touch
large, hands expressive). Distinct silhouettes and a memorable prop or garment per
character so readers track them across panels.

## Hard rules for panel art

- **No lettering of any kind in the image** — no speech balloons, caption boxes,
  signs with readable text, UI text. Those are composited later in code.
- Keep faces and key action inside the central vertical 80% of the frame.
- Keep the top ~18% and bottom ~22% visually calm (sky, wall, floor, plain
  shadow) so caption bars sit cleanly over them.
- One exception: if a panel explicitly calls for a hand-drawn SFX word
  (e.g. KRRK, THUD), integrate it as part of the illustration.
