"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  admitPatient,
  correctReading,
  dischargePatient,
  markDeceased,
  recordTemperature,
  recordVisit,
  type ActionResult,
} from "@/app/actions";

const INITIAL: ActionResult | null = null;

function SubmitButton({
  children,
  className = "btn-primary",
  pendingLabel,
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (state.ok) {
    return <span className="text-xs font-medium text-emerald-600">Saved ✓</span>;
  }
  return <span className="text-xs font-medium text-red-600">{state.error}</span>;
}

// --- Record temperature (nurse) -------------------------------------------

export function RecordTempForm({ patientId }: { patientId: string }) {
  const [state, formAction] = useFormState(recordTemperature, INITIAL);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="patientId" value={patientId} />
      <input
        name="valueCelsius"
        type="number"
        step="0.1"
        min="30"
        max="45"
        required
        placeholder="°C"
        className="input w-24"
        aria-label="Temperature in Celsius"
      />
      <SubmitButton className="btn-primary" pendingLabel="Saving…">
        Record
      </SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

// --- Record doctor visit ---------------------------------------------------

export function RecordVisitForm({
  patientId,
  tempTaken,
}: {
  patientId: string;
  tempTaken: boolean;
}) {
  const [state, formAction] = useFormState(recordVisit, INITIAL);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        Record visit
      </button>
    );
  }
  return (
    <form ref={ref} action={formAction} className="space-y-2">
      <input type="hidden" name="patientId" value={patientId} />
      {!tempTaken && (
        <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
          ⚠ No temperature recorded today yet. Please ensure it is taken.
        </p>
      )}
      <textarea
        name="treatmentNote"
        rows={2}
        placeholder="Treatment notes (optional)"
        className="input"
      />
      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">Save visit</SubmitButton>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

// --- Admit patient (admin) -------------------------------------------------

export function AdmitForm({ freeRooms }: { freeRooms: number[] }) {
  const [state, formAction] = useFormState(admitPatient, INITIAL);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Patient name</label>
        <input name="name" required minLength={2} className="input w-56" />
      </div>
      <div>
        <label className="label">Room</label>
        <select name="roomNumber" required className="input w-28" defaultValue="">
          <option value="" disabled>
            Room…
          </option>
          {freeRooms.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton pendingLabel="Admitting…">Admit patient</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

// --- Discharge (admin) -----------------------------------------------------

export function DischargeForm({ patientId }: { patientId: string }) {
  const [state, formAction] = useFormState(dischargePatient, INITIAL);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="patientId" value={patientId} />
      <SubmitButton className="btn-primary" pendingLabel="Discharging…">
        Discharge
      </SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

// --- Correct a reading (nurse/doctor) -------------------------------------

export function CorrectReadingForm({
  readingId,
  currentCelsius,
}: {
  readingId: string;
  currentCelsius: number;
}) {
  const [state, formAction] = useFormState(correctReading, INITIAL);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        className="text-xs font-medium text-brand-700 hover:underline"
        onClick={() => setOpen(true)}
      >
        Correct
      </button>
    );
  }
  return (
    <form action={formAction} className="mt-1 space-y-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
      <input type="hidden" name="readingId" value={readingId} />
      <div className="flex items-center gap-1.5">
        <input
          name="valueCelsius"
          type="number"
          step="0.1"
          min="30"
          max="45"
          required
          defaultValue={currentCelsius}
          className="input w-20 py-1"
          aria-label="Corrected temperature in Celsius"
        />
        <span className="text-xs text-slate-400">°C</span>
      </div>
      <input name="note" placeholder="Reason (optional)" className="input py-1 text-xs" />
      <div className="flex items-center gap-2">
        <SubmitButton className="btn-primary px-2 py-1 text-xs" pendingLabel="Saving…">
          Save correction
        </SubmitButton>
        <button
          type="button"
          className="text-xs text-slate-500 hover:text-slate-900"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

// --- Mark deceased (doctor) ------------------------------------------------

export function MarkDeceasedForm({ patientId }: { patientId: string }) {
  const [state, formAction] = useFormState(markDeceased, INITIAL);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn-danger" onClick={() => setOpen(true)}>
        Record death
      </button>
    );
  }
  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <input type="hidden" name="patientId" value={patientId} />
      <p className="text-xs font-medium text-red-800">
        This records a patient death (counts against the success rate). Confirm:
      </p>
      <input name="note" placeholder="Note (optional)" className="input" />
      <div className="flex items-center gap-2">
        <SubmitButton className="btn-danger" pendingLabel="Recording…">
          Confirm death
        </SubmitButton>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
