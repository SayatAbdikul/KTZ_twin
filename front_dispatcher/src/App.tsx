import { useEffect } from 'react'
import { connectWs, disconnectWs } from './services/wsClient'
import { ConnectionBadge } from './components/ConnectionBadge'
import { LocomotiveList } from './components/LocomotiveList'
import { TelemetryPanel } from './components/TelemetryPanel'
import { ChatPanel } from './components/ChatPanel'

export function App() {
    useEffect(() => {
        connectWs()
        return () => disconnectWs()
    }, [])

    return (
        <div className="app-root">
            <header className="app-header">
                <div>
                    <p className="kicker">KTZ Digital Twin</p>
                    <h1>Dispatcher Remote Console</h1>
                </div>
                <ConnectionBadge />
            </header>

            <main className="app-layout">
                <LocomotiveList />
                <TelemetryPanel />
                <ChatPanel />
            </main>
        </div>
    )
}
