import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { AlertChip } from './AlertChip'
import { ROUTES } from '@/config/routes'
import { SectionHeader } from '@/components/common/SectionHeader'
import type { Alert, AlertSummary } from '@/types/alerts'

interface AlertFeedProps {
  maxVisible?: number
}

const EMPTY_ALERTS: Alert[] = []
const EMPTY_ALERT_SUMMARY: AlertSummary = {
  criticalCount: 0,
  warningCount: 0,
  infoCount: 0,
  totalActive: 0,
}

export function AlertFeed({ maxVisible = 5 }: AlertFeedProps) {
  const selectedLocomotiveId = useFleetStore((s) => s.selectedLocomotiveId)
  const alertsByLocomotive = useAlertStore((s) => s.alertsByLocomotive)
  const summaryByLocomotive = useAlertStore((s) => s.summaryByLocomotive)
  const allAlerts = selectedLocomotiveId
    ? alertsByLocomotive[selectedLocomotiveId] ?? EMPTY_ALERTS
    : EMPTY_ALERTS
  const alerts = allAlerts.filter((a) => a.status !== 'resolved').slice(0, maxVisible)
  const summary = selectedLocomotiveId
    ? summaryByLocomotive[selectedLocomotiveId] ?? EMPTY_ALERT_SUMMARY
    : EMPTY_ALERT_SUMMARY

  return (
    <div className="flex flex-col">
      <SectionHeader
        title="Активные оповещения"
        viewAllTo={ROUTES.ALERTS}
        count={summary.totalActive}
      />

      {alerts.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-700 text-sm text-slate-500">
          Активных оповещений нет
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
