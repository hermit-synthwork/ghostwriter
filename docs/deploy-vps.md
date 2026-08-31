# VPS cut-over (Phase 0 filesystem cron → Neon engine)

1. On the VPS: `git pull && npm ci`
2. Add to the VPS `.env`: DATABASE_URL (Neon **default** branch — ep-round-resonance-…),
   BLOB_READ_WRITE_TOKEN. (Keep the existing GEMINI/ANTHROPIC/ZERNIO keys.)
3. `npm run db:migrate` (idempotent).
4. `npm run db:seed` (idempotent — `onConflictDoNothing`).
5. Dry-run once: `npm run run -- --tenant singlish-review --dry`; check the Neon `episode`
   row + Vercel Blob objects.
6. Swap the crontab line — command is unchanged (`npm run run`), so usually nothing to edit.
7. Watch `run.log` + the `run` table for the first live fire.
The 3 posts already scheduled in Zernio (Sep 1/3/5) are independent of this.
