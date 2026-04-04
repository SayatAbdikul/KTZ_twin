import { http, HttpResponse, delay } from 'msw'
import { generateHealthIndex } from '../data/healthFixtures'

export const healthHandlers = [
  http.get('/api/health', async () => {
    await delay(40)
    return HttpResponse.json({ data: generateHealthIndex(), timestamp: Date.now() })
  }),
]
