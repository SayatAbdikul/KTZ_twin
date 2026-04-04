import { useState } from 'react'
import { LockKeyhole, Shield, TrainFront } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { resetSessionState } from '@/app/resetSessionState'
import { ROUTES } from '@/config/routes'
import { useAuthStore } from '@/features/auth/useAuthStore'
import { login } from '@/services/api/authApi'
import type { UserRole } from '@/types/auth'
import { cn } from '@/utils/cn'

export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((state) => state.setSession)
  const [role, setRole] = useState<UserRole>('train')
  const [username, setUsername] = useState('admin')
  const [trainId, setTrainId] = useState('KTZ-2001')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const session = await login({
        role,
        username: role === 'admin' ? username.trim() : undefined,
        trainId: role === 'train' ? trainId.trim().toUpperCase() : undefined,
        password,
      })
      resetSessionState()
      setSession(session.token, session.user)
      navigate(ROUTES.DASHBOARD, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_35%),linear-gradient(180deg,#090b10_0%,#0f1117_46%,#151925_100%)] px-4 py-10 text-slate-100">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_480px]">
        <section className="flex flex-col justify-between rounded-[32px] border border-slate-800/80 bg-slate-950/50 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur">
          <div>
            <div className="inline-flex rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-200">
              KTZ Digital Twin
            </div>
            <h1 className="mt-6 max-w-xl text-4xl font-semibold tracking-tight text-white">
              Unified operator and dispatcher access for the twin environment.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              One frontend now serves both roles. Admin sessions can supervise the dispatcher console and fleet data.
              Train sessions are constrained to a single train ID.
            </p>
          </div>

          <div className="grid gap-4 pt-8 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <Shield size={18} className="text-emerald-300" />
              <div className="mt-3 text-sm font-semibold text-slate-100">Role-aware access</div>
              <p className="mt-1 text-sm text-slate-400">Admin sees fleet-wide controls. Train sees only its own locomotive.</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <TrainFront size={18} className="text-blue-300" />
              <div className="mt-3 text-sm font-semibold text-slate-100">Train login by ID</div>
              <p className="mt-1 text-sm text-slate-400">Use the seeded train ID and password provided for the environment.</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <LockKeyhole size={18} className="text-amber-300" />
              <div className="mt-3 text-sm font-semibold text-slate-100">Backend-enforced</div>
              <p className="mt-1 text-sm text-slate-400">The session token is enforced across HTTP APIs and dispatcher websockets.</p>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-800/80 bg-slate-950/80 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Secure Access</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Sign in</h2>
          <p className="mt-2 text-sm text-slate-400">Choose a role, then enter the seeded credentials.</p>

          <div className="mt-6 grid grid-cols-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-1">
            {(['train', 'admin'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRole(option)}
                className={cn(
                  'rounded-xl px-4 py-3 text-sm font-semibold capitalize transition-colors',
                  role === option
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {option}
              </button>
            ))}
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {role === 'train' ? (
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Train ID</span>
                <input
                  value={trainId}
                  onChange={(event) => setTrainId(event.target.value)}
                  placeholder="KTZ-2001"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
                />
              </label>
            ) : (
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Admin username</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="admin"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-blue-500"
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting || !password.trim() || (role === 'train' ? !trainId.trim() : !username.trim())}
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {submitting ? 'Signing in...' : `Continue as ${role}`}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
