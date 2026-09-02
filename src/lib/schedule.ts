import { localParts, type TenantConfig } from "./tenant.ts";

/**
 * When an episode should publish: today at the tenant's cadence.time if that is
 * still ahead, else ~2h from now (the trigger / approval landed after the slot).
 * Returned as a local wall-clock string + the tenant tz for Zernio's `timezone`.
 * Used by both the `scheduled` autonomy path and the approved-episode sweep.
 */
export function scheduleSlot(t: TenantConfig, now: Date): { at: string; tz: string } {
  const tz = t.cadence.tz;
  const p = localParts(now, tz);
  if (p.hhmm < t.cadence.time) return { at: `${p.date}T${t.cadence.time}:00`, tz };
  const soon = localParts(new Date(now.getTime() + 2 * 60 * 60 * 1000), tz);
  return { at: `${soon.date}T${soon.hhmm}:00`, tz };
}

/** UTC instant for a local wall-clock "YYYY-MM-DDTHH:MM:SS" in an IANA zone. */
export function zonedWallClockToUtc(wall: string, tz: string): Date {
  const guess = new Date(`${wall}Z`);
  const seenParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(guess);
  const g = Object.fromEntries(seenParts.map((x) => [x.type, x.value])) as Record<string, string>;
  const seen = Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour, +g.minute, +g.second);
  return new Date(guess.getTime() + (guess.getTime() - seen));
}
