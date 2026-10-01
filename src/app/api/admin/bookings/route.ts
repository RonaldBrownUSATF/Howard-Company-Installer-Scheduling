import { and, asc, desc, gte, inArray, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope") ?? "upcoming";
  const now = new Date();
  const cols = {
    id: bookings.id,
    name: bookings.name,
    email: bookings.email,
    notes: bookings.notes,
    timezone: bookings.timezone,
    start: bookings.start,
    end: bookings.end,
    status: bookings.status,
    createdAt: bookings.createdAt,
  };

  const rows =
    scope === "past"
      ? await db
          .select(cols)
          .from(bookings)
          .where(or(lt(bookings.end, now), inArray(bookings.status, ["declined", "cancelled"])))
          .orderBy(desc(bookings.start))
          .limit(200)
      : await db
          .select(cols)
          .from(bookings)
          .where(and(gte(bookings.end, now), inArray(bookings.status, ["pending", "confirmed"])))
          .orderBy(asc(bookings.start))
          .limit(500);

  return ok({ bookings: rows });
}
