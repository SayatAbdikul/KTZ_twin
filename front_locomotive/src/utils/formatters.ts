import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'

export function formatMetricValue(value: number, precision: number): string {
  return value.toFixed(precision)
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function relativeTime(ts: number): string {
  return formatDistanceToNow(ts, { addSuffix: true, locale: ru })
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}с`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}м ${s % 60}с`
  const h = Math.floor(m / 60)
  return `${h}ч ${m % 60}м`
}
