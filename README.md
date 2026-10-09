# Booking demo for a physiotherapy clinic

An appointment booking and reception schedule for a small physiotherapy clinic in Tenerife. This is a portfolio demo: the clinic, people and phone numbers are fictional.

## What it does

Patient side ("Book an appointment"):
- Choose a treatment, a physio (or the first available), a day and a time. Only times that really are free are offered.
- Book a course: the same time every week with the same physio, for up to 10 weeks. Weeks that are taken are skipped and reported.
- Join a waiting list when a day is full.
- See your own appointments and cancel up to 24 hours before.

Reception side:
- Day schedule per physio, with attended, no-show, cancel and undo.
- Limited treatment rooms: only two appointments can run at the same time, whoever is free.
- Session packs: selling a 5-session pack, and attending uses one session automatically (the initial assessment is excluded). Undo gives it back.
- No-show count per patient, flagged from two.
- Waiting list, and a note on a cancelled appointment when people are waiting for that day.

English and Spanish (EN/ES toggle), prices in EUR.

## What is simulated

- The confirmation message is only shown on screen. Nothing is sent by SMS, WhatsApp or email.
- There is no login and no server. Data lives in your browser (localStorage) and never leaves it. The two views share one browser, which is how the demo shows both sides.

## Reset or replace the sample data

- Reset: use "Reset sample data" at the bottom of the page.
- Replace: edit `src/data.js` (treatments, physios and their working hours, rooms, patients). Dates there are relative to today and always fall on weekdays, so the demo never looks stale.

## Run it locally

Needs Node.js 20.19 or later (or 22.12 or later).

```
npm install
npm run dev      # http://localhost:5173
npm test         # scheduling tests
npm run build    # static output in dist/
```

## Structure

- `src/logic.js`: scheduling rules (free slots, rooms, courses, cancellation, packs, waiting list). Pure functions, covered by `src/logic.test.js`.
- `src/App.jsx`: interface. `src/i18n.js`: EN/ES text. `src/data.js`: sample data.
