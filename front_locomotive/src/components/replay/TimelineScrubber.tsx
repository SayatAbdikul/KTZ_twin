import type { ReplayTimeRange } from '@/types/replay'

interface TimelineScrubberProps {
  timeRange: ReplayTimeRange | null
  currentTimestamp: number | null
  disabled?: boolean
  onSeek: (timestamp: number) => void
}

function formatTick(timestamp: number, spanMs: number): string {
  const options: Intl.DateTimeFormatOptions =
    spanMs > 24 * 60 * 60_000
      ? { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' }

  return new Intl.DateTimeFormat('en-GB', options).format(timestamp)
}

function getTickSpacing(spanMs: number): number {
  if (spanMs <= 60 * 60_000) return 5 * 60_000
  if (spanMs <= 6 * 60 * 60_000) return 15 * 60_000
  if (spanMs <= 24 * 60 * 60_000) return 60 * 60_000
  return 6 * 60 * 60_000
}

function buildTicks(timeRange: ReplayTimeRange | null): number[] {
  if (!timeRange || timeRange.earliest === null || timeRange.latest === null) return []

  const spanMs = Math.max(0, timeRange.latest - timeRange.earliest)
  if (spanMs === 0) return [timeRange.earliest]

  const spacing = getTickSpacing(spanMs)
  const first = Math.ceil(timeRange.earliest / spacing) * spacing
  const ticks = [timeRange.earliest]

  for (let tick = first; tick < timeRange.latest; tick += spacing) {
    if (tick > timeRange.earliest) ticks.push(tick)
  }

  if (ticks[ticks.length - 1] !== timeRange.latest) {
    ticks.push(timeRange.latest)
  }

  return ticks
}

export function TimelineScrubber({
  timeRange,
  currentTimestamp,
  disabled = false,
  onSeek,
}: TimelineScrubberProps) {
  const ticks = buildTicks(timeRange)
  const earliest = timeRange?.earliest
  const latest = timeRange?.latest
  const spanMs =
    earliest !== null && earliest !== undefined && latest !== null && latest !== undefined
      ? Math.max(0, latest - earliest)
      : 0
  const effectiveValue =
    currentTimestamp ?? (earliest !== null && earliest !== undefined ? earliest : 0)

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Timeline</p>
          <h2 className="text-sm font-semibold text-slate-100">Replay scrubber</h2>
        </div>
        {earliest !== null && earliest !== undefined && latest !== null && latest !== undefined ? (
          <span className="text-xs text-slate-500">
            {new Intl.DateTimeFormat('en-GB', {
              month: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }).format(earliest)}
            {' - '}
            {new Intl.DateTimeFormat('en-GB', {
              month: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }).format(latest)}
          </span>
        ) : (
          <span className="text-xs text-slate-500">No stored replay history</span>
        )}
      </div>

      <input
        type="range"
        min={earliest ?? 0}
        max={latest ?? 0}
        step={1000}
        value={effectiveValue}
        disabled={
          disabled ||
          earliest === null ||
          earliest === undefined ||
          latest === null ||
          latest === undefined
        }
        onChange={(event) => onSeek(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-blue-500 disabled:cursor-not-allowed"
      />

      <div className="mt-3 flex justify-between gap-2 text-[11px] text-slate-500">
        {ticks.map((tick) => (
          <span key={tick} className="min-w-0 flex-1 text-center">
            {formatTick(tick, spanMs)}
          </span>
        ))}
      </div>
    </section>
  )
}
