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
6. Swap the crontab line — command is unchanged (`npm run run`), so usually nothing to edit.
7. Watch `run.log` + the `run` table for the first live fire.
The 3 posts already scheduled in Zernio (Sep 1/3/5) are independent of this.
