import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useConnectionStore } from '@/features/connection/useConnectionStore'
import { useDispatchConsoleStore } from '@/features/dispatch-console/useDispatchConsoleStore'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { useHealthStore } from '@/features/health/useHealthStore'
import { useMessageStore } from '@/features/dispatcher-messages/useMessageStore'
import { useReplayStore } from '@/features/replay/useReplayStore'
import { useTelemetryStore } from '@/features/telemetry/useTelemetryStore'

export function resetSessionState() {
  useConnectionStore.setState({
    backendStatus: 'connecting',
    dispatcherStatus: 'disconnected',
    wsConnected: false,
    lastHeartbeat: null,
    latencyMs: null,
    reconnectAttempt: 0,
  })
  useFleetStore.setState({
    selectedLocomotiveId: null,
    locomotives: {},
  })
  useTelemetryStore.setState({
    byLocomotive: {},
    metricDefinitions: [],
  })
  useHealthStore.setState({
    byLocomotive: {},
  })
  useAlertStore.setState({
    alertsByLocomotive: {},
    summaryByLocomotive: {},
  })
  useMessageStore.setState({
    messagesByLocomotive: {},
    summaryByLocomotive: {},
  })
  useDispatchConsoleStore.setState({
    chatsByLocomotive: {},
  })
  useReplayStore.setState({
    timeRange: null,
    currentTimestamp: null,
    isPlaying: false,
    playbackSpeed: 1,
    visibleWindow: '15m',
    selectedMetricIds: [],
    seriesByMetric: {},
    loadedWindow: null,
    loadedMetricIds: [],
    snapshot: null,
    isLoading: false,
    isLoadingWindow: false,
    isLoadingSnapshot: false,
    error: null,
    initializedForLocomotiveId: null,
  })
}
