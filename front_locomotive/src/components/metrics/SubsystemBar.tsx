import { cn } from '@/utils/cn'
import { subsystemStatusColor } from '@/utils/thresholds'
import type { SubsystemHealth } from '@/types/health'

interface SubsystemBarProps {
  subsystem: SubsystemHealth
}

export function SubsystemBar({ subsystem }: SubsystemBarProps) {
  const { label, healthScore, status, activeAlertCount } = subsystem

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className={cn('h-2 w-2 flex-shrink-0 rounded-full', subsystemStatusColor(status))} />
      <span className="w-24 flex-shrink-0 text-xs text-slate-400">{label}</span>

      {/* Bar */}
      <div className="flex-1 rounded-full bg-slate-800">
        <div
          className={cn('h-1.5 rounded-full transition-all duration-500', subsystemStatusColor(status))}
          style={{ width: `${Math.max(2, healthScore)}%` }}
        />
      </div>

      <span className="w-8 text-right font-mono text-xs text-slate-300">
        {Math.round(healthScore)}
      </span>

      {activeAlertCount > 0 && (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500/20 text-[10px] text-red-400">
          {activeAlertCount}
        </span>
      )}
    </div>
  )
}
