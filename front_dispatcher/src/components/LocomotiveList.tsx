import { useMemo } from 'react'
import { useDispatcherStore } from '../store/useDispatcherStore'
import { formatAgo } from '../utils/format'

function statusClass(status: 'normal' | 'attention' | 'critical'): string {
    if (status === 'critical') return 'status-critical'
    if (status === 'attention') return 'status-attention'
    return 'status-normal'
}

function statusLabel(status: 'normal' | 'attention' | 'critical'): string {
    if (status === 'critical') return 'Критично'
    if (status === 'attention') return 'Внимание'
    return 'Норма'
}

export function LocomotiveList() {
    const selected = useDispatcherStore((s) => s.selectedLocomotiveId)
    const locomotives = useDispatcherStore((s) => s.locomotives)
    const setSelected = useDispatcherStore((s) => s.setSelectedLocomotive)

    const entries = useMemo(
        () =>
            Object.values(locomotives).sort((a, b) => {
                if (a.status === b.status) return b.timestamp - a.timestamp
                const rank = { critical: 3, attention: 2, normal: 1 }
                return rank[b.status] - rank[a.status]
            }),
        [locomotives]
    )

    return (
        <section className="panel list-panel">
            <div className="panel-header">
                <h2>Удалённые локомотивы</h2>
                <span className="muted">Онлайн: {entries.length}</span>
            </div>

            <div className="loco-list">
                {entries.length === 0 && <p className="empty">Ожидание телеметрии...</p>}
                {entries.map((loco) => (
                    <button
                        key={loco.locomotiveId}
                        className={`loco-item ${selected === loco.locomotiveId ? 'active' : ''}`}
                        onClick={() => setSelected(loco.locomotiveId)}
                    >
                        <div className="loco-top-row">
                            <strong>{loco.locomotiveId}</strong>
                            <span className={`status-pill ${statusClass(loco.status)}`}>{statusLabel(loco.status)}</span>
                        </div>
                        <div className="loco-metrics-row">
                            <span>{loco.speedKmh.toFixed(0)} km/h</span>
                            <span>Топливо {loco.fuelLevel.toFixed(0)}%</span>
                            <span>Состояние {loco.healthScore.toFixed(0)}</span>
                        </div>
                        <small className="muted">Обновлено {formatAgo(loco.timestamp)}</small>
                    </button>
                ))}
            </div>
        </section>
    )
}
