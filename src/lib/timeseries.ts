import type { DistrictRecord, Snapshot } from '../types'

/**
 * Timeline model. We have four real government-reported cumulative snapshots:
 * 2019, 2020, 2021 (annual) and the latest total ("present"). The timeline
 * axis spans 2019 → present; values between knots are linearly interpolated.
 *
 * The 2021 → present interval is a multi-year gap with no intermediate
 * reported points, so anything scrubbed inside it is *modeled*, not observed.
 * `isInterpolated(t)` flags that region for honest UI labelling.
 */
export const BASELINE_YEAR = 2019
export const PRESENT_YEAR = 2026
export const SPAN = PRESENT_YEAR - BASELINE_YEAR

/** Years with real reported data (present maps to PRESENT_YEAR on the axis). */
export const SNAPSHOT_YEARS = [2019, 2020, 2021, PRESENT_YEAR] as const

/** Last real annual snapshot before the long modeled tail. */
export const LAST_REAL_YEAR = 2021
export const LAST_REAL_T = (LAST_REAL_YEAR - BASELINE_YEAR) / SPAN

export function yearToT(year: number): number {
  return (year - BASELINE_YEAR) / SPAN
}

/** True when position `t` falls in the modeled 2021→present gap. */
export function isInterpolated(t: number): boolean {
  return t > LAST_REAL_T + 1e-9
}

/** Ordered (t, connections) knots for a record. */
export function buildSnapshots(rec: DistrictRecord): Snapshot[] {
  const values = [
    rec.connections2019,
    rec.connections2020,
    rec.connections2021,
    rec.connectionsCurrent,
  ]
  return SNAPSHOT_YEARS.map((year, i) => ({
    year,
    t: yearToT(year),
    connections: values[i],
    real: true,
  }))
}

/** Piecewise-linear cumulative connections at timeline position `t` (0..1). */
export function connectionsAtT(rec: DistrictRecord, t: number): number {
  const knots = buildSnapshots(rec)
  if (t <= knots[0].t) return knots[0].connections
  const last = knots[knots.length - 1]
  if (t >= last.t) return last.connections
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1]
    const b = knots[i]
    if (t <= b.t) {
      const frac = (t - a.t) / (b.t - a.t)
      return a.connections + frac * (b.connections - a.connections)
    }
  }
  return last.connections
}

export function coverageAtT(rec: DistrictRecord, t: number): number {
  if (rec.totalHouseholds <= 0) return 0
  return connectionsAtT(rec, t) / rec.totalHouseholds
}

export function unconnectedAtT(rec: DistrictRecord, t: number): number {
  return Math.max(0, rec.totalHouseholds - connectionsAtT(rec, t))
}
