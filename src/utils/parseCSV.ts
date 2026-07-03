import Papa from 'papaparse'
import type { DistrictRecord } from '../types'

interface RawRow {
  State: string
  District: string
  Total_Households: string
  Connections_2019: string
  Connections_2020: string
  Connections_2021: string
  Connections_Current: string
}

export async function fetchDistrictData(): Promise<DistrictRecord[]> {
  const response = await fetch('/jal_data.csv')
  const text = await response.text()

  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const records: DistrictRecord[] = results.data.map((row) => ({
          state: row.State.trim(),
          district: row.District.trim(),
          totalHouseholds: parseInt(row.Total_Households, 10),
          connections2019: parseInt(row.Connections_2019, 10),
          connections2020: parseInt(row.Connections_2020, 10),
          connections2021: parseInt(row.Connections_2021, 10),
          connectionsCurrent: parseInt(row.Connections_Current, 10),
        }))
        resolve(records)
      },
      error: reject,
    })
  })
}
