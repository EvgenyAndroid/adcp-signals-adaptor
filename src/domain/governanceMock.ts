// src/domain/governanceMock.ts
//
// MVP #2 — predictive `check_governance` overlay.
//
// Closes the trust-pipeline visualization gap: signals carry policy
// attestations (Phase D), brands carry policy hits (Phase C), but
// nothing TODAY shows what `check_governance` would say if it were
// invoked between products and media-buy. This module computes that
// answer locally — purely from the data we already have — so the
// Canvas can render a "would-block / would-warn / would-allow"
// outcome per applicable policy.
//
// Why mocked:
//   - No vendor in the AdCP directory currently advertises the
//     `check_governance` tool (greenfield in 3.0 GA).
//   - We control the policy + attestation data already.
//   - The mock follows the AdCP 3.0.1 advisory shape so swapping
//     for live is one function-pointer change later.
//
// Decision matrix:
//
//   Brand has policy P (industry-derived, Phase C)
//     × Signal attests to P with claim ∈ {compliant, exempt, not_applicable}
//       → ALLOW
//     × Signal attests with claim = out_of_scope
//       → ALLOW (provider declares the policy doesn't apply to their data)
//     × Signal attests with claim = unknown
//       → WARN (provider explicitly disclaims certainty)
//     × Signal silent on P (no attestation)
//       AND P.enforcement = must
//       → BLOCK (catch-all unmet must)
//     × Signal silent on P
//       AND P.enforcement = should
//       → WARN
//
// Output mirrors the AdCP 3.0.1 governance advisory:
//   { mode: "predictive_local", outcome, restricted_attributes[],
//     policy_categories[], advisories[] }

import type { RegistryPolicy } from "./policyRegistry";
import type { SignalAttestation } from "./workflowOrchestration";

export type GovernanceOutcome = "allow" | "warn" | "block";
export type GovernanceClaim = "compliant" | "exempt" | "not_applicable" | "out_of_scope" | "unknown";

export interface GovernanceAdvisoryEntry {
  policy_id: string;
  policy_name: string;
  enforcement: "must" | "should" | "may";
  category: "regulation" | "standard";
  outcome: GovernanceOutcome;
  reason: string;
  signal_claim?: GovernanceClaim;
}

export interface GovernanceAdvisory {
  /** AdCP 3.0.1 introduced governance "mode"; we use a synthetic value
   *  so the UI can show this is a local prediction, not a live vendor
   *  call. Switch to "live" when a vendor advertises check_governance. */
  mode: "predictive_local";
  /** Worst per-policy outcome — block > warn > allow. */
  outcome: GovernanceOutcome;
  /** Policy ids that would BLOCK at fire-time — UI renders these as red. */
  restricted_attributes: string[];
  /** Policy ids relevant to this brand × signal combination. */
  policy_categories: string[];
  /** Per-policy reasoning, sorted block > warn > allow. */
  advisories: GovernanceAdvisoryEntry[];
}

export function predictGovernance(
  applicablePolicies: RegistryPolicy[],
  signalAttestations: SignalAttestation[],
): GovernanceAdvisory {
  const claimByPolicy = new Map<string, SignalAttestation>();
  for (const a of signalAttestations) claimByPolicy.set(a.policy_id, a);

  const advisories: GovernanceAdvisoryEntry[] = applicablePolicies.map((p) => {
    const attest = claimByPolicy.get(p.policy_id);
    const claim = (attest?.claim as GovernanceClaim | undefined) ?? undefined;

    let outcome: GovernanceOutcome;
    let reason: string;

    if (claim === "compliant" || claim === "exempt" || claim === "not_applicable") {
      outcome = "allow";
      reason = `Signal attests "${claim}". ${attest?.notes ?? ""}`.trim();
    } else if (claim === "out_of_scope") {
      outcome = "allow";
      reason = `Signal claims out_of_scope. ${attest?.notes ?? ""}`.trim();
    } else if (claim === "unknown") {
      outcome = "warn";
      reason = "Signal explicitly disclaims certainty.";
    } else {
      // Silent — no attestation present.
      if (p.enforcement === "must") {
        outcome = "block";
        reason = `Brand carries this ${p.category} (must) and signal does not attest. Live check_governance would BLOCK.`;
      } else if (p.enforcement === "should") {
        outcome = "warn";
        reason = `Brand carries this ${p.category} (should) and signal does not attest. Live check_governance would WARN.`;
      } else {
        outcome = "allow";
        reason = "Advisory-only enforcement; no claim required.";
      }
    }

    const entry: GovernanceAdvisoryEntry = {
      policy_id: p.policy_id,
      policy_name: p.name,
      enforcement: p.enforcement,
      category: p.category,
      outcome,
      reason,
    };
    if (claim !== undefined) entry.signal_claim = claim;
    return entry;
  });

  // Worst outcome wins overall.
  const worst: GovernanceOutcome = advisories.some((a) => a.outcome === "block")
    ? "block"
    : advisories.some((a) => a.outcome === "warn")
      ? "warn"
      : "allow";

  // Sort advisories: block first, then warn, then allow.
  const order: Record<GovernanceOutcome, number> = { block: 0, warn: 1, allow: 2 };
  advisories.sort((a, b) => order[a.outcome] - order[b.outcome]);

  return {
    mode: "predictive_local",
    outcome: worst,
    restricted_attributes: advisories.filter((a) => a.outcome === "block").map((a) => a.policy_id),
    policy_categories: advisories.map((a) => a.policy_id),
    advisories,
  };
}
