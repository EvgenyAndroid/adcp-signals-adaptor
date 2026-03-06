// src/mappers/signalMapper.ts
// Maps canonical internal signals to AdCP spec-compliant response shapes.

import type { CanonicalSignal } from "../types/signal";
import type { SignalSummary, SignalDeployment, SignalPricingOption } from "../types/api";

const DATA_PROVIDER = "AdCP Signals Adaptor - Demo Provider (Evgeny)";
const TOTAL_ADDRESSABLE = 240_000_000; // US adult internet baseline

// Maps internal destination IDs to spec deployment objects
const DESTINATION_PLATFORM_MAP: Record<string, { name: string; activationSupported: boolean }> = {
  mock_dsp:         { name: "Mock DSP",                 activationSupported: true },
  mock_cleanroom:   { name: "Mock Clean Room",           activationSupported: true },
  mock_cdp:         { name: "Mock CDP",                  activationSupported: true },
  mock_measurement: { name: "Mock Measurement Platform", activationSupported: false },
};

export function toSignalSummary(signal: CanonicalSignal): SignalSummary {
  // coverage_percentage: audience size as % of total addressable, capped at 99
  const coveragePct = signal.estimatedAudienceSize
    ? Math.min(99, Math.round((signal.estimatedAudienceSize / TOTAL_ADDRESSABLE) * 100 * 10) / 10)
    : 0;

  // signal_type: dynamic = "custom", seeded catalog = "marketplace"
  const signalType: SignalSummary["signal_type"] =
    signal.generationMode === "dynamic"
      ? "custom"
      : signal.generationMode === "derived"
      ? "marketplace"
      : "marketplace";

  // Build deployments array from destinations
  const deployments: SignalDeployment[] = signal.destinations.map((dest) => {
    const platform = DESTINATION_PLATFORM_MAP[dest] ?? {
      name: dest,
      activationSupported: true,
    };
    return {
      decisioning_platform: dest,
      is_live: signal.status === "available",
      decisioning_platform_segment_id: `${dest}_${signal.signalId}`,
      activation_supported: platform.activationSupported,
    };
  });

  // pricing_options array — map single pricing to array format
  const pricingOptions: SignalPricingOption[] = signal.pricing
    ? [
        {
          model: signal.pricing.model === "mock_cpm"
            ? "cpm"
            : signal.pricing.model === "mock_flat"
            ? "flat"
            : "none",
          ...(signal.pricing.value !== undefined ? { value: signal.pricing.value } : {}),
          ...(signal.pricing.currency ? { currency: signal.pricing.currency } : {}),
          description: signal.pricing.model === "mock_cpm"
            ? `$${signal.pricing.value} CPM (demo rate)`
            : "Demo pricing",
        },
      ]
    : [{ model: "none", description: "No pricing configured" }];

  return {
    // AdCP spec required
    signal_agent_segment_id: signal.signalId,
    name: signal.name,
    description: signal.description,
    signal_type: signalType,
    data_provider: DATA_PROVIDER,
    coverage_percentage: coveragePct,
    deployments,
    pricing_options: pricingOptions,

    // Extended metadata
    category_type: signal.categoryType,
    taxonomy_system: signal.taxonomySystem,
    ...(signal.externalTaxonomyId
      ? { external_taxonomy_id: signal.externalTaxonomyId }
      : {}),
    generation_mode: signal.generationMode,
    ...(signal.estimatedAudienceSize !== undefined
      ? { estimated_audience_size: signal.estimatedAudienceSize }
      : {}),
    ...(signal.geography ? { geography: signal.geography } : {}),
    status: signal.status,

    // Internal ID kept for activation compatibility
    signalId: signal.signalId,
  };
}

export function toSignalSummaries(signals: CanonicalSignal[]): SignalSummary[] {
  return signals.map(toSignalSummary);
}
