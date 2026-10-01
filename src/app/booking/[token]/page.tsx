import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { formatWhen } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";
import CancelForm from "./CancelForm";

export const dynamic = "force-dynamic";

const LABEL = { pending: "Awaiting confirmation", confirmed: "Confirmed", declined: "Declined", cancelled: "Cancelled" } as const;

export default async function ManageBooking({ params }: { params: { token: string } }) {
  const [b] = await db.select().from(bookings).where(eq(bookings.token, params.token));
  if (!b) notFound();
  const s = await getSettings();
  const active = (b.status === "pending" || b.status === "confirmed") && b.end > new Date();

  return (
    <main className="shell">
      <section className="done panel">
        <span className={`stamp stamp-${b.status}`}>{LABEL[b.status]}</span>
        <h2>{s.title} with {s.ownerName}</h2>
        <p>{formatWhen(b.start, b.timezone)}</p>
        <p className="muted">
          Booked by {b.name} ({b.email}), {Math.round((b.end.getTime() - b.start.getTime()) / 60000)} minutes.
        </p>
        {active ? <CancelForm token={b.token} /> : <p><a href="/">Book another time</a></p>}
      </section>
    </main>
  );
}
