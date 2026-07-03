/**
 * Geo-join layer.
 *
 * The India district TopoJSON (public/india-districts.json) is 2011-census
 * vintage (723 district polygons). Our JJM data is 2026-vintage (754 districts).
 * Names diverge through spelling, renames, and post-2011 district splits.
 *
 * This module normalises names and applies a curated alias map so a CSV row
 * can be matched to its polygon. Districts with no 2011 polygon (genuinely new
 * splits — e.g. much of Andhra Pradesh's 2022 reorganization) remain unmatched
 * by design and render as "no boundary data".
 */

/** Strip case, spaces, punctuation for fuzzy equality. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // drop parenthetical qualifiers
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * CSV district name → TopoJSON district name.
 * Only clean 1:1 renames / spelling variants that have a real polygon.
 * Keyed and valued by normalizeName() output.
 */
const DISTRICT_ALIASES: Record<string, string> = {
  // Andhra Pradesh
  ananthapuramu: 'anantapur',
  sripottisriramulunellore: 'spsnellore',
  ysr: 'ysrkadapa',
  // Assam
  marigaon: 'morigaon',
  kamrupmetro: 'kamrupmetropolitan',
  // Bihar
  pashchimchamparan: 'westchamparan',
  purbichamparan: 'eastchamparan',
  kaimurbhabua: 'kaimur',
  // Gujarat
  kachchh: 'kutch',
  mahesana: 'mehsana',
  panchmahals: 'panchmahal',
  chhotaudepur: 'chhotaudaipur',
  dangs: 'dang',
  arvalli: 'aravalli',
  // Haryana
  charkidadri: 'charkhidadri',
  // J&K
  poonch: 'punch',
  shopian: 'shopiyan',
  // Jharkhand
  eastsinghbum: 'eastsinghbhum',
  sahebganj: 'sahibganj',
  // Karnataka
  davangere: 'davanagere',
  // Ladakh
  lehladakh: 'leh',
  // Madhya Pradesh
  khandwaeastnimar: 'khandwa',
  khargonewestnimar: 'khargone',
  narmadapuram: 'hoshangabad',
  narsimhapur: 'narsinghpur',
  // Maharashtra
  chhatrapatisambhajinagar: 'aurangabad',
  dharashiv: 'osmanabad',
  // Odisha
  anugul: 'angul',
  baleshwar: 'balasore',
  jagatsinghapur: 'jagatsinghpur',
  jajapur: 'jajpur',
  nabarangpur: 'nabarangapur',
  sonepur: 'subarnapur',
  // Puducherry
  pondicherry: 'puducherry',
  // Tamil Nadu
  kanniyakumari: 'kanyakumari',
  thenilgiris: 'nilgiris',
  // Telangana
  hanumakonda: 'warangalurban',
  // Uttar Pradesh
  kheri: 'lakhimpurkheri',
  mahrajganj: 'maharajganj',
  // Uttarakhand
  udamsinghnagar: 'udhamsinghnagar',
  // A & N
  southandamans: 'southandaman',
}

/** State name normalisation (CSV → TopoJSON st_nm). */
const STATE_ALIASES: Record<string, string> = {
  anislands: 'andamannicobarislands',
  dnhanddd: 'dadranagarhavelianddamandiu',
  jammukashmir: 'jammukashmir',
}

export function canonicalDistrict(name: string): string {
  const n = normalizeName(name)
  return DISTRICT_ALIASES[n] ?? n
}

export function canonicalState(name: string): string {
  const n = normalizeName(name)
  return STATE_ALIASES[n] ?? n
}

/** Build the lookup key used to bind geometry ↔ data. */
export function joinKey(state: string, district: string): string {
  return `${canonicalState(state)}::${canonicalDistrict(district)}`
}

/** Loosened key (district only) for fallback when state names differ. */
export function districtKey(district: string): string {
  return canonicalDistrict(district)
}

/**
 * District names that occur in more than one state in the topojson.
 * For these, a district-only join is ambiguous and MUST be disambiguated
 * by state; for everything else, district-only is safe.
 */
const AMBIGUOUS_DISTRICTS = new Set([
  'aurangabad',
  'bilaspur',
  'balrampur',
  'hamirpur',
  'pratapgarh',
])

export interface DataIndex<T> {
  byFullKey: Map<string, T>
  byDistrict: Map<string, T[]>
}

/**
 * Index data rows for geo resolution. We keep both a full `state::district`
 * map and a district-only multimap so we can survive state-vintage drift
 * (e.g. the 2011 geometry filing Telangana districts under Andhra Pradesh).
 */
export function buildDataIndex<T extends { state: string; district: string }>(
  rows: T[]
): DataIndex<T> {
  const byFullKey = new Map<string, T>()
  const byDistrict = new Map<string, T[]>()
  for (const r of rows) {
    byFullKey.set(joinKey(r.state, r.district), r)
    const dk = canonicalDistrict(r.district)
    const arr = byDistrict.get(dk)
    if (arr) arr.push(r)
    else byDistrict.set(dk, [r])
  }
  return { byFullKey, byDistrict }
}

/**
 * Resolve a topojson polygon (state + district) to its data row.
 * 1. Exact state::district match.
 * 2. District-only match when the name is unambiguous (single candidate,
 *    and not in the cross-state collision set).
 */
export function resolveGeo<T extends { state: string; district: string }>(
  index: DataIndex<T>,
  geoState: string,
  geoDistrict: string
): T | undefined {
  const exact = index.byFullKey.get(joinKey(geoState, geoDistrict))
  if (exact) return exact

  const dk = canonicalDistrict(geoDistrict)
  const candidates = index.byDistrict.get(dk)
  if (!candidates || candidates.length === 0) return undefined
  if (candidates.length === 1 && !AMBIGUOUS_DISTRICTS.has(dk)) return candidates[0]

  // Ambiguous → require state agreement
  return candidates.find((c) => canonicalState(c.state) === canonicalState(geoState))
}
