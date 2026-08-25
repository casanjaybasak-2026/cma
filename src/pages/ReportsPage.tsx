import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileDown, Sheet } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { buildGenericReportCsv, buildGenericReportPdf, downloadBlob } from '@/lib/exportReports'
import { formatDateTime } from '@/lib/format'

interface ReportResult {
  columns: string[]
  rows: (string | number)[][]
}

const REPORTS: { key: string; label: string; fetch: () => Promise<ReportResult> }[] = [
  {
    key: 'daily_upload',
    label: 'Daily Upload Report',
    fetch: async () => {
      const since = new Date()
      since.setHours(0, 0, 0, 0)
      const { data } = await supabase
        .from('documents')
        .select('file_name, document_type, uploaded_at, uploaded_by, loan_applications(application_no, customer_name)')
        .gte('uploaded_at', since.toISOString())
        .is('deleted_at', null)
        .order('uploaded_at', { ascending: false })
      return {
        columns: ['Application', 'Customer', 'Document', 'Uploaded By', 'Uploaded At'],
        rows: (data ?? []).map((d: any) => [
          d.loan_applications?.application_no ?? '',
          d.loan_applications?.customer_name ?? '',
          d.document_type ?? d.file_name,
          d.uploaded_by ?? '',
          formatDateTime(d.uploaded_at),
        ]),
      }
    },
  },
  {
    key: 'pending_documents',
    label: 'Pending Document Report',
    fetch: async () => {
      const { data } = await supabase
        .from('application_completeness')
        .select('*, loan_applications(application_no, customer_name, loan_categories(name))')
        .gt('missing_required', 0)
      return {
        columns: ['Application', 'Customer', 'Loan Type', 'Missing Documents'],
        rows: (data ?? []).map((r: any) => [
          r.loan_applications?.application_no ?? '',
          r.loan_applications?.customer_name ?? '',
          r.loan_applications?.loan_categories?.name ?? '',
          r.missing_required,
        ]),
      }
    },
  },
  {
    key: 'completeness',
    label: 'Application Completeness Report',
    fetch: async () => {
      const { data } = await supabase
        .from('application_completeness')
        .select('*, loan_applications(application_no, customer_name, loan_categories(name))')
      return {
        columns: ['Application', 'Customer', 'Loan Type', 'Required', 'Uploaded', 'Verified', 'Completion %'],
        rows: (data ?? []).map((r: any) => [
          r.loan_applications?.application_no ?? '',
          r.loan_applications?.customer_name ?? '',
          r.loan_applications?.loan_categories?.name ?? '',
          r.total_required,
          r.uploaded_required,
          r.verified_required,
          r.total_required ? Math.round((r.uploaded_required / r.total_required) * 100) : 0,
        ]),
      }
    },
  },
  {
    key: 'approval_packs',
    label: 'Approval Pack Report',
    fetch: async () => {
      const { data } = await supabase
        .from('approval_packs')
        .select('document_count, total_size_bytes, status, generated_at, loan_applications(application_no, customer_name)')
        .order('generated_at', { ascending: false })
      return {
        columns: ['Application', 'Customer', 'Documents', 'Size (bytes)', 'Status', 'Generated At'],
        rows: (data ?? []).map((r: any) => [
          r.loan_applications?.application_no ?? '',
          r.loan_applications?.customer_name ?? '',
          r.document_count,
          r.total_size_bytes,
          r.status,
          formatDateTime(r.generated_at),
        ]),
      }
    },
  },
  {
    key: 'email_dispatch',
    label: 'Email Dispatch Report',
    fetch: async () => {
      const { data } = await supabase
        .from('email_logs')
        .select('recipient, subject, status, sent_at, loan_applications(application_no, customer_name)')
        .order('sent_at', { ascending: false })
      return {
        columns: ['Application', 'Customer', 'Recipient', 'Subject', 'Status', 'Sent At'],
        rows: (data ?? []).map((r: any) => [
          r.loan_applications?.application_no ?? '',
          r.loan_applications?.customer_name ?? '',
          r.recipient,
          r.subject,
          r.status,
          formatDateTime(r.sent_at),
        ]),
      }
    },
  },
  {
    key: 'user_activity',
    label: 'User Activity Report',
    fetch: async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('action, entity_type, timestamp, user_id, loan_applications(application_no)')
        .order('timestamp', { ascending: false })
        .limit(500)
      return {
        columns: ['User', 'Action', 'Entity', 'Application', 'Timestamp'],
        rows: (data ?? []).map((r: any) => [
          r.user_id ?? 'System',
          r.action,
          r.entity_type,
          r.loan_applications?.application_no ?? '',
          formatDateTime(r.timestamp),
        ]),
      }
    },
  },
  {
    key: 'branch_wise',
    label: 'Branch-wise Report',
    fetch: async () => {
      const { data: branches } = await supabase.from('branches').select('id, name, code')
      const { data: apps } = await supabase.from('loan_applications').select('branch_id, status')
      const rows = (branches ?? []).map((b) => {
        const branchApps = (apps ?? []).filter((a) => a.branch_id === b.id)
        return [
          b.name,
          b.code,
          branchApps.length,
          branchApps.filter((a) => a.status === 'ready_for_approval').length,
          branchApps.filter((a) => a.status === 'in_progress' || a.status === 'pending_verification').length,
        ]
      })
      return { columns: ['Branch', 'Code', 'Total Applications', 'Ready for Approval', 'In Progress'], rows }
    },
  },
]

export default function ReportsPage() {
  const [selected, setSelected] = useState(REPORTS[0].key)
  const report = REPORTS.find((r) => r.key === selected)!

  const { data, isLoading } = useQuery({
    queryKey: ['report', selected],
    queryFn: report.fetch,
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">Operational reports across applications, documents and email.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => setSelected(r.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              selected === r.key
                ? 'border-bank-600 bg-bank-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <button
          className="btn-secondary btn-sm"
          disabled={!data}
          onClick={() => data && downloadBlob(buildGenericReportCsv(data.columns, data.rows), `${report.key}.csv`)}
        >
          <Sheet className="h-3.5 w-3.5" /> Export CSV / Excel
        </button>
        <button
          className="btn-primary btn-sm"
          disabled={!data}
          onClick={() => data && downloadBlob(buildGenericReportPdf(report.label, data.columns, data.rows), `${report.key}.pdf`)}
        >
          <FileDown className="h-3.5 w-3.5" /> Export PDF
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              {report && data?.columns.map((c) => (
                <th key={c} className="whitespace-nowrap px-4 py-3">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td className="px-4 py-8 text-center text-slate-400">Loading…</td>
              </tr>
            )}
            {!isLoading && (data?.rows.length ?? 0) === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-slate-400">No data available.</td>
              </tr>
            )}
            {data?.rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {row.map((cell, j) => (
                  <td key={j} className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
