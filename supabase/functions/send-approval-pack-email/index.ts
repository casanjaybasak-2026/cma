// Supabase Edge Function: send-approval-pack-email
//
// Sends the ZIP approval pack (as a time-limited signed download link,
// never a raw public URL) by email. This is the ONLY place the email
// provider's API key is used — it lives in a server-side secret
// (RESEND_API_KEY) and is never shipped to the browser.
//
// The caller's JWT is required (verify_jwt is on for this function). We
// re-check role + branch authorization here even though RLS also guards
// the underlying tables, because this function uses the service role key
// to read the storage object and therefore bypasses RLS by design.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM_ADDRESS = Deno.env.get('EMAIL_FROM_ADDRESS') ?? 'loans@bank.example'
const LINK_EXPIRY_SECONDS = Number(Deno.env.get('APPROVAL_PACK_LINK_EXPIRY_SECONDS') ?? 259200) // 3 days

interface SendEmailRequest {
  applicationId: string
  approvalPackId: string
  to: string
  cc?: string
  bcc?: string
  subject: string
  message: string
}

function isValidEmailList(value?: string): boolean {
  if (!value) return true
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return value
    .split(',')
    .map((e) => e.trim())
    .every((e) => emailRegex.test(e))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()
    if (userError || !user) return jsonResponse({ error: 'Invalid or expired session' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: profile } = await admin
      .from('profiles')
      .select('id, role, branch_id, name')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'branch_manager', 'credit_officer'].includes(profile.role)) {
      return jsonResponse({ error: 'You are not authorized to send approval packs by email' }, 403)
    }

    const body = (await req.json()) as SendEmailRequest
    const { applicationId, approvalPackId, to, cc, bcc, subject, message } = body

    if (!applicationId || !approvalPackId || !to || !subject) {
      return jsonResponse({ error: 'applicationId, approvalPackId, to and subject are required' }, 400)
    }
    if (!isValidEmailList(to) || !isValidEmailList(cc) || !isValidEmailList(bcc)) {
      return jsonResponse({ error: 'One or more recipient email addresses are invalid' }, 400)
    }

    const { data: application } = await admin
      .from('loan_applications')
      .select('id, branch_id, application_no, customer_name')
      .eq('id', applicationId)
      .single()

    if (!application) return jsonResponse({ error: 'Application not found' }, 404)
    if (profile.role !== 'admin' && application.branch_id !== profile.branch_id) {
      return jsonResponse({ error: 'You do not have access to this application' }, 403)
    }

    const { data: pack } = await admin
      .from('approval_packs')
      .select('id, zip_file_path, application_id')
      .eq('id', approvalPackId)
      .eq('application_id', applicationId)
      .single()

    if (!pack) return jsonResponse({ error: 'Approval pack not found' }, 404)

    const { data: signedUrlData, error: signError } = await admin.storage
      .from('approval-packs')
      .createSignedUrl(pack.zip_file_path, LINK_EXPIRY_SECONDS)

    if (signError || !signedUrlData) {
      await admin.from('email_logs').insert({
        application_id: applicationId,
        approval_pack_id: approvalPackId,
        recipient: to,
        cc,
        bcc,
        subject,
        message,
        sent_by: user.id,
        status: 'failed',
        error_message: 'Could not generate a secure download link for the approval pack.',
      })
      return jsonResponse({ error: 'Could not generate secure download link' }, 500)
    }

    const expiryHours = Math.round(LINK_EXPIRY_SECONDS / 3600)
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.55">
        <p>${(message || '').replace(/\n/g, '<br/>')}</p>
        <p style="margin:20px 0">
          <a href="${signedUrlData.signedUrl}"
             style="background:#1a3f78;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">
            Download Approval Pack
          </a>
        </p>
        <p style="color:#64748b;font-size:12px">
          This secure link expires in ${expiryHours} hours and provides access to confidential
          KYC and financial documents. Do not forward this email to unauthorized recipients.
        </p>
      </div>`

    let status: 'sent' | 'failed' = 'sent'
    let messageId: string | null = null
    let errorMessage: string | null = null

    if (!RESEND_API_KEY) {
      status = 'failed'
      errorMessage = 'Email provider is not configured (missing RESEND_API_KEY secret).'
    } else {
      try {
        const resendResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: EMAIL_FROM_ADDRESS,
            to: to.split(',').map((e) => e.trim()),
            cc: cc ? cc.split(',').map((e) => e.trim()) : undefined,
            bcc: bcc ? bcc.split(',').map((e) => e.trim()) : undefined,
            subject,
            html: htmlBody,
          }),
        })
        const resendJson = await resendResp.json()
        if (!resendResp.ok) {
          status = 'failed'
          errorMessage = resendJson?.message ?? 'Email provider rejected the request.'
        } else {
          messageId = resendJson?.id ?? null
        }
      } catch (err) {
        status = 'failed'
        errorMessage = err instanceof Error ? err.message : 'Unknown email delivery error'
      }
    }

    const { data: logRow } = await admin
      .from('email_logs')
      .insert({
        application_id: applicationId,
        approval_pack_id: approvalPackId,
        recipient: to,
        cc,
        bcc,
        subject,
        message,
        sent_by: user.id,
        status,
        message_id: messageId,
        error_message: errorMessage,
      })
      .select()
      .single()

    await admin.from('audit_logs').insert({
      user_id: user.id,
      application_id: applicationId,
      action: status === 'sent' ? 'EMAIL_SENT' : 'EMAIL_FAILED',
      entity_type: 'email_logs',
      entity_id: logRow?.id,
      new_value: { recipient: to, subject, status },
    })

    if (status === 'failed') {
      return jsonResponse({ error: errorMessage, emailLog: logRow }, 502)
    }
    return jsonResponse({ success: true, emailLog: logRow })
  } catch (err) {
    console.error('send-approval-pack-email error', err)
    return jsonResponse({ error: 'Internal error sending email' }, 500)
  }
})
