import { cn } from '@/utils/cn'

export type TimeRangePreset = '1m' | '5m' | '15m' | '1h' | 'all'

interface TimeRangeSelectorProps {
  value: TimeRangePreset
  onChange: (preset: TimeRangePreset) => void
  options?: TimeRangePreset[]
}

const OPTIONS: Array<{ value: TimeRangePreset; label: string }> = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: 'all', label: 'All' },
]

export function TimeRangeSelector({ value, onChange, options }: TimeRangeSelectorProps) {
  const optionList = options
    ? OPTIONS.filter((option) => options.includes(option.value))
    : OPTIONS

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Live trend time range"
    >
      {optionList.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'border-blue-500/60 bg-blue-500/15 text-blue-300'
                : 'border-slate-700 bg-slate-900/70 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            )}
            aria-pressed={active}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
