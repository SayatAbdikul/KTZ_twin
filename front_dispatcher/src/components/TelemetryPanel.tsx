import { useMemo } from 'react'
import { useDispatcherStore } from '../store/useDispatcherStore'
import { formatClock } from '../utils/format'

function MiniTrend({ values }: { values: number[] }) {
    const path = useMemo(() => {
        if (values.length < 2) return ''
        const max = Math.max(...values)
        const min = Math.min(...values)
        const range = max - min || 1
        return values
            .map((v, i) => {
                const x = (i / (values.length - 1)) * 100
                const y = 100 - ((v - min) / range) * 100
                return `${x},${y}`
            })
            .join(' ')
    }, [values])

    return (
        <svg viewBox="0 0 100 100" className="trend-line" preserveAspectRatio="none">
            {path ? <polyline points={path} fill="none" stroke="currentColor" strokeWidth="4" /> : null}
        </svg>
    )
}

export function TelemetryPanel() {
    const selected = useDispatcherStore((s) => s.selectedLocomotiveId)
    const locomotives = useDispatcherStore((s) => s.locomotives)

    if (!selected || !locomotives[selected]) {
        return (
            <section className="panel telemetry-panel">
                <h2>Telemetry</h2>
                <p className="empty">Select a locomotive when telemetry appears.</p>
            </section>
        )
    }

    const loco = locomotives[selected]

    return (
        <section className="panel telemetry-panel">
            <div className="panel-header">
                <h2>{loco.locomotiveId} telemetry</h2>
                <span className="muted">{formatClock(loco.timestamp)}</span>
            </div>

            <div className="metric-grid">
                <article className="metric-card">
                    <p className="label">Speed</p>
                    <p className="value">{loco.speedKmh.toFixed(1)} km/h</p>
                    <MiniTrend values={loco.sparkline.map((s) => s.speed)} />
                </article>
                <article className="metric-card">
                    <p className="label">Fuel</p>
                    <p className="value">{loco.fuelLevel.toFixed(1)} %</p>
                </article>
                <article className="metric-card">
                    <p className="label">Coolant</p>
                    <p className="value">{loco.coolantTemp.toFixed(1)} C</p>
                    <MiniTrend values={loco.sparkline.map((s) => s.temp)} />
                </article>
                <article className="metric-card">
                    <p className="label">Traction current</p>
                    <p className="value">{loco.tractionCurrent.toFixed(0)} A</p>
                </article>
            </div>
        </section>
    )
}
