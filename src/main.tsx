import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useStore } from './store.ts'
import { syncDesktopAuthToken } from './utils/desktop.ts'
import { initClientLogger } from './utils/clientLogger.ts'

type StonesDebugWindow = Window & {
  __STONES_STORE__?: typeof useStore
  __STONES_DEBUG__?: {
    store?: typeof useStore
  }
}

if (import.meta.env.DEV) {
  const debugWindow = window as StonesDebugWindow
  debugWindow.__STONES_STORE__ = useStore
  debugWindow.__STONES_DEBUG__ ??= {}
  debugWindow.__STONES_DEBUG__.store = useStore
}

void syncDesktopAuthToken(localStorage.getItem('accessToken'))
initClientLogger({
  getUserId: () => useStore.getState().user?.id || localStorage.getItem('userId'),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
