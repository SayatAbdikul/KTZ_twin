import { useState, useEffect } from 'react'
import { APP_CONFIG } from '@/config/app.config'
import { useConnectionStore } from '@/features/connection/useConnectionStore'
import { ConnectionIndicator } from '@/components/common/ConnectionIndicator'
import { formatTimestamp } from '@/utils/formatters'

export function TopBar() {
  const [time, setTime] = useState(() => formatTimestamp(Date.now()))
  const backendStatus = useConnectionStore((s) => s.backendStatus)
  const dispatcherStatus = useConnectionStore((s) => s.dispatcherStatus)

  useEffect(() => {
    const timer = setInterval(() => setTime(formatTimestamp(Date.now())), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="flex h-12 items-center justify-between border-b border-slate-800 bg-[#0c0e14] px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-200">{APP_CONFIG.LOCOMOTIVE_ID}</span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
          Operational
        </span>
      </div>

      <div className="flex items-center gap-4">
        <ConnectionIndicator label="Backend" status={backendStatus} />
        <ConnectionIndicator label="Dispatcher" status={dispatcherStatus} />
        <span className="font-mono text-sm text-slate-300">{time}</span>
      </div>
    </header>
  )
}
