import { cn } from '@/utils/cn'

type StatusVariant = 'critical' | 'warning' | 'normal' | 'info' | 'unknown'

interface StatusBadgeProps {
  status: StatusVariant | string
  label?: string
  className?: string
}

const VARIANT_STYLES: Record<StatusVariant, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/50',
  warning: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
  normal: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
  info: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  unknown: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
}

function getVariant(status: string): StatusVariant {
  if (status in VARIANT_STYLES) return status as StatusVariant
  if (status === 'degraded') return 'warning'
  return 'unknown'
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const variant = getVariant(status)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide',
        VARIANT_STYLES[variant],
        className
      )}
    >
      {label ?? status}
    </span>
  )
}
