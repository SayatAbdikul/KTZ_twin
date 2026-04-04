import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { MetricReading, MetricDefinition, TelemetryFrame } from '@/types/telemetry'
import { APP_CONFIG } from '@/config/app.config'

type SparklinePoint = { timestamp: number; value: number }

interface TelemetryState {
  currentReadings: Map<string, MetricReading>
  metricDefinitions: MetricDefinition[]
  sparklineBuffers: Map<string, SparklinePoint[]>

  applyFrame: (frame: TelemetryFrame) => void
  setDefinitions: (defs: MetricDefinition[]) => void
  getReading: (metricId: string) => MetricReading | undefined
}

export const useTelemetryStore = create<TelemetryState>()(
  devtools(
    (set, get) => ({
      currentReadings: new Map(),
      metricDefinitions: [],
      sparklineBuffers: new Map(),

      applyFrame: (frame) =>
        set((state) => {
          const newReadings = new Map(state.currentReadings)
          const newBuffers = new Map(state.sparklineBuffers)

          for (const reading of frame.readings) {
            newReadings.set(reading.metricId, reading)

            const buffer = newBuffers.get(reading.metricId) ?? []
            const next = [...buffer, { timestamp: reading.timestamp, value: reading.value }]
            if (next.length > APP_CONFIG.SPARKLINE_BUFFER_SIZE) next.shift()
            newBuffers.set(reading.metricId, next)
          }

          return { currentReadings: newReadings, sparklineBuffers: newBuffers }
        }),

      setDefinitions: (defs) => set({ metricDefinitions: defs }),

      getReading: (metricId) => get().currentReadings.get(metricId),
    }),
    { name: 'telemetry-store' }
  )
)
