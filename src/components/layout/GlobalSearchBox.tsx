import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'

export function GlobalSearchBox() {
  const [value, setValue] = useState('')
  const navigate = useNavigate()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    navigate(`/applications?q=${encodeURIComponent(value.trim())}`)
  }

  return (
    <form onSubmit={onSubmit} className="relative max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search by Application ID, Customer, Mobile…"
        aria-label="Search applications"
        className="input pl-9"
      />
    </form>
  )
}
