import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { CorrectReadingForm } from "@/components/forms";
import {
  FeverTimeline,
  PatientStatusBadge,
  StreakPill,
  Temp,
} from "@/components/ui";
import { requirePage } from "@/lib/guard";
import { getPatient } from "@/lib/patients";
import { CURE_NO_FEVER_DAYS, FACILITY_TIMEZONE } from "@/lib/constants";

export const dynamic = "force-dynamic";

const dtf = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: safeTz(FACILITY_TIMEZONE),
});

function safeTz(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export default async function PatientPage({
  params,
}: {
  params: { id: string };
}) {
  const session = requirePage("NURSE", "DOCTOR", "ADMIN");
  const p = await getPatient(params.id);
  if (!p) notFound();

  return (
    <div className="min-h-screen">
      <AppHeader
        role={session.role}
        name={session.name}
        active={`/${session.role.toLowerCase()}`}
      />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <Link
          href={`/${session.role.toLowerCase()}`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back
        </Link>

        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">{p.name}</h1>
            <PatientStatusBadge status={p.status} />
            {p.roomNumber !== null && (
              <span className="text-sm text-slate-500">Room {p.roomNumber}</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span>Admitted {dtf.format(p.admittedAt)}</span>
            {p.resolvedAt && <span>· Left {dtf.format(p.resolvedAt)}</span>}
            <StreakPill streak={p.noFeverStreak} required={CURE_NO_FEVER_DAYS} />
            {p.dischargeEligible && p.status === "ACTIVE" && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Meets discharge criterion
              </span>
            )}
          </div>
          {p.resolutionNote && (
            <p className="mt-2 text-sm text-slate-600">{p.resolutionNote}</p>
          )}
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Fever timeline (admission → today)
            </div>
            <FeverTimeline timeline={p.timeline} max={60} />
            <div className="mt-2 flex gap-4 text-xs text-slate-500">
              <Legend color="bg-emerald-500" label="No fever" />
              <Legend color="bg-red-500" label="Fever" />
              <Legend color="bg-slate-200" label="No reading" />
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Temperature history ({p.timeline.reduce((n, d) => n + d.readingCount, 0)} readings)
            </h2>
            <div className="card divide-y divide-slate-100">
              <Readings
                patient={p}
                canCorrect={
                  session.role === "NURSE" || session.role === "DOCTOR"
                }
              />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Doctor visits
            </h2>
            <div className="card divide-y divide-slate-100">
              <Visits patient={p} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-3 w-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

// The PatientView only carries today's readings/visits in full; for the detail
// page we re-render from the data we have. Readings/visits beyond today are
// summarised in the timeline. For full per-reading history we show what the
// view model exposes (latest + today) plus the day-level timeline above.
function Readings({
  patient,
  canCorrect,
}: {
  patient: Awaited<ReturnType<typeof getPatient>>;
  canCorrect: boolean;
}) {
  if (!patient) return null;
  const rows = patient.allReadings ?? [];
  if (rows.length === 0) {
    return <p className="px-4 py-3 text-sm text-slate-400">No readings yet.</p>;
  }
  return (
    <>
      {rows.map((r) => (
        <div key={r.id} className="px-4 py-2.5 text-sm">
          <div className="flex items-start justify-between gap-2">
            <span
              className={r.valueCelsius >= 38 ? "font-medium text-red-600" : ""}
            >
              <Temp celsius={r.valueCelsius} />
              {r.corrections.length > 0 && (
                <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  corrected
                </span>
              )}
            </span>
            <div className="text-right text-xs text-slate-400">
              {dtf.format(r.takenAt)}
              <span className="block">by {r.takenByName}</span>
              {canCorrect && (
                <div className="mt-1">
                  <CorrectReadingForm
                    readingId={r.id}
                    currentCelsius={r.valueCelsius}
                  />
                </div>
              )}
            </div>
          </div>
          {r.corrections.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 border-l-2 border-amber-200 pl-2 text-xs text-slate-500">
              {r.corrections.map((c) => (
                <li key={c.id}>
                  {c.oldCelsius.toFixed(1)}°C → {c.newCelsius.toFixed(1)}°C · {c.correctedByName} · {dtf.format(c.createdAt)}
                  {c.note ? ` · "${c.note}"` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}

function Visits({
  patient,
}: {
  patient: Awaited<ReturnType<typeof getPatient>>;
}) {
  if (!patient) return null;
  const rows = patient.allVisits ?? [];
  if (rows.length === 0) {
    return <p className="px-4 py-3 text-sm text-slate-400">No visits recorded.</p>;
  }
  return (
    <>
      {rows.map((v) => (
        <div key={v.id} className="px-4 py-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{v.doctorName}</span>
            <span className="text-xs text-slate-400">{dtf.format(v.visitedAt)}</span>
          </div>
          {v.treatmentNote && (
            <p className="mt-0.5 text-slate-600">{v.treatmentNote}</p>
          )}
        </div>
      ))}
    </>
  );
}
