import { AppHeader } from "@/components/AppHeader";
import { AdmitForm, DischargeForm } from "@/components/forms";
import {
  EmptyState,
  FeverTimeline,
  MetricCard,
  PatientLink,
  StreakPill,
} from "@/components/ui";
import { requirePage } from "@/lib/guard";
import {
  getActivePatients,
  getFreeRooms,
  getMetrics,
} from "@/lib/patients";
import { CAPACITY, CURE_NO_FEVER_DAYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = requirePage("ADMIN");
  const [patients, metrics, freeRooms] = await Promise.all([
    getActivePatients(),
    getMetrics(),
    getFreeRooms(),
  ]);
  const dischargeQueue = patients.filter((p) => p.dischargeEligible);

  return (
    <div className="min-h-screen">
      <AppHeader role={session.role} name={session.name} active="/admin" />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <h1 className="text-xl font-semibold">Admissions & discharges</h1>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard
            label="Occupancy"
            value={`${metrics.active}/${CAPACITY}`}
            sub={`${metrics.freeBeds} beds free`}
            tone={metrics.freeBeds === 0 ? "warn" : "default"}
          />
          <MetricCard label="Free beds" value={metrics.freeBeds} />
          <MetricCard
            label="Ready to discharge"
            value={dischargeQueue.length}
            tone={dischargeQueue.length > 0 ? "good" : "default"}
          />
          <MetricCard label="Total discharged" value={metrics.discharged} />
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Discharge queue — met {CURE_NO_FEVER_DAYS}-day no-fever criterion (
            {dischargeQueue.length})
          </h2>
          <p className="text-xs text-slate-500">
            Automatically flagged by the system — no need to wait for a doctor to
            remember. Discharging frees the room immediately.
          </p>
          {dischargeQueue.length === 0 ? (
            <EmptyState>No patients currently meet the discharge criterion.</EmptyState>
          ) : (
            <div className="card divide-y divide-slate-100">
              {dischargeQueue.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="w-12 shrink-0 text-center">
                    <div className="text-xs text-slate-400">Room</div>
                    <div className="font-semibold">{p.roomNumber ?? "—"}</div>
                  </div>
                  <div className="min-w-[10rem] flex-1">
                    <PatientLink id={p.id}>{p.name}</PatientLink>
                    <div className="mt-1">
                      <StreakPill
                        streak={p.noFeverStreak}
                        required={CURE_NO_FEVER_DAYS}
                      />
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <FeverTimeline timeline={p.timeline} />
                  </div>
                  <div className="ml-auto">
                    <DischargeForm patientId={p.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Admit a new patient
          </h2>
          <div className="card p-4">
            {freeRooms.length === 0 ? (
              <p className="text-sm text-amber-700">
                Centre is at full capacity ({CAPACITY}). Discharge a patient to free
                a room.
              </p>
            ) : (
              <AdmitForm freeRooms={freeRooms} />
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Current patients ({patients.length})
          </h2>
          <div className="card divide-y divide-slate-100">
            {patients.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-4 px-4 py-2.5 text-sm"
              >
                <span className="w-10 text-center font-semibold">
                  {p.roomNumber ?? "—"}
                </span>
                <PatientLink id={p.id}>{p.name}</PatientLink>
                <span className="ml-auto">
                  <StreakPill
                    streak={p.noFeverStreak}
                    required={CURE_NO_FEVER_DAYS}
                  />
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
