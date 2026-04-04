import { cn } from '@/utils/cn'
import { getMetricSeverity } from '@/utils/thresholds'
import { ValueDisplay } from './ValueDisplay'
import type { MetricDefinition, MetricReading } from '@/types/telemetry'

interface MetricCardProps {
  definition: MetricDefinition
  reading?: MetricReading
  sparkline?: React.ReactNode
  className?: string
}

export function MetricCard({ definition, reading, sparkline, className }: MetricCardProps) {
  const severity = reading
    ? getMetricSeverity(reading.value, definition)
    : 'normal'

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        severity === 'critical'
          ? 'border-red-500/40 bg-red-500/10'
          : severity === 'warning'
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-slate-700/50 bg-slate-800/50',
        className
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-slate-400">{definition.label}</span>
        {severity !== 'normal' && (
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              severity === 'critical' ? 'bg-red-400' : 'bg-amber-400'
            )}
          />
        )}
      </div>
      <ValueDisplay
        value={reading?.value}
        unit={definition.unit}
        precision={definition.precision}
        timestamp={reading?.timestamp}
      />
      {sparkline && <div className="mt-2">{sparkline}</div>}
    </div>
  )
}
