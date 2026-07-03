<div align="center">

# 💧 Jal Command Center

**A national operations dashboard for India's Jal Jeevan Mission (Har Ghar Jal) — turning ~754 districts of rural tap-water data into a decision-making surface.**

React · TypeScript · Vite · Tailwind · live data from ejalshakti.gov.in

</div>

---

## What is this — and why?

The [Jal Jeevan Mission](https://jaljeevanmission.gov.in/) aims to deliver a functional household tap connection to every rural home in India. Progress is published as dense government tables — accurate, but almost impossible to *reason* about: which districts are furthest behind, who's moving fastest, where the biggest backlogs concentrate, and how far the whole programme has come since the 2019 baseline.

**Jal Command Center** re-presents that same official data as an interactive command surface so those questions answer themselves:

- A **choropleth map** shades every state/district by unconnected households — the darker-to-hotter ramp is a heat-map of where work remains.
- A **rollout timeline** lets you scrub 2019 → present and watch coverage fill in — with honest, explicit labelling of which points are *reported* vs *modeled*.
- **Insights, rankings, an analytics bubble field, and a per-district drawer** give depth on demand without losing the map.

It is a read-only analytical tool built on **real, weekly-refreshed** data — not a mock.

## Features

| | |
|---|---|
| 🗺️ **Drill-down map** | National → state → district. Click or keyboard-drill (Tab + Enter). Colour = unconnected households at the current timeline position. |
| ⏱️ **Honest timeline** | Play/scrub the 2019→present rollout. Reported snapshots (2019/20/21 + latest) are click-to-snap; the interpolated tail is visually de-emphasised and labelled **modeled**. |
| 🔎 **Search** | Typeahead over every district and state, fully keyboard-navigable. |
| 📇 **District drawer** | Depth-on-demand: coverage vs 2019, progress-to-target, real reported trajectory, national/state rank, and similar-size peers. |
| 🫧 **Analytics view** | Full-width bubble field — size = population, colour = region or state, selectable X-axis, 90 % target line. |
| 💡 **Insights & ranking** | Auto-derived findings (highest backlog, fastest closing, underserved giants, stalled) and a sortable state league table. |
| ♿ **Accessible & fast** | ARIA + keyboard on the map, colour-blind-safe ramp, code-split bundle (heavy charts load on demand). |

## Using the dashboard

1. **Start at the KPI strip** — coverage, unconnected households, "lagging giants", and progress vs the 2019 baseline for the current scope.
2. **Scrub the timeline** (bottom) to see any metric at a point in time. Watch the amber cues — anything past 2021 is *modeled*, not reported. Click a year tick to snap back to real data.
3. **Click a state** on the map to drill into its districts; use the breadcrumb (India ▸ State) to zoom back out.
4. **Click any district** (map, insight, ranking, search, or bubble) to open the **detail drawer** — rank, peers, and its real reported trajectory.
5. **Switch to Analytics** (header toggle) for the full-width bubble field when the map's rail feels cramped.
6. **Search** (header) to jump straight to any district or state.

## Quick start

**Prerequisites:** [Node.js](https://nodejs.org) 20+ and npm.

```bash
git clone <your-fork-url> jjm-dashboard
cd jjm-dashboard
npm install
npm run dev          # → http://localhost:5173
```

### Build & preview a production bundle
```bash
npm run build        # type-checks (strict) then builds to dist/
npm run preview      # serves dist/ locally
```

### Refresh the data
Data ships in the repo (`public/jal_data.csv`) and is auto-refreshed weekly by CI, but you can pull the latest yourself:
```bash
node scripts/sync-data.js
```
This calls the public ejalshakti.gov.in JJM WebMethod and rewrites the CSV. See [docs/DATA.md](docs/DATA.md) for exactly what it does.

## Forking & deploying

This is a **static site** with a self-contained data pipeline — nothing to host but the built assets.

1. **Fork** the repo on GitHub and clone your fork.
2. The included GitHub Action (`.github/workflows/data-pipeline.yml`) re-syncs the CSV **every Sunday** and commits it — your fork stays current with zero maintenance. You can also trigger it manually (*Actions → Automated Data Sync → Run workflow*).
3. **Deploy** `npm run build`'s `dist/` folder to any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3…). No server or environment variables required.

## Development

- **Architecture, stack, and internals:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Data source, schema, and the reported-vs-modeled model:** [docs/DATA.md](docs/DATA.md)
- **Contributor / agent orientation & conventions:** [CLAUDE.md](CLAUDE.md)

The app is plain React state (no router/store): `src/views/MapDashboard.tsx` is the hub, `src/lib/*` holds pure logic, `src/components/*` holds views. TypeScript is **strict** and unused code fails the build.

## Data integrity note

Only four data points per district are officially reported (2019, 2020, 2021, and the latest total). Everything the timeline shows *between* 2021 and today is straight-line **interpolation**, and the UI says so — hatched timeline, amber "modeled" cues, and a drawer chart that shows real snapshots only. Please preserve that honesty if you extend the tool. Real monthly ingestion is a known future enhancement, blocked on data availability.

## Attribution

Source data © **Government of India — Department of Drinking Water & Sanitation**, via the [ejalshakti.gov.in](https://ejalshakti.gov.in) JJM public dashboard. District boundaries are 2011-census-vintage TopoJSON. This project is an independent visualisation and is not affiliated with or endorsed by the Government of India.
