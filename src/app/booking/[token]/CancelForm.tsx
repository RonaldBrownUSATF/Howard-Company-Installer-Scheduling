"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelForm({ token }: { token: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancel() {
    setBusy(true);
    setError("");
    const r = await fetch(`/api/bookings/${encodeURIComponent(token)}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) {
      const data = r ? await r.json().catch(() => ({})) : {};
      setError(data.error || "The booking wasn't cancelled. Try again.");
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <div className="form-actions">
        <button className="btn btn-danger" onClick={() => setOpen(true)}>Cancel booking</button>
        <a className="btn" href="/">Book another time</a>
      </div>
    );
  }
  return (
    <div className="form">
      <label className="field">
        <span>Reason (optional, shared with the organizer)</span>
        <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-primary" onClick={cancel} disabled={busy}>{busy ? "Cancelling…" : "Confirm cancellation"}</button>
        <button className="btn" onClick={() => setOpen(false)}>Keep booking</button>
      </div>
    </div>
  );
}
