// src/ucp/legacyFallback.ts
// Builds the UCP legacy_fallback object from AdCP signal fields.
// This is the normative AdCP → UCP identity bridge:
//   signal_agent_segment_id  ← AdCP primary key
//   segment_ids              ← IAB AT 1.1 node IDs from x_dts.taxonomy_id_list

import type { UcpLegacyFallback } from "../types/ucp";
import type { CanonicalSignal } from "../types/signal";

const DATA_PROVIDER = "AdCP Signals Adaptor - Demo Provider (Evgeny)";

export function buildLegacyFallback(signal: CanonicalSignal): UcpLegacyFallback {
  // Collect all IAB AT 1.1 node IDs from externalTaxonomyId + rawSourceRefs
  const ids = new Set<string>();
  if (signal.externalTaxonomyId) ids.add(signal.externalTaxonomyId);
  for (const ref of signal.rawSourceRefs ?? []) {
    if (/^\d+$/.test(ref)) ids.add(ref); // numeric refs are taxonomy node IDs
  }

  return {
    signal_agent_segment_id: signal.signalId,
    segment_ids: ids.size > 0 ? Array.from(ids) : ["0"],
    taxonomy_version: "iab_audience_1.1",
    data_provider: DATA_PROVIDER,
  };
}
