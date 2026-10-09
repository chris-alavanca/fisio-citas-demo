import test from 'node:test';
import assert from 'node:assert/strict';
import { freeSlots, book, bookCourse, cancelAppt, markAttended, markNoShow, reopen, sellPack, sessionsLeft, noShows, addWaitlist, waitingFor, removeWaitlist, addDays, weekday, isoDay, toMin, fromMin } from './logic.js';

// Fri 9 Oct 2026, 08:00 local. Mondays: 12, 19, 26 Oct.
const NOW = new Date(2026, 9, 9, 8, 0);
const MON = '2026-10-12';
const fixture = (rooms = 2) => ({
  rooms,
  treatments: [
    { id: 't1', minutes: 60, packEligible: false },
    { id: 't2', minutes: 30, packEligible: true },
  ],
  practitioners: [
    { id: 'p1', treatments: ['t1', 't2'], hours: { 1: [['09:00', '12:00']] } },
    { id: 'p2', treatments: ['t2'], hours: { 1: [['09:00', '11:00']] } },
  ],
  patients: [], appointments: [], packs: [], waitlist: [],
});
const who = { name: 'Ana Ruiz', phone: '600 111 222' };
const slots = (s, o) => freeSlots(s, { date: MON, treatmentId: 't2', now: NOW, ...o });

test('slots follow working hours and treatment length', () => {
  const s = fixture();
  const a = slots(s, { practitionerId: 'p1' });
  assert.equal(a.length, 11);
  assert.equal(a[0].time, '09:00');
  assert.equal(a[a.length - 1].time, '11:30');
  const b = slots(s, { treatmentId: 't1', practitionerId: 'p1' });
  assert.equal(b[b.length - 1].time, '11:00');
});

test('no slots on a day the practitioner does not work, or for a treatment they do not offer', () => {
  const s = fixture();
  assert.deepEqual(freeSlots(s, { date: '2026-10-13', treatmentId: 't2', now: NOW }), []);
  assert.deepEqual(slots(s, { treatmentId: 't1', practitionerId: 'p2' }), []);
  assert.deepEqual(slots(s, { treatmentId: 'nope' }), []);
});

test('lead time: nothing within two hours of now', () => {
  const s = fixture();
  const a = freeSlots(s, { date: MON, treatmentId: 't2', practitionerId: 'p1', now: new Date(2026, 9, 12, 8, 0) });
  assert.equal(a[0].time, '10:00');
});

test('a booking blocks overlapping times for that practitioner only', () => {
  let s = fixture(5);
  s = book(s, { ...who, treatmentId: 't1', practitionerId: 'p1', date: MON, time: '09:00' }, NOW).state;
  assert.equal(slots(s, { practitionerId: 'p1' })[0].time, '10:00');
  assert.equal(slots(s, { practitionerId: 'p2' })[0].time, '09:00');
});

test('treatment rooms limit how many appointments can overlap', () => {
  let s = fixture(1);
  s = book(s, { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '09:00' }, NOW).state;
  assert.equal(slots(s, { practitionerId: 'p2' })[0].time, '09:30');
  s = fixture(2);
  s = book(s, { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '09:00' }, NOW).state;
  assert.equal(slots(s, { practitionerId: 'p2' })[0].time, '09:00');
});

test('cancelling frees the slot again', () => {
  let s = fixture();
  const r = book(fixture(), { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '09:00' }, NOW);
  s = r.state;
  assert.ok(!slots(s, { practitionerId: 'p1' }).some(x => x.time === '09:00'));
  s = cancelAppt(s, r.appt.id, 'reception', NOW).state;
  assert.ok(slots(s, { practitionerId: 'p1' }).some(x => x.time === '09:00'));
});

test('booking validates name, phone and availability, and cannot double-book', () => {
  const s = fixture();
  const base = { treatmentId: 't2', practitionerId: 'p1', date: MON, time: '09:00' };
  assert.equal(book(s, { ...base, name: 'A', phone: '600111222' }, NOW).error, 'name');
  assert.equal(book(s, { ...base, name: 'Ana', phone: '123' }, NOW).error, 'phone');
  assert.equal(book(s, { ...base, ...who, time: '13:00' }, NOW).error, 'unavailable');
  const r = book(s, { ...base, ...who }, NOW);
  assert.equal(r.error, '');
  assert.equal(book(r.state, { ...base, name: 'Luis Gil', phone: '600333444' }, NOW).error, 'unavailable');
});

test('"any practitioner" assigns one, and the patient record is reused by phone digits', () => {
  let s = fixture();
  const r1 = book(s, { ...who, treatmentId: 't2', date: MON, time: '09:00' }, NOW);
  assert.ok(['p1', 'p2'].includes(r1.appt.practitionerId));
  const r2 = book(r1.state, { name: 'Ana R.', phone: '+34 600-111-222', treatmentId: 't2', date: MON, time: '10:00' }, NOW);
  assert.equal(r2.state.patients.length, 1);
  assert.equal(r2.appt.patientId, r1.appt.patientId);
});

test('course: same time and practitioner each week; taken weeks are skipped', () => {
  let s = fixture();
  s = book(s, { name: 'Luis Gil', phone: '600333444', treatmentId: 't1', practitionerId: 'p1', date: '2026-10-19', time: '09:00' }, NOW).state;
  const r = bookCourse(s, { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '09:00' }, 3, NOW);
  assert.equal(r.error, '');
  assert.deepEqual(r.booked.map(a => a.date), [MON, '2026-10-26']);
  assert.deepEqual(r.skipped, ['2026-10-19']);
  assert.equal(new Set(r.booked.map(a => a.courseId)).size, 1);
  assert.ok(r.booked[0].courseId);
});

test('course: failing first week books nothing; one week is a plain booking; weeks are capped', () => {
  const s = fixture();
  const bad = bookCourse(s, { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '13:00' }, 4, NOW);
  assert.equal(bad.error, 'unavailable');
  assert.equal(bad.state, s);
  const one = bookCourse(s, { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '09:00' }, 1, NOW);
  assert.equal(one.booked[0].courseId, null);
  const many = bookCourse(s, { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '09:00' }, 99, NOW);
  assert.equal(many.booked.length, 12);
});

test('course with no preference keeps the first practitioner', () => {
  const r = bookCourse(fixture(), { ...who, treatmentId: 't2', date: MON, time: '09:00' }, 3, NOW);
  assert.equal(new Set(r.booked.map(a => a.practitionerId)).size, 1);
});

test('patients cancel up to 24 h before; reception any time; only booked can be cancelled', () => {
  const s = fixture();
  const r = book(s, { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '10:00' }, NOW);
  const soon = new Date(2026, 9, 11, 11, 0);   // 23 h before Mon 10:00
  const early = new Date(2026, 9, 11, 9, 0);   // 25 h before
  assert.equal(cancelAppt(r.state, r.appt.id, 'patient', soon).error, 'tooLate');
  assert.equal(cancelAppt(r.state, r.appt.id, 'reception', soon).error, '');
  const ok = cancelAppt(r.state, r.appt.id, 'patient', early);
  assert.equal(ok.error, '');
  assert.equal(ok.state.appointments[0].status, 'cancelled');
  assert.equal(cancelAppt(ok.state, r.appt.id, 'patient', early).error, 'notBooked');
  assert.equal(cancelAppt(s, 'nope', 'patient', early).error, 'notBooked');
});

test('attending uses a pack session only for eligible treatments; reopen gives it back', () => {
  let s = fixture();
  const a = book(s, { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '09:00' }, NOW);
  const b = book(a.state, { ...who, treatmentId: 't1', practitionerId: 'p1', date: MON, time: '10:00' }, NOW);
  s = b.state;
  const pid = s.patients[0].id;
  s = sellPack(s, pid, 5, NOW);
  assert.equal(sessionsLeft(s, pid), 5);
  s = markAttended(s, b.appt.id);              // t1 is not pack-eligible
  assert.equal(sessionsLeft(s, pid), 5);
  s = markAttended(s, a.appt.id);              // t2 is
  assert.equal(sessionsLeft(s, pid), 4);
  assert.equal(s.appointments.find(x => x.id === a.appt.id).packId, s.packs[0].id);
  s = reopen(s, a.appt.id);
  assert.equal(sessionsLeft(s, pid), 5);
  assert.equal(s.appointments.find(x => x.id === a.appt.id).status, 'booked');
});

test('a pack never goes below zero and the next pack is used when one runs out', () => {
  let s = fixture();
  const r1 = book(s, { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '09:00' }, NOW);
  s = sellPack(r1.state, r1.state.patients[0].id, 1, NOW);
  s = sellPack(s, s.patients[0].id, 1, NOW);
  s = markAttended(s, r1.appt.id);
  assert.deepEqual(s.packs.map(p => p.used), [1, 0]);
  const r2 = book(s, { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '10:00' }, NOW);
  s = markAttended(r2.state, r2.appt.id);
  assert.deepEqual(s.packs.map(p => p.used), [1, 1]);
  const r3 = book(s, { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '11:00' }, NOW);
  s = markAttended(r3.state, r3.appt.id);
  assert.deepEqual(s.packs.map(p => p.used), [1, 1]);
});

test('no-shows are counted per patient and can only be set on booked appointments', () => {
  let s = fixture();
  const r = book(s, { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '09:00' }, NOW);
  s = markNoShow(r.state, r.appt.id);
  assert.equal(noShows(s, s.patients[0].id), 1);
  assert.equal(markNoShow(s, r.appt.id), s);
  assert.equal(markAttended(s, r.appt.id), s);
});

test('waiting list: validated, no duplicates, matched by date and treatment, removable', () => {
  const s = fixture();
  assert.equal(addWaitlist(s, { name: 'A', phone: '600111222', treatmentId: 't2', date: MON }, NOW).error, 'name');
  assert.equal(addWaitlist(s, { name: 'Ana', phone: '12', treatmentId: 't2', date: MON }, NOW).error, 'phone');
  assert.equal(addWaitlist(s, { ...who, treatmentId: 'zz', date: MON }, NOW).error, 'unavailable');
  const r = addWaitlist(s, { ...who, treatmentId: 't2', date: MON }, NOW);
  assert.equal(r.error, '');
  assert.equal(addWaitlist(r.state, { name: 'Ana', phone: '600-111-222', treatmentId: 't2', date: MON }, NOW).error, 'duplicate');
  assert.equal(waitingFor(r.state, MON, 't2').length, 1);
  assert.equal(waitingFor(r.state, MON, 't1').length, 0);
  assert.equal(waitingFor(r.state, '2026-10-13', 't2').length, 0);
  assert.equal(removeWaitlist(r.state, r.state.waitlist[0].id).waitlist.length, 0);
});

test('functions do not mutate their input', () => {
  const s = fixture();
  const snap = JSON.stringify(s);
  const r = bookCourse(s, { ...who, treatmentId: 't2', practitionerId: 'p1', date: MON, time: '09:00' }, 3, NOW);
  cancelAppt(r.state, r.booked[0].id, 'reception', NOW); markAttended(r.state, r.booked[0].id); sellPack(r.state, r.state.patients[0].id, 5, NOW);
  addWaitlist(s, { ...who, treatmentId: 't2', date: MON }, NOW);
  assert.equal(JSON.stringify(s), snap);
});

test('date and time helpers', () => {
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(weekday('2026-10-12'), 1);
  assert.equal(weekday('2026-10-11'), 0);
  assert.equal(isoDay(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(fromMin(toMin('09:45')), '09:45');
});
