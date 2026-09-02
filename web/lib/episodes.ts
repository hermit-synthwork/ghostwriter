import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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

/**
 * The authorization gate. Authentication comes from Clerk, but a Clerk login is
 * shared with the Synthwork app — so being signed in must never be enough on its
 * own. Users see only tenants they own; ids listed in REVIEW_ADMIN_USER_IDS see
 * everything. Unset means nobody is admin, so the safe state is the default.
 */
function isAdmin(userId: string): boolean {
  return (process.env.REVIEW_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

/** Tenant-scope predicate for reads; `undefined` for admins (no filter). */
function ownedBy(userId: string) {
  return isAdmin(userId) ? undefined : eq(tenant.ownerUserId, userId);
}

/**
 * Tenant-scope predicate for writes. Expressed as a subquery on episode.tenantId
 * so the ownership test and the mutation are one statement — no check-then-write
 * race, and no second round trip.
 */
function ownedTenantIds(userId: string) {
  return isAdmin(userId)
    ? undefined
    : inArray(
        episode.tenantId,
        db.select({ id: tenant.id }).from(tenant).where(eq(tenant.ownerUserId, userId)),
      );
}

export async function listEpisodes(userId: string, limit = 60): Promise<EpisodeWithTenant[]> {
  const rows = await db
    .select({ e: episode, t: tenantCols })
    .from(episode)
    .innerJoin(tenant, eq(tenant.id, episode.tenantId))
    .where(ownedBy(userId))
    .orderBy(statusRank, desc(episode.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.e, tenant: r.t }));
}

export async function getEpisodeWithTenant(id: string, userId: string): Promise<EpisodeWithTenant | null> {
  const [row] = await db
    .select({ e: episode, t: tenantCols })
    .from(episode)
    .innerJoin(tenant, eq(tenant.id, episode.tenantId))
    .where(and(eq(episode.id, id), ownedBy(userId)))
    .limit(1);
  return row ? { ...row.e, tenant: row.t } : null;
}

/** Save an edited caption. Only allowed while the episode is still `ready`. */
export async function saveCaption(id: string, caption: string, userId: string): Promise<void> {
  await db
    .update(episode)
    .set({ caption: caption.trim() })
    .where(and(eq(episode.id, id), eq(episode.status, "ready"), ownedTenantIds(userId)));
}

/**
 * Approve a `ready` episode: optionally save an edited caption, then flip to
 * `approved`. The VPS `schedule-approved` sweep picks it up and hands it to
 * Zernio as a scheduled post for the tenant's cadence.time.
 * Guarded on status so a double-submit / stale tab can't re-approve.
 */
export async function approveEpisode(id: string, userId: string, caption?: string): Promise<void> {
  const set: Record<string, unknown> = { status: "approved", approvedAt: new Date() };
  if (typeof caption === "string" && caption.trim()) set.caption = caption.trim();
  await db
    .update(episode)
    .set(set)
    .where(and(eq(episode.id, id), eq(episode.status, "ready"), ownedTenantIds(userId)));
}

/** Reject a `ready` episode — it will not be published. */
export async function rejectEpisode(id: string, userId: string): Promise<void> {
  await db
    .update(episode)
    .set({ status: "rejected" })
    .where(and(eq(episode.id, id), eq(episode.status, "ready"), ownedTenantIds(userId)));
}
