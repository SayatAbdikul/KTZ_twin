import { Moon, Sun } from 'lucide-react'
import { useSettingsStore } from '@/features/settings/useSettingsStore'
import { cn } from '@/utils/cn'

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const theme = useSettingsStore((state) => state.theme)
  const toggleTheme = useSettingsStore((state) => state.toggleTheme)

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white',
        className
      )}
    >
      {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
      <span>{theme === 'dark' ? 'Светлая' : 'Тёмная'} тема</span>
    </button>
  )
}
