import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Download } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface ExportAction {
  id: string
  label: string
  description?: string
  disabled?: boolean
  onSelect: () => void | Promise<void>
}

interface ExportMenuProps {
  actions: ExportAction[]
  label?: string
}

export function ExportMenu({ actions, label = 'Export' }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  const visibleActions = actions.filter(Boolean)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (visibleActions.length === 0) {
    return null
  }

  async function handleSelect(action: ExportAction) {
    if (action.disabled) {
      return
    }
    setIsOpen(false)
    await action.onSelect()
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
          'border-slate-700 bg-slate-900/70 text-slate-100 hover:border-slate-600 hover:bg-slate-800',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60'
        )}
      >
        <Download size={16} className="text-blue-300" />
        <span>{label}</span>
        <ChevronDown
          size={16}
          className={cn('text-slate-400 transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-slate-700 bg-slate-950/95 shadow-2xl shadow-slate-950/50 backdrop-blur"
        >
          <div className="p-1.5">
            {visibleActions.map((action) => (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => void handleSelect(action)}
                className={cn(
                  'flex w-full flex-col items-start rounded-lg px-3 py-2.5 text-left transition-colors',
                  action.disabled
                    ? 'cursor-not-allowed text-slate-500'
                    : 'text-slate-100 hover:bg-slate-800'
                )}
              >
                <span className="text-sm font-medium">{action.label}</span>
                {action.description && (
                  <span className="mt-1 text-xs text-slate-400">{action.description}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
