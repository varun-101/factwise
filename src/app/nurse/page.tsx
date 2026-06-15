import { AppHeader } from "@/components/AppHeader";
import { RecordTempForm } from "@/components/forms";
import {
  EmptyState,
  FeverTimeline,
  PatientLink,
  StreakPill,
  Temp,
} from "@/components/ui";
import { requirePage } from "@/lib/guard";
import { getActivePatients } from "@/lib/patients";
import { CURE_NO_FEVER_DAYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function NursePage() {
  const session = requirePage("NURSE");
  const patients = await getActivePatients();
  // Overdue (past cutoff) first, then the rest still needing a reading.
  const pending = patients
    .filter((p) => !p.tempTakenToday)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue));
  const overdue = pending.filter((p) => p.overdue);
  const done = patients.filter((p) => p.tempTakenToday);

  return (
    <div className="min-h-screen">
      <AppHeader role={session.role} name={session.name} active="/nurse" />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Today&apos;s temperature rounds</h1>
            <p className="text-sm text-slate-500">
              Record each patient&apos;s temperature once today. Patients already
              done are moved to the bottom so no one is measured twice.
            </p>
          </div>
          <div className="flex gap-2">
            {overdue.length > 0 && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {overdue.length} overdue
              </div>
            )}
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
              {pending.length} still need a reading
            </div>
          </div>
        </div>

        {overdue.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            ⚠ <strong>{overdue.length}</strong> patient
            {overdue.length === 1 ? " has" : "s have"} no temperature recorded and
            the daily cut-off has passed. Measure these first.
          </div>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Needs temperature today ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <EmptyState>All patients have a temperature recorded today 🎉</EmptyState>
          ) : (
            <div className="card divide-y divide-slate-100">
              {pending.map((p) => (
                <PatientRow key={p.id} p={p} done={false} />
              ))}
            </div>
          )}
        </section>

        {done.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Done today ({done.length})
            </h2>
            <div className="card divide-y divide-slate-100 opacity-90">
              {done.map((p) => (
                <PatientRow key={p.id} p={p} done />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function PatientRow({
  p,
  done,
}: {
  p: Awaited<ReturnType<typeof getActivePatients>>[number];
  done: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="w-12 shrink-0 text-center">
        <div className="text-xs text-slate-400">Room</div>
        <div className="font-semibold">{p.roomNumber ?? "—"}</div>
      </div>
      <div className="min-w-[10rem] flex-1">
        <div className="flex items-center gap-2">
          <PatientLink id={p.id}>{p.name}</PatientLink>
          {!done && p.overdue && (
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              Overdue
            </span>
          )}
        </div>
        <div className="mt-1">
          <StreakPill streak={p.noFeverStreak} required={CURE_NO_FEVER_DAYS} />
        </div>
      </div>
      <div className="hidden sm:block">
        <FeverTimeline timeline={p.timeline} />
      </div>
      <div className="w-40 text-sm">
        {done && p.todaysReadings[0] ? (
          <span className="text-slate-600">
            Today: <Temp celsius={p.todaysReadings[0].valueCelsius} />
            <span className="block text-xs text-slate-400">
              by {p.todaysReadings[0].takenByName}
              {p.todaysReadings.length > 1
                ? ` (+${p.todaysReadings.length - 1} more)`
                : ""}
            </span>
          </span>
        ) : (
          <span className="text-slate-400">No reading yet</span>
        )}
      </div>
      <div className="ml-auto">
        <RecordTempForm patientId={p.id} />
      </div>
    </div>
  );
}
