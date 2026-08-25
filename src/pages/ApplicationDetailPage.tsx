import { useMemo } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { useApplication, useApplicationDocuments, useChecklist } from '@/hooks/queries'
import { buildChecklist, computeCompleteness } from '@/lib/completeness'
import { ApplicationHeader } from '@/components/applications/ApplicationHeader'
import { DocumentChecklistTable } from '@/components/documents/DocumentChecklistTable'
import { ReviewTab } from '@/components/review/ReviewTab'
import { ApprovalPackTab } from '@/components/approvalpack/ApprovalPackTab'
import { EmailTab } from '@/components/email/EmailTab'
import { HistoryTab } from '@/components/history/HistoryTab'

export default function ApplicationDetailPage() {
  const { id, tab } = useParams<{ id: string; tab?: string }>()
  const activeTab = tab ?? 'scanner'

  const { data: application, isLoading: loadingApp } = useApplication(id)
  const { data: requirements, isLoading: loadingChecklist } = useChecklist(application?.loan_category_id)
  const { data: documents, isLoading: loadingDocs, refetch } = useApplicationDocuments(id)

  const entries = useMemo(
    () => buildChecklist(requirements ?? [], documents ?? []),
    [requirements, documents]
  )
  const stats = useMemo(() => computeCompleteness(entries), [entries])

  if (!id) return <Navigate to="/applications" replace />
  if (loadingApp || loadingChecklist || loadingDocs || !application) {
    return <p className="p-6 text-center text-sm text-slate-400">Loading application…</p>
  }

  return (
    <div className="space-y-6">
      <ApplicationHeader application={application} stats={stats} />

      {activeTab === 'scanner' && (
        <DocumentChecklistTable
          entries={entries}
          allRequirements={requirements ?? []}
          application={application}
          existingDocumentsForApp={documents ?? []}
          onChanged={() => refetch()}
        />
      )}

      {activeTab === 'review' && (
        <ReviewTab
          application={application}
          entries={entries}
          stats={stats}
          onChanged={() => refetch()}
        />
      )}

      {activeTab === 'approval-pack' && (
        <ApprovalPackTab application={application} entries={entries} stats={stats} />
      )}

      {activeTab === 'email' && <EmailTab application={application} />}

      {activeTab === 'history' && <HistoryTab application={application} />}
    </div>
  )
}
