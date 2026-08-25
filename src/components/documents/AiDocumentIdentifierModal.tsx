import { useRef, useState } from 'react'
import {
  Camera,
  FileText,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ListChecks,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { writeAuditLog } from '@/lib/audit'
import { buildLoanDocumentPath } from '@/lib/storagePaths'
import { safeInspectPdf, renderPdfFirstPageToDataUrl } from '@/lib/pdfUtils'
import { runOcr } from '@/lib/ocr'
import { rankDocumentMatches, extractFields, type RankedMatch } from '@/lib/classify'
import { checkDuplicate, checkImageQuality, checkPdfQuality } from '@/lib/qualityChecks'
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '@/lib/constants'
import { formatFileSize } from '@/lib/format'
import { CameraCapture } from './CameraCapture'
import type { ChecklistEntry } from '@/lib/completeness'
import type { DocumentRequirement, DocumentRow, LoanApplication, QualityFlag } from '@/types/database'

type Step = 'select' | 'camera' | 'analyzing' | 'result'

interface Props {
  open: boolean
  onClose: () => void
  application: LoanApplication
  allRequirements: DocumentRequirement[]
  entries: ChecklistEntry[]
  existingDocumentsForApp: DocumentRow[]
  onSaved: () => void
}

/**
 * AI Loan Document Identifier — upload or scan a document WITHOUT picking
 * its checklist slot first. OCR + the same keyword-classification engine
 * used elsewhere ranks the most likely matches against every requirement
 * on this application (mandatory or optional, template or ad-hoc), and
 * shows what's still missing for context. The AI only ever suggests — a
 * human always confirms, reclassifies, or rejects before anything saves.
 */
export function AiDocumentIdentifierModal({
  open,
  onClose,
  application,
  allRequirements,
  entries,
  existingDocumentsForApp,
  onSaved,
}: Props) {
  const { profile } = useAuth()
  const { notify } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('select')
  const [matches, setMatches] = useState<RankedMatch[]>([])
  const [extracted, setExtracted] = useState<ReturnType<typeof extractFields>>({})
  const [ocrText, setOcrText] = useState('')
  const [qualityFlags, setQualityFlags] = useState<QualityFlag[]>([])
  const [overrideQuality, setOverrideQuality] = useState(false)
  const [selectedRequirementId, setSelectedRequirementId] = useState('')
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null)
  const [finalFileName, setFinalFileName] = useState('')
  const [finalFileType, setFinalFileType] = useState('')
  const [finalPageCount, setFinalPageCount] = useState(1)
  const [saving, setSaving] = useState(false)

  const missing = entries.filter((e) => e.requirement.required && e.displayStatus === 'pending')

  function reset() {
    setStep('select')
    setMatches([])
    setExtracted({})
    setOcrText('')
    setQualityFlags([])
    setOverrideQuality(false)
    setSelectedRequirementId('')
    setFinalBlob(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function analyzeImage(dataUrl: string, file: Blob, fileName: string, fileType: string) {
    setStep('analyzing')
    try {
      const text = await runOcr(dataUrl)
      const flags = await checkImageQuality(dataUrl)
      const dupFlags = checkDuplicate(fileName, file.size, existingDocumentsForApp)
      const ranked = rankDocumentMatches(text, fileName, allRequirements)

      setOcrText(text)
      setExtracted(extractFields(text))
      setQualityFlags([...flags, ...dupFlags])
      setMatches(ranked)
      setSelectedRequirementId(ranked[0]?.requirement.id ?? '')
      setFinalBlob(file)
      setFinalFileName(fileName)
      setFinalFileType(fileType)
      setFinalPageCount(1)
      setStep('result')
    } catch {
      notify('Unable to analyze this document. Please try again.', 'error')
      setStep('select')
    }
  }

  async function analyzePdf(file: File) {
    setStep('analyzing')
    try {
      const buffer = await file.arrayBuffer()
      const inspection = await safeInspectPdf(buffer)
      const pdfFlags = checkPdfQuality(inspection)

      let text = ''
      if (inspection.ok) {
        try {
          const firstPageImg = await renderPdfFirstPageToDataUrl(buffer.slice(0))
          text = await runOcr(firstPageImg)
        } catch {
          /* preview best-effort only */
        }
      }

      const dupFlags = checkDuplicate(file.name, file.size, existingDocumentsForApp)
      const ranked = rankDocumentMatches(text, file.name, allRequirements)

      setOcrText(text)
      setExtracted(extractFields(text))
      setQualityFlags([...pdfFlags, ...dupFlags])
      setMatches(ranked)
      setSelectedRequirementId(ranked[0]?.requirement.id ?? '')
      setFinalBlob(file)
      setFinalFileName(file.name)
      setFinalFileType('application/pdf')
      setFinalPageCount(inspection.ok ? inspection.pageCount : 1)
      setStep('result')
    } catch {
      notify('Unable to read this PDF. Please try a different file.', 'error')
      setStep('select')
    }
  }

  function onSelectFile(file: File) {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      notify(`"${file.name}" has an unsupported file type.`, 'error')
      return
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      notify(`"${file.name}" exceeds the ${(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB limit.`, 'error')
      return
    }
    if (file.type === 'application/pdf') {
      analyzePdf(file)
    } else {
      const reader = new FileReader()
      reader.onload = () => analyzeImage(reader.result as string, file, file.name, file.type)
      reader.readAsDataURL(file)
    }
  }

  function onCapture(dataUrl: string) {
    fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) => analyzeImage(dataUrl, blob, `capture_${Date.now()}.jpg`, 'image/jpeg'))
  }

  async function handleSave() {
    if (!profile || !finalBlob) return
    const targetRequirement = allRequirements.find((r) => r.id === selectedRequirementId)
    if (!targetRequirement) {
      notify('Please select which document this is before saving.', 'error')
      return
    }
    if (qualityFlags.length > 0 && !overrideQuality) {
      notify('Please resolve or override the quality warnings before saving.', 'error')
      return
    }

    setSaving(true)
    try {
      const existingDocument = entries.find((e) => e.requirement.id === targetRequirement.id)?.document ?? null
      const categoryCode = targetRequirement.document_categories?.code ?? 'OTHER'
      const storagePath = buildLoanDocumentPath(application.id, categoryCode, finalFileName)

      const { error: uploadError } = await supabase.storage
        .from('loan-documents')
        .upload(storagePath, finalBlob, { contentType: finalFileType, upsert: false })
      if (uploadError) throw uploadError

      const flagsWithOverride = qualityFlags.map((f) => ({
        ...f,
        overridden: overrideQuality,
        overridden_by: overrideQuality ? profile.id : undefined,
      }))
      const nextVersion = existingDocument ? existingDocument.version + 1 : 1
      const matchedConfidence = matches.find((m) => m.requirement.id === targetRequirement.id)?.confidence ?? null

      const { data: inserted, error: insertError } = await supabase
        .from('documents')
        .insert({
          application_id: application.id,
          requirement_id: targetRequirement.id,
          file_name: finalFileName,
          storage_path: storagePath,
          file_type: finalFileType,
          file_size: finalBlob.size,
          page_count: finalPageCount,
          ocr_text: ocrText || null,
          document_type: targetRequirement.document_name,
          classification_confidence: matchedConfidence,
          status: 'uploaded',
          quality_flags: flagsWithOverride,
          version: nextVersion,
          replaced_document_id: existingDocument?.id ?? null,
          uploaded_by: profile.id,
        })
        .select()
        .single()

      if (insertError) throw insertError

      await writeAuditLog({
        userId: profile.id,
        applicationId: application.id,
        action: 'DOCUMENT_IDENTIFIED_AND_UPLOADED',
        entityType: 'documents',
        entityId: inserted.id,
        newValue: { file_name: finalFileName, requirement: targetRequirement.document_name, ai_confidence: matchedConfidence },
      })

      notify(`Identified as "${targetRequirement.document_name}" and saved.`, 'success')
      onSaved()
      handleClose()
    } catch (err: any) {
      notify(err.message ?? 'Unable to save this document. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="AI Loan Document Identifier" size="lg">
      {step !== 'result' && missing.length > 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <ListChecks className="h-3.5 w-3.5" /> Still needed for this application ({missing.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missing.slice(0, 8).map((e) => (
              <span key={e.requirement.id} className="badge bg-white text-slate-600 shadow-sm">
                {e.requirement.document_name}
              </span>
            ))}
            {missing.length > 8 && (
              <span className="badge bg-white text-slate-400 shadow-sm">+{missing.length - 8} more</span>
            )}
          </div>
        </div>
      )}

      {step === 'select' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            onClick={() => setStep('camera')}
            className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-6 text-sm font-medium text-slate-700 hover:border-bank-400 hover:bg-bank-50"
          >
            <Camera className="h-6 w-6 text-bank-700" /> Scan with Camera
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-6 text-sm font-medium text-slate-700 hover:border-bank-400 hover:bg-bank-50"
          >
            <FileText className="h-6 w-6 text-bank-700" /> Upload PDF
          </button>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-slate-200 p-6 text-sm font-medium text-slate-700 hover:border-bank-400 hover:bg-bank-50">
            <ImageIcon className="h-6 w-6 text-bank-700" /> Upload Image
            <input
              type="file"
              hidden
              accept="image/jpeg,image/png"
              onChange={(e) => {
                if (e.target.files?.[0]) onSelectFile(e.target.files[0])
                e.target.value = ''
              }}
            />
          </label>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept="application/pdf"
            onChange={(e) => {
              if (e.target.files?.[0]) onSelectFile(e.target.files[0])
              e.target.value = ''
            }}
          />
        </div>
      )}

      {step === 'camera' && (
        <div className="space-y-3">
          <CameraCapture onCapture={onCapture} />
          <button className="btn-secondary btn-sm" onClick={() => setStep('select')}>
            Back
          </button>
        </div>
      )}

      {step === 'analyzing' && (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-bank-600" />
          <p className="text-sm text-slate-600">Reading the document and matching it against the checklist…</p>
        </div>
      )}

      {step === 'result' && (
        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-bank-600" /> AI Suggestions
            </p>
            {matches.length === 0 && (
              <p className="text-sm text-amber-700">
                No confident match found against this application's checklist. Please pick the correct document
                manually below.
              </p>
            )}
            <div className="space-y-1.5">
              {matches.map((m) => (
                <label
                  key={m.requirement.id}
                  className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm ${
                    selectedRequirementId === m.requirement.id
                      ? 'border-bank-500 bg-bank-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="match"
                      checked={selectedRequirementId === m.requirement.id}
                      onChange={() => setSelectedRequirementId(m.requirement.id)}
                    />
                    {m.requirement.document_name}
                  </span>
                  <span className="text-xs font-semibold text-bank-700">{m.confidence}% match</span>
                </label>
              ))}
            </div>

            {(extracted.pan || extracted.aadhaar || extracted.possibleName) && (
              <dl className="mt-3 grid grid-cols-2 gap-1 border-t border-slate-100 pt-3 text-xs">
                {extracted.possibleName && (
                  <>
                    <dt className="text-slate-500">Name Detected</dt>
                    <dd className="font-medium text-slate-800">{extracted.possibleName}</dd>
                  </>
                )}
                {extracted.pan && (
                  <>
                    <dt className="text-slate-500">PAN Detected</dt>
                    <dd className="font-mono font-medium text-slate-800">{extracted.pan}</dd>
                  </>
                )}
                {extracted.aadhaar && (
                  <>
                    <dt className="text-slate-500">Aadhaar Detected</dt>
                    <dd className="font-mono font-medium text-slate-800">{extracted.aadhaar}</dd>
                  </>
                )}
              </dl>
            )}
          </div>

          <div>
            <label className="label">Or select the correct document manually</label>
            <select
              className="input"
              value={selectedRequirementId}
              onChange={(e) => setSelectedRequirementId(e.target.value)}
            >
              <option value="">Select a checklist item…</option>
              {allRequirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.document_name}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-slate-500">
            {finalFileName} · {formatFileSize(finalBlob?.size ?? 0)}
            {finalPageCount > 1 ? ` · ${finalPageCount} pages` : ''}
          </p>

          {qualityFlags.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase text-amber-700">Quality Warnings</p>
              <ul className="mb-3 list-inside list-disc space-y-1 text-sm text-amber-800">
                {qualityFlags.map((f, i) => (
                  <li key={i}>{f.message}</li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-xs font-medium text-amber-900">
                <input type="checkbox" checked={overrideQuality} onChange={(e) => setOverrideQuality(e.target.checked)} />
                I am an authorized user and confirm this document should be accepted despite the warnings above.
              </label>
            </div>
          )}

          <div className="flex justify-between gap-2 border-t border-slate-200 pt-4">
            <button className="btn-danger" onClick={reset}>
              <XCircle className="h-4 w-4" /> Reject / Start Over
            </button>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={handleClose}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={saving || !selectedRequirementId}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm &amp; Save
              </button>
            </div>
          </div>

          {!selectedRequirementId && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Select which document this is before saving.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
