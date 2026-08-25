import clsx from 'clsx'

export function ProgressBar({
  percent,
  className,
  colorClass,
}: {
  percent: number
  className?: string
  colorClass?: string
}) {
  const clamped = Math.max(0, Math.min(100, percent))
  const color =
    colorClass ?? (clamped >= 100 ? 'bg-emerald-500' : clamped >= 60 ? 'bg-bank-600' : 'bg-amber-500')
  return (
    <div className={clsx('h-2.5 w-full overflow-hidden rounded-full bg-slate-200', className)}>
      <div
        className={clsx('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${clamped}%` }}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  )
}
