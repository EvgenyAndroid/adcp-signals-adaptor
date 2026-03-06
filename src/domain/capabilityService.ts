// src/domain/capabilityService.ts

import type { CapabilitiesResponse } from "../types/api";
import type { KVNamespace } from "@cloudflare/workers-types";

const CACHE_KEY = "adcp_capabilities_v1";
const CACHE_TTL_SECONDS = 3600; // 1 hour

const STATIC_CAPABILITIES: CapabilitiesResponse = {
  provider: "AdCP Signals Adaptor - Demo Provider",
  protocolVersion: "3.0-rc",
  adcpVersion: "3.0-rc",
  supportedOperations: [
    "get_adcp_capabilities",
    "get_signals",
    "activate_signal",
    "generate_custom_signal",
    "get_operation_status",
  ],
  signalCategories: [
    "demographic",
    "interest",
    "purchase_intent",
    "geo",
    "composite",
  ],
  activationMode: "async",
  authMode: "api_key_demo",
  outputFormats: ["json"],
  dynamicSegmentGeneration: true,
  destinations: [
    {
      id: "mock_dsp",
      name: "Mock DSP",
      type: "dsp",
      activationSupported: true,
    },
    {
      id: "mock_cleanroom",
      name: "Mock Clean Room",
      type: "cleanroom",
      activationSupported: true,
    },
    {
      id: "mock_cdp",
      name: "Mock CDP",
      type: "cdp",
      activationSupported: true,
    },
    {
      id: "mock_measurement",
      name: "Mock Measurement Platform",
      type: "measurement",
      activationSupported: false,
    },
  ],
  limits: {
    maxSignalsPerRequest: 100,
    maxRulesPerSegment: 6,
    maxAudienceSizeEstimate: 50_000_000,
  },
};

export async function getCapabilities(
  kv: KVNamespace
): Promise<CapabilitiesResponse> {
  // Try cache first
  try {
    const cached = await kv.get(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as CapabilitiesResponse;
    }
  } catch {
    // Cache miss or parse error - fall through to static
  }

  // Cache for next time
  try {
    await kv.put(CACHE_KEY, JSON.stringify(STATIC_CAPABILITIES), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch {
    // Non-fatal: continue without caching
  }

  return STATIC_CAPABILITIES;
}
