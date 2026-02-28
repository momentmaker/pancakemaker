import { StrictMode, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { AppProvider } from './hooks/useAppState'
import { SyncProvider } from './sync/SyncContext'
import { UpdateBanner } from './components/UpdateBanner'
import { createWaSqliteDatabase } from './db/wa-sqlite-db'
import './styles/theme.css'

function Root() {
  const createDb = useCallback(() => createWaSqliteDatabase('pancakemaker'), [])

  return (
    <StrictMode>
      <UpdateBanner />
      <AppProvider createDatabase={createDb}>
        <SyncProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </SyncProvider>
      </AppProvider>
    </StrictMode>
  )
}

createRoot(document.getElementById('root')!).render(<Root />)
