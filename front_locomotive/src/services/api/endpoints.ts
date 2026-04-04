import { apiClient } from './apiClient'
import type { HealthIndex } from '@/types/health'
import type { TelemetryFrame, MetricDefinition, MetricHistory } from '@/types/telemetry'
import type { Alert } from '@/types/alerts'
import type { DispatcherMessage } from '@/types/messages'

export const endpoints = {
  health: {
    get: () => apiClient.get<HealthIndex>('/api/health'),
  },
  telemetry: {
    current: () => apiClient.get<TelemetryFrame>('/api/telemetry/current'),
    metrics: () => apiClient.get<MetricDefinition[]>('/api/telemetry/metrics'),
    history: (metricId: string, from: number, to: number, resolution: string) =>
      apiClient.get<MetricHistory>(`/api/telemetry/history/${metricId}`, {
        params: { from, to, resolution },
      }),
  },
  alerts: {
    list: (params?: { status?: string; severity?: string; page?: number; pageSize?: number }) =>
      apiClient.get<Alert[]>('/api/alerts', { params: params as Record<string, string | number> }),
    acknowledge: (alertId: string) =>
      apiClient.post<Alert>(`/api/alerts/${alertId}/acknowledge`),
  },
  messages: {
    list: (params?: { read?: boolean; page?: number; pageSize?: number }) =>
      apiClient.get<DispatcherMessage[]>('/api/messages', {
        params: params as Record<string, string | number>,
      }),
    markRead: (messageId: string) =>
      apiClient.post<DispatcherMessage>(`/api/messages/${messageId}/read`),
    acknowledge: (messageId: string) =>
      apiClient.post<DispatcherMessage>(`/api/messages/${messageId}/acknowledge`),
  },
}
