import { useState, useEffect } from 'react'
import { Waves } from 'lucide-react'
import { APP_CONFIG } from '@/config/app.config'
import { useConnectionStore } from '@/features/connection/useConnectionStore'
import { useSettingsStore } from '@/features/settings/useSettingsStore'
import { ConnectionIndicator } from '@/components/common/ConnectionIndicator'
import { formatTimestamp } from '@/utils/formatters'
import { cn } from '@/utils/cn'

export function TopBar() {
  const [time, setTime] = useState(() => formatTimestamp(Date.now()))
  const backendStatus = useConnectionStore((s) => s.backendStatus)
  const dispatcherStatus = useConnectionStore((s) => s.dispatcherStatus)
  const smoothingEnabled = useSettingsStore((s) => s.smoothingEnabled)
  const toggleSmoothing = useSettingsStore((s) => s.toggleSmoothing)

  useEffect(() => {
    const timer = setInterval(() => setTime(formatTimestamp(Date.now())), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#0c0e14] px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-200">{APP_CONFIG.LOCOMOTIVE_ID}</span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
          Operational
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4">
        <ConnectionIndicator label="Backend" status={backendStatus} />
        <ConnectionIndicator label="Dispatcher" status={dispatcherStatus} />
        <button
          type="button"
          onClick={toggleSmoothing}
          aria-label={smoothingEnabled ? 'Disable telemetry smoothing' : 'Enable telemetry smoothing'}
          aria-pressed={smoothingEnabled}
          title={smoothingEnabled ? 'Disable telemetry smoothing' : 'Enable telemetry smoothing'}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
            smoothingEnabled
              ? 'border-blue-500/60 bg-blue-500/15 text-blue-300'
              : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200'
          )}
        >
          <Waves size={14} />
          <span className="hidden sm:inline">Smooth</span>
        </button>
        <span className="font-mono text-sm text-slate-300">{time}</span>
      </div>
    </header>
  )
}
