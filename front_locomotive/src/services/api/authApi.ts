import { APP_CONFIG } from '@/config/app.config'
import type {
  AuthSessionResponse,
  AuthUser,
  CreateUserPayload,
  CreatedUserResult,
  UpdateUserPayload,
} from '@/types/auth'

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

async function authRequest<T>(
  path: string,
  options?: RequestInit & {
    token?: string
    allowEmpty?: boolean
  }
): Promise<T> {
  const response = await fetchWithTimeout(`${APP_CONFIG.AUTH_API_BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(options?.token, options?.headers),
    credentials: 'include',
  })

  if (options?.allowEmpty && response.status === 204) {
    return undefined as T
  }

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

export async function login(params: { identifier: string; password: string }): Promise<AuthSessionResponse> {
  return authRequest<AuthSessionResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

async function rawRefreshSession(): Promise<AuthSessionResponse> {
  return authRequest<AuthSessionResponse>('/api/auth/refresh', {
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
  await fetchWithTimeout(`${APP_CONFIG.AUTH_API_BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: buildHeaders(accessToken ?? undefined),
    credentials: 'include',
  }).catch(() => undefined)
}

export async function changePassword(
  accessToken: string,
  params: {
    currentPassword: string
    newPassword: string
  }
): Promise<AuthSessionResponse> {
  return authRequest<AuthSessionResponse>('/api/auth/change-password', {
    method: 'POST',
    token: accessToken,
    body: JSON.stringify(params),
  })
}

export async function getCurrentUser(accessToken: string): Promise<{ user: AuthUser; mustChangePassword: boolean }> {
  return authRequest<{ user: AuthUser; mustChangePassword: boolean }>('/api/auth/me', {
    method: 'GET',
    token: accessToken,
  })
}

export async function listUsers(accessToken: string): Promise<AuthUser[]> {
  return authRequest<AuthUser[]>('/api/admin/users', {
    method: 'GET',
    token: accessToken,
  })
}

export async function createUser(accessToken: string, payload: CreateUserPayload): Promise<CreatedUserResult> {
  return authRequest<CreatedUserResult>('/api/admin/users', {
    method: 'POST',
    token: accessToken,
    body: JSON.stringify(payload),
  })
}

export async function updateUser(
  accessToken: string,
  userId: number,
  payload: UpdateUserPayload
): Promise<AuthUser> {
  return authRequest<AuthUser>(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    token: accessToken,
    body: JSON.stringify(payload),
  })
}

export async function resetUserPassword(
  accessToken: string,
  userId: number
): Promise<CreatedUserResult> {
  return authRequest<CreatedUserResult>(`/api/admin/users/${userId}/reset-password`, {
    method: 'POST',
    token: accessToken,
  })
}

export { AuthApiError }
