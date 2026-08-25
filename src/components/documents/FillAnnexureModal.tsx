import { useEffect, useMemo, useState } from 'react'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { FileSignature, Loader2, AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { writeAuditLog } from '@/lib/audit'
import { buildLoanDocumentPath } from '@/lib/storagePaths'
import { formatDateTime } from '@/lib/format'
import { ANNEXURE_TEMPLATE } from '@/lib/fillableTemplates'
import type { ChecklistEntry } from '@/lib/completeness'
import type { DocumentRequirement, DocumentRow, LoanApplication } from '@/types/database'

/**
 * Appends a "Schedule of Documents Attached" page to the filled Annexure —
 * a plain enclosure list of every other document already on this
 * application's checklist, so the Annexure travels with a record of what
 * accompanies it. The source AcroForm has no such section, so this is
 * drawn as a fresh page rather than filled into existing fields.
 */
async function appendDocumentSchedule(
  pdfDoc: PDFDocument,
  application: LoanApplication,
  entries: ChecklistEntry[],
  excludeRequirementId: string
) {
  const attached = entries.filter((e) => e.document && e.requirement.id !== excludeRequirementId)
  if (attached.length === 0) return

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const page = pdfDoc.addPage([595.28, 841.89]) // A4 portrait, in points
  const margin = 56
  const pageWidth = page.getWidth()
  let y = page.getHeight() - 60

  page.drawText('SCHEDULE OF DOCUMENTS ATTACHED', { x: margin, y, size: 13, font: bold })
  y -= 20
  page.drawText(`Annexure to Application No. ${application.application_no} — ${application.customer_name}`, {
    x: margin,
    y,
    size: 10,
    font,
  })
  y -= 14
  page.drawText(`Generated: ${formatDateTime(new Date())}`, { x: margin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
  y -= 26

  const colSrX = margin
  const colDocX = margin + 40
  const colStatusX = pageWidth - margin - 110

  page.drawText('Sr', { x: colSrX, y, size: 9, font: bold })
  page.drawText('Document', { x: colDocX, y, size: 9, font: bold })
  page.drawText('Status', { x: colStatusX, y, size: 9, font: bold })
  y -= 6
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) })
  y -= 16

  let sr = 1
  let currentPage = page
  for (const entry of attached) {
    if (y < 60) {
      currentPage = pdfDoc.addPage([595.28, 841.89])
      y = currentPage.getHeight() - 60
    }
    const name = entry.requirement.document_name
    const truncated = name.length > 70 ? `${name.slice(0, 67)}...` : name
    currentPage.drawText(String(sr), { x: colSrX, y, size: 9, font })
    currentPage.drawText(truncated, { x: colDocX, y, size: 9, font })
    currentPage.drawText(entry.displayStatus.replace(/_/g, ' '), { x: colStatusX, y, size: 9, font })
    y -= 16
    sr += 1
  }
}

/**
 * Fills the bank's real Annexure PDF form (an AcroForm — see
 * src/lib/fillableTemplates.ts) with data from a short on-screen form, then
 * saves the actual filled PDF as the checklist document. Unlike a generated
 * letter, this writes directly into the bank's own document, field by field.
 */
export function FillAnnexureModal({
  open,
  onClose,
  application,
  requirement,
  entries,
  existingDocument,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  application: LoanApplication
  requirement: DocumentRequirement
  entries: ChecklistEntry[]
  existingDocument?: DocumentRow | null
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const { notify } = useToast()
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const initial: Record<string, string> = {}
    for (const field of ANNEXURE_TEMPLATE.fields) {
      initial[field.name] = field.autoFill ? field.autoFill(application) : ''
    }
    setValues(initial)
    setLoadError(null)
  }, [open, application])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof ANNEXURE_TEMPLATE.fields>()
    for (const field of ANNEXURE_TEMPLATE.fields) {
      if (!map.has(field.group)) map.set(field.group, [])
      map.get(field.group)!.push(field)
    }
    return Array.from(map.entries())
  }, [])

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    try {
      const templateResp = await fetch(ANNEXURE_TEMPLATE.templateUrl)
      if (!templateResp.ok) throw new Error('Unable to load the Annexure template PDF.')
      const templateBytes = await templateResp.arrayBuffer()

      const pdfDoc = await PDFDocument.load(templateBytes)
      const form = pdfDoc.getForm()
      for (const field of ANNEXURE_TEMPLATE.fields) {
        const value = values[field.name] ?? ''
        try {
          form.getTextField(field.name).setText(value)
        } catch {
          // Field missing from this template revision — skip rather than fail the whole save.
        }
      }
      form.flatten()
      await appendDocumentSchedule(pdfDoc, application, entries, requirement.id)
      const filledBytes = await pdfDoc.save()
      const blob = new Blob([filledBytes as BlobPart], { type: 'application/pdf' })
      const pageCount = pdfDoc.getPageCount()

      const fileName = `Annexure_${application.application_no}_${Date.now()}.pdf`
      const categoryCode = requirement.document_categories?.code ?? 'APPLICATION'
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
          page_count: pageCount,
          document_type: requirement.document_name,
          classification_confidence: 100,
          status: 'uploaded',
          quality_flags: [],
          version: nextVersion,
          replaced_document_id: existingDocument?.id ?? null,
          uploaded_by: profile.id,
          remarks: `Filled from the bank's Annexure (${ANNEXURE_TEMPLATE.title}) template — not a scanned original.`,
        })
        .select()
        .single()

      if (insertError) throw insertError

      await writeAuditLog({
        userId: profile.id,
        applicationId: application.id,
        action: 'ANNEXURE_FORM_FILLED',
        entityType: 'documents',
        entityId: inserted.id,
        newValue: { file_name: fileName },
      })

      notify('Annexure filled and saved.', 'success')
      onSaved()
      onClose()
    } catch (err: any) {
      notify(err.message ?? 'Unable to fill the Annexure. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Fill Annexure — ${ANNEXURE_TEMPLATE.title}`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
            Fill &amp; Save Annexure
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="rounded-md bg-bank-50 px-3 py-2 text-xs text-bank-800">
          This fills the bank's actual Annexure form (a Demand Promissory Note) with the details below
          and saves the completed PDF — the applicant/branch fields are pre-filled from this application.
          Leave a field blank if it does not apply. A <strong>Schedule of Documents Attached</strong> page
          listing every other document already on this application's checklist ({entries.filter((e) => e.document && e.requirement.id !== requirement.id).length} currently) is added automatically.
        </p>

        {loadError && (
          <p className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" /> {loadError}
          </p>
        )}

        {grouped.map(([group, fields]) => (
          <div key={group}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{group}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.name}>
                  <label className="label">{field.label}</label>
                  <input
                    className="input"
                    placeholder={field.placeholder}
                    value={values[field.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
