import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Search, MapPin, Building2, X } from 'lucide-react'
import type { EnrichedDistrict } from '../types'
import { normalizeName } from '../lib/geoJoin'
import { aggregateByState } from '../lib/aggregate'
import { formatPct } from '../lib/format'

interface SearchTypeaheadProps {
  districts: EnrichedDistrict[]
  onPickDistrict: (state: string, id: string) => void
  onPickState: (state: string) => void
}

type Result =
  | { kind: 'district'; id: string; label: string; sub: string; state: string; coverage: number }
  | { kind: 'state'; id: string; label: string; sub: string; state: string; coverage: number }

const MAX_RESULTS = 8

export const SearchTypeahead = memo(function SearchTypeahead({
  districts,
  onPickDistrict,
  onPickState,
}: SearchTypeaheadProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Pre-normalised search index (built once per data set).
  const index = useMemo(() => {
    const states = aggregateByState(districts).map((a) => ({
      kind: 'state' as const,
      id: a.state,
      label: a.state,
      sub: `${a.districtCount} districts`,
      state: a.state,
      coverage: a.coverageNow,
      norm: normalizeName(a.state),
    }))
    const dists = districts.map((d) => ({
      kind: 'district' as const,
      id: d.id,
      label: d.district,
      sub: d.state,
      state: d.state,
      coverage: d.coverageCurrent,
      norm: normalizeName(d.district),
      normState: normalizeName(d.state),
    }))
    return { states, dists }
  }, [districts])

  const results = useMemo<Result[]>(() => {
    const q = normalizeName(query)
    if (!q) return []
    const score = (norm: string, extra?: string) => {
      if (norm.startsWith(q)) return 0
      if (norm.includes(q)) return 1
      if (extra && extra.includes(q)) return 2
      return -1
    }
    const scored: Array<{ r: Result; s: number }> = []
    for (const s of index.states) {
      const sc = score(s.norm)
      if (sc >= 0) scored.push({ r: s, s: sc })
    }
    for (const d of index.dists) {
      const sc = score(d.norm, d.normState)
      if (sc >= 0) scored.push({ r: d, s: sc })
    }
    return scored
      .sort((a, b) => a.s - b.s || a.r.label.length - b.r.label.length)
      .slice(0, MAX_RESULTS)
      .map((x) => x.r)
  }, [query, index])

  // Reset highlight when the result set changes.
  useEffect(() => setActive(0), [results])

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const choose = (r: Result) => {
    if (r.kind === 'district') onPickDistrict(r.state, r.id)
    else onPickState(r.state)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) {
      if (e.key === 'ArrowDown') setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative w-64">
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-2.5 py-1.5 focus-within:border-indigo-500/50">
        <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="search-listbox"
          aria-autocomplete="list"
          placeholder="Search district or state…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />
        {query && (
          <button aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus() }} className="shrink-0 text-zinc-600 hover:text-zinc-300">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          id="search-listbox"
          role="listbox"
          className="animate-fade-slide absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-zinc-700/70 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur-xl"
        >
          {results.map((r, i) => {
            const Icon = r.kind === 'state' ? Building2 : MapPin
            return (
              <li
                key={`${r.kind}:${r.id}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(r) }}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 ${i === active ? 'bg-indigo-500/15' : ''}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${r.kind === 'state' ? 'text-amber-400' : 'text-indigo-400'}`} />
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium text-zinc-100">{r.label}</div>
                    <div className="truncate text-[9px] text-zinc-500">{r.sub}</div>
                  </div>
                </div>
                <span className={`nums shrink-0 text-[10px] font-semibold ${r.coverage >= 0.9 ? 'text-emerald-400' : r.coverage >= 0.7 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {formatPct(r.coverage, 0)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
})
