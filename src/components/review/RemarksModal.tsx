import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Loader2 } from 'lucide-react'
import type { DocumentRow } from '@/types/database'

export function RemarksModal({
  open,
  onClose,
  document,
  onSave,
  saving,
}: {
  open: boolean
  onClose: () => void
  document: DocumentRow | null
  onSave: (remarks: string) => void
  saving: boolean
}) {
  const [value, setValue] = useState(document?.remarks ?? '')

  if (!document) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Remarks — ${document.file_name}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => onSave(value)} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Remarks
          </button>
        </div>
      }
    >
      <textarea
        className="input"
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a remark for this document (visible in the audit trail and document index)…"
      />
    </Modal>
  )
}
