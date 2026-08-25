import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/contexts/ToastContext'
import { useBranches } from '@/hooks/queries'

export function BranchesSettings() {
  const { data: branches, refetch } = useBranches()
  const { notify } = useToast()
  const [form, setForm] = useState({ name: '', code: '', address: '' })
  const [creating, setCreating] = useState(false)

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from('branches').update({ active: !active }).eq('id', id)
    if (error) notify(error.message, 'error')
    else refetch()
  }

  async function createBranch() {
    if (!form.name.trim() || !form.code.trim()) {
      notify('Branch name and code are required.', 'error')
      return
    }
    setCreating(true)
    try {
      const { error } = await supabase.from('branches').insert({
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        address: form.address.trim() || null,
      })
      if (error) throw error
      notify('Branch added.', 'success')
      setForm({ name: '', code: '', address: '' })
      refetch()
    } catch (err: any) {
      notify(err.message ?? 'Unable to add branch.', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {branches?.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2.5 font-mono text-xs">{b.code}</td>
                <td className="px-4 py-2.5 font-medium text-slate-700">{b.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{b.address}</td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => toggleActive(b.id, b.active)}
                    className={`badge ${b.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {b.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Add Branch</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input className="input" placeholder="Branch Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className="input" placeholder="Branch Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          <input className="input" placeholder="Address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </div>
        <button className="btn-primary btn-sm mt-3" onClick={createBranch} disabled={creating}>
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add Branch
        </button>
      </div>
    </div>
  )
}
