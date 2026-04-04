import { cn } from '@/utils/cn'
import type { ConnectionStatus } from '@/types/connection'

interface ConnectionIndicatorProps {
  label: string
  status: ConnectionStatus
}

const STATUS_CONFIG: Record<ConnectionStatus, { dot: string; text: string }> = {
  connected: { dot: 'bg-emerald-500', text: 'text-emerald-400' },
  connecting: { dot: 'bg-amber-500 animate-pulse', text: 'text-amber-400' },
  disconnected: { dot: 'bg-slate-500', text: 'text-slate-400' },
  error: { dot: 'bg-red-500', text: 'text-red-400' },
}

export function ConnectionIndicator({ label, status }: ConnectionIndicatorProps) {
  const config = STATUS_CONFIG[status]
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('h-2 w-2 rounded-full', config.dot)} />
      <span className={cn('text-xs', config.text)}>{label}</span>
    </div>
  )
}
