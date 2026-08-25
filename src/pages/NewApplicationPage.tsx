import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useBranches, useChecklist, useLoanCategories } from '@/hooks/queries'
import { writeAuditLog } from '@/lib/audit'

const schema = z.object({
  customer_id: z.string().min(1, 'Customer ID is required'),
  customer_name: z.string().min(1, 'Customer name is required'),
  father_spouse_name: z.string().optional(),
  mobile_number: z
    .string()
    .min(10, 'Enter a valid mobile number')
    .regex(/^[0-9+\-\s]+$/, 'Enter a valid mobile number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  address: z.string().optional(),
  branch_id: z.string().uuid('Select a branch'),
  loan_category_id: z.string().uuid('Select a loan category'),
  loan_amount: z.coerce.number().positive('Enter a valid loan amount'),
  application_date: z.string().min(1),
  relationship_manager: z.string().optional(),
  credit_officer: z.string().optional(),
  sanction_status: z.string().min(1),
  remarks: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export default function NewApplicationPage() {
  const { profile } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()
  const { data: categories, isLoading: loadingCategories } = useLoanCategories()
  const { data: branches, isLoading: loadingBranches } = useBranches()
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      application_date: new Date().toISOString().slice(0, 10),
      sanction_status: 'Pending',
    },
  })

  const selectedCategoryId = watch('loan_category_id')
  const { data: checklist } = useChecklist(selectedCategoryId)

  const checklistSummary = useMemo(() => {
    if (!checklist) return []
    const byCategory = new Map<string, { name: string; count: number; required: number }>()
    for (const item of checklist) {
      const key = item.document_categories?.name ?? 'Other'
      const entry = byCategory.get(key) ?? { name: key, count: 0, required: 0 }
      entry.count += 1
      if (item.required) entry.required += 1
      byCategory.set(key, entry)
    }
    return Array.from(byCategory.values())
  }, [checklist])

  async function onSubmit(values: FormValues) {
    if (!profile) return
    setSubmitting(true)
    try {
      const category = categories?.find((c) => c.id === values.loan_category_id)
      const { data: appNo, error: rpcError } = await supabase.rpc('next_application_no', {
        p_prefix: category?.code?.slice(0, 4) ?? 'APP',
      })
      if (rpcError) throw rpcError

      const branch = branches?.find((b) => b.id === values.branch_id)

      const { data: inserted, error } = await supabase
        .from('loan_applications')
        .insert({
          application_no: appNo,
          customer_id: values.customer_id,
          customer_name: values.customer_name,
          father_spouse_name: values.father_spouse_name || null,
          mobile_number: values.mobile_number,
          email: values.email || null,
          address: values.address || null,
          branch_id: values.branch_id,
          branch_code: branch?.code ?? null,
          loan_category_id: values.loan_category_id,
          loan_amount: values.loan_amount,
          application_date: values.application_date,
          relationship_manager: values.relationship_manager || null,
          credit_officer: values.credit_officer || null,
          sanction_status: values.sanction_status,
          remarks: values.remarks || null,
          status: 'in_progress',
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select()
        .single()

      if (error) throw error

      await writeAuditLog({
        userId: profile.id,
        applicationId: inserted.id,
        action: 'APPLICATION_CREATED',
        entityType: 'loan_applications',
        entityId: inserted.id,
        newValue: { application_no: inserted.application_no, customer_name: inserted.customer_name },
      })

      notify(`Application ${inserted.application_no} created.`, 'success')
      navigate(`/applications/${inserted.id}/scanner`)
    } catch (err: any) {
      notify(err.message ?? 'Unable to create application. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">New Loan Application</h1>
        <p className="text-sm text-slate-500">
          Enter the application details. The document checklist loads automatically once you choose a
          loan category.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-6 p-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Customer Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Customer ID" error={errors.customer_id?.message}>
              <input className="input" {...register('customer_id')} />
            </Field>
            <Field label="Customer Name" error={errors.customer_name?.message}>
              <input className="input" {...register('customer_name')} />
            </Field>
            <Field label="Father's / Spouse's Name">
              <input className="input" {...register('father_spouse_name')} />
            </Field>
            <Field label="Mobile Number" error={errors.mobile_number?.message}>
              <input className="input" {...register('mobile_number')} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <input type="email" className="input" {...register('email')} />
            </Field>
            <Field label="Address">
              <input className="input" {...register('address')} />
            </Field>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Loan &amp; Branch Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Branch" error={errors.branch_id?.message}>
              <select className="input" disabled={loadingBranches} {...register('branch_id')}>
                <option value="">Select branch</option>
                {branches?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Loan Category" error={errors.loan_category_id?.message}>
              <select className="input" disabled={loadingCategories} {...register('loan_category_id')}>
                <option value="">Select loan category</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Loan Amount (₹)" error={errors.loan_amount?.message}>
              <input type="number" step="0.01" className="input" {...register('loan_amount')} />
            </Field>
            <Field label="Application Date" error={errors.application_date?.message}>
              <input type="date" className="input" {...register('application_date')} />
            </Field>
            <Field label="Relationship Manager">
              <input className="input" {...register('relationship_manager')} />
            </Field>
            <Field label="Credit Officer">
              <input className="input" {...register('credit_officer')} />
            </Field>
            <Field label="Sanction Status">
              <select className="input" {...register('sanction_status')}>
                <option>Pending</option>
                <option>Under Review</option>
                <option>Sanctioned</option>
                <option>Declined</option>
              </select>
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Remarks">
              <textarea className="input" rows={3} {...register('remarks')} />
            </Field>
          </div>
        </section>

        {checklistSummary.length > 0 && (
          <section className="rounded-lg border border-bank-100 bg-bank-50 p-4">
            <h2 className="mb-2 text-sm font-semibold text-bank-800">
              Document Checklist Preview ({checklist?.length ?? 0} items)
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {checklistSummary.map((c) => (
                <div key={c.name} className="rounded-md bg-white px-3 py-2 text-xs shadow-sm">
                  <p className="font-semibold text-slate-700">{c.name}</p>
                  <p className="text-slate-500">
                    {c.count} document(s) · {c.required} mandatory
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Application &amp; Start Scanning
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
