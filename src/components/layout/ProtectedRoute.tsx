import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/types/database'
import { ShieldAlert } from 'lucide-react'

export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode
  roles?: UserRole[]
}) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (roles && profile && !roles.includes(profile.role)) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldAlert className="h-10 w-10 text-slate-400" />
        <p className="text-sm font-medium text-slate-700">
          You do not have permission to access this page.
        </p>
        <p className="text-xs text-slate-500">
          This area is restricted to: {roles.join(', ')}.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
