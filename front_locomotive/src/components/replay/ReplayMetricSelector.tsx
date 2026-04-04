import { METRIC_GROUPS } from '@/config/metrics.config'
import type { MetricDefinition } from '@/types/telemetry'
import { cn } from '@/utils/cn'

interface ReplayMetricSelectorProps {
  definitions: MetricDefinition[]
  selectedMetricIds: string[]
  onToggleMetric: (metricId: string) => void
}

export function ReplayMetricSelector({
  definitions,
  selectedMetricIds,
  onToggleMetric,
}: ReplayMetricSelectorProps) {
  const groupedDefinitions = Object.entries(
    definitions.filter((metric) => metric.sparklineEnabled).reduce<
      Record<string, MetricDefinition[]>
    >((acc, metric) => {
      const key = metric.group
      acc[key] ??= []
      acc[key].push(metric)
      return acc
    }, {})
  )

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Metrics</p>
        <h2 className="text-sm font-semibold text-slate-100">Chart selection</h2>
      </div>

      <div className="space-y-4">
        {groupedDefinitions.map(([group, metrics]) => (
          <div key={group}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {METRIC_GROUPS[group] ?? group}
            </h3>
            <div className="space-y-2">
              {metrics
                .slice()
                .sort((left, right) => left.displayOrder - right.displayOrder)
                .map((metric) => {
                  const checked = selectedMetricIds.includes(metric.metricId)

                  return (
                    <label
                      key={metric.metricId}
                      className={cn(
                        'flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition-colors',
                        checked
                          ? 'border-blue-500/40 bg-blue-500/10'
                          : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                      )}
                    >
                      <div>
                        <div className="text-sm text-slate-100">{metric.label}</div>
                        <div className="text-xs text-slate-500">{metric.unit}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleMetric(metric.metricId)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                      />
                    </label>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
