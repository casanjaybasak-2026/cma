import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/contexts/ToastContext'
import { formatDateTime, formatFileSize } from '@/lib/format'
import type { ApprovalPack } from '@/types/database'

interface Row extends ApprovalPack {
  loan_applications: { id: string; application_no: string; customer_name: string } | null
}

export default function ApprovalPacksPage() {
  const { notify } = useToast()
  const { data, isLoading } = useQuery({
    queryKey: ['all_approval_packs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_packs')
        .select('*, loan_applications(id, application_no, customer_name)')
        .order('generated_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as unknown as Row[]
    },
  })

  async function downloadZip(path: string) {
    const { data, error } = await supabase.storage.from('approval-packs').createSignedUrl(path, 300)
    if (error || !data) {
      notify('Unable to generate a secure download link.', 'error')
      return
    }
    window.location.href = data.signedUrl
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Approval Packs</h1>
        <p className="text-sm text-slate-500">All ZIP approval packs generated across applications.</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Application</th>
              <th className="px-4 py-3">Documents</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Generated</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {(data ?? []).map((pack) => (
              <tr key={pack.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{pack.loan_applications?.customer_name}</p>
                  <p className="font-mono text-xs text-bank-700">{pack.loan_applications?.application_no}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{pack.document_count}</td>
                <td className="px-4 py-3 text-slate-600">{formatFileSize(pack.total_size_bytes)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`badge ${pack.status === 'final' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                  >
                    {pack.status === 'final' ? 'Final' : 'With Exceptions'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(pack.generated_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button className="btn-secondary btn-sm" onClick={() => downloadZip(pack.zip_file_path)}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
                    {pack.loan_applications && (
                      <Link to={`/applications/${pack.loan_applications.id}/email`} className="btn-primary btn-sm">
                        Email
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
