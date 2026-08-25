import type { DocumentStatus } from '@/types/database'
import { DOCUMENT_STATUS_META } from '@/lib/constants'
import clsx from 'clsx'

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const meta = DOCUMENT_STATUS_META[status]
  return (
    <span className={clsx('badge', meta.badge)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}
