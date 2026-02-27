import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Dashboard } from './views/Dashboard'
import { RouteView } from './views/RouteView'
import { PanelDetail } from './views/PanelDetail'
import { CategoryDetail } from './views/CategoryDetail'
import { Settings } from './views/Settings'
import { Login } from './views/Login'
import { AuthVerify } from './views/AuthVerify'
import { DemoLayout } from './demo/demo-layout'

function PersonalPanelRedirect() {
  const { panelId } = useParams<{ panelId: string }>()
  return <Navigate to={`/personal/panel/${panelId}`} replace />
}

function BusinessPanelRedirect() {
  const { panelId } = useParams<{ panelId: string }>()
  return <Navigate to={`/business/panel/${panelId}`} replace />
}

export function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/personal" element={<RouteView type="personal" />} />
          <Route path="/personal/category/:categoryId" element={<CategoryDetail />} />
          <Route path="/personal/panel/:panelId" element={<PanelDetail />} />
          <Route path="/personal/:panelId" element={<PersonalPanelRedirect />} />
          <Route path="/business" element={<RouteView type="business" />} />
          <Route path="/business/category/:categoryId" element={<CategoryDetail />} />
          <Route path="/business/panel/:panelId" element={<PanelDetail />} />
          <Route path="/business/:panelId" element={<BusinessPanelRedirect />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/verify" element={<AuthVerify />} />
        <Route path="/demo" element={<Navigate to="/demo/chaos-goblin" replace />} />
        <Route path="/demo/:persona" element={<DemoLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="personal" element={<RouteView type="personal" />} />
          <Route path="personal/category/:categoryId" element={<CategoryDetail />} />
          <Route path="personal/panel/:panelId" element={<PanelDetail />} />
          <Route path="business" element={<RouteView type="business" />} />
          <Route path="business/category/:categoryId" element={<CategoryDetail />} />
          <Route path="business/panel/:panelId" element={<PanelDetail />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  )
}
