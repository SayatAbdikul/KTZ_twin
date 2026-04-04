import { cn } from '@/utils/cn'
import { isStale } from '@/utils/time'
import { Clock } from 'lucide-react'

interface ValueDisplayProps {
  value: number | null | undefined
  unit: string
  precision: number
  timestamp?: number
  className?: string
  valueClassName?: string
}

export function ValueDisplay({
  value,
  unit,
  precision,
  timestamp,
  className,
  valueClassName,
}: ValueDisplayProps) {
  const stale = timestamp !== undefined && isStale(timestamp)
  const unavailable = value === null || value === undefined

  return (
    <div className={cn('flex items-baseline gap-1', className)}>
      <span
        className={cn(
          'font-mono text-2xl font-semibold tabular-nums',
          stale ? 'text-slate-500' : 'text-slate-100',
          valueClassName
        )}
      >
        {unavailable ? '—' : value!.toFixed(precision)}
      </span>
      <span className="text-sm text-slate-500">{unit}</span>
      {stale && <Clock size={12} className="text-slate-600" />}
    </div>
  )
}
