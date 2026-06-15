import { redirect } from "next/navigation";
import { enterSession } from "./actions";
import { getSession, ROLES, ROLE_LABELS } from "@/lib/session";
import { CAPACITY, CURE_NO_FEVER_DAYS, FEVER_THRESHOLD_C } from "@/lib/constants";

const ROLE_BLURB: Record<string, string> = {
  NURSE: "Record daily temperatures",
  DOCTOR: "Visit patients & review treatment",
  ADMIN: "Admissions & discharges",
};

export default function HomePage() {
  const session = getSession();
  if (session) redirect(`/${session.role.toLowerCase()}`);

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-brand-50 to-slate-100 p-4">
      <div className="card w-full max-w-md p-7">
        <div className="mb-5 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-lg font-bold text-white">
            Q
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Quarantine Care</h1>
            <p className="text-xs text-slate-500">
              Temperature tracking & discharge coordination
            </p>
          </div>
        </div>

        <form action={enterSession} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              placeholder="e.g. Nurse Adeyemi"
              className="input"
            />
          </div>

          <div>
            <span className="label">I am signing in as</span>
            <div className="grid gap-2">
              {ROLES.map((role, i) => (
                <label
                  key={role}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
                >
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    defaultChecked={i === 0}
                    className="accent-brand-600"
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      {ROLE_LABELS[role]}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {ROLE_BLURB[role]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary w-full">
            Enter
          </button>
        </form>

        <p className="mt-5 border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
          {CAPACITY} beds · fever ≥ {FEVER_THRESHOLD_C.toFixed(1)}°C ·{" "}
          {CURE_NO_FEVER_DAYS} fever-free days to discharge
        </p>
      </div>
    </main>
  );
}
