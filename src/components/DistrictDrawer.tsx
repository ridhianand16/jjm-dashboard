import { memo, useEffect, useMemo } from 'react'
import { X, MapPin, TrendingUp, Users, Target, ArrowUpRight, ArrowDownRight, Minus, ChevronRight } from 'lucide-react'
import type { EnrichedDistrict } from '../types'
import { computeDistrictStats } from '../lib/districtStats'
import { buildSnapshots, SNAPSHOT_YEARS, PRESENT_YEAR } from '../lib/timeseries'
import { regionOf, REGION_COLORS } from '../lib/regions'
import { formatIndian, formatCompact, formatPct } from '../lib/format'

interface DistrictDrawerProps {
  district: EnrichedDistrict | null
  all: EnrichedDistrict[]
  onClose: () => void
  onSelectPeer: (state: string, id: string) => void
  onViewState: (state: string) => void
}

const TARGET = 0.9

/** Ordinal label like "2nd of 33". */
function ordinal(rank: number, pool: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = rank % 100
  const suffix = s[(v - 20) % 10] ?? s[v] ?? s[0]
  return `${rank}${suffix} of ${pool}`
}

/** Real reported-coverage series (2019/2020/2021/present) as an inline bar chart. */
function SnapshotBars({ d }: { d: EnrichedDistrict }) {
  const series = useMemo(() => {
    const snaps = buildSnapshots(d)
    return snaps.map((s, i) => ({
      label: SNAPSHOT_YEARS[i] === PRESENT_YEAR ? 'Now' : `’${String(SNAPSHOT_YEARS[i]).slice(2)}`,
      coverage: d.totalHouseholds > 0 ? s.connections / d.totalHouseholds : 0,
    }))
  }, [d])

  const H = 88
  const targetY = H - TARGET * H
  return (
    <svg viewBox={`0 0 200 ${H + 16}`} className="w-full" role="img" aria-label="Reported coverage by year">
      {/* 90% target line */}
      <line x1="0" y1={targetY} x2="200" y2={targetY} stroke="#10b981" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.5" />
      <text x="198" y={targetY - 3} textAnchor="end" fontSize="8" fill="#10b981" fillOpacity="0.8">90%</text>
      {series.map((s, i) => {
        const bw = 34
        const gap = (200 - series.length * bw) / (series.length + 1)
        const x = gap + i * (bw + gap)
        const h = s.coverage * H
        const isNow = i === series.length - 1
        return (
          <g key={i}>
            <rect x={x} y={H - h} width={bw} height={h} rx="2"
              fill={isNow ? '#818cf8' : '#3f3f46'} fillOpacity={isNow ? 0.95 : 0.7} />
            <text x={x + bw / 2} y={H - h - 3} textAnchor="middle" fontSize="8.5" fill="#a1a1aa" className="nums">
              {(s.coverage * 100).toFixed(0)}
            </text>
            <text x={x + bw / 2} y={H + 12} textAnchor="middle" fontSize="9" fill="#71717a" className="nums">
              {s.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export const DistrictDrawer = memo(function DistrictDrawer({
  district,
  all,
  onClose,
  onSelectPeer,
  onViewState,
}: DistrictDrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!district) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [district, onClose])

  const stats = useMemo(
    () => (district ? computeDistrictStats(all, district) : null),
    [all, district]
  )

  if (!district || !stats) return null

  const region = regionOf(district.state)
  const gainPts = (district.coverageCurrent - district.coverage2019) * 100
  const atTarget = district.coverageCurrent >= TARGET

  return (
    <aside
      role="dialog"
      aria-label={`${district.district} district detail`}
      className="animate-fade-slide absolute inset-y-0 right-0 z-40 flex w-[24rem] max-w-full flex-col overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-950/95 shadow-2xl backdrop-blur-xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-zinc-800/60 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 shrink-0 text-indigo-400" />
            <h2 className="truncate text-base font-bold tracking-tight text-zinc-50">{district.district}</h2>
          </div>
          <button
            onClick={() => onViewState(district.state)}
            className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500 hover:text-indigo-300"
          >
            {district.state}
            <span className="rounded px-1 py-px text-[9px] font-semibold" style={{ color: REGION_COLORS[region], background: `${REGION_COLORS[region]}1a` }}>
              {region}
            </span>
          </button>
        </div>
        <button onClick={onClose} aria-label="Close detail" className="shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Coverage headline */}
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Current Coverage</div>
              <div className={`nums text-3xl font-bold tracking-tight ${atTarget ? 'text-emerald-400' : 'text-zinc-50'}`}>
                {formatPct(district.coverageCurrent)}
              </div>
            </div>
            <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${gainPts >= 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
              {gainPts >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {gainPts >= 0 ? '+' : ''}{gainPts.toFixed(1)} pts vs ’19
            </div>
          </div>
          {/* Progress to target */}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className={`h-full rounded-full ${atTarget ? 'bg-emerald-500' : 'bg-gradient-to-r from-rose-500 to-amber-400'}`}
              style={{ width: `${Math.min(100, district.coverageCurrent * 100)}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-zinc-600">
            <span>2019 baseline {formatPct(district.coverage2019, 0)}</span>
            <span>{atTarget ? 'At 90% target' : `${((TARGET - district.coverageCurrent) * 100).toFixed(1)} pts to target`}</span>
          </div>
        </div>

        {/* Profile stat grid */}
        <div className="grid grid-cols-2 gap-2">
          <Stat icon={Users} label="Households" value={formatIndian(district.totalHouseholds)} tone="neutral" />
          <Stat icon={Target} label="Unconnected" value={formatIndian(district.householdsRemaining)} tone="neg" />
          <Stat icon={TrendingUp} label="Added since ’19" value={`+${formatCompact(district.connectionsAdded)}`} tone="pos" />
          <Stat icon={TrendingUp} label="Pace / mo" value={formatCompact(district.velocityAbs)} tone="neutral" />
        </div>

        {/* Real reported trajectory */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Reported Trajectory</h3>
            <span className="rounded bg-emerald-500/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-emerald-400/80">real snapshots</span>
          </div>
          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-2">
            <SnapshotBars d={district} />
          </div>
        </div>

        {/* Ranks */}
        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Where It Ranks</h3>
          <div className="space-y-1.5">
            <RankRow label="Coverage · nationally" value={ordinal(stats.coverageRankNational, stats.coveragePoolNational)} pct={stats.coveragePercentile} />
            <RankRow label={`Coverage · in ${district.state}`} value={ordinal(stats.coverageRankState, stats.coveragePoolState)} />
            <RankRow label="Backlog · nationally" value={`#${stats.backlogRankNational} largest`} tone="neg" />
          </div>
        </div>

        {/* Peers */}
        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Similar-Size Peers</h3>
          <p className="mb-1.5 text-[10px] leading-tight text-zinc-600">Districts closest in population — coverage compared to this one.</p>
          <div className="space-y-1">
            {stats.peers.map(({ d, coverageDeltaPts }) => {
              const ahead = coverageDeltaPts > 0.05
              const behind = coverageDeltaPts < -0.05
              const Icon = ahead ? ArrowUpRight : behind ? ArrowDownRight : Minus
              const tone = ahead ? 'text-emerald-400' : behind ? 'text-rose-400' : 'text-zinc-500'
              return (
                <button
                  key={d.id}
                  onClick={() => onSelectPeer(d.state, d.id)}
                  className="group flex w-full items-center justify-between gap-2 rounded-md border border-zinc-800/50 bg-zinc-900/40 px-2 py-1.5 text-left transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/[0.07]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium text-zinc-200">{d.district}</div>
                    <div className="nums truncate text-[9px] text-zinc-500">{formatCompact(d.totalHouseholds)} HH · {d.state}</div>
                  </div>
                  <div className={`flex shrink-0 items-center gap-1 text-[10px] font-semibold ${tone}`}>
                    <Icon className="h-3 w-3" />
                    {coverageDeltaPts >= 0 ? '+' : ''}{coverageDeltaPts.toFixed(1)}
                    <ChevronRight className="h-3 w-3 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-400" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </aside>
  )
})

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone: 'pos' | 'neg' | 'neutral' }) {
  const color = tone === 'pos' ? 'text-emerald-400' : tone === 'neg' ? 'text-rose-400' : 'text-zinc-400'
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
        <Icon className={`h-3 w-3 ${color}`} /> {label}
      </div>
      <div className="nums mt-0.5 text-sm font-bold tracking-tight text-zinc-100">{value}</div>
    </div>
  )
}

function RankRow({ label, value, pct, tone }: { label: string; value: string; pct?: number; tone?: 'neg' }) {
  return (
    <div className="rounded-md border border-zinc-800/50 bg-zinc-900/40 px-2.5 py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-400">{label}</span>
        <span className={`nums text-[11px] font-semibold ${tone === 'neg' ? 'text-rose-300' : 'text-zinc-100'}`}>{value}</span>
      </div>
      {pct !== undefined && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-indigo-500/80" style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
      )}
    </div>
  )
}
