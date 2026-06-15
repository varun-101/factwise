# Quarantine Care

A temperature-tracking, discharge-coordination, and treatment-quality app for a
virus quarantine & treatment centre. Built for the centre's three pain points:

1. **No one knows who's been measured / visited today** → role-based daily
   *rounds boards* that show exactly who still needs attention.
2. **Patients linger; discharges aren't communicated** → the system *auto-flags*
   anyone meeting the cure criterion into an admin discharge queue.
3. **No way to measure against the 85% benchmark** → a live *quality dashboard*
   tracking success & mortality rates with an alert when mortality exceeds 15%.

## How it maps to the centre's process

| Role | Screen | What it solves |
| --- | --- | --- |
| **Nurse** | `/nurse` | Every active patient shows a clear *temp taken today ✓ / needs reading* state. Done patients drop to the bottom → no double measurements, no misses. |
| **Doctor** | `/doctor` | Patients become **Ready for visit** only once today's temperature exists, so the doctor never arrives before the nurse. Awaiting-temperature patients are flagged, not hidden. Doctors record visit notes and (sadly, when needed) deaths. |
| **Admin** | `/admin` | A **discharge queue** auto-lists everyone who has met the 3-day no-fever rule. Discharging frees the room instantly. New admissions pick from free rooms only. |
| **Everyone** | `/dashboard` | Success rate vs 85%, mortality vs 15% (with alert), occupancy vs 74 beds, plus a **rolling mortality trend** (7-day / 30-day + chart). |

### Tier-1 enhancements

- **Missed-measurement alerting** — any patient with no reading once the daily
  cut-off (`MEASUREMENT_CUTOFF_HOUR`, default 2pm facility time) has passed is
  flagged **Overdue** and pushed to the top of the nurse board, with a count
  badge and banner. Attacks the understaffing chaos directly.
- **Mortality trend over time** — the dashboard shows a trailing-window rate
  (7-day & 30-day cards + a 30-day chart with the 15% benchmark line), so a
  *rise* in mortality is visible early rather than hidden inside a lifetime
  average.
- **Reading corrections with audit trail** — clinical staff can fix a mistyped
  temperature (e.g. 28 → 38) from the patient page. The value updates and every
  change is logged (old → new, who, when, why) in `ReadingCorrection` and shown
  inline. Corrected days are recomputed into the discharge streak automatically.

## The clinical rules (single source of truth: `src/lib/constants.ts`)

- **Fever** = temperature **≥ 38.0 °C** (100.4 °F). Configurable via `FEVER_THRESHOLD_C`.
- A **calendar day is fever-free** only if it has ≥1 reading and *none* was a fever.
  If a patient had multiple readings, the **highest** decides the day.
- **Discharge-eligible** = the **3 most recent consecutive completed days are all
  fever-free**. A fever day *or a missed measurement* breaks the streak (you can't
  certify "no fever" on a day nobody measured). The current in-progress day doesn't
  penalise a patient who already completed their streak — but a fever recorded
  *today* immediately breaks it. Window length is `CURE_NO_FEVER_DAYS` (default 3).
- **Quality**: `mortality = deaths / (discharged + deaths)`. An alert fires when it
  exceeds the 15% benchmark.

All of this lives in a pure, dependency-free module (`src/lib/domain.ts`) and is
covered by unit tests (`src/lib/domain.test.ts`) — run `npm test`.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Prisma** + **CockroachDB** (serverless Postgres). The schema's
  `datasource` provider is `cockroachdb`; to use plain Postgres
  (Neon / Vercel Postgres) instead, change it to `postgresql` and
  `prisma generate`. The app code is identical either way.
- Server Actions for all mutations; deploys to **Vercel** as-is.

Role + name are captured on entry (a cookie) so every reading/visit is attributed.
This is a lightweight identity for an internal MVP, not full authentication.

## Local setup

```bash
npm install
cp .env.example .env          # then set DATABASE_URL to a Postgres instance
npm run db:push               # create the tables
npm run db:seed               # 74 patients at full occupancy + past outcomes
npm run dev                   # http://localhost:3000
```

Any Postgres works — a free [Neon](https://neon.tech) or
[Vercel Postgres](https://vercel.com/storage/postgres) database is the quickest.

### Tests

```bash
npm test                      # unit tests for the clinical & quality logic
npx tsx scripts/verify.ts     # derives every screen's numbers from the live DB
node scripts/reset.mjs        # wipe all patient data (dev only)
```

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Add a Postgres integration (Vercel Postgres / Neon) — it sets `DATABASE_URL`.
   Optionally set `FACILITY_TIMEZONE` (a valid **IANA** name, e.g.
   `Asia/Kolkata`; **not** `IST`), `FEVER_THRESHOLD_C`, `CURE_NO_FEVER_DAYS`.
3. Deploy. The build runs `prisma generate && next build` automatically.
4. One-time, create the schema against the production DB:
   `npx prisma db push` (with the production `DATABASE_URL`), then optionally
   `npm run db:seed`.

## Configuration (env vars)

| Var | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres connection string (required) |
| `FACILITY_TIMEZONE` | `UTC` | IANA timezone used to bucket readings into days |
| `FEVER_THRESHOLD_C` | `38.0` | Fever threshold in °C |
| `CURE_NO_FEVER_DAYS` | `3` | Consecutive fever-free days required to discharge |
| `MEASUREMENT_CUTOFF_HOUR` | `14` | Facility-local hour after which a patient with no reading is "overdue" |
| `MORTALITY_TREND_WINDOW_DAYS` | `7` | Trailing window for the rolling mortality rate |
| `MORTALITY_TREND_DAYS` | `30` | Days of history spanned by the trend chart |

## What's deliberately deferred (nice-to-haves)

- Real per-user authentication & passwords.
- Editable settings UI (thresholds are env-configurable today).
- Notifications (push/email/SMS) when a patient becomes discharge-ready or
  mortality crosses the benchmark (the data/flags are already computed).
- CSV export, per-patient temperature line chart, search/sort/filter.

## Project structure

```
src/
  lib/
    domain.ts        # pure clinical & quality logic (unit-tested)
    domain.test.ts
    constants.ts     # all configurable clinical numbers
    patients.ts      # DB queries -> derived patient view models
    prisma.ts        # Prisma client singleton
    session.ts       # role + name cookie helpers
    guard.ts         # per-page role guard
  app/
    actions.ts       # server actions (record temp/visit, admit, discharge, ...)
    page.tsx         # role selection
    nurse/ doctor/ admin/ dashboard/ patients/[id]/
  components/        # AppHeader, forms (client), ui (presentational)
prisma/
  schema.prisma
  seed.ts
```
