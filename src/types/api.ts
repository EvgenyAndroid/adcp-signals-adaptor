// src/types/api.ts
// AdCP spec-compliant HTTP request/response shapes

import type { SignalCategoryType, GenerationMode } from "./signal";

// ── Capabilities ──────────────────────────────────────────────────────────────

export interface CapabilitiesResponse {
  adcp: { major_versions: number[] };
  supported_protocols: string[];
  signals: {
    signal_categories: string[];
    dynamic_segment_generation: boolean;
    activation_mode: "async";
    provider: string;
    destinations: DestinationInfo[];
    limits: {
      max_signals_per_request: number;
      max_rules_per_segment: number;
    };
  };
}

export interface DestinationInfo {
  id: string;
  name: string;
  type: "dsp" | "cleanroom" | "cdp" | "measurement";
  activation_supported: boolean;
}

// ── Signal Search ─────────────────────────────────────────────────────────────

export interface SearchSignalsRequest {
  // Standard filters
  query?: string;
  categoryType?: SignalCategoryType;
  generationMode?: GenerationMode;
  taxonomyId?: string;
  geography?: string[];
  destination?: string;
  deployments?: Array<{ type: string; platform?: string; agent_url?: string }>;
  activationSupported?: boolean;
  limit?: number;
  offset?: number;
  // AdCP brief — natural language, triggers custom segment proposals
  brief?: string;
}

export interface SearchSignalsResponse {
  message: string;
  context_id: string;
  signals: SignalSummary[];
  // Custom proposals generated from brief (not yet created, activated on demand)
  proposals?: CustomSignalProposal[];
  count: number;
  totalCount: number;
  offset: number;
  hasMore: boolean;
  /** Universal trace payload for the slide-in panel UI. Every traceable
   *  endpoint emits this shape; renderer is generic. See types/trace.ts. */
  _trace?: import("./trace").TraceData;
}

// A proposed custom signal — not persisted until activated. Shares the
// pricing_options shape with SignalSummary (both validated on the wire
// against /schemas/core/vendor-pricing-option.json).
export interface CustomSignalProposal {
  signal_agent_segment_id: string;   // deterministic ID, valid for activation
  name: string;
  description: string;
  signal_type: "custom";
  category_type: string;
  estimated_audience_size: number;
  coverage_percentage: number;
  pricing_options: SignalSummary["pricing_options"];
  deployments: SignalDeployment[];
  generation_rationale: string;      // why this segment matches the brief
}

// AdCP Signals spec-compliant signal object
/**
 * Universal signal identifier per /schemas/core/signal-id.json.
 * Discriminated by `source`. We're a self-contained signals agent (not a
 * data-provider catalog mirror), so every signal we expose is the
 * `agent_native` variant — schema requires `source`, `agent_url`, `id`.
 *
 * Sec-31w: AAO `signal_owned` storyboard requires `source: "agent_native"`
 * (not `"agent"`). The two are semantically equivalent for our agent
 * (we ARE the source, not a wrapper around an external data provider),
 * but the storyboard's `search_owned_signals` step asserts the literal
 * string. Aligned to spec here so the badge issuer accepts our shape.
 */
export interface SignalIdAgent {
  source: "agent_native";
  agent_url: string;
  id: string;
}

export interface SignalSummary {
  /**
   * Universal signal identifier — required by the AdCP signals storyboard
   * baseline (validates `signals[0].signal_id.source` is present). Carries
   * the source discriminator buyers use to know whether the ID resolves to
   * an external catalog or is agent-native.
   */
  signal_id: SignalIdAgent;
  signal_agent_segment_id: string;
  name: string;
  description: string;
  signal_type: "marketplace" | "custom" | "owned";
  data_provider: string;
  coverage_percentage: number;
  deployments: SignalDeployment[];
  /**
   * Pricing options per /schemas/core/vendor-pricing-option.json.
   * HEAD schema is a discriminated union on `model`. We only ship the
   * CPM variant today (sufficient for demo / mock_cpm signals); the
   * union here keeps the shape open for future flat_fee / per_unit
   * expansions without another type change.
   */
  pricing_options: Array<{
    pricing_option_id: string;
  } & (
    | { model: "cpm"; cpm: number; currency: string }
    | { model: "flat_fee"; amount: number; period: "monthly" | "quarterly" | "annual" | "campaign"; currency: string }
  )>;
  category_type: SignalCategoryType;
  taxonomy_system: string;
  external_taxonomy_id?: string;
  generation_mode: GenerationMode;
  estimated_audience_size?: number;
  geography?: string[];
  status: string;
  x_dts?: DtsV12Label;
  x_ucp?: import("./ucp").UcpHybridPayload;
  /**
   * Cross-taxonomy bridge — deterministic predicted IDs in IAB 3.0,
   * LiveRamp AbiliTec, TTD DMP, Mastercard SpendingPulse, and Nielsen
   * so buyer agents can locate an equivalent audience in their native
   * taxonomy. Each entry carries a `stage` (live|modeled|roadmap) so
   * buyers know the confidence of the mapping. Built by
   * src/mappers/crossTaxonomy.ts.
   */
  x_cross_taxonomy?: Array<{
    system: string;
    id: string;
    label: string;
    stage: "live" | "modeled" | "roadmap";
  }>;
  /**
   * Sec-41 Tier 2/3 analytics facets — derived at mapper time from the
   * signal's metadata (no DB migration). See src/analytics/derivedFacets.ts.
   */
  x_analytics?: {
    seasonality: {
      monthly: number[];           // 12 multipliers, avg normalized to 1.0
      peakMonth: number;
      peakMultiplier: number;
      troughMonth: number;
      troughMultiplier: number;
      coefficientOfVariation: number;
    };
    decayHalfLifeDays: number;
    volatilityIndex: number;       // 0-100
    authorityScore: number;        // 0-100
    idStabilityClass: "stable" | "semi_stable" | "volatile";
  };
}

// Spec: discriminated union - type "platform" or "agent"
export interface SignalDeployment {
  type: "platform" | "agent";
  platform?: string;
  agent_url?: string;
  is_live: boolean;
  decisioning_platform_segment_id: string;
  activation_supported: boolean;
  /**
   * Activation key shape varies by deployment type per AdCP signals spec:
   *   - platform deployments expose `{ type: "segment_id", segment_id }`
   *   - agent deployments expose `{ type: "key_value", key, value }`
   *
   * Sec-31w: AAO `signal_owned` storyboard's `activate_on_agent` step
   * asserts the key_value shape literal-by-literal. Both shapes are
   * permitted by /schemas/core/signal-deployment.json.
   */
  activation_key?:
    | { type: "segment_id"; segment_id: string }
    | { type: "key_value"; key: string; value: string };
}

// ── Activation ────────────────────────────────────────────────────────────────

export interface ActivateSignalRequest {
  signalId: string;
  destination: string;
  /**
   * Destination kind. Defaults to "platform" (the legacy behaviour and the
   * shape every existing test exercises). When set to "agent", the
   * destination is a sales-agent URL — those aren't in the signal's
   * destinations whitelist (which enumerates downstream platforms only),
   * so the service skips the membership check. Per AdCP signals spec
   * docs/signals/specification.mdx:186, signal agents MUST accept both.
   */
  destinationType?: "platform" | "agent";
  accountId?: string;
  campaignId?: string;
  notes?: string;
  webhookUrl?: string;       // optional: POST status updates here when complete
  proposalData?: import("../types/signal").CanonicalSignal;  // for lazy custom signal creation
}

export interface ActivateSignalResponse {
  // AdCP spec: task_id for async polling
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  signal_agent_segment_id: string;
  // Webhook info
  webhook_url?: string;
  // Extended
  operationId: string;
  submittedAt: string;
}

// ── Operations ────────────────────────────────────────────────────────────────

// Aligned with @adcp/client ADCP_STATUS constants
export type OperationStatus = "submitted" | "working" | "completed" | "failed" | "canceled" | "rejected";

export interface OperationRecord {
  operationId: string;
  signalId: string;
  destination: string;
  accountId?: string;
  campaignId?: string;
  webhookUrl?: string;
  webhookFired: boolean;
  /**
   * Sec-15: how many times we've attempted webhook delivery so far
   * (0 = never attempted, MAX_WEBHOOK_ATTEMPTS = give up). Bounded
   * to stop runaway redelivery against a perpetual 5xx.
   */
  webhookAttempts: number;
  /**
   * Sec-15: earliest UTC ISO timestamp the next attempt is allowed.
   * The lazy poll-driven state machine checks this before re-firing,
   * giving us exponential backoff without a real scheduler. Undefined
   * = no backoff, fire on next poll.
   */
  webhookNextAttemptAt?: string;
  status: OperationStatus;
  submittedAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface GetOperationResponse {
  task_id: string;
  status: OperationStatus;
  signal_agent_segment_id: string;
  deployments?: Array<{
    type: string;
    platform?: string;
    is_live: boolean;
    activation_key?: { type: string; segment_id: string };
    estimated_activation_duration_minutes: number;
  }>;
  submittedAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
}


// ── DTS v1.2 ─────────────────────────────────────────────────────────────────
// IAB Tech Lab Data Transparency Standard v1.2 (April 2024 "Privacy Update")
// Embedded in signal objects as AdCP x_ extension field.

export type DtsRefreshCadence =
  | "Intra-day" | "Daily" | "Weekly" | "Monthly"
  | "Bi-Monthly" | "Quarterly" | "Bi-Annually" | "Annually" | "Static" | "N/A";

export type DtsDataSource =
  | "App Behavior" | "App Usage" | "Web Usage" | "Geo Location"
  | "Email" | "TV OTT or STB Device" | "Online Ecommerce"
  | "Credit Data" | "Loyalty Card" | "Transaction"
  | "Online Survey" | "Offline Survey"
  | "Public Record: Census" | "Public Record: Voter File" | "Public Record: Other"
  | "Offline Transaction";

export type DtsInclusionMethodology =
  | "Observed/Known" | "Declared" | "Inferred" | "Derived" | "Modeled";

export type DtsPrecisionLevel =
  | "Individual" | "Household" | "Business" | "Device" | "Browser" | "Geography";

export type DtsPrivacyMechanism =
  | "TCF (Europe)" | "GPP" | "MSPA" | "USPrivacy"
  | "NAI Opt Out" | "DAA" | "EDAA" | "DAAC" | "GPC"
  | "Other (Not Listed)" | "None";

export type DtsAudienceScope =
  | "Single domain / App"
  | "Cross-domain within O&O"
  | "Cross-domain outside O&O"
  | "N/A (Offline)";

export type DtsIdType =
  | "Cookie ID" | "Mobile ID" | "Platform ID" | "User-enabled ID";

export interface DtsV12Label {
  dts_version: "1.2";

  // Core fields
  provider_name: string;
  provider_domain: string;
  provider_email: string;
  audience_name: string;
  audience_id: string;
  taxonomy_id_list: string;           // IAB AT 1.1 node IDs, comma-separated
  audience_criteria: string;          // Inclusion logic, 500 char max
  audience_precision_levels: DtsPrecisionLevel[];
  audience_scope: DtsAudienceScope;
  originating_domain: string;
  audience_size: number;
  id_types: DtsIdType[];
  geocode_list: string;               // ISO-3166-1-alpha-3, pipe-separated
  privacy_compliance_mechanisms: DtsPrivacyMechanism[];
  privacy_policy_url: string;
  iab_techlab_compliant: "Yes" | "No";

  // Audience Details fields
  data_sources: DtsDataSource[];
  audience_inclusion_methodology: DtsInclusionMethodology;
  audience_expansion: "Yes" | "No";
  device_expansion: "Yes" | "No";
  audience_refresh: DtsRefreshCadence;
  lookback_window: DtsRefreshCadence;

  // Onboarder Details (conditional — required when data_sources includes offline)
  onboarder_match_keys: string;       // "N/A" for non-offline sources
  onboarder_audience_expansion: "Yes" | "No" | "N/A";
  onboarder_device_expansion: "Yes" | "No" | "N/A";
  onboarder_audience_precision_level: string; // "N/A" for non-offline sources

  // ── Phase D extension: policy attestations ─────────────────────────────
  // NOT in IAB DTS v1.2; proposed for v1.3 (or out-of-band sidecar).
  // Bridges the IAB content-trust layer (provenance / consent / freshness /
  // coverage) into the AdCP governance layer by letting a signal declare
  // WHICH agentic-advertising registry policies it claims compliance with.
  // Policy ids match the slugs in src/domain/policyRegistry.ts.
  policy_attestations?: PolicyAttestation[];
}

/**
 * One policy claim by the signal provider. Phase D extension.
 *
 * Layering:
 *   - IAB DTS = "what is this audience, where did it come from"
 *     (provenance/consent/freshness/coverage)
 *   - AdCP `check_governance` = "is using this audience for THIS plan
 *     allowed under THIS brand's policy stack" (3.0.1 added the
 *     `mode` field for enforcement posture)
 *   - `PolicyAttestation` = the SIGNAL's own claim about which policies
 *     it adheres to, regardless of plan/brand. Lets `check_governance`
 *     short-circuit when the signal pre-attests to relevant policies,
 *     and lets a buyer reject a signal that's silent on a `must` policy.
 *
 * `evidence_url` should point to a stable doc — runbook, audit log,
 * compliance attestation page. We don't validate the URL contents
 * here; consumers do.
 */
export interface PolicyAttestation {
  policy_id: string;                        // matches RegistryPolicy.policy_id
  claim: "compliant" | "exempt" | "out_of_scope" | "not_applicable" | "unknown";
  attested_at: string;                      // ISO-8601 timestamp
  attestor: string;                         // who attested (org name)
  evidence_url?: string;                    // link to attestation evidence
  notes?: string;                           // free text, ≤ 280 chars
}

// ── Errors ────────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
  requestId?: string;
}