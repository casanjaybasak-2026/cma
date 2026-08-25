import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/contexts/ToastContext'
import { useLoanCategories } from '@/hooks/queries'

export function LoanCategoriesSettings() {
  const { data: categories, refetch } = useLoanCategories()
  const { notify } = useToast()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', description: '' })

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from('loan_categories').update({ active: !active }).eq('id', id)
    if (error) notify(error.message, 'error')
    else {
      refetch()
      queryClient.invalidateQueries({ queryKey: ['loan_categories'] })
    }
  }

  async function createCategory() {
    if (!form.code.trim() || !form.name.trim()) {
      notify('Code and name are required.', 'error')
      return
    }
    setCreating(true)
    try {
      const maxSeq = Math.max(0, ...(categories ?? []).map((c) => c.sequence))
      const { error } = await supabase.from('loan_categories').insert({
        code: form.code.trim().toUpperCase().replace(/\s+/g, '_'),
        name: form.name.trim(),
        description: form.description.trim() || null,
        sequence: maxSeq + 1,
      })
      if (error) throw error
      notify('Loan category created. Add its document checklist next.', 'success')
      setForm({ code: '', name: '', description: '' })
      refetch()
      queryClient.invalidateQueries({ queryKey: ['loan_categories'] })
    } catch (err: any) {
      notify(err.message ?? 'Unable to create loan category.', 'error')
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
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories?.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2.5 font-mono text-xs">{c.code}</td>
                <td className="px-4 py-2.5 font-medium text-slate-700">{c.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.description}</td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => toggleActive(c.id, c.active)}
                    className={`badge ${c.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {c.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Add New Loan Category</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            className="input"
            placeholder="Code (e.g. GOLD_LOAN)"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Name (e.g. Gold Loan)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <button className="btn-primary btn-sm mt-3" onClick={createCategory} disabled={creating}>
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add Loan Category
        </button>
      </div>
    </div>
  )
}
