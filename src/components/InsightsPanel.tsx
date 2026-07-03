import { memo, useMemo } from 'react'
import { AlertTriangle, TrendingUp, Building2, PauseCircle, ChevronRight, Sparkles } from 'lucide-react'
import type { EnrichedDistrict } from '../types'
import { computeInsights, type InsightCategory } from '../lib/insights'

interface InsightsPanelProps {
  districts: EnrichedDistrict[]
  scopeLabel: string
  onPick: (state: string, districtId: string) => void
}

const ICONS: Record<InsightCategory, typeof AlertTriangle> = {
  backlog: AlertTriangle,
  fastest: TrendingUp,
  giants: Building2,
  stalled: PauseCircle,
}
const TONE: Record<InsightCategory, string> = {
  backlog: 'text-rose-400',
  fastest: 'text-emerald-400',
  giants: 'text-amber-400',
  stalled: 'text-zinc-400',
}

export const InsightsPanel = memo(function InsightsPanel({
  districts,
  scopeLabel,
  onPick,
}: InsightsPanelProps) {
  const groups = useMemo(() => computeInsights(districts), [districts])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800/60 px-3 py-2.5">
        <Sparkles className="h-4 w-4 text-indigo-400" />
        <div>
          <h2 className="text-xs font-bold tracking-tight text-zinc-100">Key Findings</h2>
          <p className="text-[10px] text-zinc-500">{scopeLabel}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {groups.map((g) => {
          const Icon = ICONS[g.category]
          return (
            <div key={g.category}>
              <div className="mb-1 flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${TONE[g.category]}`} />
                <span className="text-[11px] font-semibold text-zinc-200">{g.title}</span>
              </div>
              <p className="mb-1.5 text-[10px] leading-tight text-zinc-600">{g.hint}</p>
              <div className="space-y-1">
                {g.items.map((it) => (
                  <button
                    key={it.districtId}
                    onClick={() => onPick(it.state, it.districtId)}
                    className="group flex w-full items-center justify-between gap-2 rounded-md border border-zinc-800/50 bg-zinc-900/40 px-2 py-1.5 text-left transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/[0.07]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium text-zinc-200">{it.district}</div>
                      <div className="truncate text-[9px] text-zinc-500">{it.state}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="nums text-[10px] font-semibold text-zinc-400">{it.value}</span>
                      <ChevronRight className="h-3 w-3 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        {groups.length === 0 && (
          <div className="py-8 text-center text-xs text-zinc-600">No findings in scope.</div>
        )}
      </div>
    </div>
  )
})
