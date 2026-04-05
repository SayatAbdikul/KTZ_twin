import { http, HttpResponse, delay } from 'msw'
import { INITIAL_MESSAGES } from '../data/messageFixtures'

const messages = [...INITIAL_MESSAGES]

export const messageHandlers = [
  http.get('/api/messages', async () => {
    await delay(60)
    return HttpResponse.json({ data: messages, timestamp: Date.now() })
  }),

  http.post('/api/messages/:messageId/read', async ({ params }) => {
    await delay(50)
    const idx = messages.findIndex((m) => m.messageId === params['messageId'])
    if (idx !== -1) {
      messages[idx] = { ...messages[idx], readAt: Date.now() }
      return HttpResponse.json({ data: messages[idx], timestamp: Date.now() })
    }
    return HttpResponse.json({ code: 'NOT_FOUND', message: 'Сообщение не найдено' }, { status: 404 })
  }),

  http.post('/api/messages/:messageId/acknowledge', async ({ params }) => {
    await delay(50)
    const idx = messages.findIndex((m) => m.messageId === params['messageId'])
    if (idx !== -1) {
      messages[idx] = {
        ...messages[idx],
        readAt: messages[idx].readAt ?? Date.now(),
        acknowledgedAt: Date.now(),
      }
      return HttpResponse.json({ data: messages[idx], timestamp: Date.now() })
    }
    return HttpResponse.json({ code: 'NOT_FOUND', message: 'Сообщение не найдено' }, { status: 404 })
  }),
]
