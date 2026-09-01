import { pgTable, pgEnum, text, integer, boolean, timestamp, jsonb, uuid, index } from "drizzle-orm/pg-core";

export const genreEnum = pgEnum("genre", ["funny", "horror", "wuxia"]);
export const genresEnum = pgEnum("genres", ["funny", "horror", "both", "wuxia"]);
export const autonomyEnum = pgEnum("autonomy", ["autonomous", "review_each", "review_weekly"]);
export const episodeStatusEnum = pgEnum("episode_status", [
  "generating", "ready", "approved", "scheduled", "posted", "failed", "rejected",
]);
export const usageKindEnum = pgEnum("usage_kind", ["image", "story_tokens", "post"]);
export const keyOwnerEnum = pgEnum("key_owner", ["platform", "tenant"]);

export const tenant = pgTable("tenant", {
  id: text("id").primaryKey(), // kebab-case
  ownerUserId: text("owner_user_id"), // Clerk id; null for seed rows
  displayName: text("display_name").notNull(),
  styleKey: text("style_key").notNull(),
  niche: text("niche").notNull(),
  genres: genresEnum("genres").notNull(),
  autonomy: autonomyEnum("autonomy").notNull(),
  cadence: jsonb("cadence").notNull().$type<{ days: number[]; time: string; tz: string }>(),
  publish: jsonb("publish").notNull().$type<{
    instagram?: { accountId: string; handle: string; format: "4x5" | "9x16" };
    tiktok?: { accountId: string; handle: string; format: "4x5" | "9x16" };
  }>(),
  geminiKeyEncrypted: text("gemini_key_encrypted"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const episode = pgTable(
  "episode",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull().references(() => tenant.id),
    slug: text("slug").notNull(),
    genre: genreEnum("genre").notNull(),
    title: text("title").notNull(),
    logline: text("logline").notNull(),
    storyJson: jsonb("story_json").notNull(),
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
  },
  (t) => [index("episode_tenant_created_idx").on(t.tenantId, t.createdAt.desc())],
);

export const usageEvent = pgTable(
  "usage_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull().references(() => tenant.id),
    episodeId: uuid("episode_id").references(() => episode.id),
    kind: usageKindEnum("kind").notNull(),
    qty: integer("qty").notNull(),
    keyOwner: keyOwnerEnum("key_owner").notNull(),
    costCents: integer("cost_cents").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

export const run = pgTable("run", {
  id: uuid("id").primaryKey().defaultRandom(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  tenantsDue: integer("tenants_due").notNull().default(0),
  tenantsOk: integer("tenants_ok").notNull().default(0),
  tenantsFailed: integer("tenants_failed").notNull().default(0),
  errors: jsonb("errors").$type<{ tenantId: string; message: string }[]>().notNull().default([]),
});

export type TenantRow = typeof tenant.$inferSelect;
export type EpisodeRow = typeof episode.$inferSelect;
