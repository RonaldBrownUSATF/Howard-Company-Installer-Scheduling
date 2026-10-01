import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { availabilityRules, blockedDates, settings } from "@/db/schema";
import { invalid, ok, readJson } from "@/lib/http";
import { getAvailabilityConfig, isValidTimezone } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const { settings: s, rules, blocked } = await getAvailabilityConfig();
  return ok({
    settings: s,
    rules: rules.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })),
    blocked: blocked.map(({ date, reason }) => ({ date, reason })),
    bookingUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  });
}

const Rule = z
  .object({
    weekday: z.number().int().min(1).max(7),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((r) => r.endMinute > r.startMinute, "End time must be after start time");

const Body = z.object({
  settings: z.object({
    ownerName: z.string().trim().min(1).max(120),
    ownerEmail: z.union([z.literal(""), z.string().trim().email()]),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000),
    timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
    slotMinutes: z.number().int().min(5).max(480),
    bufferMinutes: z.number().int().min(0).max(240),
    minNoticeHours: z.number().int().min(0).max(24 * 30),
    maxDaysAhead: z.number().int().min(1).max(365),
    requireApproval: z.boolean(),
  }),
  rules: z.array(Rule).max(100),
  blocked: z
    .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().max(200).default("") }))
    .max(500),
});

export async function PUT(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  const { settings: s, rules, blocked } = parsed.data;
  const uniqueBlocked = [...new Map(blocked.map((b) => [b.date, b])).values()];

  await db.transaction(async (tx) => {
    await tx.update(settings).set({ ...s, updatedAt: new Date() }).where(eq(settings.id, 1));
    await tx.delete(availabilityRules);
    if (rules.length) await tx.insert(availabilityRules).values(rules);
    await tx.delete(blockedDates);
    if (uniqueBlocked.length) await tx.insert(blockedDates).values(uniqueBlocked);
  });
  return GET();
}
