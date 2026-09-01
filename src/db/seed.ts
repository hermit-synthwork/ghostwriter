import { db, closeDb } from "./client.ts";
import { tenant } from "./schema.ts";

const singlish = {
  id: "singlish", ownerUserId: null, displayName: "LAH", styleKey: "manga-ink",
  niche: "Slice-of-life comedy about Gen Z Singaporeans in everyday local situations — kopitiam and hawker centre, MRT and bus, void deck, BTO and living with parents, NS, exams, internships and first jobs, CCA, side hustles, family group chats. Dialogue is natural spoken Singlish (lah, leh, sia, walao, bojio, chope, sian, paiseh, shiok, can or not, don't play play) — write speech the way Singaporeans actually talk, not textbook English. Each story builds to a punchline that lands on a relatable local truth or a small everyday injustice. Warm and self-deprecating, never mean-spirited; PG-13, mild language only.",
  genres: "funny" as const, autonomy: "autonomous" as const,
  cadence: { days: [0, 2, 4, 6], time: "09:00", tz: "Asia/Singapore" },
  publish: { instagram: { accountId: "6a911cf277555aae013ed010", handle: "bennysynthwork", format: "4x5" as const } },
};

await db.insert(tenant).values([
  singlish,
  { ...singlish, id: "singlish-review", displayName: "LAH (review)", autonomy: "review_each" as const },
]).onConflictDoNothing();
console.log("seeded singlish + singlish-review");
await closeDb();
