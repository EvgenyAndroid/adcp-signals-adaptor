// src/connectors/dmaLoader.ts
// Parses Nielsen DMA (Designated Market Area) data.
// DMA codes are public Nielsen designations used throughout the US advertising industry.

export interface DmaRecord {
  dmaCode: number;        // Nielsen DMA code (e.g., 501 = New York)
  dmaName: string;        // Full DMA name
  rank: number;           // Nielsen market rank by TV households
  tvHouseholds: number;   // Nielsen TV household estimate
  percentUS: number;      // % of total US TV households
  states: string[];       // State abbreviations covered
  region: string;         // northeast | midwest | south | west
  metroTier: string;      // top_10 | top_25 | top_50 | top_100 | other
}

/**
 * Parse DMA CSV into records.
 * CSV header: dma_code,dma_name,rank,tv_households,percent_us,states,region,metro_tier
 */
export function parseDmaCsv(csv: string): DmaRecord[] {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = (lines[0] ?? "").split(",").map((h) => h.trim());
  const col = (row: string[], name: string): string => {
    const idx = header.indexOf(name);
    return idx >= 0 ? (row[idx]?.trim() ?? "") : "";
  };

  const records: DmaRecord[] = [];

  for (const line of lines.slice(1)) {
    // Handle quoted fields (states list may contain commas)
    const cols = parseCSVLine(line);
    const households = parseInt(col(cols, "tv_households"), 10);
    const rank = parseInt(col(cols, "rank"), 10);
    if (isNaN(households) || isNaN(rank)) continue;

    const statesRaw = col(cols, "states");
    const states = statesRaw
      .replace(/^"|"$/g, "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);

    records.push({
      dmaCode: parseInt(col(cols, "dma_code"), 10),
      dmaName: col(cols, "dma_name"),
      rank,
      tvHouseholds: households,
      percentUS: parseFloat(col(cols, "percent_us")) || 0,
      states,
      region: col(cols, "region"),
      metroTier: col(cols, "metro_tier"),
    });
  }

  return records;
}

/**
 * Get DMA records by metro tier.
 */
export function getDmasByTier(
  records: DmaRecord[],
  tier: string
): DmaRecord[] {
  return records.filter((r) => r.metroTier === tier);
}

/**
 * Get total TV households by metro tier.
 */
export function householdsByTier(
  records: DmaRecord[]
): Map<string, { households: number; dmaCount: number }> {
  const result = new Map<string, { households: number; dmaCount: number }>();

  for (const rec of records) {
    const existing = result.get(rec.metroTier) ?? { households: 0, dmaCount: 0 };
    result.set(rec.metroTier, {
      households: existing.households + rec.tvHouseholds,
      dmaCount: existing.dmaCount + 1,
    });
  }

  return result;
}

/**
 * Build DMA-qualified signal names for a given tier.
 */
export function buildDmaTierDescription(
  records: DmaRecord[],
  tier: string
): string {
  const dmas = getDmasByTier(records, tier).slice(0, 5);
  const names = dmas.map((d) => d.dmaName);
  const totalHH = dmas.reduce((sum, d) => sum + d.tvHouseholds, 0);

  if (names.length === 0) return `${tier} DMA markets`;

  const nameList =
    names.length <= 3
      ? names.join(", ")
      : `${names.slice(0, 3).join(", ")} and others`;

  return `${nameList} — ${(totalHH / 1_000_000).toFixed(1)}M+ TV households`;
}

// Simple CSV parser that handles quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
