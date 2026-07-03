# Data Sources & Integrity

Everything about where the numbers come from, what they mean, and where they stop being reported and start being modeled. For how the app consumes them, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Source

All coverage figures come from the **Government of India's Jal Jeevan Mission public dashboard**, [ejalshakti.gov.in](https://ejalshakti.gov.in).

- **Endpoint:** `POST https://ejalshakti.gov.in/jjmreport/JJMIndia.aspx/Bind_table_graph`
- **Type:** ASP.NET PageMethod (WebMethod) returning JSON — the page's own table is rendered from it via `$.ajax()`. Auth: **none** (public).
- **Boundaries:** `public/india-districts.json` — India district TopoJSON, **2011-census vintage** (723 district polygons).

No headless browser is used; the JSON API is called directly, which is faster and doesn't break on DOM changes.

## Sync pipeline

`scripts/sync-data.js` (Node built-ins + native `fetch`, no npm deps) produces the CSV:

1. **State list** — one call with `StCode11 = encodeTxt("0")` returns all 34 states/UTs.
2. **Districts per state** — one call each, keyed by the state's `KeyValue`, run **4-concurrent** to stay polite, with a 20 s timeout per request.
3. **Snapshot assembly** — see below.
4. **Write** — sorted (state, district) CSV to `data/jal_real_data.csv` and mirrored to `public/jal_data.csv` (the file the app fetches).

**`StCode11` obfuscation.** The endpoint expects a lightly obfuscated state code. `encodeTxt(s)` replicates the page's own JS: URL-escape → shift each char code by +1 → URL-escape again → append the shift count. This is *obfuscation, not security* — the endpoint is public and unauthenticated; the helper simply speaks the format the server expects.

Run it manually with:
```bash
node scripts/sync-data.js
```

### Automated weekly refresh

`.github/workflows/data-pipeline.yml` runs the sync **every Sunday at 00:00 UTC** (and on manual dispatch): it executes the script, and if the CSV changed, commits it as `github-actions[bot]`. Forks get fresh data with no maintenance.

## CSV schema

`public/jal_data.csv` — one row per district (or per UT where district data is unavailable):

| Column | Meaning |
|---|---|
| `State` | State/UT name (commas stripped). |
| `District` | District name (or state name for state-level fallback rows). |
| `Total_Households` | Total rural households — the denominator for coverage. |
| `Connections_2019` | Functional household tap connections at the **01/04/2019 baseline** (`HCPWS_01042019`). |
| `Connections_2020` | Baseline + FY 2019-20 additions (cumulative). |
| `Connections_2021` | 2020 cumulative + FY 2020-21 additions. |
| `Connections_Current` | Latest reported cumulative total (`Value`). |

~754 rows across 34 states/UTs.

**Cumulative snapshots, monotonic & capped.** `buildSnapshots` reconstructs a cumulative series from the API's annual-increment fields and enforces `2019 ≤ 2020 ≤ 2021 ≤ current`, each clamped to `[0, Total_Households]`, so a district can never lose connections or exceed its household count.

## Reported vs modeled — the integrity model

This is the most important thing to understand about the data.

**Only four points per district are real:** the 2019 baseline, 2020, 2021, and the latest total. There are **no reported intermediate points** between 2021 and today. When you scrub the timeline into that span, the app draws a **straight line between the 2021 and present knots** — an interpolated *estimate*, not an observed figure.

The UI never hides this:

- **Timeline** — the 2021→present tail is hatched; snapshot years are click-to-snap; the position label flips to amber **"modeled"** with an explainer popover; the thumb turns amber.
- **Map** — an amber *"Modeled estimate — interpolated"* ribbon appears whenever the scrubber is past 2021.
- **District drawer** — its trajectory chart plots **real snapshots only** (2019/20/21/Now), badged "real snapshots".

In code this is one predicate — `isInterpolated(t)` in `src/lib/timeseries.ts` — that every affordance keys off. **If you extend the tool, preserve it.** Presenting interpolated numbers as reported would defeat the point.

## Data-quality caveats

- **2011 boundaries vs 2026 districts.** District boundaries predate many splits; ~30 newer districts (much of Andhra Pradesh's 2022 reorganisation) have no polygon and show as "no boundary data". The header reports live join coverage. See `geoJoin.ts`.
- **Ambiguous names.** Districts whose names repeat across states are disambiguated by state before joining.
- **State-level fallbacks.** For small UTs (or a rare failed district fetch) a single state-level row is emitted with `District = State`. These still carry real totals.
- **Monotonic enforcement** can mask a genuine reporting correction where a source figure decreased — a deliberate trade for a clean, non-decreasing rollout curve.

## Known future data work (not yet available)

Two roadmap items are **blocked on data we don't have** and are intentionally not implemented — mocking them would contradict the integrity model above:

- **Real monthly time-series ingestion** from ejalshakti historical snapshots — the proper fix that would replace the 2021→present interpolation with reported monthly points. Requires a historical-snapshot pipeline.
- **Cause/context dimensions** (scheme type, terrain, funding) to explain *why* districts lag — no such fields exist in the current source.

## Attribution & usage

Source data © **Government of India, Department of Drinking Water & Sanitation (Jal Shakti)**, via the public ejalshakti.gov.in JJM report. Boundaries from open 2011-census district TopoJSON. This project is an independent visualisation, not affiliated with or endorsed by the Government of India. The sync script hits only a public, unauthenticated endpoint at a low weekly cadence with conservative concurrency — please keep it that way.
