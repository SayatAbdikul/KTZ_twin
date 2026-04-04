import { useState } from 'react'
import { useHealthStore } from "@/features/health/useHealthStore";
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { HealthGauge } from "@/components/metrics/HealthGauge";
import { HealthExplainer } from "@/components/metrics/HealthExplainer";
import { SubsystemBar } from "@/components/metrics/SubsystemBar";
import { DynamicMetricRenderer } from "@/components/metrics/DynamicMetricRenderer";
import { AlertFeed } from "@/components/alerts/AlertFeed";
import { DispatcherInbox } from "@/components/messaging/DispatcherInbox";
import { ExportMenu } from '@/components/common/ExportMenu'
import { SectionHeader } from "@/components/common/SectionHeader";
import { PageContainer } from '@/components/layout/PageContainer'
import { APP_CONFIG } from '@/config/app.config'
import { METRIC_GROUPS } from "@/config/metrics.config";
import { ROUTES } from "@/config/routes";
import { useMetricCatalog } from "@/features/telemetry/metricCatalog";
import { downloadCsv } from '@/utils/exportCsv'
import { printReport, escapeHtml } from '@/utils/exportPdf'
import { formatDate } from '@/utils/formatters'
import type { Alert } from '@/types/alerts'
import type { HealthIndex, SubsystemPenalty } from '@/types/health'
import type { MetricGroup } from "@/types/telemetry";

// Groups shown in the main metrics area
const DASHBOARD_GROUPS: MetricGroup[] = [
  "motion",
  "fuel",
  "thermal",
  "electrical",
];

function formatMetricValue(metricId: string, value: number, definitions: ReturnType<typeof useMetricCatalog>) {
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
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
    )
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
      formatMetricValue(penalty.metricId, penalty.currentValue, definitions),
      `${direction} ${thresholdLabel} (${formatMetricValue(
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

export function DashboardPage() {
  const [isPrinting, setIsPrinting] = useState(false)
  const [isExportingTelemetry, setIsExportingTelemetry] = useState(false)
  const [isExportingAlerts, setIsExportingAlerts] = useState(false)
  const healthIndex = useHealthStore((s) => s.healthIndex);
  const alerts = useAlertStore((s) => s.activeAlerts)
  const alertSummary = useAlertStore((s) => s.summary)
  const metricDefinitions = useMetricCatalog();
  const activeAlerts = alerts.filter((alert) => alert.status !== 'resolved')

  async function handlePrintReport() {
    setIsPrinting(true)
    try {
      await printReport({
        title: 'KTZ Digital Twin Dashboard Report',
        subtitle: 'Live operator dashboard snapshot prepared for browser print-to-PDF.',
        meta: [
          { label: 'Locomotive', value: APP_CONFIG.LOCOMOTIVE_ID },
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-200">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Live locomotive overview for {APP_CONFIG.LOCOMOTIVE_ID}
          </p>
        </div>
        <ExportMenu
          actions={[
            {
              id: 'dashboard-telemetry-csv',
              label: isExportingTelemetry ? 'Exporting Telemetry...' : 'Export Telemetry CSV',
              description: 'Download the raw live telemetry history buffer as CSV.',
              disabled: isExportingTelemetry,
              onSelect: handleTelemetryExport,
            },
            {
              id: 'dashboard-alerts-csv',
              label: isExportingAlerts ? 'Exporting Alerts...' : 'Export Alerts CSV',
              description: 'Download the current alert feed as CSV.',
              disabled: isExportingAlerts,
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      {/* ── Top Left: Health ─────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            {/* Gauge */}
            <div className="flex flex-col items-center justify-center">
              {healthIndex ? (
                <HealthGauge score={healthIndex.overall} size={180} />
              ) : (
                <div className="flex h-[180px] w-[180px] items-center justify-center text-center text-sm text-slate-600">
                  Health data is not currently available.
                </div>
              )}
              <p className="mt-1 text-xs text-slate-500">Overall Health Index</p>
            </div>

            {/* Subsystems */}
            <div className="flex-1">
              <SectionHeader title="Subsystems" />
              {healthIndex ? (
                <div className="flex flex-col">
                  {healthIndex.subsystems.map((sub) => (
                    <SubsystemBar key={sub.subsystemId} subsystem={sub} />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-6 animate-pulse rounded bg-slate-800"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <HealthExplainer healthIndex={healthIndex} />
        </div>

        {/* ── Top Right: Alerts ────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <AlertFeed maxVisible={5} />
        </div>

        {/* ── Bottom Left: Live Metrics ────────────────────────────── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          {DASHBOARD_GROUPS.map((group) => {
            const defs = metricDefinitions.filter((d) => d.group === group).sort(
              (a, b) => a.displayOrder - b.displayOrder,
            );
            return (
              <div key={group} className="mb-5">
                <SectionHeader
                  title={METRIC_GROUPS[group] ?? group}
                  viewAllTo={ROUTES.TELEMETRY}
                />
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4">
                  {defs.map((def) => (
                    <DynamicMetricRenderer key={def.metricId} definition={def} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Bottom Right: Messages ───────────────────────────────── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <DispatcherInbox maxVisible={4} />
        </div>
      </div>
    </PageContainer>
  );
}
