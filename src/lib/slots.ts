import { and, gt, inArray, lt } from "drizzle-orm";
import { DateTime } from "luxon";
import { bookings } from "@/db/schema";
import type { Exec } from "@/db";

export type SlotSettings = {
  timezone: string;
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
};
export type Rule = { weekday: number; startMinute: number; endMinute: number };
export type Busy = { start: Date; end: Date };

export type GenerateInput = {
  settings: SlotSettings;
  rules: Rule[];
  blockedDates: string[]; // YYYY-MM-DD in owner's timezone
  busy: Busy[];
  from: Date;
  to: Date;
  now: Date;
  ignoreNotice?: boolean; // owner-side rescheduling may book inside the notice window
};

/**
 * Pure slot generator. Walks each day in the owner's timezone, lays slots across
 * each availability window, and drops anything outside the booking horizon or
 * overlapping an existing booking (padded by the buffer on both sides).
 * Returns slot start times as UTC ISO strings, sorted.
 */
export function generateSlots(input: GenerateInput): string[] {
  const { settings: s, rules, busy, from, to, now } = input;
  const slotMs = s.slotMinutes * 60_000;
  const bufferMs = s.bufferMinutes * 60_000;

  const earliest = input.ignoreNotice ? now.getTime() : now.getTime() + s.minNoticeHours * 3_600_000;
  const latest = now.getTime() + s.maxDaysAhead * 86_400_000;
  const lo = Math.max(from.getTime(), earliest);
  const hi = Math.min(to.getTime(), latest);
  if (hi <= lo || slotMs <= 0) return [];

  const blocked = new Set(input.blockedDates);
  const busyRanges = busy.map((b) => [b.start.getTime() - bufferMs, b.end.getTime() + bufferMs] as const);
  const found = new Set<number>();

  let day = DateTime.fromMillis(lo, { zone: s.timezone }).startOf("day").minus({ days: 1 });
  const lastDay = DateTime.fromMillis(hi, { zone: s.timezone }).startOf("day").plus({ days: 1 });

  while (day <= lastDay) {
    if (!blocked.has(day.toISODate()!)) {
      for (const rule of rules) {
        if (rule.weekday !== day.weekday) continue;
        for (let m = rule.startMinute; m + s.slotMinutes <= rule.endMinute; m += s.slotMinutes) {
          // Set wall-clock time directly so DST transitions don't shift the grid.
          const start = day.set({ hour: Math.floor(m / 60), minute: m % 60, second: 0, millisecond: 0 });
          // Skip wall times that don't exist on DST spring-forward days.
          if (start.hour !== Math.floor(m / 60) || start.minute !== m % 60) continue;
          const startMs = start.toMillis();
          const endMs = startMs + slotMs;
          if (startMs < lo || startMs >= hi) continue;
          if (busyRanges.some(([a, b]) => startMs < b && endMs > a)) continue;
          found.add(startMs);
        }
      }
    }
    day = day.plus({ days: 1 });
  }

  return [...found].sort((a, b) => a - b).map((ms) => new Date(ms).toISOString());
}

/** Loads active bookings that could collide with the given range. */
export async function loadBusy(exec: Exec, from: Date, to: Date, excludeId?: string): Promise<Busy[]> {
  const pad = 86_400_000;
  const rows = await exec
    .select({ id: bookings.id, start: bookings.start, end: bookings.end })
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, ["pending", "confirmed"]),
        lt(bookings.start, new Date(to.getTime() + pad)),
        gt(bookings.end, new Date(from.getTime() - pad)),
      ),
    );
  return rows.filter((r) => r.id !== excludeId);
}
