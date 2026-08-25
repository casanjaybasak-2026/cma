import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDateTime } from '@/lib/format'
import type { DocumentRow } from '@/types/database'

interface Row extends DocumentRow {
  loan_applications: { id: string; application_no: string; customer_name: string } | null
}

export default function PendingVerificationPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['pending_verification'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*, loan_applications(id, application_no, customer_name)')
        .in('status', ['uploaded', 'submitted_for_verification'])
        .is('deleted_at', null)
        .order('uploaded_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as unknown as Row[]
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Pending Verification</h1>
        <p className="text-sm text-slate-500">Documents awaiting Checker / Credit Officer review.</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Application</th>
              <th className="px-4 py-3">Document</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && (data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Nothing pending verification. 🎉
                </td>
              </tr>
            )}
            {(data ?? []).map((doc) => (
              <tr key={doc.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{doc.loan_applications?.customer_name}</p>
                  <p className="font-mono text-xs text-bank-700">{doc.loan_applications?.application_no}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{doc.document_type ?? doc.file_name}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={doc.status} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(doc.uploaded_at)}</td>
                <td className="px-4 py-3">
                  {doc.loan_applications && (
                    <Link to={`/applications/${doc.loan_applications.id}/review`} className="btn-secondary btn-sm">
                      Review
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
