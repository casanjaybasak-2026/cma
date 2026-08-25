import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, ScanLine } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { LoanApplication } from '@/types/database'

export default function ScannerLandingPage() {
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['scanner_landing_search', q],
    queryFn: async () => {
      let query = supabase
        .from('loan_applications')
        .select('*, loan_categories(*)')
        .order('created_at', { ascending: false })
        .limit(20)
      if (q) {
        const like = `%${q}%`
        query = query.or(`application_no.ilike.${like},customer_name.ilike.${like},customer_id.ilike.${like}`)
      }
      const { data, error } = await query
      if (error) throw error
      return data as LoanApplication[]
    },
  })

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-center">
        <ScanLine className="mx-auto mb-2 h-10 w-10 text-bank-700" />
        <h1 className="text-xl font-bold text-slate-900">Document Scanner</h1>
        <p className="text-sm text-slate-500">Select an application to scan or upload documents.</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search application…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>
      <div className="card divide-y divide-slate-100">
        {(data ?? []).map((app) => (
          <button
            key={app.id}
            onClick={() => navigate(`/applications/${app.id}/scanner`)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
          >
            <div>
              <p className="text-sm font-semibold text-bank-700">{app.application_no}</p>
              <p className="text-xs text-slate-500">
                {app.customer_name} · {app.loan_categories?.name}
              </p>
            </div>
          </button>
        ))}
        {data?.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">No applications found.</p>
        )}
      </div>
    </div>
  )
}
