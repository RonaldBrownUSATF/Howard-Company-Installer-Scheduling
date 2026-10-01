"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { allTimezones } from "@/lib/timezones";

type Status = "pending" | "confirmed" | "declined" | "cancelled";
type Booking = { id: string; name: string; email: string; notes: string; timezone: string; start: string; end: string; status: Status };
type Rule = { weekday: number; startMinute: number; endMinute: number };
type Blocked = { date: string; reason: string };
type SettingsForm = {
  ownerName: string;
  ownerEmail: string;
  title: string;
  description: string;
  timezone: string;
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  requireApproval: boolean;
};
type Config = { settings: SettingsForm; rules: Rule[]; blocked: Blocked[]; bookingUrl: string };
type Tab = "bookings" | "hours" | "invite" | "settings";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const toHM = (m: number) => `${String(Math.floor(Math.min(m, 1439) / 60)).padStart(2, "0")}:${String(Math.min(m, 1439) % 60).padStart(2, "0")}`;
const fromHM = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  if (r.status === 401) {
    window.location.href = "/admin/login";
    throw new Error("Signed out");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data as T;
}

export default function AdminClient() {
  const [tab, setTab] = useState<Tab>("bookings");
  const [config, setConfig] = useState<Config | null>(null);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [past, setPast] = useState<Booking[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const loadBookings = useCallback(async () => {
    const [u, p] = await Promise.all([
      api<{ bookings: Booking[] }>("/api/admin/bookings?scope=upcoming"),
      api<{ bookings: Booking[] }>("/api/admin/bookings?scope=past"),
    ]);
    setUpcoming(u.bookings);
    setPast(p.bookings);
  }, []);

  useEffect(() => {
    Promise.all([api<Config>("/api/admin/settings").then(setConfig), loadBookings()]).catch((e) => setError(e.message));
  }, [loadBookings]);

  if (error && !config) return <p className="error">{error}</p>;
  if (!config) return <p className="muted">Loading…</p>;

  const pendingCount = upcoming.filter((b) => b.status === "pending").length;

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <>
      <div className="admin-top">
        <h1>Scheduling</h1>
        <button className="btn btn-ghost btn-small" onClick={logout}>Sign out</button>
      </div>

      <div className="share">
        <span className="muted small">Your booking page</span>
        <code>{config.bookingUrl}</code>
        <button
          className="btn btn-small"
          onClick={async () => {
            await navigator.clipboard.writeText(config.bookingUrl).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <a className="btn btn-small" href="/" target="_blank" rel="noreferrer">Open</a>
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ["bookings", "Bookings"],
            ["hours", "Hours"],
            ["invite", "Invite by email"],
            ["settings", "Settings"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
            {id === "bookings" && pendingCount > 0 && <span className="count">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {tab === "bookings" && <BookingsTab upcoming={upcoming} past={past} tz={config.settings.timezone} reload={loadBookings} />}
      {tab === "hours" && <HoursTab config={config} onSaved={setConfig} />}
      {tab === "invite" && <InviteTab />}
      {tab === "settings" && <SettingsTab config={config} onSaved={setConfig} />}
    </>
  );
}

/* ------------------------------------------------------------------ bookings */

function BookingsTab({ upcoming, past, tz, reload }: { upcoming: Booking[]; past: Booking[]; tz: string; reload: () => Promise<void> }) {
  const [showPast, setShowPast] = useState(false);
  const pending = upcoming.filter((b) => b.status === "pending");
  const confirmed = upcoming.filter((b) => b.status === "confirmed");

  return (
    <>
      <section className="section">
        <h2>Waiting for your answer</h2>
        {pending.length === 0 ? (
          <p className="empty">No requests waiting. New requests show up here and in your email.</p>
        ) : (
          <div className="list">{pending.map((b) => <BookingItem key={b.id} b={b} tz={tz} reload={reload} />)}</div>
        )}
      </section>

      <section className="section">
        <h2>Coming up</h2>
        {confirmed.length === 0 ? (
          <p className="empty">Nothing booked yet. Share your booking link or send an invite to get started.</p>
        ) : (
          <div className="list">{confirmed.map((b) => <BookingItem key={b.id} b={b} tz={tz} reload={reload} />)}</div>
        )}
      </section>

      <section className="section">
        <div><button className="btn btn-small" onClick={() => setShowPast(!showPast)}>{showPast ? "Hide history" : `Show history (${past.length})`}</button></div>
        {showPast && (past.length === 0 ? <p className="empty">No past or closed bookings.</p> : <div className="list">{past.map((b) => <BookingItem key={b.id} b={b} tz={tz} reload={reload} readOnly />)}</div>)}
      </section>
    </>
  );
}

type Mode = null | "decline" | "cancel" | "reschedule";

function BookingItem({ b, tz, reload, readOnly }: { b: Booking; tz: string; reload: () => Promise<void>; readOnly?: boolean }) {
  const [mode, setMode] = useState<Mode>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = DateTime.fromISO(b.start).setZone(tz);
  const end = DateTime.fromISO(b.end).setZone(tz);

  const [date, setDate] = useState(start.toISODate()!);
  const [options, setOptions] = useState<string[] | null>(null);
  const [newStart, setNewStart] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "reschedule") return;
    setOptions(null);
    setNewStart(null);
    api<{ slots: string[] }>(`/api/admin/slots?date=${date}&exclude=${b.id}`)
      .then((d) => setOptions(d.slots))
      .catch((e) => setError(e.message));
  }, [mode, date, b.id]);

  async function act(action: "approve" | "decline" | "cancel" | "reschedule") {
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/bookings/${b.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, message: message || undefined, ...(action === "reschedule" ? { start: newStart } : {}) }),
      });
      setMode(null);
      setMessage("");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = { pending: "Request", confirmed: "Confirmed", declined: "Declined", cancelled: "Cancelled" }[b.status];

  return (
    <article className="item">
      <div className="item-row">
        <div>
          <div className="item-when">{start.toFormat("ccc, LLL d")}, {start.toFormat("h:mm a")}–{end.toFormat("h:mm a")}</div>
          <div>
            {b.name} <a href={`mailto:${b.email}`} className="small">{b.email}</a>
          </div>
          {b.timezone !== tz && <div className="muted small">Their time: {DateTime.fromISO(b.start).setZone(b.timezone).toFormat("h:mm a ZZZZ")}</div>}
        </div>
        <span className={`stamp stamp-${b.status}`}>{statusLabel}</span>
      </div>
      {b.notes && <p className="item-notes">{b.notes}</p>}

      {!readOnly && mode === null && (
        <div className="item-actions">
          {b.status === "pending" && (
            <>
              <button className="btn btn-primary btn-small" disabled={busy} onClick={() => act("approve")}>{busy ? "Approving…" : "Approve"}</button>
              <button className="btn btn-small" onClick={() => setMode("decline")}>Decline</button>
            </>
          )}
          <button className="btn btn-small" onClick={() => setMode("reschedule")}>Reschedule</button>
          {b.status === "confirmed" && <button className="btn btn-small btn-danger" onClick={() => setMode("cancel")}>Cancel</button>}
        </div>
      )}

      {mode && (
        <div className="act">
          {mode === "reschedule" && (
            <>
              <label className="field">
                <span>New date</span>
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 220 }} />
              </label>
              {options === null ? (
                <p className="muted small">Loading open times…</p>
              ) : options.length === 0 ? (
                <p className="muted small">No open times that day. Try another date or adjust your hours.</p>
              ) : (
                <div className="slot-pick">
                  {options.map((iso) => (
                    <button key={iso} className="btn btn-small" aria-pressed={newStart === iso} onClick={() => setNewStart(iso)}>
                      {DateTime.fromISO(iso).setZone(tz).toFormat("h:mm a")}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <label className="field">
            <span>Note to {b.name} (optional)</span>
            <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
            <small>Included in the email they receive.</small>
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="item-actions">
            {mode === "decline" && <button className="btn btn-primary btn-small" disabled={busy} onClick={() => act("decline")}>{busy ? "Declining…" : "Decline and email"}</button>}
            {mode === "cancel" && <button className="btn btn-primary btn-small" disabled={busy} onClick={() => act("cancel")}>{busy ? "Cancelling…" : "Cancel and email"}</button>}
            {mode === "reschedule" && (
              <button className="btn btn-primary btn-small" disabled={busy || !newStart} onClick={() => act("reschedule")}>
                {busy ? "Moving…" : "Move and email"}
              </button>
            )}
            <button className="btn btn-small" onClick={() => { setMode(null); setError(""); }}>Back</button>
          </div>
        </div>
      )}
      {mode === null && error && <p className="error" role="alert">{error}</p>}
    </article>
  );
}

/* ------------------------------------------------------------------ hours */

function useSave(onSaved: (c: Config) => void) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const save = async (payload: Omit<Config, "bookingUrl">) => {
    setSaving(true);
    setStatus(null);
    try {
      const c = await api<Config>("/api/admin/settings", { method: "PUT", body: JSON.stringify(payload) });
      onSaved(c);
      setStatus({ kind: "ok", text: "Saved. Your booking page now shows these times." });
    } catch (e) {
      setStatus({ kind: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };
  return { saving, status, save };
}

function HoursTab({ config, onSaved }: { config: Config; onSaved: (c: Config) => void }) {
  const [rules, setRules] = useState<Rule[]>(config.rules);
  const [blocked, setBlocked] = useState<Blocked[]>(config.blocked);
  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");
  const { saving, status, save } = useSave(onSaved);

  const invalid = rules.some((r) => r.endMinute <= r.startMinute);
  const update = (idx: number, patch: Partial<Rule>) => setRules(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const today = DateTime.now().setZone(config.settings.timezone).toISODate()!;

  return (
    <>
      <section className="section">
        <h2>Weekly hours</h2>
        <p className="muted small">In {config.settings.timezone.replace(/_/g, " ")}. Visitors see these converted to their own timezone.</p>
        <div className="week">
          {DAYS.map((label, d) => {
            const weekday = d + 1;
            const idxs = rules.map((r, i) => (r.weekday === weekday ? i : -1)).filter((i) => i >= 0);
            return (
              <div key={weekday} className="wd">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={idxs.length > 0}
                    onChange={(e) =>
                      setRules(
                        e.target.checked
                          ? [...rules, { weekday, startMinute: 540, endMinute: 1020 }]
                          : rules.filter((r) => r.weekday !== weekday),
                      )
                    }
                  />
                  <strong>{label}</strong>
                </label>
                <div className="wd-ranges">
                  {idxs.length === 0 && <span className="muted small">Unavailable</span>}
                  {idxs.map((i) => (
                    <div key={i} className="range">
                      <input className="input" type="time" step={300} value={toHM(rules[i].startMinute)} onChange={(e) => e.target.value && update(i, { startMinute: fromHM(e.target.value) })} aria-label={`${label} start`} />
                      <span>to</span>
                      <input className="input" type="time" step={300} value={toHM(rules[i].endMinute)} onChange={(e) => e.target.value && update(i, { endMinute: fromHM(e.target.value) })} aria-label={`${label} end`} />
                      <button className="btn btn-ghost btn-small" onClick={() => setRules(rules.filter((_, j) => j !== i))} aria-label={`Remove ${label} time range`}>Remove</button>
                      {rules[i].endMinute <= rules[i].startMinute && <span className="error small">End must be after start</span>}
                    </div>
                  ))}
                  {idxs.length > 0 && (
                    <div>
                      <button
                        className="btn btn-ghost btn-small"
                        onClick={() => {
                          const last = rules[idxs[idxs.length - 1]];
                          const s = Math.min(last.endMinute + 60, 1380);
                          setRules([...rules, { weekday, startMinute: s, endMinute: Math.min(s + 120, 1439) }]);
                        }}
                      >
                        Add another range
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2>Days off</h2>
        <p className="muted small">No times are offered on these dates, whatever your weekly hours say.</p>
        <div className="range">
          <input className="input" type="date" min={today} value={newDate} onChange={(e) => setNewDate(e.target.value)} aria-label="Date off" style={{ width: 180 }} />
          <input className="input" placeholder="Reason (only you see this)" value={newReason} onChange={(e) => setNewReason(e.target.value)} style={{ width: 240 }} />
          <button
            className="btn btn-small"
            disabled={!newDate}
            onClick={() => {
              setBlocked([...blocked.filter((b) => b.date !== newDate), { date: newDate, reason: newReason }].sort((a, b) => a.date.localeCompare(b.date)));
              setNewDate("");
              setNewReason("");
            }}
          >
            Add day off
          </button>
        </div>
        {blocked.length > 0 && (
          <div className="list">
            {blocked.map((b) => (
              <div key={b.date} className="item item-row">
                <span>
                  <strong>{DateTime.fromISO(b.date).toFormat("cccc, LLLL d, yyyy")}</strong>
                  {b.reason && <span className="muted"> ({b.reason})</span>}
                </span>
                <button className="btn btn-ghost btn-small" onClick={() => setBlocked(blocked.filter((x) => x.date !== b.date))}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="savebar">
        <button className="btn btn-primary" disabled={saving || invalid} onClick={() => save({ settings: config.settings, rules, blocked })}>
          {saving ? "Saving…" : "Save hours"}
        </button>
        {status && <span className={status.kind === "ok" ? "success" : "error"} role="status">{status.text}</span>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ invite */

function InviteTab() {
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const list = useMemo(() => emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean), [emails]);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{ sent: string[]; failed: string[] }>("/api/admin/invite", { method: "POST", body: JSON.stringify({ emails: list, message }) });
      setResult(
        r.failed.length
          ? { kind: "err", text: `Sent to ${r.sent.length}. Couldn't send to ${r.failed.join(", ")}.` }
          : { kind: "ok", text: `Invite sent to ${r.sent.length} ${r.sent.length === 1 ? "person" : "people"}.` },
      );
      if (!r.failed.length) {
        setEmails("");
        setMessage("");
      }
    } catch (e) {
      setResult({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section" style={{ maxWidth: 620 }}>
      <h2>Ask someone to book a time</h2>
      <p className="muted small">They get an email with a link to your booking page.</p>
      <label className="field">
        <span>Email addresses</span>
        <textarea className="textarea" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="alex@example.com, sam@example.com" inputMode="email" />
        <small>Separate several with commas or new lines.</small>
      </label>
      <label className="field">
        <span>Message (optional)</span>
        <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
      </label>
      {result && <p className={result.kind === "ok" ? "success" : "error"} role="status">{result.text}</p>}
      <div>
        <button className="btn btn-primary" disabled={busy || list.length === 0} onClick={send}>
          {busy ? "Sending…" : list.length > 1 ? `Send ${list.length} invites` : "Send invite"}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ settings */

function SettingsTab({ config, onSaved }: { config: Config; onSaved: (c: Config) => void }) {
  const [s, setS] = useState<SettingsForm>(config.settings);
  const { saving, status, save } = useSave(onSaved);
  const zones = useMemo(() => allTimezones(s.timezone), [s.timezone]);
  const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) => setS({ ...s, [k]: v });
  const num = (k: keyof SettingsForm) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);

  return (
    <>
      <section className="section">
        <h2>Booking page</h2>
        <div className="grid-2">
          <label className="field"><span>Your name</span><input className="input" value={s.ownerName} onChange={(e) => set("ownerName", e.target.value)} /></label>
          <label className="field">
            <span>Your email</span>
            <input className="input" type="email" value={s.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} />
            <small>New requests and cancellations are sent here.</small>
          </label>
          <label className="field"><span>Page title</span><input className="input" value={s.title} onChange={(e) => set("title", e.target.value)} /></label>
          <label className="field">
            <span>Your timezone</span>
            <select className="select" value={s.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Description (optional)</span>
          <textarea className="textarea" value={s.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} />
          <small>Shown under the title. Say what the meeting is for or where it happens.</small>
        </label>
      </section>

      <section className="section">
        <h2>Booking rules</h2>
        <div className="grid-2">
          <label className="field"><span>Meeting length (minutes)</span><input className="input" type="number" min={5} max={480} step={5} value={s.slotMinutes} onChange={num("slotMinutes")} /></label>
          <label className="field">
            <span>Break between meetings (minutes)</span>
            <input className="input" type="number" min={0} max={240} step={5} value={s.bufferMinutes} onChange={num("bufferMinutes")} />
          </label>
          <label className="field">
            <span>Minimum notice (hours)</span>
            <input className="input" type="number" min={0} max={720} value={s.minNoticeHours} onChange={num("minNoticeHours")} />
            <small>Stops last-minute bookings.</small>
          </label>
          <label className="field"><span>How far ahead people can book (days)</span><input className="input" type="number" min={1} max={365} value={s.maxDaysAhead} onChange={num("maxDaysAhead")} /></label>
        </div>
        <label className="check">
          <input type="checkbox" checked={s.requireApproval} onChange={(e) => set("requireApproval", e.target.checked)} />
          <span>
            <strong>Approve each booking myself</strong>
            <br />
            <span className="muted small">When off, bookings are confirmed right away and the calendar invite goes out immediately.</span>
          </span>
        </label>
      </section>

      <div className="savebar">
        <button className="btn btn-primary" disabled={saving} onClick={() => save({ settings: s, rules: config.rules, blocked: config.blocked })}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {status && <span className={status.kind === "ok" ? "success" : "error"} role="status">{status.text.replace("now shows these times", "is updated")}</span>}
      </div>
    </>
  );
}
