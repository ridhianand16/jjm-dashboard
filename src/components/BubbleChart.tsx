import { memo, useMemo, useState } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { CircleDot } from 'lucide-react'
import type { EnrichedDistrict } from '../types'
import { coverageAtT } from '../lib/timeseries'
import { regionOf, REGION_COLORS, REGIONS, type Region } from '../lib/regions'
import { formatCompact, formatIndian } from '../lib/format'

interface BubbleChartProps {
  data: EnrichedDistrict[]
  timelineT: number
  selectedId: string | null
  activeState: string | null
  onSelect: (id: string | null) => void
}

const COVERAGE_TARGET = 90

type ColorBy = 'region' | 'state'
type XMetric = 'gain' | 'households' | 'baseline'

const X_METRICS: Record<XMetric, { label: string; log?: boolean; unit: string; domain?: [number | 'auto', number | 'auto'] }> = {
  gain: { label: 'Progress since ’19 (pts)', unit: 'pts', domain: [0, 'auto'] },
  households: { label: 'Total households', log: true, unit: 'HH' },
  baseline: { label: '2019 baseline coverage', unit: '%', domain: [0, 100] },
}

interface Point {
  id: string
  x: number
  y: number
  pop: number
  district: string
  state: string
  region: Region
  color: string
  coverage2019: number
  selected: boolean
  dim: boolean
}

/** Stable per-state hue for the "color by state" mode. */
function stateColor(state: string): string {
  let h = 0
  for (let i = 0; i < state.length; i++) h = (h * 31 + state.charCodeAt(i)) % 360
  return `hsl(${h} 62% 58%)`
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Point }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const gain = (p.y / 100 - p.coverage2019) * 100
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
        <span className="h-2 w-2 rounded-full" style={{ background: p.color }} /> {p.district}
      </div>
      <div className="mb-1 text-[10px] text-zinc-500">{p.state} · {p.region}</div>
      <div className="nums space-y-0.5">
        <Row label="Households" value={formatIndian(p.pop)} />
        <Row label="Coverage" value={`${p.y.toFixed(1)}%`} tone="text-emerald-400" />
        <Row label="Since ’19" value={`${gain >= 0 ? '+' : ''}${gain.toFixed(1)} pts`} tone="text-indigo-300" />
      </div>
    </div>
  )
}
function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className={tone ?? 'text-zinc-200'}>{value}</span>
    </div>
  )
}

export const BubbleChart = memo(function BubbleChart({
  data,
  timelineT,
  selectedId,
  activeState,
  onSelect,
}: BubbleChartProps) {
  const [colorBy, setColorBy] = useState<ColorBy>('region')
  const [xMetric, setXMetric] = useState<XMetric>('gain')

  const points = useMemo<Point[]>(() => {
    return data.map((d) => {
      const covNow = coverageAtT(d, timelineT)
      const region = regionOf(d.state)
      const x =
        xMetric === 'households'
          ? d.totalHouseholds
          : xMetric === 'baseline'
            ? d.coverage2019 * 100
            : Math.max(0, (covNow - d.coverage2019) * 100)
      return {
        id: d.id,
        x,
        y: covNow * 100,
        pop: d.totalHouseholds,
        district: d.district,
        state: d.state,
        region,
        color: colorBy === 'region' ? REGION_COLORS[region] : stateColor(d.state),
        coverage2019: d.coverage2019,
        selected: d.id === selectedId,
        dim: activeState != null && d.state !== activeState,
      }
    })
  }, [data, timelineT, xMetric, colorBy, selectedId, activeState])

  const xCfg = X_METRICS[xMetric]
  const xDomain = xCfg.log
    ? [Math.max(1, Math.min(...points.map((p) => p.x))), Math.max(...points.map((p) => p.x))]
    : (xCfg.domain ?? ['auto', 'auto'])

  // Draw dimmed points first, selected last (on top).
  const ordered = useMemo(
    () => [...points].sort((a, b) => Number(a.selected) - Number(b.selected) || Number(b.dim) - Number(a.dim)),
    [points]
  )

  return (
    <div className="glass flex h-full flex-col rounded-xl p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-indigo-400" />
          <div>
            <h2 className="text-sm font-bold tracking-tight text-zinc-100">Coverage Bubble Field</h2>
            <p className="text-[11px] text-zinc-500">Bubble size = population · {data.length} districts · below the 90% line is off-target.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Segmented label="Color" value={colorBy} onChange={(v) => setColorBy(v as ColorBy)}
            options={[{ v: 'region', l: 'Region' }, { v: 'state', l: 'State' }]} />
          <Segmented label="X-axis" value={xMetric} onChange={(v) => setXMetric(v as XMetric)}
            options={[{ v: 'gain', l: 'Progress' }, { v: 'households', l: 'Size' }, { v: 'baseline', l: '’19 base' }]} />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 24, bottom: 28, left: 8 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="2 4" />
            <ReferenceArea y1={0} y2={COVERAGE_TARGET} fill="#f43f5e" fillOpacity={0.04} />
            <ReferenceLine y={COVERAGE_TARGET} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5}
              label={{ value: '90% target', position: 'insideTopRight', fill: '#10b981', fontSize: 10, fillOpacity: 0.8 }} />
            <XAxis
              type="number"
              dataKey="x"
              scale={xCfg.log ? 'log' : 'linear'}
              domain={xDomain as [number, number]}
              allowDataOverflow
              tick={{ fill: '#71717a', fontSize: 10 }}
              tickFormatter={(v) => (xCfg.log ? formatCompact(v) : xMetric === 'baseline' ? `${v}%` : `${v}`)}
              stroke="#3f3f46"
              label={{ value: xCfg.label, position: 'insideBottom', offset: -14, fill: '#71717a', fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 100]}
              tick={{ fill: '#71717a', fontSize: 10 }}
              tickFormatter={(v) => `${v}%`}
              stroke="#3f3f46"
              label={{ value: 'Coverage now', angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 11 }}
            />
            <ZAxis type="number" dataKey="pop" range={[20, 900]} />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#52525b' }} />
            <Scatter
              data={ordered}
              isAnimationActive={false}
              onClick={(p: unknown) => {
                const id = (p as Point).id
                onSelect(id === selectedId ? null : id)
              }}
              style={{ cursor: 'pointer' }}
            >
              {ordered.map((p) => (
                <Cell
                  key={p.id}
                  fill={p.selected ? '#ffffff' : p.color}
                  fillOpacity={p.selected ? 1 : p.dim ? 0.12 : 0.6}
                  stroke={p.selected ? '#818cf8' : p.color}
                  strokeWidth={p.selected ? 2 : 0}
                  strokeOpacity={p.dim ? 0.2 : 0.9}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Region legend */}
      {colorBy === 'region' && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {REGIONS.map((r) => (
            <div key={r} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: REGION_COLORS[r] }} /> {r}
            </div>
          ))}
        </div>
      )}
      {colorBy === 'state' && (
        <p className="mt-2 text-[10px] text-zinc-600">Each hue is a distinct state · hover a bubble to identify it.</p>
      )}
    </div>
  )
})

function Segmented({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ v: string; l: string }>
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">{label}</span>
      <div className="flex gap-0.5 rounded-md border border-zinc-800/60 bg-zinc-900/40 p-0.5">
        {options.map((o) => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${value === o.v ? 'bg-indigo-500/90 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  )
}
