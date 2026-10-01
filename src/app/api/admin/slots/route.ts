import { DateTime } from "luxon";
import { getAvailableSlots } from "@/lib/availability";
import { fail, ok } from "@/lib/http";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Open slots for one day in the owner's timezone, optionally ignoring one booking's own time. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const date = params.get("date") ?? "";
  const exclude = params.get("exclude") ?? undefined;
  const s = await getSettings();
  const day = DateTime.fromISO(date, { zone: s.timezone });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day.isValid) return fail("Provide a date as YYYY-MM-DD.");

  const { slots } = await getAvailableSlots(day.startOf("day").toJSDate(), day.plus({ days: 1 }).startOf("day").toJSDate(), {
    excludeId: exclude,
    ignoreNotice: true,
  });
  return ok({ slots });
}
