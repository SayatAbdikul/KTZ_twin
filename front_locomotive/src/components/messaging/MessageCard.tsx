import { cn } from '@/utils/cn'
import { relativeTime } from '@/utils/formatters'
import type { DispatcherMessage } from '@/types/messages'

interface MessageCardProps {
  message: DispatcherMessage
  onAcknowledge?: (messageId: string) => void
}

const PRIORITY_STYLES: Record<DispatcherMessage['priority'], string> = {
  urgent: 'border-red-500/40 bg-red-500/10',
  high: 'border-amber-500/30 bg-amber-500/5',
  normal: 'border-slate-700/50 bg-slate-800/30',
  low: 'border-slate-800/50 bg-slate-900/30',
}

const PRIORITY_BADGE: Record<DispatcherMessage['priority'], string> = {
  urgent: 'bg-red-500/20 text-red-300',
  high: 'bg-amber-500/20 text-amber-300',
  normal: 'bg-slate-600/30 text-slate-400',
  low: 'bg-slate-700/30 text-slate-500',
}

export function MessageCard({ message, onAcknowledge }: MessageCardProps) {
  const isUnread = !message.readAt
  const isAcked = !!message.acknowledgedAt

  return (
    <div className={cn('rounded-lg border p-3 transition-colors', PRIORITY_STYLES[message.priority])}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {isUnread && <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />}
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              PRIORITY_BADGE[message.priority]
            )}
          >
            {message.priority}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-slate-500">{message.type}</span>
        </div>
        <span className="flex-shrink-0 text-xs text-slate-500">{relativeTime(message.sentAt)}</span>
      </div>

      <p className={cn('text-sm font-medium leading-snug', isUnread ? 'text-slate-100' : 'text-slate-300')}>
        {message.subject}
      </p>
      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{message.body}</p>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-600">{message.senderName}</span>
        {!isAcked && onAcknowledge && (
          <button
            onClick={() => onAcknowledge(message.messageId)}
            className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
          >
            Acknowledge
          </button>
        )}
        {isAcked && <span className="text-xs text-emerald-500">Acknowledged</span>}
      </div>
    </div>
  )
}
