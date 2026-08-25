import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, ShieldCheck } from 'lucide-react'
import { checkApprovalReadiness, type ChecklistEntry } from '@/lib/completeness'
import type { LoanApplication } from '@/types/database'

export function ApprovalReadinessPanel({
  application,
  entries,
}: {
  application: LoanApplication
  entries: ChecklistEntry[]
}) {
  const [result, setResult] = useState<ReturnType<typeof checkApprovalReadiness> | null>(null)

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Approval Readiness</h2>
          <p className="text-xs text-slate-500">
            Verify that every mandatory document is present, verified and free of rejections.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setResult(checkApprovalReadiness(entries))}>
          <ShieldCheck className="h-4 w-4" /> Check Approval Readiness
        </button>
      </div>

      {result && (
        <div
          className={`mt-4 rounded-lg border p-4 ${
            result.ready ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
          }`}
        >
          <div className="flex items-center gap-2">
            {result.ready ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
            <p className={`text-sm font-bold ${result.ready ? 'text-emerald-800' : 'text-red-800'}`}>
              {result.ready ? 'READY FOR APPROVAL' : 'NOT READY FOR APPROVAL'}
            </p>
          </div>

          {!result.ready && (
            <div className="mt-3 space-y-2 text-sm text-red-800">
              {result.blockers.map((b, i) => (
                <p key={i}>• {b}</p>
              ))}
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-red-700">
                {result.missingDocuments.map((e) => (
                  <li key={e.requirement.id}>{e.requirement.document_name}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3">
            <Link to={`/applications/${application.id}/approval-pack`} className="btn-sm btn-secondary">
              Go to Approval Pack
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
