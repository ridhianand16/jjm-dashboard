/**
 * sync-data.js — JJM FHTC Data Sync
 *
 * Pulls real, live data from the ejalshakti.gov.in JJM dashboard
 * and writes it to /data/jal_real_data.csv (mirrored to /public/).
 *
 * --- Why no Puppeteer? ---
 * The JJM India page (JJMIndia.aspx) renders its table via jQuery
 * $.ajax() calls to ASP.NET PageMethods (WebMethods). The JSON API is
 * callable directly with a POST request — no headless browser needed.
 * This is faster, more reliable, has no Chrome dependency, and won't
 * break on DOM layout changes.
 *
 * --- API details ---
 * Endpoint:  POST JJMIndia.aspx/Bind_table_graph
 * Auth:      none (public endpoint)
 * Encoding:  StCode11 param uses a simple char-shift obfuscation
 *            (replicating the page's own encodeTxt() JS function)
 * All-India: StCode11 = encodeTxt("0") = "11"
 * Per-state: StCode11 = encodeTxt(state.KeyValue)
 *
 * Usage:
 *   node scripts/sync-data.js
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV_PATH = path.resolve(__dirname, '../data/jal_real_data.csv')
const PUBLIC_CSV_PATH = path.resolve(__dirname, '../public/jal_data.csv')
// Wide time-series schema: real government-reported annual snapshots.
//   Connections_2019    = HCPWS as of 01/04/2019 (baseline)
//   Connections_2020    = baseline + FY2019-20 additions
//   Connections_2021    = 2020 cumulative + FY2020-21 additions
//   Connections_Current = latest reported total (Value)
const HEADER =
  'State,District,Total_Households,Connections_2019,Connections_2020,Connections_2021,Connections_Current'

const ENDPOINT =
  'https://ejalshakti.gov.in/jjmreport/JJMIndia.aspx/Bind_table_graph'

// Concurrency limit: stay polite to the government server
const MAX_CONCURRENT = 4
const FETCH_TIMEOUT_MS = 20_000

// ---------------------------------------------------------------------------
// Encoding — replicates the page's encodeTxt(s, encN=1) JavaScript function.
// The function URL-escapes the input, shifts each char code by encN, then
// URL-escapes again and appends encN as a suffix.
// ---------------------------------------------------------------------------
function jsEscape(str) {
  return str.replace(/[^A-Za-z0-9@*_+\-./ ]/g, (c) => {
    const code = c.charCodeAt(0)
    if (code < 256) return '%' + code.toString(16).toUpperCase().padStart(2, '0')
    return '%u' + code.toString(16).toUpperCase().padStart(4, '0')
  })
}

function encodeTxt(s, encN = 1) {
  const escaped = jsEscape(s)
  const shifted = String.fromCharCode(...[...escaped].map((c) => c.charCodeAt(0) + encN))
  return jsEscape(shifted) + encN
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

/** @typedef {{ Name: string, Total: string, Value: string, HCPWS_01042019: string, KeyValue: string, KeyId: string }} ApiRow */

/**
 * @param {string} stCode11Encoded  Already-encoded StCode11 value
 * @returns {Promise<ApiRow[]>}
 */
async function callAPI(stCode11Encoded) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://ejalshakti.gov.in/jjmreport/JJMIndia.aspx',
        'User-Agent':
          'Mozilla/5.0 (compatible; JJM-DataSync/1.0; +https://github.com/)',
      },
      body: JSON.stringify({
        StCode11: stCode11Encoded,
        Cat: encodeTxt('0'),
        SubCat: encodeTxt('0'),
        Param: encodeTxt('0'),
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)

    const json = await res.json()
    return json.d ?? []
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Concurrency helper — run tasks in parallel capped at maxConcurrent
// ---------------------------------------------------------------------------
async function runWithConcurrency(tasks, maxConcurrent) {
  const results = []
  const queue = [...tasks]
  const running = new Set()

  await new Promise((resolve, reject) => {
    function runNext() {
      while (running.size < maxConcurrent && queue.length > 0) {
        const task = queue.shift()
        const p = task()
          .then((r) => {
            results.push(r)
            running.delete(p)
            if (queue.length === 0 && running.size === 0) resolve(results)
            else runNext()
          })
          .catch(reject)
        running.add(p)
      }
    }
    runNext()
  })

  return results
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function serializeCSV(rows) {
  const lines = rows.map(
    (r) =>
      `${r.state},${r.district},${r.totalHouseholds},${r.connections2019},${r.connections2020},${r.connections2021},${r.connectionsCurrent}`
  )
  return [HEADER, ...lines].join('\n') + '\n'
}

/**
 * Build a real cumulative time-series from the API's annual-increment fields,
 * enforcing monotonic non-decreasing values capped at the household total.
 */
function buildSnapshots(apiRow, total) {
  const base = parseInt(apiRow.HCPWS_01042019, 10) || 0
  const add1920 = parseInt(apiRow.HCPWS_19_20, 10) || 0
  const add2021 = parseInt(apiRow.HCPWS_20_21, 10) || 0
  const current = parseInt(apiRow.Value, 10) || 0

  const cap = (v) => Math.min(Math.max(0, v), total)
  const c2019 = cap(base)
  const c2020 = cap(Math.max(c2019, base + add1920))
  const c2021 = cap(Math.max(c2020, base + add1920 + add2021))
  const cCurrent = cap(Math.max(c2021, current))
  return { c2019, c2020, c2021, cCurrent }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[sync] Starting — ${new Date().toISOString()}`)

  // Step 1: Fetch all states
  console.log('[sync] Fetching state list from ejalshakti.gov.in…')
  const stateRows = await callAPI(encodeTxt('0'))
  console.log(`[sync] Got ${stateRows.length} states/UTs`)

  // Step 2: Fetch districts for each state, concurrency-capped
  console.log(`[sync] Fetching district data (max ${MAX_CONCURRENT} concurrent)…`)

  const tasks = stateRows.map((state) => async () => {
    const encoded = encodeTxt(String(state.KeyValue).trim())
    try {
      const districts = await callAPI(encoded)
      return { state, districts }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.warn(`  [warn] ${state.Name}: district fetch failed (${reason}) — using state-level row`)
      return { state, districts: [] }
    }
  })

  const stateResults = await runWithConcurrency(tasks, MAX_CONCURRENT)

  // Step 3: Compile CSV rows
  const csvRows = []
  let districtCount = 0
  let fallbackCount = 0

  for (const { state, districts } of stateResults) {
    const stateName = state.Name.replace(/,/g, ' ').trim()

    if (districts.length > 0) {
      for (const d of districts) {
        const districtName = d.Name.replace(/,/g, ' ').trim()
        const total = parseInt(d.Total, 10) || 0
        if (!districtName || total === 0) continue

        const s = buildSnapshots(d, total)
        csvRows.push({
          state: stateName,
          district: districtName,
          totalHouseholds: total,
          connections2019: s.c2019,
          connections2020: s.c2020,
          connections2021: s.c2021,
          connectionsCurrent: s.cCurrent,
        })
        districtCount++
      }
    } else {
      // Small UTs or fetch failure: use state-level row, district = state name
      const total = parseInt(state.Total, 10) || 0
      const s = buildSnapshots(state, total)

      csvRows.push({
        state: stateName,
        district: stateName,
        totalHouseholds: total,
        connections2019: s.c2019,
        connections2020: s.c2020,
        connections2021: s.c2021,
        connectionsCurrent: s.cCurrent,
      })
      fallbackCount++
    }
  }

  // Sort: state asc, district asc
  csvRows.sort((a, b) =>
    a.state !== b.state
      ? a.state.localeCompare(b.state)
      : a.district.localeCompare(b.district)
  )

  // Step 4: Write CSV
  const output = serializeCSV(csvRows)
  fs.writeFileSync(CSV_PATH, output, 'utf8')
  fs.writeFileSync(PUBLIC_CSV_PATH, output, 'utf8')

  console.log(`[sync] Done — ${new Date().toISOString()}`)
  console.log(`[sync] ${csvRows.length} rows (${districtCount} districts + ${fallbackCount} state-level fallbacks)`)
  console.log(`[sync] Written to ${CSV_PATH}`)
  console.log(`[sync] Mirrored to ${PUBLIC_CSV_PATH}`)
}

main().catch((err) => {
  console.error('[sync] Fatal:', err.message ?? err)
  process.exit(1)
})
