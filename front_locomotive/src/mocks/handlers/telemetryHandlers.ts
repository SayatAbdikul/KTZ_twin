import { http, HttpResponse, delay } from 'msw'
import { generateTelemetryFrame, generateMetricHistory } from '../data/telemetryFixtures'
import { METRIC_DEFINITIONS } from '@/config/metrics.config'

export const telemetryHandlers = [
  http.get('/api/telemetry/current', async () => {
    await delay(50)
    return HttpResponse.json({ data: generateTelemetryFrame(), timestamp: Date.now() })
  }),

  http.get('/api/telemetry/metrics', async () => {
    await delay(30)
    return HttpResponse.json({ data: METRIC_DEFINITIONS, timestamp: Date.now() })
  }),

  http.get('/api/telemetry/history/:metricId', async ({ params, request }) => {
    await delay(100)
    const url = new URL(request.url)
    const from = Number(url.searchParams.get('from')) || Date.now() - 3600000
    const to = Number(url.searchParams.get('to')) || Date.now()
    const resolution = url.searchParams.get('resolution') ?? '10s'
    return HttpResponse.json({
      data: generateMetricHistory(params['metricId'] as string, from, to, resolution),
      timestamp: Date.now(),
    })
  }),
]
