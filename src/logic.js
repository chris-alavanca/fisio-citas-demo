// Pure scheduling logic: no React, no browser APIs. Covered by logic.test.js.
export const SLOT_STEP = 15;     // minutes between possible start times
export const LEAD_HOURS = 2;     // no booking closer than this to now
export const CANCEL_HOURS = 24;  // patients can cancel up to this long before

let counter = 0;
export const uid = p => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMin = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parts = iso => iso.split('-').map(Number);
export const addDays = (iso, n) => { const [y, m, d] = parts(iso); return isoDay(new Date(y, m - 1, d + n)); };
export const weekday = iso => { const [y, m, d] = parts(iso); return new Date(y, m - 1, d).getDay(); }; // 0 = Sunday
export const startOf = (date, time) => { const [y, m, d] = parts(date); const [hh, mm] = time.split(':').map(Number); return new Date(y, m - 1, d, hh, mm); };
const isWeekend = iso => [0, 6].includes(weekday(iso));
export const nextWorkday = iso => { let x = addDays(iso, 1); while (isWeekend(x)) x = addDays(x, 1); return x; };
export const prevWorkday = iso => { let x = addDays(iso, -1); while (isWeekend(x)) x = addDays(x, -1); return x; };
export const workdayOnOrAfter = iso => (isWeekend(iso) ? nextWorkday(iso) : iso);
export const digits = s => String(s || '').replace(/\D/g, '');
// Same person whether the number is written with or without a country code: compare the last nine digits.
export const phoneKey = s => digits(s).slice(-9);
const validPhone = p => { const n = digits(p).length; return n >= 9 && n <= 15; };

const minutesOf = (s, treatmentId) => (s.treatments.find(t => t.id === treatmentId) || { minutes: 0 }).minutes;

// Can [start, end) fit for this practitioner, given the day's appointments and the number of treatment rooms?
function fits(s, dayAppts, practitionerId, start, end) {
  const spans = dayAppts.map(a => { const st = toMin(a.time); return { p: a.practitionerId, st, en: st + minutesOf(s, a.treatmentId) }; });
  const overlapping = spans.filter(x => x.st < end && x.en > start);
  if (overlapping.some(x => x.p === practitionerId)) return false;
  const points = [start, ...overlapping.map(x => x.st).filter(v => v > start && v < end)];
  return points.every(p => overlapping.filter(x => x.st <= p && x.en > p).length < s.rooms);
}

export function freeSlots(s, { date, treatmentId, practitionerId = null, now = new Date() }) {
  const treat = s.treatments.find(t => t.id === treatmentId);
  if (!treat) return [];
  const earliest = now.getTime() + LEAD_HOURS * 3600e3;
  const dayAppts = s.appointments.filter(a => a.date === date && a.status !== 'cancelled');
  const out = [];
  for (const p of s.practitioners) {
    if (!p.treatments.includes(treatmentId)) continue;
    if (practitionerId && p.id !== practitionerId) continue;
    for (const [from, to] of p.hours[weekday(date)] || []) {
      for (let m = toMin(from); m + treat.minutes <= toMin(to); m += SLOT_STEP) {
        const time = fromMin(m);
        if (startOf(date, time).getTime() < earliest) continue;
        if (fits(s, dayAppts, p.id, m, m + treat.minutes)) out.push({ time, practitionerId: p.id });
      }
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.practitionerId.localeCompare(b.practitionerId));
}

export function book(s, { name, phone, treatmentId, practitionerId = null, date, time, courseId = null }, now = new Date()) {
  const nm = (name || '').trim();
  if (nm.length < 2) return { state: s, appt: null, error: 'name' };
  if (!validPhone(phone)) return { state: s, appt: null, error: 'phone' };
  const slot = freeSlots(s, { date, treatmentId, practitionerId, now }).find(x => x.time === time);
  if (!slot) return { state: s, appt: null, error: 'unavailable' };
  let patient = s.patients.find(p => phoneKey(p.phone) === phoneKey(phone));
  let patients = s.patients;
  if (!patient) { patient = { id: uid('p'), name: nm, phone: String(phone).trim() }; patients = [...patients, patient]; }
  const appt = { id: uid('a'), patientId: patient.id, treatmentId, practitionerId: slot.practitionerId, date, time, status: 'booked', courseId, packId: '', createdAt: now.toISOString() };
  return { state: { ...s, patients, appointments: [...s.appointments, appt] }, appt, error: '' };
}

// A treatment course: the same time and practitioner every week. Weeks that are taken are skipped and reported.
export function bookCourse(s, input, weeks, now = new Date()) {
  const w = Math.max(1, Math.min(12, Math.floor(Number(weeks)) || 1));
  const courseId = w > 1 ? uid('c') : null;
  let state = s;
  let practitionerId = input.practitionerId || null;
  const booked = [];
  const skipped = [];
  for (let i = 0; i < w; i++) {
    const date = addDays(input.date, 7 * i);
    const r = book(state, { ...input, practitionerId, date, courseId }, now);
    if (r.error) {
      if (i === 0) return { state: s, booked: [], skipped: [], error: r.error };
      skipped.push(date);
    } else {
      state = r.state;
      booked.push(r.appt);
      practitionerId = r.appt.practitionerId;
    }
  }
  return { state, booked, skipped, error: '' };
}

const setStatus = (s, id, patch) => ({ ...s, appointments: s.appointments.map(a => (a.id === id ? { ...a, ...patch } : a)) });

export function cancelAppt(s, id, by, now = new Date()) {
  const a = s.appointments.find(x => x.id === id);
  if (!a || a.status !== 'booked') return { state: s, error: 'notBooked' };
  const hours = (startOf(a.date, a.time).getTime() - now.getTime()) / 3600e3;
  if (by === 'patient' && hours < CANCEL_HOURS) return { state: s, error: 'tooLate' };
  return { state: setStatus(s, id, { status: 'cancelled', cancelledBy: by }), error: '' };
}

// Attending uses one session from the patient's oldest pack with sessions left, if the treatment is pack-eligible.
export function markAttended(s, id) {
  const a = s.appointments.find(x => x.id === id);
  if (!a || a.status !== 'booked') return s;
  const treat = s.treatments.find(t => t.id === a.treatmentId);
  const pack = treat && treat.packEligible ? s.packs.find(p => p.patientId === a.patientId && p.used < p.sessions) : null;
  const next = setStatus(s, id, { status: 'attended', packId: pack ? pack.id : '' });
  return pack ? { ...next, packs: next.packs.map(p => (p.id === pack.id ? { ...p, used: p.used + 1 } : p)) } : next;
}

export function markNoShow(s, id) {
  const a = s.appointments.find(x => x.id === id);
  return a && a.status === 'booked' ? setStatus(s, id, { status: 'no-show' }) : s;
}

// Undo a misclick: back to booked, and give the pack session back.
export function reopen(s, id) {
  const a = s.appointments.find(x => x.id === id);
  if (!a || (a.status !== 'attended' && a.status !== 'no-show')) return s;
  const next = setStatus(s, id, { status: 'booked', packId: '' });
  return a.packId ? { ...next, packs: next.packs.map(p => (p.id === a.packId ? { ...p, used: Math.max(0, p.used - 1) } : p)) } : next;
}

export function sellPack(s, patientId, sessions = 5, now = new Date()) {
  if (!s.patients.some(p => p.id === patientId)) return s;
  return { ...s, packs: [...s.packs, { id: uid('k'), patientId, sessions, used: 0, boughtAt: now.toISOString() }] };
}
export const sessionsLeft = (s, patientId) => s.packs.filter(p => p.patientId === patientId).reduce((a, p) => a + (p.sessions - p.used), 0);
export const noShows = (s, patientId) => s.appointments.filter(a => a.patientId === patientId && a.status === 'no-show').length;

export function addWaitlist(s, { name, phone, treatmentId, date }, now = new Date()) {
  const nm = (name || '').trim();
  if (nm.length < 2) return { state: s, error: 'name' };
  if (!validPhone(phone)) return { state: s, error: 'phone' };
  if (!s.treatments.some(t => t.id === treatmentId) || !date) return { state: s, error: 'unavailable' };
  if (s.waitlist.some(w => phoneKey(w.phone) === phoneKey(phone) && w.treatmentId === treatmentId && w.date === date)) return { state: s, error: 'duplicate' };
  const entry = { id: uid('w'), name: nm, phone: String(phone).trim(), treatmentId, date, createdAt: now.toISOString() };
  return { state: { ...s, waitlist: [...s.waitlist, entry] }, error: '' };
}
export const removeWaitlist = (s, id) => ({ ...s, waitlist: s.waitlist.filter(w => w.id !== id) });
export const waitingFor = (s, date, treatmentId) => s.waitlist.filter(w => w.date === date && w.treatmentId === treatmentId);

export const dayAppointments = (s, date) => s.appointments.filter(a => a.date === date).sort((a, b) => a.time.localeCompare(b.time));
