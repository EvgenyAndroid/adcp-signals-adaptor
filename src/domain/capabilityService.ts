// src/domain/capabilityService.ts
// Response shape conforms to AdCP v3 schema:
//   https://adcontextprotocol.org/schemas/v3/protocol/get-adcp-capabilities-response.json
//
// Top-level keys allowed by v3: adcp, supported_protocols, account, media_buy,
// signals, governance, sponsored_intelligence, brand, creative,
// extensions_supported, last_updated, errors, context, ext.
// UCP lives under `ext.ucp` (schema-sanctioned extension slot).
//
// Cache key bumped to v6 for the v3-conformant shape (ucp moved to ext)
// then v7 for the HEAD-schema-conformant shape (adds adcp.idempotency).

// Cache key bumped to v11 — Sec-32 follow-up adds ext.dts declaring IAB
// Data Transparency Standard v1.2 support at the capabilities level.
// Every signal already carries a full x_dts label; this hoists that
// capability into the handshake so buyer agents can detect DTS support
// before pulling the catalog.
const CACHE_KEY = "adcp_capabilities_v11";
const CACHE_TTL_SECONDS = 3600;

import { buildUcpCapability, type UcpCapabilityEnv } from "../ucp/vacDeclaration";

const VALID_PROTOCOLS = new Set([
  "media_buy",
  "signals",
  "governance",
  "sponsored_intelligence",
  "creative",
  "brand",
]);

type AdcpCapabilities = {
  adcp: {
    major_versions: number[];
    /**
     * Idempotency replay-window declaration. Required by the HEAD AdCP
     * capabilities schema (per upstream PR #2315 — the field landed without
     * a versioned schema tag, so rc.{1,2,3} validators don't catch its
     * absence; the live evaluator runs HEAD and does). Seller declares how
     * long a canonical response is retained for an idempotency_key.
     */
    idempotency: { supported: true; replay_ttl_seconds: number };
  };
  supported_protocols: string[];
  signals?: unknown;
  media_buy?: unknown;
  governance?: unknown;
  sponsored_intelligence?: unknown;
  creative?: unknown;
  brand?: unknown;
  ext?: Record<string, unknown>;
  /**
   * Opaque correlation data echoed unchanged in responses. Capability-discovery
   * storyboards send context.correlation_id and assert the response carries it
   * back. Populated per-request by the caller (MCP handler / REST route) after
   * getCapabilities returns; not part of the static capability set.
   */
  context?: Record<string, unknown>;
};

// Protocol + provider metadata is static; only the ext.ucp block varies
// by engine env. Build the full capability object per-request (cheap — it's
// all constant-time), and cache it in KV so we don't rebuild on every call.
function buildStaticCapabilities(env: UcpCapabilityEnv): AdcpCapabilities {
  return {
    adcp: {
      major_versions: [2, 3],
      // HEAD schema models idempotency as a discriminated union keyed on
      // `supported`. The IdempotencySupported variant requires both
      // `supported: true` and `replay_ttl_seconds` (3600..604800 per spec).
      // Mutating tools (activate_signal) honour this — see activationRepo.
      idempotency: { supported: true, replay_ttl_seconds: 86400 },
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
        { id: "mock_dsp",         name: "Mock DSP",                   type: "dsp",         activation_supported: true  },
        { id: "mock_cleanroom",   name: "Mock Clean Room",            type: "cleanroom",   activation_supported: true  },
        { id: "mock_cdp",         name: "Mock CDP",                   type: "cdp",         activation_supported: true  },
        { id: "mock_measurement", name: "Mock Measurement Platform",  type: "measurement", activation_supported: false },
      ],
      limits: {
        max_signals_per_request: 100,
        max_rules_per_segment: 6,
        // Sec-25b: advertise the default page size so callers know what
        // they'll get when they omit `max_results`. Rich DTS+UCP payloads
        // make 5 rows ≈50 KB; larger pages need an explicit `max_results`.
        // Follows the same shape as the other declared limits.
        default_max_results: 5,
      },
    },
    ext: {
      // ext.ucp now mirrors the real engine. Previously this was a static
      // UCP_CAPABILITY constant that always declared the pseudo bridge,
      // so /capabilities contradicted /ucp/gts and /mcp serverInfo.ucp
      // on any deployment where EMBEDDING_ENGINE=llm.
      ucp: buildUcpCapability(env),
      // IAB Tech Lab Data Transparency Standard v1.2 (April 2024 "Privacy
      // Update"). Declares handshake-level support so a buyer agent can
      // detect compliance before pulling the catalog. Every signal
      // returned by get_signals carries the full per-row x_dts label —
      // provider info, audience criteria, privacy mechanisms, precision
      // levels, data sources, inclusion methodology, and onboarder
      // details when the source is offline. Label shape lives in
      // src/types/api.ts DtsV12Label.
      dts: {
        supported: true,
        version: "1.2",
        iab_techlab_compliant: true,
        label_field: "x_dts",
        // Which privacy-framework signals we emit on every label
        privacy_compliance_mechanisms: [
          "TCF (Europe)", "GPP", "MSPA", "USPrivacy", "GPC",
        ],
        // Declared precision levels this agent's audiences resolve to
        supported_precision_levels: [
          "Individual", "Household", "Device", "Browser", "Geography",
        ],
        // Whether we serve offline-sourced audiences (onboarder section
        // of the label becomes populated rather than "N/A")
        offline_sources_supported: true,
        // Document URL the label references for the data-provider's
        // privacy practices
        provider_privacy_policy_url: "https://adcp-signals-adaptor.evgeny-193.workers.dev/privacy",
      },
    },
  };
}

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
  env?: UcpCapabilityEnv,
): Promise<AdcpCapabilities> {
  let full: AdcpCapabilities | null = null;
  try {
    const cached = await kv.get(CACHE_KEY);
    if (cached) full = JSON.parse(cached) as AdcpCapabilities;
  } catch { /* cache miss */ }

  if (!full) {
    // env is optional for backwards compat with test shims; default to an
    // empty object which makes buildUcpCapability fall through to the
    // pseudo declaration (correct for tests that don't set EMBEDDING_ENGINE).
    full = buildStaticCapabilities(env ?? {});
    try {
      await kv.put(CACHE_KEY, JSON.stringify(full), {
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
