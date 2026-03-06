// src/mappers/signalMapper.ts

import type { CanonicalSignal } from "../types/signal";
import type { SignalSummary } from "../types/api";

export function toSignalSummary(signal: CanonicalSignal): SignalSummary {
  return {
    signalId: signal.signalId,
    name: signal.name,
    description: signal.description,
    categoryType: signal.categoryType,
    taxonomySystem: signal.taxonomySystem,
    ...(signal.externalTaxonomyId
      ? { externalTaxonomyId: signal.externalTaxonomyId }
      : {}),
    generationMode: signal.generationMode,
    activationSupported: signal.activationSupported,
    ...(signal.estimatedAudienceSize !== undefined
      ? { estimatedAudienceSize: signal.estimatedAudienceSize }
      : {}),
    destinations: signal.destinations,
    ...(signal.geography ? { geography: signal.geography } : {}),
    ...(signal.pricing
      ? {
          pricing: {
            model: signal.pricing.model,
            ...(signal.pricing.value !== undefined
              ? { value: signal.pricing.value }
              : {}),
            ...(signal.pricing.currency
              ? { currency: signal.pricing.currency }
              : {}),
          },
        }
      : {}),
    status: signal.status,
  };
}

export function toSignalSummaries(signals: CanonicalSignal[]): SignalSummary[] {
  return signals.map(toSignalSummary);
}
