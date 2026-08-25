import { useEffect, useState } from 'react'
import { Loader2, Download } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime, formatFileSize } from '@/lib/format'
import type { DocumentRow } from '@/types/database'

export function DocumentViewerModal({
  open,
  onClose,
  document,
}: {
  open: boolean
  onClose: () => void
  document: DocumentRow | null
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !document) return
    setLoading(true)
    setSignedUrl(null)
    supabase.storage
      .from('loan-documents')
      .createSignedUrl(document.storage_path, 300) // 5 minute signed link
      .then(({ data, error }) => {
        if (!error && data) setSignedUrl(data.signedUrl)
        setLoading(false)
      })
  }, [open, document])

  if (!document) return null

  return (
    <Modal open={open} onClose={onClose} title={document.file_name} size="xl">
      <div className="mb-4 grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4">
        <div>
          <p className="font-semibold text-slate-700">Type</p>
          {document.file_type}
        </div>
        <div>
          <p className="font-semibold text-slate-700">Size</p>
          {formatFileSize(document.file_size)}
        </div>
        <div>
          <p className="font-semibold text-slate-700">Pages</p>
          {document.page_count}
        </div>
        <div>
          <p className="font-semibold text-slate-700">Uploaded</p>
          {formatDateTime(document.uploaded_at)}
        </div>
      </div>

      {loading && (
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}

      {!loading && signedUrl && (
        <>
          {document.file_type === 'application/pdf' ? (
            <iframe src={signedUrl} title={document.file_name} className="h-[70vh] w-full rounded-md border border-slate-200" />
          ) : (
            <img src={signedUrl} alt={document.file_name} className="mx-auto max-h-[70vh] rounded-md border border-slate-200" />
          )}
          <a href={signedUrl} download={document.file_name} className="btn-secondary btn-sm mt-3">
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        </>
      )}

      {!loading && !signedUrl && (
        <p className="py-8 text-center text-sm text-red-600">
          Unable to generate a secure preview link for this document.
        </p>
      )}
    </Modal>
  )
}
