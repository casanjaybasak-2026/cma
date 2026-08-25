import type { DocumentRequirement, DocumentRow, DocumentStatus } from '@/types/database'

export interface ChecklistEntry {
  requirement: DocumentRequirement
  document: DocumentRow | null
  displayStatus: DocumentStatus
}

export interface CompletenessStats {
  totalRequired: number
  uploaded: number
  verified: number
  missing: number
  rejected: number
  replaceRequired: number
  percent: number
}

/** Latest active document per requirement (highest version wins). */
export function buildChecklist(
  requirements: DocumentRequirement[],
  documents: DocumentRow[]
): ChecklistEntry[] {
  const byRequirement = new Map<string, DocumentRow>()
  for (const doc of documents) {
    if (!doc.requirement_id || doc.deleted_at) continue
    const existing = byRequirement.get(doc.requirement_id)
    if (!existing || doc.version > existing.version) {
      byRequirement.set(doc.requirement_id, doc)
    }
  }

  return requirements.map((requirement) => {
    const document = byRequirement.get(requirement.id) ?? null
    let displayStatus: DocumentStatus
    if (document) {
      displayStatus = document.status
    } else {
      displayStatus = requirement.required ? 'pending' : 'optional'
    }
    return { requirement, document, displayStatus }
  })
}

export function computeCompleteness(entries: ChecklistEntry[]): CompletenessStats {
  const required = entries.filter((e) => e.requirement.required)
  const totalRequired = required.length
  const uploaded = required.filter((e) => e.document !== null).length
  const verified = required.filter(
    (e) => e.displayStatus === 'verified' || e.displayStatus === 'waived'
  ).length
  const missing = required.filter((e) => e.displayStatus === 'pending').length
  const rejected = required.filter((e) => e.displayStatus === 'rejected').length
  const replaceRequired = required.filter((e) => e.displayStatus === 'replace_required').length
  const percent = totalRequired === 0 ? 0 : Math.round((uploaded / totalRequired) * 100)
  return { totalRequired, uploaded, verified, missing, rejected, replaceRequired, percent }
}

export interface ReadinessResult {
  ready: boolean
  blockers: string[]
  missingDocuments: ChecklistEntry[]
}

export function checkApprovalReadiness(entries: ChecklistEntry[]): ReadinessResult {
  const required = entries.filter((e) => e.requirement.required)
  const missingDocuments = required.filter(
    (e) => e.displayStatus === 'pending' || e.displayStatus === 'rejected' || e.displayStatus === 'replace_required'
  )
  const notVerified = required.filter(
    (e) => e.displayStatus === 'uploaded' || e.displayStatus === 'processing' || e.displayStatus === 'submitted_for_verification'
  )

  const blockers: string[] = []
  if (missingDocuments.length > 0) {
    blockers.push(`${missingDocuments.length} mandatory document(s) missing, rejected or requiring replacement.`)
  }
  if (notVerified.length > 0) {
    blockers.push(`${notVerified.length} mandatory document(s) uploaded but not yet verified by a Checker.`)
  }

  return { ready: blockers.length === 0, blockers, missingDocuments: [...missingDocuments, ...notVerified] }
}
