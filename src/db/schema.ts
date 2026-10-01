import { pgTable, pgEnum, integer, text, boolean, timestamp, uuid, serial, index } from "drizzle-orm/pg-core";

export const bookingStatus = pgEnum("booking_status", ["pending", "confirmed", "declined", "cancelled"]);

/** Single-row table (id = 1) holding the owner's scheduling preferences. */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  ownerName: text("owner_name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  timezone: text("timezone").notNull(),
  slotMinutes: integer("slot_minutes").notNull(),
  bufferMinutes: integer("buffer_minutes").notNull(),
  minNoticeHours: integer("min_notice_hours").notNull(),
  maxDaysAhead: integer("max_days_ahead").notNull(),
  requireApproval: boolean("require_approval").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Weekly recurring hours, expressed in the owner's timezone. */
export const availabilityRules = pgTable("availability_rules", {
  id: serial("id").primaryKey(),
  weekday: integer("weekday").notNull(), // ISO weekday: 1 = Monday ... 7 = Sunday
  startMinute: integer("start_minute").notNull(), // minutes after midnight
  endMinute: integer("end_minute").notNull(),
});

/** Whole days off (holidays, vacation), in the owner's timezone. */
export const blockedDates = pgTable("blocked_dates", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(), // YYYY-MM-DD
  reason: text("reason").notNull().default(""),
});

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(), // secret used in the booker's manage link
    name: text("name").notNull(),
    email: text("email").notNull(),
    notes: text("notes").notNull().default(""),
    timezone: text("timezone").notNull(), // booker's timezone, for their emails
    start: timestamp("start", { withTimezone: true }).notNull(),
    end: timestamp("end", { withTimezone: true }).notNull(),
    status: bookingStatus("status").notNull().default("pending"),
    sequence: integer("sequence").notNull().default(0), // calendar invite revision
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ startIdx: index("bookings_start_idx").on(t.start) }),
);

export type Settings = typeof settings.$inferSelect;
export type AvailabilityRule = typeof availabilityRules.$inferSelect;
export type BlockedDate = typeof blockedDates.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type BookingStatus = Booking["status"];
