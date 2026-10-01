import BookingClient from "./BookingClient";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await getSettings();
  return (
    <main className="shell">
      <BookingClient
        ownerName={s.ownerName}
        title={s.title}
        description={s.description}
        slotMinutes={s.slotMinutes}
        maxDaysAhead={s.maxDaysAhead}
        requireApproval={s.requireApproval}
      />
    </main>
  );
}
