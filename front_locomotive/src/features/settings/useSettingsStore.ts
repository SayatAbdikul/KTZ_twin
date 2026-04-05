import { create } from 'zustand'
import { createJSONStorage, devtools, persist } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light'

function resolveInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const storedTheme = window.localStorage.getItem('ktz-theme')
  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

interface SettingsState {
  smoothingEnabled: boolean
  smoothingAlpha: number
  theme: ThemeMode
  toggleSmoothing: () => void
  setAlpha: (alpha: number) => void
  toggleTheme: () => void
  setTheme: (theme: ThemeMode) => void
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      (set) => ({
        smoothingEnabled: true,
        smoothingAlpha: 0.3,
        theme: resolveInitialTheme(),

        toggleSmoothing: () =>
          set((state) => ({ smoothingEnabled: !state.smoothingEnabled })),
        setAlpha: (alpha) => set({ smoothingAlpha: alpha }),
        toggleTheme: () =>
          set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
        setTheme: (theme) => set({ theme }),
      }),
      {
        name: 'settings-store',
        storage: createJSONStorage(() => window.localStorage),
      }
    ),
    { name: 'settings-store' }
  )
)
