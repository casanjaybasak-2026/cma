import { FileDown, Sheet } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { buildMissingDocumentsCsv, buildMissingDocumentsPdf, downloadBlob } from '@/lib/exportReports'
import type { ChecklistEntry } from '@/lib/completeness'
import type { LoanApplication } from '@/types/database'

export function MissingDocumentsModal({
  open,
  onClose,
  application,
  missing,
}: {
  open: boolean
  onClose: () => void
  application: LoanApplication
  missing: ChecklistEntry[]
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Missing Documents"
      footer={
        <div className="flex justify-end gap-2">
          <button
            className="btn-secondary btn-sm"
            onClick={() =>
              downloadBlob(
                buildMissingDocumentsCsv(application, missing),
                `${application.application_no}_Missing_Documents.csv`
              )
            }
          >
            <Sheet className="h-3.5 w-3.5" /> Export Excel (CSV)
          </button>
          <button
            className="btn-primary btn-sm"
            onClick={() =>
              downloadBlob(
                buildMissingDocumentsPdf(application, missing),
                `${application.application_no}_Missing_Documents.pdf`
              )
            }
          >
            <FileDown className="h-3.5 w-3.5" /> Export PDF
          </button>
        </div>
      }
    >
      <div className="mb-3 text-sm text-slate-600">
        <p>
          <span className="font-semibold">{application.application_no}</span> — {application.customer_name} (
          {application.loan_categories?.name})
        </p>
      </div>
      {missing.length === 0 ? (
        <p className="py-6 text-center text-sm text-emerald-700">No missing mandatory documents. 🎉</p>
      ) : (
        <ol className="list-inside list-decimal space-y-1 text-sm text-slate-700">
          {missing.map((e) => (
            <li key={e.requirement.id}>
              {e.requirement.document_name}{' '}
              <span className="text-xs text-slate-400">({e.requirement.document_categories?.name})</span>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}
