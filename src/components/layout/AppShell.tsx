import { type ReactNode, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FileStack,
  FilePlus2,
  ScanLine,
  ClipboardCheck,
  PackageCheck,
  Mail,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  Landmark,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABELS } from '@/lib/constants'
import { GlobalSearchBox } from './GlobalSearchBox'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: null },
  { to: '/applications', label: 'Applications', icon: FileStack, roles: null },
  {
    to: '/applications/new',
    label: 'New Application',
    icon: FilePlus2,
    roles: ['admin', 'branch_manager', 'maker'],
  },
  { to: '/scanner', label: 'Document Scanner', icon: ScanLine, roles: null },
  { to: '/pending-verification', label: 'Pending Verification', icon: ClipboardCheck, roles: null },
  { to: '/approval-packs', label: 'Approval Packs', icon: PackageCheck, roles: null },
  { to: '/email-history', label: 'Email History', icon: Mail, roles: null },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: null },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const visibleNav = NAV.filter(
    (item) => !item.roles || (profile && (item.roles as readonly string[]).includes(profile.role))
  )

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-bank-950 text-white md:flex">
        <SidebarContent visibleNav={visibleNav} />
      </aside>

      {/* Sidebar (mobile drawer) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 flex h-full w-64 flex-col bg-bank-950 text-white">
            <SidebarContent visibleNav={visibleNav} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
          <button
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <GlobalSearchBox />
          </div>
          <div className="hidden flex-col items-end text-right sm:flex">
            <span className="text-sm font-medium text-slate-800">{profile?.name ?? '—'}</span>
            <span className="text-xs text-slate-500">
              {profile ? ROLE_LABELS[profile.role] : ''}
            </span>
          </div>
          <button
            onClick={signOut}
            className="btn-ghost btn-sm"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}

function SidebarContent({
  visibleNav,
  onNavigate,
}: {
  visibleNav: readonly { to: string; label: string; icon: typeof LayoutDashboard }[]
  onNavigate?: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
        <Landmark className="h-6 w-6 text-bank-300" />
        <div>
          <p className="text-sm font-bold leading-tight">Loan Document Scanner</p>
          <p className="text-[11px] text-bank-300">Approval Pack Suite</p>
        </div>
        <button
          className="ml-auto rounded-md p-1 text-white/70 hover:bg-white/10 md:hidden"
          onClick={onNavigate}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-bank-700 text-white' : 'text-bank-100 hover:bg-white/10'
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-3 text-[11px] text-bank-300">
        Confidential — Authorized banking personnel only
      </div>
    </>
  )
}
