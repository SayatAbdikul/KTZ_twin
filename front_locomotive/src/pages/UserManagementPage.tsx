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
  const [role, setRole] = useState<CreateRole>('regular_train')
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
      setError(err instanceof Error ? err.message : 'Не удалось загрузить пользователей.')
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
      trains: users.filter((user) => user.role === 'regular_train'),
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
        username: role === 'regular_train' ? undefined : username.trim(),
        displayName: displayName.trim(),
        locomotiveId: role === 'regular_train' ? locomotiveId.trim().toUpperCase() : undefined,
      })
      setTemporaryPassword(result.temporaryPassword)
      setPasswordOwner(result.user.displayName ?? result.user.username ?? result.user.locomotiveId ?? 'Новый пользователь')
      setUsername('')
      setDisplayName('')
      setLocomotiveId('KTZ-2001')
      await reloadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать пользователя.')
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
      setError(err instanceof Error ? err.message : 'Не удалось обновить пользователя.')
    }
  }

  async function handleResetPassword(user: AuthUser) {
    if (!accessToken) return

    try {
      const result = await resetUserPassword(accessToken, user.id)
      setTemporaryPassword(result.temporaryPassword)
      setPasswordOwner(result.user.displayName ?? result.user.username ?? result.user.locomotiveId ?? 'Пользователь')
      await reloadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить пароль.')
    }
  }

  function renderUserCard(user: AuthUser) {
    const identity = user.role === 'regular_train' ? user.locomotiveId : user.username
    return (
      <div
        key={user.id}
        className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-lg shadow-slate-950/20"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">
              {user.displayName ?? identity ?? 'Пользователь без имени'}
            </div>
            <div className="mt-1 text-sm text-slate-400">
              {user.role === 'regular_train' ? `Локомотив ${identity ?? 'не назначен'}` : identity ?? 'Нет имени пользователя'}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full border border-slate-700 px-2 py-1 uppercase tracking-[0.18em]">
                {user.role === 'admin' ? 'админ' : user.role === 'dispatcher' ? 'диспетчер' : 'локомотив'}
              </span>
              <span className="rounded-full border border-slate-700 px-2 py-1">
                {user.status === 'disabled' ? 'отключён' : 'активен'}
              </span>
              <span className="rounded-full border border-slate-700 px-2 py-1">
                Последний вход: {user.lastLoginAt ? formatTimestamp(user.lastLoginAt) : 'Никогда'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void toggleStatus(user)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
            >
              {user.status === 'disabled' ? 'Включить' : 'Отключить'}
            </button>
            <button
              type="button"
              onClick={() => void handleResetPassword(user)}
              className="rounded-xl bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-500/25"
            >
              Сбросить пароль
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-2xl shadow-slate-950/25">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Админ</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Управление пользователями</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Создавайте учётные записи администраторов, диспетчеров и локомотивов. Новые и сброшенные учётные записи получают временный пароль
          и должны сменить его при первом входе.
        </p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <form
          onSubmit={handleCreateUser}
          className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-2xl shadow-slate-950/25"
        >
          <h2 className="text-lg font-semibold text-white">Создать учётную запись</h2>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Роль</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as CreateRole)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
              >
                <option value="regular_train">Локомотив</option>
                <option value="dispatcher">Диспетчер</option>
                <option value="admin">Администратор</option>
              </select>
            </label>

            {role === 'regular_train' ? (
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Идентификатор локомотива</span>
                <input
                  value={locomotiveId}
                  onChange={(event) => setLocomotiveId(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
                />
              </label>
            ) : (
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Имя пользователя</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Отображаемое имя</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
              />
            </label>

            {temporaryPassword ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                Временный пароль для {passwordOwner ?? 'пользователя'}: <span className="font-mono">{temporaryPassword}</span>
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
                (role === 'regular_train' ? !locomotiveId.trim() : !username.trim())
              }
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {creating ? 'Создание учётной записи...' : 'Создать учётную запись'}
            </button>
          </div>
        </form>

        <section className="space-y-5">
          {loading ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-sm text-slate-400">
              Загрузка пользователей...
            </div>
          ) : null}

          {!loading ? (
            <>
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white">Администраторы</h2>
                <div className="space-y-3">
                  {groupedUsers.admins.map(renderUserCard)}
                  {groupedUsers.admins.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
                      Учётные записи администраторов не найдены.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white">Диспетчеры</h2>
                <div className="space-y-3">
                  {groupedUsers.dispatchers.map(renderUserCard)}
                  {groupedUsers.dispatchers.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
                      Учётные записи диспетчеров не найдены.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white">Учётные записи локомотивов</h2>
                <div className="space-y-3">
                  {groupedUsers.trains.map(renderUserCard)}
                  {groupedUsers.trains.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
                      Учётные записи локомотивов не найдены.
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
