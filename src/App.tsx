import { Route, Routes } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { ToastProvider } from '@/contexts/ToastContext'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import ApplicationsPage from '@/pages/ApplicationsPage'
import NewApplicationPage from '@/pages/NewApplicationPage'
import ApplicationDetailPage from '@/pages/ApplicationDetailPage'
import ScannerLandingPage from '@/pages/ScannerLandingPage'
import PendingVerificationPage from '@/pages/PendingVerificationPage'
import ApprovalPacksPage from '@/pages/ApprovalPacksPage'
import EmailHistoryPage from '@/pages/EmailHistoryPage'
import ReportsPage from '@/pages/ReportsPage'
import SettingsPage from '@/pages/SettingsPage'
import NotFoundPage from '@/pages/NotFoundPage'

function Shielded({ children, roles }: { children: React.ReactNode; roles?: any }) {
  return (
    <ProtectedRoute roles={roles}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-card">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
          <h1 className="text-base font-bold text-slate-900">Configuration Error</h1>
          <p className="mt-2 text-sm text-slate-600">
            This app is not connected to Supabase. <code className="text-xs">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-xs">VITE_SUPABASE_ANON_KEY</code> are missing from the deployment
            environment. Set them in your hosting provider's environment variables and redeploy.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Shielded><DashboardPage /></Shielded>} />
        <Route path="/applications" element={<Shielded><ApplicationsPage /></Shielded>} />
        <Route
          path="/applications/new"
          element={
            <Shielded roles={['admin', 'branch_manager', 'maker']}>
              <NewApplicationPage />
            </Shielded>
          }
        />
        <Route path="/applications/:id/:tab?" element={<Shielded><ApplicationDetailPage /></Shielded>} />
        <Route path="/scanner" element={<Shielded><ScannerLandingPage /></Shielded>} />
        <Route path="/pending-verification" element={<Shielded><PendingVerificationPage /></Shielded>} />
        <Route path="/approval-packs" element={<Shielded><ApprovalPacksPage /></Shielded>} />
        <Route path="/email-history" element={<Shielded><EmailHistoryPage /></Shielded>} />
        <Route path="/reports" element={<Shielded><ReportsPage /></Shielded>} />
        <Route
          path="/settings"
          element={
            <Shielded roles={['admin']}>
              <SettingsPage />
            </Shielded>
          }
        />
        <Route path="*" element={<Shielded><NotFoundPage /></Shielded>} />
      </Routes>
    </ToastProvider>
  )
}
