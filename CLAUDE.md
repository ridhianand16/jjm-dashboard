# CLAUDE.md — agent orientation

Guidance for Claude Code (and other coding agents) working in this repo. Human-facing docs live in [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/DATA.md](docs/DATA.md) — read those for the "what/why". This file is the fast map for "where things are and how not to break them".

## What this is
A single-page React dashboard visualising **Jal Jeevan Mission** (Har Ghar Jal) rural tap-water coverage across ~754 Indian districts. Choropleth map + drill-down, a rollout timeline scrubber, an analytics bubble field, a per-district detail drawer, insights, and a state ranking table. Data is real, pulled weekly from `ejalshakti.gov.in`.

## Commands
```bash
npm install              # install deps (Node 20+)
npm run dev              # Vite dev server (HMR)
npm run build            # tsc -b (strict) + vite build → dist/
npm run preview          # serve the production build
node scripts/sync-data.js  # refresh CSV from ejalshakti.gov.in
```
`npm run build` runs the TypeScript compiler in strict mode first — **a type error fails the build**. Always build before claiming done. `noUnusedLocals`/`noUnusedParameters` are on, so dead imports break CI.

## Data flow (one glance)
```
public/jal_data.csv ──parseCSV──> DistrictRecord[] ──enrichDistricts──> EnrichedDistrict[]
                                                                              │
   public/india-districts.json (TopoJSON, 2011) ──geoJoin.resolveGeo──── MapView
                                                                              │
   EnrichedDistrict[] ──aggregateByState──> StateAggregate[] (map/ranking)   │
   EnrichedDistrict[] ──timeseries.coverageAtT(t)──> per-frame values ───────┘
```
`MapDashboard.tsx` owns all shared state and passes it down. There is no store/router — plain React state + `useMemo`.

## File map
| Path | Role |
|---|---|
| `src/App.tsx` | Renders `<MapDashboard/>`. |
| `src/views/MapDashboard.tsx` | **Hub.** Owns state (timelineT, level, activeState, selectedId, viewMode), KPIs, wiring, lazy-loads MapView/BubbleChart. |
| `src/components/MapView.tsx` | Choropleth (react-simple-maps). Drill national↔state, tooltip, legend, keyboard/ARIA, modeled overlay. **Lazy-loaded.** |
| `src/components/BubbleChart.tsx` | Full-width Analytics scatter (recharts). size=pop, color=region/state. **Lazy-loaded.** |
| `src/components/DistrictDrawer.tsx` | Depth-on-demand panel: profile, real snapshot bars, rank, peers. No heavy deps (inline SVG). |
| `src/components/SearchTypeahead.tsx` | Header combobox over districts+states, keyboard-navigable. |
| `src/components/TimelinePlayback.tsx` | Timeline scrubber + play, snap-to-snapshot ticks, "modeled" honesty popover. |
| `src/components/InsightsPanel.tsx` | Ranked findings (backlog/fastest/giants/stalled). |
| `src/components/StateRankingTable.tsx` | Sortable state table (map-view right rail). |
| `src/lib/timeseries.ts` | Timeline math: knots, `coverageAtT`, `unconnectedAtT`, `isInterpolated`. **The honesty model lives here.** |
| `src/lib/metrics.ts` | `enrichDistricts` (two-pass) + `computeAggregates`. |
| `src/lib/aggregate.ts` | `aggregateByState` → `StateAggregate` (reuses DistrictRecord shape so timeseries helpers work unchanged). |
| `src/lib/geoJoin.ts` | Name normalisation + alias map to bind 2011 polygons ↔ 2026 data. |
| `src/lib/choropleth.ts` | Inferno (colour-blind-safe) sqrt colour scale + legend. |
| `src/lib/districtStats.ts` | Per-district rank + similar-size peers (drawer). |
| `src/lib/regions.ts` | State→region map + region palette (bubble colour). |
| `src/lib/insights.ts` | Insight computation. |
| `src/lib/format.ts` | `formatIndian` / `formatCompact` / `formatPct` / `formatSigned`. |
| `scripts/sync-data.js` | Node fetch of the ejalshakti WebMethod → CSV. See [docs/DATA.md](docs/DATA.md). |
| `.github/workflows/data-pipeline.yml` | Weekly (Sun 00:00 UTC) auto-sync + commit. |

## Conventions
- **IDs:** a district is keyed `` `${state}::${district}` ``; a state aggregate `state::${state}`. Selection state (`selectedId`) uses the district id.
- **Styling:** Tailwind + a few utilities in `src/index.css` — `.glass` (panel surface), `.glass-hover`, `.glow-indigo/.glow-emerald`, `.nums` (tabular figures), `.animate-fade-slide`. Dark zinc palette; indigo = accent/selection, emerald = good/target, rose = bad/backlog, **amber = modeled/interpolated**.
- **Numbers:** always format via `src/lib/format.ts` (Indian grouping / compact). Don't hand-roll.
- **Timeline-aware values:** anything that changes as you scrub must go through `coverageAtT`/`unconnectedAtT(rec, t)`, never a naive 2-point lerp.
- **Icons:** `lucide-react`, per-icon ESM imports (a wrong name fails the build).

## Domain concepts you must respect
- **Real vs modeled (analytical integrity):** only 4 snapshots are government-reported — 2019, 2020, 2021, and the latest total. The 2021→present span is **linear interpolation**. `isInterpolated(t)` flags it and the UI de-emphasises it (hatched timeline tail, amber map ribbon, drawer shows *real snapshots only*). Do not present interpolated values as reported. See [docs/DATA.md](docs/DATA.md).
- **Geo mismatch is expected:** TopoJSON is 2011-census (723 polygons); data is 2026 (~754 districts). Post-2011 splits (much of the AP 2022 reorg) have no polygon and render as "no boundary data" **by design**. Don't try to force 100% join.
- **Ambiguous districts:** names that repeat across states (`aurangabad`, `bilaspur`, `balrampur`, `hamirpur`, `pratapgarh`) require state agreement in `resolveGeo`.

## Common changes
- **Add a KPI:** edit the `kpiCells` array in `MapDashboard.tsx`.
- **Add/adjust an analytics axis:** `X_METRICS` in `BubbleChart.tsx`.
- **Change the colour ramp:** `makeColorScale` in `choropleth.ts` (keep it perceptually-uniform / CB-safe).
- **New name alias for the join:** `DISTRICT_ALIASES` / `STATE_ALIASES` in `geoJoin.ts` (keys/values are `normalizeName()` output).
- **New heavy component:** lazy-load it (`React.lazy` + `Suspense`) like MapView/BubbleChart to keep the initial chunk small.

## Roadmap status
Built: district drawer (5), full-width bubble analytics (6), search (7), timeline honesty (8), code-split + a11y (11). **Not built and blocked on external data (do not fabricate):** real monthly time-series ingestion (9) and cause/context dimensions like scheme type/terrain/funding (10). Fabricating these would contradict the honesty model in (8).
