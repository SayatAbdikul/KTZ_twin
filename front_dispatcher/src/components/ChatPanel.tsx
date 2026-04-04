import { useEffect, useMemo, useState } from 'react'
import { fetchChatHistory } from '../services/chatApi'
import { sendChat } from '../services/wsClient'
import { useDispatcherStore } from '../store/useDispatcherStore'
import { formatClock } from '../utils/format'

export function ChatPanel() {
    const [text, setText] = useState('')
    const selected = useDispatcherStore((s) => s.selectedLocomotiveId)
    const chats = useDispatcherStore((s) => s.chats)
    const setChatHistory = useDispatcherStore((s) => s.setChatHistory)
    const addChatMessage = useDispatcherStore((s) => s.addChatMessage)

    const messages = useMemo(() => {
        if (!selected) return []
        return chats[selected] ?? []
    }, [selected, chats])

    useEffect(() => {
        if (!selected) return

        let cancelled = false
        void fetchChatHistory(selected)
            .then((messages) => {
                if (!cancelled) {
                    setChatHistory(selected, messages)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setChatHistory(selected, [])
                }
            })

        return () => {
            cancelled = true
        }
    }, [selected, setChatHistory])

    function onSend() {
        if (!selected) return
        const body = text.trim()
        if (!body) return

        const messageId = crypto.randomUUID()
        const localMessage = {
            id: messageId,
            locomotiveId: selected,
            sender: 'dispatcher' as const,
            body,
            sentAt: Date.now(),
        }

        addChatMessage(localMessage)
        sendChat(selected, body, messageId)
        setText('')
    }

    return (
        <section className="panel chat-panel">
            <div className="panel-header">
                <h2>Dispatcher Chat</h2>
                <span className="muted">{selected ?? 'no locomotive selected'}</span>
            </div>

            <div className="chat-log">
                {!selected && <p className="empty">Select a locomotive to start chat.</p>}
                {selected && messages.length === 0 && (
                    <p className="empty">No messages yet. Send first command.</p>
                )}

                {messages.map((msg) => (
                    <div key={msg.id} className={`bubble ${msg.sender === 'dispatcher' ? 'out' : 'in'}`}>
                        <p>{msg.body}</p>
                        <small>
                            {msg.sender === 'dispatcher' ? 'Dispatcher' : 'Train'} · {formatClock(msg.sentAt)}
                        </small>
                    </div>
                ))}
            </div>

            <div className="chat-input-row">
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onSend()}
                    placeholder="Type command or message"
                    disabled={!selected}
                />
                <button onClick={onSend} disabled={!selected || !text.trim()}>
                    Send
                </button>
            </div>
        </section>
    )
}
