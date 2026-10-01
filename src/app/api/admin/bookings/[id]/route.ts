import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, type Booking } from "@/db/schema";
import { BOOKING_LOCK_KEY, isSlotAvailable } from "@/lib/availability";
import { fail, invalid, ok, readJson } from "@/lib/http";
import { notify, type BookingEvent } from "@/lib/notifications";
import { getAvailabilityConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

const message = z.string().trim().max(2000).optional();
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), message }),
  z.object({ action: z.literal("decline"), message }),
  z.object({ action: z.literal("cancel"), message }),
  z.object({ action: z.literal("reschedule"), start: z.string().datetime({ offset: true }), message }),
]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  const body = parsed.data;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return fail("Booking not found.", 404);
  const [current] = await db.select().from(bookings).where(eq(bookings.id, params.id));
  if (!current) return fail("Booking not found.", 404);

  const config = await getAvailabilityConfig();
  const s = config.settings;
  const active = current.status === "pending" || current.status === "confirmed";
  let updated: Booking | undefined;
  let event: BookingEvent;

  switch (body.action) {
    case "approve":
      if (current.status !== "pending") return fail("Only pending requests can be approved.", 409);
      [updated] = await db.update(bookings).set({ status: "confirmed", updatedAt: new Date() }).where(eq(bookings.id, current.id)).returning();
      event = "approved";
      break;

    case "decline":
      if (current.status !== "pending") return fail("Only pending requests can be declined.", 409);
      [updated] = await db.update(bookings).set({ status: "declined", updatedAt: new Date() }).where(eq(bookings.id, current.id)).returning();
      event = "declined";
      break;

    case "cancel":
      if (!active) return fail("This booking is already closed.", 409);
      [updated] = await db.update(bookings).set({ status: "cancelled", updatedAt: new Date() }).where(eq(bookings.id, current.id)).returning();
      event = "cancelled_by_owner";
      break;

    case "reschedule": {
      if (!active) return fail("Closed bookings can't be rescheduled.", 409);
      const start = new Date(body.start);
      const end = new Date(start.getTime() + s.slotMinutes * 60_000);
      updated = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${BOOKING_LOCK_KEY})`);
        if (!(await isSlotAvailable(start, { exec: tx, config, excludeId: current.id, ignoreNotice: true }))) return undefined;
        const [row] = await tx
          .update(bookings)
          .set({ start, end, sequence: current.sequence + 1, updatedAt: new Date() })
          .where(eq(bookings.id, current.id))
          .returning();
        return row;
      });
      if (!updated) return fail("That time isn't open. Pick another slot.", 409);
      event = "rescheduled";
      break;
    }
  }

  await notify(event, updated!, s, { message: body.message, previousStart: current.start });
  const { token: _omit, ...safe } = updated!;
  return ok({ booking: safe });
}
