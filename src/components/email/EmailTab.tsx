import { useEffect, useState } from 'react'
import { Send, Loader2, RefreshCcw } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useApprovalPacks, useEmailLogs } from '@/hooks/queries'
import { formatCurrency, formatDateTime } from '@/lib/format'
import type { LoanApplication } from '@/types/database'

export function EmailTab({ application }: { application: LoanApplication }) {
  const { profile } = useAuth()
  const { notify } = useToast()
  const { data: packs } = useApprovalPacks(application.id)
  const { data: logs, refetch } = useEmailLogs(application.id)

  const latestPack = packs?.[0]
  const canSend = profile && ['admin', 'branch_manager', 'credit_officer'].includes(profile.role)

  const [to, setTo] = useState(application.email ?? '')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setSubject(`Loan Approval Documents – ${application.application_no} – ${application.customer_name}`)
    setMessage(
      `Dear Team,\n\nPlease find attached the complete document pack for the loan application below.\n\n` +
        `Customer Name: ${application.customer_name}\n` +
        `Application ID: ${application.application_no}\n` +
        `Loan Type: ${application.loan_categories?.name ?? ''}\n` +
        `Loan Amount: ${formatCurrency(application.loan_amount)}\n\n` +
        `This is a secure, time-limited download link to confidential KYC and financial documents. ` +
        `Please do not forward this email to unauthorized recipients.\n\nRegards,\n${application.branches?.name ?? 'Branch Team'}`
    )
  }, [application])

  async function send() {
    if (!latestPack) {
      notify('Generate an approval pack before sending it by email.', 'error')
      return
    }
    if (!to.trim()) {
      notify('Please enter at least one recipient email address.', 'error')
      return
    }
    setSending(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('send-approval-pack-email', {
        body: {
          applicationId: application.id,
          approvalPackId: latestPack.id,
          to,
          cc,
          bcc,
          subject,
          message,
        },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      notify('Approval pack emailed successfully.', 'success')
      refetch()
    } catch (err: any) {
      notify(err.message ?? 'Email could not be sent.', 'error')
    } finally {
      setSending(false)
    }
  }

  async function resend(logId: string) {
    const log = logs?.find((l) => l.id === logId)
    if (!log || !latestPack) return
    setSending(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('send-approval-pack-email', {
        body: {
          applicationId: application.id,
          approvalPackId: log.approval_pack_id ?? latestPack.id,
          to: log.recipient,
          cc: log.cc ?? '',
          bcc: log.bcc ?? '',
          subject: log.subject,
          message: log.message ?? '',
        },
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      notify('Email resent.', 'success')
      refetch()
    } catch (err: any) {
      notify(err.message ?? 'Resend failed.', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-slate-800">Send Approval Pack by Email</h2>
        {!latestPack && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No approval pack has been generated yet. Go to the Approval Pack tab first.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">To</label>
            <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" />
          </div>
          <div>
            <label className="label">CC</label>
            <input className="input" value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div>
            <label className="label">BCC</label>
            <input className="input" value={bcc} onChange={(e) => setBcc(e.target.value)} />
          </div>
          <div>
            <label className="label">Subject</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="input" rows={8} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        {canSend ? (
          <button className="btn-primary" onClick={send} disabled={sending || !latestPack}>
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Send className="h-4 w-4" /> Send Approval Pack
          </button>
        ) : (
          <p className="text-xs text-slate-400">
            Only Admin, Branch Manager or Credit Officer roles can send approval packs by email.
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-slate-700">Email History</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {(logs ?? []).length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">No emails sent yet.</p>
          )}
          {(logs ?? []).map((log) => (
            <div key={log.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{log.subject}</p>
                <p className="text-xs text-slate-500">
                  To: {log.recipient} {log.cc && `· CC: ${log.cc}`} · {formatDateTime(log.sent_at)}
                </p>
                {log.status === 'failed' && log.error_message && (
                  <p className="text-xs text-red-600">{log.error_message}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`badge ${
                    log.status === 'sent'
                      ? 'bg-emerald-50 text-emerald-700'
                      : log.status === 'failed'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {log.status}
                </span>
                {canSend && (
                  <button className="btn-secondary btn-sm" onClick={() => resend(log.id)} disabled={sending}>
                    <RefreshCcw className="h-3.5 w-3.5" /> Resend
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
