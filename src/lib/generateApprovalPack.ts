import JSZip from 'jszip'
import { supabase } from './supabaseClient'
import { buildApprovalPackPath } from './storagePaths'
import { buildDocumentIndexPdf, buildMissingDocumentsPdf } from './exportReports'
import { slugifyFileName } from './format'
import { checkApprovalReadiness, type ChecklistEntry } from './completeness'
import { writeAuditLog } from './audit'
import type { LoanApplication } from '@/types/database'

export interface GeneratePackOptions {
  application: LoanApplication
  entries: ChecklistEntry[]
  userId: string
  withExceptions: boolean
  exceptionRemarks?: string
}

export interface GeneratePackResult {
  approvalPackId: string
  zipFilePath: string
  documentCount: number
}

function extensionFor(fileType: string): string {
  if (fileType === 'application/pdf') return '.pdf'
  if (fileType === 'image/png') return '.png'
  if (fileType === 'image/webp') return '.webp'
  return '.jpg'
}

export async function generateApprovalPack(options: GeneratePackOptions): Promise<GeneratePackResult> {
  const { application, entries, userId, withExceptions, exceptionRemarks } = options

  const readiness = checkApprovalReadiness(entries)
  if (!readiness.ready && !withExceptions) {
    throw new Error(
      'This application is not ready for approval. Resolve the missing/unverified documents or choose "Generate With Exceptions".'
    )
  }

  const zip = new JSZip()
  const rootName = application.application_no
  const root = zip.folder(rootName)!

  // Group by category, preserving requirement sequence order.
  const byCategory = new Map<string, { prefix: string; entries: ChecklistEntry[] }>()
  for (const entry of entries) {
    const cat = entry.requirement.document_categories
    if (!cat) continue
    const key = cat.code
    if (!byCategory.has(key)) byCategory.set(key, { prefix: cat.folder_prefix, entries: [] })
    byCategory.get(key)!.entries.push(entry)
  }

  let documentCount = 0
  let totalSize = 0

  const sortedCategories = Array.from(byCategory.values()).sort((a, b) => a.prefix.localeCompare(b.prefix))

  for (const category of sortedCategories) {
    const withDocs = category.entries.filter((e) => e.document)
    if (withDocs.length === 0) continue
    const folder = root.folder(category.prefix)!
    let seq = 1
    for (const entry of withDocs) {
      const doc = entry.document!
      const { data: blob, error } = await supabase.storage.from('loan-documents').download(doc.storage_path)
      if (error || !blob) continue
      const fileName = `${String(seq).padStart(2, '0')}_${slugifyFileName(entry.requirement.document_name)}${extensionFor(doc.file_type)}`
      folder.file(fileName, blob)
      documentCount += 1
      totalSize += doc.file_size
      seq += 1
    }
  }

  // 00_INDEX: document index + missing-document report
  const indexFolder = root.folder('00_INDEX')!
  const indexPdf = buildDocumentIndexPdf(application, entries)
  indexFolder.file('Document_Index.pdf', indexPdf)

  const missingEntries = entries.filter((e) => e.requirement.required && e.displayStatus !== 'verified' && e.displayStatus !== 'waived')
  const missingPdf = buildMissingDocumentsPdf(application, missingEntries)
  indexFolder.file('Missing_Document_Report.pdf', missingPdf)

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const zipPath = buildApprovalPackPath(application.id, `${application.application_no}_Approval_Pack.zip`)

  const { error: uploadError } = await supabase.storage
    .from('approval-packs')
    .upload(zipPath, zipBlob, { contentType: 'application/zip', upsert: false })
  if (uploadError) throw uploadError

  const exceptions = withExceptions
    ? readiness.missingDocuments.map((e) => ({ requirement_id: e.requirement.id, document_name: e.requirement.document_name }))
    : []
  const missingDocumentsPayload = missingEntries.map((e) => ({
    requirement_id: e.requirement.id,
    document_name: e.requirement.document_name,
  }))

  const { data: pack, error: insertError } = await supabase
    .from('approval_packs')
    .insert({
      application_id: application.id,
      zip_file_path: zipPath,
      document_count: documentCount,
      total_size_bytes: zipBlob.size,
      status: withExceptions ? 'with_exceptions' : 'final',
      exceptions,
      exception_remarks: withExceptions ? exceptionRemarks ?? null : null,
      missing_documents: missingDocumentsPayload,
      generated_by: userId,
    })
    .select()
    .single()

  if (insertError) throw insertError

  await writeAuditLog({
    userId,
    applicationId: application.id,
    action: withExceptions ? 'APPROVAL_PACK_GENERATED_WITH_EXCEPTIONS' : 'APPROVAL_PACK_GENERATED',
    entityType: 'approval_packs',
    entityId: pack.id,
    newValue: {
      document_count: documentCount,
      exceptions,
      exception_remarks: exceptionRemarks ?? null,
    },
  })

  // Reflect readiness on the parent application.
  await supabase
    .from('loan_applications')
    .update({ status: readiness.ready ? 'ready_for_approval' : 'pending_verification' })
    .eq('id', application.id)

  return { approvalPackId: pack.id, zipFilePath: zipPath, documentCount }
}
