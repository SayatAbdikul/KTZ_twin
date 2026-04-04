import { delay, http, HttpResponse } from 'msw'
import {
  generateReplayRange,
  generateReplaySnapshot,
  generateReplayTimeRange,
} from '../data/replayFixtures'

export const replayHandlers = [
  http.get('/api/locomotives/:locomotiveId/replay/time-range', async () => {
    await delay(40)
    return HttpResponse.json({ data: generateReplayTimeRange(), timestamp: Date.now() })
  }),

  http.get('/api/locomotives/:locomotiveId/replay/range', async ({ request }) => {
    await delay(80)
    const url = new URL(request.url)
    const from = Number(url.searchParams.get('from')) || Date.now() - 15 * 60_000
    const to = Number(url.searchParams.get('to')) || Date.now()
    const resolution = (url.searchParams.get('resolution') ?? 'raw') as
      | 'raw'
      | '1s'
      | '10s'
      | '1m'
      | '5m'
    const metricIds = (url.searchParams.get('metricIds') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    return HttpResponse.json({
      data: generateReplayRange({
        from,
        to,
        resolution,
        metricIds,
      }),
      timestamp: Date.now(),
    })
  }),

  http.get('/api/locomotives/:locomotiveId/replay/snapshot', async ({ request }) => {
    await delay(50)
    const url = new URL(request.url)
    const timestamp = Number(url.searchParams.get('timestamp')) || Date.now()

    return HttpResponse.json({
      data: generateReplaySnapshot(timestamp),
      timestamp: Date.now(),
    })
  }),
]
