import { isoDay, startOf, weekday, nextWorkday, prevWorkday, workdayOnOrAfter } from './logic.js';

// Fictional clinic, fictional people, fake phone numbers. Every date is relative to today so the demo never looks stale.
export const CLINIC = 'Fisioterapia Ensenada';

export function seed(now = new Date()) {
  const today = isoDay(now);
  // Every sample day is its own Monday-to-Friday day, whatever day the visitor opens the demo on.
  const d0 = workdayOnOrAfter(today), d1 = nextWorkday(d0), d2 = nextWorkday(d1);
  const h1 = prevWorkday(today), h2 = prevWorkday(h1), h3 = prevWorkday(h2);
  const wd = n => ({ 0: d0, 1: d1, 2: d2, [-1]: h1, [-2]: h2, [-3]: h3 })[n];
  const treatments = [
    { id: 'val', minutes: 60, price: 50, packEligible: false, name: { en: 'Initial assessment', es: 'Valoración inicial' } },
    { id: 'man', minutes: 45, price: 45, packEligible: true, name: { en: 'Manual physiotherapy', es: 'Fisioterapia manual' } },
    { id: 'dep', minutes: 30, price: 35, packEligible: true, name: { en: 'Sports massage', es: 'Masaje deportivo' } },
    { id: 'pun', minutes: 45, price: 50, packEligible: true, name: { en: 'Dry needling', es: 'Punción seca' } },
    { id: 'rea', minutes: 60, price: 55, packEligible: true, name: { en: 'Injury rehabilitation', es: 'Readaptación tras lesión' } },
  ];
  const practitioners = [
    { id: 'pr1', name: 'Alba Rivero', treatments: ['val', 'man', 'pun', 'rea'],
      hours: { 1: [['09:00', '13:00'], ['16:00', '20:00']], 2: [['09:00', '13:00'], ['16:00', '20:00']], 3: [['09:00', '13:00'], ['16:00', '20:00']], 4: [['09:00', '13:00'], ['16:00', '20:00']], 5: [['09:00', '13:00'], ['16:00', '20:00']] } },
    { id: 'pr2', name: 'Iván Santana', treatments: ['val', 'man', 'dep', 'rea'],
      hours: { 1: [['10:00', '14:00']], 2: [['10:00', '14:00']], 3: [['10:00', '14:00']], 4: [['10:00', '14:00']], 5: [['10:00', '14:00']], 6: [['09:00', '13:00']] } },
    { id: 'pr3', name: 'Nerea Castro', treatments: ['man', 'dep', 'pun'],
      hours: { 1: [['16:00', '20:00']], 2: [['09:00', '14:00']], 3: [['16:00', '20:00']], 4: [['09:00', '14:00']], 5: [['16:00', '20:00']] } },
  ];
  const patients = [
    { id: 'pa1', name: 'Carmen Vega', phone: '600 000 201' },
    { id: 'pa2', name: 'Raúl Ortega', phone: '600 000 202' },
    { id: 'pa3', name: 'Lucía Marrero', phone: '600 000 203' },
    { id: 'pa4', name: 'Jorge Plasencia', phone: '600 000 204' },
    { id: 'pa5', name: 'Sofía Benítez', phone: '600 000 205' },
    { id: 'pa6', name: 'Daniel Hernández', phone: '600 000 206' },
    { id: 'pa7', name: 'Marina Cruz', phone: '600 000 207' },
    { id: 'pa8', name: 'Pablo Afonso', phone: '600 000 208' },
  ];
  // Nerea's days differ, so give her a time that exists on the day in question.
  const nerea = date => (weekday(date) % 2 === 0 ? '10:00' : '17:00');
  let n = 0;
  const mk = (off, time, practitionerId, treatmentId, patientId, status) => {
    const date = wd(off);
    const auto = startOf(date, time) < now ? 'attended' : 'booked';
    return { id: 'sa' + ++n, patientId, treatmentId, practitionerId, date, time, status: status || auto, courseId: null, packId: '', createdAt: now.toISOString() };
  };
  const appointments = [
    // today
    mk(0, '10:00', 'pr1', 'val', 'pa1'),
    mk(0, '10:00', 'pr2', 'dep', 'pa2'),
    mk(0, '11:15', 'pr1', 'man', 'pa3'),
    mk(0, '11:00', 'pr2', 'man', 'pa5'),
    mk(0, '12:30', 'pr2', 'rea', 'pa6'),
    mk(0, '17:00', 'pr1', 'rea', 'pa4'),
    // coming days
    mk(1, '09:30', 'pr1', 'man', 'pa1'),
    mk(1, '10:30', 'pr2', 'val', 'pa7'),
    mk(1, nerea(wd(1)), 'pr3', 'pun', 'pa8'),
    mk(2, '16:00', 'pr1', 'pun', 'pa3'),
    mk(2, '12:00', 'pr2', 'dep', 'pa2'),
    // history
    mk(-1, '10:00', 'pr1', 'man', 'pa1', 'attended'),
    mk(-1, '11:00', 'pr2', 'dep', 'pa2', 'no-show'),
    mk(-3, '12:00', 'pr2', 'dep', 'pa2', 'no-show'),
    mk(-2, '17:00', 'pr1', 'rea', 'pa4', 'attended'),
  ];
  return {
    rooms: 2,
    treatments, practitioners, patients, appointments,
    packs: [
      { id: 'sk1', patientId: 'pa1', sessions: 5, used: 2, boughtAt: now.toISOString() },
      { id: 'sk2', patientId: 'pa4', sessions: 5, used: 4, boughtAt: now.toISOString() },
    ],
    waitlist: [
      { id: 'sw1', name: 'Marina Cruz', phone: '600 000 207', treatmentId: 'man', date: wd(1), createdAt: now.toISOString() },
    ],
  };
}
