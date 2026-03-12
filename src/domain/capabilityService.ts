// src/domain/capabilityService.ts
// AdCP capabilities envelope — KV-cached per engine type.
//
// CHANGELOG (fix):
//   - Replaced static UCP_CAPABILITY import with buildUcpCapability(engine) call
//     so the ucp block reflects the active embedding engine (llm vs pseudo).
//   - Cache key bumped to v5 (was v4) to bust any stale KV entry that was
//     serving incorrect pseudo-v1 constants while LLM engine was active.
//   - getCapabilities() now accepts Env so it can read EMBEDDING_ENGINE +
//     OPENAI_API_KEY to determine the active engine.
//
// @adcp/client SDK: COMPATIBLE_ADCP_VERSIONS = ['v2.5', 'v2.6', 'v3', ...]
// SIGNALS_TOOLS = ['get_signals', 'activate_signal']

import type { Env } from "../types/env";
import { buildUcpCapability } from "../ucp/vacDeclaration";

// Cache key is engine-scoped so switching engines invalidates automatically.
const CACHE_KEY_LLM    = "adcp_capabilities_v5_llm";
const CACHE_KEY_PSEUDO = "adcp_capabilities_v5_pseudo";
const CACHE_TTL_SECONDS = 3600; // 1 hour

// ── Static signals block (engine-independent) ─────────────────────────────────

const STATIC_SIGNALS = {
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
    { id: "mock_dsp",         name: "Mock DSP",                  type: "dsp",         activation_supported: true  },
    { id: "mock_cleanroom",   name: "Mock Clean Room",           type: "cleanroom",   activation_supported: true  },
    { id: "mock_cdp",         name: "Mock CDP",                  type: "cdp",         activation_supported: true  },
    { id: "mock_measurement", name: "Mock Measurement Platform", type: "measurement", activation_supported: false },
  ],
  limits: {
    max_signals_per_request: 100,
    max_rules_per_segment:   6,
  },
};

// ── Engine resolution ─────────────────────────────────────────────────────────

function resolveEngine(env: Env): "llm" | "pseudo" {
  // Match the same logic as createEmbeddingEngine() in embeddingEngine.ts
  if (env.EMBEDDING_ENGINE === "llm" && env.OPENAI_API_KEY) {
    return "llm";
  }
  return "pseudo";
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function getCapabilities(kv: KVNamespace, env: Env): Promise<object> {
  const engine  = resolveEngine(env);
  const cacheKey = engine === "llm" ? CACHE_KEY_LLM : CACHE_KEY_PSEUDO;

  // Try cache first
  try {
    const cached = await kv.get(cacheKey);
    if (cached) return JSON.parse(cached) as object;
  } catch { /* cache miss — proceed to build */ }

  const capabilities = {
    adcp: {
      major_versions: [2, 3], // SDK confirms v2.5, v2.6, v3 all compatible
    },
    supported_protocols: ["signals"],
    signals: STATIC_SIGNALS,
    ucp: buildUcpCapability(engine),
  };

  // Write to cache (non-fatal on failure)
  try {
    await kv.put(cacheKey, JSON.stringify(capabilities), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch { /* non-fatal */ }

  return capabilities;
}
