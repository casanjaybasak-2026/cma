import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <p className="text-2xl font-bold text-slate-800">404</p>
      <p className="text-sm text-slate-500">This page does not exist.</p>
      <Link to="/" className="btn-primary mt-3">
        Back to Dashboard
      </Link>
    </div>
  )
}
