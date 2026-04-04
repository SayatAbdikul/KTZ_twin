import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AuthUser } from '@/types/auth'

interface AuthState {
  accessToken: string | null
  user: AuthUser | null
  mustChangePassword: boolean
  hasHydrated: boolean
  isBootstrapping: boolean
  setSession: (accessToken: string, user: AuthUser, mustChangePassword?: boolean) => void
  clearSession: () => void
  setBootstrapping: (isBootstrapping: boolean) => void
  markHydrated: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      mustChangePassword: false,
      hasHydrated: true,
      isBootstrapping: false,
      setSession: (accessToken, user, mustChangePassword = Boolean(user.mustChangePassword)) =>
        set({
          accessToken,
          user,
          mustChangePassword,
        }),
      clearSession: () =>
        set({
          accessToken: null,
          user: null,
          mustChangePassword: false,
        }),
      setBootstrapping: (isBootstrapping) => set({ isBootstrapping }),
      markHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: 'ktz-auth-session',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        mustChangePassword: state.mustChangePassword,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated()
      },
    }
  )
)
