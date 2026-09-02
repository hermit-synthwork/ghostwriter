import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, episode, tenant, type EpisodeRow, type TenantRow } from "./db";

export type EpisodeWithTenant = EpisodeRow & {
  tenant: Pick<TenantRow, "id" | "displayName" | "language" | "autonomy" | "styleKey" | "cadence">;
};

const tenantCols = {
  id: tenant.id,
  displayName: tenant.displayName,
  language: tenant.language,
  autonomy: tenant.autonomy,
  styleKey: tenant.styleKey,
  cadence: tenant.cadence,
};

// ready first, then approved (waiting to publish), then everything else newest-first.
const statusRank = sql<number>`case ${episode.status}
  when 'ready' then 0 when 'approved' then 1 when 'scheduled' then 2
  when 'posted' then 3 when 'rejected' then 4 when 'failed' then 5 else 6 end`;

export async function listEpisodes(limit = 60): Promise<EpisodeWithTenant[]> {
  const rows = await db
    .select({ e: episode, t: tenantCols })
    .from(episode)
    .innerJoin(tenant, eq(tenant.id, episode.tenantId))
    .orderBy(statusRank, desc(episode.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.e, tenant: r.t }));
}

export async function getEpisodeWithTenant(id: string): Promise<EpisodeWithTenant | null> {
  const [row] = await db
    .select({ e: episode, t: tenantCols })
    .from(episode)
    .innerJoin(tenant, eq(tenant.id, episode.tenantId))
    .where(eq(episode.id, id))
    .limit(1);
  return row ? { ...row.e, tenant: row.t } : null;
}

/** Save an edited caption. Only allowed while the episode is still `ready`. */
export async function saveCaption(id: string, caption: string): Promise<void> {
  await db
    .update(episode)
    .set({ caption: caption.trim() })
    .where(and(eq(episode.id, id), eq(episode.status, "ready")));
}

/**
 * Approve a `ready` episode: optionally save an edited caption, then flip to
 * `approved`. The VPS `schedule-approved` sweep picks it up and hands it to
 * Zernio as a scheduled post for the tenant's cadence.time.
 * Guarded on status so a double-submit / stale tab can't re-approve.
 */
export async function approveEpisode(id: string, caption?: string): Promise<void> {
  const set: Record<string, unknown> = { status: "approved", approvedAt: new Date() };
  if (typeof caption === "string" && caption.trim()) set.caption = caption.trim();
  await db
    .update(episode)
    .set(set)
    .where(and(eq(episode.id, id), eq(episode.status, "ready")));
}

/** Reject a `ready` episode — it will not be published. */
export async function rejectEpisode(id: string): Promise<void> {
  await db
    .update(episode)
    .set({ status: "rejected" })
    .where(and(eq(episode.id, id), eq(episode.status, "ready")));
}
