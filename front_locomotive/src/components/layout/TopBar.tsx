import { useState, useEffect } from 'react'
import { LogOut, Waves } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { resetSessionState } from '@/app/resetSessionState'
import { useConnectionStore } from '@/features/connection/useConnectionStore'
import { useAuthStore } from '@/features/auth/useAuthStore'
import { getFleetLocomotiveOptions, useFleetStore } from '@/features/fleet/useFleetStore'
import { useSettingsStore } from '@/features/settings/useSettingsStore'
import { ConnectionIndicator } from '@/components/common/ConnectionIndicator'
import { StatusBadge } from '@/components/common/StatusBadge'
import { ROUTES } from '@/config/routes'
import { logoutSession } from '@/services/api/authApi'
import { disconnectWebSocket } from '@/services/websocket/wsClient'
import { formatTimestamp } from '@/utils/formatters'
import { cn } from '@/utils/cn'

export function TopBar() {
  const navigate = useNavigate()
  const [time, setTime] = useState(() => formatTimestamp(Date.now()))
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const clearSession = useAuthStore((s) => s.clearSession)
  const backendStatus = useConnectionStore((s) => s.backendStatus)
  const dispatcherStatus = useConnectionStore((s) => s.dispatcherStatus)
  const smoothingEnabled = useSettingsStore((s) => s.smoothingEnabled)
  const toggleSmoothing = useSettingsStore((s) => s.toggleSmoothing)
  const selectedLocomotiveId = useFleetStore((s) => s.selectedLocomotiveId)
  const locomotives = useFleetStore((s) => s.locomotives)
  const selectLocomotive = useFleetStore((s) => s.selectLocomotive)
  const locomotiveOptions = getFleetLocomotiveOptions(locomotives)
  const selectedLocomotive = selectedLocomotiveId ? locomotives[selectedLocomotiveId] : null
  const isTrainUser = user?.role === 'train'

  useEffect(() => {
    const timer = setInterval(() => setTime(formatTimestamp(Date.now())), 1000)
    return () => clearInterval(timer)
  }, [])

  async function handleLogout() {
    await logoutSession(accessToken)
    disconnectWebSocket()
    resetSessionState()
    clearSession()
    navigate(ROUTES.LOGIN, { replace: true })
  }

  return (
    <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#0c0e14] px-4 py-2">
      <div className="flex items-center gap-3">
        {isTrainUser ? (
          <div className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-slate-200">
            {user.locomotiveId ?? selectedLocomotiveId ?? 'Train'}
          </div>
        ) : (
          <select
            value={selectedLocomotiveId ?? ''}
            onChange={(event) => selectLocomotive(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-slate-200 outline-none transition-colors focus:border-blue-500"
            disabled={locomotiveOptions.length === 0}
            aria-label="Select locomotive"
          >
            {locomotiveOptions.length === 0 ? (
              <option value="">Waiting for locomotive stream</option>
            ) : (
              locomotiveOptions.map((locomotiveId) => (
                <option key={locomotiveId} value={locomotiveId}>
                  {locomotiveId}
                </option>
              ))
            )}
          </select>
        )}
        <StatusBadge
          status={selectedLocomotive?.healthStatus ?? 'unknown'}
          label={selectedLocomotive?.connected ? 'Live' : 'Offline'}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4">
        <div className="hidden rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 sm:block">
          {user?.role === 'train' ? user.locomotiveId : user?.username}
        </div>
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
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">Logout</span>
        </button>
        <span className="font-mono text-sm text-slate-300">{time}</span>
      </div>
    </header>
  )
}
