import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type {
  ApprovalPack,
  Branch,
  DocumentCategory,
  DocumentMaster,
  DocumentRequirement,
  DocumentRow,
  EmailLog,
  LoanApplication,
  LoanCategory,
} from '@/types/database'

export function useDocumentMasterCatalog(searchTerm: string) {
  return useQuery({
    queryKey: ['document_master', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('document_master')
        .select('*')
        .eq('active', true)
        .order('category_group')
        .order('name')
        .limit(500)
      if (searchTerm.trim()) {
        const like = `%${searchTerm.trim()}%`
        query = query.or(`name.ilike.${like},code.ilike.${like}`)
      }
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as DocumentMaster[]
    },
  })
}

export function useDocumentCategories() {
  return useQuery({
    queryKey: ['document_categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('document_categories').select('*').order('sequence')
      if (error) throw error
      return (data ?? []) as DocumentCategory[]
    },
  })
}

export function useLoanCategories() {
  return useQuery({
    queryKey: ['loan_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loan_categories')
        .select('*')
        .order('sequence')
      if (error) throw error
      return (data ?? []) as LoanCategory[]
    },
  })
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase.from('branches').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Branch[]
    },
  })
}

/**
 * Template requirements for a loan category (application_id is null), plus
 * — when applicationId is given — any ad-hoc requirements added to that one
 * application via the Add Document picker. Omit applicationId for checklist
 * previews (New Application form) or admin template management (Settings).
 */
export function useChecklist(loanCategoryId: string | undefined, applicationId?: string) {
  return useQuery({
    queryKey: ['document_requirements', loanCategoryId, applicationId],
    enabled: !!loanCategoryId,
    queryFn: async () => {
      let query = supabase
        .from('document_requirements')
        .select('*, document_categories(*)')
        .eq('active', true)

      query = applicationId
        ? query.or(`application_id.is.null,application_id.eq.${applicationId}`).eq('loan_category_id', loanCategoryId as string)
        : query.is('application_id', null).eq('loan_category_id', loanCategoryId as string)

      const { data, error } = await query.order('sequence')
      if (error) throw error
      return (data ?? []) as DocumentRequirement[]
    },
  })
}

export function useApplication(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['loan_application', applicationId],
    enabled: !!applicationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loan_applications')
        .select('*, loan_categories(*), branches(*)')
        .eq('id', applicationId as string)
        .single()
      if (error) throw error
      return data as LoanApplication
    },
  })
}

export function useApplicationDocuments(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['documents', applicationId],
    enabled: !!applicationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('application_id', applicationId as string)
        .is('deleted_at', null)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as DocumentRow[]
    },
  })
}

export function useApprovalPacks(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['approval_packs', applicationId],
    enabled: !!applicationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_packs')
        .select('*')
        .eq('application_id', applicationId as string)
        .order('generated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ApprovalPack[]
    },
  })
}

export function useEmailLogs(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['email_logs', applicationId],
    enabled: !!applicationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_logs')
        .select('*')
        .eq('application_id', applicationId as string)
        .order('sent_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as EmailLog[]
    },
  })
}

export function useProfilesMap() {
  return useQuery({
    queryKey: ['profiles_map'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, name, role')
      if (error) throw error
      const map = new Map<string, { name: string; role: string }>()
      for (const p of data ?? []) map.set(p.id, { name: p.name, role: p.role })
      return map
    },
    staleTime: 5 * 60_000,
  })
}
