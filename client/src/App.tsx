import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { LabProvider } from './hooks/useLab'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import LabListPage from './pages/LabListPage'
import ParticipantListPage from './pages/ParticipantListPage'
import CreateParticipantPage from './pages/CreateParticipantPage'
import ParticipantDetailPage from './pages/ParticipantDetailPage'
import NotFoundPage from './pages/NotFoundPage'
import ExperimentPage from './pages/ExperimentPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LabProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/labs" element={<LabListPage />} />
                <Route path="/labs/:labId/participants" element={<ParticipantListPage />} />
                <Route path="/labs/:labId/participants/new" element={<CreateParticipantPage />} />
                <Route path="/labs/:labId/participants/:id" element={<ParticipantDetailPage />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Route>
              <Route path="/experiment/:participantId/:labDay/:sessionType" element={<ExperimentPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </LabProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
