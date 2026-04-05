import { AlertTriangle, Gauge, History } from 'lucide-react'
import type { ReplaySnapshot } from '@/types/replay'
import { severityToBg } from '@/utils/thresholds'

interface ReplaySnapshotSummaryProps {
  snapshot: ReplaySnapshot | null
}

function formatTimestamp(timestamp: number | null): string {
  if (timestamp === null) return 'Нет снимка'
  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp)
}

export function ReplaySnapshotSummary({ snapshot }: ReplaySnapshotSummaryProps) {
  const activeAlerts = snapshot?.alerts ?? []

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Снимок</p>
        <h2 className="text-sm font-semibold text-slate-100">Состояние в точке маркера</h2>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <div className="mb-1 flex items-center gap-2 text-slate-300">
            <History size={14} />
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Время</span>
          </div>
          <div className="text-sm text-slate-100">
            {formatTimestamp(snapshot?.timestamp ?? null)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <div className="mb-1 flex items-center gap-2 text-slate-300">
            <Gauge size={14} />
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Состояние</span>
          </div>
          <div className="text-2xl font-semibold text-slate-100">
            {snapshot?.health ? snapshot.health.overall.toFixed(0) : '—'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-slate-300">
            <AlertTriangle size={14} />
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Активные оповещения</span>
          </div>

          {activeAlerts.length > 0 ? (
            <div className="space-y-2">
              {activeAlerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.alertId}
                  className={`rounded-lg border px-3 py-2 text-sm ${severityToBg(alert.severity)}`}
                >
                  <div className="font-medium">{alert.title}</div>
                  <div className="mt-1 text-xs opacity-80">{alert.source}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">В этой точке времени активных оповещений нет.</div>
          )}
        </div>
      </div>
    </section>
  )
}
