import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatCurrency, formatDate } from '@/lib/format'
import { APPLICATION_STATUS_LABELS } from '@/lib/constants'
import type { CompletenessStats } from '@/lib/completeness'
import type { LoanApplication } from '@/types/database'

const TABS = [
  { key: 'scanner', label: 'Document Scanner' },
  { key: 'review', label: 'Review' },
  { key: 'approval-pack', label: 'Approval Pack' },
  { key: 'email', label: 'Email' },
  { key: 'history', label: 'History' },
]

export function ApplicationHeader({
  application,
  stats,
}: {
  application: LoanApplication
  stats: CompletenessStats
}) {
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-bank-600">
              {application.application_no}
            </p>
            <h1 className="text-lg font-bold text-slate-900">{application.customer_name}</h1>
            <p className="text-sm text-slate-500">
              {application.loan_categories?.name} · {formatCurrency(application.loan_amount)} ·{' '}
              {application.branches?.name ?? application.branch_code}
            </p>
          </div>
          <span className="badge bg-slate-100 text-slate-700">
            {APPLICATION_STATUS_LABELS[application.status] ?? application.status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 lg:grid-cols-6">
          <MiniStat label="Applied" value={formatDate(application.application_date)} />
          <MiniStat label="Required Docs" value={stats.totalRequired} />
          <MiniStat label="Uploaded" value={stats.uploaded} />
          <MiniStat label="Verified" value={stats.verified} tone="success" />
          <MiniStat label="Missing" value={stats.missing} tone="danger" />
          <MiniStat label="Rejected" value={stats.rejected} tone="danger" />
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase tracking-wide">Document Completeness</span>
            <span>
              {stats.uploaded} / {stats.totalRequired} Documents Completed · {stats.percent}%
            </span>
          </div>
          <ProgressBar percent={stats.percent} />
        </div>
      </div>

      <div className="card flex overflow-x-auto p-1.5">
        {TABS.map((tab) => (
          <NavLink
            key={tab.key}
            to={`/applications/${application.id}/${tab.key}`}
            className={({ isActive }) =>
              clsx(
                'shrink-0 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-bank-700 text-white' : 'text-slate-600 hover:bg-slate-100'
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string | number
  tone?: 'default' | 'success' | 'danger'
}) {
  return (
    <div
      className={clsx(
        'rounded-md border px-3 py-2',
        tone === 'success' && 'border-emerald-100 bg-emerald-50',
        tone === 'danger' && 'border-red-100 bg-red-50',
        tone === 'default' && 'border-slate-100 bg-slate-50'
      )}
    >
      <p className="text-slate-500">{label}</p>
      <p
        className={clsx(
          'text-sm font-bold',
          tone === 'success' && 'text-emerald-700',
          tone === 'danger' && 'text-red-700',
          tone === 'default' && 'text-slate-800'
        )}
      >
        {value}
      </p>
    </div>
  )
}
