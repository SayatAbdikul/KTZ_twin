import { useDispatcherStore } from '../store/useDispatcherStore'

const COLORS: Record<string, string> = {
    connecting: '#f59e0b',
    connected: '#10b981',
    disconnected: '#ef4444',
    error: '#dc2626',
}

export function ConnectionBadge() {
    const connection = useDispatcherStore((s) => s.connection)

    return (
        <div className="connection-badge">
            <span className="dot" style={{ backgroundColor: COLORS[connection] }} />
            <span>{connection}</span>
        </div>
    )
}
