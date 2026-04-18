// src/domain/capabilityService.ts
// Response shape conforms to AdCP v3 schema:
//   https://adcontextprotocol.org/schemas/v3/protocol/get-adcp-capabilities-response.json
//
// Top-level keys allowed by v3: adcp, supported_protocols, account, media_buy,
// signals, governance, sponsored_intelligence, brand, creative,
// extensions_supported, last_updated, errors, context, ext.
// UCP lives under `ext.ucp` (schema-sanctioned extension slot).
//
// Cache key bumped to v6 for the v3-conformant shape (ucp moved to ext).

const CACHE_KEY = "adcp_capabilities_v6";
const CACHE_TTL_SECONDS = 3600;

import { UCP_CAPABILITY } from "../ucp/vacDeclaration";

const VALID_PROTOCOLS = new Set([
  "media_buy",
  "signals",
  "governance",
  "sponsored_intelligence",
  "creative",
  "brand",
]);

type AdcpCapabilities = {
  adcp: { major_versions: number[] };
  supported_protocols: string[];
  signals?: unknown;
  media_buy?: unknown;
  governance?: unknown;
  sponsored_intelligence?: unknown;
  creative?: unknown;
  brand?: unknown;
  ext?: Record<string, unknown>;
};

const STATIC_CAPABILITIES: AdcpCapabilities = {
  adcp: {
    major_versions: [2, 3],
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
  ext: {
    ucp: UCP_CAPABILITY,
  },
};

// Per-protocol block keys that may appear at top level.
const PROTOCOL_BLOCK_KEYS = [
  "signals",
  "media_buy",
  "governance",
  "sponsored_intelligence",
  "creative",
  "brand",
] as const;

/**
 * Return capabilities, optionally filtered to the requested protocols.
 *
 * When `protocols` is provided, only the matching per-protocol blocks are
 * included. `adcp`, `supported_protocols`, and `ext` are always returned.
 * Unknown protocol names are ignored (schema enum is enforced elsewhere).
 */
export async function getCapabilities(
  kv: KVNamespace,
  protocols?: string[],
): Promise<AdcpCapabilities> {
  let full: AdcpCapabilities | null = null;
  try {
    const cached = await kv.get(CACHE_KEY);
    if (cached) full = JSON.parse(cached) as AdcpCapabilities;
  } catch { /* cache miss */ }

  if (!full) {
    full = STATIC_CAPABILITIES;
    try {
      await kv.put(CACHE_KEY, JSON.stringify(STATIC_CAPABILITIES), {
        expirationTtl: CACHE_TTL_SECONDS,
      });
    } catch { /* non-fatal */ }
  }

  if (!protocols || protocols.length === 0) return full;

  const requested = new Set(
    protocols.filter((p) => VALID_PROTOCOLS.has(p)),
  );

  const filtered: AdcpCapabilities = {
    adcp: full.adcp,
    supported_protocols: full.supported_protocols,
    ...(full.ext ? { ext: full.ext } : {}),
  };
  for (const key of PROTOCOL_BLOCK_KEYS) {
    if (requested.has(key) && full[key] !== undefined) {
      (filtered as Record<string, unknown>)[key] = full[key];
    }
  }
  return filtered;
}
