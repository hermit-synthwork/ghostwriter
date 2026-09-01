/**
 * Subset of the engine's `../../src/db/schema.ts`. The review app only ever
 * reads/writes the `episode` and `tenant` tables. The engine repo's
 * `migrations/` are the source of truth for column shape — keep this in sync if
 * a migration changes either table (rare; the surface is frozen since 0003).
 */
import { pgTable, pgEnum, text, boolean, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";

export const genreEnum = pgEnum("genre", ["funny", "horror", "wuxia"]);
export const genresEnum = pgEnum("genres", ["funny", "horror", "both", "wuxia"]);
export const autonomyEnum = pgEnum("autonomy", ["autonomous", "review_each", "review_weekly", "scheduled"]);
export const episodeStatusEnum = pgEnum("episode_status", [
  "generating", "ready", "approved", "scheduled", "posted", "failed", "rejected",
]);

export const tenant = pgTable("tenant", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id"),
  displayName: text("display_name").notNull(),
  styleKey: text("style_key").notNull(),
  niche: text("niche").notNull(),
  language: text("language").notNull().default("en"),
  genres: genresEnum("genres").notNull(),
  autonomy: autonomyEnum("autonomy").notNull(),
  cadence: jsonb("cadence").notNull().$type<{ days: number[]; time: string; tz: string }>(),
  publish: jsonb("publish").notNull().$type<{
    instagram?: { accountId: string; handle: string; format: "4x5" | "9x16" };
    tiktok?: { accountId: string; handle: string; format: "4x5" | "9x16" };
  }>(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const episode = pgTable("episode", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull().references(() => tenant.id),
  slug: text("slug").notNull(),
  genre: genreEnum("genre").notNull(),
  title: text("title").notNull(),
  logline: text("logline").notNull(),
  storyJson: jsonb("story_json").notNull().$type<StoryJson>(),
  caption: text("caption").notNull().default(""),
  hashtags: text("hashtags").array().notNull().default([]),
  status: episodeStatusEnum("status").notNull().default("generating"),
  blobPrefix: text("blob_prefix").notNull(),
  panelUrls: jsonb("panel_urls").$type<{ "4x5": string[]; "9x16": string[] }>(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  posts: jsonb("posts").$type<{ platform: string; handle: string; postId: string }[]>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  postedAt: timestamp("posted_at", { withTimezone: true }),
});

export type TenantRow = typeof tenant.$inferSelect;
export type EpisodeRow = typeof episode.$inferSelect;
export type EpisodeStatus = EpisodeRow["status"];

/** The engine's `Story` (see ../../src/lib/story.ts) — fields the review UI reads. */
export interface StoryJson {
  title: string;
  logline: string;
  caption: string;
  hashtags: string[];
  cast?: { name: string; description: string }[];
  panels: {
    n: number;
    scene: string;
    camera?: string;
    narration: string | null;
    dialogue?: { speaker: string; text: string }[];
    sfx?: string;
  }[];
}
