import { AlertTriangle } from 'lucide-react'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { AlertChip } from '@/components/alerts/AlertChip'
import { PageContainer } from '@/components/layout/PageContainer'

export function AlertsPage() {
  const alerts = useAlertStore((s) => s.activeAlerts)
  const summary = useAlertStore((s) => s.summary)

  return (
    <PageContainer>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-400" />
          <h1 className="text-base font-semibold text-slate-200">Alerts</h1>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="text-red-400">{summary.criticalCount} critical</span>
          <span className="text-amber-400">{summary.warningCount} warning</span>
          <span className="text-blue-400">{summary.infoCount} info</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {alerts.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-700 text-slate-500">
            No alerts
          </div>
        ) : (
          alerts.map((alert) => <AlertChip key={alert.alertId} alert={alert} />)
        )}
      </div>
    </PageContainer>
  )
}
