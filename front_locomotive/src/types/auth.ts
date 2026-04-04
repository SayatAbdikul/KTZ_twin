export type UserRole = 'admin' | 'train'

export interface AuthUser {
  role: UserRole
  username?: string | null
  trainId?: string | null
  displayName?: string | null
}

export interface LoginResponse {
  token: string
  user: AuthUser
  seededAccounts?: {
    admins: Array<{ username: string; displayName: string }>
    trains: Array<{ trainId: string; displayName: string }>
  }
}
