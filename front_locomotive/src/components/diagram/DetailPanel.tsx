import { X } from 'lucide-react'
import { StatusBadge } from '@/components/common/StatusBadge'
import { SubsystemBar } from '@/components/metrics/SubsystemBar'
import { DynamicMetricRenderer } from '@/components/metrics/DynamicMetricRenderer'
import { AlertChip } from '@/components/alerts/AlertChip'
import { SectionHeader } from '@/components/common/SectionHeader'
import { DetailPanelEmpty } from './DetailPanelEmpty'
import { useDiagramData } from '@/hooks/useDiagramData'
import { ZONE_BY_ID } from '@/config/diagram.config'

interface DetailPanelProps {
  selectedZoneId: string | null
  onClose: () => void
}

export function DetailPanel({ selectedZoneId, onClose }: DetailPanelProps) {
  const zone = selectedZoneId ? (ZONE_BY_ID[selectedZoneId] ?? null) : null
  const { subsystem, definitions, alerts, alertCount } = useDiagramData(zone)

  if (!zone) {
    return <DetailPanelEmpty />
  }

  const status = subsystem?.status ?? (zone.subsystemId ? 'unknown' : 'info')

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60"
      aria-live="polite"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-slate-100">{zone.label}</h2>
          <StatusBadge status={status} />
        </div>
        <button
          onClick={onClose}
          aria-label="Закрыть панель деталей"
          className="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Health */}
        {subsystem && (
          <div>
            <SectionHeader title="Состояние" />
            <SubsystemBar subsystem={subsystem} />
          </div>
        )}

        {/* Live Metrics */}
        <div>
          <SectionHeader title="Текущие метрики" count={definitions.length} />
          <div className="mt-2 grid grid-cols-1 gap-2">
            {definitions.map((def) => (
              <DynamicMetricRenderer key={def.metricId} definition={def} />
            ))}
          </div>
        </div>

        {/* Active Alerts */}
        <div>
          <SectionHeader title="Активные оповещения" count={alertCount > 0 ? alertCount : undefined} />
          {alerts.length === 0 ? (
            <div className="mt-2 rounded-lg border border-dashed border-slate-700 py-4 text-center text-xs text-slate-600">
              Активных оповещений нет
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {alerts.map((alert) => (
                <AlertChip key={alert.alertId} alert={alert} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
