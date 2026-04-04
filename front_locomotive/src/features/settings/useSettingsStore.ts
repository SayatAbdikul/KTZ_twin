import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface SettingsState {
  smoothingEnabled: boolean
  smoothingAlpha: number
  toggleSmoothing: () => void
  setAlpha: (alpha: number) => void
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    (set) => ({
      smoothingEnabled: true,
      smoothingAlpha: 0.3,

      toggleSmoothing: () =>
        set((state) => ({ smoothingEnabled: !state.smoothingEnabled })),
      setAlpha: (alpha) => set({ smoothingAlpha: alpha }),
    }),
    { name: 'settings-store' }
  )
)
