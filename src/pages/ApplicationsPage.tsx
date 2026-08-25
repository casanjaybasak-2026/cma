import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Eye, ScanLine, ClipboardCheck, PackageCheck, Mail, History, Search } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useLoanCategories } from '@/hooks/queries'
import { formatCurrency, formatDate } from '@/lib/format'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { APPLICATION_STATUS_LABELS } from '@/lib/constants'
import type { LoanApplication } from '@/types/database'

interface CompletenessRow {
  application_id: string
  total_required: number
  uploaded_required: number
  verified_required: number
  rejected_required: number
  replace_required_count: number
  missing_required: number
}

async function fetchApplications(params: {
  q: string
  category: string
  filter: string
  from: string
  to: string
}) {
  let query = supabase
    .from('loan_applications')
    .select('*, loan_categories(*), branches(*)')
    .order('created_at', { ascending: false })

  if (params.q) {
    const like = `%${params.q}%`
    query = query.or(
      `application_no.ilike.${like},customer_name.ilike.${like},customer_id.ilike.${like},mobile_number.ilike.${like}`
    )
  }
  if (params.category) {
    const { data: cat } = await supabase.from('loan_categories').select('id').eq('code', params.category).single()
    if (cat) query = query.eq('loan_category_id', cat.id)
  }
  if (params.from) query = query.gte('application_date', params.from)
  if (params.to) query = query.lte('application_date', params.to)
  if (params.filter === 'pending_verification') query = query.eq('status', 'pending_verification')
  if (params.filter === 'ready') query = query.eq('status', 'ready_for_approval')

  const { data, error } = await query.limit(200)
  if (error) throw error

  const applications = (data ?? []) as LoanApplication[]
  if (applications.length === 0) return { applications, completeness: new Map<string, CompletenessRow>() }

  const { data: completenessData } = await supabase
    .from('application_completeness')
    .select('*')
    .in(
      'application_id',
      applications.map((a) => a.id)
    )

  const completeness = new Map<string, CompletenessRow>()
  for (const row of (completenessData ?? []) as CompletenessRow[]) {
    completeness.set(row.application_id, row)
  }
  return { applications, completeness }
}

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'missing', label: 'Missing Documents' },
  { value: 'ready', label: 'Ready for Approval' },
  { value: 'pending_verification', label: 'Pending Verification' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'completed', label: 'Completed' },
]

export default function ApplicationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const filter = searchParams.get('filter') ?? ''
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''

  const { data: categories } = useLoanCategories()
  const { data, isLoading } = useQuery({
    queryKey: ['applications_list', q, category, filter, from, to],
    queryFn: () => fetchApplications({ q, category, filter, from, to }),
  })

  const rows = useMemo(() => {
    if (!data) return []
    return data.applications
      .map((app) => ({ app, completeness: data.completeness.get(app.id) }))
      .filter(({ completeness }) => {
        if (!completeness) return true
        if (filter === 'missing') return completeness.missing_required > 0
        if (filter === 'rejected') return completeness.rejected_required > 0
        if (filter === 'completed')
          return (
            completeness.missing_required === 0 &&
            completeness.verified_required === completeness.total_required &&
            completeness.total_required > 0
          )
        return true
      })
  }, [data, filter])

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Applications</h1>
          <p className="text-sm text-slate-500">Search, filter and manage loan applications.</p>
        </div>
        <Link to="/applications/new" className="btn-primary shrink-0">
          New Loan Application
        </Link>
      </div>

      <div className="card space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search by Application ID, Customer, Customer ID, Mobile Number…"
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key === 'Enter') updateParam('q', (e.target as HTMLInputElement).value)
            }}
            onBlur={(e) => updateParam('q', e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => updateParam('filter', f.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                filter === f.value
                  ? 'border-bank-600 bg-bank-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
          <select
            className="input ml-auto w-auto text-xs"
            value={category}
            onChange={(e) => updateParam('category', e.target.value)}
          >
            <option value="">All Loan Types</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input w-auto text-xs"
            value={from}
            onChange={(e) => updateParam('from', e.target.value)}
            aria-label="From date"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            className="input w-auto text-xs"
            value={to}
            onChange={(e) => updateParam('to', e.target.value)}
            aria-label="To date"
          />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Application ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Loan Type</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Documents</th>
              <th className="px-4 py-3">Completion</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Loading applications…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  No applications match your search.
                </td>
              </tr>
            )}
            {rows.map(({ app, completeness }) => {
              const percent = completeness && completeness.total_required > 0
                ? Math.round((completeness.uploaded_required / completeness.total_required) * 100)
                : 0
              return (
                <tr key={app.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-bank-700">
                    {app.application_no}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{app.customer_name}</p>
                    <p className="text-xs text-slate-400">{app.mobile_number}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{app.loan_categories?.name}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCurrency(app.loan_amount)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {completeness ? `${completeness.uploaded_required} / ${completeness.total_required}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar percent={percent} className="w-20" />
                      <span className="text-xs text-slate-500">{percent}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge bg-slate-100 text-slate-700">
                      {APPLICATION_STATUS_LABELS[app.status] ?? app.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <RowAction to={`/applications/${app.id}/review`} icon={Eye} label="View" />
                      <RowAction to={`/applications/${app.id}/scanner`} icon={ScanLine} label="Upload" />
                      <RowAction to={`/applications/${app.id}/review`} icon={ClipboardCheck} label="Review" />
                      <RowAction to={`/applications/${app.id}/approval-pack`} icon={PackageCheck} label="Generate ZIP" />
                      <RowAction to={`/applications/${app.id}/email`} icon={Mail} label="Email" />
                      <RowAction to={`/applications/${app.id}/history`} icon={History} label="History" />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowAction({ to, icon: Icon, label }: { to: string; icon: typeof Eye; label: string }) {
  return (
    <Link
      to={to}
      title={label}
      aria-label={label}
      className="rounded-md p-1.5 text-slate-500 hover:bg-bank-50 hover:text-bank-700"
    >
      <Icon className="h-4 w-4" />
    </Link>
  )
}
