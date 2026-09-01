import type { EpisodeStatus } from "@/lib/db";

const STATUS_STYLE: Record<EpisodeStatus, string> = {
  ready: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  approved: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  scheduled: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  posted: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  rejected: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30",
  failed: "bg-red-500/15 text-red-300 ring-red-500/30",
  generating: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30",
};

export function StatusChip({ status }: { status: EpisodeStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

export function GenreChip({ genre }: { genre: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300">
      {genre}
    </span>
  );
}

export function relTime(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((Date.now() - t.getTime()) / 1000);
  const units: [number, string][] = [
    [60, "s"], [60, "m"], [24, "h"], [7, "d"], [4.35, "w"], [12, "mo"], [Infinity, "y"],
  ];
  let n = s;
  for (let i = 0; i < units.length; i++) {
    if (Math.abs(n) < units[i][0]) return `${Math.round(n)}${units[i][1]} ago`;
    n /= units[i][0];
  }
  return t.toISOString().slice(0, 10);
}
