import { db } from "../db/client.ts";
import { usageEvent } from "../db/schema.ts";

export type UsageKind = "image" | "story_tokens" | "post";

// Rough platform-cost estimates (managed tier). Tune against real invoices.
const RATE_CENTS: Record<UsageKind, (qty: number) => number> = {
  image: (q) => Math.ceil(q * 3),          // ~$0.03 / image (gemini-3.1-flash-image)
  story_tokens: (q) => Math.max(1, Math.round(q / 1000 * 0.3)), // ~$0.30 / 1M
  post: () => 0,                            // Zernio is a monthly per-account fee, not per-post
};

export function estimateCents(kind: UsageKind, qty: number): number {
  return RATE_CENTS[kind](qty);
}

export async function logUsage(
  tenantId: string,
  e: { episodeId?: string; kind: UsageKind; qty: number; keyOwner: "platform" | "tenant"; note?: string },
): Promise<void> {
  const costCents = e.keyOwner === "tenant" && e.kind === "image" ? 0 : estimateCents(e.kind, e.qty);
  await db.insert(usageEvent).values({
    tenantId, episodeId: e.episodeId ?? null, kind: e.kind, qty: e.qty,
    keyOwner: e.keyOwner, costCents, note: e.note ?? null,
  });
}
