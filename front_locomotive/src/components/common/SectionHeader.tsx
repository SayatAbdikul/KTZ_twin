import { Link } from 'react-router-dom'

interface SectionHeaderProps {
  title: string
  viewAllTo?: string
  count?: number
}

export function SectionHeader({ title, viewAllTo, count }: SectionHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
            {count}
          </span>
        )}
      </div>
      {viewAllTo && (
        <Link to={viewAllTo} className="text-xs text-blue-400 hover:text-blue-300">
          Все
        </Link>
      )}
    </div>
  )
}
