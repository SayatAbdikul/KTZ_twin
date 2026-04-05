import { MousePointerClick } from 'lucide-react'

export function DetailPanelEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-700 p-8 text-center">
      <MousePointerClick size={28} className="text-slate-600" />
      <p className="text-sm text-slate-500">
        Нажмите на зону схемы локомотива, чтобы увидеть детали подсистемы
      </p>
    </div>
  )
}
