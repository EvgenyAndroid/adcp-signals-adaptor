// src/domain/capabilityService.ts
// @adcp/client SDK: COMPATIBLE_ADCP_VERSIONS = ['v2.5', 'v2.6', 'v3', ...]
// SIGNALS_TOOLS = ['get_signals', 'activate_signal']

const CACHE_KEY        = "adcp_capabilities_v5";   // bumped from v4 to bust stale cache
const CACHE_TTL_SECONDS = 300;                      // 5 min (matches live behaviour)

import { UCP_CAPABILITY, UCP_GTS_VERSION, UCP_SPACE_ID } from "../ucp/vacDeclaration";

const STATIC_CAPABILITIES = {
  adcp: {
    major_versions: [2, 3],   // SDK confirms v2.5, v2.6, v3 all compatible
  },
  supported_protocols: ["signals"],
  signals: {
    signal_categories: [
      "demographic",
      "interest",
      "purchase_intent",
      "geo",
      "composite",
    ],
    dynamic_segment_generation: true,
    activation_mode: "async",
    provider: "AdCP Signals Adaptor - Demo Provider (Evgeny)",
    destinations: [
      {
        id:                   "mock_dsp",
        name:                 "Mock DSP",
        type:                 "dsp",
        activation_supported: true,
      },
      {
        id:                   "mock_cleanroom",
        name:                 "Mock Clean Room",
        type:                 "cleanroom",
        activation_supported: true,
      },
      {
        id:                   "mock_cdp",
        name:                 "Mock CDP",
        type:                 "cdp",
        activation_supported: true,
      },
      {
        id:                   "mock_measurement",
        name:                 "Mock Measurement Platform",
        type:                 "measurement",
        activation_supported: false,
      },
    ],
    limits: {
      max_signals_per_request: 100,
      max_rules_per_segment:   6,
    },
  },

  // ── UCP (User Context Protocol) capability block ──────────────────────────
  // Mirrors the live /capabilities response exactly.
  // Single source of truth: all sub-blocks built from constants where possible.
  ucp: {
    ...UCP_CAPABILITY,

    // GTS (Golden Test Suite) — Phase 2b embedding space validation
    gts: {
      supported:      true,
      endpoint:       "/ucp/gts",
      version:        UCP_GTS_VERSION,
      pair_count:     15,
      // Thresholds per pair type (NOT the get_similar_signals default):
      identity_min:   0.9,   // expected_min for identity pairs
      related_min:    0.5,   // expected_min for related pairs
      orthogonal_max: 0.4,   // expected_max for orthogonal pairs
    },

    // Projector — Phase 2b cross-space alignment (simulated pending IAB ref model)
    projector: {
      available:  true,
      endpoint:   "/ucp/projector",
      algorithm:  "procrustes_svd",
      from_space: UCP_SPACE_ID,
      to_space:   "ucp-space-v1.0",
      status:     "simulated",
    },

    // Handshake simulator — buyer/seller space negotiation demo
    handshake_simulator: {
      supported: true,
      endpoint:  "/ucp/simulate-handshake",
    },

    // Natural language audience query
    nl_query: {
      supported:          true,
      endpoint:           "/signals/query",
      min_embedding_score: 0.45,
      archetype_count:    4,
      concept_count:      19,
    },

    // Concept-level VAC registry
    concept_registry: {
      supported:        true,
      endpoint:         "/ucp/concepts",
      concept_count:    19,
      registry_version: "ucp-concept-registry-v1.0",
      categories: [
        "demographic",
        "interest",
        "behavioral",
        "geo",
        "archetype",
        "content",
        "purchase_intent",
      ],
    },
  },
} as const;

export type Capabilities = typeof STATIC_CAPABILITIES;

export async function getCapabilities(kv: KVNamespace): Promise<Capabilities> {
  try {
    const cached = await kv.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as Capabilities;
  } catch { /* cache miss */ }

  try {
    await kv.put(CACHE_KEY, JSON.stringify(STATIC_CAPABILITIES), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch { /* non-fatal */ }

  return STATIC_CAPABILITIES;
}
