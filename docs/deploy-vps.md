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
6. Crontab. Command is unchanged (`npm run run`). One line covers every tenant:
   `0 1 * * 0,2,4,6` UTC = Sun/Tue/Thu/Sat 09:00 SGT (no posts Mon/Wed/Fri).
   - `review_each` / `autonomous` tenants use `cadence.time` 09:00, so the 09:00 trigger
     passes their time gate.
   - `scheduled` tenants (`wuxia`, `anime`) **generate** at the 09:00 trigger and create a
     *scheduled* Zernio post at their `cadence.time` of 10:00 — an hour to cancel in
     Zernio. If a run ever starts after `cadence.time` it falls back to ~2h out.
   A new tenant must use one of those four weekdays, or add its day to the cron.
7. Watch `run.log` + the `run` table for the first live fire. A `scheduled` tenant's
   episode row lands at `status='scheduled'` with `scheduled_for` set; the post shows
   in Zernio's queue.
The 3 posts already scheduled in Zernio (Sep 1/3/5) are independent of this.
