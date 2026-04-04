import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Providers } from './providers'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/pages/DashboardPage'
import { DiagramPage } from '@/pages/DiagramPage'
import { TelemetryPage } from '@/pages/TelemetryPage'
import { AlertsPage } from '@/pages/AlertsPage'
import { MessagesPage } from '@/pages/MessagesPage'
import { ReplayPage } from '@/pages/ReplayPage'
import { ROUTES } from '@/config/routes'
import { useWebSocketLifecycle } from './useWebSocketLifecycle'
import { useMetricDefinitions } from '@/features/telemetry/useTelemetryQueries'

const router = createBrowserRouter([
  {
    element: <RootWithWs />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: ROUTES.DIAGRAM, element: <DiagramPage /> },
      { path: ROUTES.TELEMETRY, element: <TelemetryPage /> },
      { path: ROUTES.ALERTS, element: <AlertsPage /> },
      { path: ROUTES.MESSAGES, element: <MessagesPage /> },
      { path: ROUTES.REPLAY, element: <ReplayPage /> },
    ],
  },
])

function RootWithWs() {
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
