"use client";

import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      window.location.href = "/admin";
      return;
    }
    const data = r ? await r.json().catch(() => ({})) : {};
    setError(data.error || "Sign-in failed. Check your connection.");
  }

  return (
    <main className="shell">
      <form className="login panel" onSubmit={submit}>
        <h1>Sign in</h1>
        <p className="muted">Manage your bookings and availability.</p>
        <label className="field">
          <span>Admin password</span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
