import { db, closeDb } from "./client.ts";
import { tenant } from "./schema.ts";

const singlish = {
  id: "singlish", ownerUserId: null, displayName: "LAH", styleKey: "manga-ink",
  niche: "Slice-of-life comedy about Gen Z Singaporeans in everyday local situations — kopitiam and hawker centre, MRT and bus, void deck, BTO and living with parents, NS, exams, internships and first jobs, CCA, side hustles, family group chats. Dialogue is natural spoken Singlish (lah, leh, sia, walao, bojio, chope, sian, paiseh, shiok, can or not, don't play play) — write speech the way Singaporeans actually talk, not textbook English. Each story builds to a punchline that lands on a relatable local truth or a small everyday injustice. Warm and self-deprecating, never mean-spirited; PG-13, mild language only.",
  genres: "funny" as const, autonomy: "autonomous" as const,
  cadence: { days: [0, 2, 4, 6], time: "09:00", tz: "Asia/Singapore" },
  publish: { instagram: { accountId: "6a911cf277555aae013ed010", handle: "bennysynthwork", format: "4x5" as const } },
};

const wuxia = {
  id: "wuxia", ownerUserId: null, displayName: "JIANGHU", styleKey: "wuxia-manhua",
  language: "zh-Hans" as const,
  niche: "Self-contained wuxia vignettes in a nameless ancient jianghu — the world of rivers and lakes, where wandering swordsmen, sworn siblings, and rival sects settle debts of honour. Each episode is one clean turn or reveal: a duel decided on a rope bridge or a teahouse floor, a betrayal uncovered, a master's dying request answered, a years-long revenge collected, a stolen manual returned. Xianxia flavour is seasoning, never a system to explain — qi cultivation and a hard-won breakthrough, a sworn immortal repaying a favour, a spirit beast, a blade that hums. Fresh cast every episode, no recurring characters. Action is stylized and bloodless: implied strikes, wire-fu leaps, a fallen opponent, never gore or wounds. Grounded and unironic in tone; PG-13. Original characters and stories only — no real people, films, novels, manhua, or artists.",
  genres: "wuxia" as const, autonomy: "review_each" as const,
  cadence: { days: [0, 2, 4, 6], time: "09:00", tz: "Asia/Singapore" },
  publish: { instagram: { accountId: "6a911cf277555aae013ed010", handle: "bennysynthwork", format: "4x5" as const } },
};

await db.insert(tenant).values([
  singlish,
  { ...singlish, id: "singlish-review", displayName: "LAH (review)", autonomy: "review_each" as const },
  wuxia,
]).onConflictDoNothing();
console.log("seeded singlish + singlish-review + wuxia");
await closeDb();
