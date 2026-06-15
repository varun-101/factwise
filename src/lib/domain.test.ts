import { describe, expect, it } from "vitest";
import {
  buildDailyTimeline,
  classifyReadings,
  computeMortalitySeries,
  computeNoFeverStreak,
  computeOutcomeMetrics,
  dateKey,
  enumerateDays,
  facilityHour,
  isDischargeEligible,
  isFever,
  isMeasurementOverdue,
  shiftDayKey,
  windowMortality,
  type DailyTemp,
} from "./domain";

const THRESHOLD = 38.0;

describe("isFever", () => {
  it("treats the threshold itself as a fever", () => {
    expect(isFever(38.0, THRESHOLD)).toBe(true);
    expect(isFever(37.9, THRESHOLD)).toBe(false);
    expect(isFever(40, THRESHOLD)).toBe(true);
  });
});

describe("classifyReadings", () => {
  it("is UNMEASURED with no readings", () => {
    expect(classifyReadings([], THRESHOLD)).toBe("UNMEASURED");
  });
  it("is NO_FEVER when all readings are below threshold", () => {
    expect(classifyReadings([36.5, 37.4, 37.9], THRESHOLD)).toBe("NO_FEVER");
  });
  it("is FEVER if ANY reading reaches the threshold", () => {
    expect(classifyReadings([36.5, 38.2, 37.0], THRESHOLD)).toBe("FEVER");
  });
});

describe("dateKey + enumerateDays", () => {
  it("formats a UTC day key", () => {
    expect(dateKey(new Date("2026-06-15T10:00:00Z"), "UTC")).toBe("2026-06-15");
  });
  it("respects timezone boundaries", () => {
    // 23:30 UTC on the 15th is already the 16th in Asia/Kolkata (+5:30).
    expect(dateKey(new Date("2026-06-15T23:30:00Z"), "Asia/Kolkata")).toBe(
      "2026-06-16",
    );
  });
  it("falls back to UTC for an invalid timezone instead of throwing", () => {
    expect(dateKey(new Date("2026-06-15T10:00:00Z"), "IST")).toBe("2026-06-15");
  });
  it("enumerates inclusive day ranges", () => {
    expect(enumerateDays("2026-06-13", "2026-06-15")).toEqual([
      "2026-06-13",
      "2026-06-14",
      "2026-06-15",
    ]);
  });
});

describe("buildDailyTimeline", () => {
  const today = new Date("2026-06-15T12:00:00Z");
  const startDate = new Date("2026-06-13T08:00:00Z");

  it("fills unmeasured gaps between admission and today", () => {
    const timeline = buildDailyTimeline(
      [{ takenAt: new Date("2026-06-13T09:00:00Z"), valueCelsius: 39.0 }],
      { startDate, today, timeZone: "UTC", threshold: THRESHOLD },
    );
    expect(timeline.map((d) => d.status)).toEqual([
      "FEVER",
      "UNMEASURED",
      "UNMEASURED",
    ]);
    expect(timeline[0].maxCelsius).toBe(39.0);
  });

  it("uses the max reading to classify a day with multiple readings", () => {
    const timeline = buildDailyTimeline(
      [
        { takenAt: new Date("2026-06-15T08:00:00Z"), valueCelsius: 37.2 },
        { takenAt: new Date("2026-06-15T20:00:00Z"), valueCelsius: 38.5 },
      ],
      { startDate: today, today, timeZone: "UTC", threshold: THRESHOLD },
    );
    expect(timeline[0].status).toBe("FEVER");
    expect(timeline[0].maxCelsius).toBe(38.5);
    expect(timeline[0].readingCount).toBe(2);
  });
});

function tl(statuses: DayStatus[]): DailyTemp[] {
  return statuses.map((status, i) => ({
    date: `2026-06-${String(10 + i).padStart(2, "0")}`,
    status,
    maxCelsius: null,
    readingCount: status === "UNMEASURED" ? 0 : 1,
  }));
}
type DayStatus = DailyTemp["status"];

describe("computeNoFeverStreak", () => {
  it("counts a trailing run of fever-free days", () => {
    expect(computeNoFeverStreak(tl(["FEVER", "NO_FEVER", "NO_FEVER", "NO_FEVER"]))).toBe(3);
  });
  it("resets on a fever day", () => {
    expect(computeNoFeverStreak(tl(["NO_FEVER", "NO_FEVER", "FEVER", "NO_FEVER"]))).toBe(1);
  });
  it("breaks the streak on a missed (unmeasured) middle day", () => {
    expect(computeNoFeverStreak(tl(["NO_FEVER", "UNMEASURED", "NO_FEVER", "NO_FEVER"]))).toBe(2);
  });
  it("ignores today-in-progress when it is still unmeasured", () => {
    // 3 fever-free days completed, today not yet measured -> still 3.
    expect(
      computeNoFeverStreak(tl(["NO_FEVER", "NO_FEVER", "NO_FEVER", "UNMEASURED"])),
    ).toBe(3);
  });
  it("does NOT ignore a fever recorded today", () => {
    expect(
      computeNoFeverStreak(tl(["NO_FEVER", "NO_FEVER", "NO_FEVER", "FEVER"])),
    ).toBe(0);
  });
  it("breaks if both today and yesterday are unmeasured", () => {
    expect(
      computeNoFeverStreak(tl(["NO_FEVER", "NO_FEVER", "UNMEASURED", "UNMEASURED"])),
    ).toBe(0);
  });
});

describe("isDischargeEligible", () => {
  it("requires the full no-fever window", () => {
    expect(isDischargeEligible(tl(["NO_FEVER", "NO_FEVER"]), 3)).toBe(false);
    expect(isDischargeEligible(tl(["NO_FEVER", "NO_FEVER", "NO_FEVER"]), 3)).toBe(true);
  });
});

describe("facilityHour", () => {
  it("returns the local hour for a timezone", () => {
    // 09:00 UTC is 14:30 in Asia/Kolkata -> hour 14.
    expect(facilityHour(new Date("2026-06-15T09:00:00Z"), "Asia/Kolkata")).toBe(14);
    expect(facilityHour(new Date("2026-06-15T09:00:00Z"), "UTC")).toBe(9);
  });
});

describe("shiftDayKey", () => {
  it("shifts across month boundaries", () => {
    expect(shiftDayKey("2026-06-01", -1)).toBe("2026-05-31");
    expect(shiftDayKey("2026-06-15", -7)).toBe("2026-06-08");
  });
});

describe("isMeasurementOverdue", () => {
  const tz = "UTC";
  it("is never overdue once temp is taken", () => {
    expect(isMeasurementOverdue(true, new Date("2026-06-15T20:00:00Z"), tz, 14)).toBe(false);
  });
  it("is not overdue before the cutoff hour", () => {
    expect(isMeasurementOverdue(false, new Date("2026-06-15T10:00:00Z"), tz, 14)).toBe(false);
  });
  it("is overdue after the cutoff hour with no reading", () => {
    expect(isMeasurementOverdue(false, new Date("2026-06-15T15:00:00Z"), tz, 14)).toBe(true);
  });
});

describe("computeMortalitySeries / windowMortality", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const records = [
    { resolvedAt: new Date("2026-06-14T10:00:00Z"), deceased: true },
    { resolvedAt: new Date("2026-06-14T11:00:00Z"), deceased: false },
    { resolvedAt: new Date("2026-06-13T10:00:00Z"), deceased: false },
    { resolvedAt: new Date("2026-06-01T10:00:00Z"), deceased: true }, // outside 7-day window
  ];

  it("computes a trailing-window rate per day", () => {
    const series = computeMortalitySeries(records, {
      now,
      timeZone: "UTC",
      days: 30,
      windowDays: 7,
    });
    expect(series).toHaveLength(30);
    const last = series[series.length - 1];
    expect(last.date).toBe("2026-06-15");
    // Trailing 7 days (Jun 9–15): 3 resolved, 1 deceased.
    expect(last.resolved).toBe(3);
    expect(last.deceased).toBe(1);
    expect(last.rate).toBeCloseTo(1 / 3);
  });

  it("returns null rate for windows with no outcomes", () => {
    const series = computeMortalitySeries([], {
      now,
      timeZone: "UTC",
      days: 5,
      windowDays: 7,
    });
    expect(series.every((p) => p.rate === null)).toBe(true);
  });

  it("windowMortality excludes outcomes outside the window", () => {
    const w7 = windowMortality(records, { now, timeZone: "UTC", windowDays: 7 });
    expect(w7.resolved).toBe(3);
    expect(w7.deceased).toBe(1);
    const w30 = windowMortality(records, { now, timeZone: "UTC", windowDays: 30 });
    expect(w30.resolved).toBe(4);
    expect(w30.deceased).toBe(2);
  });
});

describe("computeOutcomeMetrics", () => {
  it("returns null rates before any outcomes", () => {
    const m = computeOutcomeMetrics({ active: 74, discharged: 0, deceased: 0 }, 74, 0.15);
    expect(m.mortalityRate).toBeNull();
    expect(m.successRate).toBeNull();
    expect(m.freeBeds).toBe(0);
    expect(m.occupancyRate).toBe(1);
  });
  it("computes mortality and flags the alert above benchmark", () => {
    const m = computeOutcomeMetrics({ active: 50, discharged: 80, deceased: 20 }, 74, 0.15);
    expect(m.mortalityRate).toBeCloseTo(0.2);
    expect(m.successRate).toBeCloseTo(0.8);
    expect(m.mortalityAlert).toBe(true);
  });
  it("does not alert at exactly the benchmark", () => {
    const m = computeOutcomeMetrics({ active: 0, discharged: 85, deceased: 15 }, 74, 0.15);
    expect(m.mortalityRate).toBeCloseTo(0.15);
    expect(m.mortalityAlert).toBe(false);
  });
});
