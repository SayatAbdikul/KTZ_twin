import { useAlertStore } from '@/features/alerts/useAlertStore'
import { AlertChip } from './AlertChip'
import { ROUTES } from '@/config/routes'
import { SectionHeader } from '@/components/common/SectionHeader'

interface AlertFeedProps {
  maxVisible?: number
}

export function AlertFeed({ maxVisible = 5 }: AlertFeedProps) {
  // Select raw array (stable ref), compute filter/slice in render body to avoid new-array-per-render loop
  const allAlerts = useAlertStore((s) => s.activeAlerts)
  const alerts = allAlerts.filter((a) => a.status !== 'resolved').slice(0, maxVisible)
  const summary = useAlertStore((s) => s.summary)

  return (
    <div className="flex flex-col">
      <SectionHeader
        title="Active Alerts"
        viewAllTo={ROUTES.ALERTS}
        count={summary.totalActive}
      />

      {alerts.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-700 text-sm text-slate-500">
          No active alerts
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <AlertChip key={alert.alertId} alert={alert} />
          ))}
        </div>
      )}
    </div>
  )
}
