import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Train,
  Activity,
  AlertTriangle,
  MessageSquare,
  History,
} from 'lucide-react'
import { ROUTES } from '@/config/routes'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import { useMessageStore } from '@/features/dispatcher-messages/useMessageStore'
import { cn } from '@/utils/cn'

const NAV_ITEMS = [
  { to: ROUTES.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard' },
  { to: ROUTES.DIAGRAM, icon: Train, label: 'Diagram' },
  { to: ROUTES.TELEMETRY, icon: Activity, label: 'Telemetry' },
  { to: ROUTES.ALERTS, icon: AlertTriangle, label: 'Alerts' },
  { to: ROUTES.MESSAGES, icon: MessageSquare, label: 'Messages' },
  { to: ROUTES.REPLAY, icon: History, label: 'History' },
]

export function Sidebar() {
  const alertSummary = useAlertStore((s) => s.summary)
  const messageSummary = useMessageStore((s) => s.summary)

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
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
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
