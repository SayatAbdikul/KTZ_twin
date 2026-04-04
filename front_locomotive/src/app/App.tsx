import { useEffect } from 'react'
import { Navigate, Outlet, createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Providers } from './providers'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/pages/DashboardPage'
import { DiagramPage } from '@/pages/DiagramPage'
import { TelemetryPage } from '@/pages/TelemetryPage'
import { AlertsPage } from '@/pages/AlertsPage'
import { MessagesPage } from '@/pages/MessagesPage'
import { ReplayPage } from '@/pages/ReplayPage'
import { DispatchConsolePage } from '@/pages/DispatchConsolePage'
import { LoginPage } from '@/pages/LoginPage'
import { ChangePasswordPage } from '@/pages/ChangePasswordPage'
import { UserManagementPage } from '@/pages/UserManagementPage'
import { ROUTES } from '@/config/routes'
import { useWebSocketLifecycle } from './useWebSocketLifecycle'
import { useMetricDefinitions } from '@/features/telemetry/useTelemetryQueries'
import { useAuthStore } from '@/features/auth/useAuthStore'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { logoutSession, refreshSession } from '@/services/api/authApi'

const BOOTSTRAP_REFRESH_TIMEOUT_MS = 9000

async function refreshSessionWithTimeout() {
    let timeoutId: number | undefined
    try {
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error('Session bootstrap timeout')), BOOTSTRAP_REFRESH_TIMEOUT_MS)
        })
        return await Promise.race([refreshSession(), timeoutPromise])
    } finally {
        if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId)
        }
    }
}

const router = createBrowserRouter([
  {
    path: ROUTES.LOGIN,
    element: <PublicOnlyRoute />,
    children: [{ index: true, element: <LoginPage /> }],
  },
  {
    element: <ProtectedRoot />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: ROUTES.DIAGRAM, element: <DiagramPage /> },
      { path: ROUTES.TELEMETRY, element: <TelemetryPage /> },
      { path: ROUTES.ALERTS, element: <AlertsPage /> },
      { path: ROUTES.MESSAGES, element: <MessagesPage /> },
      { path: ROUTES.REPLAY, element: <ReplayPage /> },
      {
        path: ROUTES.DISPATCH,
        element: <AdminOnlyRoute />,
        children: [{ index: true, element: <DispatchConsolePage /> }],
      },
      {
        path: ROUTES.USERS,
        element: <AdminOnlyRoute />,
        children: [{ index: true, element: <UserManagementPage /> }],
      },
    ],
  },
])

function FullscreenLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090b10] text-sm text-slate-400">
      Restoring secure session...
    </div>
  )
}

function PublicOnlyRoute() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const user = useAuthStore((state) => state.user)
  if (accessToken && user) {
    return <Navigate to={ROUTES.DASHBOARD} replace />
  }
  return <Outlet />
}

function AdminOnlyRoute() {
  const user = useAuthStore((state) => state.user)
  if (user?.role !== 'admin') {
    return <Navigate to={ROUTES.DASHBOARD} replace />
  }
  return <Outlet />
}

function ProtectedRoot() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const user = useAuthStore((state) => state.user)
  const mustChangePassword = useAuthStore((state) => state.mustChangePassword)

  if (!accessToken || !user) {
    return <Navigate to={ROUTES.LOGIN} replace />
  }

  if (mustChangePassword) {
    return <ChangePasswordPage />
  }

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const user = useAuthStore((state) => state.user)
  const accessToken = useAuthStore((state) => state.accessToken)
  const selectLocomotive = useFleetStore((state) => state.selectLocomotive)

  useEffect(() => {
    if (user?.role === 'train' && user.locomotiveId) {
      selectLocomotive(user.locomotiveId)
    }
  }, [selectLocomotive, user])

  useWebSocketLifecycle(accessToken)
  useMetricDefinitions()
  return <AppShell />
}

function BootstrappedRouter() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const user = useAuthStore((state) => state.user)
  const hasHydrated = useAuthStore((state) => state.hasHydrated)
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping)
  const setSession = useAuthStore((state) => state.setSession)
  const clearSession = useAuthStore((state) => state.clearSession)
  const setBootstrapping = useAuthStore((state) => state.setBootstrapping)

  useEffect(() => {
    if (!hasHydrated) {
      return
    }

    if (accessToken && user) {
      if (user.role === 'dispatcher') {
        void logoutSession(accessToken)
        clearSession()
      }
      return
    }

    let cancelled = false
    setBootstrapping(true)
    void refreshSessionWithTimeout()
      .then((session) => {
        if (cancelled) return
        if (session.user.role === 'dispatcher') {
          void logoutSession(session.accessToken)
          clearSession()
          return
        }
        setSession(session.accessToken, session.user, session.mustChangePassword)
      })
      .catch(() => {
        if (!cancelled) {
          clearSession()
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBootstrapping(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    accessToken,
    clearSession,
    hasHydrated,
    setBootstrapping,
    setSession,
    user,
  ])

  if (!hasHydrated || isBootstrapping) {
    return <FullscreenLoading />
  }

  return <RouterProvider router={router} />
}

export function App() {
  return (
    <Providers>
      <BootstrappedRouter />
    </Providers>
  )
}
