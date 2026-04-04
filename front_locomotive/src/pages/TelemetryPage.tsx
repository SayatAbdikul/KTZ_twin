import { Activity } from 'lucide-react'
import { METRIC_DEFINITIONS, METRIC_GROUPS } from '@/config/metrics.config'
import { DynamicMetricRenderer } from '@/components/metrics/DynamicMetricRenderer'
import { SectionHeader } from '@/components/common/SectionHeader'
import { PageContainer } from '@/components/layout/PageContainer'
import type { MetricGroup } from '@/types/telemetry'

const ALL_GROUPS: MetricGroup[] = ['motion', 'fuel', 'thermal', 'pressure', 'electrical']

export function TelemetryPage() {
  return (
    <PageContainer>
      <div className="mb-4 flex items-center gap-2">
        <Activity size={18} className="text-blue-400" />
        <h1 className="text-base font-semibold text-slate-200">Telemetry</h1>
      </div>

      {ALL_GROUPS.map((group) => {
        const defs = METRIC_DEFINITIONS.filter((d) => d.group === group).sort(
          (a, b) => a.displayOrder - b.displayOrder
        )
        return (
          <div key={group} className="mb-6">
            <SectionHeader title={METRIC_GROUPS[group] ?? group} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {defs.map((def) => (
                <DynamicMetricRenderer key={def.metricId} definition={def} />
              ))}
            </div>
          </div>
        )
      })}
    </PageContainer>
  )
}
