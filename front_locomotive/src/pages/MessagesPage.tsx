import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Radio, Send } from 'lucide-react'
import { useAuthStore } from '@/features/auth/useAuthStore'
import { useMessageStore } from '@/features/dispatcher-messages/useMessageStore'
import { useDispatchConsoleStore } from '@/features/dispatch-console/useDispatchConsoleStore'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { MessageCard } from '@/components/messaging/MessageCard'
import { endpoints } from '@/services/api/endpoints'
import { fetchDispatcherChat } from '@/services/api/dispatcherApi'
import { PageContainer } from '@/components/layout/PageContainer'
import type { DispatcherMessage } from '@/types/messages'
import { sendTrainChat } from '@/services/websocket/wsClient'
import { relativeTime } from '@/utils/formatters'
import { cn } from '@/utils/cn'

const EMPTY_MESSAGES: DispatcherMessage[] = []

export function MessagesPage() {
  const [draft, setDraft] = useState('')
  const user = useAuthStore((s) => s.user)
  const selectedLocomotiveId = useFleetStore((s) => s.selectedLocomotiveId)
  const messagesByLocomotive = useMessageStore((s) => s.messagesByLocomotive)
  const chatsByLocomotive = useDispatchConsoleStore((s) => s.chatsByLocomotive)
  const setChatHistory = useDispatchConsoleStore((s) => s.setChatHistory)
  const addChatMessage = useDispatchConsoleStore((s) => s.addChatMessage)
  const trainLocomotiveId = user?.locomotiveId ?? selectedLocomotiveId ?? null
  const isTrainUser = user?.role === 'regular_train'
  const messages = selectedLocomotiveId
    ? messagesByLocomotive[selectedLocomotiveId] ?? EMPTY_MESSAGES
    : EMPTY_MESSAGES
  const chatMessages = useMemo(
    () => (trainLocomotiveId ? chatsByLocomotive[trainLocomotiveId] ?? [] : []),
    [chatsByLocomotive, trainLocomotiveId]
  )
  const { markAcknowledged } = useMessageStore()

  useEffect(() => {
    if (!isTrainUser || !trainLocomotiveId) return

    let cancelled = false
    void fetchDispatcherChat(trainLocomotiveId)
      .then((chat) => {
        if (!cancelled) {
          setChatHistory(trainLocomotiveId, chat)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChatHistory(trainLocomotiveId, [])
        }
      })

    return () => {
      cancelled = true
    }
  }, [isTrainUser, setChatHistory, trainLocomotiveId])

  async function handleAcknowledge(messageId: string, locomotiveId: string) {
    try {
      await endpoints.messages.acknowledge(messageId)
      markAcknowledged(locomotiveId, messageId)
    } catch {
      // silent
    }
  }

  function handleSendTrainChat() {
    if (!trainLocomotiveId) return
    const body = draft.trim()
    if (!body) return

    const messageId = crypto.randomUUID()
    addChatMessage({
      id: messageId,
      locomotiveId: trainLocomotiveId,
      sender: 'regular_train',
      body,
      sentAt: Date.now(),
      delivered: true,
    })
    sendTrainChat(trainLocomotiveId, body, messageId)
    setDraft('')
  }

  if (isTrainUser) {
    return (
      <PageContainer className="flex h-full flex-col gap-4">
        <div className="flex items-center gap-2">
          <Radio size={18} className="text-blue-400" />
          <div>
            <h1 className="text-base font-semibold text-slate-200">Чат с диспетчером</h1>
            <p className="text-sm text-slate-500">{trainLocomotiveId ?? 'Локомотив не назначен'}</p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-950/60">
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {chatMessages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Сообщений в чате пока нет.
              </div>
            ) : (
              chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'max-w-[82%] rounded-2xl px-4 py-3 text-sm',
                    message.sender === 'regular_train'
                      ? 'ml-auto bg-emerald-500/15 text-emerald-50'
                      : 'border border-slate-800 bg-slate-900 text-slate-100'
                  )}
                >
                  <p>{message.body}</p>
                  <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    {message.sender === 'regular_train' ? 'Локомотив' : 'Диспетчер'} · {relativeTime(message.sentAt)}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-800 px-4 py-3">
            <div className="flex gap-3">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ответить диспетчеру"
                rows={3}
                disabled={!trainLocomotiveId}
                className="min-h-[84px] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleSendTrainChat}
                disabled={!trainLocomotiveId || !draft.trim()}
                className="flex h-[84px] w-24 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                >
                  <Send size={16} />
                Отправить
              </button>
            </div>
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="mb-4 flex items-center gap-2">
        <MessageSquare size={18} className="text-blue-400" />
        <h1 className="text-base font-semibold text-slate-200">Сообщения диспетчера</h1>
      </div>

      <div className="flex flex-col gap-2">
        {messages.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-700 text-slate-500">
            Сообщений нет
          </div>
        ) : (
          messages.map((msg) => (
            <MessageCard
              key={msg.messageId}
              message={msg}
              onAcknowledge={(messageId) => handleAcknowledge(messageId, msg.locomotiveId)}
            />
          ))
        )}
      </div>
    </PageContainer>
  )
}
