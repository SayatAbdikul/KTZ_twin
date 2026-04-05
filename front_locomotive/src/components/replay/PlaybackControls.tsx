import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { PlaybackSpeed } from '@/types/replay'

const SPEED_OPTIONS: PlaybackSpeed[] = [1, 2, 5, 10]

interface PlaybackControlsProps {
  currentTimestamp: number | null
  isPlaying: boolean
  playbackSpeed: PlaybackSpeed
  disabled?: boolean
  onTogglePlayback: () => void
  onPlaybackSpeedChange: (speed: PlaybackSpeed) => void
  onSkipBackward: () => void
  onSkipForward: () => void
}

function formatTimestamp(timestamp: number | null): string {
  if (timestamp === null) return 'Нет данных воспроизведения'
  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp)
}

export function PlaybackControls({
  currentTimestamp,
  isPlaying,
  playbackSpeed,
  disabled = false,
  onTogglePlayback,
  onPlaybackSpeedChange,
  onSkipBackward,
  onSkipForward,
}: PlaybackControlsProps) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Воспроизведение</p>
          <h2 className="text-lg font-semibold text-slate-100">{formatTimestamp(currentTimestamp)}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSkipBackward}
            disabled={disabled}
            className="rounded-lg border border-slate-700 bg-slate-950/70 p-2 text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            title="Назад на 10 секунд"
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            onClick={onTogglePlayback}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-sm font-medium text-blue-200 transition-colors hover:border-blue-400 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            {isPlaying ? 'Пауза' : 'Воспроизвести'}
          </button>
          <button
            type="button"
            onClick={onSkipForward}
            disabled={disabled}
            className="rounded-lg border border-slate-700 bg-slate-950/70 p-2 text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            title="Вперёд на 10 секунд"
          >
            <RotateCw size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Скорость</span>
        {SPEED_OPTIONS.map((speed) => {
          const active = speed === playbackSpeed
          return (
            <button
              key={speed}
              type="button"
              onClick={() => onPlaybackSpeedChange(speed)}
              disabled={disabled}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                active
                  ? 'border-blue-500/60 bg-blue-500/15 text-blue-300'
                  : 'border-slate-700 bg-slate-900/70 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              )}
              aria-pressed={active}
            >
              {speed}x
            </button>
          )
        })}
      </div>
    </section>
  )
}
