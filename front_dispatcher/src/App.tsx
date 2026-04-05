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

function roleLabel(role: string): string {
    if (role === 'admin') return 'Администратор'
    if (role === 'dispatcher') return 'Диспетчер'
    if (role === 'regular_train') return 'Локомотив'
    return role
}

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
                () => reject(new Error('Превышено время восстановления сессии')),
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
            aria-label={`Переключить на ${theme === 'dark' ? 'светлую' : 'тёмную'} тему`}
        >
            <span className="theme-toggle-label">{theme === 'dark' ? 'Тёмная' : 'Светлая'} тема</span>
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
                <p className="kicker">КТЖ</p>
                <h1>Восстановление сессии диспетчера...</h1>
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
                setError('Локомотивные учетные записи должны использовать приложение машиниста, а не диспетчерский пульт.')
                return
            }
            setSession(session.accessToken, session.user, session.mustChangePassword)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось выполнить вход.')
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
                <p className="kicker">КТЖ</p>
                <h1>Вход в диспетчерский пульт</h1>
                <p className="auth-copy">
                    Войдите под именем диспетчера или администратора. Локомотивные учетные записи доступны только в приложении машиниста.
                </p>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <label>
                        <span>Имя пользователя</span>
                        <input
                            value={identifier}
                            onChange={(event) => setIdentifier(event.target.value)}
                            placeholder="dispatcher"
                        />
                    </label>

                    <label>
                        <span>Пароль</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Введите пароль"
                        />
                    </label>

                    {error ? <div className="auth-error">{error}</div> : null}

                    <button type="submit" disabled={submitting || !identifier.trim() || !password.trim()}>
                        {submitting ? 'Вход...' : 'Продолжить'}
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
            setError('Сессия истекла. Войдите снова.')
            return
        }
        if (newPassword !== confirmPassword) {
            setError('Новый пароль и подтверждение не совпадают.')
            return
        }

        setSubmitting(true)
        setError(null)
        try {
            const session = await changePassword(accessToken, currentPassword, newPassword)
            setSession(session.accessToken, session.user, session.mustChangePassword)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось изменить пароль.')
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
                <p className="kicker">Требуется пароль</p>
                <h1>Смените пароль, чтобы продолжить</h1>
                <p className="auth-copy">
                    {(user?.displayName ?? user?.username ?? 'Эта учетная запись')} должна сменить временный пароль
                    перед использованием диспетчерского пульта.
                </p>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <label>
                        <span>Текущий пароль</span>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(event) => setCurrentPassword(event.target.value)}
                        />
                    </label>

                    <label>
                        <span>Новый пароль</span>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                        />
                    </label>

                    <label>
                        <span>Подтвердите новый пароль</span>
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
                            {submitting ? 'Обновление...' : 'Сохранить новый пароль'}
                        </button>
                        <button type="button" className="secondary" onClick={() => void handleLogout()}>
                            Выйти
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
                    <p className="kicker">Цифровой двойник КТЖ</p>
                    <h1>Удалённый диспетчерский пульт</h1>
                    <p className="muted">
                        {user?.displayName ?? user?.username ?? 'Авторизованный пользователь'} ·{' '}
                        {user ? roleLabel(user.role) : ''}
                    </p>
                </div>
                <div className="header-actions">
                    <ThemeToggle theme={theme} onToggle={onToggle} />
                    <ConnectionBadge />
                    <button className="logout-button" type="button" onClick={() => void handleLogout()}>
                        Выйти
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
