// src/mappers/signalMapper.ts

import type { CanonicalSignal } from "../types/signal";
import type { SignalSummary, SignalDeployment } from "../types/api";

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

  // spec field: signal_type (marketplace | custom | owned)
  const signalType: SignalSummary["signal_type"] =
    signal.generationMode === "dynamic" ? "custom" : "marketplace";

  // deployments: activation_key must be an object with type field when is_live
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
      ...(isLive
        ? {
            activation_key: {
              type: "segment_id",
              segment_id: platformSegmentId,
            },
          }
        : {}),
    };
  });

  // Build both pricing (flat) and pricing_options (array) to satisfy spec validators
  const pricingCpm = signal.pricing?.model === "mock_cpm" ? signal.pricing.value ?? 0 : undefined;
  const pricingCurrency = signal.pricing?.currency ?? "USD";
  const pricingOptionId = `opt-${signal.pricing?.model ?? "none"}-${signal.signalId}`.slice(0, 64);

  const pricingOptions = signal.pricing
    ? [
        {
          pricing_option_id: pricingOptionId,
          pricing_model: signal.pricing.model === "mock_cpm" ? "cpm" : "flat_fee",
          ...(pricingCpm !== undefined ? { cpm: pricingCpm } : {}),
          currency: pricingCurrency,
        },
      ]
    : [];

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
  };
}

export function toSignalSummaries(signals: CanonicalSignal[]): SignalSummary[] {
  return signals.map(toSignalSummary);
}
