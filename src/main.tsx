import '@fontsource/geist-pixel/400.css'
import '@fontsource/silkscreen/400.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { startPushSync } from './features/notify/sync'
import './index.css'
import { startPersistence } from './store/persistence'

void startPersistence()
startPushSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
