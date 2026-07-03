import { memo, useMemo, useState } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import type { EnrichedDistrict } from '../types'
import { aggregateByState, type StateAggregate } from '../lib/aggregate'
import { formatCompact, formatPct } from '../lib/format'

interface StateRankingTableProps {
  districts: EnrichedDistrict[]
  activeState: string | null
  onSelectState: (state: string) => void
}

type SortKey = 'coverageNow' | 'backlog' | 'gapClosed' | 'laggingCount' | 'districtCount'

interface Col {
  key: SortKey
  label: string
  get: (a: StateAggregate) => number
  fmt: (a: StateAggregate) => string
  tone?: (a: StateAggregate) => string
}

const COLS: Col[] = [
  {
    key: 'coverageNow',
    label: 'Coverage',
    get: (a) => a.coverageNow,
    fmt: (a) => formatPct(a.coverageNow),
    tone: (a) => (a.coverageNow >= 0.9 ? 'text-emerald-400' : a.coverageNow >= 0.7 ? 'text-amber-400' : 'text-rose-400'),
  },
  {
    key: 'backlog',
    label: 'Backlog',
    get: (a) => a.totalHouseholds - a.connectionsCurrent,
    fmt: (a) => formatCompact(a.totalHouseholds - a.connectionsCurrent),
    tone: () => 'text-rose-300',
  },
  {
    key: 'gapClosed',
    label: 'Since ’19',
    get: (a) => a.gapClosed,
    fmt: (a) => `+${formatCompact(a.gapClosed)}`,
    tone: () => 'text-emerald-300',
  },
  { key: 'laggingCount', label: '<90%', get: (a) => a.laggingCount, fmt: (a) => `${a.laggingCount}/${a.districtCount}` },
]

export const StateRankingTable = memo(function StateRankingTable({
  districts,
  activeState,
  onSelectState,
}: StateRankingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('backlog')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const aggregates = useMemo(() => aggregateByState(districts), [districts])

  const sorted = useMemo(() => {
    const col = COLS.find((c) => c.key === sortKey) ?? COLS[1]
    const m = dir === 'asc' ? 1 : -1
    return [...aggregates].sort((a, b) => (col.get(a) - col.get(b)) * m)
  }, [aggregates, sortKey, dir])

  const toggle = (key: SortKey) => {
    if (key === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setDir('desc')
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-950">
      <div className="border-b border-zinc-800/60 px-3 py-2.5">
        <h2 className="text-xs font-bold tracking-tight text-zinc-100">State Ranking</h2>
        <p className="text-[10px] text-zinc-500">{aggregates.length} states · click a row to drill in</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur">
            <tr className="border-b border-zinc-800/60">
              <th className="py-2 pl-3 pr-1 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-500">#</th>
              <th className="py-2 pr-2 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-500">State</th>
              {COLS.map((c) => {
                const active = sortKey === c.key
                return (
                  <th
                    key={c.key}
                    onClick={() => toggle(c.key)}
                    className={`cursor-pointer select-none py-2 pr-3 text-right text-[9px] font-semibold uppercase tracking-widest ${active ? 'text-indigo-300' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {c.label}
                      {active && (dir === 'desc' ? <ArrowDown className="h-2.5 w-2.5" /> : <ArrowUp className="h-2.5 w-2.5" />)}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((a, i) => {
              const selected = a.state === activeState
              return (
                <tr
                  key={a.state}
                  onClick={() => onSelectState(a.state)}
                  className={`cursor-pointer border-b border-zinc-800/40 transition-colors ${selected ? 'bg-indigo-500/[0.10]' : 'hover:bg-zinc-900/50'}`}
                >
                  <td className="nums py-1.5 pl-3 pr-1 text-left text-[10px] text-zinc-600">{i + 1}</td>
                  <td className="py-1.5 pr-2 text-[11px] font-medium text-zinc-200">{a.state}</td>
                  {COLS.map((c) => (
                    <td key={c.key} className={`nums py-1.5 pr-3 text-right text-[11px] ${c.tone ? c.tone(a) : 'text-zinc-300'}`}>
                      {c.fmt(a)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
})
