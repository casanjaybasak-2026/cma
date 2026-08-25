import { useMemo, useState } from 'react'
import { Eye, Download, RefreshCcw, Trash2, CheckCircle2, XCircle, MessageSquare, Send } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { writeAuditLog } from '@/lib/audit'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ScanUploadModal } from '@/components/documents/ScanUploadModal'
import { DocumentViewerModal } from '@/components/documents/DocumentViewerModal'
import { RemarksModal } from './RemarksModal'
import type { ChecklistEntry } from '@/lib/completeness'
import type { DocumentRequirement, DocumentRow, LoanApplication } from '@/types/database'

export function ReviewDocumentTable({
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

  const canUpload = profile && ['admin', 'branch_manager', 'maker'].includes(profile.role)
  const canVerify = profile && ['admin', 'branch_manager', 'credit_officer', 'checker'].includes(profile.role)
  const canDelete = profile && ['admin', 'branch_manager'].includes(profile.role)

  const [viewDoc, setViewDoc] = useState<DocumentRow | null>(null)
  const [scanTarget, setScanTarget] = useState<{ requirement: DocumentRequirement; existing: DocumentRow | null } | null>(null)
  const [remarksDoc, setRemarksDoc] = useState<DocumentRow | null>(null)
  const [deleteDoc, setDeleteDoc] = useState<DocumentRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, ChecklistEntry[]>()
    for (const entry of entries) {
      const key = entry.requirement.document_categories?.name ?? 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    }
    return Array.from(map.entries())
  }, [entries])

  async function updateDocument(doc: DocumentRow, patch: Record<string, unknown>, action: string) {
    if (!profile) return
    setBusyId(doc.id)
    try {
      const { error } = await supabase.from('documents').update(patch).eq('id', doc.id)
      if (error) throw error
      await writeAuditLog({
        userId: profile.id,
        applicationId: application.id,
        action,
        entityType: 'documents',
        entityId: doc.id,
        oldValue: { status: doc.status },
        newValue: patch,
      })
      onChanged()
    } catch (err: any) {
      notify(err.message ?? 'Action failed. Please try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function download(doc: DocumentRow) {
    const { data, error } = await supabase.storage.from('loan-documents').createSignedUrl(doc.storage_path, 120)
    if (error || !data) {
      notify('Unable to generate a download link.', 'error')
      return
    }
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = doc.file_name
    a.click()
  }

  return (
    <div className="space-y-6">
      {grouped.map(([category, rows]) => (
        <div key={category} className="card overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-700">{category}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2">Document</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Uploaded By</th>
                  <th className="px-4 py-2">Remarks</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((entry) => {
                  const doc = entry.document
                  const busy = !!doc && busyId === doc.id
                  return (
                    <tr key={entry.requirement.id}>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{entry.requirement.document_name}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={entry.displayStatus} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{doc ? doc.uploaded_by ?? '—' : '—'}</td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-slate-500">
                        {doc?.remarks || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          {doc && (
                            <>
                              <IconBtn label="View" icon={Eye} onClick={() => setViewDoc(doc)} />
                              <IconBtn label="Download" icon={Download} onClick={() => download(doc)} />
                              <IconBtn label="Remarks" icon={MessageSquare} onClick={() => setRemarksDoc(doc)} />
                            </>
                          )}
                          {canUpload && (
                            <IconBtn
                              label={doc ? 'Replace' : 'Scan / Upload'}
                              icon={RefreshCcw}
                              onClick={() => setScanTarget({ requirement: entry.requirement, existing: doc })}
                            />
                          )}
                          {doc && canUpload && doc.status === 'uploaded' && (
                            <IconBtn
                              label="Submit for Verification"
                              icon={Send}
                              disabled={busy}
                              onClick={() =>
                                updateDocument(
                                  doc,
                                  {
                                    status: 'submitted_for_verification',
                                    submitted_for_verification_by: profile!.id,
                                    submitted_for_verification_at: new Date().toISOString(),
                                  },
                                  'DOCUMENT_SUBMITTED_FOR_VERIFICATION'
                                )
                              }
                            />
                          )}
                          {doc && canVerify && ['uploaded', 'submitted_for_verification'].includes(doc.status) && (
                            <>
                              <IconBtn
                                label="Verify"
                                icon={CheckCircle2}
                                disabled={busy}
                                tone="success"
                                onClick={() =>
                                  updateDocument(
                                    doc,
                                    { status: 'verified', verified_by: profile!.id, verified_at: new Date().toISOString() },
                                    'DOCUMENT_VERIFIED'
                                  )
                                }
                              />
                              <IconBtn
                                label="Reject"
                                icon={XCircle}
                                disabled={busy}
                                tone="danger"
                                onClick={() =>
                                  updateDocument(
                                    doc,
                                    { status: 'rejected', verified_by: profile!.id, verified_at: new Date().toISOString() },
                                    'DOCUMENT_REJECTED'
                                  )
                                }
                              />
                            </>
                          )}
                          {doc && canDelete && (
                            <IconBtn label="Delete" icon={Trash2} tone="danger" onClick={() => setDeleteDoc(doc)} />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <DocumentViewerModal open={!!viewDoc} onClose={() => setViewDoc(null)} document={viewDoc} />

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

      <RemarksModal
        open={!!remarksDoc}
        onClose={() => setRemarksDoc(null)}
        document={remarksDoc}
        saving={!!remarksDoc && busyId === remarksDoc.id}
        onSave={async (remarks) => {
          if (!remarksDoc) return
          await updateDocument(remarksDoc, { remarks }, 'DOCUMENT_REMARKS_UPDATED')
          setRemarksDoc(null)
        }}
      />

      <ConfirmDialog
        open={!!deleteDoc}
        onClose={() => setDeleteDoc(null)}
        onConfirm={async () => {
          if (!deleteDoc) return
          await updateDocument(deleteDoc, { deleted_at: new Date().toISOString() }, 'DOCUMENT_DELETED')
          setDeleteDoc(null)
        }}
        title="Delete Document"
        description={`This will permanently remove "${deleteDoc?.file_name}" from the active checklist. This action is recorded in the audit log and cannot be undone from the application screen.`}
        confirmLabel="Delete Document"
        danger
      />
    </div>
  )
}

function IconBtn({
  label,
  icon: Icon,
  onClick,
  disabled,
  tone,
}: {
  label: string
  icon: typeof Eye
  onClick: () => void
  disabled?: boolean
  tone?: 'success' | 'danger'
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`btn-ghost btn-sm ${tone === 'success' ? 'text-emerald-600 hover:bg-emerald-50' : ''} ${
        tone === 'danger' ? 'text-red-600 hover:bg-red-50' : ''
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}
