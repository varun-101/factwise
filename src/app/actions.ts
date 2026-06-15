"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  clearSession,
  getSession,
  isRole,
  setSession,
  type Role,
} from "@/lib/session";
import { CAPACITY } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

function requireRole(...allowed: Role[]): Role {
  const session = getSession();
  if (!session) throw new Error("Not signed in.");
  if (!allowed.includes(session.role)) {
    throw new Error("You do not have permission for this action.");
  }
  return session.role;
}

function refreshAll() {
  revalidatePath("/nurse");
  revalidatePath("/doctor");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function enterSession(formData: FormData): Promise<void> {
  const role = String(formData.get("role") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!isRole(role)) throw new Error("Pick a valid role.");
  if (name.length < 2) throw new Error("Enter your name.");
  setSession({ role, name });
  redirect(`/${role.toLowerCase()}`);
}

export async function exitSession(): Promise<void> {
  clearSession();
  redirect("/");
}

// ---------------------------------------------------------------------------
// Nurse: record temperature
// ---------------------------------------------------------------------------

const temperatureSchema = z.object({
  patientId: z.string().min(1),
  // Plausible human body-temperature range in °C; guards against typos.
  valueCelsius: z.coerce.number().min(30).max(45),
});

export async function recordTemperature(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = getSession();
    requireRole("NURSE", "DOCTOR"); // doctors may also record if they must
    const { patientId, valueCelsius } = temperatureSchema.parse({
      patientId: formData.get("patientId"),
      valueCelsius: formData.get("valueCelsius"),
    });

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.status !== "ACTIVE") {
      return { ok: false, error: "Patient is not currently admitted." };
    }

    await prisma.temperatureReading.create({
      data: {
        patientId,
        valueCelsius,
        takenByName: session!.name,
      },
    });
    refreshAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Correct a temperature reading (with audit trail)
// ---------------------------------------------------------------------------

const correctSchema = z.object({
  readingId: z.string().min(1),
  valueCelsius: z.coerce.number().min(30).max(45),
  note: z.string().max(500).optional(),
});

export async function correctReading(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = getSession();
    requireRole("NURSE", "DOCTOR");
    const { readingId, valueCelsius, note } = correctSchema.parse({
      readingId: formData.get("readingId"),
      valueCelsius: formData.get("valueCelsius"),
      note: formData.get("note") || undefined,
    });

    const reading = await prisma.temperatureReading.findUnique({
      where: { id: readingId },
    });
    if (!reading) return { ok: false, error: "Reading not found." };
    if (reading.valueCelsius === valueCelsius) {
      return { ok: false, error: "New value matches the current value." };
    }

    // Log the change and update the reading atomically.
    await prisma.$transaction([
      prisma.readingCorrection.create({
        data: {
          readingId,
          oldCelsius: reading.valueCelsius,
          newCelsius: valueCelsius,
          correctedByName: session!.name,
          note: note?.trim() || null,
        },
      }),
      prisma.temperatureReading.update({
        where: { id: readingId },
        data: { valueCelsius },
      }),
    ]);
    refreshAll();
    revalidatePath(`/patients/${reading.patientId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Doctor: record a visit
// ---------------------------------------------------------------------------

const visitSchema = z.object({
  patientId: z.string().min(1),
  treatmentNote: z.string().max(2000).optional(),
});

export async function recordVisit(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = getSession();
    requireRole("DOCTOR");
    const { patientId, treatmentNote } = visitSchema.parse({
      patientId: formData.get("patientId"),
      treatmentNote: formData.get("treatmentNote") || undefined,
    });

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.status !== "ACTIVE") {
      return { ok: false, error: "Patient is not currently admitted." };
    }

    await prisma.doctorVisit.create({
      data: {
        patientId,
        doctorName: session!.name,
        treatmentNote: treatmentNote?.trim() || null,
      },
    });
    refreshAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Admin: admit a new patient
// ---------------------------------------------------------------------------

const admitSchema = z.object({
  name: z.string().min(2).max(120),
  roomNumber: z.coerce.number().int().min(1).max(CAPACITY),
});

export async function admitPatient(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    requireRole("ADMIN");
    const { name, roomNumber } = admitSchema.parse({
      name: String(formData.get("name") ?? "").trim(),
      roomNumber: formData.get("roomNumber"),
    });

    const activeCount = await prisma.patient.count({
      where: { status: "ACTIVE" },
    });
    if (activeCount >= CAPACITY) {
      return { ok: false, error: `Centre is at full capacity (${CAPACITY}).` };
    }

    const occupied = await prisma.patient.findFirst({
      where: { status: "ACTIVE", roomNumber },
    });
    if (occupied) {
      return { ok: false, error: `Room ${roomNumber} is already occupied.` };
    }

    await prisma.patient.create({ data: { name, roomNumber } });
    refreshAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Admin: discharge (cured)
// ---------------------------------------------------------------------------

const dischargeSchema = z.object({ patientId: z.string().min(1) });

export async function dischargePatient(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    requireRole("ADMIN");
    const { patientId } = dischargeSchema.parse({
      patientId: formData.get("patientId"),
    });

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.status !== "ACTIVE") {
      return { ok: false, error: "Patient is not currently admitted." };
    }

    await prisma.patient.update({
      where: { id: patientId },
      data: {
        status: "DISCHARGED",
        resolvedAt: new Date(),
        roomNumber: null, // free the room for a new admission
        resolutionNote: "Discharged: met no-fever criterion.",
      },
    });
    refreshAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Doctor: mark deceased (outcome tracking)
// ---------------------------------------------------------------------------

const deceasedSchema = z.object({
  patientId: z.string().min(1),
  note: z.string().max(2000).optional(),
});

export async function markDeceased(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    requireRole("DOCTOR");
    const { patientId, note } = deceasedSchema.parse({
      patientId: formData.get("patientId"),
      note: formData.get("note") || undefined,
    });

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.status !== "ACTIVE") {
      return { ok: false, error: "Patient is not currently admitted." };
    }

    await prisma.patient.update({
      where: { id: patientId },
      data: {
        status: "DECEASED",
        resolvedAt: new Date(),
        roomNumber: null,
        resolutionNote: note?.trim() || "Deceased.",
      },
    });
    refreshAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.errors[0]?.message ?? "Invalid input.";
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
