import { useEffect, useState } from 'react'
import { connectWs, disconnectWs } from './services/wsClient'
import { ConnectionBadge } from './components/ConnectionBadge'
import { LocomotiveList } from './components/LocomotiveList'
import { TelemetryPanel } from './components/TelemetryPanel'
import { ChatPanel } from './components/ChatPanel'
import { CONFIG } from './config'
import { useAuthStore } from './store/useAuthStore'
import { useDispatcherStore } from './store/useDispatcherStore'
import { changePassword, login, logoutSession, refreshSession } from './services/authApi'

type ThemeMode = 'dark' | 'light'

const THEME_STORAGE_KEY = 'dispatcher-theme'

function resolveInitialTheme(): ThemeMode {
    if (typeof window === 'undefined') {
        return 'dark'
    }

    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (storedTheme === 'dark' || storedTheme === 'light') {
        return storedTheme
    }

    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

async function refreshSessionWithTimeout() {
    let timeoutId: number | undefined
    try {
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(
                () => reject(new Error('Session bootstrap timeout')),
                CONFIG.BOOTSTRAP_REFRESH_TIMEOUT_MS
            )
        })
        return await Promise.race([refreshSession(), timeoutPromise])
    } finally {
        if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId)
        }
    }
}

function ThemeToggle({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
    return (
        <button
            className="theme-toggle"
            type="button"
            onClick={onToggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
            <span className="theme-toggle-label">{theme === 'dark' ? 'Dark' : 'Light'} mode</span>
            <span className="theme-toggle-track" aria-hidden="true">
                <span className="theme-toggle-thumb" />
            </span>
        </button>
    )
}

function LoadingScreen({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
    return (
        <div className="auth-shell">
            <div className="shell-toolbar">
                <ThemeToggle theme={theme} onToggle={onToggle} />
            </div>
            <section className="auth-card">
                <p className="kicker">KTZ Digital Twin</p>
                <h1>Restoring dispatcher session...</h1>
            </section>
        </div>
    )
}

function LoginScreen({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
    const setSession = useAuthStore((state) => state.setSession)
    const clearSession = useAuthStore((state) => state.clearSession)
    const resetDispatcherState = useDispatcherStore((state) => state.reset)
    const [identifier, setIdentifier] = useState('')
    const [password, setPassword] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setSubmitting(true)
        setError(null)

        try {
            const session = await login(identifier.trim(), password)
            if (session.user.role === 'regular_train') {
                await logoutSession(session.accessToken)
                clearSession()
                resetDispatcherState()
                setError('Regular train accounts should use the locomotive operator app, not the dispatcher console.')
                return
            }
            setSession(session.accessToken, session.user, session.mustChangePassword)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="auth-shell">
            <div className="shell-toolbar">
                <ThemeToggle theme={theme} onToggle={onToggle} />
            </div>
            <section className="auth-card">
                <p className="kicker">KTZ Digital Twin</p>
                <h1>Dispatcher Console Login</h1>
                <p className="auth-copy">
                    Sign in with a dispatcher or admin username. Regular train accounts are restricted to the operator app.
                </p>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <label>
                        <span>Username</span>
                        <input
                            value={identifier}
                            onChange={(event) => setIdentifier(event.target.value)}
                            placeholder="dispatcher"
                        />
                    </label>

                    <label>
                        <span>Password</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Enter password"
                        />
                    </label>

                    {error ? <div className="auth-error">{error}</div> : null}

                    <button type="submit" disabled={submitting || !identifier.trim() || !password.trim()}>
                        {submitting ? 'Signing in...' : 'Continue'}
                    </button>
                </form>
            </section>
        </div>
    )
}

function ChangePasswordScreen({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
    const accessToken = useAuthStore((state) => state.accessToken)
    const user = useAuthStore((state) => state.user)
    const setSession = useAuthStore((state) => state.setSession)
    const clearSession = useAuthStore((state) => state.clearSession)
    const resetDispatcherState = useDispatcherStore((state) => state.reset)
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!accessToken) {
            setError('Session expired. Please sign in again.')
            return
        }
        if (newPassword !== confirmPassword) {
            setError('New password and confirmation do not match.')
            return
        }

        setSubmitting(true)
        setError(null)
        try {
            const session = await changePassword(accessToken, currentPassword, newPassword)
            setSession(session.accessToken, session.user, session.mustChangePassword)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Password change failed.')
        } finally {
            setSubmitting(false)
        }
    }

    async function handleLogout() {
        await logoutSession(accessToken)
        disconnectWs()
        clearSession()
        resetDispatcherState()
    }

    return (
        <div className="auth-shell">
            <div className="shell-toolbar">
                <ThemeToggle theme={theme} onToggle={onToggle} />
            </div>
            <section className="auth-card">
                <p className="kicker">Password Required</p>
                <h1>Change your password to continue</h1>
                <p className="auth-copy">
                    {user?.displayName ?? user?.username ?? 'This account'} must update its temporary password before
                    using the dispatcher console.
                </p>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <label>
                        <span>Current password</span>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(event) => setCurrentPassword(event.target.value)}
                        />
                    </label>

                    <label>
                        <span>New password</span>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                        />
                    </label>

                    <label>
                        <span>Confirm new password</span>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                        />
                    </label>

                    {error ? <div className="auth-error">{error}</div> : null}

                    <div className="auth-actions">
                        <button
                            type="submit"
                            disabled={
                                submitting ||
                                !currentPassword.trim() ||
                                !newPassword.trim() ||
                                !confirmPassword.trim()
                            }
                        >
                            {submitting ? 'Updating...' : 'Save new password'}
                        </button>
                        <button type="button" className="secondary" onClick={() => void handleLogout()}>
                            Sign out
                        </button>
                    </div>
                </form>
            </section>
        </div>
    )
}

function ConsoleShell({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
    const accessToken = useAuthStore((state) => state.accessToken)
    const user = useAuthStore((state) => state.user)
    const clearSession = useAuthStore((state) => state.clearSession)
    const resetDispatcherState = useDispatcherStore((state) => state.reset)

    useEffect(() => {
        if (!accessToken) {
            disconnectWs()
            return
        }
        connectWs()
        return () => disconnectWs()
    }, [accessToken])

    async function handleLogout() {
        await logoutSession(accessToken)
        disconnectWs()
        clearSession()
        resetDispatcherState()
    }

    return (
        <div className="app-root">
            <header className="app-header">
                <div>
                    <p className="kicker">KTZ Digital Twin</p>
                    <h1>Dispatcher Remote Console</h1>
                    <p className="muted">
                        {user?.displayName ?? user?.username ?? 'Authenticated user'} · {user?.role}
                    </p>
                </div>
                <div className="header-actions">
                    <ThemeToggle theme={theme} onToggle={onToggle} />
                    <ConnectionBadge />
                    <button className="logout-button" type="button" onClick={() => void handleLogout()}>
                        Logout
                    </button>
                </div>
            </header>

            <main className="app-layout">
                <LocomotiveList />
                <TelemetryPanel />
                <ChatPanel />
            </main>
        </div>
    )
}

export function App() {
    const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
    const accessToken = useAuthStore((state) => state.accessToken)
    const user = useAuthStore((state) => state.user)
    const hasHydrated = useAuthStore((state) => state.hasHydrated)
    const isBootstrapping = useAuthStore((state) => state.isBootstrapping)
    const mustChangePassword = useAuthStore((state) => state.mustChangePassword)
    const setSession = useAuthStore((state) => state.setSession)
    const clearSession = useAuthStore((state) => state.clearSession)
    const setBootstrapping = useAuthStore((state) => state.setBootstrapping)
    const resetDispatcherState = useDispatcherStore((state) => state.reset)

    useEffect(() => {
        document.documentElement.dataset.theme = theme
        document.documentElement.style.colorScheme = theme
        window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    }, [theme])

    function toggleTheme() {
        setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))
    }

    useEffect(() => {
        if (!hasHydrated) {
            return
        }

        if (accessToken && user) {
            if (user.role === 'regular_train') {
                void logoutSession(accessToken)
                clearSession()
                resetDispatcherState()
            }
            return
        }

        let cancelled = false
        setBootstrapping(true)
        void refreshSessionWithTimeout()
            .then((session) => {
                if (cancelled) return
                if (session.user.role === 'regular_train') {
                    void logoutSession(session.accessToken)
                    clearSession()
                    resetDispatcherState()
                    return
                }
                setSession(session.accessToken, session.user, session.mustChangePassword)
            })
            .catch(() => {
                if (!cancelled) {
                    clearSession()
                    resetDispatcherState()
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setBootstrapping(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [
        accessToken,
        clearSession,
        hasHydrated,
        resetDispatcherState,
        setBootstrapping,
        setSession,
        user,
    ])

    if (!hasHydrated || isBootstrapping) {
        return <LoadingScreen theme={theme} onToggle={toggleTheme} />
    }

    if (!accessToken || !user) {
        return <LoginScreen theme={theme} onToggle={toggleTheme} />
    }

    if (mustChangePassword) {
        return <ChangePasswordScreen theme={theme} onToggle={toggleTheme} />
    }

    return <ConsoleShell theme={theme} onToggle={toggleTheme} />
}
