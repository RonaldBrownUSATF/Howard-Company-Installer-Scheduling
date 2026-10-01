import { getAvailableSlots } from "@/lib/availability";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

const MAX_RANGE_MS = 62 * 86_400_000;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const from = new Date(params.get("from") ?? "");
  const to = new Date(params.get("to") ?? "");
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) return fail("Provide valid 'from' and 'to' ISO dates.");
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) return fail("Date range is too long. Ask for 62 days or fewer.");

  const { settings, slots } = await getAvailableSlots(from, to);
  return ok({ slots, slotMinutes: settings.slotMinutes });
}
