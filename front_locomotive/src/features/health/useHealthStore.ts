import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { HealthIndex } from '@/types/health'

interface HealthState {
  byLocomotive: Record<string, HealthIndex>
  applyUpdate: (index: HealthIndex) => void
}

export const useHealthStore = create<HealthState>()(
  devtools(
    (set) => ({
      byLocomotive: {},
      applyUpdate: (index) =>
        set((state) => ({
          byLocomotive: {
            ...state.byLocomotive,
            [index.locomotiveId]: index,
          },
        })),
    }),
    { name: 'health-store' }
  )
)
