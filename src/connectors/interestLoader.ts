// src/connectors/interestLoader.ts
// Parses the interest/entertainment affinity CSV.
// Derived from MovieLens genre taxonomy structure - no real user data.

import type { InterestRecord } from "../types/signal";

export function parseInterestsCsv(csv: string): InterestRecord[] {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = (lines[0] ?? "").split(",").map((h) => h.trim());

  const col = (row: string[], name: string): string => {
    const idx = header.indexOf(name);
    return idx >= 0 ? (row[idx]?.trim() ?? "") : "";
  };

  const records: InterestRecord[] = [];

  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const affinity = parseFloat(col(cols, "affinity_score"));
    const count = parseInt(col(cols, "estimated_count"), 10);
    if (isNaN(affinity) || isNaN(count)) continue;

    records.push({
      genre: col(cols, "genre"),
      affinityScore: affinity,
      ageBand: col(cols, "age_band"),
      incomeBand: col(cols, "income_band"),
      metroTier: col(cols, "metro_tier"),
      estimatedCount: count,
    });
  }

  return records;
}

/**
 * Get unique genres with their average affinity score.
 */
export function getGenreSummary(
  records: InterestRecord[]
): Array<{ genre: string; avgAffinity: number; totalCount: number }> {
  const byGenre = new Map<string, { total: number; count: number; totalPop: number }>();

  for (const rec of records) {
    const existing = byGenre.get(rec.genre) ?? { total: 0, count: 0, totalPop: 0 };
    byGenre.set(rec.genre, {
      total: existing.total + rec.affinityScore,
      count: existing.count + 1,
      totalPop: existing.totalPop + rec.estimatedCount,
    });
  }

  return [...byGenre.entries()].map(([genre, d]) => ({
    genre,
    avgAffinity: d.total / d.count,
    totalCount: d.totalPop,
  }));
}
