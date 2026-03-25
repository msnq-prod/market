import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useStore } from './store.ts'

if (import.meta.env.DEV) {
  (window as typeof window & { __STONES_STORE__?: typeof useStore }).__STONES_STORE__ = useStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
