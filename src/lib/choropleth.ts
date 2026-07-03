import { scaleSqrt } from 'd3-scale'
import { interpolateInferno } from 'd3-scale-chromatic'
import { coverageAtT, unconnectedAtT } from './timeseries'
import type { DistrictRecord } from '../types'

/** Fill for districts with no matching polygon / no data. */
export const NO_DATA_FILL = '#18181b' // zinc-900
export const NO_DATA_STROKE = '#3f3f46' // zinc-700

/**
 * Unconnected households at timeline position `t`, using the real piecewise
 * snapshot series (2019/2020/2021/present) rather than a 2-point line.
 */
export function unconnectedAt(rec: DistrictRecord, t: number): number {
  return unconnectedAtT(rec, t)
}

/** Coverage fraction (0..1) at timeline position `t`. */
export function coverageAt(rec: DistrictRecord, t: number): number {
  return coverageAtT(rec, t)
}

/**
 * Urgency color ramp. Low unconnected → dark/cool, high → hot yellow.
 * Sqrt scaling spreads the long tail of very large districts. The lower
 * bound (0.12) keeps low-value districts visible on the dark canvas rather
 * than fading fully to black.
 *
 * `interpolateInferno` is a perceptually-uniform, colour-blind-safe ramp
 * (monotonic in lightness) — encoding is read via brightness, so it survives
 * deuteranopia/protanopia/tritanopia and greyscale printing.
 */
export function makeColorScale(maxUnconnected: number) {
  const s = scaleSqrt().domain([0, Math.max(1, maxUnconnected)]).range([0, 1]).clamp(true)
  return (value: number) => interpolateInferno(0.12 + 0.85 * s(value))
}

/** Discrete legend stops (value → swatch color) for the map legend. */
export function legendStops(maxUnconnected: number, steps = 5) {
  const color = makeColorScale(maxUnconnected)
  return Array.from({ length: steps }, (_, i) => {
    const frac = i / (steps - 1)
    const value = frac * frac * maxUnconnected // inverse-sqrt spacing to mirror scale
    return { value, color: color(value) }
  })
}
