import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  freeSlots, bookCourse, cancelAppt, markAttended, markNoShow, reopen, sellPack, sessionsLeft, noShows,
  addWaitlist, removeWaitlist, waitingFor, dayAppointments, addDays, isoDay, weekday, workdayOnOrAfter,
} from './logic.js';
import { seed, CLINIC } from './data.js';
import { T, tr } from './i18n.js';

const KEY = 'physio-demo-v1';

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.appointments) && Array.isArray(s.patients) && Array.isArray(s.practitioners) && Array.isArray(s.treatments) && Array.isArray(s.packs) && Array.isArray(s.waitlist)) return s;
    }
  } catch (e) { /* storage blocked or corrupt: use sample data */ }
  return seed();
}
function loadMine() {
  try { const m = JSON.parse(localStorage.getItem(KEY + '-mine') || '[]'); return Array.isArray(m) ? m : []; } catch (e) { return []; }
}
function initialLang() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'es') return q;
    const s = localStorage.getItem(KEY + '-lang');
    if (s === 'en' || s === 'es') return s;
  } catch (e) { /* ignore */ }
  return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

export default function App() {
  const [s, setS] = useState(loadState);
  const [mine, setMine] = useState(loadMine);
  const [lang, setLang] = useState(initialLang);
  const [mode, setMode] = useState('book');
  const t = T[lang];
  const now = new Date();

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }, [s]);
  useEffect(() => { try { localStorage.setItem(KEY + '-mine', JSON.stringify(mine)); } catch (e) { /* ignore */ } }, [mine]);
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem(KEY + '-lang', lang); } catch (e) { /* ignore */ }
  }, [lang]);

  const fmt = useMemo(() => {
    const loc = lang === 'es' ? 'es-ES' : 'en-GB';
    const long = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long' });
    const short = new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short' });
    const at = iso => new Date(iso + 'T12:00:00');
    return { long: iso => long.format(at(iso)), short: iso => short.format(at(iso)) };
  }, [lang]);

  const treatmentName = id => tr((s.treatments.find(x => x.id === id) || { name: id }).name, lang);
  const practitionerName = id => (s.practitioners.find(x => x.id === id) || { name: '?' }).name;
  const patientOf = id => s.patients.find(x => x.id === id) || { name: '?', phone: '' };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true"><i /><i /></span>
          <h1>{CLINIC}</h1>
        </div>
        <div className="seg" role="group" aria-label={t.language}>
          {['en', 'es'].map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
        </div>
      </header>
      <p className="demo-note">{t.demo}</p>

      <nav className="modes" aria-label="Mode">
        {['book', 'reception'].map(m => (
          <button key={m} type="button" aria-current={mode === m ? 'page' : undefined} onClick={() => setMode(m)}>{t.modes[m]}</button>
        ))}
      </nav>

      <main>
        {mode === 'book' ? (
          <Book s={s} setS={setS} mine={mine} setMine={setMine} t={t} lang={lang} now={now} fmt={fmt}
            treatmentName={treatmentName} practitionerName={practitionerName} />
        ) : (
          <Reception s={s} setS={setS} t={t} lang={lang} now={now} fmt={fmt}
            treatmentName={treatmentName} practitionerName={practitionerName} patientOf={patientOf} />
        )}
      </main>

      <footer className="foot">
        <button type="button" className="link" onClick={() => { if (window.confirm(t.resetConfirm)) { setS(seed()); setMine([]); } }}>{t.reset}</button>
      </footer>
    </div>
  );
}

function Book({ s, setS, mine, setMine, t, lang, now, fmt, treatmentName, practitionerName }) {
  const [tid, setTid] = useState('');
  const [pid, setPid] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [weeks, setWeeks] = useState(1);
  const [msg, setMsg] = useState(null); // { kind: 'ok' | 'error', text, extra }
  const msgRef = useRef(null);

  const treatment = s.treatments.find(x => x.id === tid);
  const pracs = s.practitioners.filter(p => p.treatments.includes(tid));
  const today = isoDay(now);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const slotsFor = d => freeSlots(s, { date: d, treatmentId: tid, practitionerId: pid || null, now });
  const worksOn = d => pracs.some(p => (!pid || p.id === pid) && (p.hours[weekday(d)] || []).length > 0);
  const dayCounts = tid ? days.map(d => [d, new Set(slotsFor(d).map(x => x.time)).size, worksOn(d)]) : [];
  const times = date && tid ? [...new Set(slotsFor(date).map(x => x.time))] : [];

  const pick = setter => v => { setter(v); setMsg(null); };
  const chooseTreatment = id => { setTid(id); setPid(''); setDate(''); setTime(''); setMsg(null); };
  const choosePractitioner = id => { setPid(id); setDate(''); setTime(''); setMsg(null); };
  const chooseDate = d => { setDate(d); setTime(''); setMsg(null); };

  const submit = () => {
    const r = bookCourse(s, { name, phone, treatmentId: tid, practitionerId: pid || null, date, time }, weeks, now);
    if (r.error) { setMsg({ kind: 'error', text: t.errors[r.error] }); return; }
    setS(r.state);
    setMine(m => [...m, ...r.booked.map(a => a.id)]);
    const first = r.booked[0];
    const text = r.booked.length > 1
      ? t.confirmMsgCourse(name.trim(), treatmentName(tid), practitionerName(first.practitionerId), r.booked.length, fmt.long(first.date), first.time)
      : t.confirmMsg(name.trim(), treatmentName(tid), practitionerName(first.practitionerId), fmt.long(first.date), first.time);
    setMsg({ kind: 'ok', text, extra: r.skipped.length ? t.skipped(r.skipped.map(fmt.short).join(', ')) : '' });
    setTime(''); setWeeks(1);
    setTimeout(() => msgRef.current && msgRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };

  const join = () => {
    const r = addWaitlist(s, { name, phone, treatmentId: tid, date }, now);
    if (r.error) { setMsg({ kind: 'error', text: t.errors[r.error] }); return; }
    setS(r.state);
    setMsg({ kind: 'ok', text: t.waitDone, extra: '' });
  };

  const cancelMine = id => {
    const r = cancelAppt(s, id, 'patient', now);
    if (r.error) { setMsg({ kind: 'error', text: t.errors[r.error] }); return; }
    setS(r.state);
    setMsg(null);
  };

  const myAppts = s.appointments.filter(a => mine.includes(a.id)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const dayFull = date && tid && times.length === 0;
  const canBook = tid && date && time && name.trim() && phone.trim();

  return (
    <div className="book">
      <section className="card">
        <h2>{t.step1}</h2>
        <div className="choices">
          {s.treatments.map(x => (
            <button key={x.id} type="button" className="choice" aria-pressed={tid === x.id} onClick={() => chooseTreatment(x.id)}>
              <strong>{tr(x.name, lang)}</strong>
              <span>{t.minutes(x.minutes)} · {t.price(x.price)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>{t.step2}</h2>
        {!tid ? <p className="muted">{t.pickTreatment}</p> : (
          <div className="choices tight">
            <button type="button" className="choice" aria-pressed={pid === ''} onClick={() => choosePractitioner('')}><strong>{t.anyone}</strong></button>
            {pracs.map(p => (
              <button key={p.id} type="button" className="choice" aria-pressed={pid === p.id} onClick={() => choosePractitioner(p.id)}><strong>{p.name}</strong></button>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>{t.step3}</h2>
        {!tid ? <p className="muted">{t.pickTreatment}</p> : (
          <div className="days">
            {dayCounts.map(([d, n, open]) => (
              <button key={d} type="button" className="day" disabled={!open} aria-pressed={date === d} onClick={() => chooseDate(d)}>
                <strong>{fmt.short(d)}</strong>
                <span className={n === 0 ? 'none' : ''}>{!open ? t.closedDay : n === 0 ? t.noTimes : t.free(n)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>{t.step4}</h2>
        {!date ? <p className="muted">{tid ? t.pickDay : t.pickTreatment}</p> : dayFull ? (
          <div className="waitbox">
            <strong>{t.waitTitle}</strong>
            <p>{t.waitText}</p>
            <button type="button" className="primary" onClick={join}>{t.waitJoin}</button>
          </div>
        ) : (
          <div className="times">
            {times.map(x => <button key={x} type="button" className="time" aria-pressed={time === x} onClick={() => pick(setTime)(x)}>{x}</button>)}
          </div>
        )}
      </section>

      <section className="card">
        <h2>{t.step5}</h2>
        <div className="fields">
          <label className="field"><span>{t.name}</span><input value={name} onChange={e => pick(setName)(e.target.value)} maxLength={80} autoComplete="name" /></label>
          <label className="field"><span>{t.phone}</span><input value={phone} onChange={e => pick(setPhone)(e.target.value)} maxLength={20} inputMode="tel" autoComplete="tel" /></label>
          <label className="field">
            <span>{t.courseLabel}</span>
            <select value={weeks} onChange={e => setWeeks(Number(e.target.value))}>
              <option value={1}>{t.courseOne}</option>
              {[2, 3, 4, 5, 6, 8, 10].map(w => <option key={w} value={w}>{t.courseMany(w)}</option>)}
            </select>
          </label>
        </div>
        {weeks > 1 && <p className="muted small">{t.courseHelp}</p>}
        <button type="button" className="primary wide" disabled={!canBook} onClick={submit}>{t.confirm}</button>
        <div ref={msgRef} aria-live="polite">
          {msg && msg.kind === 'error' && <p className="alert error" role="alert">{msg.text}</p>}
          {msg && msg.kind === 'ok' && (
            <div className="alert ok">
              <strong>{t.messageTitle}</strong>
              <p>{msg.text}</p>
              {msg.extra && <p className="muted">{msg.extra}</p>}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <h2>{t.mine}</h2>
        {myAppts.length === 0 ? <p className="muted">{t.mineEmpty}</p> : (
          <ul className="list">
            {myAppts.map(a => (
              <li key={a.id} className={'st-' + a.status}>
                <div>
                  <strong>{fmt.short(a.date)} · {a.time}</strong>
                  <span>{treatmentName(a.treatmentId)} · {practitionerName(a.practitionerId)}</span>
                </div>
                <div className="right">
                  <span className={'badge st-' + a.status}>{t.status[a.status]}</span>
                  {a.status === 'booked' && <button type="button" onClick={() => cancelMine(a.id)}>{t.cancel}</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">{t.cancelHelp}</p>
      </section>
    </div>
  );
}

function Reception({ s, setS, t, lang, now, fmt, treatmentName, practitionerName, patientOf }) {
  const [day, setDay] = useState(() => workdayOnOrAfter(isoDay(now)));
  const appts = dayAppointments(s, day);
  const live = appts.filter(a => a.status !== 'cancelled');
  const waitingTotal = s.waitlist.length;
  const todayIso = isoDay(now);

  return (
    <div className="reception">
      <div className="daybar">
        <button type="button" onClick={() => setDay(d => addDays(d, -1))} aria-label={t.prev}>‹</button>
        <strong className="daylabel">{fmt.long(day)}</strong>
        <button type="button" onClick={() => setDay(d => addDays(d, 1))} aria-label={t.next}>›</button>
        <button type="button" onClick={() => setDay(todayIso)}>{t.today}</button>
        <label className="datepick"><span className="sr">{t.date}</span><input type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} /></label>
      </div>

      <section className="figures" aria-label="Summary">
        <div className="fig"><span>{t.figAppts}</span><strong>{live.length}</strong></div>
        <div className="fig"><span>{t.figAttended}</span><strong>{appts.filter(a => a.status === 'attended').length}</strong></div>
        <div className="fig"><span>{t.figNoShow}</span><strong>{appts.filter(a => a.status === 'no-show').length}</strong></div>
        <div className="fig"><span>{t.figWaiting}</span><strong>{waitingTotal}</strong></div>
      </section>
      <p className="muted small">{t.rooms(s.rooms)}</p>

      <div className="columns">
        {s.practitioners.map(p => {
          const works = (p.hours[weekday(day)] || []);
          const list = appts.filter(a => a.practitionerId === p.id);
          return (
            <section key={p.id} className="col">
              <header>
                <h2>{p.name}</h2>
                <span className="muted small">{works.length ? works.map(([f, to]) => `${f}–${to}`).join(' · ') : t.closed}</span>
              </header>
              {list.length === 0 && <p className="muted small">{works.length ? t.empty : ''}</p>}
              {list.map(a => {
                const pat = patientOf(a.patientId);
                const flags = noShows(s, a.patientId);
                const waiting = a.status === 'cancelled' ? waitingFor(s, a.date, a.treatmentId).length : 0;
                return (
                  <article key={a.id} className={'appt st-' + a.status}>
                    <div className="line">
                      <strong>{a.time}</strong>
                      <span className={'badge st-' + a.status}>{t.status[a.status]}</span>
                    </div>
                    <div>{pat.name}{flags >= 2 && <span className="flag">{t.noShowFlag(flags)}</span>}</div>
                    <div className="muted small">{treatmentName(a.treatmentId)} · {pat.phone}</div>
                    <div className="tags">
                      {a.courseId && <span className="tag">{t.course}</span>}
                      {a.packId && <span className="tag">{t.pack}</span>}
                      {waiting > 0 && <span className="tag warn">{t.waitingFor(waiting)}</span>}
                    </div>
                    {a.status === 'booked' && (
                      <div className="acts">
                        <button type="button" className="primary" onClick={() => setS(x => markAttended(x, a.id))}>{t.attended}</button>
                        <button type="button" onClick={() => setS(x => markNoShow(x, a.id))}>{t.noShow}</button>
                        <button type="button" onClick={() => setS(x => cancelAppt(x, a.id, 'reception', now).state)}>{t.cancelAppt}</button>
                      </div>
                    )}
                    {(a.status === 'attended' || a.status === 'no-show') && (
                      <div className="acts"><button type="button" onClick={() => setS(x => reopen(x, a.id))}>{t.reopen}</button></div>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>

      <div className="panels">
        <section className="card">
          <h2>{t.waitList}</h2>
          {s.waitlist.length === 0 ? <p className="muted">{t.waitEmpty}</p> : (
            <ul className="list">
              {s.waitlist.map(w => (
                <li key={w.id}>
                  <div><strong>{w.name}</strong><span>{treatmentName(w.treatmentId)} · {fmt.short(w.date)} · {w.phone}</span></div>
                  <button type="button" onClick={() => setS(x => removeWaitlist(x, w.id))}>{t.remove}</button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>{t.patients}</h2>
          <ul className="list">
            {s.patients.map(p => {
              const left = sessionsLeft(s, p.id);
              const ns = noShows(s, p.id);
              return (
                <li key={p.id}>
                  <div>
                    <strong>{p.name}{ns >= 2 && <span className="flag">{t.noShowFlag(ns)}</span>}</strong>
                    <span>{p.phone} · {left > 0 ? t.sessionsLeft(left) : t.noPack}</span>
                  </div>
                  <button type="button" onClick={() => setS(x => sellPack(x, p.id))}>{t.sellPack}</button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
