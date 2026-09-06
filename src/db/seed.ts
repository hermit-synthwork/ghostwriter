import { db, closeDb } from "./client.ts";
import { tenant } from "./schema.ts";

const singlish = {
  id: "singlish", ownerUserId: null, displayName: "LAH", styleKey: "manga-ink",
  niche: "Slice-of-life comedy about Gen Z Singaporeans in everyday local situations — kopitiam and hawker centre, MRT and bus, void deck, BTO and living with parents, NS, exams, internships and first jobs, CCA, side hustles, family group chats. Dialogue is natural spoken Singlish (lah, leh, sia, walao, bojio, chope, sian, paiseh, shiok, can or not, don't play play) — write speech the way Singaporeans actually talk, not textbook English. Each story builds to a punchline that lands on a relatable local truth or a small everyday injustice. Warm and self-deprecating, never mean-spirited; PG-13, mild language only.",
  genres: "funny" as const, autonomy: "autonomous" as const,
  // Once a week — Saturday 09:00 SGT (staggered against wuxia Wed / anime Fri).
  cadence: { days: [6], time: "09:00", tz: "Asia/Singapore" },
  publish: { instagram: { accountId: "6a911cf277555aae013ed010", handle: "bennysynthwork", format: "4x5" as const } },
};

const wuxia = {
  id: "wuxia", ownerUserId: null, displayName: "JIANGHU", styleKey: "wuxia-manhua",
  language: "zh-Hans" as const,
  niche: "Self-contained wuxia vignettes in a nameless ancient jianghu — the world of rivers and lakes, where wandering swordsmen, sworn siblings, and rival sects settle debts of honour. Each episode is one clean turn or reveal: a duel decided on a rope bridge or a teahouse floor, a betrayal uncovered, a master's dying request answered, a years-long revenge collected, a stolen manual returned. Xianxia flavour is seasoning, never a system to explain — qi cultivation and a hard-won breakthrough, a sworn immortal repaying a favour, a spirit beast, a blade that hums. Fresh cast every episode, no recurring characters. Action is stylized and bloodless: implied strikes, wire-fu leaps, a fallen opponent, never gore or wounds. Grounded and unironic in tone; PG-13. Original characters and stories only — no real people, films, novels, manhua, or artists.",
  genres: "wuxia" as const, autonomy: "scheduled" as const, // no review — engine schedules the post in Zernio
  // Once a week — Wednesday; time = when Zernio publishes (the trigger runs a few hours earlier).
  cadence: { days: [3], time: "09:00", tz: "Asia/Singapore" },
  // Its own Zernio account — publish resolves ZERNIO_API_KEY_WUXIA (see .env.example).
  publish: {
    instagram: { accountId: "6a96b3ca77555aae018e88dd", handle: "manhuajianghuart", format: "4x5" as const },
    tiktok: { accountId: "6a96b18077555aae018e18ec", handle: "manhuajianghu", format: "9x16" as const },
  },
};

const anime = {
  id: "anime", ownerUserId: null, displayName: "SENPAI", styleKey: "japanese-anime",
  niche: "Anime slice-of-life comedy set in an unnamed Japanese high school and its neighbourhood — club rooms after class, the culture festival, rooftop lunches, the walk home past the konbini and the vending machines, cram school, a first part-time job, the sports club that treats every practice like a tournament final. Fresh cast every episode: the deadpan class rep, the try-hard underclassman, the club president with one obsession, the transfer student. Lean into anime staples — dramatic reaction shots, a confession under the sakura tree that goes sideways, an over-narrated inner monologue, a training montage for something trivial — and land each story on a punchline that pops an everyday teenage truth. Warm, never mean-spirited; PG-13, mild language only. Original characters and stories only — no real anime, studios, franchises, or characters.",
  genres: "funny" as const, autonomy: "scheduled" as const, // no review — engine schedules the post in Zernio
  // Once a week — Friday; time = when Zernio publishes (the trigger runs a few hours earlier).
  cadence: { days: [5], time: "09:00", tz: "Asia/Singapore" },
  // Shared ZERNIO_API_KEY, IG-only test on @bennysynthwork for now — swap to a dedicated account later via UPDATE.
  publish: { instagram: { accountId: "6a911cf277555aae013ed010", handle: "bennysynthwork", format: "4x5" as const } },
};

await db.insert(tenant).values([
  singlish,
  { ...singlish, id: "singlish-review", displayName: "LAH (review)", autonomy: "review_each" as const },
  wuxia,
  anime,
]).onConflictDoNothing();
console.log("seeded singlish + singlish-review + wuxia + anime");
await closeDb();
