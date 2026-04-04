import { History } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'

export function ReplayPage() {
  return (
    <PageContainer>
      <div className="mb-4 flex items-center gap-2">
        <History size={18} className="text-slate-400" />
        <h1 className="text-base font-semibold text-slate-200">History & Replay</h1>
      </div>
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-700 text-slate-500">
        Replay functionality — coming in Phase 4
      </div>
    </PageContainer>
  )
}
