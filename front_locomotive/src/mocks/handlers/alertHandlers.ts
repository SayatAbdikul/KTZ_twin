import { http, HttpResponse, delay } from 'msw'
import { INITIAL_ALERTS } from '../data/alertFixtures'

const alerts = [...INITIAL_ALERTS]

export const alertHandlers = [
  http.get('/api/alerts', async () => {
    await delay(60)
    return HttpResponse.json({ data: alerts, timestamp: Date.now() })
  }),

  http.post('/api/alerts/:alertId/acknowledge', async ({ params }) => {
    await delay(80)
    const idx = alerts.findIndex((a) => a.alertId === params['alertId'])
    if (idx !== -1) {
      alerts[idx] = {
        ...alerts[idx],
        status: 'acknowledged',
        acknowledgedAt: Date.now(),
        acknowledgedBy: 'Машинист',
      }
      return HttpResponse.json({ data: alerts[idx], timestamp: Date.now() })
    }
    return HttpResponse.json({ code: 'NOT_FOUND', message: 'Оповещение не найдено' }, { status: 404 })
  }),
]
