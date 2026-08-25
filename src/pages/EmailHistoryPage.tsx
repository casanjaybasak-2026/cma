import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/lib/format'
import type { EmailLog } from '@/types/database'

interface Row extends EmailLog {
  loan_applications: { id: string; application_no: string; customer_name: string } | null
}

export default function EmailHistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['all_email_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_logs')
        .select('*, loan_applications(id, application_no, customer_name)')
        .order('sent_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as unknown as Row[]
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Email History</h1>
        <p className="text-sm text-slate-500">All approval-pack emails sent, with delivery status.</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Application</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {(data ?? []).map((log) => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{log.loan_applications?.customer_name}</p>
                  <p className="font-mono text-xs text-bank-700">{log.loan_applications?.application_no}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{log.recipient}</td>
                <td className="max-w-[220px] truncate px-4 py-3 text-slate-600">{log.subject}</td>
                <td className="px-4 py-3">
                  <span
                    className={`badge ${
                      log.status === 'sent'
                        ? 'bg-emerald-50 text-emerald-700'
                        : log.status === 'failed'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {log.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(log.sent_at)}</td>
                <td className="px-4 py-3">
                  {log.loan_applications && (
                    <Link to={`/applications/${log.loan_applications.id}/email`} className="btn-secondary btn-sm">
                      Open
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
