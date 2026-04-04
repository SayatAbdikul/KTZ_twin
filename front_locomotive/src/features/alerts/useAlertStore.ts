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
  activeAlerts: Alert[]
  summary: AlertSummary

  setAlerts: (alerts: Alert[]) => void
  addAlert: (alert: Alert) => void
  updateAlert: (alert: Alert) => void
  resolveAlert: (alertId: string, resolvedAt: number) => void
}

export const useAlertStore = create<AlertState>()(
  devtools(
    (set) => ({
      activeAlerts: [],
      summary: { criticalCount: 0, warningCount: 0, infoCount: 0, totalActive: 0 },

      setAlerts: (alerts) => {
        const sorted = sortAlerts(alerts)
        set({ activeAlerts: sorted, summary: computeSummary(sorted) })
      },

      addAlert: (alert) =>
        set((s) => {
          const withoutExisting = s.activeAlerts.filter((a) => a.alertId !== alert.alertId)
          const updated = sortAlerts([...withoutExisting, alert])
          return { activeAlerts: updated, summary: computeSummary(updated) }
        }),

      updateAlert: (alert) =>
        set((s) => {
          const updated = s.activeAlerts.map((a) => (a.alertId === alert.alertId ? alert : a))
          const sorted = sortAlerts(updated)
          return { activeAlerts: sorted, summary: computeSummary(sorted) }
        }),

      resolveAlert: (alertId, resolvedAt) =>
        set((s) => {
          const updated = s.activeAlerts.map((a) =>
            a.alertId === alertId ? { ...a, status: 'resolved' as const, resolvedAt } : a
          )
          return { activeAlerts: updated, summary: computeSummary(updated) }
        }),
    }),
    { name: 'alert-store' }
  )
)
