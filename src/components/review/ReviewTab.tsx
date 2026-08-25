import { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { ApprovalReadinessPanel } from './ApprovalReadinessPanel'
import { MissingDocumentsModal } from './MissingDocumentsModal'
import { ReviewDocumentTable } from './ReviewDocumentTable'
import { useChecklist } from '@/hooks/queries'
import type { ChecklistEntry, CompletenessStats } from '@/lib/completeness'
import type { LoanApplication } from '@/types/database'

export function ReviewTab({
  application,
  entries,
  stats,
  onChanged,
}: {
  application: LoanApplication
  entries: ChecklistEntry[]
  stats: CompletenessStats
  onChanged: () => void
}) {
  const { data: requirements } = useChecklist(application.loan_category_id, application.id)
  const [missingOpen, setMissingOpen] = useState(false)

  const missing = entries.filter((e) => e.requirement.required && e.displayStatus === 'pending')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">Application Review</h2>
        <button className="btn-secondary" onClick={() => setMissingOpen(true)}>
          <ClipboardList className="h-4 w-4" /> View Missing Documents ({stats.missing})
        </button>
      </div>

      <ApprovalReadinessPanel application={application} entries={entries} />

      <ReviewDocumentTable
        entries={entries}
        allRequirements={requirements ?? []}
        application={application}
        existingDocumentsForApp={entries.flatMap((e) => (e.document ? [e.document] : []))}
        onChanged={onChanged}
      />

      <MissingDocumentsModal
        open={missingOpen}
        onClose={() => setMissingOpen(false)}
        application={application}
        missing={missing}
      />
    </div>
  )
}
