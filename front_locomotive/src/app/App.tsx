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
import { ROUTES } from '@/config/routes'
import { useWebSocketLifecycle } from './useWebSocketLifecycle'
import { useMetricDefinitions } from '@/features/telemetry/useTelemetryQueries'
import { useAuthStore } from '@/features/auth/useAuthStore'
import { useFleetStore } from '@/features/fleet/useFleetStore'

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
    ],
  },
])

function PublicOnlyRoute() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  if (token && user) {
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
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)

  if (!token || !user) {
    return <Navigate to={ROUTES.LOGIN} replace />
  }

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const user = useAuthStore((state) => state.user)
  const selectLocomotive = useFleetStore((state) => state.selectLocomotive)

  useEffect(() => {
    if (user?.role === 'train' && user.trainId) {
      selectLocomotive(user.trainId)
    }
  }, [selectLocomotive, user])

  useWebSocketLifecycle()
  useMetricDefinitions()
  return <AppShell />
}

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}
