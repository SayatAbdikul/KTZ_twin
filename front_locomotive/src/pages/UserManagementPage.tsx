import { useCallback, useEffect, useMemo, useState } from 'react'
import { createUser, listUsers, resetUserPassword, updateUser } from '@/services/api/authApi'
import { useAuthStore } from '@/features/auth/useAuthStore'
import type { AuthUser, UserRole } from '@/types/auth'
import { formatTimestamp } from '@/utils/formatters'

type CreateRole = Exclude<UserRole, never>

export function UserManagementPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [role, setRole] = useState<CreateRole>('train')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [locomotiveId, setLocomotiveId] = useState('KTZ-2001')
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null)
  const [passwordOwner, setPasswordOwner] = useState<string | null>(null)

  const reloadUsers = useCallback(async () => {
    if (!accessToken) {
      setUsers([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const nextUsers = await listUsers(accessToken)
      setUsers(nextUsers)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    void reloadUsers()
  }, [reloadUsers])

  const groupedUsers = useMemo(() => {
    return {
      admins: users.filter((user) => user.role === 'admin'),
      dispatchers: users.filter((user) => user.role === 'dispatcher'),
      trains: users.filter((user) => user.role === 'train'),
    }
  }, [users])

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken) return

    setCreating(true)
    setError(null)
    try {
      const result = await createUser(accessToken, {
        role,
        username: role === 'train' ? undefined : username.trim(),
        displayName: displayName.trim(),
        locomotiveId: role === 'train' ? locomotiveId.trim().toUpperCase() : undefined,
      })
      setTemporaryPassword(result.temporaryPassword)
      setPasswordOwner(result.user.displayName ?? result.user.username ?? result.user.locomotiveId ?? 'New user')
      setUsername('')
      setDisplayName('')
      setLocomotiveId('KTZ-2001')
      await reloadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user.')
    } finally {
      setCreating(false)
    }
  }

  async function toggleStatus(user: AuthUser) {
    if (!accessToken) return

    try {
      const nextStatus = user.status === 'disabled' ? 'active' : 'disabled'
      await updateUser(accessToken, user.id, { status: nextStatus })
      await reloadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user.')
    }
  }

  async function handleResetPassword(user: AuthUser) {
    if (!accessToken) return

    try {
      const result = await resetUserPassword(accessToken, user.id)
      setTemporaryPassword(result.temporaryPassword)
      setPasswordOwner(result.user.displayName ?? result.user.username ?? result.user.locomotiveId ?? 'User')
      await reloadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.')
    }
  }

  function renderUserCard(user: AuthUser) {
    const identity = user.role === 'train' ? user.locomotiveId : user.username
    return (
      <div
        key={user.id}
        className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-lg shadow-slate-950/20"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">
              {user.displayName ?? identity ?? 'Unnamed user'}
            </div>
            <div className="mt-1 text-sm text-slate-400">
              {user.role === 'train' ? `Locomotive ${identity ?? 'unassigned'}` : identity ?? 'No username'}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full border border-slate-700 px-2 py-1 uppercase tracking-[0.18em]">
                {user.role}
              </span>
              <span className="rounded-full border border-slate-700 px-2 py-1">
                {user.status ?? 'active'}
              </span>
              <span className="rounded-full border border-slate-700 px-2 py-1">
                Last login: {user.lastLoginAt ? formatTimestamp(user.lastLoginAt) : 'Never'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void toggleStatus(user)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
            >
              {user.status === 'disabled' ? 'Enable' : 'Disable'}
            </button>
            <button
              type="button"
              onClick={() => void handleResetPassword(user)}
              className="rounded-xl bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-500/25"
            >
              Reset Password
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-2xl shadow-slate-950/25">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Admin</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">User Management</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Create admin, dispatcher, and train accounts. New and reset accounts receive a temporary password and
          must change it on first use.
        </p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <form
          onSubmit={handleCreateUser}
          className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-2xl shadow-slate-950/25"
        >
          <h2 className="text-lg font-semibold text-white">Create account</h2>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Role</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as CreateRole)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
              >
                <option value="train">Train</option>
                <option value="dispatcher">Dispatcher</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            {role === 'train' ? (
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Locomotive ID</span>
                <input
                  value={locomotiveId}
                  onChange={(event) => setLocomotiveId(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
                />
              </label>
            ) : (
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Username</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
              />
            </label>

            {temporaryPassword ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                Temporary password for {passwordOwner ?? 'user'}: <span className="font-mono">{temporaryPassword}</span>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={
                creating ||
                !displayName.trim() ||
                (role === 'train' ? !locomotiveId.trim() : !username.trim())
              }
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {creating ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>

        <section className="space-y-5">
          {loading ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-sm text-slate-400">
              Loading users...
            </div>
          ) : null}

          {!loading ? (
            <>
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white">Admins</h2>
                <div className="space-y-3">
                  {groupedUsers.admins.map(renderUserCard)}
                  {groupedUsers.admins.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
                      No admin accounts found.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white">Dispatchers</h2>
                <div className="space-y-3">
                  {groupedUsers.dispatchers.map(renderUserCard)}
                  {groupedUsers.dispatchers.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
                      No dispatcher accounts found.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white">Train Accounts</h2>
                <div className="space-y-3">
                  {groupedUsers.trains.map(renderUserCard)}
                  {groupedUsers.trains.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
                      No train accounts found.
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </section>
      </section>
    </div>
  )
}
