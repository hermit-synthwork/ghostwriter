-- Prod cut-over: TIDEBREAKER serialized mecha series on @bennysynthwork.
--
-- Order (see docs/adding-a-content-line.md §6 "Serialized lines"):
--   1. PR merged; migration 0006_series applied to Neon main (`npm run db:migrate`).
--   2. VPS: `git pull && npm ci` (adds @fontsource/m-plus-rounded-1c and series/tidebreaker/).
--   3. Run this file against Neon main. The tenant lands INACTIVE.
--   4. Dry run on the VPS: `npm run run -- --tenant mecha --dry` → check EP 1 in the review app.
--   5. Go live: run the commented UPDATE at the bottom.
--
-- Posts twice a week, Tuesday + Saturday. No crontab change: `0 1 * * 0,2,4,6` (UTC)
-- already fires Tue and Sat at 09:00 SGT, which satisfies isDue for a review_each
-- tenant with cadence.time 09:00.

BEGIN;

INSERT INTO tenant (
  id, owner_user_id, display_name, style_key, series_key, niche, language,
  genres, autonomy, cadence, publish, active, onboarding_status
) VALUES (
  'mecha',
  NULL,
  'TIDEBREAKER',
  'mecha-anime',
  'tidebreaker',
  'TIDEBREAKER — a serialized mecha anime about Hana, a rookie pilot holding a flooded harbour city''s storm wall in a patched-up salvage frame. Follow the series bible.',
  'en',
  'drama_funny',
  'review_each',
  '{"days": [2, 6], "time": "09:00", "tz": "Asia/Singapore"}'::jsonb,
  '{"instagram": {"accountId": "6a911cf277555aae013ed010", "handle": "bennysynthwork", "format": "4x5"}}'::jsonb,
  false,
  'active'
)
ON CONFLICT (id) DO NOTHING;

SELECT id, style_key, series_key, genres, autonomy, cadence, active
FROM tenant WHERE id = 'mecha';

COMMIT;

-- Go live after the dry-run episode has been reviewed:
-- UPDATE tenant SET active = true, updated_at = now() WHERE id = 'mecha';
--
-- After episodes 1-3 have been reviewed and look right, optionally stop reviewing each one:
-- UPDATE tenant SET autonomy = 'scheduled', updated_at = now() WHERE id = 'mecha';
