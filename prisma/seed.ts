// Seed the centre at full occupancy (74 patients) with realistic, varied
// histories, plus past outcomes so the quality dashboard has data.
// Run with: npm run db:seed  (after `npm run db:push`).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NURSES = ["Nurse Rivera", "Nurse Adeyemi", "Nurse Chen", "Nurse Patel"];
const DOCTORS = ["Dr. Okafor", "Dr. Singh", "Dr. Müller"];

const now = new Date();
function dayAt(offsetDaysAgo: number, hourUtc = 10): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - offsetDaysAgo);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}
let pickI = 0;
function pick<T>(arr: T[]): T {
  return arr[pickI++ % arr.length];
}

interface DayTemps {
  offset: number; // days ago (0 = today)
  temps: number[];
}

interface PatientSpec {
  name: string;
  room: number | null;
  admitOffset: number;
  days: DayTemps[];
  visitToday?: boolean | string;
  status?: "ACTIVE" | "DISCHARGED" | "DECEASED";
  resolvedOffset?: number;
  resolutionNote?: string;
}

async function makePatient(spec: PatientSpec) {
  const status = spec.status ?? "ACTIVE";
  const patient = await prisma.patient.create({
    data: {
      name: spec.name,
      roomNumber: status === "ACTIVE" ? spec.room : null,
      status,
      admittedAt: dayAt(spec.admitOffset, 8),
      resolvedAt:
        spec.resolvedOffset != null ? dayAt(spec.resolvedOffset, 16) : null,
      resolutionNote: spec.resolutionNote ?? null,
    },
  });

  const readings = spec.days.flatMap((d, di) =>
    d.temps.map((t, ti) => ({
      patientId: patient.id,
      valueCelsius: t,
      takenAt: dayAt(d.offset, 9 + ti), // space multiple readings within a day
      takenByName: pick(NURSES),
    })),
  );
  if (readings.length) await prisma.temperatureReading.createMany({ data: readings });

  if (spec.visitToday) {
    await prisma.doctorVisit.create({
      data: {
        patientId: patient.id,
        doctorName: pick(DOCTORS),
        visitedAt: dayAt(0, 14),
        treatmentNote:
          typeof spec.visitToday === "string" ? spec.visitToday : null,
      },
    });
  }
}

// Small helpers to make temperature stories readable.
const ok = () => 36.6 + Math.random() * 1.1; // 36.6 - 37.7 (no fever)
const fever = () => 38.2 + Math.random() * 1.6; // 38.2 - 39.8
const r1 = (n: number) => Math.round(n * 10) / 10;

async function main() {
  console.log("Clearing existing data…");
  await prisma.readingCorrection.deleteMany();
  await prisma.doctorVisit.deleteMany();
  await prisma.temperatureReading.deleteMany();
  await prisma.patient.deleteMany();

  const firstNames = [
    "Amir", "Bea", "Caleb", "Dia", "Esi", "Farah", "Gota", "Hana", "Ivo",
    "Juno", "Kemi", "Lena", "Mati", "Nia", "Omar", "Priya", "Quinn", "Rui",
    "Sana", "Tomas", "Uma", "Vik", "Wen", "Xan", "Yara", "Zane",
  ];
  const lastNames = [
    "Abara", "Bello", "Costa", "Diallo", "Eze", "Fofana", "Gupta", "Haddad",
    "Ito", "Jensen", "Kone", "Lim", "Mensah", "Ndiaye", "Owusu", "Park",
  ];
  let nameI = 0;
  const nextName = () =>
    `${firstNames[nameI % firstNames.length]} ${
      lastNames[Math.floor(nameI++ / firstNames.length) % lastNames.length]
    }`;

  let room = 1;

  // --- Group A: discharge-ready (3 completed fever-free days) ---------------
  for (let i = 0; i < 10; i++) {
    const measuredToday = i % 2 === 0; // half measured today, half not (nurse queue)
    await makePatient({
      name: nextName(),
      room: room++,
      admitOffset: 8,
      days: [
        { offset: 6, temps: [r1(fever())] },
        { offset: 5, temps: [r1(fever())] },
        { offset: 4, temps: [r1(38.0 + Math.random())] },
        { offset: 3, temps: [r1(ok())] },
        { offset: 2, temps: [r1(ok())] },
        { offset: 1, temps: [r1(ok())] },
        ...(measuredToday ? [{ offset: 0, temps: [r1(ok())] }] : []),
      ],
      visitToday: measuredToday && i % 4 === 0 ? "Recovering well, candidate for discharge." : undefined,
    });
  }

  // --- Group B: recovering (1-2 fever-free days) ---------------------------
  for (let i = 0; i < 18; i++) {
    const measuredToday = i % 3 !== 0;
    const noFeverDays = (i % 2) + 1; // 1 or 2
    const days: DayTemps[] = [
      { offset: 5, temps: [r1(fever())] },
      { offset: 4, temps: [r1(fever())] },
      { offset: 3, temps: [r1(fever())] },
    ];
    for (let d = noFeverDays; d >= 1; d--) days.push({ offset: d, temps: [r1(ok())] });
    if (measuredToday) days.push({ offset: 0, temps: [r1(ok())] });
    await makePatient({
      name: nextName(),
      room: room++,
      admitOffset: 7,
      days,
      visitToday: measuredToday && i % 2 === 0,
    });
  }

  // --- Group C: febrile (ongoing fever) ------------------------------------
  for (let i = 0; i < 32; i++) {
    const measuredToday = i % 3 !== 1;
    const days: DayTemps[] = [
      { offset: 4, temps: [r1(fever())] },
      { offset: 3, temps: [r1(fever())] },
      { offset: 2, temps: i % 5 === 0 ? [r1(ok()), r1(fever())] : [r1(fever())] },
      { offset: 1, temps: [r1(fever())] },
    ];
    if (measuredToday) days.push({ offset: 0, temps: [r1(fever())] });
    await makePatient({
      name: nextName(),
      room: room++,
      admitOffset: 6,
      days,
      visitToday: measuredToday && i % 2 === 0 ? "Continue antipyretics & fluids." : undefined,
    });
  }

  // --- Group D: newly admitted today ---------------------------------------
  for (let i = 0; i < 14 && room <= 74; i++) {
    const measuredToday = i % 2 === 0;
    await makePatient({
      name: nextName(),
      room: room++,
      admitOffset: 0,
      days: measuredToday ? [{ offset: 0, temps: [r1(fever())] }] : [],
    });
  }

  // --- Past outcomes (not occupying rooms) for the quality dashboard --------
  // 34 cured + 6 deceased = 40 resolved -> 15% mortality (at benchmark).
  for (let i = 0; i < 34; i++) {
    await makePatient({
      name: nextName(),
      room: null,
      status: "DISCHARGED",
      admitOffset: 12 + (i % 6),
      resolvedOffset: 2 + (i % 5),
      resolutionNote: "Discharged: met no-fever criterion.",
      days: [
        { offset: 11, temps: [r1(fever())] },
        { offset: 9, temps: [r1(fever())] },
        { offset: 7, temps: [r1(ok())] },
        { offset: 6, temps: [r1(ok())] },
        { offset: 5, temps: [r1(ok())] },
      ],
    });
  }
  for (let i = 0; i < 6; i++) {
    await makePatient({
      name: nextName(),
      room: null,
      status: "DECEASED",
      admitOffset: 14 + (i % 4),
      resolvedOffset: 3 + (i % 4),
      resolutionNote: "Deceased despite treatment.",
      days: [
        { offset: 12, temps: [r1(fever())] },
        { offset: 10, temps: [r1(fever() + 0.8)] },
        { offset: 8, temps: [r1(fever() + 1.0)] },
      ],
    });
  }

  // A few example corrections (typo fixes) to populate the audit trail.
  const sample = await prisma.temperatureReading.findMany({
    take: 3,
    orderBy: { takenAt: "desc" },
  });
  for (const r of sample) {
    await prisma.readingCorrection.create({
      data: {
        readingId: r.id,
        oldCelsius: 28.0,
        newCelsius: r.valueCelsius,
        correctedByName: "Nurse Chen",
        note: "Mistyped 28 instead of 38.",
      },
    });
  }

  const counts = await prisma.patient.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
