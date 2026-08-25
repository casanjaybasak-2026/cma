import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PackageCheck, Download, Loader2, AlertTriangle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useApprovalPacks } from '@/hooks/queries'
import { checkApprovalReadiness, type ChecklistEntry, type CompletenessStats } from '@/lib/completeness'
import { generateApprovalPack } from '@/lib/generateApprovalPack'
import { formatDateTime, formatFileSize } from '@/lib/format'
import type { LoanApplication } from '@/types/database'

export function ApprovalPackTab({
  application,
  entries,
  stats,
}: {
  application: LoanApplication
  entries: ChecklistEntry[]
  stats: CompletenessStats
}) {
  const { profile } = useAuth()
  const { notify } = useToast()
  const queryClient = useQueryClient()
  const { data: packs, refetch } = useApprovalPacks(application.id)

  const readiness = checkApprovalReadiness(entries)
  const canGenerate = profile && ['admin', 'branch_manager', 'credit_officer'].includes(profile.role)

  const [withExceptions, setWithExceptions] = useState(false)
  const [exceptionRemarks, setExceptionRemarks] = useState('')
  const [generating, setGenerating] = useState(false)

  async function handleGenerate() {
    if (!profile) return
    if (!readiness.ready && withExceptions && !exceptionRemarks.trim()) {
      notify('Please provide remarks explaining the exception before proceeding.', 'error')
      return
    }
    setGenerating(true)
    try {
      await generateApprovalPack({
        application,
        entries,
        userId: profile.id,
        withExceptions: !readiness.ready && withExceptions,
        exceptionRemarks,
      })
      notify('Approval pack generated successfully.', 'success')
      refetch()
      queryClient.invalidateQueries({ queryKey: ['loan_application', application.id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] })
    } catch (err: any) {
      notify(err.message ?? 'ZIP generation failed. Please retry.', 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function downloadZip(path: string) {
    const { data, error } = await supabase.storage.from('approval-packs').createSignedUrl(path, 300)
    if (error || !data) {
      notify('Unable to generate a secure download link.', 'error')
      return
    }
    window.location.href = data.signedUrl
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Generate Approval Pack</h2>
          <span
            className={`badge ${readiness.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
          >
            {readiness.ready ? 'Ready for Approval' : 'Not Ready'}
          </span>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          {stats.uploaded} / {stats.totalRequired} mandatory documents uploaded · {stats.verified} verified ·{' '}
          {stats.missing} missing
        </p>

        {!readiness.ready && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" /> This application is not ready for a final approval pack.
            </div>
            <ul className="ml-4 list-disc space-y-0.5 text-xs">
              {readiness.blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            {canGenerate && (
              <div className="mt-3 space-y-2 border-t border-amber-200 pt-3">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={withExceptions}
                    onChange={(e) => setWithExceptions(e.target.checked)}
                  />
                  Generate With Exceptions (requires remarks; recorded permanently in the audit log)
                </label>
                {withExceptions && (
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Explain why this pack is being generated with missing/unverified documents…"
                    value={exceptionRemarks}
                    onChange={(e) => setExceptionRemarks(e.target.value)}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {canGenerate ? (
          <button
            className="btn-primary w-full sm:w-auto"
            onClick={handleGenerate}
            disabled={generating || (!readiness.ready && !withExceptions)}
          >
            {generating && <Loader2 className="h-4 w-4 animate-spin" />}
            <PackageCheck className="h-4 w-4" /> Generate Approval Pack
          </button>
        ) : (
          <p className="text-xs text-slate-400">
            Only Admin, Branch Manager or Credit Officer roles can generate an approval pack.
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-slate-700">Generated Packs</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {(packs ?? []).length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">No approval packs generated yet.</p>
          )}
          {(packs ?? []).map((pack) => (
            <div key={pack.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {application.application_no}_Approval_Pack.zip
                </p>
                <p className="text-xs text-slate-500">
                  {pack.document_count} documents · {formatFileSize(pack.total_size_bytes)} ·{' '}
                  {formatDateTime(pack.generated_at)}
                </p>
                {pack.status === 'with_exceptions' && (
                  <p className="mt-1 text-xs font-medium text-amber-600">
                    Generated with exceptions — {pack.exception_remarks}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`badge ${pack.status === 'final' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                >
                  {pack.status === 'final' ? 'Final' : 'With Exceptions'}
                </span>
                <button className="btn-secondary btn-sm" onClick={() => downloadZip(pack.zip_file_path)}>
                  <Download className="h-3.5 w-3.5" /> Download ZIP
                </button>
                <Link to={`/applications/${application.id}/email`} className="btn-primary btn-sm">
                  Send by Email
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
