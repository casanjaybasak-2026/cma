import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { FileSignature, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { writeAuditLog } from '@/lib/audit'
import { buildLoanDocumentPath } from '@/lib/storagePaths'
import { formatCurrency, formatDate, slugifyFileName } from '@/lib/format'
import type { DocumentRequirement, DocumentRow, LoanApplication } from '@/types/database'

/**
 * Instant document generation for application/letter/declaration-type
 * checklist items that don't need to be scanned from a physical original —
 * fill a short form, generate a clean formatted PDF immediately, and save
 * it against the checklist item exactly like a scanned upload would be.
 */
export function FillGenerateModal({
  open,
  onClose,
  application,
  requirement,
  existingDocument,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  application: LoanApplication
  requirement: DocumentRequirement
  existingDocument?: DocumentRow | null
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const { notify } = useToast()
  const [signatory, setSignatory] = useState(application.customer_name)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  function buildPdf(): Blob {
    const doc = new jsPDF({ unit: 'pt' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 56
    let y = 60

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(application.branches?.name ?? 'Bank Branch', pageWidth / 2, y, { align: 'center' })
    y += 22
    doc.setFontSize(12)
    doc.text(requirement.document_name.toUpperCase(), pageWidth / 2, y, { align: 'center' })
    y += 30

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const infoLines = [
      `Application No: ${application.application_no}`,
      `Customer Name: ${application.customer_name}`,
      `Loan Type: ${application.loan_categories?.name ?? ''}`,
      `Loan Amount: ${formatCurrency(application.loan_amount)}`,
      `Date: ${formatDate(new Date())}`,
    ]
    for (const line of infoLines) {
      doc.text(line, margin, y)
      y += 16
    }
    y += 10
    doc.setLineWidth(0.5)
    doc.line(margin, y, pageWidth - margin, y)
    y += 24

    doc.setFontSize(11)
    const bodyText = body.trim() || `This document is submitted in connection with the above-referenced loan application.`
    const wrapped = doc.splitTextToSize(bodyText, pageWidth - margin * 2)
    doc.text(wrapped, margin, y)
    y += wrapped.length * 15 + 50

    if (y > doc.internal.pageSize.getHeight() - 100) {
      doc.addPage()
      y = 60
    }
    doc.line(margin, y, margin + 200, y)
    y += 14
    doc.setFontSize(9)
    doc.text(signatory || application.customer_name, margin, y)
    y += 12
    doc.text('Signature', margin, y)

    return doc.output('blob')
  }

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    try {
      const blob = buildPdf()
      const fileName = `${slugifyFileName(requirement.document_name)}_${Date.now()}.pdf`
      const categoryCode = requirement.document_categories?.code ?? 'OTHER'
      const storagePath = buildLoanDocumentPath(application.id, categoryCode, fileName)

      const { error: uploadError } = await supabase.storage
        .from('loan-documents')
        .upload(storagePath, blob, { contentType: 'application/pdf', upsert: false })
      if (uploadError) throw uploadError

      const nextVersion = existingDocument ? existingDocument.version + 1 : 1

      const { data: inserted, error: insertError } = await supabase
        .from('documents')
        .insert({
          application_id: application.id,
          requirement_id: requirement.id,
          file_name: fileName,
          storage_path: storagePath,
          file_type: 'application/pdf',
          file_size: blob.size,
          page_count: 1,
          ocr_text: body || null,
          document_type: requirement.document_name,
          classification_confidence: 100,
          status: 'uploaded',
          quality_flags: [],
          version: nextVersion,
          replaced_document_id: existingDocument?.id ?? null,
          uploaded_by: profile.id,
          remarks: 'Generated instantly from a filled form (not a scanned original).',
        })
        .select()
        .single()

      if (insertError) throw insertError

      await writeAuditLog({
        userId: profile.id,
        applicationId: application.id,
        action: 'DOCUMENT_GENERATED',
        entityType: 'documents',
        entityId: inserted.id,
        newValue: { file_name: fileName, requirement: requirement.document_name },
      })

      notify(`${requirement.document_name} generated and saved.`, 'success')
      onSaved()
      onClose()
    } catch (err: any) {
      notify(err.message ?? 'Unable to generate this document. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Fill & Generate — ${requirement.document_name}`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
            Generate &amp; Save Document
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="rounded-md bg-bank-50 px-3 py-2 text-xs text-bank-800">
          Use this when the original document does not exist yet — the bank generates it on the spot
          instead of requiring a scan. It carries the applicant's details automatically and is recorded
          as an instantly-generated document in the audit trail.
        </p>

        <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div>
            <span className="font-semibold text-slate-500">Application</span>
            <p>{application.application_no}</p>
          </div>
          <div>
            <span className="font-semibold text-slate-500">Customer</span>
            <p>{application.customer_name}</p>
          </div>
          <div>
            <span className="font-semibold text-slate-500">Loan Type</span>
            <p>{application.loan_categories?.name}</p>
          </div>
          <div>
            <span className="font-semibold text-slate-500">Amount</span>
            <p>{formatCurrency(application.loan_amount)}</p>
          </div>
        </div>

        <div>
          <label className="label">Document Body / Declaration Text</label>
          <textarea
            className="input"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Type the wording for "${requirement.document_name}" here — e.g. the declaration, undertaking, or letter content. The applicant/application details above are added automatically.`}
          />
        </div>

        <div>
          <label className="label">Signatory Name</label>
          <input className="input" value={signatory} onChange={(e) => setSignatory(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
