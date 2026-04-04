const LEGEND_ITEMS = [
  { color: '#10b981', label: 'Normal' },
  { color: '#f59e0b', label: 'Degraded' },
  { color: '#f97316', label: 'Warning' },
  { color: '#ef4444', label: 'Critical' },
  { color: '#3b82f6', label: 'No health data' },
  { color: '#475569', label: 'No data' },
]

export function DiagramLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 py-2">
      {LEGEND_ITEMS.map(({ color, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs text-slate-400">{label}</span>
        </div>
      ))}
    </div>
  )
}
