// src/domain/vendorRaceMock.ts
//
// Wave 6 (Race Canvas) — deterministic per-vendor mock responses for the
// vendor race waterfall demo.
//
// Why mocked:
//   - Most live vendors auth-gate the calls we'd want to demo (cohort
//     sizing, bid-floor recommendation, governance verdict). Demo-time
//     reliability matters more than live authenticity here.
//   - We need ENGINEERED DISAGREEMENT — two vendors must return materially
//     different audience sizes so the disagreement halo fires. Live data
//     wouldn't reliably produce this without staging.
//
// What's deterministic:
//   - Per (vendor_id, brief_hash) the four key fields are stable across
//     reruns. Same brief → same numbers, every time.
//   - Latency varies per-vendor by a fixed personality (some are fast,
//     some slow). Adds visual texture to the waterfall without randomness.
//
// What's NOT mocked:
//   - The four key fields are intentionally simple. Real vendor responses
//     carry richer payloads (cohort definitions, taxonomy mappings, etc.).
//     The race demo is about ORCHESTRATION + DISAGREEMENT, not depth of
//     each vendor response.

import type { RegisteredAgent } from "./agentRegistry";

export type GovernanceVerdict = "allow" | "warn" | "block";
export type SensitiveVerdict = "none" | "elevated" | "restricted";

export interface VendorRaceResponse {
  vendor_id: string;
  vendor_name: string;
  /** Estimated reach in unique users. Numeric field that drives disagreement. */
  audience_size: number;
  /** Vendor's read on whether the audience touches sensitive categories. */
  sensitive_category_verdict: SensitiveVerdict;
  /** Recommended bid floor in cents (CPM context). */
  recommended_bid_floor_cents: number;
  /** Predicted governance outcome at activation time. */
  governance_outcome: GovernanceVerdict;
  /** Per-vendor latency for the simulated call. */
  latency_ms: number;
  /** Free-text rationale the vendor would emit alongside structured fields. */
  rationale: string;
  /** True if this vendor's response was synthesized vs live-fetched. */
  mocked: boolean;
}

// ── FNV-1a (32-bit) — same hash used in dspMock + sponsoredIntelligenceMock.
// Local copy keeps the module self-contained; switch to a shared util later.
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// Per-vendor "personality" — keeps each vendor's responses feeling distinct
// without random variation. Latency budget + the disagreement assignment.
//
// Disagreement choreography (designed for visual punch in a 6-vendor race):
//
//   Default cluster (4 vendors): audience_size in 9-12M range, governance=allow
//   Outlier A (1 vendor):        audience_size in 4-6M range — undercount
//   Outlier B (1 vendor):        sensitive_verdict=elevated, gov=warn
//
// The disagreement detector picks these up on the first eligible field and
// fires the halo. With 6 vendors selected from the typical demo set, two
// disagreements fire — one numeric, one categorical.

interface VendorPersonality {
  /** Cluster bucket — drives both audience-size and governance defaults. */
  bucket: "consensus" | "undercount" | "elevated_risk";
  /** Latency in ms; deterministic per vendor. */
  latency_ms: number;
  /** Bid floor variance from baseline (cents). */
  bid_floor_offset_cents: number;
}

const PERSONALITIES: Record<string, VendorPersonality> = {
  // ── Consensus cluster (return values aligned with the dominant view) ──
  evgeny_signals:    { bucket: "consensus",      latency_ms: 420, bid_floor_offset_cents: 0 },
  dstillery:         { bucket: "consensus",      latency_ms: 680, bid_floor_offset_cents: 50 },
  swivel:            { bucket: "consensus",      latency_ms: 540, bid_floor_offset_cents: -25 },
  claire_pub:        { bucket: "consensus",      latency_ms: 720, bid_floor_offset_cents: 75 },
  // ── Undercounts the audience by ~50% (numeric disagreement) ──────────
  adzymic_apx:       { bucket: "undercount",     latency_ms: 380, bid_floor_offset_cents: -50 },
  // ── Flags elevated sensitivity (categorical disagreement) ────────────
  celtra:            { bucket: "elevated_risk",  latency_ms: 510, bid_floor_offset_cents: 100 },
  // ── Fallbacks for any other vendor not enumerated ────────────────────
  // Anything not in the table goes to consensus with a base latency.
};

function personalityFor(vendor_id: string): VendorPersonality {
  return PERSONALITIES[vendor_id] ?? { bucket: "consensus", latency_ms: 600, bid_floor_offset_cents: 25 };
}

/**
 * Synthesize a VendorRaceResponse for a (vendor, brief) pair. Deterministic.
 *
 * The brief drives a baseline audience size (interpreted as one user per
 * 100 dollars of budget for demo purposes) and an FNV-1a hash mixes
 * vendor+brief into a stable per-cell jitter.
 */
export function synthesizeVendorResponse(
  vendor: Pick<RegisteredAgent, "id" | "name" | "vendor">,
  briefInput: string,
  baselineAudience: number,
): VendorRaceResponse {
  const personality = personalityFor(vendor.id);
  const seed = fnv1a(vendor.id + "::" + briefInput);
  // Jitter in [-12%, +12%] within the bucket — keeps cluster visually
  // tight but not artificially identical.
  const jitterPct = ((seed % 240) - 120) / 1000; // -0.12 .. +0.12

  let audience_size: number;
  let sensitive_category_verdict: SensitiveVerdict;
  let governance_outcome: GovernanceVerdict;

  switch (personality.bucket) {
    case "undercount":
      // Roughly half of the consensus reach.
      audience_size = Math.round(baselineAudience * (0.45 + jitterPct));
      sensitive_category_verdict = "none";
      governance_outcome = "allow";
      break;
    case "elevated_risk":
      // Same reach as consensus, but flags the audience as sensitive.
      audience_size = Math.round(baselineAudience * (1.0 + jitterPct));
      sensitive_category_verdict = "elevated";
      governance_outcome = "warn";
      break;
    case "consensus":
    default:
      audience_size = Math.round(baselineAudience * (1.0 + jitterPct));
      sensitive_category_verdict = "none";
      governance_outcome = "allow";
      break;
  }

  // Bid floor: $4.50 baseline + per-vendor offset + small jitter.
  const recommended_bid_floor_cents = 450 + personality.bid_floor_offset_cents + ((seed >>> 8) % 30);

  const rationale = (() => {
    if (personality.bucket === "undercount") {
      return vendor.vendor + " applies stricter dedup across cookieless cohorts; reach numbers come in below consensus on most briefs.";
    }
    if (personality.bucket === "elevated_risk") {
      return vendor.vendor + " flags this audience as elevated based on inferred contextual adjacencies; recommends review before activation.";
    }
    return vendor.vendor + " returns standard cohort sizing aligned with peer estimates; no governance flags raised.";
  })();

  return {
    vendor_id: vendor.id,
    vendor_name: vendor.name,
    audience_size,
    sensitive_category_verdict,
    recommended_bid_floor_cents,
    governance_outcome,
    latency_ms: personality.latency_ms,
    rationale,
    mocked: true,
  };
}

/**
 * Compute a baseline audience size from the brief. Crude — uses budget
 * if extractable, otherwise a fixed 10M default. Real implementations
 * would call out to the catalog.
 */
export function inferBaselineAudience(briefInput: string): number {
  const m = briefInput.match(/\$(\d+(?:\.\d+)?)\s*([KMB])?/i);
  if (m) {
    const num = parseFloat(m[1]!);
    const suffix = (m[2] ?? "").toUpperCase();
    const dollars = suffix === "K" ? num * 1_000 : suffix === "M" ? num * 1_000_000 : suffix === "B" ? num * 1_000_000_000 : num;
    // ~1 user per $0.025 of budget — gets us 10M for $250K, which lines
    // up with the Coca-Cola Summer Refresh demo brief.
    return Math.round(dollars / 0.025);
  }
  return 10_000_000;
}
