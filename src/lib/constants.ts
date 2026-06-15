// Centre-wide configuration. All clinically meaningful numbers live here so
// they can be tuned without hunting through the codebase. Threshold and cure
// window are overridable via env without a redeploy of logic.

/** Total rooms / maximum simultaneous patients. */
export const CAPACITY = 74;

/** A reading at or above this (°C) counts as a fever. 38.0°C == 100.4°F. */
export const FEVER_THRESHOLD_C = numberEnv("FEVER_THRESHOLD_C", 38.0);

/** Consecutive fever-free days required before a patient may be discharged. */
export const CURE_NO_FEVER_DAYS = intEnv("CURE_NO_FEVER_DAYS", 3);

/** Expected mortality. The centre wants to be alerted if it rises above this. */
export const MORTALITY_BENCHMARK = 0.15;

/** Target success rate (1 - mortality benchmark). */
export const SUCCESS_BENCHMARK = 1 - MORTALITY_BENCHMARK;

/** IANA timezone used to group readings into facility-local calendar days. */
export const FACILITY_TIMEZONE = process.env.FACILITY_TIMEZONE || "UTC";

/**
 * Hour (facility-local, 0–23) by which every patient should have a reading.
 * After this hour, any patient without a reading today is flagged "overdue".
 */
export const MEASUREMENT_CUTOFF_HOUR = intEnv("MEASUREMENT_CUTOFF_HOUR", 14);

/** Trailing window (days) for the rolling mortality rate shown as the trend. */
export const MORTALITY_TREND_WINDOW_DAYS = intEnv(
  "MORTALITY_TREND_WINDOW_DAYS",
  7,
);

/** How many days of history the mortality trend chart spans. */
export const MORTALITY_TREND_DAYS = intEnv("MORTALITY_TREND_DAYS", 30);

function numberEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function intEnv(key: string, fallback: number): number {
  const n = numberEnv(key, fallback);
  return Math.max(1, Math.round(n));
}
