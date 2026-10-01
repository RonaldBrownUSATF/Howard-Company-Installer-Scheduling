import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { BOOKING_LOCK_KEY, isSlotAvailable } from "@/lib/availability";
import { fail, invalid, ok, readJson } from "@/lib/http";
import { notify } from "@/lib/notifications";
import { getAvailabilityConfig, isValidTimezone } from "@/lib/settings";

export const dynamic = "force-dynamic";

const Body = z.object({
  start: z.string().datetime({ offset: true }),
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  notes: z.string().trim().max(2000).optional().default(""),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
  website: z.string().optional(), // honeypot: real people leave this empty
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  if (input.website) return ok({ token: "", status: "pending" }); // silently drop bots

  const config = await getAvailabilityConfig();
  const s = config.settings;
  const start = new Date(input.start);
  const end = new Date(start.getTime() + s.slotMinutes * 60_000);

  const booking = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${BOOKING_LOCK_KEY})`);
    if (!(await isSlotAvailable(start, { exec: tx, config }))) return null;
    const [row] = await tx
      .insert(bookings)
      .values({
        token: randomBytes(24).toString("base64url"),
        name: input.name,
        email: input.email,
        notes: input.notes,
        timezone: input.timezone,
        start,
        end,
        status: s.requireApproval ? "pending" : "confirmed",
      })
      .returning();
    return row;
  });

  if (!booking) return fail("That time is no longer open. Pick another time.", 409);

  await notify(booking.status === "pending" ? "requested" : "auto_confirmed", booking, s);
  return ok({ token: booking.token, status: booking.status }, 201);
}
