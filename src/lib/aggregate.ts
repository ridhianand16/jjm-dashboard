import type { DistrictRecord, EnrichedDistrict } from '../types'
import { coverageAtT, unconnectedAtT } from './timeseries'

/**
 * A state rolled up from its districts. Shares the `DistrictRecord` shape
 * (summed connection snapshots + households) so all the time-series helpers
 * — coverageAtT, unconnectedAtT — work on it unchanged.
 */
export interface StateAggregate extends DistrictRecord {
  id: string
  districtCount: number
  /** Districts below the 90% target at present. */
  laggingCount: number
  /** Coverage fraction at present. */
  coverageNow: number
  /** Coverage fraction at 2019 baseline. */
  coverage2019: number
  /** Absolute households connected since 2019. */
  gapClosed: number
}

const TARGET = 0.9

/** Roll districts up to state aggregates. */
export function aggregateByState(districts: EnrichedDistrict[]): StateAggregate[] {
  const byState = new Map<string, EnrichedDistrict[]>()
  for (const d of districts) {
    const arr = byState.get(d.state)
    if (arr) arr.push(d)
    else byState.set(d.state, [d])
  }

  const out: StateAggregate[] = []
  for (const [state, rows] of byState) {
    const sum = (f: (d: EnrichedDistrict) => number) => rows.reduce((s, d) => s + f(d), 0)
    const totalHouseholds = sum((d) => d.totalHouseholds)
    const connections2019 = sum((d) => d.connections2019)
    const connections2020 = sum((d) => d.connections2020)
    const connections2021 = sum((d) => d.connections2021)
    const connectionsCurrent = sum((d) => d.connectionsCurrent)
    const coverageNow = totalHouseholds > 0 ? connectionsCurrent / totalHouseholds : 0
    const coverage2019 = totalHouseholds > 0 ? connections2019 / totalHouseholds : 0

    out.push({
      id: `state::${state}`,
      state,
      district: state,
      totalHouseholds,
      connections2019,
      connections2020,
      connections2021,
      connectionsCurrent,
      districtCount: rows.length,
      laggingCount: rows.filter((d) => d.coverageCurrent < TARGET).length,
      coverageNow,
      coverage2019,
      gapClosed: connectionsCurrent - connections2019,
    })
  }
  return out
}

/** Aggregate value at a timeline position — convenience wrappers. */
export function stateCoverageAt(agg: StateAggregate, t: number): number {
  return coverageAtT(agg, t)
}
export function stateBacklogAt(agg: StateAggregate, t: number): number {
  return unconnectedAtT(agg, t)
}
