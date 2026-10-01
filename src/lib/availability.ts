import { db, type Exec } from "@/db";
import { getAvailabilityConfig } from "./settings";
import { generateSlots, loadBusy } from "./slots";

export type AvailabilityConfig = Awaited<ReturnType<typeof getAvailabilityConfig>>;

type Options = {
  /** Run the busy-time query on this executor (e.g. an open transaction). */
  exec?: Exec;
  /**
   * Preloaded settings/rules. Required when `exec` is a transaction: loading them
   * inside would need a second pooled connection while the lock is held.
   */
  config?: AvailabilityConfig;
  excludeId?: string;
  ignoreNotice?: boolean;
};

export async function getAvailableSlots(from: Date, to: Date, opts: Options = {}) {
  const { settings, rules, blocked } = opts.config ?? (await getAvailabilityConfig());
  const busy = await loadBusy(opts.exec ?? db, from, to, opts.excludeId);
  const slots = generateSlots({
    settings,
    rules,
    blockedDates: blocked.map((b) => b.date),
    busy,
    from,
    to,
    now: new Date(),
    ignoreNotice: opts.ignoreNotice,
  });
  return { settings, slots };
}

export async function isSlotAvailable(start: Date, opts: Options = {}) {
  const { slots } = await getAvailableSlots(new Date(start.getTime() - 1000), new Date(start.getTime() + 1000), opts);
  return slots.some((s) => new Date(s).getTime() === start.getTime());
}

/** Advisory lock key that serializes booking writes so two people can't take the same slot. */
export const BOOKING_LOCK_KEY = 7_331_001;
