import type { ComponentType } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Train,
  Activity,
  AlertTriangle,
  MessageSquare,
  History,
  Radio,
} from 'lucide-react'
import { ROUTES } from '@/config/routes'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useAuthStore } from '@/features/auth/useAuthStore'
import { useMessageStore } from '@/features/dispatcher-messages/useMessageStore'
import { useFleetStore } from '@/features/fleet/useFleetStore'
import { cn } from '@/utils/cn'
import type { AlertSummary } from '@/types/alerts'
import type { UserRole } from '@/types/auth'
import type { MessageSummary } from '@/types/messages'

interface NavItem {
  to: string
  icon: ComponentType<{ size?: number }>
  label: string
  roles?: readonly UserRole[]
}

const NAV_ITEMS: NavItem[] = [
  { to: ROUTES.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard' },
  { to: ROUTES.DIAGRAM, icon: Train, label: 'Diagram' },
  { to: ROUTES.TELEMETRY, icon: Activity, label: 'Telemetry' },
  { to: ROUTES.ALERTS, icon: AlertTriangle, label: 'Alerts' },
  { to: ROUTES.MESSAGES, icon: MessageSquare, label: 'Messages' },
  { to: ROUTES.REPLAY, icon: History, label: 'History' },
  { to: ROUTES.DISPATCH, icon: Radio, label: 'Dispatch', roles: ['admin'] as const },
]

const EMPTY_ALERT_SUMMARY: AlertSummary = {
  criticalCount: 0,
  warningCount: 0,
  infoCount: 0,
  totalActive: 0,
}

const EMPTY_MESSAGE_SUMMARY: MessageSummary = {
  totalUnread: 0,
  urgentUnread: 0,
}

export function Sidebar() {
  const role = useAuthStore((state) => state.user?.role)
  const selectedLocomotiveId = useFleetStore((s) => s.selectedLocomotiveId)
  const alertSummaryByLocomotive = useAlertStore((s) => s.summaryByLocomotive)
  const messageSummaryByLocomotive = useMessageStore((s) => s.summaryByLocomotive)
  const alertSummary = selectedLocomotiveId
    ? alertSummaryByLocomotive[selectedLocomotiveId] ?? EMPTY_ALERT_SUMMARY
    : EMPTY_ALERT_SUMMARY
  const messageSummary = selectedLocomotiveId
    ? messageSummaryByLocomotive[selectedLocomotiveId] ?? EMPTY_MESSAGE_SUMMARY
    : EMPTY_MESSAGE_SUMMARY

  const badges: Record<string, number> = {
    [ROUTES.ALERTS]: alertSummary.totalActive,
    [ROUTES.MESSAGES]: messageSummary.totalUnread,
  }

  return (
    <aside className="flex w-16 flex-col items-center border-r border-slate-800 bg-[#0c0e14] py-4">
      {/* Logo */}
      <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
        KTZ
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role))).map(({ to, icon: Icon, label }) => {
          const badgeCount = badges[to] ?? 0
          return (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                cn(
                  'relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors',
                  isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
                )
              }
            >
              <Icon size={20} />
              {badgeCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
