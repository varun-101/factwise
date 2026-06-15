import { AppHeader } from "@/components/AppHeader";
import { MetricCard, MortalityTrendChart } from "@/components/ui";
import { requirePage } from "@/lib/guard";
import { getMetrics, getMortalityTrend } from "@/lib/patients";
import {
  CAPACITY,
  MORTALITY_BENCHMARK,
  SUCCESS_BENCHMARK,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

function pct(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

export default async function DashboardPage() {
  const session = requirePage("NURSE", "DOCTOR", "ADMIN");
  const [m, trend] = await Promise.all([getMetrics(), getMortalityTrend()]);

  return (
    <div className="min-h-screen">
      <AppHeader role={session.role} name={session.name} active="/dashboard" />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-xl font-semibold">Treatment-quality dashboard</h1>
          <p className="text-sm text-slate-500">
            Measured against the centre&apos;s {(SUCCESS_BENCHMARK * 100).toFixed(0)}%
            success / {(MORTALITY_BENCHMARK * 100).toFixed(0)}% mortality benchmark.
          </p>
        </div>

        {m.mortalityAlert && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            ⚠ Mortality rate ({pct(m.mortalityRate)}) is above the expected{" "}
            {(MORTALITY_BENCHMARK * 100).toFixed(0)}% benchmark. Review treatment
            quality.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Success rate"
            value={pct(m.successRate)}
            sub={`benchmark ${(SUCCESS_BENCHMARK * 100).toFixed(0)}%`}
            tone={
              m.successRate === null
                ? "default"
                : m.successRate >= SUCCESS_BENCHMARK
                  ? "good"
                  : "bad"
            }
          />
          <MetricCard
            label="Mortality rate"
            value={pct(m.mortalityRate)}
            sub={`benchmark ${(MORTALITY_BENCHMARK * 100).toFixed(0)}%`}
            tone={
              m.mortalityRate === null
                ? "default"
                : m.mortalityAlert
                  ? "bad"
                  : "good"
            }
          />
          <MetricCard
            label="Occupancy"
            value={`${(m.occupancyRate * 100).toFixed(0)}%`}
            sub={`${m.active}/${CAPACITY} beds`}
          />
          <MetricCard
            label="Outcomes recorded"
            value={m.resolved}
            sub={`${m.discharged} cured · ${m.deceased} died`}
          />
        </div>

        <BenchmarkBar
          label="Success rate vs benchmark"
          value={m.successRate}
          benchmark={SUCCESS_BENCHMARK}
          goodWhenAbove
        />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Mortality over time
          </h2>
          <p className="text-xs text-slate-500">
            A trailing-window rate catches a <em>rise</em> in mortality early — a
            single lifetime figure can hide a recent deterioration.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricCard
              label="Last 7 days"
              value={pct(trend.window7.rate)}
              sub={`${trend.window7.deceased}/${trend.window7.resolved} outcomes`}
              tone={
                trend.window7.rate === null
                  ? "default"
                  : trend.window7.rate > MORTALITY_BENCHMARK
                    ? "bad"
                    : "good"
              }
            />
            <MetricCard
              label="Last 30 days"
              value={pct(trend.window30.rate)}
              sub={`${trend.window30.deceased}/${trend.window30.resolved} outcomes`}
              tone={
                trend.window30.rate === null
                  ? "default"
                  : trend.window30.rate > MORTALITY_BENCHMARK
                    ? "bad"
                    : "good"
              }
            />
            <MetricCard
              label="All time"
              value={pct(m.mortalityRate)}
              sub={`${m.deceased}/${m.resolved} outcomes`}
              tone={m.mortalityAlert ? "bad" : "good"}
            />
          </div>
          <MortalityTrendChart
            points={trend.series}
            benchmark={MORTALITY_BENCHMARK}
            windowDays={trend.windowDays}
          />
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Currently admitted" value={m.active} />
          <MetricCard label="Cured & discharged" value={m.discharged} tone="good" />
          <MetricCard label="Deceased" value={m.deceased} tone={m.deceased ? "bad" : "default"} />
        </div>

        {m.resolved === 0 && (
          <p className="text-sm text-slate-500">
            No outcomes recorded yet — success and mortality rates will populate as
            patients are discharged or, sadly, lost.
          </p>
        )}
      </main>
    </div>
  );
}

function BenchmarkBar({
  label,
  value,
  benchmark,
  goodWhenAbove,
}: {
  label: string;
  value: number | null;
  benchmark: number;
  goodWhenAbove: boolean;
}) {
  const v = value ?? 0;
  const good = goodWhenAbove ? v >= benchmark : v <= benchmark;
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">{value === null ? "—" : pct(value)}</span>
      </div>
      <div className="relative h-3 w-full rounded-full bg-slate-100">
        <div
          className={`h-3 rounded-full ${good ? "bg-emerald-500" : "bg-red-500"}`}
          style={{ width: `${Math.min(100, Math.max(0, v * 100))}%` }}
        />
        <div
          className="absolute top-[-3px] h-[18px] w-0.5 bg-slate-700"
          style={{ left: `${benchmark * 100}%` }}
          title={`Benchmark ${pct(benchmark)}`}
        />
      </div>
      <div className="mt-1 text-xs text-slate-400">
        Marker shows the {pct(benchmark)} benchmark.
      </div>
    </div>
  );
}
