// src/domain/signals/demographicExt.ts
// Demographic vertical — 20 EXTRA signals. The core demographic signals
// (age × income × education × household-type) are in signalModel.ts;
// this file adds dimensions not yet covered: gender, marital status,
// ethnicity, language, occupation, home ownership, presence of children.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "demographic";

export const DEMOGRAPHIC_EXT_SIGNALS: CanonicalSignal[] = [
  // ── Gender (2) ────────────────────────────────────────────────────────────
  make("demo_gender_female",           "Gender: Female Adults",          "Self-identified female adults across all age bands. Broad reach for female-skewing creative.", "demographic", 128_000_000, cpm(3.50), V),
  make("demo_gender_male",             "Gender: Male Adults",            "Self-identified male adults across all age bands. Broad reach for male-skewing creative.", "demographic", 124_000_000, cpm(3.50), V),

  // ── Marital status (3) ────────────────────────────────────────────────────
  make("demo_marital_single_never",    "Marital: Single / Never Married","Adults never married. Skews 18-35, urban, higher rental rates.", "demographic", 68_000_000, cpm(5.00), V),
  make("demo_marital_married",         "Marital: Married",               "Currently-married adults. Household-decision joint skew, insurance + financial-product target.", "demographic", 132_000_000, cpm(4.00), V),
  make("demo_marital_divorced_widowed","Marital: Divorced / Widowed",    "Adults formerly married (divorced or widowed). Financial replanning + single-person HH target.", "demographic", 34_000_000, cpm(4.50), V),

  // ── Presence and age of children (4) ──────────────────────────────────────
  make("demo_kids_under_5",            "Households with Children Under 5","Households with at least one child under 5. Infant + toddler-product target.", "demographic", 14_200_000, cpm(8.00), V),
  make("demo_kids_5_to_11",            "Households with Children 5-11",  "Households with elementary-age children. K-5 education + family-activity target.", "demographic", 16_800_000, cpm(6.50), V),
  make("demo_kids_12_to_17",           "Households with Teens 12-17",    "Households with teenage children. Driver-ed, college-prep, teen-electronics target.", "demographic", 14_400_000, cpm(6.50), V),
  make("demo_kids_no_children",        "Households with No Children",    "Adults / couples without children at home. Discretionary-income + couple-household target.", "demographic", 86_000_000, cpm(4.50), V),

  // ── Home ownership (3) ────────────────────────────────────────────────────
  make("demo_own_home",                "Homeowners",                     "Adults who own their primary residence. Skews 35+, HHI $75K+, suburban.", "demographic", 84_000_000, cpm(5.00), V),
  make("demo_rent_home",               "Renters",                        "Adults who rent their primary residence. Skews 18-44, urban, renter-insurance target.", "demographic", 44_000_000, cpm(5.50), V),
  make("demo_multi_unit_urban",        "Multi-Unit Urban Dwellers",      "Adults living in apartments / condos in urban cores. Transit + walkable-lifestyle.", "demographic", 22_000_000, cpm(6.00), V),

  // ── Language & ethnicity (3) — neutral public census categories ──────────
  make("demo_language_spanish_primary","Primary Language: Spanish",      "Adults whose primary household language is Spanish. Multicultural-creative target.", "demographic", 42_000_000, cpm(5.50), V),
  make("demo_language_english_only",   "Primary Language: English Only", "Adults in English-only households. Broad-reach baseline.", "demographic", 210_000_000, cpm(3.50), V),
  make("demo_language_asian_primary",  "Primary Language: Asian Languages","Adults with primary language in Asian-language family (Mandarin, Cantonese, Korean, Vietnamese, etc.).", "demographic", 14_000_000, cpm(6.00), V),

  // ── Occupation / employment (5) ───────────────────────────────────────────
  make("demo_occ_white_collar",        "Occupation: White Collar",       "Adults in professional / managerial / administrative roles. Knowledge-worker target.", "demographic", 58_000_000, cpm(6.00), V),
  make("demo_occ_blue_collar",         "Occupation: Blue Collar",        "Adults in skilled trades, manufacturing, transportation, construction roles.", "demographic", 32_000_000, cpm(5.50), V),
  make("demo_occ_service",             "Occupation: Service Industry",   "Adults in retail, food, hospitality, personal-service roles.", "demographic", 28_000_000, cpm(5.00), V),
  make("demo_occ_self_employed",       "Occupation: Self-Employed",      "Adults who are self-employed or independent contractors. SMB-product target.", "demographic", 14_800_000, cpm(7.00), V),
  make("demo_occ_remote_hybrid",       "Work Location: Remote / Hybrid", "Adults working remote or hybrid (3+ days WFH). Home-office + productivity-tool target.", "demographic", 32_000_000, cpm(6.50), V),
];
