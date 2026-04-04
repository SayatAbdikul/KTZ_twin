import { CONFIG } from '../config'
import { useAuthStore } from '../store/useAuthStore'
import type { ChatMessage } from '../types'

interface ApiEnvelope<T> {
    data?: T
    error?: {
        code?: string
        message?: string
    }
}

function buildHeaders(): Headers {
    const headers = new Headers()
    const accessToken = useAuthStore.getState().accessToken
    if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`)
    }
    return headers
}

function adaptChatMessage(raw: unknown, locomotiveId: string): ChatMessage {
    const payload = raw as Record<string, unknown>
    const sender = String(payload['sender'] ?? 'regular_train')
    return {
        id: String(payload['message_id'] ?? payload['messageId'] ?? crypto.randomUUID()),
        locomotiveId: String(payload['locomotive_id'] ?? payload['locomotiveId'] ?? locomotiveId),
        sender: sender === 'dispatcher' ? 'dispatcher' : 'regular_train',
        body: String(payload['body'] ?? payload['subject'] ?? 'Incoming operation message'),
        sentAt: Number(payload['sent_at'] ?? payload['sentAt'] ?? Date.now()),
        delivered: typeof payload['delivered'] === 'boolean' ? (payload['delivered'] as boolean) : undefined,
    }
}

export async function fetchChatHistory(locomotiveId: string): Promise<ChatMessage[]> {
    const response = await fetch(`${CONFIG.AUTH_API_BASE_URL}/api/locomotives/${locomotiveId}/chat`, {
        headers: buildHeaders(),
        credentials: 'include',
    })
    const payload = (await response.json().catch(() => null)) as ApiEnvelope<unknown[]> | null
    if (!response.ok) {
        throw new Error(payload?.error?.message ?? 'Unable to load chat history.')
    }
    return (payload?.data ?? []).map((item) => adaptChatMessage(item, locomotiveId))
}
