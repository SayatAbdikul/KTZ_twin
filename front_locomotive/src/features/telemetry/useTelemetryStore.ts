import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { MetricReading, MetricDefinition, TelemetryFrame } from '@/types/telemetry'
import { APP_CONFIG } from '@/config/app.config'
import { ema } from '@/utils/smoothing'
import { useSettingsStore } from '@/features/settings/useSettingsStore'

type SparklinePoint = { timestamp: number; value: number }
const NON_SMOOTHING_QUALITIES = new Set<MetricReading['quality']>(['stale', 'bad'])

export interface TelemetryLocomotiveSnapshot {
  currentReadings: Map<string, MetricReading>
  smoothedReadings: Map<string, MetricReading>
  sparklineBuffers: Map<string, SparklinePoint[]>
  smoothedSparklineBuffers: Map<string, SparklinePoint[]>
  trendBuffers: Map<string, SparklinePoint[]>
  smoothedTrendBuffers: Map<string, SparklinePoint[]>
  smoothingBaselines: Map<string, number>
}

export const EMPTY_TELEMETRY_SNAPSHOT: TelemetryLocomotiveSnapshot = {
  currentReadings: new Map(),
  smoothedReadings: new Map(),
  sparklineBuffers: new Map(),
  smoothedSparklineBuffers: new Map(),
  trendBuffers: new Map(),
  smoothedTrendBuffers: new Map(),
  smoothingBaselines: new Map(),
}

function createEmptyTelemetrySnapshot(): TelemetryLocomotiveSnapshot {
  return {
    currentReadings: new Map(),
    smoothedReadings: new Map(),
    sparklineBuffers: new Map(),
    smoothedSparklineBuffers: new Map(),
    trendBuffers: new Map(),
    smoothedTrendBuffers: new Map(),
    smoothingBaselines: new Map(),
  }
}

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
  byLocomotive: Record<string, TelemetryLocomotiveSnapshot>
  metricDefinitions: MetricDefinition[]

  applyFrame: (frame: TelemetryFrame) => void
  setDefinitions: (defs: MetricDefinition[]) => void
  getReading: (locomotiveId: string, metricId: string) => MetricReading | undefined
}

export const useTelemetryStore = create<TelemetryState>()(
  devtools(
    (set, get) => ({
      byLocomotive: {},
      metricDefinitions: [],

      applyFrame: (frame) =>
        set((state) => {
          const previous = state.byLocomotive[frame.locomotiveId] ?? createEmptyTelemetrySnapshot()
          const currentReadings = new Map(previous.currentReadings)
          const smoothedReadings = new Map(previous.smoothedReadings)
          const sparklineBuffers = new Map(previous.sparklineBuffers)
          const smoothedSparklineBuffers = new Map(previous.smoothedSparklineBuffers)
          const trendBuffers = new Map(previous.trendBuffers)
          const smoothedTrendBuffers = new Map(previous.smoothedTrendBuffers)
          const smoothingBaselines = new Map(previous.smoothingBaselines)
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
            byLocomotive: {
              ...state.byLocomotive,
              [frame.locomotiveId]: {
                currentReadings,
                smoothedReadings,
                sparklineBuffers,
                smoothedSparklineBuffers,
                trendBuffers,
                smoothedTrendBuffers,
                smoothingBaselines,
              },
            },
          }
        }),

      setDefinitions: (defs) => set({ metricDefinitions: defs }),

      getReading: (locomotiveId, metricId) => get().byLocomotive[locomotiveId]?.currentReadings.get(metricId),
    }),
    { name: 'telemetry-store' }
  )
)
