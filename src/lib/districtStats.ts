import type { EnrichedDistrict } from '../types'

export interface Peer {
  d: EnrichedDistrict
  /** Signed coverage delta vs the focus district (peer − focus), in points. */
  coverageDeltaPts: number
}

export interface DistrictStats {
  /** 1-based rank by current coverage (1 = best) and the pool size. */
  coverageRankNational: number
  coveragePoolNational: number
  coverageRankState: number
  coveragePoolState: number
  /** 1-based rank by absolute unconnected households (1 = largest backlog). */
  backlogRankNational: number
  /** Percentile (0–100) of current coverage nationally; 100 = top. */
  coveragePercentile: number
  /** Districts of the most similar population, nationally, for context. */
  peers: Peer[]
}

/**
 * Depth-on-demand analytics for one district: how it ranks against the nation
 * and its own state, plus a peer set of similarly-sized districts. Pure and
 * cheap enough to run per selection (n ≈ 750).
 */
export function computeDistrictStats(
  all: EnrichedDistrict[],
  focus: EnrichedDistrict,
  peerCount = 5
): DistrictStats {
  const byCoverageDesc = [...all].sort((a, b) => b.coverageCurrent - a.coverageCurrent)
  const coverageRankNational = byCoverageDesc.findIndex((d) => d.id === focus.id) + 1

  const byBacklogDesc = [...all].sort((a, b) => b.householdsRemaining - a.householdsRemaining)
  const backlogRankNational = byBacklogDesc.findIndex((d) => d.id === focus.id) + 1

  const inState = all.filter((d) => d.state === focus.state)
  const stateByCoverage = [...inState].sort((a, b) => b.coverageCurrent - a.coverageCurrent)
  const coverageRankState = stateByCoverage.findIndex((d) => d.id === focus.id) + 1

  const coveragePercentile =
    all.length > 1 ? ((all.length - coverageRankNational) / (all.length - 1)) * 100 : 100

  const peers: Peer[] = all
    .filter((d) => d.id !== focus.id)
    .map((d) => ({ d, dist: Math.abs(d.totalHouseholds - focus.totalHouseholds) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, peerCount)
    .map(({ d }) => ({
      d,
      coverageDeltaPts: (d.coverageCurrent - focus.coverageCurrent) * 100,
    }))

  return {
    coverageRankNational,
    coveragePoolNational: all.length,
    coverageRankState,
    coveragePoolState: inState.length,
    backlogRankNational,
    coveragePercentile,
    peers,
  }
}
