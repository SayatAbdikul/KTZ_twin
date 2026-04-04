import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Alert, AlertSummary } from '@/types/alerts'

const SEVERITY_ORDER: Record<Alert['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    const sd = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sd !== 0) return sd
    return b.triggeredAt - a.triggeredAt
  })
}

function computeSummary(alerts: Alert[]): AlertSummary {
  const active = alerts.filter((a) => a.status !== 'resolved')
  return {
    criticalCount: active.filter((a) => a.severity === 'critical').length,
    warningCount: active.filter((a) => a.severity === 'warning').length,
    infoCount: active.filter((a) => a.severity === 'info').length,
    totalActive: active.length,
  }
}

interface AlertState {
  alertsByLocomotive: Record<string, Alert[]>
  summaryByLocomotive: Record<string, AlertSummary>

  setAlerts: (locomotiveId: string, alerts: Alert[]) => void
  addAlert: (alert: Alert) => void
  updateAlert: (alert: Alert) => void
  resolveAlert: (locomotiveId: string, alertId: string, resolvedAt: number) => void
}

export const useAlertStore = create<AlertState>()(
  devtools(
    (set) => ({
      alertsByLocomotive: {},
      summaryByLocomotive: {},

      setAlerts: (locomotiveId, alerts) => {
        const sorted = sortAlerts(alerts)
        set((state) => ({
          alertsByLocomotive: {
            ...state.alertsByLocomotive,
            [locomotiveId]: sorted,
          },
          summaryByLocomotive: {
            ...state.summaryByLocomotive,
            [locomotiveId]: computeSummary(sorted),
          },
        }))
      },

      addAlert: (alert) =>
        set((s) => {
          const previous = s.alertsByLocomotive[alert.locomotiveId] ?? []
          const withoutExisting = previous.filter((a) => a.alertId !== alert.alertId)
          const updated = sortAlerts([...withoutExisting, alert])
          return {
            alertsByLocomotive: {
              ...s.alertsByLocomotive,
              [alert.locomotiveId]: updated,
            },
            summaryByLocomotive: {
              ...s.summaryByLocomotive,
              [alert.locomotiveId]: computeSummary(updated),
            },
          }
        }),

      updateAlert: (alert) =>
        set((s) => {
          const previous = s.alertsByLocomotive[alert.locomotiveId] ?? []
          const updated = previous.some((a) => a.alertId === alert.alertId)
            ? previous.map((a) => (a.alertId === alert.alertId ? alert : a))
            : [...previous, alert]
          const sorted = sortAlerts(updated)
          return {
            alertsByLocomotive: {
              ...s.alertsByLocomotive,
              [alert.locomotiveId]: sorted,
            },
            summaryByLocomotive: {
              ...s.summaryByLocomotive,
              [alert.locomotiveId]: computeSummary(sorted),
            },
          }
        }),

      resolveAlert: (locomotiveId, alertId, resolvedAt) =>
        set((s) => {
          const previous = s.alertsByLocomotive[locomotiveId] ?? []
          const updated = previous.map((a) =>
            a.alertId === alertId ? { ...a, status: 'resolved' as const, resolvedAt } : a
          )
          return {
            alertsByLocomotive: {
              ...s.alertsByLocomotive,
              [locomotiveId]: updated,
            },
            summaryByLocomotive: {
              ...s.summaryByLocomotive,
              [locomotiveId]: computeSummary(updated),
            },
          }
        }),
    }),
    { name: 'alert-store' }
  )
)
