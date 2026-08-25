import { useMemo, useState } from 'react'
import { Search, Plus, Check, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { writeAuditLog } from '@/lib/audit'
import { useDocumentMasterCatalog } from '@/hooks/queries'
import type { ChecklistEntry } from '@/lib/completeness'
import type { DocumentMaster, LoanApplication } from '@/types/database'

export function AddDocumentModal({
  open,
  onClose,
  application,
  existingEntries,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  application: LoanApplication
  existingEntries: ChecklistEntry[]
  onAdded: () => void
}) {
  const { profile } = useAuth()
  const { notify } = useToast()
  const [search, setSearch] = useState('')
  const [addingCode, setAddingCode] = useState<string | null>(null)
  const { data: catalog, isLoading } = useDocumentMasterCatalog(search)

  const existingCodes = useMemo(
    () => new Set(existingEntries.map((e) => e.requirement.code)),
    [existingEntries]
  )

  const grouped = useMemo(() => {
    const map = new Map<string, DocumentMaster[]>()
    for (const item of catalog ?? []) {
      if (!map.has(item.category_group)) map.set(item.category_group, [])
      map.get(item.category_group)!.push(item)
    }
    return Array.from(map.entries())
  }, [catalog])

  const maxSequence = existingEntries.reduce((max, e) => Math.max(max, e.requirement.sequence), 0)

  async function addDocument(item: DocumentMaster) {
    if (!profile) return
    setAddingCode(item.code)
    try {
      const { data: inserted, error } = await supabase
        .from('document_requirements')
        .insert({
          application_id: application.id,
          loan_category_id: application.loan_category_id,
          document_category_id: item.document_category_id,
          document_name: item.name,
          code: item.code,
          required: true,
          sequence: maxSequence + 1,
          classification_keywords: [],
          master_document_id: item.id,
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          notify(`"${item.name}" is already on this application's checklist.`, 'info')
          return
        }
        throw error
      }

      await writeAuditLog({
        userId: profile.id,
        applicationId: application.id,
        action: 'CHECKLIST_ITEM_ADDED',
        entityType: 'document_requirements',
        entityId: inserted.id,
        newValue: { code: item.code, document_name: item.name },
      })

      notify(`"${item.name}" added to the checklist.`, 'success')
      onAdded()
    } catch (err: any) {
      notify(err.message ?? 'Unable to add this document.', 'error')
    } finally {
      setAddingCode(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Document" size="lg">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Search the bank's master document catalog ({catalog?.length ?? 0} shown) and attach any
          additional document relevant to this application — beyond its default {application.loan_categories?.name}{' '}
          checklist.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search by document name or code (e.g. F29, DPN, hypothecation)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto">
          {isLoading && <p className="py-8 text-center text-sm text-slate-400">Searching…</p>}
          {!isLoading && grouped.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">No matching documents found.</p>
          )}
          {grouped.map(([group, items]) => (
            <div key={group}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{group}</p>
              <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {items.map((item) => {
                  const already = existingCodes.has(item.code)
                  const busy = addingCode === item.code
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-700">{item.name}</p>
                        <p className="text-[11px] text-slate-400">
                          Code {item.code}
                          {item.priority && ` · ${item.priority}`}
                        </p>
                      </div>
                      <button
                        className={already ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
                        disabled={already || busy}
                        onClick={() => addDocument(item)}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : already ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        {already ? 'Added' : 'Add'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
