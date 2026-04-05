import { useDispatcherStore } from '../store/useDispatcherStore'

const COLORS: Record<string, string> = {
    connecting: '#f59e0b',
    connected: '#10b981',
    disconnected: '#ef4444',
    error: '#dc2626',
}

const LABELS: Record<string, string> = {
    connecting: 'подключение',
    connected: 'подключено',
    disconnected: 'отключено',
    error: 'ошибка',
}

export function ConnectionBadge() {
    const connection = useDispatcherStore((s) => s.connection)

    return (
        <div className="connection-badge">
            <span className="dot" style={{ backgroundColor: COLORS[connection] }} />
            <span>{LABELS[connection] ?? connection}</span>
        </div>
    )
}
