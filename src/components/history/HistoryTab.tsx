import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useProfilesMap } from '@/hooks/queries'
import { formatDateTime } from '@/lib/format'
import type { AuditLog, LoanApplication } from '@/types/database'

export function HistoryTab({ application }: { application: LoanApplication }) {
  const { data: profilesMap } = useProfilesMap()
  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit_logs', application.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('application_id', application.id)
        .order('timestamp', { ascending: false })
      if (error) throw error
      return (data ?? []) as AuditLog[]
    },
  })

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-slate-700">Application History &amp; Audit Trail</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {isLoading && <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>}
        {!isLoading && (logs ?? []).length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">No activity recorded yet.</p>
        )}
        {(logs ?? []).map((log) => (
          <div key={log.id} className="flex items-start gap-3 px-4 py-3">
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-bank-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{humanizeAction(log.action)}</p>
              <p className="text-xs text-slate-500">
                {log.user_id ? profilesMap?.get(log.user_id)?.name ?? 'Unknown user' : 'System'} ·{' '}
                {formatDateTime(log.timestamp)}
              </p>
              {!!log.new_value && (
                <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
                  {JSON.stringify(log.new_value, null, 0)}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function humanizeAction(action: string): string {
  return action
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ')
}
