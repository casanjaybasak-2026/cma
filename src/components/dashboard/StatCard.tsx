import type { LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'

export function StatCard({
  label,
  value,
  icon: Icon,
  to,
  tone = 'default',
}: {
  label: string
  value: number | string
  icon: LucideIcon
  to?: string
  tone?: 'default' | 'warning' | 'success' | 'info'
}) {
  const toneClasses: Record<string, string> = {
    default: 'bg-bank-50 text-bank-700',
    warning: 'bg-amber-50 text-amber-700',
    success: 'bg-emerald-50 text-emerald-700',
    info: 'bg-sky-50 text-sky-700',
  }

  const content = (
    <div className="card flex items-center gap-4 p-4 transition-shadow hover:shadow-md">
      <div className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', toneClasses[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  )

  if (to) return <Link to={to}>{content}</Link>
  return content
}
