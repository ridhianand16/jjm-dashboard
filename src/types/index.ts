/** Raw record as parsed from the CSV. Connections are real annual snapshots. */
export interface DistrictRecord {
  state: string
  district: string
  totalHouseholds: number
  connections2019: number
  connections2020: number
  connections2021: number
  connectionsCurrent: number
}

/**
 * A real reported snapshot on the rollout timeline. `t` is the normalized
 * position in [0,1] over the 2019→present span; `real` distinguishes
 * government-reported points from the interpolated tail (2021→present).
 */
export interface Snapshot {
  year: number
  t: number
  connections: number
  real: boolean
}

/**
 * A district enriched with derived analytics. Radar axes are normalised
 * (0–100) against the whole dataset, so they require a two-pass computation.
 */
export interface EnrichedDistrict extends DistrictRecord {
  /** Stable unique id — `${state}::${district}`. */
  id: string
  coverage2019: number // 0..1
  coverageCurrent: number // 0..1
  householdsRemaining: number
  connectionsAdded: number
  /** Absolute connections added per month since the 2019 baseline. */
  velocityAbs: number
  /** Percentage-points of coverage gained per month. */
  velocityPct: number
  /** 0–100 synthetic score: rewards closing a large baseline deficit fast. */
  efficiencyScore: number
  /** Normalised 0–100 radar axes. */
  radar: {
    rolloutSpeed: number
    infraDensity: number
    populationScale: number
    sustainability: number
  }
}

export type MetricMode = 'absolute' | 'relative'

export type SortKey =
  | 'district'
  | 'state'
  | 'totalHouseholds'
  | 'coverage2019'
  | 'coverageCurrent'
  | 'velocity'
  | 'efficiencyScore'
  | 'householdsRemaining'

export type SortDir = 'asc' | 'desc'
