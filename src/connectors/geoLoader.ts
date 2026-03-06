// src/connectors/geoLoader.ts

import type { GeoRecord } from "../types/signal";

export function parseGeoCsv(csv: string): GeoRecord[] {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = (lines[0] ?? "").split(",").map((h) => h.trim());

  const col = (row: string[], name: string): string => {
    const idx = header.indexOf(name);
    return idx >= 0 ? (row[idx]?.trim() ?? "") : "";
  };

  const records: GeoRecord[] = [];

  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const pop = parseInt(col(cols, "estimated_population"), 10);
    if (isNaN(pop)) continue;

    const tier = col(cols, "metro_tier") as GeoRecord["metroTier"];

    records.push({
      city: col(cols, "city"),
      state: col(cols, "state"),
      metroTier: tier,
      region: col(cols, "region"),
      estimatedPopulation: pop,
    });
  }

  return records;
}

/**
 * Get total population by metro tier.
 */
export function populationByTier(
  records: GeoRecord[]
): Map<GeoRecord["metroTier"], number> {
  const totals = new Map<GeoRecord["metroTier"], number>();
  for (const rec of records) {
    totals.set(rec.metroTier, (totals.get(rec.metroTier) ?? 0) + rec.estimatedPopulation);
  }
  return totals;
}
