export type UserRole = 'admin' | 'branch_manager' | 'credit_officer' | 'maker' | 'checker'

export type ApplicationStatus =
  | 'draft'
  | 'in_progress'
  | 'pending_verification'
  | 'ready_for_approval'
  | 'approved'
  | 'rejected'
  | 'on_hold'

export type DocumentStatus =
  | 'pending'
  | 'uploaded'
  | 'processing'
  | 'submitted_for_verification'
  | 'verified'
  | 'rejected'
  | 'replace_required'
  | 'optional'
  | 'waived'

export type ApprovalPackStatus = 'final' | 'with_exceptions'
export type EmailStatus = 'pending' | 'sent' | 'failed'

export interface Branch {
  id: string
  name: string
  code: string
  address: string | null
  active: boolean
  created_at: string
}

export interface Profile {
  id: string
  name: string
  email: string
  role: UserRole
  branch_id: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface LoanCategory {
  id: string
  code: string
  name: string
  description: string | null
  sequence: number
  active: boolean
}

export interface DocumentCategory {
  id: string
  code: string
  name: string
  folder_prefix: string
  sequence: number
  active: boolean
}

export interface DocumentRequirement {
  id: string
  loan_category_id: string
  document_category_id: string
  document_name: string
  code: string
  required: boolean
  sequence: number
  active: boolean
  classification_keywords: string[]
  document_categories?: DocumentCategory
}

export interface LoanApplication {
  id: string
  application_no: string
  customer_id: string
  customer_name: string
  father_spouse_name: string | null
  mobile_number: string
  email: string | null
  address: string | null
  branch_id: string | null
  branch_code: string | null
  loan_category_id: string
  loan_amount: number
  application_date: string
  relationship_manager: string | null
  credit_officer: string | null
  sanction_status: string
  remarks: string | null
  status: ApplicationStatus
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  loan_categories?: LoanCategory
  branches?: Branch
}

export interface QualityFlag {
  type:
    | 'blank_page'
    | 'low_resolution'
    | 'unreadable'
    | 'password_protected'
    | 'corrupt_file'
    | 'duplicate'
    | 'wrong_document_type'
  message: string
  overridden?: boolean
  overridden_by?: string
}

export interface DocumentRow {
  id: string
  application_id: string
  requirement_id: string | null
  file_name: string
  storage_path: string
  file_type: string
  file_size: number
  page_count: number
  ocr_text: string | null
  document_type: string | null
  classification_confidence: number | null
  status: DocumentStatus
  quality_flags: QualityFlag[]
  version: number
  replaced_document_id: string | null
  uploaded_by: string | null
  uploaded_at: string
  submitted_for_verification_by: string | null
  submitted_for_verification_at: string | null
  verified_by: string | null
  verified_at: string | null
  remarks: string | null
  deleted_at: string | null
}

export interface ApprovalPack {
  id: string
  application_id: string
  zip_file_path: string
  document_count: number
  total_size_bytes: number
  status: ApprovalPackStatus
  exceptions: { requirement_id: string; document_name: string }[]
  exception_remarks: string | null
  missing_documents: { requirement_id: string; document_name: string }[]
  generated_by: string | null
  generated_at: string
}

export interface EmailLog {
  id: string
  application_id: string
  approval_pack_id: string | null
  recipient: string
  cc: string | null
  bcc: string | null
  subject: string
  message: string | null
  sent_by: string | null
  sent_at: string
  status: EmailStatus
  message_id: string | null
  error_message: string | null
}

export interface AuditLog {
  id: string
  user_id: string | null
  application_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  old_value: unknown
  new_value: unknown
  timestamp: string
}
