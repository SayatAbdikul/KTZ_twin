export type UserRole = 'admin' | 'dispatcher' | 'regular_train'

export type UserStatus = 'active' | 'disabled'

export interface AuthUser {
  id: number
  role: UserRole
  username?: string | null
  displayName?: string | null
  locomotiveId?: string | null
  status?: UserStatus | null
  mustChangePassword?: boolean
  createdAt?: number | null
  updatedAt?: number | null
  lastLoginAt?: number | null
}

export interface AuthSessionResponse {
  accessToken: string
  user: AuthUser
  mustChangePassword: boolean
}

export interface CreateUserPayload {
  role: Exclude<UserRole, 'dispatcher'> | 'dispatcher'
  username?: string
  displayName: string
  locomotiveId?: string
}

export interface UpdateUserPayload {
  displayName?: string
  status?: UserStatus
  locomotiveId?: string
}

export interface CreatedUserResult {
  user: AuthUser
  temporaryPassword: string
}
