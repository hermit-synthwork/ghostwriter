import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "./client.ts";
import { episode, type EpisodeRow } from "./schema.ts";
import type { Story } from "../lib/story.ts";

export type EpisodeStatus = EpisodeRow["status"];
export interface EpisodeMeta { date: string; genre: "funny" | "horror" | "wuxia"; title: string }

export async function createEpisode(tenantId: string, story: Story): Promise<{ id: string; blobPrefix: string }> {
  const id = randomUUID();
  const blobPrefix = `episodes/${tenantId}/${id}`;
  await db.insert(episode).values({
    id, tenantId, slug: story.slug, genre: story.genre, title: story.title,
    logline: story.logline, storyJson: story, blobPrefix,
  });
  return { id, blobPrefix };
}

export type EpisodePatch = Partial<{
  caption: string;
  hashtags: string[];
  storyJson: unknown;
  panelUrls: { "4x5": string[]; "9x16": string[] };
  scheduledFor: Date;
  posts: { platform: string; handle: string; postId: string }[];
  error: string;
  approvedAt: Date;
  postedAt: Date;
}>;

export async function setEpisodeStatus(id: string, status: EpisodeStatus, patch: EpisodePatch = {}): Promise<void> {
  await db.update(episode).set({ status, ...patch }).where(eq(episode.id, id));
}

export async function getEpisode(id: string): Promise<EpisodeRow> {
  const [row] = await db.select().from(episode).where(eq(episode.id, id)).limit(1);
  if (!row) throw new Error(`no episode ${id}`);
  return row;
}

export async function recentEpisodes(tenantId: string, n: number): Promise<EpisodeMeta[]> {
  const rows = await db.select({ createdAt: episode.createdAt, genre: episode.genre, title: episode.title })
    .from(episode).where(eq(episode.tenantId, tenantId)).orderBy(desc(episode.createdAt)).limit(n);
  // TODO(B): compare in tenant tz
  return rows.map((r) => ({ date: r.createdAt.toISOString().slice(0, 10), genre: r.genre, title: r.title }));
}
