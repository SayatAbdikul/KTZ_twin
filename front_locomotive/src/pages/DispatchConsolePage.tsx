import { useEffect, useMemo, useState } from 'react'
import { Radio, Send, Shield, TrainFront } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { getFleetLocomotiveOptions, useFleetStore } from '@/features/fleet/useFleetStore'
import { useDispatchConsoleStore } from '@/features/dispatch-console/useDispatchConsoleStore'
import { fetchDispatcherChat } from '@/services/api/dispatcherApi'
import { sendDispatcherChat } from '@/services/websocket/wsClient'
import { useTelemetryStore } from '@/features/telemetry/useTelemetryStore'
import { relativeTime } from '@/utils/formatters'
import { cn } from '@/utils/cn'

function formatMetric(value: number | null | undefined, suffix: string) {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  return `${value.toFixed(0)} ${suffix}`
}

export function DispatchConsolePage() {
  const [draft, setDraft] = useState('')
  const locomotives = useFleetStore((state) => state.locomotives)
  const selectedLocomotiveId = useFleetStore((state) => state.selectedLocomotiveId)
  const selectLocomotive = useFleetStore((state) => state.selectLocomotive)
  const chatsByLocomotive = useDispatchConsoleStore((state) => state.chatsByLocomotive)
  const setChatHistory = useDispatchConsoleStore((state) => state.setChatHistory)
  const addChatMessage = useDispatchConsoleStore((state) => state.addChatMessage)
  const telemetryByLocomotive = useTelemetryStore((state) => state.byLocomotive)

  const locomotiveIds = useMemo(() => getFleetLocomotiveOptions(locomotives), [locomotives])
  const selectedSummary = selectedLocomotiveId ? locomotives[selectedLocomotiveId] ?? null : null
  const selectedTelemetry = selectedLocomotiveId
    ? telemetryByLocomotive[selectedLocomotiveId] ?? null
    : null
  const selectedMessages = selectedLocomotiveId
    ? chatsByLocomotive[selectedLocomotiveId] ?? []
    : []
  const tractionCurrent = selectedTelemetry?.currentReadings.get('electrical.traction_current')?.value ?? null

  useEffect(() => {
    if (!selectedLocomotiveId) return

    let cancelled = false
    void fetchDispatcherChat(selectedLocomotiveId)
      .then((messages) => {
        if (cancelled) return
        setChatHistory(selectedLocomotiveId, messages)
      })
      .catch(() => {
        if (!cancelled) {
          setChatHistory(selectedLocomotiveId, [])
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedLocomotiveId, setChatHistory])

  function handleSend() {
    if (!selectedLocomotiveId) return
    const body = draft.trim()
    if (!body) return

    const messageId = crypto.randomUUID()
    addChatMessage({
      id: messageId,
      locomotiveId: selectedLocomotiveId,
      sender: 'dispatcher',
      body,
      sentAt: Date.now(),
      delivered: true,
    })
    sendDispatcherChat(selectedLocomotiveId, body, messageId)
    setDraft('')
  }

  return (
    <PageContainer className="grid h-full gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Админ</p>
            <h1 className="mt-1 text-base font-semibold text-slate-100">Диспетчерская консоль</h1>
          </div>
          <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Онлайн
          </div>
        </div>

        {locomotiveIds.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm text-slate-500">
            Ожидание диспетчерского снимка.
          </div>
        ) : (
          <div className="space-y-2">
            {locomotiveIds.map((locomotiveId) => {
              const summary = locomotives[locomotiveId]
              return (
                <button
                  key={locomotiveId}
                  type="button"
                  onClick={() => selectLocomotive(locomotiveId)}
                  className={cn(
                    'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                    selectedLocomotiveId === locomotiveId
                      ? 'border-blue-500/60 bg-blue-500/10'
                      : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <TrainFront size={16} className="text-blue-300" />
                      <span className="font-medium text-slate-100">{locomotiveId}</span>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em]',
                        summary.connected
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      )}
                    >
                      {summary.connected ? 'Онлайн' : 'Офлайн'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <div>Состояние {summary.healthScore?.toFixed(0) ?? '--'}</div>
                    <div>Оповещения {summary.activeAlertCount}</div>
                    <div>Скорость {formatMetric(summary.speedKmh, 'км/ч')}</div>
                    <div>Топливо {formatMetric(summary.fuelLevel, '%')}</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="grid min-h-0 gap-4 xl:grid-rows-[auto_minmax(0,1fr)]">
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
              <Shield size={14} />
              Выбранная единица
            </div>
            <div className="mt-3 text-xl font-semibold text-slate-100">
              {selectedSummary?.locomotiveId ?? 'Локомотив не выбран'}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {selectedSummary?.latestTelemetryAt
                ? `Обновлено ${relativeTime(selectedSummary.latestTelemetryAt)}`
                : 'Ожидание телеметрии'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Скорость</div>
            <div className="mt-3 text-2xl font-semibold text-slate-100">
              {formatMetric(selectedSummary?.speedKmh, 'км/ч')}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Охлаждение</div>
            <div className="mt-3 text-2xl font-semibold text-slate-100">
              {formatMetric(selectedSummary?.coolantTemp, '°C')}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Тяга</div>
            <div className="mt-3 text-2xl font-semibold text-slate-100">
              {formatMetric(tractionCurrent, 'A')}
            </div>
          </div>
        </div>

        <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-950/60">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Радиоканал</p>
                <h2 className="mt-1 text-sm font-semibold text-slate-100">
                  {selectedLocomotiveId ? `${selectedLocomotiveId} · канал команд` : 'Выберите локомотив'}
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Radio size={14} className="text-blue-300" />
                Реальное время
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {!selectedLocomotiveId ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Выберите локомотив, чтобы открыть чат.
                </div>
              ) : selectedMessages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Для этого локомотива сообщений пока нет.
                </div>
              ) : (
                selectedMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'max-w-[78%] rounded-2xl px-4 py-3 text-sm',
                      message.sender === 'dispatcher'
                        ? 'ml-auto bg-blue-500/15 text-blue-50'
                        : 'border border-slate-800 bg-slate-900 text-slate-100'
                    )}
                  >
                    <p>{message.body}</p>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                      {message.sender === 'dispatcher' ? 'Диспетчер' : 'Локомотив'} · {relativeTime(message.sentAt)}
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
                placeholder="Отправьте эксплуатационную команду выбранному локомотиву"
                  rows={3}
                  disabled={!selectedLocomotiveId}
                  className="min-h-[84px] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!selectedLocomotiveId || !draft.trim()}
                  className="flex h-[84px] w-24 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                >
                  <Send size={16} />
                  Отправить
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Оперативная сводка</p>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                Индекс состояния: <span className="font-semibold text-slate-100">{selectedSummary?.healthScore?.toFixed(0) ?? '--'}</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                Активные оповещения: <span className="font-semibold text-slate-100">{selectedSummary?.activeAlertCount ?? 0}</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                Последнее обновление состояния:{' '}
                <span className="font-semibold text-slate-100">
                  {selectedSummary?.latestHealthAt ? relativeTime(selectedSummary.latestHealthAt) : 'н/д'}
                </span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                Состояние канала:{' '}
                <span className="font-semibold text-slate-100">
                  {selectedSummary?.connected ? 'Подключено' : 'Отключено'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageContainer>
  )
}
