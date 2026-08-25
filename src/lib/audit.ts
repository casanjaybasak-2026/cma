import { supabase } from './supabaseClient'

interface AuditParams {
  userId: string
  applicationId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  oldValue?: unknown
  newValue?: unknown
}

/**
 * Best-effort audit trail write. Never blocks or throws into the caller's
 * flow — a failed audit insert should not stop a document upload or
 * verification from completing, but is logged to the console for
 * operational visibility.
 */
export async function writeAuditLog(params: AuditParams): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    user_id: params.userId,
    application_id: params.applicationId ?? null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
  })
  if (error) {
    // eslint-disable-next-line no-console
    console.error('Audit log write failed', error)
  }
}
