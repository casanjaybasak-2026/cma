import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/contexts/ToastContext'
import { useChecklist, useDocumentCategories, useLoanCategories } from '@/hooks/queries'

export function DocumentRequirementsSettings() {
  const { data: categories } = useLoanCategories()
  const { data: docCategories } = useDocumentCategories()
  const { notify } = useToast()
  const queryClient = useQueryClient()

  const [loanCategoryId, setLoanCategoryId] = useState('')
  const { data: requirements, refetch } = useChecklist(loanCategoryId || undefined)

  const [form, setForm] = useState({
    document_category_id: '',
    document_name: '',
    code: '',
    required: true,
    sequence: 1,
    keywords: '',
  })
  const [creating, setCreating] = useState(false)

  function invalidate() {
    refetch()
    queryClient.invalidateQueries({ queryKey: ['document_requirements'] })
  }

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from('document_requirements').update({ active: !active }).eq('id', id)
    if (error) notify(error.message, 'error')
    else invalidate()
  }

  async function toggleRequired(id: string, required: boolean) {
    const { error } = await supabase.from('document_requirements').update({ required: !required }).eq('id', id)
    if (error) notify(error.message, 'error')
    else invalidate()
  }

  async function updateSequence(id: string, sequence: number) {
    const { error } = await supabase.from('document_requirements').update({ sequence }).eq('id', id)
    if (error) notify(error.message, 'error')
    else invalidate()
  }

  async function createRequirement() {
    if (!loanCategoryId || !form.document_category_id || !form.document_name.trim() || !form.code.trim()) {
      notify('Loan category, document category, name and code are required.', 'error')
      return
    }
    setCreating(true)
    try {
      const { error } = await supabase.from('document_requirements').insert({
        loan_category_id: loanCategoryId,
        document_category_id: form.document_category_id,
        document_name: form.document_name.trim(),
        code: form.code.trim().toUpperCase().replace(/\s+/g, '_'),
        required: form.required,
        sequence: form.sequence,
        classification_keywords: form.keywords
          .split(',')
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean),
      })
      if (error) throw error
      notify('Checklist item added.', 'success')
      setForm({ document_category_id: '', document_name: '', code: '', required: true, sequence: 1, keywords: '' })
      invalidate()
    } catch (err: any) {
      notify(err.message ?? 'Unable to add checklist item.', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <label className="label">Loan Category</label>
        <select className="input max-w-sm" value={loanCategoryId} onChange={(e) => setLoanCategoryId(e.target.value)}>
          <option value="">Select a loan category to manage its checklist…</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loanCategoryId && (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Required</th>
                  <th className="px-4 py-3">Sequence</th>
                  <th className="px-4 py-3">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requirements?.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-xs text-slate-500">{r.document_categories?.name}</td>
                    <td className="px-4 py-2 font-medium text-slate-700">{r.document_name}</td>
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={r.required} onChange={() => toggleRequired(r.id, r.required)} />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        defaultValue={r.sequence}
                        className="input w-20 py-1"
                        onBlur={(e) => updateSequence(r.id, Number(e.target.value))}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => toggleActive(r.id, r.active)}
                        className={`badge ${r.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                      >
                        {r.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Add Checklist Item</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <select
                className="input"
                value={form.document_category_id}
                onChange={(e) => setForm((f) => ({ ...f, document_category_id: e.target.value }))}
              >
                <option value="">Document category…</option>
                {docCategories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Document name"
                value={form.document_name}
                onChange={(e) => setForm((f) => ({ ...f, document_name: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Code (e.g. LS_GL_JEWEL_APPRAISAL)"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Sequence"
                type="number"
                value={form.sequence}
                onChange={(e) => setForm((f) => ({ ...f, sequence: Number(e.target.value) }))}
              />
              <input
                className="input sm:col-span-2"
                placeholder="Classification keywords, comma separated (helps OCR matching)"
                value={form.keywords}
                onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.required}
                  onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))}
                />
                Mandatory document
              </label>
            </div>
            <button className="btn-primary btn-sm mt-3" onClick={createRequirement} disabled={creating}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add Checklist Item
            </button>
          </div>
        </>
      )}
    </div>
  )
}
