import type { EnrichedDistrict } from '../types'

export type InsightCategory = 'backlog' | 'fastest' | 'stalled' | 'giants'

export interface InsightItem {
  districtId: string
  district: string
  state: string
  value: string // preformatted headline metric
}

export interface InsightGroup {
  category: InsightCategory
  title: string
  hint: string
  items: InsightItem[]
}

const TARGET = 0.9

/**
 * Derive ranked, decision-oriented findings from the current scope.
 * Pure function over enriched districts — no side effects, memo-friendly.
 */
export function computeInsights(districts: EnrichedDistrict[], topN = 4): InsightGroup[] {
  if (districts.length === 0) return []

  // Highest backlog — absolute unconnected households now.
  const backlog = [...districts]
    .sort((a, b) => b.householdsRemaining - a.householdsRemaining)
    .slice(0, topN)
    .map((d) => item(d, `${compact(d.householdsRemaining)} left`))

  // Fastest closing — most households connected since 2019.
  const fastest = [...districts]
    .map((d) => ({ d, gain: d.connectionsCurrent - d.connections2019 }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, topN)
    .map(({ d, gain }) => item(d, `+${compact(gain)} since ’19`))

  // Stalled — below target and closed <5% of the post-2021 remaining gap.
  const stalled = districts
    .filter((d) => {
      const remaining2021 = d.totalHouseholds - d.connections2021
      if (remaining2021 <= 0) return false
      const recent = (d.connectionsCurrent - d.connections2021) / remaining2021
      return d.coverageCurrent < TARGET && recent < 0.05
    })
    .sort((a, b) => a.coverageCurrent - b.coverageCurrent)
    .slice(0, topN)
    .map((d) => item(d, `${pct(d.coverageCurrent)} · stalled`))

  // Underserved giants — high population × low coverage (backlog concentration).
  const giants = districts
    .filter((d) => d.coverageCurrent < TARGET)
    .map((d) => ({ d, weight: d.totalHouseholds * (1 - d.coverageCurrent) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN)
    .map(({ d }) => item(d, `${compact(d.totalHouseholds)} HH · ${pct(d.coverageCurrent)}`))

  const groups: InsightGroup[] = [
    { category: 'backlog', title: 'Highest Backlog', hint: 'Most households still unconnected', items: backlog },
    { category: 'fastest', title: 'Fastest Closing', hint: 'Most connections added since 2019', items: fastest },
    { category: 'giants', title: 'Underserved Giants', hint: 'Large populations below 90%', items: giants },
    { category: 'stalled', title: 'Stalled Progress', hint: 'Sub-90% with little movement since 2021', items: stalled },
  ]
  return groups.filter((g) => g.items.length > 0)
}

function item(d: EnrichedDistrict, value: string): InsightItem {
  return { districtId: d.id, district: d.district, state: d.state, value }
}
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return `${Math.round(n)}`
}
function pct(f: number): string {
  return `${(f * 100).toFixed(1)}%`
}
