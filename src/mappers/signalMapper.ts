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

  // Spec uses catalog_type: marketplace | custom | owned
  const catalogType: SignalSummary["catalog_type"] =
    signal.generationMode === "dynamic" ? "custom" : "marketplace";

  // Deployments: add activation_key when is_live = true (spec requirement)
  const deployments: SignalDeployment[] = signal.destinations.map((dest) => {
    const platform = DESTINATION_PLATFORM_MAP[dest] ?? { activationSupported: true };
    const isLive = signal.status === "available";
    const platformSegmentId = `${dest}_${signal.signalId}`;
    return {
      type: "platform",
      platform: dest,
      is_live: isLive,
      decisioning_platform_segment_id: platformSegmentId,
      activation_supported: platform.activationSupported,
      // Required by spec when is_live: true
      ...(isLive ? { activation_key: platformSegmentId } : {}),
    };
  });

  // pricing_options with required pricing_option_id and cpm field
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
    : [{ pricing_option_id: `opt-none-${signal.signalId}`.slice(0, 64), model: "none" as const }];

  return {
    // AdCP spec required
    signal_agent_segment_id: signal.signalId,
    name: signal.name,
    description: signal.description,
    catalog_type: catalogType,          // spec field name (not signal_type)
    data_provider: DATA_PROVIDER,
    coverage_percentage: coveragePct,
    deployments,
    pricing_options: pricingOptions,

    // Extended metadata
    category_type: signal.categoryType,
    taxonomy_system: signal.taxonomySystem,
    ...(signal.externalTaxonomyId ? { external_taxonomy_id: signal.externalTaxonomyId } : {}),
    generation_mode: signal.generationMode,
    ...(signal.estimatedAudienceSize !== undefined
      ? { estimated_audience_size: signal.estimatedAudienceSize }
      : {}),
    ...(signal.geography ? { geography: signal.geography } : {}),
    status: signal.status,
    // signalId intentionally omitted — not in AdCP spec
  };
}

export function toSignalSummaries(signals: CanonicalSignal[]): SignalSummary[] {
  return signals.map(toSignalSummary);
}
