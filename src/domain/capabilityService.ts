// src/domain/capabilityService.ts
// @adcp/client SDK: COMPATIBLE_ADCP_VERSIONS = ['v2.5', 'v2.6', 'v3', ...]
// SIGNALS_TOOLS = ['get_signals', 'activate_signal']

const CACHE_KEY = "adcp_capabilities_v4";
const CACHE_TTL_SECONDS = 3600;

import { UCP_CAPABILITY } from "../ucp/vacDeclaration";

const STATIC_CAPABILITIES = {
  adcp: {
    major_versions: [2, 3],  // SDK confirms v2.5, v2.6, v3 all compatible
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
        id: "mock_dsp",
        name: "Mock DSP",
        type: "dsp",
        activation_supported: true,
      },
      {
        id: "mock_cleanroom",
        name: "Mock Clean Room",
        type: "cleanroom",
        activation_supported: true,
      },
      {
        id: "mock_cdp",
        name: "Mock CDP",
        type: "cdp",
        activation_supported: true,
      },
      {
        id: "mock_measurement",
        name: "Mock Measurement Platform",
        type: "measurement",
        activation_supported: false,
      },
    ],
    limits: {
      max_signals_per_request: 100,
      max_rules_per_segment: 6,
    },
  },
  // UCP (User Context Protocol) — embedding + similarity capabilities
  ucp: UCP_CAPABILITY,
};

export async function getCapabilities(kv: KVNamespace): Promise<typeof STATIC_CAPABILITIES> {
  try {
    const cached = await kv.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as typeof STATIC_CAPABILITIES;
  } catch { /* cache miss */ }

  try {
    await kv.put(CACHE_KEY, JSON.stringify(STATIC_CAPABILITIES), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch { /* non-fatal */ }

  return STATIC_CAPABILITIES;
}
