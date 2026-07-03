# Architecture & Technical Specification

How Jal Command Center is built. For the data itself see [DATA.md](DATA.md); for a quick contributor map see [../CLAUDE.md](../CLAUDE.md).

## Stack

| Concern | Choice | Notes |
|---|---|---|
| UI | **React 18** | Function components + hooks only; no class components. |
| Language | **TypeScript 5.7**, `strict` | `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch` on. Type errors fail the build. |
| Build/dev | **Vite 6** | `@vitejs/plugin-react`, ESM, `dist/` output. |
| Styling | **Tailwind CSS 3** | Dark zinc theme; custom utilities in `src/index.css`. Inter webfont. |
| Charts | **Recharts 2** | Analytics bubble field only. Lazy-loaded. |
| Map | **react-simple-maps 3** + **topojson-client** + **d3-geo** | Choropleth, drill, fit-to-bounds. Lazy-loaded. |
| Colour/scale | **d3-scale**, **d3-scale-chromatic** | `scaleSqrt` + `interpolateInferno`. |
| CSV | **papaparse** | Header-mode parse of the data file. |
| Icons | **lucide-react** | Per-icon ESM imports. |

No backend, router, or global store. State is local React state lifted into one hub component; derived data is `useMemo`-ised.

## Data flow

```
                         public/jal_data.csv
                                  │  fetch + Papa.parse (utils/parseCSV.ts)
                                  ▼
                          DistrictRecord[]
                                  │  enrichDistricts()  (lib/metrics.ts, two-pass)
                                  ▼
                         EnrichedDistrict[]  ─────────────────────────────┐
                                  │                                        │
             aggregateByState()   │   coverageAtT / unconnectedAtT(t)      │
             (lib/aggregate.ts)   │   (lib/timeseries.ts)                  │
                                  ▼                                        ▼
                        StateAggregate[]                          per-frame values
                          │        │                                  │
                          ▼        ▼                                  ▼
                  StateRanking   MapView(choropleth) ◄── geoJoin ── india-districts.json
                                     │                  (lib/geoJoin.ts)  (TopoJSON, 2011)
                                     ▼
                         InsightsPanel · BubbleChart · DistrictDrawer · SearchTypeahead
```

`src/views/MapDashboard.tsx` is the single source of shared state and orchestrates everything.

## Directory structure

```
src/
├─ App.tsx                    # mounts MapDashboard
├─ main.tsx                   # React root
├─ index.css                  # Tailwind layers + .glass/.nums/.glow utilities
├─ views/
│  └─ MapDashboard.tsx        # hub: state, KPIs, layout, lazy-loading, wiring
├─ components/
│  ├─ MapView.tsx             # choropleth + drill + a11y  (lazy)
│  ├─ BubbleChart.tsx         # analytics bubble field     (lazy)
│  ├─ DistrictDrawer.tsx      # per-district detail panel
│  ├─ SearchTypeahead.tsx     # district/state combobox
│  ├─ TimelinePlayback.tsx    # timeline scrubber + honesty affordances
│  ├─ InsightsPanel.tsx       # ranked findings
│  └─ StateRankingTable.tsx   # sortable state league table
├─ lib/                       # pure, testable logic (no React)
│  ├─ timeseries.ts           # timeline knots, interpolation, isInterpolated
│  ├─ metrics.ts              # enrichDistricts, computeAggregates
│  ├─ aggregate.ts            # aggregateByState
│  ├─ geoJoin.ts              # name normalisation + alias join
│  ├─ choropleth.ts           # colour scale + legend
│  ├─ districtStats.ts        # rank + peers for the drawer
│  ├─ regions.ts              # state→region + palette
│  ├─ insights.ts             # insight derivation
│  └─ format.ts               # number formatting
├─ types/index.ts             # DistrictRecord, EnrichedDistrict, Snapshot, …
└─ utils/parseCSV.ts          # CSV → DistrictRecord[]
```

## Views & top-level state

`MapDashboard` holds:

| State | Purpose |
|---|---|
| `data: EnrichedDistrict[]` | The enriched dataset (loaded once). |
| `timelineT: number` (0–1) | Normalised position on the 2019→present axis. Drives every time-aware value. |
| `playing` | Timeline auto-play flag. |
| `level` / `activeState` | Drill scope: `national` or a specific `state`. |
| `selectedId` | Selected district id (`state::district`) — opens the drawer. |
| `viewMode` | `map` or `analytics`. |
| `join` | Geo-join coverage report (matched/total) for the header. |

Two view modes share the same KPI strip, timeline, drawer, and search:
- **Map** — insights rail · choropleth · state-ranking rail.
- **Analytics** — full-width bubble field.

## Metrics & derivations

**`enrichDistricts` (two-pass, O(n))** — pass 1 computes per-district primitives (coverage 2019/now, households remaining, connections added, monthly velocity, gap-closed fraction, baseline deficit) and dataset-wide extents; pass 2 normalises the 0–100 radar axes and a synthetic `efficiencyScore` (rewards closing a *large* baseline deficit quickly).

**`computeDistrictStats` (drawer)** — national + in-state coverage rank, national backlog rank, coverage percentile, and the *k* nearest districts by population as "peers", each with a signed coverage delta.

**`aggregateByState`** — sums each snapshot column so a `StateAggregate` shares the `DistrictRecord` shape; every `timeseries` helper works on states unchanged.

## Timeline model (the honesty core)

Defined in `lib/timeseries.ts`:

- Axis spans `BASELINE_YEAR = 2019` → `PRESENT_YEAR = 2026`; `t ∈ [0,1]`.
- Four **real** knots per district: 2019, 2020, 2021, present (`SNAPSHOT_YEARS`).
- `connectionsAtT(rec, t)` is **piecewise-linear** across those knots (not a 2-point lerp), so the 2019–2021 reported curve is exact at each snapshot.
- `LAST_REAL_T` marks the last reported knot (2021). `isInterpolated(t)` returns true past it — the 2021→present span has **no reported intermediate points**, so it is modeled.

Every consumer (map fill, KPIs, bubble Y, tooltips) reads through `coverageAtT`/`unconnectedAtT`, keeping a single time model. UI honesty affordances (hatched tail, amber map ribbon, drawer "real snapshots only", "modeled" popover) all key off `isInterpolated`.

## Geo-join

`india-districts.json` is 2011-census TopoJSON (**723** district polygons); the data is 2026 (**~754** districts). `lib/geoJoin.ts`:

1. `normalizeName` — lowercases, drops parentheticals/punctuation.
2. Curated `DISTRICT_ALIASES` / `STATE_ALIASES` for clean renames/spellings.
3. `resolveGeo` — exact `state::district` match, else unambiguous district-only match; names that collide across states (`AMBIGUOUS_DISTRICTS`) require state agreement.

Genuinely new post-2011 districts have no polygon and render as "no boundary data" — expected, not a bug. The header shows live join coverage.

## Choropleth colour

`makeColorScale` = `scaleSqrt` (spreads the long tail of very large districts) into `interpolateInferno`, offset `0.12–0.97` so small values stay visible on the dark canvas. **Inferno is perceptually-uniform and colour-blind-safe** (monotonic lightness), so the encoding survives deuteranopia/protanopia/tritanopia and greyscale. Legend stops use inverse-sqrt spacing to mirror the scale.

## Code-splitting & bundle

The two heavy dependencies are isolated behind `React.lazy` + `Suspense` in `MapDashboard`:

| Chunk | ~size (min) | Loads when |
|---|--:|---|
| `index` (app + light components) | ~214 kB | initial |
| `MapView` (react-simple-maps + topojson + d3-geo) | ~118 kB | Map view (default) |
| `BubbleChart` (recharts) | ~380 kB | **only** when Analytics is opened |
| `pow` (shared d3 math) | ~21 kB | with either |

Before splitting this was a single ~712 kB chunk; recharts — the largest piece — is now fully deferred.

## Accessibility

- Map geographies are focusable (`tabIndex`), `role="button"`, `aria-label`d with name + coverage, and drill on **Enter/Space**. The map container is a labelled `role="application"`.
- Search is an ARIA `combobox`/`listbox` with `aria-selected` and full arrow/enter/escape keyboard control.
- Colour-blind-safe map ramp (see above); status is never encoded by hue alone (icons + text accompany colour throughout).
- The drawer is a labelled `role="dialog"` and closes on Escape.

## Performance

Pure `lib/*` functions are memoised at call sites; expensive derivations (`enrichDistricts`, `aggregateByState`, geo feature building, per-frame scales) run inside `useMemo` keyed on their real inputs. Heavy components are `memo()`-wrapped. Timeline playback uses `requestAnimationFrame` with a fixed sweep duration.

## Tooling config

- `tsconfig.app.json` — strict, `moduleResolution: bundler`, `jsx: react-jsx`, `noEmit` (Vite emits).
- `vite.config.ts` — React plugin only.
- `tailwind.config.js` — `darkMode: 'class'`, Inter font stack, accent colours.
- `.github/workflows/data-pipeline.yml` — weekly data sync (see [DATA.md](DATA.md)).
