import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { MetricReading, MetricDefinition, TelemetryFrame } from '@/types/telemetry'
import { APP_CONFIG } from '@/config/app.config'
import { ema } from '@/utils/smoothing'
import { useSettingsStore } from '@/features/settings/useSettingsStore'

type SparklinePoint = { timestamp: number; value: number }
const NON_SMOOTHING_QUALITIES = new Set<MetricReading['quality']>(['stale', 'bad'])

function appendPoint(
  buffers: Map<string, SparklinePoint[]>,
  metricId: string,
  point: SparklinePoint,
  limit: number
) {
  const existing = buffers.get(metricId) ?? []
  const next = [...existing, point]
  if (next.length > limit) next.shift()
  buffers.set(metricId, next)
}

interface TelemetryState {
  currentReadings: Map<string, MetricReading>
  smoothedReadings: Map<string, MetricReading>
  metricDefinitions: MetricDefinition[]
  sparklineBuffers: Map<string, SparklinePoint[]>
  smoothedSparklineBuffers: Map<string, SparklinePoint[]>
  trendBuffers: Map<string, SparklinePoint[]>
  smoothedTrendBuffers: Map<string, SparklinePoint[]>
  smoothingBaselines: Map<string, number>

  applyFrame: (frame: TelemetryFrame) => void
  setDefinitions: (defs: MetricDefinition[]) => void
  getReading: (metricId: string) => MetricReading | undefined
}

export const useTelemetryStore = create<TelemetryState>()(
  devtools(
    (set, get) => ({
      currentReadings: new Map(),
      smoothedReadings: new Map(),
      metricDefinitions: [],
      sparklineBuffers: new Map(),
      smoothedSparklineBuffers: new Map(),
      trendBuffers: new Map(),
      smoothedTrendBuffers: new Map(),
      smoothingBaselines: new Map(),

      applyFrame: (frame) =>
        set((state) => {
          const currentReadings = new Map(state.currentReadings)
          const smoothedReadings = new Map(state.smoothedReadings)
          const sparklineBuffers = new Map(state.sparklineBuffers)
          const smoothedSparklineBuffers = new Map(state.smoothedSparklineBuffers)
          const trendBuffers = new Map(state.trendBuffers)
          const smoothedTrendBuffers = new Map(state.smoothedTrendBuffers)
          const smoothingBaselines = new Map(state.smoothingBaselines)
          const { smoothingAlpha } = useSettingsStore.getState()

          for (const reading of frame.readings) {
            currentReadings.set(reading.metricId, reading)

            appendPoint(
              sparklineBuffers,
              reading.metricId,
              { timestamp: reading.timestamp, value: reading.value },
              APP_CONFIG.SPARKLINE_BUFFER_SIZE
            )
            appendPoint(
              trendBuffers,
              reading.metricId,
              { timestamp: reading.timestamp, value: reading.value },
              APP_CONFIG.TREND_BUFFER_SIZE
            )

            const previousBaseline = smoothingBaselines.get(reading.metricId)
            const shouldBypassSmoothing = NON_SMOOTHING_QUALITIES.has(reading.quality)
            const smoothedValue =
              previousBaseline === undefined
                ? reading.value
                : shouldBypassSmoothing
                  ? reading.value
                  : ema(previousBaseline, reading.value, smoothingAlpha)
            const nextBaseline =
              previousBaseline === undefined
                ? reading.value
                : shouldBypassSmoothing
                  ? previousBaseline
                  : smoothedValue

            smoothingBaselines.set(reading.metricId, nextBaseline)

            const smoothedReading: MetricReading = {
              ...reading,
              value: smoothedValue,
            }
            smoothedReadings.set(reading.metricId, smoothedReading)

            appendPoint(
              smoothedSparklineBuffers,
              reading.metricId,
              { timestamp: reading.timestamp, value: smoothedValue },
              APP_CONFIG.SPARKLINE_BUFFER_SIZE
            )
            appendPoint(
              smoothedTrendBuffers,
              reading.metricId,
              { timestamp: reading.timestamp, value: smoothedValue },
              APP_CONFIG.TREND_BUFFER_SIZE
            )
          }

          return {
            currentReadings,
            smoothedReadings,
            sparklineBuffers,
            smoothedSparklineBuffers,
            trendBuffers,
            smoothedTrendBuffers,
            smoothingBaselines,
          }
        }),

      setDefinitions: (defs) => set({ metricDefinitions: defs }),

      getReading: (metricId) => get().currentReadings.get(metricId),
    }),
    { name: 'telemetry-store' }
  )
)
