import { useHealthStore } from "@/features/health/useHealthStore";
import { HealthGauge } from "@/components/metrics/HealthGauge";
import { HealthExplainer } from "@/components/metrics/HealthExplainer";
import { SubsystemBar } from "@/components/metrics/SubsystemBar";
import { DynamicMetricRenderer } from "@/components/metrics/DynamicMetricRenderer";
import { AlertFeed } from "@/components/alerts/AlertFeed";
import { DispatcherInbox } from "@/components/messaging/DispatcherInbox";
import { SectionHeader } from "@/components/common/SectionHeader";
import { METRIC_DEFINITIONS, METRIC_GROUPS } from "@/config/metrics.config";
import { ROUTES } from "@/config/routes";
import type { MetricGroup } from "@/types/telemetry";

// Groups shown in the main metrics area
const DASHBOARD_GROUPS: MetricGroup[] = [
  "motion",
  "fuel",
  "thermal",
  "electrical",
];

export function DashboardPage() {
  const healthIndex = useHealthStore((s) => s.healthIndex);

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      {/* ── Top Left: Health ─────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          {/* Gauge */}
          <div className="flex flex-col items-center justify-center">
            {healthIndex ? (
              <HealthGauge score={healthIndex.overall} size={180} />
            ) : (
              <div className="flex h-[180px] w-[180px] items-center justify-center text-center text-sm text-slate-600">
                Health data is not currently available.
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">Overall Health Index</p>
          </div>

          {/* Subsystems */}
          <div className="flex-1">
            <SectionHeader title="Subsystems" />
            {healthIndex ? (
              <div className="flex flex-col">
                {healthIndex.subsystems.map((sub) => (
                  <SubsystemBar key={sub.subsystemId} subsystem={sub} />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-6 animate-pulse rounded bg-slate-800"
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <HealthExplainer healthIndex={healthIndex} />
      </div>

      {/* ── Top Right: Alerts ────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <AlertFeed maxVisible={5} />
      </div>

      {/* ── Bottom Left: Live Metrics ────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        {DASHBOARD_GROUPS.map((group) => {
          const defs = METRIC_DEFINITIONS.filter((d) => d.group === group).sort(
            (a, b) => a.displayOrder - b.displayOrder,
          );
          return (
            <div key={group} className="mb-5">
              <SectionHeader
                title={METRIC_GROUPS[group] ?? group}
                viewAllTo={ROUTES.TELEMETRY}
              />
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4">
                {defs.map((def) => (
                  <DynamicMetricRenderer key={def.metricId} definition={def} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bottom Right: Messages ───────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <DispatcherInbox maxVisible={4} />
      </div>
    </div>
  );
}
