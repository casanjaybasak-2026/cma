import { useState } from 'react'
import { LoanCategoriesSettings } from '@/components/settings/LoanCategoriesSettings'
import { DocumentRequirementsSettings } from '@/components/settings/DocumentRequirementsSettings'
import { UsersSettings } from '@/components/settings/UsersSettings'
import { BranchesSettings } from '@/components/settings/BranchesSettings'

const TABS = [
  { key: 'categories', label: 'Loan Categories' },
  { key: 'checklist', label: 'Document Checklist' },
  { key: 'users', label: 'Users & Roles' },
  { key: 'branches', label: 'Branches' },
] as const

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('categories')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Configure loan products, document checklists, users and branches — no code changes required.
        </p>
      </div>

      <div className="card flex overflow-x-auto p-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-bank-700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'categories' && <LoanCategoriesSettings />}
      {tab === 'checklist' && <DocumentRequirementsSettings />}
      {tab === 'users' && <UsersSettings />}
      {tab === 'branches' && <BranchesSettings />}
    </div>
  )
}
