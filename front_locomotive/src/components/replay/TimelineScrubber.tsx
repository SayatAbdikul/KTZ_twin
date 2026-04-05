import type { ReplayTimeRange } from '@/types/replay'

interface TimelineScrubberProps {
  timeRange: ReplayTimeRange | null
  currentTimestamp: number | null
  noDataRanges?: Array<{ from: number; to: number }>
  disabled?: boolean
  onSeek: (timestamp: number) => void
}

function formatTick(timestamp: number, spanMs: number): string {
  const options: Intl.DateTimeFormatOptions =
    spanMs > 24 * 60 * 60_000
      ? { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' }

  return new Intl.DateTimeFormat('ru-RU', options).format(timestamp)
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
  noDataRanges = [],
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
  const hasScrubberRange =
    earliest !== null && earliest !== undefined && latest !== null && latest !== undefined && spanMs > 0

  const normalizedNoDataRanges = hasScrubberRange
    ? noDataRanges
        .map((range) => {
          const clampedFrom = Math.max(earliest, Math.min(latest, range.from))
          const clampedTo = Math.max(earliest, Math.min(latest, range.to))
          return { from: clampedFrom, to: clampedTo }
        })
        .filter((range) => range.to > range.from)
    : []

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Шкала времени</p>
          <h2 className="text-sm font-semibold text-slate-100">Ползунок воспроизведения</h2>
        </div>
        {earliest !== null && earliest !== undefined && latest !== null && latest !== undefined ? (
          <span className="text-xs text-slate-500">
            {new Intl.DateTimeFormat('ru-RU', {
              month: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }).format(earliest)}
            {' - '}
            {new Intl.DateTimeFormat('ru-RU', {
              month: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }).format(latest)}
          </span>
        ) : (
          <span className="text-xs text-slate-500">Сохранённая история воспроизведения отсутствует</span>
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

      {hasScrubberRange ? (
        <div className="mt-2">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
            {normalizedNoDataRanges.map((range) => {
              const left = ((range.from - earliest) / spanMs) * 100
              const width = ((range.to - range.from) / spanMs) * 100

              return (
                <span
                  key={`${range.from}-${range.to}`}
                  className="absolute top-0 bottom-0 bg-amber-500/55"
                  style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%` }}
                  title="В этом интервале нет точек данных"
                />
              )
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Оранжевые сегменты показывают интервалы без точек данных воспроизведения.
          </p>
        </div>
      ) : null}

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
