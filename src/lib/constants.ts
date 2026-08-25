import type { DocumentStatus, UserRole } from '@/types/database'

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  branch_manager: 'Branch Manager',
  credit_officer: 'Credit Officer',
  maker: 'Maker',
  checker: 'Checker',
}

export const DOCUMENT_STATUS_META: Record<
  DocumentStatus,
  { label: string; dot: string; badge: string }
> = {
  pending: { label: 'Missing', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700' },
  uploaded: { label: 'Uploaded', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700' },
  processing: { label: 'Processing', dot: 'bg-sky-400', badge: 'bg-sky-50 text-sky-700' },
  submitted_for_verification: {
    label: 'Submitted for Verification',
    dot: 'bg-indigo-400',
    badge: 'bg-indigo-50 text-indigo-700',
  },
  verified: { label: 'Verified', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejected', dot: 'bg-red-600', badge: 'bg-red-50 text-red-700' },
  replace_required: {
    label: 'Replace Required',
    dot: 'bg-orange-500',
    badge: 'bg-orange-50 text-orange-700',
  },
  optional: { label: 'Optional', dot: 'bg-slate-300', badge: 'bg-slate-100 text-slate-600' },
  waived: { label: 'Waived', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600' },
}

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  pending_verification: 'Pending Verification',
  ready_for_approval: 'Ready for Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  on_hold: 'On Hold',
}

export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export const MAX_FILE_SIZE_BYTES = Number(import.meta.env.VITE_MAX_UPLOAD_MB ?? 25) * 1024 * 1024

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', roles: null },
  { to: '/applications', label: 'Applications', roles: null },
  { to: '/applications/new', label: 'New Application', roles: ['admin', 'branch_manager', 'maker'] },
  { to: '/pending-verification', label: 'Pending Verification', roles: null },
  { to: '/approval-packs', label: 'Approval Packs', roles: null },
  { to: '/email-history', label: 'Email History', roles: null },
  { to: '/reports', label: 'Reports', roles: null },
  { to: '/settings', label: 'Settings', roles: ['admin'] },
] as const
