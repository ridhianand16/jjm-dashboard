import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, AlertCircle, Droplets, TrendingDown, Building2, Target, MapPinned, ChevronRight, Home, Map as MapIcon, ScatterChart } from 'lucide-react'
import { fetchDistrictData } from '../utils/parseCSV'
import { enrichDistricts } from '../lib/metrics'
import { coverageAtT, unconnectedAtT } from '../lib/timeseries'
import { formatCompact, formatPct, formatSigned } from '../lib/format'
import type { EnrichedDistrict } from '../types'
import { TimelinePlayback } from '../components/TimelinePlayback'
import { InsightsPanel } from '../components/InsightsPanel'
import { StateRankingTable } from '../components/StateRankingTable'
import { DistrictDrawer } from '../components/DistrictDrawer'
import { SearchTypeahead } from '../components/SearchTypeahead'

// Code-split the heavy visualization chunks (react-simple-maps + topojson, recharts)
// so they load on demand rather than inflating the initial bundle.
const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })))
const BubbleChart = lazy(() => import('../components/BubbleChart').then((m) => ({ default: m.BubbleChart })))

const TARGET = 0.9
type ViewMode = 'map' | 'analytics'

function ChartFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 rounded-xl border border-zinc-800/60 bg-zinc-950 text-sm text-zinc-600">
      <Loader2 className="h-4 w-4 animate-spin text-indigo-400" /> {label}
    </div>
  )
}

export function MapDashboard() {
  const [data, setData] = useState<EnrichedDistrict[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [timelineT, setTimelineT] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [level, setLevel] = useState<'national' | 'state'>('national')
  const [activeState, setActiveState] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('map')
  const [join, setJoin] = useState<{ matched: number; total: number } | null>(null)

  useEffect(() => {
    fetchDistrictData()
      .then((records) => setData(enrichDistricts(records)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load data'))
      .finally(() => setLoading(false))
  }, [])

  // Data scoped to the current drill level
  const scoped = useMemo(
    () => (level === 'state' && activeState ? data.filter((d) => d.state === activeState) : data),
    [data, level, activeState]
  )

  const selectedDistrict = useMemo(
    () => (selectedId ? data.find((d) => d.id === selectedId) ?? null : null),
    [data, selectedId]
  )

  // KPIs at the current timeline position, with 2019 & target context
  const kpi = useMemo(() => {
    const totalHouseholds = scoped.reduce((s, d) => s + d.totalHouseholds, 0)
    const remaining = scoped.reduce((s, d) => s + unconnectedAtT(d, timelineT), 0)
    const connected = totalHouseholds - remaining
    const coverage = totalHouseholds > 0 ? connected / totalHouseholds : 0
    const base2019 = scoped.reduce((s, d) => s + d.connections2019, 0)
    const coverage2019 = totalHouseholds > 0 ? base2019 / totalHouseholds : 0
    const remaining2019 = totalHouseholds - base2019
    const lagging = scoped.filter((d) => coverageAtT(d, timelineT) < TARGET && d.totalHouseholds > 300_000).length
    const atTarget = scoped.filter((d) => coverageAtT(d, timelineT) >= TARGET).length
    return {
      districts: scoped.length,
      totalHouseholds,
      remaining,
      remaining2019,
      coverage,
      coverageGain: coverage - coverage2019,
      lagging,
      atTarget,
    }
  }, [scoped, timelineT])

  const onJoinReport = useCallback((matched: number, total: number) => {
    setJoin((prev) => (prev && prev.matched === matched ? prev : { matched, total }))
  }, [])

  const drillToState = useCallback((state: string) => {
    setActiveState(state)
    setLevel('state')
    setSelectedId(null)
  }, [])

  const backToNational = useCallback(() => {
    setLevel('national')
    setActiveState(null)
    setSelectedId(null)
  }, [])

  // Insight / ranking / scatter / search picks: ensure we're in the right scope, then select
  const pickDistrict = useCallback(
    (state: string, districtId: string) => {
      if (state !== activeState) {
        setActiveState(state)
        setLevel('state')
      }
      setSelectedId(districtId)
    },
    [activeState]
  )

  // From the drawer / search: focus a whole state on the operations map.
  const viewStateOnMap = useCallback(
    (state: string) => {
      drillToState(state)
      setViewMode('map')
    },
    [drillToState]
  )

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center gap-3 text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        <span className="text-sm">Loading geospatial data…</span>
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-rose-400">
        <AlertCircle className="h-8 w-8" />
        <span className="text-sm">{error}</span>
      </div>
    )
  }

  const scopeLabel = level === 'national' ? 'All India' : (activeState ?? '')

  const kpiCells = [
    { label: 'Districts', value: kpi.districts.toLocaleString('en-IN'), sub: level === 'national' ? '34 states' : 'in state', icon: Building2, tone: 'neutral' as const },
    { label: 'Households', value: formatCompact(kpi.totalHouseholds), sub: 'total rural', icon: Droplets, tone: 'neutral' as const },
    { label: 'Coverage', value: formatPct(kpi.coverage), sub: `${formatSigned(kpi.coverageGain * 100, 1)} pts vs ’19`, icon: Target, tone: 'pos' as const },
    { label: 'Unconnected', value: formatCompact(kpi.remaining), sub: `of ${formatCompact(kpi.remaining2019)} in ’19`, icon: TrendingDown, tone: 'neg' as const },
    { label: 'Lagging Giants', value: kpi.lagging.toString(), sub: '>300K HH, <90%', icon: MapPinned, tone: 'neg' as const },
    { label: '≥90% Target', value: kpi.atTarget.toString(), sub: `of ${kpi.districts}`, icon: Target, tone: 'pos' as const },
  ]

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950">
      {/* Header + breadcrumb */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/60 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-emerald-500">
            <Droplets className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight text-zinc-50">Jal Jeevan Mission</span>
          <span className="hidden text-[11px] text-zinc-600 lg:inline">National Operations Center</span>
          {/* Breadcrumb */}
          <nav className="ml-2 flex items-center gap-1 text-xs">
            <button
              onClick={backToNational}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${level === 'national' ? 'font-semibold text-indigo-300' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Home className="h-3 w-3" /> India
            </button>
            {level === 'state' && activeState && (
              <>
                <ChevronRight className="h-3 w-3 text-zinc-600" />
                <span className="rounded px-1.5 py-0.5 font-semibold text-indigo-300">{activeState}</span>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <SearchTypeahead districts={data} onPickDistrict={pickDistrict} onPickState={viewStateOnMap} />

          {/* View switcher */}
          <div className="flex gap-0.5 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-0.5">
            {([['map', 'Map', MapIcon], ['analytics', 'Analytics', ScatterChart]] as const).map(([mode, label, Icon]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${viewMode === mode ? 'bg-indigo-500/90 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {join && (
            <span className="nums hidden text-[11px] text-zinc-500 xl:inline">
              geo-join {((join.matched / join.total) * 100).toFixed(0)}% ({join.matched}/{join.total})
            </span>
          )}
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-px border-b border-zinc-800/60 bg-zinc-800/40 sm:grid-cols-6">
        {kpiCells.map((c) => (
          <div key={c.label} className="bg-zinc-950 px-4 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              <c.icon className={`h-3 w-3 ${c.tone === 'pos' ? 'text-emerald-400' : c.tone === 'neg' ? 'text-rose-400' : 'text-zinc-500'}`} />
              {c.label}
            </div>
            <div className="nums mt-0.5 text-xl font-bold tracking-tight text-zinc-50">{c.value}</div>
            <div className={`nums text-[10px] ${c.tone === 'pos' ? 'text-emerald-400/80' : c.tone === 'neg' ? 'text-rose-400/70' : 'text-zinc-600'}`}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="relative flex min-h-0 flex-1 gap-3 p-3">
        {viewMode === 'map' ? (
          <>
            <div className="w-60 shrink-0">
              <InsightsPanel districts={scoped} scopeLabel={scopeLabel} onPick={pickDistrict} />
            </div>

            <div className="min-w-0 flex-1">
              <Suspense fallback={<ChartFallback label="Loading map…" />}>
                <MapView
                  data={data}
                  level={level}
                  activeState={activeState}
                  timelineT={timelineT}
                  selectedId={selectedId}
                  onSelectState={drillToState}
                  onSelectDistrict={setSelectedId}
                  onJoinReport={onJoinReport}
                />
              </Suspense>
            </div>

            <div className="w-[28rem] shrink-0">
              <StateRankingTable districts={data} activeState={activeState} onSelectState={drillToState} />
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <Suspense fallback={<ChartFallback label="Loading analytics…" />}>
              <BubbleChart
                data={data}
                timelineT={timelineT}
                selectedId={selectedId}
                activeState={activeState}
                onSelect={setSelectedId}
              />
            </Suspense>
          </div>
        )}

        {/* District detail drawer — overlays without losing map/chart context */}
        <DistrictDrawer
          district={selectedDistrict}
          all={data}
          onClose={() => setSelectedId(null)}
          onSelectPeer={pickDistrict}
          onViewState={viewStateOnMap}
        />
      </div>

      {/* Timeline */}
      <div className="px-3 pb-3">
        <TimelinePlayback t={timelineT} onChange={setTimelineT} playing={playing} onPlayingChange={setPlaying} />
      </div>
    </div>
  )
}
