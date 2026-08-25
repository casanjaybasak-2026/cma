import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  FileStack,
  Landmark,
  Building2,
  Home,
  GraduationCap,
  ClipboardList,
  CheckCircle2,
  PackageCheck,
  Send,
  FilePlus2,
  Search,
  ScanLine,
  ClipboardCheck,
} from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { StatCard } from '@/components/dashboard/StatCard'
import { useAuth } from '@/contexts/AuthContext'

async function fetchDashboardStats() {
  const [
    total,
    cc,
    termLoan,
    homeLoan,
    educationLoan,
    pendingDocs,
    readyForApproval,
    zipPacks,
    emailsSent,
  ] = await Promise.all([
    supabase.from('loan_applications').select('id', { count: 'exact', head: true }),
    countByCategoryCode('CC'),
    countByCategoryCode('TERM_LOAN'),
    countByCategoryCode('HOME_LOAN'),
    countByCategoryCode('EDUCATION_LOAN'),
    supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .in('status', ['uploaded', 'processing', 'submitted_for_verification']),
    supabase
      .from('loan_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ready_for_approval'),
    supabase.from('approval_packs').select('id', { count: 'exact', head: true }),
    supabase.from('email_logs').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
  ])

  return {
    total: total.count ?? 0,
    cc,
    termLoan,
    homeLoan,
    educationLoan,
    pendingDocs: pendingDocs.count ?? 0,
    readyForApproval: readyForApproval.count ?? 0,
    zipPacks: zipPacks.count ?? 0,
    emailsSent: emailsSent.count ?? 0,
  }
}

async function countByCategoryCode(code: string) {
  const { data: cat } = await supabase.from('loan_categories').select('id').eq('code', code).single()
  if (!cat) return 0
  const { count } = await supabase
    .from('loan_applications')
    .select('id', { count: 'exact', head: true })
    .eq('loan_category_id', cat.id)
  return count ?? 0
}

const QUICK_ACTIONS = [
  { to: '/applications/new', label: 'New Loan Application', icon: FilePlus2 },
  { to: '/applications', label: 'Search Application', icon: Search },
  { to: '/scanner', label: 'Upload / Scan Documents', icon: ScanLine },
  { to: '/pending-verification', label: 'Pending Verification', icon: ClipboardCheck },
  { to: '/approval-packs', label: 'Approval Packs', icon: PackageCheck },
  { to: '/email-history', label: 'Email History', icon: Send },
  { to: '/reports', label: 'Application History & Reports', icon: ClipboardList },
]

export default function DashboardPage() {
  const { profile } = useAuth()
  const { data, isLoading } = useQuery({ queryKey: ['dashboard_stats'], queryFn: fetchDashboardStats })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Welcome{profile ? `, ${profile.name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-slate-500">
          Loan documentation and approval-pack overview across your branch.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <StatCard label="Total Applications" value={isLoading ? '—' : data!.total} icon={FileStack} to="/applications" tone="default" />
        <StatCard label="CC Applications" value={isLoading ? '—' : data!.cc} icon={Landmark} to="/applications?category=CC" tone="info" />
        <StatCard label="Term Loan Applications" value={isLoading ? '—' : data!.termLoan} icon={Building2} to="/applications?category=TERM_LOAN" tone="info" />
        <StatCard label="Home Loan Applications" value={isLoading ? '—' : data!.homeLoan} icon={Home} to="/applications?category=HOME_LOAN" tone="info" />
        <StatCard label="Education Loan Applications" value={isLoading ? '—' : data!.educationLoan} icon={GraduationCap} to="/applications?category=EDUCATION_LOAN" tone="info" />
        <StatCard label="Pending Documents" value={isLoading ? '—' : data!.pendingDocs} icon={ClipboardList} to="/pending-verification" tone="warning" />
        <StatCard label="Ready for Approval" value={isLoading ? '—' : data!.readyForApproval} icon={CheckCircle2} to="/applications?filter=ready" tone="success" />
        <StatCard label="ZIP Packs Generated" value={isLoading ? '—' : data!.zipPacks} icon={PackageCheck} to="/approval-packs" tone="default" />
        <StatCard label="Documents Sent by Email" value={isLoading ? '—' : data!.emailsSent} icon={Send} to="/email-history" tone="default" />
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-4 text-center text-xs font-medium text-slate-700 transition-colors hover:border-bank-400 hover:bg-bank-50"
            >
              <action.icon className="h-5 w-5 text-bank-700" />
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
