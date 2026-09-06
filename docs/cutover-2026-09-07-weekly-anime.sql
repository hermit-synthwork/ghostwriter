-- Prod cut-over for PR "Weekly staggered cadence + japanese-anime content line"
-- Target: Neon project summer-glitter-25536361, default branch `main`
--         (endpoint ep-round-resonance-b3mzsvg1-pooler) — the prod DATABASE_URL
--         in ~/ghostwriter/.env on the VPS.
--
-- Run this AFTER the PR is merged and the VPS has `git pull && npm ci`
-- (the engine hard-fails a run if styles/japanese-anime/style-ref.png is missing).
-- Safe to re-run: cadence UPDATEs are idempotent, the INSERT is ON CONFLICT DO NOTHING.

BEGIN;

-- 1. Cadence -> once a week, staggered. db:seed won't touch existing rows
--    (onConflictDoNothing), so these must be explicit UPDATEs.
UPDATE tenant
SET cadence = jsonb_set(cadence, '{days}', '[6]'::jsonb), updated_at = now()
WHERE id IN ('singlish', 'singlish-review');   -- Saturday

UPDATE tenant
SET cadence = jsonb_set(cadence, '{days}', '[3]'::jsonb), updated_at = now()
WHERE id = 'wuxia';                            -- Wednesday

-- 2. New "anime" line — funny genre, japanese-anime style, scheduled,
--    IG-only test on @bennysynthwork (shared ZERNIO_API_KEY).
INSERT INTO tenant
  (id, owner_user_id, display_name, style_key, niche, language, genres, autonomy, cadence, publish)
VALUES (
  'anime', NULL, 'SENPAI', 'japanese-anime',
  'Anime slice-of-life comedy set in an unnamed Japanese high school and its neighbourhood — club rooms after class, the culture festival, rooftop lunches, the walk home past the konbini and the vending machines, cram school, a first part-time job, the sports club that treats every practice like a tournament final. Fresh cast every episode: the deadpan class rep, the try-hard underclassman, the club president with one obsession, the transfer student. Lean into anime staples — dramatic reaction shots, a confession under the sakura tree that goes sideways, an over-narrated inner monologue, a training montage for something trivial — and land each story on a punchline that pops an everyday teenage truth. Warm, never mean-spirited; PG-13, mild language only. Original characters and stories only — no real anime, studios, franchises, or characters.',
  'en', 'funny', 'scheduled',
  '{"days":[5],"time":"09:00","tz":"Asia/Singapore"}'::jsonb,
  '{"instagram":{"accountId":"6a911cf277555aae013ed010","handle":"bennysynthwork","format":"4x5"}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 3. Check
SELECT id, style_key, genres, autonomy, cadence->'days' AS days,
       publish->'instagram'->>'handle' AS ig
FROM tenant ORDER BY id;

COMMIT;
