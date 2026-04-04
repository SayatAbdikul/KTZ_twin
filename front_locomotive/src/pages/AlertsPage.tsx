import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { AlertChip } from '@/components/alerts/AlertChip'
import { ExportMenu } from '@/components/common/ExportMenu'
import { PageContainer } from '@/components/layout/PageContainer'
import { APP_CONFIG } from '@/config/app.config'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import type { Alert, AlertSummary } from '@/types/alerts'
import { downloadCsv } from '@/utils/exportCsv'

const EMPTY_ALERTS: Alert[] = []
const EMPTY_ALERT_SUMMARY: AlertSummary = {
  criticalCount: 0,
  warningCount: 0,
  infoCount: 0,
  totalActive: 0,
}

export function AlertsPage() {
  const [isExporting, setIsExporting] = useState(false)
  const selectedLocomotiveId = useFleetStore((s) => s.selectedLocomotiveId)
  const alertsByLocomotive = useAlertStore((s) => s.alertsByLocomotive)
  const summaryByLocomotive = useAlertStore((s) => s.summaryByLocomotive)
  const alerts = selectedLocomotiveId
    ? alertsByLocomotive[selectedLocomotiveId] ?? EMPTY_ALERTS
    : EMPTY_ALERTS
  const summary = selectedLocomotiveId
    ? summaryByLocomotive[selectedLocomotiveId] ?? EMPTY_ALERT_SUMMARY
    : EMPTY_ALERT_SUMMARY
  const canExportCsv =
    selectedLocomotiveId === null || selectedLocomotiveId === APP_CONFIG.LOCOMOTIVE_ID

  async function handleAlertsExport() {
    setIsExporting(true)
    try {
      await downloadCsv({
        path: '/api/export/alerts/csv',
        fallbackFilename: 'alerts.csv',
      })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to export alerts CSV.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <PageContainer>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-400" />
          <h1 className="text-base font-semibold text-slate-200">Alerts</h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex gap-3 text-xs">
            <span className="text-red-400">{summary.criticalCount} critical</span>
            <span className="text-amber-400">{summary.warningCount} warning</span>
            <span className="text-blue-400">{summary.infoCount} info</span>
          </div>
          <ExportMenu
            actions={[
              {
                id: 'alerts-csv',
                label: isExporting ? 'Exporting CSV...' : 'Export CSV',
                description: canExportCsv
                  ? 'Download the current alert feed as CSV.'
                  : `CSV export is only available for ${APP_CONFIG.LOCOMOTIVE_ID}.`,
                disabled: isExporting || !canExportCsv,
                onSelect: handleAlertsExport,
              },
            ]}
          />
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
