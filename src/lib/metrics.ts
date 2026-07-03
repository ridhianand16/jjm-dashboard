import type { DistrictRecord, EnrichedDistrict } from '../types'

/**
 * Months elapsed from the JJM baseline (15 Aug 2019) to "now".
 * Fixed constant so velocity is deterministic and reproducible in tests/CI.
 * ~Aug 2019 → Jul 2026 ≈ 83 months.
 */
const BASELINE = new Date('2019-08-15T00:00:00Z')
export const MONTHS_ELAPSED = Math.max(
  1,
  Math.round((Date.now() - BASELINE.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
)

const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v))
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0)

/**
 * Enrich raw records with derived analytics. Two-pass: the first pass computes
 * per-row primitives and dataset-wide extents; the second normalises the radar
 * axes (0–100) against those extents. O(n) overall.
 */
export function enrichDistricts(records: DistrictRecord[]): EnrichedDistrict[] {
  // ---- Pass 1: primitives + extents -------------------------------------
  interface Primitive {
    rec: DistrictRecord
    coverage2019: number
    coverageCurrent: number
    householdsRemaining: number
    connectionsAdded: number
    velocityAbs: number
    velocityPct: number
    gapClosed: number // fraction of the 2019 gap now closed
    baselineDeficit: number // 1 - coverage2019 (poverty/need proxy)
    logPop: number
  }

  let maxVelocityPct = 0
  let maxLogPop = 0

  const primitives: Primitive[] = records.map((rec) => {
    const coverage2019 = safeDiv(rec.connections2019, rec.totalHouseholds)
    const coverageCurrent = safeDiv(rec.connectionsCurrent, rec.totalHouseholds)
    const householdsRemaining = Math.max(0, rec.totalHouseholds - rec.connectionsCurrent)
    const connectionsAdded = rec.connectionsCurrent - rec.connections2019

    const velocityAbs = connectionsAdded / MONTHS_ELAPSED
    const velocityPct = ((coverageCurrent - coverage2019) * 100) / MONTHS_ELAPSED

    const baselineGap = rec.totalHouseholds - rec.connections2019
    const gapClosed = clamp(safeDiv(connectionsAdded, baselineGap), 0, 1)
    const baselineDeficit = 1 - coverage2019
    const logPop = Math.log10(Math.max(10, rec.totalHouseholds))

    if (velocityPct > maxVelocityPct) maxVelocityPct = velocityPct
    if (logPop > maxLogPop) maxLogPop = logPop

    return {
      rec,
      coverage2019,
      coverageCurrent,
      householdsRemaining,
      connectionsAdded,
      velocityAbs,
      velocityPct,
      gapClosed,
      baselineDeficit,
      logPop,
    }
  })

  // ---- Pass 2: synthetic scores + normalised radar ----------------------
  return primitives.map((p) => {
    // Efficiency: closing a large baseline deficit quickly scores highest.
    // gapClosed is the backbone; a starting-behind district gets a bonus.
    const efficiencyScore = clamp(
      p.gapClosed * (0.55 + 0.45 * p.baselineDeficit) * 100
    )

    const radar = {
      rolloutSpeed: clamp((p.velocityPct / (maxVelocityPct || 1)) * 100),
      infraDensity: clamp(p.coverageCurrent * 100),
      populationScale: clamp((p.logPop / (maxLogPop || 1)) * 100),
      // Sustainability: near-completion + gap-closing consistency.
      sustainability: clamp((p.coverageCurrent * 0.7 + p.gapClosed * 0.3) * 100),
    }

    return {
      ...p.rec,
      id: `${p.rec.state}::${p.rec.district}`,
      coverage2019: p.coverage2019,
      coverageCurrent: p.coverageCurrent,
      householdsRemaining: p.householdsRemaining,
      connectionsAdded: p.connectionsAdded,
      velocityAbs: p.velocityAbs,
      velocityPct: p.velocityPct,
      efficiencyScore,
      radar,
    }
  })
}

/** Aggregate KPIs for the hero bar. */
export function computeAggregates(rows: EnrichedDistrict[]) {
  const totalHouseholds = rows.reduce((s, r) => s + r.totalHouseholds, 0)
  const totalCurrent = rows.reduce((s, r) => s + r.connectionsCurrent, 0)
  const total2019 = rows.reduce((s, r) => s + r.connections2019, 0)
  const totalRemaining = rows.reduce((s, r) => s + r.householdsRemaining, 0)
  const coverage = safeDiv(totalCurrent, totalHouseholds)
  const coverage2019 = safeDiv(total2019, totalHouseholds)
  const avgEfficiency = rows.length
    ? rows.reduce((s, r) => s + r.efficiencyScore, 0) / rows.length
    : 0

  return {
    districts: rows.length,
    totalHouseholds,
    totalCurrent,
    totalRemaining,
    coverage,
    coverage2019,
    coverageGain: coverage - coverage2019,
    avgEfficiency,
  }
}
