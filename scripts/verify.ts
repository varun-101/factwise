// Verifies the domain logic against the live seeded DB by reproducing the
// view-model derivation (without the server-only data layer).
import { PrismaClient } from "@prisma/client";
import {
  buildDailyTimeline,
  computeNoFeverStreak,
  dateKey,
  isDischargeEligible,
} from "../src/lib/domain";
import {
  CURE_NO_FEVER_DAYS,
  FACILITY_TIMEZONE,
  FEVER_THRESHOLD_C,
} from "../src/lib/constants";

const p = new PrismaClient();
const now = new Date();
const tKey = dateKey(now, FACILITY_TIMEZONE);

async function main() {
const patients = await p.patient.findMany({
  where: { status: "ACTIVE" },
  include: {
    temperatures: { orderBy: { takenAt: "desc" } },
    visits: { orderBy: { visitedAt: "desc" } },
  },
});

let tempTakenToday = 0;
let visitedToday = 0;
let awaitingTemp = 0;
let dischargeReady = 0;
let feverToday = 0;

for (const pt of patients) {
  const timeline = buildDailyTimeline(
    pt.temperatures.map((r) => ({ takenAt: r.takenAt, valueCelsius: r.valueCelsius })),
    { startDate: pt.admittedAt, today: now, timeZone: FACILITY_TIMEZONE, threshold: FEVER_THRESHOLD_C },
  );
  const todays = pt.temperatures.filter((r) => dateKey(r.takenAt, FACILITY_TIMEZONE) === tKey);
  const visitToday = pt.visits.some((v) => dateKey(v.visitedAt, FACILITY_TIMEZONE) === tKey);
  if (todays.length > 0) tempTakenToday++;
  else if (!visitToday) awaitingTemp++;
  if (visitToday) visitedToday++;
  if (isDischargeEligible(timeline, CURE_NO_FEVER_DAYS)) dischargeReady++;
  if (timeline[timeline.length - 1]?.status === "FEVER") feverToday++;
}

console.log("FACILITY_TIMEZONE:", FACILITY_TIMEZONE, "| fever >=", FEVER_THRESHOLD_C, "C | today:", tKey);
console.log("active patients:           ", patients.length);
console.log("temp taken today (nurse ✓):", tempTakenToday);
console.log("needs temp today (nurse):  ", patients.length - tempTakenToday);
console.log("awaiting temp (doctor):    ", awaitingTemp);
console.log("visited today (doctor):    ", visitedToday);
console.log("discharge-ready (admin):   ", dischargeReady);
console.log("fever recorded today:      ", feverToday);

const [disc, dec] = await Promise.all([
  p.patient.count({ where: { status: "DISCHARGED" } }),
  p.patient.count({ where: { status: "DECEASED" } }),
]);
const resolved = disc + dec;
console.log("--- quality ---");
console.log("discharged:", disc, "| deceased:", dec, "| resolved:", resolved);
console.log("mortality:", ((dec / resolved) * 100).toFixed(1) + "%", "| success:", ((disc / resolved) * 100).toFixed(1) + "%");
}

main().finally(() => p.$disconnect());
