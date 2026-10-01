import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { availabilityRules, blockedDates, settings, type Settings } from "@/db/schema";

export function isValidTimezone(tz: string) {
  return typeof tz === "string" && tz.length > 0 && DateTime.local().setZone(tz).isValid;
}

/** Returns the settings row, creating it (plus Mon–Fri 9–5 hours) on first run. */
export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) return row;

  const envTz = process.env.DEFAULT_TIMEZONE ?? "";
  await db
    .insert(settings)
    .values({
      id: 1,
      ownerName: process.env.OWNER_NAME || "Your name",
      ownerEmail: process.env.OWNER_EMAIL || "",
      title: "Book a meeting",
      description: "",
      timezone: isValidTimezone(envTz) ? envTz : "America/New_York",
      slotMinutes: 30,
      bufferMinutes: 0,
      minNoticeHours: 12,
      maxDaysAhead: 60,
      requireApproval: true,
    })
    .onConflictDoNothing();

  const existing = await db.select({ id: availabilityRules.id }).from(availabilityRules).limit(1);
  if (existing.length === 0) {
    await db.insert(availabilityRules).values(
      [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 17 * 60 })),
    );
  }

  const [created] = await db.select().from(settings).where(eq(settings.id, 1));
  return created;
}

export async function getAvailabilityConfig() {
  const s = await getSettings();
  const rules = await db.select().from(availabilityRules).orderBy(availabilityRules.weekday, availabilityRules.startMinute);
  const blocked = await db.select().from(blockedDates).orderBy(blockedDates.date);
  return { settings: s, rules, blocked };
}
