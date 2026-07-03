/**
 * Region grouping for the analytics bubble chart's color dimension.
 * Standard six-region grouping of Indian states/UTs; island UTs are folded
 * into South. Keyed by the exact `state` string used in the JJM CSV.
 */

export type Region = 'North' | 'South' | 'East' | 'West' | 'Central' | 'Northeast'

export const REGIONS: Region[] = ['North', 'South', 'East', 'West', 'Central', 'Northeast']

const STATE_REGION: Record<string, Region> = {
  // North
  'Jammu & Kashmir': 'North',
  Ladakh: 'North',
  'Himachal Pradesh': 'North',
  Punjab: 'North',
  Haryana: 'North',
  Uttarakhand: 'North',
  'Uttar Pradesh': 'North',
  Rajasthan: 'North',
  // South
  'Andhra Pradesh': 'South',
  Telangana: 'South',
  Karnataka: 'South',
  Kerala: 'South',
  'Tamil Nadu': 'South',
  Puducherry: 'South',
  Lakshadweep: 'South',
  'A & N Islands': 'South',
  // East
  Bihar: 'East',
  Jharkhand: 'East',
  Odisha: 'East',
  'West Bengal': 'East',
  // West
  Goa: 'West',
  Gujarat: 'West',
  Maharashtra: 'West',
  'D&NH and D&D': 'West',
  // Central
  'Madhya Pradesh': 'Central',
  Chhattisgarh: 'Central',
  // Northeast
  Assam: 'Northeast',
  'Arunachal Pradesh': 'Northeast',
  Manipur: 'Northeast',
  Meghalaya: 'Northeast',
  Mizoram: 'Northeast',
  Nagaland: 'Northeast',
  Tripura: 'Northeast',
  Sikkim: 'Northeast',
}

/** Region for a state; unknown states fall back to Central so nothing drops out. */
export function regionOf(state: string): Region {
  return STATE_REGION[state] ?? 'Central'
}

/**
 * Qualitative, colour-blind-considerate palette (distinct hue + lightness per
 * region) used to colour bubbles and the region legend.
 */
export const REGION_COLORS: Record<Region, string> = {
  North: '#6366f1', // indigo
  South: '#10b981', // emerald
  East: '#f59e0b', // amber
  West: '#ec4899', // pink
  Central: '#8b5cf6', // violet
  Northeast: '#06b6d4', // cyan
}
