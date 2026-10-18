import './theme/theme.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createTauriApi } from './services/tauri-bridge'

async function bootstrap() {
  window.api = await createTauriApi()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

bootstrap()
