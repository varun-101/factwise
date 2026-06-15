// Pure clinical & quality logic. NO database or framework imports here so it
// can be unit-tested in isolation (see domain.test.ts). This is the riskiest
// part of the app, so it is small, explicit, and fully covered by tests.

export type DayStatus =
  | "FEVER" // at least one reading that day was at/above the threshold
  | "NO_FEVER" // measured that day, and every reading was below threshold
  | "UNMEASURED"; // no temperature recorded that day

export interface DailyTemp {
  /** Facility-local calendar day, e.g. "2026-06-15". */
  date: string;
  status: DayStatus;
  /** Highest reading of the day (°C), or null if unmeasured. */
  maxCelsius: number | null;
  readingCount: number;
}

export interface ReadingInput {
  takenAt: Date;
  valueCelsius: number;
}

// ---------------------------------------------------------------------------
// Fever classification
// ---------------------------------------------------------------------------

export function isFever(celsius: number, threshold: number): boolean {
  return celsius >= threshold;
}

/**
 * Classify a single day's readings. A day with multiple readings is a FEVER
 * day if ANY reading reached the threshold — a patient who spiked a fever at
 * any point that day did not have a fever-free day.
 */
export function classifyReadings(
  readings: number[],
  threshold: number,
): DayStatus {
  if (readings.length === 0) return "UNMEASURED";
  return readings.some((r) => isFever(r, threshold)) ? "FEVER" : "NO_FEVER";
}

// ---------------------------------------------------------------------------
// Timezone-aware calendar-day bucketing
// ---------------------------------------------------------------------------

/**
 * Facility-local calendar-day key (YYYY-MM-DD). Falls back to UTC if the
 * timezone is not a valid IANA name, so an unset/misconfigured env never
 * crashes the app.
 */
export function dateKey(date: Date, timeZone: string): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

/** Facility-local hour (0–23) of the given instant. UTC fallback if invalid. */
export function facilityHour(date: Date, timeZone: string): number {
  try {
    const s = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date);
    return Number(s);
  } catch {
    return date.getUTCHours();
  }
}

/** Shift a YYYY-MM-DD day key by `deltaDays` (may be negative). */
export function shiftDayKey(key: string, deltaDays: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of day keys from startKey..endKey (calendar days). */
export function enumerateDays(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  let d = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);
  // Guard against a start after end (e.g. clock skew) -> single day.
  if (d > end) return [endKey];
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Build a continuous day-by-day timeline from `startDate` (admission) through
 * `today`, inclusive. Days with no reading appear as UNMEASURED gaps so the
 * streak logic can treat a missed measurement as a break.
 */
export function buildDailyTimeline(
  readings: ReadingInput[],
  opts: { startDate: Date; today: Date; timeZone: string; threshold: number },
): DailyTemp[] {
  const { startDate, today, timeZone, threshold } = opts;

  const byDay = new Map<string, number[]>();
  for (const r of readings) {
    const key = dateKey(r.takenAt, timeZone);
    const arr = byDay.get(key);
    if (arr) arr.push(r.valueCelsius);
    else byDay.set(key, [r.valueCelsius]);
  }

  const startKey = dateKey(startDate, timeZone);
  const todayKey = dateKey(today, timeZone);

  return enumerateDays(startKey, todayKey).map((date) => {
    const values = byDay.get(date) ?? [];
    return {
      date,
      status: classifyReadings(values, threshold),
      maxCelsius: values.length ? Math.max(...values) : null,
      readingCount: values.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Cure / discharge eligibility
// ---------------------------------------------------------------------------

/**
 * Length of the current run of consecutive fever-free days ending at the most
 * recent completed day.
 *
 * - A FEVER day or an UNMEASURED gap breaks the run.
 * - The current in-progress day (the trailing entry) is ignored while still
 *   UNMEASURED, so a patient who completed their fever-free days yesterday
 *   isn't shown as "reset" simply because today's temp hasn't been taken yet.
 *   A fever recorded today, however, DOES break the run.
 */
export function computeNoFeverStreak(
  timeline: DailyTemp[],
  ignoreTrailingUnmeasured = true,
): number {
  let i = timeline.length - 1;
  if (ignoreTrailingUnmeasured && i >= 0 && timeline[i].status === "UNMEASURED") {
    i -= 1; // skip today-in-progress
  }
  let streak = 0;
  for (; i >= 0; i -= 1) {
    if (timeline[i].status === "NO_FEVER") streak += 1;
    else break;
  }
  return streak;
}

export function isDischargeEligible(
  timeline: DailyTemp[],
  requiredDays: number,
): boolean {
  return computeNoFeverStreak(timeline) >= requiredDays;
}

// ---------------------------------------------------------------------------
// Missed-measurement detection
// ---------------------------------------------------------------------------

/**
 * A patient is "overdue" if no temperature has been recorded today AND the
 * facility-local time is at/after the daily cutoff hour. Before the cutoff a
 * patient simply still "needs" a reading; after it, it is a missed measurement.
 */
export function isMeasurementOverdue(
  tempTakenToday: boolean,
  now: Date,
  timeZone: string,
  cutoffHour: number,
): boolean {
  if (tempTakenToday) return false;
  return facilityHour(now, timeZone) >= cutoffHour;
}

// ---------------------------------------------------------------------------
// Mortality trend over time
// ---------------------------------------------------------------------------

export interface OutcomeRecord {
  resolvedAt: Date;
  deceased: boolean;
}

export interface MortalityPoint {
  /** End day of the trailing window (YYYY-MM-DD). */
  date: string;
  /** Outcomes resolved within the trailing window ending on `date`. */
  resolved: number;
  deceased: number;
  /** deceased / resolved within the window, or null if no outcomes. */
  rate: number | null;
}

/**
 * Rolling mortality over the last `days`, each point being the trailing
 * `windowDays`-day rate. This is what reveals a *rise* in mortality (a single
 * lifetime number cannot), which is the centre's stated goal.
 */
export function computeMortalitySeries(
  records: OutcomeRecord[],
  opts: { now: Date; timeZone: string; days: number; windowDays: number },
): MortalityPoint[] {
  const { now, timeZone, days, windowDays } = opts;

  const buckets = new Map<string, { resolved: number; deceased: number }>();
  for (const r of records) {
    const key = dateKey(r.resolvedAt, timeZone);
    const b = buckets.get(key) ?? { resolved: 0, deceased: 0 };
    b.resolved += 1;
    if (r.deceased) b.deceased += 1;
    buckets.set(key, b);
  }

  const todayKey = dateKey(now, timeZone);
  const firstKey = shiftDayKey(todayKey, -(days - 1));

  return enumerateDays(firstKey, todayKey).map((date) => {
    const windowStart = shiftDayKey(date, -(windowDays - 1));
    let resolved = 0;
    let deceased = 0;
    for (const key of enumerateDays(windowStart, date)) {
      const b = buckets.get(key);
      if (b) {
        resolved += b.resolved;
        deceased += b.deceased;
      }
    }
    return {
      date,
      resolved,
      deceased,
      rate: resolved > 0 ? deceased / resolved : null,
    };
  });
}

/** Window mortality across the last `windowDays` (e.g. 7-day, 30-day). */
export function windowMortality(
  records: OutcomeRecord[],
  opts: { now: Date; timeZone: string; windowDays: number },
): { resolved: number; deceased: number; rate: number | null } {
  const { now, timeZone, windowDays } = opts;
  const todayKey = dateKey(now, timeZone);
  const startKey = shiftDayKey(todayKey, -(windowDays - 1));
  let resolved = 0;
  let deceased = 0;
  for (const r of records) {
    const key = dateKey(r.resolvedAt, timeZone);
    if (key >= startKey && key <= todayKey) {
      resolved += 1;
      if (r.deceased) deceased += 1;
    }
  }
  return { resolved, deceased, rate: resolved > 0 ? deceased / resolved : null };
}

// ---------------------------------------------------------------------------
// Outcome / quality metrics
// ---------------------------------------------------------------------------

export interface OutcomeCounts {
  active: number;
  discharged: number;
  deceased: number;
}

export interface OutcomeMetrics {
  active: number;
  discharged: number;
  deceased: number;
  /** Patients whose stay has concluded (discharged + deceased). */
  resolved: number;
  /** deceased / resolved, or null when no outcomes yet. */
  mortalityRate: number | null;
  /** discharged / resolved, or null when no outcomes yet. */
  successRate: number | null;
  occupancyRate: number;
  freeBeds: number;
  capacity: number;
  /** True once mortality exceeds the benchmark — drives the centre alert. */
  mortalityAlert: boolean;
}

export function computeOutcomeMetrics(
  counts: OutcomeCounts,
  capacity: number,
  mortalityBenchmark: number,
): OutcomeMetrics {
  const { active, discharged, deceased } = counts;
  const resolved = discharged + deceased;
  const mortalityRate = resolved > 0 ? deceased / resolved : null;
  const successRate = resolved > 0 ? discharged / resolved : null;
  return {
    active,
    discharged,
    deceased,
    resolved,
    mortalityRate,
    successRate,
    occupancyRate: capacity > 0 ? active / capacity : 0,
    freeBeds: Math.max(0, capacity - active),
    capacity,
    mortalityAlert: mortalityRate !== null && mortalityRate > mortalityBenchmark,
  };
}

// ---------------------------------------------------------------------------
// Unit conversion (display helpers)
// ---------------------------------------------------------------------------

export function cToF(celsius: number): number {
  return celsius * (9 / 5) + 32;
}

export function fToC(fahrenheit: number): number {
  return (fahrenheit - 32) * (5 / 9);
}
