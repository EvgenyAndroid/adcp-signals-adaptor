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

// Cache key bumped to v13 — Sec-38 C9 adds TTD + DV360 sandbox
// destinations (activation_supported=false until OAuth wired). v12
// baseline: three ext blocks (id_resolution, measurement, governance).
// v11 baseline: ext.dts declaring IAB Data Transparency Standard v1.2.
// v10 baseline: ext.ucp declaring UCP embedding bridge + concept registry.
const CACHE_KEY = "adcp_capabilities_v13";
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
        // Sec-38 C9: DSP-stage destinations. TTD sandbox + DV360 sandbox
        // are declared activation_supported=false because no real OAuth
        // handshake is wired yet — buyer agents should fall through to
        // mock_dsp for actual activation in this demo. Listing them at
        // capability level signals the integration roadmap.
        { id: "ttd_sandbox",      name: "The Trade Desk (sandbox)",   type: "dsp",         activation_supported: false },
        { id: "dv360_sandbox",    name: "DV360 (sandbox)",            type: "dsp",         activation_supported: false },
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
      // ext.id_resolution — cookieless posture + supported ID types.
      // The signal-level x_dts.data_sources + audience_precision_levels
      // already encode per-signal identity granularity; this hoists the
      // provider-wide posture into the handshake so a buyer agent knows
      // what IDs we can resolve before pulling rows. Graph partners are
      // declared as `stage` = sandbox|roadmap|live; none are live today
      // because this adaptor is a reference implementation.
      id_resolution: {
        supported: true,
        cookieless_ready: true,
        id_types_supported: [
          "cookie_3p",
          "maid_ios",
          "maid_android",
          "ctv_device",
          "uid2",
          "ramp_id",
          "id5",
          "hashed_email",
          "ip_only",
        ],
        graph_partners: [
          { name: "UID 2.0", stage: "sandbox", endpoint: null },
          { name: "ID5", stage: "sandbox", endpoint: null },
          { name: "LiveRamp RampID", stage: "roadmap", endpoint: null },
          { name: "Yahoo ConnectID", stage: "roadmap", endpoint: null },
        ],
        resolution_method: "derived_from_dts",
        resolution_surface:
          "/signals/{signal_agent_segment_id} x_dts.data_sources + audience_precision_levels",
      },
      // ext.measurement — reach/overlap/lift/delivery surfaces. Reach and
      // overlap are live (UI + /signals/overlap endpoint); lift and
      // delivery-sim are declared as "mock" because the demo renders
      // placeholder panels backed by synthetic numbers. Partner roadmap
      // lists the measurement vendors this adaptor is architected to
      // integrate with once connected.
      measurement: {
        supported: true,
        reach_forecasting: {
          supported: true,
          endpoint: "/signals/{id} (detail panel)",
          methodology: "logistic saturation against declared CPM + budget",
        },
        overlap_analysis: {
          supported: true,
          endpoint: "/signals/overlap",
          methodology: "category_affinity × min/max Jaccard heuristic",
        },
        lift_measurement: {
          supported: "mock",
          partners_roadmap: ["Nielsen", "IAS", "DV", "Kantar", "Circana"],
        },
        delivery_simulation: {
          supported: "mock",
          surface: "/signals/{id} detail panel (post-activation)",
        },
      },
      // ext.governance — audit log, sensitive-category flagging, opt-out.
      // The D1-backed tool log (migrations/0006_mcp_tool_calls.sql) retains
      // 7 days of MCP tool calls with 4KB arg truncation; buyer agents can
      // export via CSV. Sensitive categories (health/financial/political)
      // are surfaced via x_governance.sensitive on individual signals and
      // rendered as a pill in the UI.
      governance: {
        audit_log: {
          supported: true,
          endpoint: "/mcp/recent",
          retention_days: 7,
          export_format: "csv_download",
        },
        sensitive_category_flagging: {
          supported: true,
          categories_flagged: ["health", "financial", "political"],
          surface:
            "x_governance.sensitive block on signal + UI pill in signal detail",
        },
        opt_out_url:
          "https://adcp-signals-adaptor.evgeny-193.workers.dev/privacy#opt-out",
        audience_bias_governance_schema: {
          supported: true,
          version: "adcp_3.0_rc",
        },
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
