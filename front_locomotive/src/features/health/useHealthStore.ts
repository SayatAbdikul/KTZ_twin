import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { HealthIndex } from '@/types/health'

interface HealthState {
  healthIndex: HealthIndex | null
  lastUpdated: number | null
  applyUpdate: (index: HealthIndex) => void
}

export const useHealthStore = create<HealthState>()(
  devtools(
    (set) => ({
      healthIndex: null,
      lastUpdated: null,
      applyUpdate: (index) => set({ healthIndex: index, lastUpdated: Date.now() }),
    }),
    { name: 'health-store' }
  )
)
