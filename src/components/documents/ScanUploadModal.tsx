import { useRef, useState } from 'react'
import { Camera, FileText, Image as ImageIcon, Layers, Loader2, Plus, Trash2, ArrowUp, ArrowDown, CheckCircle2, XCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { writeAuditLog } from '@/lib/audit'
import { buildLoanDocumentPath } from '@/lib/storagePaths'
import { buildPdfFromPages, renderPdfFirstPageToDataUrl, safeInspectPdf, type CapturedPage } from '@/lib/pdfUtils'
import { runOcr } from '@/lib/ocr'
import { classifyDocument } from '@/lib/classify'
import { checkDuplicate, checkImageQuality, checkPdfQuality, checkWrongDocumentType } from '@/lib/qualityChecks'
import { CameraCapture } from './CameraCapture'
import { PageEditor } from './PageEditor'
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '@/lib/constants'
import { formatFileSize } from '@/lib/format'
import type { DocumentRequirement, DocumentRow, LoanApplication, QualityFlag } from '@/types/database'

type SourceMode = 'camera' | 'pdf' | 'image' | 'multi-image' | null

interface Props {
  open: boolean
  onClose: () => void
  application: LoanApplication
  requirement: DocumentRequirement
  allRequirements: DocumentRequirement[]
  existingDocument?: DocumentRow | null
  existingDocumentsForApp: DocumentRow[]
  onSaved: () => void
}

export function ScanUploadModal({
  open,
  onClose,
  application,
  requirement,
  allRequirements,
  existingDocument,
  existingDocumentsForApp,
  onSaved,
}: Props) {
  const { profile } = useAuth()
  const { notify } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [sourceMode, setSourceMode] = useState<SourceMode>(null)
  const [pages, setPages] = useState<CapturedPage[]>([])
  const [directPdfFile, setDirectPdfFile] = useState<File | null>(null)
  const [step, setStep] = useState<'source' | 'capture' | 'analyzing' | 'review'>('source')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const [selectedRequirementId, setSelectedRequirementId] = useState(requirement.id)
  const [classification, setClassification] = useState<{
    documentType: string | null
    confidence: number
    pan?: string
    aadhaar?: string
    possibleName?: string
  } | null>(null)
  const [qualityFlags, setQualityFlags] = useState<QualityFlag[]>([])
  const [overrideQuality, setOverrideQuality] = useState(false)
  const [ocrText, setOcrText] = useState('')
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null)
  const [finalFileName, setFinalFileName] = useState('')
  const [finalFileType, setFinalFileType] = useState('')
  const [finalPageCount, setFinalPageCount] = useState(1);
  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState<'pending' | 'confirmed' | 'reclassify'>('pending')

  function reset() {
    setSourceMode(null)
    setPages([])
    setDirectPdfFile(null)
    setStep('source')
    setEditingIndex(null)
    setSelectedRequirementId(requirement.id)
    setClassification(null)
    setQualityFlags([])
    setOverrideQuality(false)
    setOcrText('')
    setFinalBlob(null)
    setConfirmed('pending')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function addPage(dataUrl: string) {
    setPages((p) => [...p, { id: crypto.randomUUID(), dataUrl, rotation: 0 }])
  }

  function removePage(id: string) {
    setPages((p) => p.filter((pg) => pg.id !== id))
  }

  function movePage(index: number, dir: -1 | 1) {
    setPages((p) => {
      const next = [...p]
      const target = index + dir
      if (target < 0 || target >= next.length) return p
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function onSelectPdf(file: File) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      notify(`File exceeds the ${(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB limit.`, 'error')
      return
    }
    setDirectPdfFile(file)
    setStep('analyzing')
    await analyzePdf(file)
  }

  async function onSelectImages(files: FileList, multi: boolean) {
    const arr = Array.from(files)
    for (const f of arr) {
      if (!ALLOWED_MIME_TYPES.includes(f.type)) {
        notify(`"${f.name}" has an unsupported file type.`, 'error')
        return
      }
      if (f.size > MAX_FILE_SIZE_BYTES) {
        notify(`"${f.name}" exceeds the ${(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB limit.`, 'error')
        return
      }
    }
    const dataUrls = await Promise.all(arr.map(fileToDataUrl))
    const newPages: CapturedPage[] = dataUrls.map((dataUrl) => ({ id: crypto.randomUUID(), dataUrl, rotation: 0 }))
    setPages((p) => [...p, ...newPages])
    if (!multi) {
      // single image upload goes straight to review after this one page
      setStep('capture')
    } else {
      setStep('capture')
    }
  }

  async function analyzePdf(file: File) {
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
          /* preview rendering best-effort only */
        }
      }

      const dupFlags = checkDuplicate(file.name, file.size, existingDocumentsForApp)
      const result = classifyDocument(text, file.name, allRequirements)
      const wrongTypeFlags = checkWrongDocumentType(requirement.id, result.bestMatch?.id ?? null, result.confidence)

      setOcrText(text)
      setClassification({
        documentType: result.bestMatch?.document_name ?? null,
        confidence: result.confidence,
        pan: result.extracted.pan,
        aadhaar: result.extracted.aadhaar,
        possibleName: result.extracted.possibleName,
      })
      setQualityFlags([...pdfFlags, ...dupFlags, ...wrongTypeFlags])
      setFinalBlob(file)
      setFinalFileName(file.name)
      setFinalFileType('application/pdf')
      setFinalPageCount(inspection.ok ? inspection.pageCount : 1)
      setStep('review')
    } catch (err) {
      notify('Unable to read this PDF. Please try a different file.', 'error')
      setStep('source')
    }
  }

  async function finalizePages(builtPages: CapturedPage[]) {
    setStep('analyzing')
    try {
      const pdfBlob = await buildPdfFromPages(builtPages)
      const text = await runOcr(builtPages[0].dataUrl)
      const fileName = `${requirement.code}_${Date.now()}.pdf`

      let flags: QualityFlag[] = []
      for (const pg of builtPages) {
        flags = flags.concat(await checkImageQuality(pg.dataUrl))
      }
      flags = flags.concat(checkDuplicate(fileName, pdfBlob.size, existingDocumentsForApp))

      const result = classifyDocument(text, fileName, allRequirements)
      flags = flags.concat(checkWrongDocumentType(requirement.id, result.bestMatch?.id ?? null, result.confidence))

      setOcrText(text)
      setClassification({
        documentType: result.bestMatch?.document_name ?? null,
        confidence: result.confidence,
        pan: result.extracted.pan,
        aadhaar: result.extracted.aadhaar,
        possibleName: result.extracted.possibleName,
      })
      setQualityFlags(flags)
      setFinalBlob(pdfBlob)
      setFinalFileName(fileName)
      setFinalFileType('application/pdf')
      setFinalPageCount(builtPages.length)
      setStep('review')
    } catch (err) {
      notify('Unable to process the scanned pages. Please try again.', 'error')
      setStep('capture')
    }
  }

  async function handleSave() {
    if (!finalBlob || !profile) return
    const unresolvedQuality = qualityFlags.length > 0 && !overrideQuality
    if (unresolvedQuality) {
      notify('Please resolve or override the quality warnings before saving.', 'error')
      return
    }
    if (confirmed === 'pending') {
      notify('Please confirm or reclassify the document type before saving.', 'error')
      return
    }

    setSaving(true)
    try {
      const targetRequirement =
        allRequirements.find((r) => r.id === selectedRequirementId) ?? requirement
      const categoryCode = (targetRequirement as any).document_categories?.code ?? 'OTHER'
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
          classification_confidence: classification?.confidence ?? null,
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
        action: existingDocument ? 'DOCUMENT_REPLACED' : 'DOCUMENT_UPLOADED',
        entityType: 'documents',
        entityId: inserted.id,
        oldValue: existingDocument ? { id: existingDocument.id, version: existingDocument.version } : null,
        newValue: { file_name: finalFileName, requirement: targetRequirement.document_name },
      })

      notify(`${targetRequirement.document_name} saved successfully.`, 'success')
      onSaved()
      handleClose()
    } catch (err: any) {
      notify(err.message ?? 'Unable to upload document. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const editingPage = editingIndex !== null ? pages[editingIndex] : null

  return (
    <Modal open={open} onClose={handleClose} title={`Scan / Upload — ${requirement.document_name}`} size="lg">
      {step === 'source' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SourceButton icon={Camera} label="Scan using Camera" onClick={() => { setSourceMode('camera'); setStep('capture') }} />
          <SourceButton
            icon={FileText}
            label="Upload PDF"
            onClick={() => { setSourceMode('pdf'); fileInputRef.current?.click() }}
          />
          <SourceButton
            icon={ImageIcon}
            label="Upload JPG / PNG"
            onClick={() => { setSourceMode('image'); fileInputRef.current?.click() }}
          />
          <SourceButton
            icon={Layers}
            label="Upload Multiple Pages"
            onClick={() => { setSourceMode('multi-image'); fileInputRef.current?.click() }}
          />
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept={sourceMode === 'pdf' ? 'application/pdf' : 'image/jpeg,image/png'}
            multiple={sourceMode === 'multi-image'}
            onChange={(e) => {
              const files = e.target.files
              if (!files || files.length === 0) return
              if (sourceMode === 'pdf') onSelectPdf(files[0])
              else onSelectImages(files, sourceMode === 'multi-image')
              e.target.value = ''
            }}
          />
        </div>
      )}

      {step === 'capture' && sourceMode === 'camera' && editingPage === null && (
        <div className="space-y-4">
          <CameraCapture onCapture={addPage} />
          <PageFilmstrip pages={pages} onEdit={setEditingIndex} onRemove={removePage} onMove={movePage} />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={handleClose}>Cancel</button>
            <button className="btn-primary" disabled={pages.length === 0} onClick={() => finalizePages(pages)}>
              <CheckCircle2 className="h-4 w-4" /> Save {pages.length > 1 ? `(${pages.length} pages)` : ''}
            </button>
          </div>
        </div>
      )}

      {step === 'capture' && sourceMode !== 'camera' && editingPage === null && (
        <div className="space-y-4">
          <PageFilmstrip pages={pages} onEdit={setEditingIndex} onRemove={removePage} onMove={movePage} />
          <button
            className="btn-secondary btn-sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="h-3.5 w-3.5" /> Add Another Page
          </button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept="image/jpeg,image/png"
            multiple
            onChange={(e) => {
              const files = e.target.files
              if (files && files.length) onSelectImages(files, true)
              e.target.value = ''
            }}
          />
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button className="btn-secondary" onClick={handleClose}>Cancel</button>
            <button className="btn-primary" disabled={pages.length === 0} onClick={() => finalizePages(pages)}>
              <CheckCircle2 className="h-4 w-4" /> Save as PDF ({pages.length} page{pages.length !== 1 ? 's' : ''})
            </button>
          </div>
        </div>
      )}

      {editingPage && (
        <div className="space-y-3">
          <PageEditor
            dataUrl={editingPage.dataUrl}
            onChange={(newUrl) => {
              setPages((p) => p.map((pg, i) => (i === editingIndex ? { ...pg, dataUrl: newUrl } : pg)))
            }}
          />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setEditingIndex(null)}>
              Done Editing
            </button>
          </div>
        </div>
      )}

      {step === 'analyzing' && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-bank-600" />
          <p className="text-sm text-slate-600">Running OCR and document classification…</p>
        </div>
      )}

      {step === 'review' && classification && (
        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Classification Result</p>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Document Type</dt>
              <dd className="font-medium text-slate-800">{classification.documentType ?? 'Not recognized'}</dd>
              {classification.possibleName && (
                <>
                  <dt className="text-slate-500">Name Detected</dt>
                  <dd className="font-medium text-slate-800">{classification.possibleName}</dd>
                </>
              )}
              {classification.pan && (
                <>
                  <dt className="text-slate-500">PAN Detected</dt>
                  <dd className="font-mono font-medium text-slate-800">{classification.pan}</dd>
                </>
              )}
              {classification.aadhaar && (
                <>
                  <dt className="text-slate-500">Aadhaar Detected</dt>
                  <dd className="font-mono font-medium text-slate-800">{classification.aadhaar}</dd>
                </>
              )}
              <dt className="text-slate-500">Confidence</dt>
              <dd className="font-medium text-slate-800">{classification.confidence}%</dd>
              <dt className="text-slate-500">File</dt>
              <dd className="text-slate-600">
                {finalFileName} · {formatFileSize(finalBlob?.size ?? 0)} · {finalPageCount} page(s)
              </dd>
            </dl>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              Does this document belong to <span className="font-semibold">{requirement.document_name}</span>?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className={`btn-sm ${confirmed === 'confirmed' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setSelectedRequirementId(requirement.id)
                  setConfirmed('confirmed')
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
              </button>
              <button
                className={`btn-sm ${confirmed === 'reclassify' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setConfirmed('reclassify')}
              >
                Reclassify
              </button>
              <button className="btn-danger btn-sm" onClick={() => { setStep('source'); setPages([]); setDirectPdfFile(null) }}>
                <XCircle className="h-3.5 w-3.5" /> Reject
              </button>
            </div>
            {confirmed === 'reclassify' && (
              <select
                className="input mt-3"
                value={selectedRequirementId}
                onChange={(e) => {
                  setSelectedRequirementId(e.target.value)
                  setConfirmed('confirmed')
                }}
              >
                <option value="">Select the correct checklist item…</option>
                {allRequirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.document_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {qualityFlags.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase text-amber-700">Quality Warnings</p>
              <ul className="mb-3 list-inside list-disc space-y-1 text-sm text-amber-800">
                {qualityFlags.map((f, i) => (
                  <li key={i}>{f.message}</li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-xs font-medium text-amber-900">
                <input
                  type="checkbox"
                  checked={overrideQuality}
                  onChange={(e) => setOverrideQuality(e.target.checked)}
                />
                I am an authorized user and confirm this document should be accepted despite the warnings above.
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button className="btn-secondary" onClick={handleClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Document
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function SourceButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Camera
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-6 text-sm font-medium text-slate-700 hover:border-bank-400 hover:bg-bank-50"
    >
      <Icon className="h-6 w-6 text-bank-700" />
      {label}
    </button>
  )
}

function PageFilmstrip({
  pages,
  onEdit,
  onRemove,
  onMove,
}: {
  pages: CapturedPage[]
  onEdit: (index: number) => void
  onRemove: (id: string) => void
  onMove: (index: number, dir: -1 | 1) => void
}) {
  if (pages.length === 0) return <p className="text-xs text-slate-400">No pages captured yet.</p>
  return (
    <div className="flex flex-wrap gap-3">
      {pages.map((pg, i) => (
        <div key={pg.id} className="w-28 space-y-1">
          <button onClick={() => onEdit(i)} className="block overflow-hidden rounded-md border border-slate-200">
            <img src={pg.dataUrl} alt={`Page ${i + 1}`} className="h-32 w-28 object-cover" />
          </button>
          <p className="text-center text-[10px] text-slate-500">Page {i + 1}</p>
          <div className="flex items-center justify-center gap-1">
            <button onClick={() => onMove(i, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Move up">
              <ArrowUp className="h-3 w-3" />
            </button>
            <button onClick={() => onMove(i, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Move down">
              <ArrowDown className="h-3 w-3" />
            </button>
            <button onClick={() => onRemove(pg.id)} className="rounded p-1 text-red-400 hover:bg-red-50" aria-label="Delete page">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
