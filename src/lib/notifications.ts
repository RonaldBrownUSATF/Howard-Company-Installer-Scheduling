import { DateTime } from "luxon";
import type { Booking, Settings } from "@/db/schema";
import { buildIcs } from "./ics";
import { fromAddress, sendEmail } from "./email";

export type BookingEvent =
  | "requested"
  | "auto_confirmed"
  | "approved"
  | "declined"
  | "cancelled_by_owner"
  | "cancelled_by_booker"
  | "rescheduled";

export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

export function formatWhen(d: Date, tz: string) {
  return DateTime.fromJSDate(d).setZone(tz).toFormat("cccc, LLLL d, yyyy 'at' h:mm a ZZZZ");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Block = { heading: string; lines: string[]; note?: string; cta?: { href: string; label: string } };

function render(b: Block) {
  const paragraphs = b.lines.map((l) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${esc(l)}</p>`).join("");
  const note = b.note
    ? `<div style="margin:16px 0;padding:12px 16px;border-left:3px solid #0E7C66;background:#EEF4F2;white-space:pre-wrap;font-size:15px;line-height:1.5">${esc(b.note)}</div>`
    : "";
  const cta = b.cta
    ? `<p style="margin:24px 0 0"><a href="${esc(b.cta.href)}" style="display:inline-block;background:#0E7C66;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${esc(b.cta.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F6F8F7;padding:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#16302B">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #D5DEDA;border-radius:12px;padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${esc(b.heading)}</h1>${paragraphs}${note}${cta}</div></body></html>`;
  const text = [b.heading, "", ...b.lines, b.note ? `\nNote:\n${b.note}` : "", b.cta ? `\n${b.cta.label}: ${b.cta.href}` : ""]
    .filter((l) => l !== undefined)
    .join("\n");
  return { html, text };
}

function invite(b: Booking, s: Settings, method: "REQUEST" | "CANCEL") {
  const host = new URL(appUrl()).host;
  return buildIcs({
    uid: `${b.id}@${host}`,
    sequence: b.sequence,
    method,
    start: b.start,
    end: b.end,
    summary: `${s.title} with ${s.ownerName}`,
    description: `Manage this booking: ${appUrl()}/booking/${b.token}`,
    organizerName: s.ownerName,
    organizerEmail: s.ownerEmail || fromAddress(),
    attendeeName: b.name,
    attendeeEmail: b.email,
  });
}

/**
 * Sends the emails that go with a booking change, to the booker and/or the owner.
 * `message` is an optional personal note from whoever made the change.
 */
export async function notify(
  event: BookingEvent,
  b: Booking,
  s: Settings,
  extra: { message?: string; previousStart?: Date } = {},
) {
  const manage = `${appUrl()}/booking/${b.token}`;
  const admin = `${appUrl()}/admin`;
  const whenBooker = formatWhen(b.start, b.timezone);
  const whenOwner = formatWhen(b.start, s.timezone);
  const minutes = Math.round((b.end.getTime() - b.start.getTime()) / 60000);
  const note = extra.message?.trim() || undefined;
  const toBooker = (subject: string, block: Block, ics?: string) =>
    sendEmail({ to: b.email, subject, ...render(block), ics, replyTo: s.ownerEmail });
  const toOwner = (subject: string, block: Block) =>
    s.ownerEmail ? sendEmail({ to: s.ownerEmail, subject, ...render(block), replyTo: b.email }) : Promise.resolve(true);

  const ownerDetails = [
    `${b.name} (${b.email})`,
    `${whenOwner}, ${minutes} minutes`,
    ...(b.notes ? [`Their note: ${b.notes}`] : []),
  ];

  switch (event) {
    case "requested":
      await Promise.all([
        toBooker(`Request received: ${s.title} on ${whenBooker}`, {
          heading: "Your request is in",
          lines: [`You asked to meet ${s.ownerName} on ${whenBooker} for ${minutes} minutes.`, `You'll get another email once ${s.ownerName} confirms.`],
          cta: { href: manage, label: "View or cancel your request" },
        }),
        toOwner(`New request from ${b.name}: ${whenOwner}`, {
          heading: "New booking request",
          lines: ownerDetails,
          cta: { href: admin, label: "Approve or decline" },
        }),
      ]);
      break;

    case "auto_confirmed":
    case "approved":
      await Promise.all([
        toBooker(
          `Confirmed: ${s.title} on ${whenBooker}`,
          {
            heading: "You're booked",
            lines: [`${s.title} with ${s.ownerName}`, `${whenBooker}, ${minutes} minutes`, "The attached invite adds it to your calendar."],
            note,
            cta: { href: manage, label: "View or cancel your booking" },
          },
          invite(b, s, "REQUEST"),
        ),
        event === "auto_confirmed"
          ? toOwner(`New booking with ${b.name}: ${whenOwner}`, { heading: "New booking", lines: ownerDetails, cta: { href: admin, label: "Open dashboard" } })
          : Promise.resolve(true),
      ]);
      break;

    case "declined":
      await toBooker(`Not available: ${s.title} on ${whenBooker}`, {
        heading: `${s.ownerName} can't make that time`,
        lines: [`Your request for ${whenBooker} was declined.`, "You're welcome to pick another time."],
        note,
        cta: { href: appUrl(), label: "Choose another time" },
      });
      break;

    case "cancelled_by_owner":
      await toBooker(
        `Cancelled: ${s.title} on ${whenBooker}`,
        {
          heading: "Your booking was cancelled",
          lines: [`${s.ownerName} cancelled ${s.title} on ${whenBooker}.`],
          note,
          cta: { href: appUrl(), label: "Book a new time" },
        },
        invite({ ...b, sequence: b.sequence + 1 }, s, "CANCEL"),
      );
      break;

    case "cancelled_by_booker":
      await Promise.all([
        toBooker(
          `Cancelled: ${s.title} on ${whenBooker}`,
          { heading: "Your booking is cancelled", lines: [`You cancelled ${s.title} on ${whenBooker}.`], cta: { href: appUrl(), label: "Book a new time" } },
          invite({ ...b, sequence: b.sequence + 1 }, s, "CANCEL"),
        ),
        toOwner(`Cancelled by ${b.name}: ${whenOwner}`, { heading: "A booking was cancelled", lines: ownerDetails, note, cta: { href: admin, label: "Open dashboard" } }),
      ]);
      break;

    case "rescheduled": {
      const was = extra.previousStart ? formatWhen(extra.previousStart, b.timezone) : undefined;
      await toBooker(
        `New time: ${s.title} on ${whenBooker}`,
        {
          heading: "Your booking has a new time",
          lines: [...(was ? [`Was: ${was}`] : []), `Now: ${whenBooker}, ${minutes} minutes`, ...(b.status === "pending" ? ["This is still a request. You'll get a confirmation email."] : ["The attached invite updates your calendar."])],
          note,
          cta: { href: manage, label: "View or cancel your booking" },
        },
        b.status === "confirmed" ? invite(b, s, "REQUEST") : undefined,
      );
      break;
    }
  }
}

/** A plain invitation asking someone to pick a time on the booking page. */
export async function sendInvite(to: string, s: Settings, message?: string) {
  return sendEmail({
    to,
    subject: `${s.ownerName} invited you to book a time`,
    replyTo: s.ownerEmail,
    ...render({
      heading: `Pick a time to meet ${s.ownerName}`,
      lines: [`${s.title}, ${s.slotMinutes} minutes.`, "Choose any open time that works for you."],
      note: message?.trim() || undefined,
      cta: { href: appUrl(), label: "See available times" },
    }),
  });
}
