import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { SectionHeader } from '@/components/common/SectionHeader'
import { useMetricCatalog } from '@/features/telemetry/metricCatalog'
import { cn } from '@/utils/cn'
import type { HealthIndex, SubsystemPenalty } from '@/types/health'

interface HealthExplainerProps {
  healthIndex: HealthIndex | null
}

function formatMetricValue(metricId: string, value: number, definitions: ReturnType<typeof useMetricCatalog>) {
  const metric = definitions.find((item) => item.metricId === metricId)
  const precision = metric?.precision ?? 1
  const unit = metric?.unit ?? ''
  return `${value.toFixed(precision)}${unit ? ` ${unit}` : ''}`
}

function getPenaltyTone(penaltyPoints: number) {
  return penaltyPoints >= 15
    ? {
        rowClassName: 'border-red-500/20 bg-red-500/5',
        textClassName: 'text-red-300',
        badgeClassName: 'border-red-500/30 bg-red-500/10 text-red-300',
      }
    : {
        rowClassName: 'border-amber-500/20 bg-amber-500/5',
        textClassName: 'text-amber-300',
        badgeClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      }
}

function PenaltyRow({
  penalty,
  definitions,
}: {
  penalty: SubsystemPenalty
  definitions: ReturnType<typeof useMetricCatalog>
}) {
  const isHigh = penalty.thresholdType.endsWith('High')
  const tone = getPenaltyTone(penalty.penaltyPoints)
  const DirectionIcon = isHigh ? ArrowUpRight : ArrowDownRight
  const thresholdLabel = penalty.thresholdType.startsWith('critical') ? 'Critical' : 'Warning'

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2',
        tone.rowClassName
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-100">{penalty.metricLabel}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span className="font-mono text-slate-300">
            {formatMetricValue(penalty.metricId, penalty.currentValue, definitions)}
          </span>
          <span className={cn('inline-flex items-center gap-1', tone.textClassName)}>
            <DirectionIcon size={13} />
            <span>
              {thresholdLabel} {isHigh ? 'high' : 'low'} at{' '}
              {formatMetricValue(penalty.metricId, penalty.thresholdValue, definitions)}
            </span>
          </span>
        </div>
      </div>

      <div
        className={cn(
          'rounded-full border px-2 py-1 text-xs font-semibold tabular-nums',
          tone.badgeClassName
        )}
      >
        -{penalty.penaltyPoints.toFixed(0)}
      </div>
    </div>
  )
}

export function HealthExplainer({ healthIndex }: HealthExplainerProps) {
  const definitions = useMetricCatalog()
  const topFactors = healthIndex?.topFactors ?? []

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <SectionHeader title="Contributing Factors" count={topFactors.length} />

      {healthIndex === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg bg-slate-800" />
          ))}
        </div>
      ) : topFactors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 px-4 py-6 text-sm text-slate-500">
          No active threshold penalties
        </div>
      ) : (
        <div className="space-y-2">
          {topFactors.map((penalty, index) => (
            <PenaltyRow
              key={`${penalty.metricId}-${penalty.thresholdType}-${index}`}
              penalty={penalty}
              definitions={definitions}
            />
          ))}
        </div>
      )}
    </section>
  )
}
