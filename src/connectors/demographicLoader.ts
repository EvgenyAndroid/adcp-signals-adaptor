// src/connectors/demographicLoader.ts
// Parses the demographics CSV into normalized intermediate records.

import type { DemographicRecord } from "../types/signal";

/**
 * Parse demographics CSV string into DemographicRecord array.
 */
export function parseDemographicsCsv(csv: string): DemographicRecord[] {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = (lines[0] ?? "").split(",").map((h) => h.trim());

  const col = (row: string[], name: string): string => {
    const idx = header.indexOf(name);
    return idx >= 0 ? (row[idx]?.trim() ?? "") : "";
  };

  const records: DemographicRecord[] = [];

  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const count = parseInt(col(cols, "estimated_count"), 10);
    if (isNaN(count)) continue;

    records.push({
      ageBand: col(cols, "age_band"),
      incomeBand: col(cols, "income_band"),
      education: col(cols, "education"),
      householdType: col(cols, "household_type"),
      region: col(cols, "region"),
      metroTier: col(cols, "metro_tier"),
      estimatedCount: count,
    });
  }

  return records;
}

/**
 * Aggregate records by a dimension and return bucket totals.
 */
export function aggregateByDimension(
  records: DemographicRecord[],
  dimension: keyof DemographicRecord
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const rec of records) {
    const key = String(rec[dimension]);
    totals.set(key, (totals.get(key) ?? 0) + rec.estimatedCount);
  }
  return totals;
}
