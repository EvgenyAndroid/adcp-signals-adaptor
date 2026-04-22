// src/analytics/derivedFacets.ts
// Sec-41: derive Tier 2/3 analytics facets from an existing signal's
// metadata. All outputs are deterministic functions of the signal's
// name + category + sourceSystems — no DB migration, no LLM, no
// runtime randomness. Safe for every signal in the catalog.
//
// Facets:
//   seasonalityProfile — 12 monthly multipliers + peak/trough summary
//   decayHalfLifeDays  — data freshness decay half-life
//   volatilityIndex    — 0-100 from seasonality coefficient of variation
//   authorityScore     — 0-100 from DTS methodology signals
//   idStabilityClass   — "stable" | "semi_stable" | "volatile"

import type { CanonicalSignal } from "../types/signal";

// ── Seasonality profiles ─────────────────────────────────────────────────────

const FLAT = Array(12).fill(1.0);

const PROFILE_HOLIDAY_Q4 = [0.7, 0.7, 0.8, 0.8, 0.9, 0.9, 1.0, 1.0, 1.1, 1.3, 1.8, 2.0];
const PROFILE_BTS        = [0.9, 0.9, 0.9, 0.9, 1.0, 1.0, 1.3, 1.8, 1.7, 1.0, 0.9, 0.8];
const PROFILE_SUMMER     = [0.8, 0.8, 0.9, 1.0, 1.2, 1.5, 1.6, 1.4, 1.0, 0.8, 0.8, 0.8];
const PROFILE_TAX        = [1.2, 1.7, 1.8, 1.5, 0.9, 0.8, 0.7, 0.7, 0.8, 0.8, 0.9, 1.0];
const PROFILE_VALENTINE  = [0.95, 1.6, 1.2, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95];
const PROFILE_MOTHERS    = [0.95, 0.95, 0.95, 1.3, 1.7, 1.0, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95];
const PROFILE_MEMORIAL   = [0.9, 0.9, 0.9, 0.9, 1.5, 1.3, 1.4, 0.9, 1.2, 0.9, 0.9, 0.9];
const PROFILE_HALLOWEEN  = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1.2, 1.8, 1.0, 0.9];
const PROFILE_NEWYEAR    = [1.8, 1.3, 1.0, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1.1];
const PROFILE_PURCHASE   = [0.85, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.2, 1.2];
const PROFILE_B2B_FY_END = [1.3, 1.4, 1.2, 1.0, 1.0, 0.9, 0.9, 0.9, 0.9, 0.9, 1.1, 1.5];
const PROFILE_SPORTS_FB  = [0.85, 0.8, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 1.3, 1.4, 1.3, 1.2];
const PROFILE_SPORTS_BB  = [0.9, 0.9, 1.0, 1.1, 1.2, 1.3, 1.3, 1.3, 1.0, 0.9, 0.9, 0.9];
const PROFILE_WEATHER_HOT = [0.7, 0.7, 0.8, 1.0, 1.2, 1.6, 1.8, 1.7, 1.2, 0.9, 0.7, 0.7];
const PROFILE_WEATHER_COLD = [1.8, 1.7, 1.2, 0.9, 0.7, 0.7, 0.7, 0.7, 0.7, 0.9, 1.2, 1.6];
const PROFILE_SKI         = [1.8, 1.7, 1.3, 0.95, 0.7, 0.7, 0.7, 0.7, 0.7, 0.9, 1.2, 1.6];

function matchesAny(name: string, needles: string[]): boolean {
  return needles.some((n) => name.includes(n));
}

function pickSeasonality(signal: CanonicalSignal): number[] {
  const n = signal.name.toLowerCase();
  if (matchesAny(n, ["valentine"])) return PROFILE_VALENTINE;
  if (matchesAny(n, ["mother"])) return PROFILE_MOTHERS;
  if (matchesAny(n, ["memorial", "july 4", "labor"])) return PROFILE_MEMORIAL;
  if (matchesAny(n, ["halloween"])) return PROFILE_HALLOWEEN;
  if (matchesAny(n, ["new year", "resolution"])) return PROFILE_NEWYEAR;
  if (matchesAny(n, ["tax season", "tax filer"])) return PROFILE_TAX;
  if (matchesAny(n, ["holiday", "q4 gift", "black friday", "cyber monday", "bfcm", "father"])) return PROFILE_HOLIDAY_Q4;
  if (matchesAny(n, ["back-to-school", "back to school", "bts", "graduation"])) return PROFILE_BTS;
  if (matchesAny(n, ["summer", "beach", "vacation"])) return PROFILE_SUMMER;
  if (matchesAny(n, ["heat", "hurricane", "sunny"])) return PROFILE_WEATHER_HOT;
  if (matchesAny(n, ["snow", "cold snap"])) return PROFILE_WEATHER_COLD;
  if (matchesAny(n, ["ski resort", "ski"])) return PROFILE_SKI;
  if (matchesAny(n, ["football", "nfl"])) return PROFILE_SPORTS_FB;
  if (matchesAny(n, ["baseball", "mlb"])) return PROFILE_SPORTS_BB;
  if (matchesAny(n, ["fy", "fiscal", "procurement", "rfp", "renewal"])) return PROFILE_B2B_FY_END;
  if (signal.categoryType === "purchase_intent") return PROFILE_PURCHASE;
  return FLAT;
}

export function deriveSeasonality(signal: CanonicalSignal): NonNullable<CanonicalSignal["seasonalityProfile"]> {
  const raw = pickSeasonality(signal);
  // Normalize to avg = 1.0
  const sum = raw.reduce((s, v) => s + v, 0);
  const normalized = raw.map((v) => (v / sum) * 12);
  let peakI = 0, peakV = -Infinity, troughI = 0, troughV = Infinity;
  for (let i = 0; i < 12; i++) {
    const v = normalized[i] ?? 1;
    if (v > peakV) { peakV = v; peakI = i; }
    if (v < troughV) { troughV = v; troughI = i; }
  }
  const mean = normalized.reduce((s, v) => s + v, 0) / 12;
  const variance = normalized.reduce((s, v) => s + (v - mean) ** 2, 0) / 12;
  const std = Math.sqrt(variance);
  return {
    monthly: normalized.map((v) => Math.round(v * 1000) / 1000),
    peakMonth: peakI,
    peakMultiplier: Math.round(peakV * 100) / 100,
    troughMonth: troughI,
    troughMultiplier: Math.round(troughV * 100) / 100,
    coefficientOfVariation: Math.round((std / mean) * 1000) / 1000,
  };
}

// ── Decay half-life ──────────────────────────────────────────────────────────

export function deriveDecayHalfLifeDays(signal: CanonicalSignal): number {
  const n = signal.name.toLowerCase();
  if (matchesAny(n, ["0-30", "0_30", "30-day", "30d window", "in-window", "active"])) return 7;
  if (matchesAny(n, ["0-90", "0_90", "60-day", "60_day"])) return 14;
  if (matchesAny(n, ["0-180", "91_180", "6-month"])) return 30;
  if (matchesAny(n, ["12-month", "12mo"])) return 60;
  if (matchesAny(n, ["rfp", "intent", "eval", "procurement"])) return 14;
  if (matchesAny(n, ["weather", "heat wave", "snow storm", "hurricane"])) return 7;
  if (signal.categoryType === "purchase_intent") return 30;
  if (signal.categoryType === "demographic") return 365;
  if (signal.categoryType === "geo") return 365;
  if (signal.categoryType === "interest") return 90;
  return 90;
}

// ── Authority score ──────────────────────────────────────────────────────────

export function deriveAuthorityScore(signal: CanonicalSignal): number {
  // Heuristic composite. Higher = more trusted underlying data.
  const srcs = signal.sourceSystems ?? [];
  const refs = signal.rawSourceRefs ?? [];
  let score = 45; // base

  // Multi-source bonus
  if (srcs.length >= 3) score += 10;
  else if (srcs.length === 2) score += 5;

  // Observed sources beat modeled
  if (srcs.some((s) => s.includes("acr") || s.includes("dma") || s.includes("census"))) score += 12;
  if (srcs.some((s) => s.includes("iab_taxonomy_loader"))) score += 6;

  // Generation mode
  if (signal.generationMode === "seeded") score += 10;
  else if (signal.generationMode === "derived") score += 5;

  // External taxonomy ID bumps reliability
  if (signal.externalTaxonomyId) score += 6;

  // Category weight
  if (signal.categoryType === "demographic") score += 5;
  if (signal.categoryType === "purchase_intent") score += 8;
  if (signal.categoryType === "composite") score -= 2;

  // Geo signals capped — always observable
  if (signal.categoryType === "geo") score = Math.max(score, 70);

  // Ref count bonus
  if (refs.length >= 2) score += 4;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Volatility index ─────────────────────────────────────────────────────────

export function deriveVolatilityIndex(seasonality: NonNullable<CanonicalSignal["seasonalityProfile"]>): number {
  // cov of 0.05 → 10, 0.50 → 100
  return Math.max(0, Math.min(100, Math.round(seasonality.coefficientOfVariation * 200)));
}

// ── ID stability class ───────────────────────────────────────────────────────

export function deriveIdStabilityClass(signal: CanonicalSignal): "stable" | "semi_stable" | "volatile" {
  const half = deriveDecayHalfLifeDays(signal);
  if (half <= 14) return "volatile";
  if (half <= 60) return "semi_stable";
  return "stable";
}

// ── Combined enrichment ──────────────────────────────────────────────────────

export function enrichSignalWithAnalyticsFacets(signal: CanonicalSignal): CanonicalSignal {
  const seasonality = deriveSeasonality(signal);
  return {
    ...signal,
    seasonalityProfile: seasonality,
    decayHalfLifeDays: deriveDecayHalfLifeDays(signal),
    volatilityIndex: deriveVolatilityIndex(seasonality),
    authorityScore: deriveAuthorityScore(signal),
    idStabilityClass: deriveIdStabilityClass(signal),
  };
}
