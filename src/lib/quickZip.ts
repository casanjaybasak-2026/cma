import JSZip from 'jszip'
import { supabase } from './supabaseClient'
import { slugifyFileName } from './format'
import type { ChecklistEntry } from './completeness'
import type { LoanApplication } from '@/types/database'

/**
 * Lightweight, on-demand ZIP of whatever documents are currently attached to
 * the application — unlike the formal Approval Pack, this has no readiness
 * gate and creates no database record; it is purely a convenience download
 * for staff who want the current state of the file right now.
 */
export async function buildQuickZip(application: LoanApplication, entries: ChecklistEntry[]): Promise<Blob> {
  const zip = new JSZip()
  const root = zip.folder(application.application_no)!

  const byCategory = new Map<string, ChecklistEntry[]>()
  for (const entry of entries) {
    if (!entry.document) continue
    const key = entry.requirement.document_categories?.name ?? 'Other'
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key)!.push(entry)
  }

  let count = 0
  for (const [category, items] of byCategory) {
    const folder = root.folder(slugifyFileName(category))!
    for (const entry of items) {
      const doc = entry.document!
      const { data: blob, error } = await supabase.storage.from('loan-documents').download(doc.storage_path)
      if (error || !blob) continue
      const ext = /\.[a-zA-Z0-9]+$/.exec(doc.file_name)?.[0] ?? '.pdf'
      folder.file(`${slugifyFileName(entry.requirement.document_name)}${ext}`, blob)
      count += 1
    }
  }

  if (count === 0) {
    throw new Error('No documents have been uploaded yet for this application.')
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
