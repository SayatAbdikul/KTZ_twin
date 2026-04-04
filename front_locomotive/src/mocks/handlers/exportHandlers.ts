import { delay, http, HttpResponse } from 'msw'
import { METRIC_DEFINITIONS } from '@/config/metrics.config'
import { INITIAL_ALERTS } from '../data/alertFixtures'

const MOCK_EXPORT_TS = Date.parse('2026-04-05T10:00:00.000Z')
const ALERT_SEVERITY_ORDER = {
  critical: 0,
  warning: 1,
  info: 2,
} as const

function toIso(timestamp: number) {
  return new Date(timestamp).toISOString()
}

function escapeCsvValue(value: string | number) {
  const text = String(value)
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function toCsv(rows: Array<Array<string | number>>) {
  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
}

function buildTelemetryCsv() {
  const headers = [
    'locomotiveId',
    'timestampMs',
    'timestampIso',
    'metricId',
    'metricLabel',
    'metricGroup',
    'value',
    'unit',
  ]

  const rows = METRIC_DEFINITIONS.slice()
    .sort((left, right) => left.metricId.localeCompare(right.metricId))
    .flatMap((definition) => {
      const midpoint = (definition.min + definition.max) / 2
      return Array.from({ length: 6 }).map((_, index) => {
        const timestamp = MOCK_EXPORT_TS - (5 - index) * 60_000
        const wave = Math.sin((index + 1) * 0.8) * (definition.max - definition.min) * 0.03
        const value = Number((midpoint + wave).toFixed(definition.precision))

        return [
          'KTZ-2001',
          timestamp,
          toIso(timestamp),
          definition.metricId,
          definition.label,
          definition.group,
          value,
          definition.unit,
        ]
      })
    })

  return toCsv([headers, ...rows])
}

function buildAlertsCsv() {
  const headers = [
    'alertId',
    'severity',
    'status',
    'source',
    'title',
    'description',
    'recommendedAction',
    'triggeredAtMs',
    'triggeredAtIso',
    'acknowledgedAtMs',
    'acknowledgedBy',
    'resolvedAtMs',
    'relatedMetricIds',
  ]

  const rows = INITIAL_ALERTS.slice()
    .sort((left, right) => {
      const severityDelta = ALERT_SEVERITY_ORDER[left.severity] - ALERT_SEVERITY_ORDER[right.severity]
      if (severityDelta !== 0) {
        return severityDelta
      }
      return right.triggeredAt - left.triggeredAt
    })
    .map((alert) => [
      alert.alertId,
      alert.severity,
      alert.status,
      alert.source,
      alert.title,
      alert.description,
      alert.recommendedAction ?? '',
      alert.triggeredAt,
      toIso(alert.triggeredAt),
      alert.acknowledgedAt ?? '',
      alert.acknowledgedBy ?? '',
      alert.resolvedAt ?? '',
      alert.relatedMetricIds.join(','),
    ])

  return toCsv([headers, ...rows])
}

export const exportHandlers = [
  http.get('/api/export/telemetry/csv', async () => {
    await delay(60)
    return new HttpResponse(buildTelemetryCsv(), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="KTZ-2001_telemetry_mock.csv"',
      },
    })
  }),

  http.get('/api/export/alerts/csv', async () => {
    await delay(60)
    return new HttpResponse(buildAlertsCsv(), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="KTZ-2001_alerts_mock.csv"',
      },
    })
  }),
]
