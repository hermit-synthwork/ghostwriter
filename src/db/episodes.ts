import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, max, notInArray } from "drizzle-orm";
import { db } from "./client.ts";
import { episode, type EpisodeRow } from "./schema.ts";
import type { Genre, Story } from "../lib/story.ts";

export type EpisodeStatus = EpisodeRow["status"];
export interface EpisodeMeta { date: string; genre: Genre; title: string }

export async function createEpisode(
  tenantId: string,
  story: Story,
  opts: { episodeNumber?: number } = {},
): Promise<{ id: string; blobPrefix: string }> {
  const id = randomUUID();
  const blobPrefix = `episodes/${tenantId}/${id}`;
  await db.insert(episode).values({
    id, tenantId, slug: story.slug, genre: story.genre, title: story.title,
    logline: story.logline, storyJson: story, blobPrefix,
    episodeNumber: opts.episodeNumber ?? null,
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

/* ------------------------- serialized lines ------------------------- */

/** Episodes that count as canon: reviewed or on their way out. */
const CANON_STATUSES: EpisodeStatus[] = ["approved", "scheduled", "posted"];

/** Next number for a serialized tenant. Failed/rejected episodes free their number for a retry. */
export async function nextEpisodeNumber(tenantId: string): Promise<number> {
  const [r] = await db
    .select({ n: max(episode.episodeNumber) })
    .from(episode)
    .where(and(eq(episode.tenantId, tenantId), notInArray(episode.status, ["failed", "rejected"])));
  return (r?.n ?? 0) + 1;
}

export interface SeriesRecap { episode: number; title: string; recap: string; cliffhanger: string | null }

/** The last `n` canon episodes of a serialized tenant, oldest first, for the next story prompt. */
export async function seriesRecap(tenantId: string, n: number): Promise<SeriesRecap[]> {
  const rows = await db
    .select({ episodeNumber: episode.episodeNumber, title: episode.title, logline: episode.logline, storyJson: episode.storyJson })
    .from(episode)
    .where(and(
      eq(episode.tenantId, tenantId),
      inArray(episode.status, CANON_STATUSES),
      isNotNull(episode.episodeNumber),
    ))
    .orderBy(desc(episode.episodeNumber))
    .limit(n);
  return rows
    .map((r) => {
      const series = (r.storyJson as Partial<Story> | null)?.series;
      return {
        episode: r.episodeNumber!,
        title: r.title,
        recap: series?.recap || r.logline,
        cliffhanger: series?.cliffhanger ?? null,
      };
    })
    .reverse();
}

/** Status of the tenant's newest episode, or null if it has none. */
export async function latestEpisodeStatus(tenantId: string): Promise<EpisodeStatus | null> {
  const [r] = await db
    .select({ status: episode.status })
    .from(episode)
    .where(eq(episode.tenantId, tenantId))
    .orderBy(desc(episode.createdAt))
    .limit(1);
  return r?.status ?? null;
}
