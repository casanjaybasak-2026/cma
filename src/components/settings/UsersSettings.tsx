import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/contexts/ToastContext'
import { useBranches } from '@/hooks/queries'
import { ROLE_LABELS } from '@/lib/constants'
import type { Profile, UserRole } from '@/types/database'

const ROLES: UserRole[] = ['admin', 'branch_manager', 'credit_officer', 'maker', 'checker']

export function UsersSettings() {
  const { notify } = useToast()
  const queryClient = useQueryClient()
  const { data: branches } = useBranches()
  const { data: users, refetch } = useQuery({
    queryKey: ['all_profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('name')
      if (error) throw error
      return data as Profile[]
    },
  })

  async function updateUser(id: string, patch: Partial<Profile>) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) notify(error.message, 'error')
    else {
      refetch()
      queryClient.invalidateQueries({ queryKey: ['profiles_map'] })
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-bank-50 px-3 py-2 text-xs text-bank-800">
        New users are provisioned via Supabase Auth (invite email) by an administrator outside this screen, for
        security. Once a user signs in for the first time, manage their role, branch and active status here.
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users?.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2.5 font-medium text-slate-700">{u.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{u.email}</td>
                <td className="px-4 py-2.5">
                  <select
                    className="input py-1 text-xs"
                    value={u.role}
                    onChange={(e) => updateUser(u.id, { role: e.target.value as UserRole })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <select
                    className="input py-1 text-xs"
                    value={u.branch_id ?? ''}
                    onChange={(e) => updateUser(u.id, { branch_id: e.target.value || null })}
                  >
                    <option value="">No branch</option>
                    {branches?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => updateUser(u.id, { active: !u.active })}
                    className={`badge ${u.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {u.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
