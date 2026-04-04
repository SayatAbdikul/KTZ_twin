import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/utils/cn'
import { relativeTime } from '@/utils/formatters'
import type { Alert } from '@/types/alerts'

interface AlertChipProps {
  alert: Alert
}

const SEVERITY_STYLES = {
  critical: {
    container: 'border-red-500/40 bg-red-500/10',
    icon: 'text-red-400',
    title: 'text-red-300',
    Icon: AlertCircle,
  },
  warning: {
    container: 'border-amber-500/30 bg-amber-500/5',
    icon: 'text-amber-400',
    title: 'text-amber-300',
    Icon: AlertTriangle,
  },
  info: {
    container: 'border-blue-500/30 bg-blue-500/5',
    icon: 'text-blue-400',
    title: 'text-blue-300',
    Icon: Info,
  },
}

export function AlertChip({ alert }: AlertChipProps) {
  const style = SEVERITY_STYLES[alert.severity]
  const { Icon } = style

  return (
    <div className={cn('rounded-lg border p-3', style.container)}>
      <div className="flex items-start gap-2">
        <Icon size={15} className={cn('mt-0.5 flex-shrink-0', style.icon)} />
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium leading-snug', style.title)}>{alert.title}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-slate-500">{alert.source}</span>
            <span className="text-slate-600">·</span>
            <span className="text-xs text-slate-500">{relativeTime(alert.triggeredAt)}</span>
            {alert.status === 'acknowledged' && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-xs text-slate-500">ack</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
