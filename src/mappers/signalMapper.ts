// src/mappers/signalMapper.ts
import { toUcpHybridPayload } from "../ucp/ucpMapper";
import { buildCrossTaxonomy } from "./crossTaxonomy";
import {
  deriveSeasonality,
  deriveDecayHalfLifeDays,
  deriveVolatilityIndex,
  deriveAuthorityScore,
  deriveIdStabilityClass,
} from "../analytics/derivedFacets";
// Maps CanonicalSignal → AdCP spec response shape.
// Includes buildDtsLabel() which generates a full DTS v1.2 label
// embedded as x_dts — the AdCP v2.5+ extension field mechanism.

import type { CanonicalSignal } from "../types/signal";
import type {
  SignalSummary,
  SignalDeployment,
  DtsV12Label,
  DtsDataSource,
  DtsInclusionMethodology,
  DtsRefreshCadence,
} from "../types/api";

const DATA_PROVIDER = "AdCP Signals Adaptor - Demo Provider (Evgeny)";
const PROVIDER_DOMAIN = "adcp-signals-adaptor.evgeny-193.workers.dev";
const PROVIDER_EMAIL = "evgeny@evgeny.dev";
const PRIVACY_POLICY_URL = `https://${PROVIDER_DOMAIN}/privacy`;
const TOTAL_ADDRESSABLE = 240_000_000;

// Self-identifying agent URL for signal_id.agent_url (per
// /schemas/core/signal-id.json agent-variant). Hardcoded to the deployed
// MCP endpoint; matches the worker we ship from. If we ever need this to be
// per-deployment dynamic (staging vs prod), thread it through env.
const SELF_AGENT_URL = `https://${PROVIDER_DOMAIN}/mcp`;

const DESTINATION_PLATFORM_MAP: Record<string, { activationSupported: boolean }> = {
  mock_dsp:         { activationSupported: true },
  mock_cleanroom:   { activationSupported: true },
  mock_cdp:         { activationSupported: true },
  mock_measurement: { activationSupported: false },
};

// ── DTS v1.2 label builder ────────────────────────────────────────────────────

/**
 * Maps CanonicalSignal.sourceSystems → DTS v1.2 data_sources enum values.
 * sourceSystems are set at signal creation time in signalModel.ts / enrichedSignalModel.ts.
 */
function inferDataSources(signal: CanonicalSignal): DtsDataSource[] {
  const sources = signal.sourceSystems ?? [];
  const refs = signal.rawSourceRefs ?? [];
  const result = new Set<DtsDataSource>();

  for (const s of sources) {
    if (s.includes("census") || refs.some((r) => r.startsWith("ACS_"))) {
      result.add("Public Record: Census");
    }
    if (s.includes("dma") || s.includes("geo") || s.includes("nielsen")) {
      result.add("Geo Location");
    }
    if (s.includes("taxonomy_bridge") || s.includes("content")) {
      result.add("Web Usage");
      result.add("App Behavior");
    }
    if (s.includes("acr") || s.includes("ctv") || s.includes("stb")) {
      result.add("TV OTT or STB Device");
    }
    if (s.includes("demographics") || s.includes("interests") || s.includes("rule_engine") || s.includes("brief_generator")) {
      result.add("Online Survey");
    }
  }

  // Fallback — every signal has at least one source
  if (result.size === 0) result.add("Online Survey");

  return Array.from(result);
}

/**
 * Maps generation mode + source systems → DTS audience_inclusion_methodology.
 */
function inferInclusionMethodology(signal: CanonicalSignal): DtsInclusionMethodology {
  const sources = signal.sourceSystems ?? [];
  const refs = signal.rawSourceRefs ?? [];

  // ACR / CTV / direct observation
  if (sources.some((s) => s.includes("acr") || s.includes("ctv"))) return "Observed/Known";
  // Census/DMA — observed at aggregate, derived at individual
  if (refs.some((r) => r.startsWith("ACS_"))) return "Derived";
  // Nielsen DMA is directly observed geographic data
  if (sources.some((s) => s.includes("dma") || s.includes("nielsen"))) return "Observed/Known";
  // Taxonomy bridge — derived from cross-taxonomy mapping
  if (sources.some((s) => s.includes("taxonomy_bridge"))) return "Derived";
  // Rule engine composites — derived from known dimensions
  if (signal.generationMode === "derived") return "Derived";
  // Brief-generated and seeded — modeled/estimated
  return "Modeled";
}

/**
 * Maps source systems → DTS audience_refresh cadence.
 */
function inferRefreshCadence(signal: CanonicalSignal): DtsRefreshCadence {
  const sources = signal.sourceSystems ?? [];
  const refs = signal.rawSourceRefs ?? [];

  if (sources.some((s) => s.includes("acr") || s.includes("ctv"))) return "Weekly";
  if (refs.some((r) => r.startsWith("ACS_")) || sources.some((s) => s.includes("census"))) return "Annually";
  if (sources.some((s) => s.includes("dma") || s.includes("nielsen"))) return "Annually";
  return "Static";
}

/**
 * Derives taxonomy_id_list from external taxonomy ID and rawSourceRefs.
 * DTS spec: comma-separated IAB AT 1.1 node IDs. Pipe for Purchase Intent modifiers.
 */
function buildTaxonomyIdList(signal: CanonicalSignal): string {
  const ids = new Set<string>();
  if (signal.externalTaxonomyId) ids.add(signal.externalTaxonomyId);
  for (const ref of signal.rawSourceRefs ?? []) {
    // taxonomy bridge refs carry IAB node IDs directly
    if (/^\d+$/.test(ref)) ids.add(ref);
  }
  return ids.size > 0 ? Array.from(ids).join(",") : "0"; // 0 = uncategorized
}

/**
 * Derives geocode_list (ISO-3166-1-alpha-3, pipe-separated) from geography field.
 * DMA-level signals get their DMA code embedded too.
 */
function buildGeocodeList(signal: CanonicalSignal): string {
  const geo = signal.geography ?? [];
  const refs = signal.rawSourceRefs ?? [];

  const codes: string[] = ["USA"]; // All signals are US-sourced

  // DMA codes from rawSourceRefs e.g. "DMA-501"
  for (const ref of refs) {
    if (ref.startsWith("DMA-")) codes.push(ref);
  }

  // DMA codes from geography field e.g. ["DMA-501", "NY", "NJ"]
  for (const g of geo) {
    if (g.startsWith("DMA-")) codes.push(g);
  }

  return [...new Set(codes)].join("|");
}

/**
 * Builds a plain-language audience_criteria string (500 char max per DTS spec).
 */
function buildAudienceCriteria(signal: CanonicalSignal): string {
  const parts: string[] = [];

  // Use rules if available (derived/dynamic signals)
  if (signal.rules && signal.rules.length > 0) {
    const ruleDescs = signal.rules.map(
      (r) => `${r.dimension}=${Array.isArray(r.value) ? r.value.join("|") : r.value}`
    );
    parts.push(`Rule-based: ${ruleDescs.join(" ∩ ")}.`);
  } else {
    parts.push(signal.description?.slice(0, 200) ?? "");
  }

  // Source citation
  const refs = signal.rawSourceRefs ?? [];
  if (refs.length > 0) {
    parts.push(`Source refs: ${refs.join(", ")}.`);
  }

  // Modeling note for modeled signals
  const methodology = inferInclusionMethodology(signal);
  if (methodology === "Modeled") {
    parts.push("Modeled estimate. Not derived from real user-level data.");
  }

  return parts.join(" ").slice(0, 500);
}

/**
 * Build full DTS v1.2 label from CanonicalSignal.
 */
export function buildDtsLabel(signal: CanonicalSignal): DtsV12Label {
  const dataSources = inferDataSources(signal);
  const methodology = inferInclusionMethodology(signal);
  const refresh = inferRefreshCadence(signal);
  const hasOfflineSource = dataSources.some(
    (s) => s.startsWith("Offline") || s.startsWith("Public Record")
  );

  return {
    dts_version: "1.2",

    // Core fields
    provider_name: DATA_PROVIDER,
    provider_domain: PROVIDER_DOMAIN,
    provider_email: PROVIDER_EMAIL,
    audience_name: signal.name,
    audience_id: signal.signalId,
    taxonomy_id_list: buildTaxonomyIdList(signal),
    audience_criteria: buildAudienceCriteria(signal),
    audience_precision_levels:
      signal.categoryType === "geo" ? ["Geography"] : ["Household"],
    audience_scope: "Cross-domain outside O&O",
    originating_domain: "N/A (Cross-domain)",
    audience_size: signal.estimatedAudienceSize ?? 0,
    id_types: ["Platform ID"],
    geocode_list: buildGeocodeList(signal),
    privacy_compliance_mechanisms: ["GPP", "MSPA"],
    privacy_policy_url: PRIVACY_POLICY_URL,
    iab_techlab_compliant: "No", // demo implementation

    // Audience Details
    data_sources: dataSources,
    audience_inclusion_methodology: methodology,
    audience_expansion: "No",
    device_expansion: "No",
    audience_refresh: refresh,
    lookback_window: refresh === "Static" ? "N/A" : refresh,

    // Onboarder Details (N/A unless offline sources present)
    onboarder_match_keys: hasOfflineSource ? "Postal / Geographic Code" : "N/A",
    onboarder_audience_expansion: hasOfflineSource ? "No" : "N/A",
    onboarder_device_expansion: hasOfflineSource ? "No" : "N/A",
    onboarder_audience_precision_level: hasOfflineSource ? "Geography" : "N/A",
  };
}

// ── Signal mapper ─────────────────────────────────────────────────────────────

export function toSignalSummary(signal: CanonicalSignal): SignalSummary {
  const coveragePct = signal.estimatedAudienceSize
    ? Math.min(99, Math.round((signal.estimatedAudienceSize / TOTAL_ADDRESSABLE) * 100 * 10) / 10)
    : 0;

  const signalType: SignalSummary["signal_type"] =
    signal.generationMode === "dynamic" ? "custom" : "marketplace";

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
        ? { activation_key: { type: "segment_id", segment_id: platformSegmentId } }
        : {}),
    };
  });

  const pricingCpm = signal.pricing?.model === "mock_cpm" ? signal.pricing.value ?? 0 : 0;
  const pricingCurrency = signal.pricing?.currency ?? "USD";
  const pricingOptionId = `opt-${signal.pricing?.model ?? "none"}-${signal.signalId}`.slice(0, 64);

  // Sec-21: HEAD pricing schema (/schemas/core/signal-pricing.json) is a
  // discriminated union on `model`. CPM variant requires { model: "cpm",
  // cpm: number >= 0, currency: ISO 4217 }. pricing_options is required
  // with minItems: 1 — signals lacking explicit pricing get a default
  // 0-cpm sentinel so buyers still have a pricing_option_id to reference
  // in the storyboard's context_outputs.
  const pricingOptions: SignalSummary["pricing_options"] = signal.pricing
    ? [
        {
          pricing_option_id: pricingOptionId,
          model: "cpm" as const,
          cpm: pricingCpm,
          currency: pricingCurrency,
        },
      ]
    : [
        {
          pricing_option_id: `opt-default-${signal.signalId}`.slice(0, 64),
          model: "cpm" as const,
          cpm: 0,
          currency: pricingCurrency,
        },
      ];

  return {
    // Universal signal_id required by the AdCP signals storyboard baseline.
    // We're an agent-native signals service (no upstream data-provider
    // catalog), so source is always "agent". The internal signalId already
    // matches the schema's `^[a-zA-Z0-9_-]+$` pattern.
    signal_id: {
      source: "agent" as const,
      agent_url: SELF_AGENT_URL,
      id: signal.signalId,
    },
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
    x_dts: buildDtsLabel(signal),
    x_ucp: toUcpHybridPayload(signal, buildDtsLabel(signal)),
    x_cross_taxonomy: buildCrossTaxonomy(signal),
    x_analytics: (() => {
      // Sec-41: derived Tier 2/3 facets. All pure functions, deterministic.
      const seasonality = deriveSeasonality(signal);
      return {
        seasonality,
        decayHalfLifeDays: deriveDecayHalfLifeDays(signal),
        volatilityIndex: deriveVolatilityIndex(seasonality),
        authorityScore: deriveAuthorityScore(signal),
        idStabilityClass: deriveIdStabilityClass(signal),
      };
    })(),
  };
}

export function toSignalSummaries(signals: CanonicalSignal[]): SignalSummary[] {
  return signals.map(toSignalSummary);
}