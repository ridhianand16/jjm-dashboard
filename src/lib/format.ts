/** Formatting helpers shared across the command center. */

/** Compact Indian-style number: 12,34,567. */
export function formatIndian(n: number): string {
  return Math.round(n).toLocaleString('en-IN')
}

/** Abbreviated form for tight spaces: 1.2M, 45.3K. */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${Math.round(n)}`
}

/** Percentage with fixed precision. */
export function formatPct(fraction0to1: number, digits = 1): string {
  return `${(fraction0to1 * 100).toFixed(digits)}%`
}

/** Signed number for deltas / velocity. */
export function formatSigned(n: number, digits = 2): string {
  const v = n.toFixed(digits)
  return n > 0 ? `+${v}` : v
}
