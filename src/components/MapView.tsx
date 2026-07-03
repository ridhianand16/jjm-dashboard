import { memo, useMemo, useState, useCallback, useEffect } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import { geoBounds } from 'd3-geo'
import { feature, merge } from 'topojson-client'
import type { Topology, GeometryCollection, Polygon, MultiPolygon } from 'topojson-specification'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { Plus, Minus, Locate, MapPin, Layers, Info } from 'lucide-react'
import type { EnrichedDistrict } from '../types'
import { buildDataIndex, resolveGeo, type DataIndex } from '../lib/geoJoin'
import { aggregateByState, type StateAggregate } from '../lib/aggregate'
import { makeColorScale, legendStops, NO_DATA_FILL, NO_DATA_STROKE } from '../lib/choropleth'
import { unconnectedAtT, coverageAtT, isInterpolated } from '../lib/timeseries'
import { formatCompact, formatIndian, formatPct } from '../lib/format'

const GEO_URL = '/india-districts.json'
const INDIA_CENTER: [number, number] = [82.9, 22.6]
const BASE_SCALE = 1050
const MAP_W = 800
// Visible longitude span (deg) at zoom 1, from mercator scale & width.
const VISIBLE_DEG_AT_Z1 = (MAP_W / BASE_SCALE) * (180 / Math.PI)

interface GeoProps {
  district: string
  st_nm: string
}

interface MapViewProps {
  data: EnrichedDistrict[] // all districts (unscoped)
  level: 'national' | 'state'
  activeState: string | null
  timelineT: number
  selectedId: string | null
  onSelectState: (state: string) => void
  onSelectDistrict: (id: string | null) => void
  onJoinReport?: (matched: number, total: number) => void
}

interface TooltipState {
  x: number
  y: number
  title: string
  subtitle: string
  total: number
  coverage: number
  unconnected: number
  matched: boolean
  extra?: string
}

/** Fit center/zoom to a set of features. */
function fitTo(features: Feature[]): { center: [number, number]; zoom: number } {
  if (features.length === 0) return { center: INDIA_CENTER, zoom: 1 }
  const fc: FeatureCollection = { type: 'FeatureCollection', features }
  const [[minLng, minLat], [maxLng, maxLat]] = geoBounds(fc)
  const center: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
  const span = Math.max(maxLng - minLng, maxLat - minLat, 0.5)
  const zoom = Math.min(9, Math.max(1.6, VISIBLE_DEG_AT_Z1 / (span * 1.5)))
  return { center, zoom }
}

export const MapView = memo(function MapView({
  data,
  level,
  activeState,
  timelineT,
  selectedId,
  onSelectState,
  onSelectDistrict,
  onJoinReport,
}: MapViewProps) {
  const [topology, setTopology] = useState<Topology | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [center, setCenter] = useState<[number, number]>(INDIA_CENTER)
  const [zoom, setZoom] = useState(1)

  // Load topology once
  useEffect(() => {
    let alive = true
    fetch(GEO_URL)
      .then((r) => r.json())
      .then((t: Topology) => alive && setTopology(t))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const index: DataIndex<EnrichedDistrict> = useMemo(() => buildDataIndex(data), [data])
  const stateAgg = useMemo(() => {
    const m = new Map<string, StateAggregate>()
    for (const a of aggregateByState(data)) m.set(a.state, a)
    return m
  }, [data])

  // Merged state polygons (grouped by RESOLVED data-state so Telangana etc.
  // split out of the 2011 geometry correctly).
  const stateFC = useMemo<FeatureCollection | null>(() => {
    if (!topology) return null
    const districts = topology.objects.districts as GeometryCollection<GeoProps>
    type Poly = Polygon<GeoProps> | MultiPolygon<GeoProps>
    const groups = new Map<string, Poly[]>()
    for (const g of districts.geometries) {
      const props = g.properties as GeoProps | undefined
      if (!props) continue
      const rec = resolveGeo(index, props.st_nm, props.district)
      if (!rec) continue
      const arr = groups.get(rec.state)
      if (arr) arr.push(g as Poly)
      else groups.set(rec.state, [g as Poly])
    }
    const features: Feature[] = [...groups].map(([state, geoms]) => ({
      type: 'Feature',
      properties: { state },
      geometry: merge(topology, geoms) as Geometry,
    }))
    return { type: 'FeatureCollection', features }
  }, [topology, index])

  // District features (all), and the subset for the active state.
  const districtFC = useMemo<FeatureCollection | null>(() => {
    if (!topology) return null
    return feature(topology, topology.objects.districts) as unknown as FeatureCollection
  }, [topology])

  const activeDistrictFC = useMemo<FeatureCollection | null>(() => {
    if (!districtFC || !activeState) return null
    const features = districtFC.features.filter((f) => {
      const p = f.properties as unknown as GeoProps
      const rec = resolveGeo(index, p.st_nm, p.district)
      return rec?.state === activeState
    })
    return { type: 'FeatureCollection', features }
  }, [districtFC, activeState, index])

  // One-time join report
  useEffect(() => {
    if (!onJoinReport || !districtFC) return
    const ids = new Set<string>()
    for (const f of districtFC.features) {
      const p = f.properties as unknown as GeoProps
      const rec = resolveGeo(index, p.st_nm, p.district)
      if (rec) ids.add(rec.id)
    }
    onJoinReport(ids.size, data.length)
  }, [districtFC, index, data.length, onJoinReport])

  // Fit view on level / state change
  useEffect(() => {
    if (level === 'national') {
      setCenter(INDIA_CENTER)
      setZoom(1)
    } else if (activeDistrictFC && activeDistrictFC.features.length) {
      const { center: c, zoom: z } = fitTo(activeDistrictFC.features)
      setCenter(c)
      setZoom(z)
    }
  }, [level, activeDistrictFC])

  // Color scale (domain from present-day max backlog of the displayed layer)
  const { colorScale, legend } = useMemo(() => {
    let maxVal = 1
    if (level === 'national') {
      for (const a of stateAgg.values()) maxVal = Math.max(maxVal, unconnectedAtT(a, 0))
    } else {
      for (const d of data) {
        if (d.state === activeState) maxVal = Math.max(maxVal, unconnectedAtT(d, 0))
      }
    }
    return { colorScale: makeColorScale(maxVal), legend: legendStops(maxVal, 5) }
  }, [level, stateAgg, data, activeState])

  // ---- interaction ----
  const showStateTip = useCallback(
    (state: string, evt: React.MouseEvent) => {
      const a = stateAgg.get(state)
      if (!a) return
      setTooltip({
        x: evt.clientX,
        y: evt.clientY,
        title: state,
        subtitle: `${a.districtCount} districts`,
        total: a.totalHouseholds,
        coverage: coverageAtT(a, timelineT),
        unconnected: unconnectedAtT(a, timelineT),
        matched: true,
        extra: `${a.laggingCount} below 90%`,
      })
    },
    [stateAgg, timelineT]
  )

  const showDistrictTip = useCallback(
    (p: GeoProps, evt: React.MouseEvent) => {
      const rec = resolveGeo(index, p.st_nm, p.district)
      setTooltip({
        x: evt.clientX,
        y: evt.clientY,
        title: p.district,
        subtitle: rec?.state ?? p.st_nm,
        total: rec?.totalHouseholds ?? 0,
        coverage: rec ? coverageAtT(rec, timelineT) : 0,
        unconnected: rec ? unconnectedAtT(rec, timelineT) : 0,
        matched: !!rec,
      })
    },
    [index, timelineT]
  )

  const moveTip = useCallback((evt: React.MouseEvent) => {
    setTooltip((t) => (t ? { ...t, x: evt.clientX, y: evt.clientY } : t))
  }, [])
  const clearTip = useCallback(() => setTooltip(null), [])

  const geographies = level === 'national' ? stateFC : activeDistrictFC

  const modeled = isInterpolated(timelineT)

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-950"
      role="application"
      aria-label={`Choropleth of unconnected households by ${level === 'national' ? 'state' : 'district'}. Use Tab to move between areas and Enter to drill in.`}
    >
      {geographies ? (
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: BASE_SCALE, center: INDIA_CENTER }}
          width={MAP_W}
          height={MAP_W}
          className="h-full w-full"
        >
          <ZoomableGroup
            center={center}
            zoom={zoom}
            minZoom={1}
            maxZoom={12}
            onMoveEnd={({ coordinates, zoom: z }) => {
              setCenter(coordinates as [number, number])
              setZoom(z)
            }}
          >
            <Geographies geography={geographies}>
              {({ geographies: geos }) =>
                geos.map((geo) => {
                  if (level === 'national') {
                    const state = (geo.properties as { state: string }).state
                    const agg = stateAgg.get(state)
                    const fill = agg ? colorScale(unconnectedAtT(agg, timelineT)) : NO_DATA_FILL
                    const selected = activeState === state
                    const cov = agg ? coverageAtT(agg, timelineT) : 0
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        tabIndex={0}
                        role="button"
                        aria-label={`${state}, ${formatPct(cov)} coverage. Press Enter to drill into districts.`}
                        onKeyDown={(e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onSelectState(state)
                          }
                        }}
                        onMouseEnter={(e) => showStateTip(state, e)}
                        onMouseMove={moveTip}
                        onMouseLeave={clearTip}
                        onClick={() => onSelectState(state)}
                        style={{
                          default: { fill, stroke: selected ? '#818cf8' : NO_DATA_STROKE, strokeWidth: selected ? 1 : 0.4, outline: 'none', transition: 'fill 0.4s ease' },
                          hover: { fill, stroke: '#a5b4fc', strokeWidth: 0.9, outline: 'none', cursor: 'pointer' },
                          pressed: { fill, outline: 'none' },
                        }}
                      />
                    )
                  }
                  const p = geo.properties as unknown as GeoProps
                  const rec = resolveGeo(index, p.st_nm, p.district)
                  const fill = rec ? colorScale(unconnectedAtT(rec, timelineT)) : NO_DATA_FILL
                  const selected = rec?.id === selectedId
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      tabIndex={rec ? 0 : -1}
                      role="button"
                      aria-label={rec
                        ? `${p.district}, ${formatPct(coverageAtT(rec, timelineT))} coverage. Press Enter to inspect.`
                        : `${p.district}, no JJM data`}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (rec && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault()
                          onSelectDistrict(rec.id === selectedId ? null : rec.id)
                        }
                      }}
                      onMouseEnter={(e) => showDistrictTip(p, e)}
                      onMouseMove={moveTip}
                      onMouseLeave={clearTip}
                      onClick={() => rec && onSelectDistrict(rec.id === selectedId ? null : rec.id)}
                      style={{
                        default: { fill, stroke: selected ? '#818cf8' : NO_DATA_STROKE, strokeWidth: selected ? 1.2 : 0.3, outline: 'none', transition: 'fill 0.4s ease' },
                        hover: { fill, stroke: '#a5b4fc', strokeWidth: 0.8, outline: 'none', cursor: rec ? 'pointer' : 'default' },
                        pressed: { fill, outline: 'none' },
                      }}
                    />
                  )
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-zinc-600">Loading geometry…</div>
      )}

      {/* Layer indicator */}
      <div className="glass absolute left-3 top-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-zinc-300">
        <Layers className="h-3.5 w-3.5 text-indigo-400" />
        {level === 'national' ? 'States · click to drill' : `${activeState} · districts`}
      </div>

      {/* Modeled-data honesty affordance: the map fill is an interpolated estimate here. */}
      {modeled && (
        <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-300 backdrop-blur">
          <Info className="h-3 w-3" /> Modeled estimate — interpolated
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button onClick={() => setZoom((z) => Math.min(12, z * 1.5))} className="glass glass-hover flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300" title="Zoom in">
          <Plus className="h-4 w-4" />
        </button>
        <button onClick={() => setZoom((z) => Math.max(1, z / 1.5))} className="glass glass-hover flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300" title="Zoom out">
          <Minus className="h-4 w-4" />
        </button>
        <button onClick={() => { setCenter(INDIA_CENTER); setZoom(1) }} className="glass glass-hover flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300" title="Reset view">
          <Locate className="h-4 w-4" />
        </button>
      </div>

      {/* Legend */}
      <div className="glass absolute bottom-3 left-3 rounded-lg px-3 py-2.5">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          Unconnected Households
        </div>
        <div className="flex items-center gap-1">
          {legend.map((s, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="h-3.5 w-9 rounded-sm" style={{ background: s.color }} />
              <span className="nums text-[9px] text-zinc-500">{formatCompact(s.value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="glass pointer-events-none fixed z-50 max-w-[15rem] rounded-lg px-3 py-2 text-xs shadow-2xl" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
            <MapPin className="h-3 w-3 text-indigo-400" />
            {tooltip.title}
          </div>
          <div className="mb-1 text-[10px] text-zinc-500">{tooltip.subtitle}</div>
          {tooltip.matched ? (
            <div className="nums space-y-0.5 text-zinc-300">
              <div className="flex justify-between gap-4"><span className="text-zinc-500">Households</span><span>{formatIndian(tooltip.total)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-zinc-500">Coverage</span><span className="text-emerald-400">{formatPct(tooltip.coverage)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-zinc-500">Unconnected</span><span className="text-rose-400">{formatIndian(tooltip.unconnected)}</span></div>
              {tooltip.extra && <div className="mt-1 text-[10px] text-amber-400/80">{tooltip.extra}</div>}
            </div>
          ) : (
            <div className="text-[10px] italic text-zinc-600">No JJM data joined to this polygon</div>
          )}
        </div>
      )}
    </div>
  )
})
