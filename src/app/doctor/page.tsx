import { AppHeader } from "@/components/AppHeader";
import { MarkDeceasedForm, RecordVisitForm } from "@/components/forms";
import {
  EmptyState,
  FeverTimeline,
  PatientLink,
  StreakPill,
  Temp,
} from "@/components/ui";
import { requirePage } from "@/lib/guard";
import { getActivePatients, type PatientView } from "@/lib/patients";
import { CURE_NO_FEVER_DAYS } from "@/lib/constants";
import clsx from "clsx";

export const dynamic = "force-dynamic";

export default async function DoctorPage() {
  const session = requirePage("DOCTOR");
  const patients = await getActivePatients();

  const ready = patients.filter((p) => p.tempTakenToday && !p.doctorVisitedToday);
  const awaiting = patients.filter(
    (p) => !p.tempTakenToday && !p.doctorVisitedToday,
  );
  const visited = patients.filter((p) => p.doctorVisitedToday);

  return (
    <div className="min-h-screen">
      <AppHeader role={session.role} name={session.name} active="/doctor" />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-xl font-semibold">Today&apos;s doctor rounds</h1>
          <p className="text-sm text-slate-500">
            Patients appear under <strong>Ready for visit</strong> once their
            temperature has been taken today — so you never arrive before the
            nurse. Eligible-for-discharge patients are flagged for admin.
          </p>
        </div>

        <Section
          title={`Ready for visit (${ready.length})`}
          empty="No patients are ready right now."
        >
          {ready.map((p) => (
            <DoctorRow key={p.id} p={p} />
          ))}
        </Section>

        {awaiting.length > 0 && (
          <Section
            title={`Awaiting temperature (${awaiting.length})`}
            hint="Temperature not recorded today yet — nurse should measure first."
            empty=""
          >
            {awaiting.map((p) => (
              <DoctorRow key={p.id} p={p} />
            ))}
          </Section>
        )}

        {visited.length > 0 && (
          <Section title={`Visited today (${visited.length})`} empty="">
            {visited.map((p) => (
              <DoctorRow key={p.id} p={p} />
            ))}
          </Section>
        )}
      </main>
    </div>
  );
}

function Section({
  title,
  hint,
  empty,
  children,
}: {
  title: string;
  hint?: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {hint && <p className="text-xs text-amber-700">{hint}</p>}
      {items.length === 0 ? (
        empty ? (
          <EmptyState>{empty}</EmptyState>
        ) : null
      ) : (
        <div className="card divide-y divide-slate-100">{children}</div>
      )}
    </section>
  );
}

function DoctorRow({ p }: { p: PatientView }) {
  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="w-12 shrink-0 text-center">
          <div className="text-xs text-slate-400">Room</div>
          <div className="font-semibold">{p.roomNumber ?? "—"}</div>
        </div>
        <div className="min-w-[10rem] flex-1">
          <div className="flex items-center gap-2">
            <PatientLink id={p.id}>{p.name}</PatientLink>
            {p.dischargeEligible && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Discharge-ready
              </span>
            )}
            {p.doctorVisitedToday && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
                Visited ✓
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
          {p.latestReading ? (
            <span
              className={clsx(
                p.todayStatus === "FEVER" ? "text-red-600" : "text-slate-600",
              )}
            >
              Latest: <Temp celsius={p.latestReading.valueCelsius} />
            </span>
          ) : (
            <span className="text-slate-400">No readings</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-3 pl-12">
        <RecordVisitForm patientId={p.id} tempTaken={p.tempTakenToday} />
        <MarkDeceasedForm patientId={p.id} />
        {p.todaysVisit?.treatmentNote && (
          <p className="text-xs text-slate-500">
            Today&apos;s note: {p.todaysVisit.treatmentNote}
          </p>
        )}
      </div>
    </div>
  );
}
