import { useMemo, useState } from 'react'
import { Eye, RefreshCcw, ScanLine } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ScanUploadModal } from './ScanUploadModal'
import { DocumentViewerModal } from './DocumentViewerModal'
import type { ChecklistEntry } from '@/lib/completeness'
import type { DocumentRequirement, DocumentRow, LoanApplication } from '@/types/database'
import { useAuth } from '@/contexts/AuthContext'

export function DocumentChecklistTable({
  entries,
  allRequirements,
  application,
  existingDocumentsForApp,
  onChanged,
}: {
  entries: ChecklistEntry[]
  allRequirements: DocumentRequirement[]
  application: LoanApplication
  existingDocumentsForApp: DocumentRow[]
  onChanged: () => void
}) {
  const { profile } = useAuth()
  const canUpload = profile && ['admin', 'branch_manager', 'maker'].includes(profile.role)
  const [scanTarget, setScanTarget] = useState<{ requirement: DocumentRequirement; existing: DocumentRow | null } | null>(null)
  const [viewDoc, setViewDoc] = useState<DocumentRow | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, ChecklistEntry[]>()
    for (const entry of entries) {
      const key = entry.requirement.document_categories?.name ?? 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    }
    return Array.from(map.entries())
  }, [entries])

  return (
    <div className="space-y-6">
      {grouped.map(([category, rows]) => (
        <div key={category} className="card overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-700">{category}</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2">Document</th>
                <th className="px-4 py-2">Required</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((entry) => (
                <tr key={entry.requirement.id}>
                  <td className="px-4 py-2.5 font-medium text-slate-700">{entry.requirement.document_name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{entry.requirement.required ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={entry.displayStatus} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      {entry.document && (
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => setViewDoc(entry.document)}
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                      )}
                      {canUpload && (
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => setScanTarget({ requirement: entry.requirement, existing: entry.document })}
                        >
                          {entry.document ? (
                            <>
                              <RefreshCcw className="h-3.5 w-3.5" /> Replace
                            </>
                          ) : (
                            <>
                              <ScanLine className="h-3.5 w-3.5" /> Scan / Upload
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {scanTarget && (
        <ScanUploadModal
          open
          onClose={() => setScanTarget(null)}
          application={application}
          requirement={scanTarget.requirement}
          allRequirements={allRequirements}
          existingDocument={scanTarget.existing}
          existingDocumentsForApp={existingDocumentsForApp}
          onSaved={onChanged}
        />
      )}

      <DocumentViewerModal open={!!viewDoc} onClose={() => setViewDoc(null)} document={viewDoc} />
    </div>
  )
}
