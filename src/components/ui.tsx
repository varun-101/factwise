import Link from "next/link";
import clsx from "clsx";
import type { DailyTemp, DayStatus } from "@/lib/domain";
import { cToF } from "@/lib/domain";

export function PatientStatusBadge({
  status,
}: {
  status: "ACTIVE" | "DISCHARGED" | "DECEASED";
}) {
  const map = {
    ACTIVE: "bg-brand-50 text-brand-700 border-brand-100",
    DISCHARGED: "bg-emerald-50 text-emerald-700 border-emerald-100",
    DECEASED: "bg-slate-100 text-slate-600 border-slate-200",
  } as const;
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        map[status],
      )}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

const DAY_COLORS: Record<DayStatus, string> = {
  FEVER: "bg-red-500",
  NO_FEVER: "bg-emerald-500",
  UNMEASURED: "bg-slate-200",
};

export function FeverTimeline({
  timeline,
  max = 14,
}: {
  timeline: DailyTemp[];
  max?: number;
}) {
  const days = timeline.slice(-max);
  return (
    <div className="flex items-center gap-1">
      {days.map((d) => (
        <span
          key={d.date}
          title={`${d.date}: ${
            d.status === "UNMEASURED"
              ? "no reading"
              : `${d.maxCelsius?.toFixed(1)}°C (${d.status === "FEVER" ? "fever" : "no fever"})`
          }`}
          className={clsx("h-5 w-2.5 rounded-sm", DAY_COLORS[d.status])}
        />
      ))}
    </div>
  );
}

export function StreakPill({
  streak,
  required,
}: {
  streak: number;
  required: number;
}) {
  const done = streak >= required;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        done
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-600",
      )}
    >
      {streak}/{required} fever-free {done ? "✓" : "days"}
    </span>
  );
}

export function Temp({ celsius }: { celsius: number }) {
  return (
    <span>
      {celsius.toFixed(1)}°C{" "}
      <span className="text-slate-400">/ {cToF(celsius).toFixed(1)}°F</span>
    </span>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    default: "text-slate-900",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-red-600",
  }[tone];
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={clsx("mt-1 text-2xl font-semibold", toneClass)}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

export function MortalityTrendChart({
  points,
  benchmark,
  windowDays,
}: {
  points: { date: string; rate: number | null; resolved: number }[];
  benchmark: number;
  windowDays: number;
}) {
  const W = 640;
  const H = 170;
  const padL = 34;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const rates = points.map((p) => p.rate).filter((r): r is number => r !== null);
  const yMax = Math.max(0.3, benchmark * 1.6, ...rates.map((r) => r * 1.15));
  const xFor = (i: number) =>
    padL + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW);
  const yFor = (r: number) => padT + innerH - (Math.min(r, yMax) / yMax) * innerH;

  // Break the line wherever a window has no outcomes (rate === null).
  const segments: string[] = [];
  let cur: string[] = [];
  points.forEach((p, i) => {
    if (p.rate === null) {
      if (cur.length) segments.push(cur.join(" "));
      cur = [];
    } else {
      cur.push(`${xFor(i).toFixed(1)},${yFor(p.rate).toFixed(1)}`);
    }
  });
  if (cur.length) segments.push(cur.join(" "));

  const benchY = yFor(benchmark);
  const hasData = rates.length > 0;

  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">
          Mortality trend — trailing {windowDays}-day rate
        </span>
        <span className="text-xs text-slate-400">
          last {points.length} days
        </span>
      </div>
      {!hasData ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Not enough outcomes yet to plot a trend.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-44 w-full"
          role="img"
          aria-label="Rolling mortality rate over time"
        >
          {/* y gridlines / labels at 0, benchmark, yMax */}
          {[0, benchmark, yMax].map((v, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={yFor(v)}
                y2={yFor(v)}
                stroke={i === 1 ? "#f59e0b" : "#e2e8f0"}
                strokeDasharray={i === 1 ? "4 3" : undefined}
              />
              <text x={4} y={yFor(v) + 3} className="fill-slate-400" fontSize="9">
                {(v * 100).toFixed(0)}%
              </text>
            </g>
          ))}
          {/* benchmark label */}
          <text
            x={W - padR}
            y={benchY - 3}
            textAnchor="end"
            className="fill-amber-600"
            fontSize="9"
          >
            {(benchmark * 100).toFixed(0)}% benchmark
          </text>
          {/* trend line */}
          {segments.map((pts, i) => (
            <polyline
              key={i}
              points={pts}
              fill="none"
              stroke="#1f63d8"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ))}
          {/* x-axis end labels */}
          <text x={padL} y={H - 6} className="fill-slate-400" fontSize="9">
            {points[0]?.date.slice(5)}
          </text>
          <text
            x={W - padR}
            y={H - 6}
            textAnchor="end"
            className="fill-slate-400"
            fontSize="9"
          >
            {points[points.length - 1]?.date.slice(5)}
          </text>
        </svg>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export function PatientLink({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={`/patients/${id}`} className="font-medium text-brand-700 hover:underline">
      {children}
    </Link>
  );
}
