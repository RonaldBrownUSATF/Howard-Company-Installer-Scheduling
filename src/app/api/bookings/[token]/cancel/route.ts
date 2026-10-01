import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { fail, ok, readJson } from "@/lib/http";
import { notify } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const Body = z.object({ reason: z.string().trim().max(1000).optional() }).nullable();

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const body = Body.safeParse(await readJson(req));
  const reason = body.success ? body.data?.reason : undefined;

  const [row] = await db
    .update(bookings)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(bookings.token, params.token), inArray(bookings.status, ["pending", "confirmed"])))
    .returning();
  if (!row) return fail("This booking can't be cancelled. It may already be cancelled or declined.", 404);

  await notify("cancelled_by_booker", row, await getSettings(), { message: reason });
  return ok({ status: row.status });
}
