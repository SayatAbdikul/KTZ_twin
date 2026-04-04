import { CONFIG } from '../config'
import type { AuthSessionResponse } from '../types'

class AuthApiError extends Error {
    status: number
    code: string

    constructor(status: number, code: string, message: string) {
        super(message)
        this.name = 'AuthApiError'
        this.status = status
        this.code = code
    }
}

interface ApiEnvelope<T> {
    data: T
    timestamp?: number
    error?: {
        code?: string
        message?: string
    }
    detail?: string
}

let refreshPromise: Promise<AuthSessionResponse> | null = null
const AUTH_REQUEST_TIMEOUT_MS = 8000

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AuthApiError(408, 'AUTH_TIMEOUT', 'Authentication service timeout. Please try again.')
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function buildHeaders(token?: string, extra?: HeadersInit): Headers {
    const headers = new Headers(extra ?? {})
    headers.set('Content-Type', 'application/json')
    if (token) {
        headers.set('Authorization', `Bearer ${token}`)
    }
    return headers
}

async function request<T>(
    path: string,
    options?: RequestInit & {
        token?: string
    }
): Promise<T> {
    const response = await fetchWithTimeout(`${CONFIG.AUTH_API_BASE_URL}${path}`, {
        ...options,
        headers: buildHeaders(options?.token, options?.headers),
        credentials: 'include',
    })

    const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null
    if (!response.ok || !payload?.data) {
        const message =
            payload?.detail ??
            payload?.error?.message ??
            'Authentication request failed.'
        const code = payload?.error?.code ?? 'AUTH_ERROR'
        throw new AuthApiError(response.status, code, message)
    }

    return payload.data
}

export async function login(identifier: string, password: string): Promise<AuthSessionResponse> {
    return request<AuthSessionResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
    })
}

async function rawRefreshSession(): Promise<AuthSessionResponse> {
    return request<AuthSessionResponse>('/api/auth/refresh', {
        method: 'POST',
    })
}

export async function refreshSession(): Promise<AuthSessionResponse> {
    if (refreshPromise) {
        return refreshPromise
    }

    refreshPromise = rawRefreshSession().finally(() => {
        refreshPromise = null
    })
    return refreshPromise
}

export async function logoutSession(accessToken?: string | null): Promise<void> {
    await fetchWithTimeout(`${CONFIG.AUTH_API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: buildHeaders(accessToken ?? undefined),
        credentials: 'include',
    }).catch(() => undefined)
}

export async function changePassword(
    accessToken: string,
    currentPassword: string,
    newPassword: string
): Promise<AuthSessionResponse> {
    return request<AuthSessionResponse>('/api/auth/change-password', {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify({
            currentPassword,
            newPassword,
        }),
    })
}

export { AuthApiError }
