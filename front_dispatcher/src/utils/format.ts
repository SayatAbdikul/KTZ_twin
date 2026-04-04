export function formatClock(ts: number): string {
    return new Date(ts).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
}

export function formatAgo(ts: number): string {
    const deltaSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
    if (deltaSec < 60) return `${deltaSec}s ago`
    const min = Math.floor(deltaSec / 60)
    if (min < 60) return `${min}m ago`
    const h = Math.floor(min / 60)
    return `${h}h ago`
}
