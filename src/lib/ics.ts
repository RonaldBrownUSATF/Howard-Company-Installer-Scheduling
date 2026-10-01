type IcsInput = {
  uid: string;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  organizerName: string;
  organizerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
};

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const escapeParam = (s: string) => s.replace(/["\r\n;:,]/g, " ").trim();

/** Folds lines at 75 octets as RFC 5545 requires. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(e: IcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Scheduler//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.method}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${escapeText(e.summary)}`,
    e.description ? `DESCRIPTION:${escapeText(e.description)}` : "",
    `ORGANIZER;CN=${escapeParam(e.organizerName)}:mailto:${e.organizerEmail}`,
    `ATTENDEE;CN=${escapeParam(e.attendeeName)};ROLE=REQ-PARTICIPANT:mailto:${e.attendeeEmail}`,
    `STATUS:${e.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n") + "\r\n";
}
