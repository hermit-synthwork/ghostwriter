import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./env.ts";

const USAGE_DIR = join(REPO_ROOT, "usage");

export type UsageKind = "image" | "story_tokens" | "post";
export interface UsageEvent {
  ts: string; tenantId: string; kind: UsageKind; qty: number;
  keyOwner: "platform" | "tenant"; costCents: number; note?: string;
}

// Rough platform-cost estimates (managed tier). Tune against real invoices.
const RATE_CENTS: Record<UsageKind, (qty: number) => number> = {
  image: (q) => Math.ceil(q * 3),          // ~$0.03 / image (gemini-3.1-flash-image)
  story_tokens: (q) => Math.max(1, Math.round(q / 1000 * 0.3)), // ~$0.30 / 1M
  post: () => 0,                            // Zernio is a monthly per-account fee, not per-post
};

export function estimateCents(kind: UsageKind, qty: number): number {
  return RATE_CENTS[kind](qty);
}

export function logUsage(
  tenantId: string,
  e: { kind: UsageKind; qty: number; keyOwner: "platform" | "tenant"; note?: string },
): void {
  mkdirSync(USAGE_DIR, { recursive: true });
  const row: UsageEvent = {
    ts: new Date().toISOString(),
    tenantId, kind: e.kind, qty: e.qty, keyOwner: e.keyOwner,
    costCents: e.keyOwner === "tenant" && e.kind === "image" ? 0 : estimateCents(e.kind, e.qty),
    ...(e.note ? { note: e.note } : {}),
  };
  appendFileSync(join(USAGE_DIR, `${tenantId}.jsonl`), JSON.stringify(row) + "\n");
}

export function readUsage(tenantId: string): UsageEvent[] {
  const p = join(USAGE_DIR, `${tenantId}.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as UsageEvent);
}
