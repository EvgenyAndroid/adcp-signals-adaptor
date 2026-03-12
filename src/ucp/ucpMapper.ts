// src/ucp/ucpMapper.ts
// Assembles UCP HybridPayload from CanonicalSignal.
// Central mapper — delegates to vacDeclaration, privacyBridge, legacyFallback.
//
// CHANGELOG (fix):
//   - buildVacDeclaration() now called with explicit phase: "v1" when the signal
//     has a real OpenAI vector in embeddingStore, "pseudo-v1" otherwise.
//     Previously always emitted pseudo-v1 constants regardless of actual vector.

import type { CanonicalSignal } from "../types/signal";
import type { UcpHybridPayload, UcpSignalType, UcpSignalStrength, UcpEmbeddingPhase } from "../types/ucp";
import type { DtsV12Label } from "../types/api";
import { buildVacDeclaration } from "./vacDeclaration";
import { buildUcpPrivacy } from "./privacyBridge";
import { buildLegacyFallback } from "./legacyFallback";
import { getSignalEmbedding } from "../domain/embeddingStore";

// ── Signal type mapping (DTS data_sources → UCP signal_type) ─────────────────
// Normative per AdCP-UCP Bridge Profile

function inferSignalType(dts: DtsV12Label): UcpSignalType {
  const sources = dts.data_sources ?? [];

  // Reinforcement: direct behavioral observation (ACR, STB, OTT)
  if (sources.includes("TV OTT or STB Device")) return "reinforcement";

  // Contextual: real-time behavioral signals
  if (sources.includes("Web Usage") || sources.includes("App Behavior")) return "contextual";

  // Identity: stable demographic/geographic attributes
  return "identity";
}

// ── Signal strength mapping (DTS methodology → UCP signal_strength) ──────────
// Normative per AdCP-UCP Bridge Profile

function inferSignalStrength(dts: DtsV12Label): UcpSignalStrength {
  switch (dts.audience_inclusion_methodology) {
    case "Observed/Known": return "high";
    case "Declared":       return "high";
    case "Derived":        return "medium";
    case "Inferred":       return "medium";
    case "Modeled":        return "low";
    default:               return "low";
  }
}

function buildClassificationRationale(
  signalType: UcpSignalType,
  signalStrength: UcpSignalStrength,
  dts: DtsV12Label,
): string {
  return (
    `signal_type=${signalType} derived from data_sources=[${dts.data_sources?.join(", ")}]. ` +
    `signal_strength=${signalStrength} derived from audience_inclusion_methodology="${dts.audience_inclusion_methodology}".`
  );
}

// ── Phase resolution ──────────────────────────────────────────────────────────

/**
 * Determine the correct VAC phase for a signal.
 * "v1"        — signal has a real OpenAI vector in the embedding store
 * "pseudo-v1" — dynamic/unknown signal; pseudo-hash fallback will be used
 */
function resolvePhase(signalId: string): UcpEmbeddingPhase {
  return getSignalEmbedding(signalId) !== null ? "v1" : "pseudo-v1";
}

// ── Main mapper ───────────────────────────────────────────────────────────────

export function toUcpHybridPayload(
  signal: CanonicalSignal,
  dts: DtsV12Label,
): UcpHybridPayload {
  const signalType     = inferSignalType(dts);
  const signalStrength = inferSignalStrength(dts);
  const phase          = resolvePhase(signal.signalId);

  return {
    schema_version:           "ucp-1.0",
    embedding:                buildVacDeclaration(signal.signalId, phase),
    legacy_fallback:          buildLegacyFallback(signal),
    privacy:                  buildUcpPrivacy(dts),
    signal_type:              signalType,
    signal_strength:          signalStrength,
    classification_rationale: buildClassificationRationale(signalType, signalStrength, dts),
  };
}
