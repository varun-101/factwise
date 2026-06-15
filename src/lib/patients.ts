import "server-only";
import { prisma } from "./prisma";
import {
  buildDailyTimeline,
  computeMortalitySeries,
  computeNoFeverStreak,
  computeOutcomeMetrics,
  dateKey,
  isDischargeEligible,
  isMeasurementOverdue,
  windowMortality,
  type DailyTemp,
  type DayStatus,
} from "./domain";
import {
  CAPACITY,
  CURE_NO_FEVER_DAYS,
  FACILITY_TIMEZONE,
  FEVER_THRESHOLD_C,
  MEASUREMENT_CUTOFF_HOUR,
  MORTALITY_BENCHMARK,
  MORTALITY_TREND_DAYS,
  MORTALITY_TREND_WINDOW_DAYS,
} from "./constants";

export interface ReadingCorrectionView {
  id: string;
  oldCelsius: number;
  newCelsius: number;
  correctedByName: string;
  note: string | null;
  createdAt: Date;
}

export interface ReadingView {
  id: string;
  valueCelsius: number;
  takenAt: Date;
  takenByName: string;
  corrections: ReadingCorrectionView[];
}

export interface VisitView {
  id: string;
  visitedAt: Date;
  doctorName: string;
  treatmentNote: string | null;
}

export interface PatientView {
  id: string;
  name: string;
  roomNumber: number | null;
  status: "ACTIVE" | "DISCHARGED" | "DECEASED";
  admittedAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  /** Day-by-day fever timeline from admission to today. */
  timeline: DailyTemp[];
  todayStatus: DayStatus;
  noFeverStreak: number;
  dischargeEligible: boolean;
  /** Has a temperature been recorded today? Drives the nurse worklist. */
  tempTakenToday: boolean;
  /** No reading today AND past the daily cutoff hour — a missed measurement. */
  overdue: boolean;
  /** Has the doctor visited today? Drives the doctor worklist. */
  doctorVisitedToday: boolean;
  todaysReadings: ReadingView[];
  latestReading: ReadingView | null;
  todaysVisit: VisitView | null;
  /** Full reading history, newest first (used on the patient detail page). */
  allReadings: ReadingView[];
  /** Full visit history, newest first. */
  allVisits: VisitView[];
}

function todayKey(now = new Date()): string {
  return dateKey(now, FACILITY_TIMEZONE);
}

function buildPatientView(
  p: {
    id: string;
    name: string;
    roomNumber: number | null;
    status: "ACTIVE" | "DISCHARGED" | "DECEASED";
    admittedAt: Date;
    resolvedAt: Date | null;
    resolutionNote: string | null;
    temperatures: ReadingView[];
    visits: VisitView[];
  },
  now: Date,
): PatientView {
  const tKey = todayKey(now);

  const timeline = buildDailyTimeline(
    p.temperatures.map((r) => ({
      takenAt: r.takenAt,
      valueCelsius: r.valueCelsius,
    })),
    {
      startDate: p.admittedAt,
      today: now,
      timeZone: FACILITY_TIMEZONE,
      threshold: FEVER_THRESHOLD_C,
    },
  );

  const todaysReadings = p.temperatures.filter(
    (r) => dateKey(r.takenAt, FACILITY_TIMEZONE) === tKey,
  );
  const todaysVisit =
    p.visits.find((v) => dateKey(v.visitedAt, FACILITY_TIMEZONE) === tKey) ??
    null;

  // temperatures arrive ordered desc by takenAt -> first is latest.
  const latestReading = p.temperatures[0] ?? null;
  const tempTakenToday = todaysReadings.length > 0;

  return {
    id: p.id,
    name: p.name,
    roomNumber: p.roomNumber,
    status: p.status,
    admittedAt: p.admittedAt,
    resolvedAt: p.resolvedAt,
    resolutionNote: p.resolutionNote,
    timeline,
    todayStatus: timeline[timeline.length - 1]?.status ?? "UNMEASURED",
    noFeverStreak: computeNoFeverStreak(timeline),
    dischargeEligible: isDischargeEligible(timeline, CURE_NO_FEVER_DAYS),
    tempTakenToday,
    overdue: isMeasurementOverdue(
      tempTakenToday,
      now,
      FACILITY_TIMEZONE,
      MEASUREMENT_CUTOFF_HOUR,
    ),
    doctorVisitedToday: todaysVisit !== null,
    todaysReadings,
    latestReading,
    todaysVisit,
    allReadings: p.temperatures,
    allVisits: p.visits,
  };
}

/** All currently admitted patients with derived rounds/discharge status. */
export async function getActivePatients(): Promise<PatientView[]> {
  const now = new Date();
  const patients = await prisma.patient.findMany({
    where: { status: "ACTIVE" },
    orderBy: { roomNumber: "asc" },
    include: {
      temperatures: {
        orderBy: { takenAt: "desc" },
        include: { corrections: { orderBy: { createdAt: "desc" } } },
      },
      visits: { orderBy: { visitedAt: "desc" } },
    },
  });
  return patients.map((p) => buildPatientView(p, now));
}

export async function getPatient(id: string): Promise<PatientView | null> {
  const now = new Date();
  const p = await prisma.patient.findUnique({
    where: { id },
    include: {
      temperatures: {
        orderBy: { takenAt: "desc" },
        include: { corrections: { orderBy: { createdAt: "desc" } } },
      },
      visits: { orderBy: { visitedAt: "desc" } },
    },
  });
  return p ? buildPatientView(p, now) : null;
}

export async function getMetrics() {
  const [active, discharged, deceased] = await Promise.all([
    prisma.patient.count({ where: { status: "ACTIVE" } }),
    prisma.patient.count({ where: { status: "DISCHARGED" } }),
    prisma.patient.count({ where: { status: "DECEASED" } }),
  ]);
  return computeOutcomeMetrics(
    { active, discharged, deceased },
    CAPACITY,
    MORTALITY_BENCHMARK,
  );
}

/** Rolling mortality trend plus 7-day and 30-day window rates. */
export async function getMortalityTrend() {
  const now = new Date();
  const resolved = await prisma.patient.findMany({
    where: { status: { in: ["DISCHARGED", "DECEASED"] }, resolvedAt: { not: null } },
    select: { resolvedAt: true, status: true },
  });
  const records = resolved.map((r) => ({
    resolvedAt: r.resolvedAt as Date,
    deceased: r.status === "DECEASED",
  }));

  const series = computeMortalitySeries(records, {
    now,
    timeZone: FACILITY_TIMEZONE,
    days: MORTALITY_TREND_DAYS,
    windowDays: MORTALITY_TREND_WINDOW_DAYS,
  });
  const window7 = windowMortality(records, {
    now,
    timeZone: FACILITY_TIMEZONE,
    windowDays: 7,
  });
  const window30 = windowMortality(records, {
    now,
    timeZone: FACILITY_TIMEZONE,
    windowDays: 30,
  });
  return { series, window7, window30, windowDays: MORTALITY_TREND_WINDOW_DAYS };
}

/** Room numbers (1..CAPACITY) not currently occupied by an active patient. */
export async function getFreeRooms(): Promise<number[]> {
  const occupied = await prisma.patient.findMany({
    where: { status: "ACTIVE", roomNumber: { not: null } },
    select: { roomNumber: true },
  });
  const taken = new Set(occupied.map((p) => p.roomNumber));
  const free: number[] = [];
  for (let r = 1; r <= CAPACITY; r += 1) {
    if (!taken.has(r)) free.push(r);
  }
  return free;
}
