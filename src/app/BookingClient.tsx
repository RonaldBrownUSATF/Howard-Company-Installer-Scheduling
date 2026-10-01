"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { allTimezones } from "@/lib/timezones";

type Props = {
  ownerName: string;
  title: string;
  description: string;
  slotMinutes: number;
  maxDaysAhead: number;
  requireApproval: boolean;
};

type Done = { token: string; status: string; when: string };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function BookingClient(p: Props) {
  const [tz, setTz] = useState<string | null>(null);
  const [view, setView] = useState<{ year: number; month: number } | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", notes: "", website: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [reload, setReload] = useState(0);

  // Detect the visitor's timezone on the client only.
  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setTz(detected);
    const now = DateTime.now().setZone(detected);
    setView({ year: now.year, month: now.month });
  }, []);

  const zones = useMemo(() => (tz ? allTimezones(tz) : []), [tz]);
  const monthStart = useMemo(
    () => (tz && view ? DateTime.fromObject({ year: view.year, month: view.month, day: 1 }, { zone: tz }) : null),
    [tz, view],
  );

  useEffect(() => {
    if (!monthStart) return;
    const ctrl = new AbortController();
    const from = monthStart.toUTC().toISO()!;
    const to = monthStart.plus({ months: 1 }).toUTC().toISO()!;
    setLoading(true);
    setLoadError("");
    fetch(`/api/slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Could not load times.");
        setSlots(data.slots as string[]);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLoadError("Available times didn't load. Check your connection and try again.");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [monthStart, reload]);

  const byDay = useMemo(() => {
    const map = new Map<string, DateTime[]>();
    if (!tz) return map;
    for (const iso of slots) {
      const dt = DateTime.fromISO(iso).setZone(tz);
      const key = dt.toISODate()!;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(dt);
    }
    return map;
  }, [slots, tz]);

  // Keep a sensible day selected as the month or timezone changes.
  useEffect(() => {
    if (loading) return;
    if (day && byDay.has(day)) return;
    setDay(byDay.keys().next().value ?? null);
    setSlot(null);
  }, [byDay, loading, day]);

  if (!tz || !view || !monthStart) {
    return <Intro {...p} />;
  }

  const now = DateTime.now().setZone(tz);
  const todayKey = now.toISODate();
  const canPrev = monthStart > now.startOf("month");
  const canNext = monthStart.plus({ months: 1 }) <= now.plus({ days: p.maxDaysAhead });
  const leading = monthStart.weekday % 7; // Sunday-first grid
  const cells: (DateTime | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: monthStart.daysInMonth! }, (_, i) => monthStart.plus({ days: i })),
  ];
  const shift = (n: number) => {
    const next = monthStart.plus({ months: n });
    setView({ year: next.year, month: next.month });
  };
  const daySlots = day ? byDay.get(day) ?? [] : [];
  const selected = slot ? DateTime.fromISO(slot).setZone(tz) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slot || !selected) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const r = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: slot, timezone: tz, ...form }),
      });
      const data = await r.json();
      if (!r.ok) {
        setSubmitError(data.error || "Booking didn't go through. Try again.");
        if (r.status === 409) {
          setSlot(null);
          setReload((n) => n + 1);
        }
        return;
      }
      setDone({ token: data.token, status: data.status, when: selected.toFormat("cccc, LLLL d 'at' h:mm a") });
    } catch {
      setSubmitError("Booking didn't go through. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    const pending = done.status === "pending";
    return (
      <>
        <Intro {...p} />
        <section className="done panel" aria-live="polite">
          <span className={`stamp ${pending ? "stamp-pending" : "stamp-confirmed"}`}>{pending ? "Requested" : "Confirmed"}</span>
          <h2>{pending ? "Request sent" : "You're booked"}</h2>
          <p>
            {done.when} ({tz.replace(/_/g, " ")}), {p.slotMinutes} minutes with {p.ownerName}.
          </p>
          <p className="muted">
            {pending
              ? `We emailed ${form.email} a copy. You'll get another email when ${p.ownerName} confirms.`
              : `A confirmation and calendar invite are on their way to ${form.email}.`}
          </p>
          {done.token && (
            <p>
              <a href={`/booking/${done.token}`}>View or cancel this booking</a>
            </p>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <Intro {...p}>
        <label className="meta">
          <span>Times shown in</span>
          <select className="select" value={tz} onChange={(e) => setTz(e.target.value)} aria-label="Your timezone">
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </Intro>

      <div className="book">
        <section className="panel" aria-label="Choose a date">
          <div className="cal-head">
            <h2>{monthStart.toFormat("LLLL yyyy")}</h2>
            <div className="cal-nav">
              <button className="btn btn-ghost" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month">‹</button>
              <button className="btn btn-ghost" onClick={() => shift(1)} disabled={!canNext} aria-label="Next month">›</button>
            </div>
          </div>
          <div className="cal-grid" role="grid">
            {WEEKDAYS.map((d) => (
              <div key={d} className="cal-dow" role="columnheader">{d}</div>
            ))}
            {cells.map((c, i) => {
              if (!c) return <div key={`b${i}`} />;
              const key = c.toISODate()!;
              const open = byDay.has(key);
              const cls = ["cal-day", open && "open", key === day && "selected", key === todayKey && "today"].filter(Boolean).join(" ");
              return (
                <button
                  key={key}
                  className={cls}
                  disabled={!open}
                  aria-pressed={key === day}
                  aria-label={`${c.toFormat("cccc, LLLL d")}${open ? `, ${byDay.get(key)!.length} times open` : ", no times"}`}
                  onClick={() => {
                    setDay(key);
                    setSlot(null);
                  }}
                >
                  {c.day}
                </button>
              );
            })}
          </div>
          {!loading && !loadError && byDay.size === 0 && (
            <p className="cal-empty">No open times this month. {canNext ? "Try the next month." : ""}</p>
          )}
          {loadError && (
            <p className="error" style={{ marginTop: 14 }}>
              {loadError}{" "}
              <button className="btn btn-small" onClick={() => setReload((n) => n + 1)}>Try again</button>
            </p>
          )}
        </section>

        <section className="panel" aria-label={selected ? "Your details" : "Choose a time"}>
          {selected ? (
            <form className="form" onSubmit={submit}>
              <div className="chosen">
                <strong>{selected.toFormat("cccc, LLLL d")}</strong>
                <span>
                  {selected.toFormat("h:mm a")} to {selected.plus({ minutes: p.slotMinutes }).toFormat("h:mm a")}
                </span>
              </div>
              <label className="field">
                <span>Your name</span>
                <input className="input" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="field">
                <span>Your Email</span>
                <input className="input" type="email" required autoComplete="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <small>Confirmations and updates go here.</small>
              </label>
              <label className="field">
                <span>Name, Phone Number, Install Site</span>
                <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} />
              </label>
              <label className="hp" aria-hidden="true">
                Website
                <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </label>
              {submitError && <p className="error" role="alert">{submitError}</p>}
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? "Sending…" : p.requireApproval ? "Send request" : "Book this time"}
                </button>
                <button className="btn" type="button" onClick={() => setSlot(null)}>Change time</button>
              </div>
            </form>
          ) : (
            <>
              {day ? (
                <div className="day-head">
                  <span className="dow">{DateTime.fromISO(day, { zone: tz }).toFormat("cccc")}</span>
                  <span className="date">{DateTime.fromISO(day, { zone: tz }).toFormat("LLLL d")}</span>
                </div>
              ) : (
                <div className="day-head"><span className="dow">Pick a date to see times</span></div>
              )}
              {loading ? (
                <div aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div>
              ) : (
                <div className="ruler-scroll">
                  <ul className="ruler">
                    {daySlots.map((dt, i) => {
                      const newHour = i === 0 || daySlots[i - 1].hour !== dt.hour;
                      const iso = dt.toUTC().toISO()!;
                      return (
                        <li key={iso} className={newHour ? "hour" : ""}>
                          <span className="tick" aria-hidden="true">{newHour ? dt.toFormat("h a") : ""}</span>
                          <button className="slot" aria-pressed={slot === iso} onClick={() => setSlot(iso)}>
                            <span>{dt.toFormat("h:mm a")}</span>
                            <span className="end">until {dt.plus({ minutes: p.slotMinutes }).toFormat("h:mm")}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function Intro(p: Props & { children?: React.ReactNode }) {
  return (
    <header className="intro">
      <p className="owner">{p.ownerName}</p>
      <h1>{p.title}</h1>
      {p.description && <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{p.description}</p>}
      <div className="meta">
        <span>{p.slotMinutes} minutes</span>
        {p.requireApproval && <span>Requests are confirmed by email</span>}
      </div>
      {p.children}
    </header>
  );
}
