import { APP_CONFIG } from '@/config/app.config'
import { useAuthStore } from '@/features/auth/useAuthStore'
import type { ApiResponse } from '@/types/api'

class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function buildHeaders(headers: HeadersInit | undefined): Headers {
  const merged = new Headers(headers ?? {})
  merged.set('Content-Type', 'application/json')
  const token = useAuthStore.getState().token
  if (token) {
    merged.set('Authorization', `Bearer ${token}`)
  }
  return merged
}

function createRequest(baseUrl: string) {
  return async function request<T>(
    path: string,
    options?: RequestInit & { params?: Record<string, string | number> }
  ): Promise<ApiResponse<T>> {
    let url = `${baseUrl}${path}`

    if (options?.params) {
      const qs = new URLSearchParams(
        Object.entries(options.params).map(([k, v]) => [k, String(v)])
      ).toString()
      url = `${url}?${qs}`
    }

    const res = await fetch(url, {
      ...options,
      headers: buildHeaders(options?.headers),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ code: 'UNKNOWN', message: res.statusText }))
      throw new ApiError(res.status, err.code, err.message)
    }

    return res.json() as Promise<ApiResponse<T>>
  }
}

export function createApiClient(baseUrl: string) {
  const request = createRequest(baseUrl)

  return {
    get: <T>(path: string, options?: { params?: Record<string, string | number> }) =>
      request<T>(path, { method: 'GET', ...options }),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
    put: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  }
}

export const apiClient = createApiClient(APP_CONFIG.API_BASE_URL)
