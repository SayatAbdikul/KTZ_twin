import { APP_CONFIG } from '@/config/app.config'

export function isStale(timestamp: number, maxAgeMs = APP_CONFIG.STALE_THRESHOLD_MS): boolean {
  return Date.now() - timestamp > maxAgeMs
}

export function now(): number {
  return Date.now()
}
