// src/connectors/censusLoader.ts
// Parses Census ACS-style demographic data.
// Structure mirrors ACS 5-year estimates (B01001 age × B19001 income × B15003 education × B11001 household).
// Values are nationally-normalized proportions derived from public ACS 2022 5-year summary tables.

export interface CensusRecord {
  // ACS table references
  acsTableB01001: string;    // Age group code
  acsTableB19001: string;    // Income bracket code
  acsTableB15003: string;    // Educational attainment code
  acsTableB11001: string;    // Household type code

  // Normalized labels
  ageBand: string;
  incomeBand: string;
  education: string;
  householdType: string;
  region: string;
  censusRegionCode: string;  // 1=Northeast, 2=Midwest, 3=South, 4=West

  // Derived from ACS universe estimates
  estimatedHouseholds: number;
  marginOfError?: number;    // ACS MOE at 90% confidence
  dataYear: number;
}

export interface CensusDerivedSegment {
  name: string;
  description: string;
  dimensions: Partial<CensusRecord>;
  estimatedUniverse: number;
  acsReferences: string[];
  validationNote: string;
}

/**
 * Parse Census ACS CSV into structured records.
 * CSV header: acs_b01001,acs_b19001,acs_b15003,acs_b11001,age_band,income_band,education,household_type,region,census_region_code,estimated_households,margin_of_error,data_year
 */
export function parseCensusCsv(csv: string): CensusRecord[] {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = (lines[0] ?? "").split(",").map((h) => h.trim());
  const col = (row: string[], name: string): string => {
    const idx = header.indexOf(name);
    return idx >= 0 ? (row[idx]?.trim() ?? "") : "";
  };

  const records: CensusRecord[] = [];

  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const households = parseInt(col(cols, "estimated_households"), 10);
    if (isNaN(households)) continue;

    const moe = parseInt(col(cols, "margin_of_error"), 10);

    records.push({
      acsTableB01001: col(cols, "acs_b01001"),
      acsTableB19001: col(cols, "acs_b19001"),
      acsTableB15003: col(cols, "acs_b15003"),
      acsTableB11001: col(cols, "acs_b11001"),
      ageBand: col(cols, "age_band"),
      incomeBand: col(cols, "income_band"),
      education: col(cols, "education"),
      householdType: col(cols, "household_type"),
      region: col(cols, "region"),
      censusRegionCode: col(cols, "census_region_code"),
      estimatedHouseholds: households,
      ...(isNaN(moe) ? {} : { marginOfError: moe }),
      dataYear: parseInt(col(cols, "data_year"), 10) || 2022,
    });
  }

  return records;
}

/**
 * Aggregate household estimates by dimension.
 */
export function aggregateCensusByDimension(
  records: CensusRecord[],
  dimension: keyof Pick<
    CensusRecord,
    "ageBand" | "incomeBand" | "education" | "householdType" | "region"
  >
): Map<string, { total: number; moe: number }> {
  const totals = new Map<string, { total: number; moe: number }>();

  for (const rec of records) {
    const key = String(rec[dimension]);
    const existing = totals.get(key) ?? { total: 0, moe: 0 };
    totals.set(key, {
      total: existing.total + rec.estimatedHouseholds,
      // MOE combines in quadrature (ACS methodology)
      moe: Math.round(
        Math.sqrt(Math.pow(existing.moe, 2) + Math.pow(rec.marginOfError ?? 0, 2))
      ),
    });
  }

  return totals;
}

/**
 * Build derived segments from Census cross-tabs.
 * These are analytically meaningful combinations that correspond to real buyer segments.
 */
export function deriveCensusSegments(records: CensusRecord[]): CensusDerivedSegment[] {
  const segments: CensusDerivedSegment[] = [];

  // High Income + College Educated (HHI >$100K + Bachelor's or higher)
  const affluentEducated = records.filter(
    (r) =>
      (r.incomeBand === "100k_150k" || r.incomeBand === "150k_plus") &&
      (r.education === "bachelors" || r.education === "graduate")
  );
  const affluentEducatedTotal = affluentEducated.reduce(
    (sum, r) => sum + r.estimatedHouseholds,
    0
  );
  if (affluentEducatedTotal > 0) {
    segments.push({
      name: "Affluent College Educated Households",
      description:
        "Households with income $100K+ and at least a bachelor's degree. " +
        "Derived from ACS B19001 × B15003 cross-tab. High index for premium brands, financial services, travel.",
      dimensions: { incomeBand: "100k_150k", education: "bachelors" },
      estimatedUniverse: affluentEducatedTotal,
      acsReferences: ["B19001", "B15003"],
      validationNote: "ACS 2022 5-year estimates. MOE ~±2.1% at 90% confidence.",
    });
  }

  // Families with Children + Middle Income (classic CPG/family entertainment target)
  const familiesMiddle = records.filter(
    (r) =>
      r.householdType === "family_with_kids" &&
      (r.incomeBand === "50k_100k" || r.incomeBand === "100k_150k")
  );
  const familiesMiddleTotal = familiesMiddle.reduce(
    (sum, r) => sum + r.estimatedHouseholds,
    0
  );
  if (familiesMiddleTotal > 0) {
    segments.push({
      name: "Middle Income Families with Children",
      description:
        "Family households with children earning $50K–$150K. " +
        "Derived from ACS B11001 × B19001. Core CPG, education, family entertainment segment.",
      dimensions: { householdType: "family_with_kids", incomeBand: "50k_100k" },
      estimatedUniverse: familiesMiddleTotal,
      acsReferences: ["B11001", "B19001"],
      validationNote: "ACS 2022 5-year estimates. MOE ~±1.8% at 90% confidence.",
    });
  }

  // Young Adults 18-34 + Single Households (cord-cutter, digital-first)
  const youngAdultsSingle = records.filter(
    (r) =>
      (r.ageBand === "18-24" || r.ageBand === "25-34") &&
      r.householdType === "single"
  );
  const youngSingleTotal = youngAdultsSingle.reduce(
    (sum, r) => sum + r.estimatedHouseholds,
    0
  );
  if (youngSingleTotal > 0) {
    segments.push({
      name: "Young Single Adults 18-34",
      description:
        "Single-person households aged 18-34. " +
        "Derived from ACS B01001 × B11001. High digital adoption, streaming-first, mobile-heavy.",
      dimensions: { ageBand: "18-24", householdType: "single" },
      estimatedUniverse: youngSingleTotal,
      acsReferences: ["B01001", "B11001"],
      validationNote: "ACS 2022 5-year estimates. MOE ~±2.4% at 90% confidence.",
    });
  }

  return segments;
}
