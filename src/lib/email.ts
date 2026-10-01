import { Resend } from "resend";

type Email = { to: string; subject: string; html: string; text: string; ics?: string; replyTo?: string };

/**
 * Sends one email through Resend. Without RESEND_API_KEY the message is printed
 * to the server console, so the app works end to end in development.
 * Never throws: a failed email should not undo a booking.
 */
export async function sendEmail(msg: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[email] to=${msg.to}\n[email] subject=${msg.subject}\n${msg.text}\n${msg.ics ? "[email] + invite.ics attached\n" : ""}`);
    return true;
  }
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Scheduling <onboarding@resend.dev>",
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: msg.replyTo || undefined,
      attachments: msg.ics ? [{ filename: "invite.ics", content: Buffer.from(msg.ics, "utf8") }] : undefined,
    });
    if (error) {
      console.error("[email] send failed", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed", err);
    return false;
  }
}

/** Sender's bare address from EMAIL_FROM, used as calendar organizer fallback. */
export function fromAddress() {
  const raw = process.env.EMAIL_FROM || "onboarding@resend.dev";
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}
