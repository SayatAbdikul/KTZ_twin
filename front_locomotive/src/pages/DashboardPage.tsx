import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { AlertFeed } from '@/components/alerts/AlertFeed'
import { ExportMenu } from '@/components/common/ExportMenu'
import { SectionHeader } from '@/components/common/SectionHeader'
import { StatusBadge } from '@/components/common/StatusBadge'
import { DispatcherInbox } from '@/components/messaging/DispatcherInbox'
import { DynamicMetricRenderer } from '@/components/metrics/DynamicMetricRenderer'
import { HealthExplainer } from '@/components/metrics/HealthExplainer'
import { HealthGauge } from '@/components/metrics/HealthGauge'
import { SubsystemBar } from '@/components/metrics/SubsystemBar'
import { PageContainer } from '@/components/layout/PageContainer'
import { APP_CONFIG } from '@/config/app.config'
import { METRIC_GROUPS } from '@/config/metrics.config'
import { ROUTES } from '@/config/routes'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useAuthStore } from '@/features/auth/useAuthStore'
import { getFleetLocomotiveOptions, useFleetStore, type FleetLocomotiveSummary } from '@/features/fleet/useFleetStore'
import { useHealthStore } from '@/features/health/useHealthStore'
import { useMetricCatalog } from '@/features/telemetry/metricCatalog'
import type { Alert } from '@/types/alerts'
import type { HealthIndex, SubsystemPenalty } from '@/types/health'
import type { MetricGroup } from '@/types/telemetry'
import { cn } from '@/utils/cn'
import { downloadCsv } from '@/utils/exportCsv'
import { escapeHtml, printReport } from '@/utils/exportPdf'
import { formatDate, relativeTime } from '@/utils/formatters'

const DASHBOARD_GROUPS: MetricGroup[] = [
  'motion',
  'fuel',
  'thermal',
  'electrical',
]

function formatCompactValue(value: number | null, suffix: string) {
  if (value === null || Number.isNaN(value)) return '--'
  return `${value.toFixed(0)} ${suffix}`
}

function formatMetricValueForReport(
  metricId: string,
  value: number,
  definitions: ReturnType<typeof useMetricCatalog>
) {
  const definition = definitions.find((item) => item.metricId === metricId)
  const precision = definition?.precision ?? 1
  const unit = definition?.unit ?? ''
  return `${value.toFixed(precision)}${unit ? ` ${unit}` : ''}`
}

function renderPrintTable(headers: string[], rows: string[][], emptyText: string) {
  if (rows.length === 0) {
    return `<div class="empty-state">${escapeHtml(emptyText)}</div>`
  }

  const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')
  const rowHtml = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')

  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowHtml}</tbody></table>`
}

function renderSubsystemRows(healthIndex: HealthIndex | null) {
  if (!healthIndex) {
    return []
  }

  return healthIndex.subsystems.map((subsystem) => [
    subsystem.label,
    subsystem.status,
    subsystem.healthScore.toFixed(0),
    String(subsystem.activeAlertCount),
  ])
}

function renderTopFactorRows(
  penalties: SubsystemPenalty[],
  definitions: ReturnType<typeof useMetricCatalog>
) {
  return penalties.map((penalty) => {
    const direction = penalty.thresholdType.endsWith('High') ? 'Above' : 'Below'
    const thresholdLabel = penalty.thresholdType.startsWith('critical') ? 'Critical' : 'Warning'
    return [
      penalty.metricLabel,
      formatMetricValueForReport(penalty.metricId, penalty.currentValue, definitions),
      `${direction} ${thresholdLabel} (${formatMetricValueForReport(
        penalty.metricId,
        penalty.thresholdValue,
        definitions
      )})`,
      `-${penalty.penaltyPoints.toFixed(0)}`,
    ]
  })
}

function renderAlertRows(alerts: Alert[]) {
  return alerts.map((alert) => [
    alert.severity,
    alert.status,
    alert.title,
    alert.source,
    formatDate(alert.triggeredAt),
    alert.description,
  ])
}

function FleetHealthCard({
  summary,
  selected,
  onSelect,
}: {
  summary: FleetLocomotiveSummary
  selected: boolean
  onSelect: () => void
}) {
  const latestUpdateAt = summary.latestHealthAt ?? summary.latestTelemetryAt

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'rounded-2xl border p-4 text-left transition-all',
        selected
          ? 'border-blue-500/60 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]'
          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Locomotive</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">{summary.locomotiveId}</div>
        </div>
        <StatusBadge status={summary.healthStatus} label={summary.connected ? 'Live' : 'Offline'} />
      </div>

      <div className="mt-4 flex items-center gap-4">
        <HealthGauge score={summary.healthScore ?? 0} size={104} />
        <div className="grid flex-1 grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Health</div>
            <div className="mt-1 font-mono text-xl text-slate-100">
              {summary.healthScore?.toFixed(0) ?? '--'}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Alerts</div>
            <div className="mt-1 font-mono text-xl text-slate-100">{summary.activeAlertCount}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Speed</div>
            <div className="mt-1 text-slate-100">{formatCompactValue(summary.speedKmh, 'km/h')}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Fuel</div>
            <div className="mt-1 text-slate-100">{formatCompactValue(summary.fuelLevel, '%')}</div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>Coolant {formatCompactValue(summary.coolantTemp, 'C')}</span>
        <span>{latestUpdateAt ? relativeTime(latestUpdateAt) : 'Awaiting data'}</span>
      </div>
    </button>
  )
}

function LocomotiveDetailPanel({
  healthIndex,
  selectedSummary,
  metricDefinitions,
}: {
  healthIndex: HealthIndex | null
  selectedSummary: FleetLocomotiveSummary | null
  metricDefinitions: ReturnType<typeof useMetricCatalog>
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex flex-col items-center justify-center">
            {healthIndex ? (
              <HealthGauge score={healthIndex.overall} size={180} />
            ) : (
              <div className="flex h-[180px] w-[180px] items-center justify-center text-center text-sm text-slate-600">
                Select a locomotive with live health data.
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {selectedSummary?.locomotiveId ?? 'No locomotive selected'}
            </p>
          </div>

          <div className="flex-1">
            <SectionHeader
              title={selectedSummary ? `${selectedSummary.locomotiveId} Subsystems` : 'Subsystems'}
            />
            {healthIndex ? (
              <div className="flex flex-col">
                {healthIndex.subsystems.map((sub) => (
                  <SubsystemBar key={sub.subsystemId} subsystem={sub} />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-6 animate-pulse rounded bg-slate-800" />
                ))}
              </div>
            )}
          </div>
        </div>

        <HealthExplainer healthIndex={healthIndex} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <AlertFeed maxVisible={5} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        {DASHBOARD_GROUPS.map((group) => {
          const defs = metricDefinitions
            .filter((d) => d.group === group)
            .sort((a, b) => a.displayOrder - b.displayOrder)
          return (
            <div key={group} className="mb-5">
              <SectionHeader title={METRIC_GROUPS[group] ?? group} viewAllTo={ROUTES.TELEMETRY} />
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4">
                {defs.map((def) => (
                  <DynamicMetricRenderer key={def.metricId} definition={def} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <DispatcherInbox maxVisible={4} />
      </div>
    </div>
  )
}

export function DashboardPage() {
  const [isPrinting, setIsPrinting] = useState(false)
  const [isExportingTelemetry, setIsExportingTelemetry] = useState(false)
  const [isExportingAlerts, setIsExportingAlerts] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const user = useAuthStore((s) => s.user)
  const locomotives = useFleetStore((s) => s.locomotives)
  const selectedLocomotiveId = useFleetStore((s) => s.selectedLocomotiveId)
  const selectLocomotive = useFleetStore((s) => s.selectLocomotive)
  const healthByLocomotive = useHealthStore((s) => s.byLocomotive)
  const alertsByLocomotive = useAlertStore((s) => s.alertsByLocomotive)
  const summaryByLocomotive = useAlertStore((s) => s.summaryByLocomotive)
  const metricDefinitions = useMetricCatalog()

  const isTrainUser = user?.role === 'regular_train'
  const trainLocomotiveId = user?.locomotiveId ?? null
  const locomotiveIds = useMemo(() => getFleetLocomotiveOptions(locomotives), [locomotives])
  const visibleLocomotiveIds = useMemo(() => {
    if (!isTrainUser || !trainLocomotiveId) return locomotiveIds
    return locomotiveIds.filter((locomotiveId) => locomotiveId === trainLocomotiveId)
  }, [isTrainUser, locomotiveIds, trainLocomotiveId])

  const effectiveSelectedLocomotiveId = isTrainUser
    ? trainLocomotiveId ?? selectedLocomotiveId
    : selectedLocomotiveId

  const selectedSummary = effectiveSelectedLocomotiveId
    ? locomotives[effectiveSelectedLocomotiveId] ?? null
    : null
  const healthIndex = effectiveSelectedLocomotiveId
    ? healthByLocomotive[effectiveSelectedLocomotiveId] ?? null
    : null
  const alerts = effectiveSelectedLocomotiveId ? alertsByLocomotive[effectiveSelectedLocomotiveId] ?? [] : []
  const alertSummary = effectiveSelectedLocomotiveId
    ? summaryByLocomotive[effectiveSelectedLocomotiveId] ?? { criticalCount: 0, warningCount: 0, infoCount: 0, totalActive: 0 }
    : { criticalCount: 0, warningCount: 0, infoCount: 0, totalActive: 0 }
  const activeAlerts = alerts.filter((alert) => alert.status !== 'resolved')
  const canExportServiceCsv =
    effectiveSelectedLocomotiveId === null || effectiveSelectedLocomotiveId === APP_CONFIG.LOCOMOTIVE_ID

  async function handlePrintReport() {
    setIsPrinting(true)
    try {
      await printReport({
        title: 'KTZ Digital Twin Dashboard Report',
        subtitle: 'Live operator dashboard snapshot prepared for browser print-to-PDF.',
        meta: [
          { label: 'Locomotive', value: selectedSummary?.locomotiveId ?? APP_CONFIG.LOCOMOTIVE_ID },
          { label: 'Generated At', value: formatDate(Date.now()) },
          {
            label: 'Overall Health',
            value: healthIndex ? `${healthIndex.overall.toFixed(0)} / 100` : 'Unavailable',
          },
        ],
        sections: [
          {
            title: 'Subsystem Breakdown',
            html: renderPrintTable(
              ['Subsystem', 'Status', 'Health Score', 'Active Alerts'],
              renderSubsystemRows(healthIndex),
              'Health data is not currently available.'
            ),
          },
          {
            title: 'Top Contributing Factors',
            html: renderPrintTable(
              ['Metric', 'Current Value', 'Threshold Reference', 'Penalty'],
              renderTopFactorRows(healthIndex?.topFactors ?? [], metricDefinitions),
              'No active threshold penalties.'
            ),
          },
          {
            title: 'Active Alerts',
            html: `
              <div class="summary-grid">
                <div class="summary-pill severity-critical">${alertSummary.criticalCount} critical</div>
                <div class="summary-pill severity-warning">${alertSummary.warningCount} warning</div>
                <div class="summary-pill severity-info">${alertSummary.infoCount} info</div>
                <div class="summary-pill">${alertSummary.totalActive} total active</div>
              </div>
              ${renderPrintTable(
                ['Severity', 'Status', 'Title', 'Source', 'Triggered At', 'Description'],
                renderAlertRows(activeAlerts),
                'No active alerts.'
              )}
            `,
          },
        ],
      })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to open the print report.')
    } finally {
      setIsPrinting(false)
    }
  }

  async function handleTelemetryExport() {
    setIsExportingTelemetry(true)
    try {
      await downloadCsv({
        path: '/api/export/telemetry/csv',
        fallbackFilename: 'telemetry.csv',
      })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to export telemetry CSV.')
    } finally {
      setIsExportingTelemetry(false)
    }
  }

  async function handleAlertsExport() {
    setIsExportingAlerts(true)
    try {
      await downloadCsv({
        path: '/api/export/alerts/csv',
        fallbackFilename: 'alerts.csv',
      })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to export alerts CSV.')
    } finally {
      setIsExportingAlerts(false)
    }
  }

  return (
    <PageContainer className="space-y-4">
      {!isTrainUser ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-semibold text-slate-100">Fleet Health Dashboard</h1>
              <p className="text-sm text-slate-500">
                Live Kafka-fed locomotive scores. Click any locomotive to inspect its details.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-400">
                {visibleLocomotiveIds.length} active ids
              </div>
              <ExportMenu
                actions={[
                  {
                    id: 'dashboard-telemetry-csv',
                    label: isExportingTelemetry ? 'Exporting Telemetry...' : 'Export Telemetry CSV',
                    description: canExportServiceCsv
                      ? 'Download the raw live telemetry history buffer as CSV.'
                      : `CSV export is only available for ${APP_CONFIG.LOCOMOTIVE_ID}.`,
                    disabled: isExportingTelemetry || !canExportServiceCsv,
                    onSelect: handleTelemetryExport,
                  },
                  {
                    id: 'dashboard-alerts-csv',
                    label: isExportingAlerts ? 'Exporting Alerts...' : 'Export Alerts CSV',
                    description: canExportServiceCsv
                      ? 'Download the current alert feed as CSV.'
                      : `CSV export is only available for ${APP_CONFIG.LOCOMOTIVE_ID}.`,
                    disabled: isExportingAlerts || !canExportServiceCsv,
                    onSelect: handleAlertsExport,
                  },
                  {
                    id: 'dashboard-print',
                    label: isPrinting ? 'Preparing Report...' : 'Print Report',
                    description: 'Open a print-friendly dashboard report for Save as PDF.',
                    disabled: isPrinting,
                    onSelect: handlePrintReport,
                  },
                ]}
              />
            </div>
          </div>

          {visibleLocomotiveIds.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm text-slate-500">
              Waiting for dispatcher snapshots from Kafka-connected locomotives.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {visibleLocomotiveIds.map((locomotiveId) => (
                <FleetHealthCard
                  key={locomotiveId}
                  summary={locomotives[locomotiveId]}
                  selected={effectiveSelectedLocomotiveId === locomotiveId}
                  onSelect={() => {
                    selectLocomotive(locomotiveId)
                    setIsDetailModalOpen(true)
                  }}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {isTrainUser ? (
        <LocomotiveDetailPanel
          healthIndex={healthIndex}
          selectedSummary={selectedSummary}
          metricDefinitions={metricDefinitions}
        />
      ) : null}

      {!isTrainUser && isDetailModalOpen ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            aria-label="Close locomotive details"
            onClick={() => setIsDetailModalOpen(false)}
          />
          <section className="absolute inset-x-4 top-6 bottom-6 z-50 overflow-hidden rounded-2xl border border-slate-700 bg-[#0b0e15] p-4 shadow-2xl lg:inset-x-8 xl:inset-x-16">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Locomotive Detail</p>
                <h2 className="text-lg font-semibold text-slate-100">
                  {selectedSummary?.locomotiveId ?? 'No locomotive selected'}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                onClick={() => setIsDetailModalOpen(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="h-[calc(100%-3.5rem)] overflow-y-auto pr-1">
              <LocomotiveDetailPanel
                healthIndex={healthIndex}
                selectedSummary={selectedSummary}
                metricDefinitions={metricDefinitions}
              />
            </div>
          </section>
        </div>
      ) : null}
    </PageContainer>
  )
}
