# VPS cut-over (Phase 0 filesystem cron → Neon engine)

1. On the VPS: `git pull && npm ci`
2. Add to the VPS `.env`: DATABASE_URL (Neon **default** branch — ep-round-resonance-…),
   BLOB_READ_WRITE_TOKEN. (Keep the existing GEMINI/ANTHROPIC/ZERNIO keys.)
3. `npm run db:migrate` (idempotent). This applies **all** pending migrations,
   including `0001` (`ADD VALUE 'wuxia'` on the `genre` + `genres` enums) — it must
   run before the `wuxia` tenant is active in prod, or `run` will error on the
   first wuxia episode. Verify: `select enum_range(null::genre)` → `{funny,horror,wuxia}`.
4. `npm run db:seed` (idempotent — `onConflictDoNothing`). Seeds `singlish`,
   `singlish-review`, and `wuxia`.
5. Dry-run once: `npm run run -- --tenant singlish-review --dry`; check the Neon `episode`
   row + Vercel Blob objects.
6. Crontab. Command is unchanged (`npm run run`). Timing:
   - `singlish` (autonomous → Zernio draft): fire time doesn't matter much, keep 01:00 UTC.
   - `wuxia` (autonomy `scheduled`): the run **generates** the episode and creates a
     *scheduled* Zernio post for that day at `cadence.time` (09:00 SGT = 01:00 UTC).
     So the cron must fire a few hours **before** 09:00 SGT — e.g. `0 22 * * 0,2,4` UTC
     (06:00 SGT Mon/Wed/Fri) gives a 3-hour window to cancel in Zernio. If the run
     fires after 09:00 SGT it falls back to scheduling ~2h out.
   One crontab line covers all due tenants; pick a fire time that satisfies the
   earliest `cadence.time` among scheduled tenants.
7. Watch `run.log` + the `run` table for the first live fire. A `scheduled` tenant's
   episode row lands at `status='scheduled'` with `scheduled_for` set; the post shows
   in Zernio's queue.
The 3 posts already scheduled in Zernio (Sep 1/3/5) are independent of this.
