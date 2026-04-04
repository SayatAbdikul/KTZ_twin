import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { AlertChip } from '@/components/alerts/AlertChip'
import { ExportMenu } from '@/components/common/ExportMenu'
import { PageContainer } from '@/components/layout/PageContainer'
import { downloadCsv } from '@/utils/exportCsv'

export function AlertsPage() {
  const [isExporting, setIsExporting] = useState(false)
  const alerts = useAlertStore((s) => s.activeAlerts)
  const summary = useAlertStore((s) => s.summary)

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
                description: 'Download the current alert feed as CSV.',
                disabled: isExporting,
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
