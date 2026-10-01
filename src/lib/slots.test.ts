import assert from "node:assert/strict";
import { generateSlots, type GenerateInput } from "./slots";

const base: GenerateInput = {
  settings: { timezone: "America/New_York", slotMinutes: 30, bufferMinutes: 0, minNoticeHours: 0, maxDaysAhead: 60 },
  rules: [{ weekday: 1, startMinute: 540, endMinute: 660 }], // Mondays 9:00–11:00
  blockedDates: [],
  busy: [],
  from: new Date("2026-10-05T00:00:00Z"), // Monday
  to: new Date("2026-10-06T12:00:00Z"),
  now: new Date("2026-10-01T00:00:00Z"),
};
let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };

test("lays 30-minute slots across a window, in owner's timezone", () => {
  assert.deepEqual(generateSlots(base), [
    "2026-10-05T13:00:00.000Z", "2026-10-05T13:30:00.000Z", "2026-10-05T14:00:00.000Z", "2026-10-05T14:30:00.000Z",
  ]);
});
test("existing bookings remove overlapping slots", () => {
  const out = generateSlots({ ...base, busy: [{ start: new Date("2026-10-05T13:30:00Z"), end: new Date("2026-10-05T14:00:00Z") }] });
  assert.deepEqual(out, ["2026-10-05T13:00:00.000Z", "2026-10-05T14:00:00.000Z", "2026-10-05T14:30:00.000Z"]);
});
test("buffer keeps a gap on both sides of a booking", () => {
  const out = generateSlots({
    ...base,
    settings: { ...base.settings, bufferMinutes: 15 },
    busy: [{ start: new Date("2026-10-05T14:00:00Z"), end: new Date("2026-10-05T14:30:00Z") }],
  });
  assert.deepEqual(out, ["2026-10-05T13:00:00.000Z"]);
});
test("blocked dates offer nothing", () => {
  assert.deepEqual(generateSlots({ ...base, blockedDates: ["2026-10-05"] }), []);
});
test("minimum notice hides near-term slots", () => {
  const out = generateSlots({ ...base, now: new Date("2026-10-05T12:00:00Z"), settings: { ...base.settings, minNoticeHours: 2 } });
  assert.deepEqual(out, ["2026-10-05T14:00:00.000Z", "2026-10-05T14:30:00.000Z"]);
});
test("booking horizon caps how far ahead", () => {
  assert.deepEqual(generateSlots({ ...base, settings: { ...base.settings, maxDaysAhead: 3 } }), []);
});
test("slots that don't fit the window's end are dropped", () => {
  const out = generateSlots({ ...base, settings: { ...base.settings, slotMinutes: 45 } });
  assert.deepEqual(out, ["2026-10-05T13:00:00.000Z", "2026-10-05T13:45:00.000Z"]);
});
test("DST: wall-clock hours stay put after clocks change", () => {
  // US clocks fall back Sun Nov 1 2026; Monday Nov 2 9:00 EST = 14:00Z
  const out = generateSlots({ ...base, from: new Date("2026-11-02T00:00:00Z"), to: new Date("2026-11-03T00:00:00Z") });
  assert.equal(out[0], "2026-11-02T14:00:00.000Z");
});
test("DST: nonexistent spring-forward times are skipped", () => {
  const out = generateSlots({
    ...base,
    rules: [{ weekday: 7, startMinute: 120, endMinute: 240 }], // Sunday 2:00–4:00
    from: new Date("2026-03-08T00:00:00Z"),
    to: new Date("2026-03-09T00:00:00Z"),
    now: new Date("2026-03-01T00:00:00Z"),
  });
  assert.deepEqual(out, ["2026-03-08T07:00:00.000Z", "2026-03-08T07:30:00.000Z"]); // 3:00, 3:30 EDT
});
test("overlapping rules don't duplicate slots", () => {
  const out = generateSlots({ ...base, rules: [...base.rules, { weekday: 1, startMinute: 600, endMinute: 660 }] });
  assert.equal(out.length, 4);
});
console.log(`${passed} tests passed`);
