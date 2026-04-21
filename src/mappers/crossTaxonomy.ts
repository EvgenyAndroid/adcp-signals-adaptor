// src/mappers/crossTaxonomy.ts
// Cross-taxonomy bridge — surfaces predicted segment IDs in the major
// buyer-side taxonomies so a HoldCo buyer agent can immediately locate
// an equivalent audience in its own workflow without manual translation.
//
// This is a demonstration-grade mapper: IDs are deterministic, derived
// from the signal's canonical categoryType + name/vertical, and stamped
// with a `stage` field so buyers know whether the mapping is live,
// modeled, or roadmap. Production systems would replace this with a
// real bridge table driven by Tranco / AbiliTec / UID 2.0 handshake.
//
// Taxonomies covered:
//   - iab_content_3_0          — IAB Tech Lab Content Taxonomy 3.0
//   - iab_audience_1_1         — IAB Audience Taxonomy 1.1 (our native)
//   - liveramp_abilitec        — LiveRamp AbiliTec consumer graph
//   - ttd_dmp                  — The Trade Desk first-party DMP
//   - mastercard_spendingpulse — Mastercard SpendingPulse retail categories
//   - nielsen_category         — Nielsen Category Audiences
//
// Shape is surfaced as x_cross_taxonomy on every SignalSummary.

import type { CanonicalSignal } from "../types/signal";

export type CrossTaxonomyStage = "live" | "modeled" | "roadmap";

export interface CrossTaxonomyEntry {
  system: string;
  id: string;
  label: string;
  stage: CrossTaxonomyStage;
}

// Short hash for deterministic per-signal IDs. Same djb2-style hash
// used in src/utils/ids.ts — kept local to avoid importing back up.
function shortHash(s: string, mod: number): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash % mod;
}

// ── IAB Content 3.0 — topic-shape IDs (IAB-3-0-NNN)
function iab30(signal: CanonicalSignal): CrossTaxonomyEntry {
  const name = signal.name.toLowerCase();
  const cat = signal.categoryType;
  // Top-level IAB 3.0 tiers (partial — demonstrative)
  const topic =
    name.includes("auto") || name.includes("vehicle") ? { id: "T-3-0-001", label: "Automotive" }
    : name.includes("finance") || name.includes("bank") || name.includes("invest") ? { id: "T-3-0-030", label: "Personal Finance" }
    : name.includes("health") || name.includes("fitness") || name.includes("wellness") ? { id: "T-3-0-233", label: "Healthy Living" }
    : name.includes("business") || name.includes("b2b") || name.includes("saas") ? { id: "T-3-0-052", label: "Business & Finance" }
    : name.includes("travel") || name.includes("vacation") ? { id: "T-3-0-653", label: "Travel" }
    : name.includes("parent") || name.includes("famil") || name.includes("kids") ? { id: "T-3-0-192", label: "Family & Relationships" }
    : name.includes("sport") || name.includes("fitness") ? { id: "T-3-0-483", label: "Sports" }
    : name.includes("tech") || name.includes("gadget") ? { id: "T-3-0-596", label: "Technology & Computing" }
    : name.includes("food") || name.includes("restaurant") ? { id: "T-3-0-210", label: "Food & Drink" }
    : name.includes("shop") || name.includes("retail") ? { id: "T-3-0-473", label: "Shopping" }
    : name.includes("event") || name.includes("wedding") || name.includes("mover") ? { id: "T-3-0-186", label: "Events & Attractions" }
    : name.includes("stream") || name.includes("media") || name.includes("ctv") ? { id: "T-3-0-324", label: "Television" }
    : cat === "geo" ? { id: "T-3-0-293", label: "Geography" }
    : cat === "demographic" ? { id: "T-3-0-186", label: "Demographics" }
    : { id: "T-3-0-596", label: "General Interest" };
  return { system: "iab_content_3_0", id: topic.id, label: topic.label, stage: "modeled" };
}

// ── LiveRamp AbiliTec cluster — 9-digit deterministic cluster ID
function liveramp(signal: CanonicalSignal): CrossTaxonomyEntry {
  const raw = shortHash("LR:" + signal.signalId, 900_000_000) + 100_000_000;
  return {
    system: "liveramp_abilitec",
    id: "LR_" + raw.toString(),
    label: signal.name,
    stage: "roadmap", // we don't have a real AbiliTec handshake
  };
}

// ── TTD DMP — 7-digit segment ID under partner namespace
function ttdDmp(signal: CanonicalSignal): CrossTaxonomyEntry {
  const raw = shortHash("TTD:" + signal.signalId, 9_000_000) + 1_000_000;
  return {
    system: "ttd_dmp",
    id: "ttd_" + raw.toString(),
    label: signal.name,
    stage: "modeled",
  };
}

// ── Mastercard SpendingPulse — retail category codes
// (only meaningful for purchase_intent / retail-shaped signals)
function mastercard(signal: CanonicalSignal): CrossTaxonomyEntry | null {
  const name = signal.name.toLowerCase();
  const cat = signal.categoryType;
  if (cat !== "purchase_intent" && !name.includes("shop") && !name.includes("retail") && !name.includes("restaurant")) {
    return null;
  }
  const bucket =
    name.includes("restaurant") || name.includes("dining") ? { id: "MC-REST", label: "Restaurants (SpendingPulse)" }
    : name.includes("apparel") || name.includes("fashion") ? { id: "MC-APPRL", label: "Apparel (SpendingPulse)" }
    : name.includes("electronic") || name.includes("tech") ? { id: "MC-ELEC", label: "Electronics & Appliances (SpendingPulse)" }
    : name.includes("grocer") || name.includes("food") ? { id: "MC-GROC", label: "Grocery (SpendingPulse)" }
    : name.includes("travel") || name.includes("hotel") || name.includes("airline") ? { id: "MC-TRVL", label: "Travel (SpendingPulse)" }
    : name.includes("luxury") ? { id: "MC-LUX", label: "Luxury Retail (SpendingPulse)" }
    : { id: "MC-GEN", label: "General Retail (SpendingPulse)" };
  return { system: "mastercard_spendingpulse", id: bucket.id, label: bucket.label, stage: "roadmap" };
}

// ── Nielsen Category Audiences — N-CAT-NNN
function nielsen(signal: CanonicalSignal): CrossTaxonomyEntry {
  const raw = shortHash("N:" + signal.signalId, 900) + 100;
  return {
    system: "nielsen_category",
    id: "N-CAT-" + raw.toString(),
    label: signal.name,
    stage: "modeled",
  };
}

/**
 * Build the full cross-taxonomy entry list for a signal. Always includes
 * the native iab_audience_1_1 entry plus iab_content_3_0, liveramp,
 * ttd_dmp, nielsen. Mastercard SpendingPulse is retail-only so it's
 * conditional.
 */
export function buildCrossTaxonomy(signal: CanonicalSignal): CrossTaxonomyEntry[] {
  const entries: CrossTaxonomyEntry[] = [
    {
      system: "iab_audience_1_1",
      id: signal.externalTaxonomyId ?? "0",
      label: signal.name,
      stage: "live",
    },
    iab30(signal),
    liveramp(signal),
    ttdDmp(signal),
    nielsen(signal),
  ];
  const mc = mastercard(signal);
  if (mc) entries.push(mc);
  return entries;
}
