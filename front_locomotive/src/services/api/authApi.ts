import { APP_CONFIG } from '@/config/app.config'
import type { LoginResponse, UserRole } from '@/types/auth'

class LoginError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'LoginError'
    this.status = status
  }
}

interface LoginParams {
  role: UserRole
  username?: string
  trainId?: string
  password: string
}

export async function login(params: LoginParams): Promise<LoginResponse> {
  const response = await fetch(`${APP_CONFIG.AUTH_API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.data) {
    const message =
      payload?.detail ??
      payload?.error?.message ??
      'Login failed. Check the provided credentials.'
    throw new LoginError(response.status, message)
  }

  return payload.data as LoginResponse
}
