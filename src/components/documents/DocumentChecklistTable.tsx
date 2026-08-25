import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, FileSignature, Mail, Plus, RefreshCcw, ScanLine, PackageCheck, Loader2 } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ScanUploadModal } from './ScanUploadModal'
import { DocumentViewerModal } from './DocumentViewerModal'
import { FillAnnexureModal } from './FillAnnexureModal'
import { AddDocumentModal } from './AddDocumentModal'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { buildQuickZip } from '@/lib/quickZip'
import { downloadBlob } from '@/lib/exportReports'
import { ANNEXURE_TEMPLATE } from '@/lib/fillableTemplates'
import type { ChecklistEntry } from '@/lib/completeness'
import type { DocumentRequirement, DocumentRow, LoanApplication } from '@/types/database'

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
  const { notify } = useToast()
  const queryClient = useQueryClient()
  const canUpload = profile && ['admin', 'branch_manager', 'maker'].includes(profile.role)

  const [scanTarget, setScanTarget] = useState<{ requirement: DocumentRequirement; existing: DocumentRow | null } | null>(null)
  const [generateTarget, setGenerateTarget] = useState<{ requirement: DocumentRequirement; existing: DocumentRow | null } | null>(null)
  const [viewDoc, setViewDoc] = useState<DocumentRow | null>(null)
  const [addDocOpen, setAddDocOpen] = useState(false)
  const [zipping, setZipping] = useState(false)

  const grouped = useMemo(() => {
    const map = new Map<string, ChecklistEntry[]>()
    for (const entry of entries) {
      const key = entry.requirement.document_categories?.name ?? 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    }
    return Array.from(map.entries())
  }, [entries])

  function onRequirementsChanged() {
    queryClient.invalidateQueries({ queryKey: ['document_requirements'] })
  }

  async function downloadAllZip() {
    setZipping(true)
    try {
      const blob = await buildQuickZip(application, entries)
      downloadBlob(blob, `${application.application_no}_Documents.zip`)
    } catch (err: any) {
      notify(err.message ?? 'Unable to build the ZIP. Please try again.', 'error')
    } finally {
      setZipping(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-2 p-3">
        <p className="text-xs text-slate-500">
          {entries.filter((e) => e.document).length} of {entries.length} checklist items have a document.
        </p>
        <div className="flex flex-wrap gap-2">
          {canUpload && (
            <button className="btn-secondary btn-sm" onClick={() => setAddDocOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Document
            </button>
          )}
          <button className="btn-secondary btn-sm" onClick={downloadAllZip} disabled={zipping}>
            {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
            Download All (ZIP)
          </button>
          <Link to={`/applications/${application.id}/email`} className="btn-primary btn-sm">
            <Mail className="h-3.5 w-3.5" /> Email
          </Link>
        </div>
      </div>

      {grouped.map(([category, rows]) => (
        <div key={category} className="card overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-700">{category}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
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
                      <div className="flex flex-wrap items-center gap-1">
                        {entry.document && (
                          <button className="btn-ghost btn-sm" onClick={() => setViewDoc(entry.document)}>
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                        )}
                        {canUpload && (
                          <>
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
                            {entry.requirement.code === ANNEXURE_TEMPLATE.requirementCode && (
                              <button
                                className="btn-ghost btn-sm"
                                onClick={() => setGenerateTarget({ requirement: entry.requirement, existing: entry.document })}
                                title="Fill the bank's Annexure form and generate it instantly"
                              >
                                <FileSignature className="h-3.5 w-3.5" /> Fill Annexure
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      {generateTarget && (
        <FillAnnexureModal
          open
          onClose={() => setGenerateTarget(null)}
          application={application}
          requirement={generateTarget.requirement}
          existingDocument={generateTarget.existing}
          onSaved={onChanged}
        />
      )}

      {addDocOpen && (
        <AddDocumentModal
          open
          onClose={() => setAddDocOpen(false)}
          application={application}
          existingEntries={entries}
          onAdded={onRequirementsChanged}
        />
      )}

      <DocumentViewerModal open={!!viewDoc} onClose={() => setViewDoc(null)} document={viewDoc} />
    </div>
  )
}
