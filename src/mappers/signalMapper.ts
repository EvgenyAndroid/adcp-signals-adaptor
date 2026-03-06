// src/mappers/signalMapper.ts
// Maps canonical internal signals to AdCP spec-compliant response shapes.

import type { CanonicalSignal } from "../types/signal";
import type { SignalSummary, SignalDeployment, SignalPricingOption } from "../types/api";

const DATA_PROVIDER = "AdCP Signals Adaptor - Demo Provider (Evgeny)";
const TOTAL_ADDRESSABLE = 240_000_000;

const DESTINATION_PLATFORM_MAP: Record<string, { activationSupported: boolean }> = {
  mock_dsp:         { activationSupported: true },
  mock_cleanroom:   { activationSupported: true },
  mock_cdp:         { activationSupported: true },
  mock_measurement: { activationSupported: false },
};

export function toSignalSummary(signal: CanonicalSignal): SignalSummary {
  const coveragePct = signal.estimatedAudienceSize
    ? Math.min(99, Math.round((signal.estimatedAudienceSize / TOTAL_ADDRESSABLE) * 100 * 10) / 10)
    : 0;

  const signalType: SignalSummary["signal_type"] =
    signal.generationMode === "dynamic" ? "custom" : "marketplace";

  // Spec: discriminated union with type: "platform", field name is "platform" not "decisioning_platform"
  const deployments: SignalDeployment[] = signal.destinations.map((dest) => {
    const platform = DESTINATION_PLATFORM_MAP[dest] ?? { activationSupported: true };
    return {
      type: "platform",
      platform: dest,
      is_live: signal.status === "available",
      decisioning_platform_segment_id: `${dest}_${signal.signalId}`,
      activation_supported: platform.activationSupported,
    };
  });

  // Spec: pricing_option_id required, field is "cpm" not "value" for CPM model
  const pricingOptions: SignalPricingOption[] = signal.pricing
    ? [
        {
          pricing_option_id: `opt-${signal.pricing.model}-${signal.signalId}`.slice(0, 64),
          model: signal.pricing.model === "mock_cpm" ? "cpm"
               : signal.pricing.model === "mock_flat" ? "flat_fee"
               : "none",
          ...(signal.pricing.model === "mock_cpm" && signal.pricing.value !== undefined
            ? { cpm: signal.pricing.value }
            : {}),
          ...(signal.pricing.model === "mock_flat" && signal.pricing.value !== undefined
            ? { amount: signal.pricing.value }
            : {}),
          ...(signal.pricing.currency ? { currency: signal.pricing.currency } : {}),
        },
      ]
    : [{ pricing_option_id: `opt-none-${signal.signalId}`.slice(0, 64), model: "none" }];

  return {
    signal_agent_segment_id: signal.signalId,
    name: signal.name,
    description: signal.description,
    signal_type: signalType,
    data_provider: DATA_PROVIDER,
    coverage_percentage: coveragePct,
    deployments,
    pricing_options: pricingOptions,

    category_type: signal.categoryType,
    taxonomy_system: signal.taxonomySystem,
    ...(signal.externalTaxonomyId ? { external_taxonomy_id: signal.externalTaxonomyId } : {}),
    generation_mode: signal.generationMode,
    ...(signal.estimatedAudienceSize !== undefined
      ? { estimated_audience_size: signal.estimatedAudienceSize }
      : {}),
    ...(signal.geography ? { geography: signal.geography } : {}),
    status: signal.status,
    signalId: signal.signalId,
  };
}

export function toSignalSummaries(signals: CanonicalSignal[]): SignalSummary[] {
  return signals.map(toSignalSummary);
}
