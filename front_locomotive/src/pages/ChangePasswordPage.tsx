import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { resetSessionState } from '@/app/resetSessionState'
import { ROUTES } from '@/config/routes'
import { useAuthStore } from '@/features/auth/useAuthStore'
import { changePassword, logoutSession } from '@/services/api/authApi'

export function ChangePasswordPage() {
  const navigate = useNavigate()
  const accessToken = useAuthStore((state) => state.accessToken)
  const user = useAuthStore((state) => state.user)
  const setSession = useAuthStore((state) => state.setSession)
  const clearSession = useAuthStore((state) => state.clearSession)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken) {
      setError('Your session has expired. Please sign in again.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const session = await changePassword(accessToken, {
        currentPassword,
        newPassword,
      })
      setSession(session.accessToken, session.user, session.mustChangePassword)
      navigate(ROUTES.DASHBOARD, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignOut() {
    await logoutSession(accessToken)
    resetSessionState()
    clearSession()
    navigate(ROUTES.LOGIN, { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.15),_transparent_35%),linear-gradient(180deg,#090b10_0%,#101521_100%)] px-4 py-10 text-slate-100">
      <section className="w-full max-w-xl rounded-[28px] border border-slate-800/80 bg-slate-950/85 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-300">Password Required</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Change your password to continue</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {user?.displayName ?? user?.username ?? user?.locomotiveId ?? 'This account'} must set a new password
          before accessing the operator console.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Current password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Confirm new password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button
              type="submit"
              disabled={
                submitting ||
                !currentPassword.trim() ||
                !newPassword.trim() ||
                !confirmPassword.trim()
              }
              className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {submitting ? 'Updating password...' : 'Save new password'}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
