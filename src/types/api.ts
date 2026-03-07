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
  destinations?: Array<{ type: string; platform?: string; agent_url?: string }>;
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
}

// A proposed custom signal — not persisted until activated
export interface CustomSignalProposal {
  signal_agent_segment_id: string;   // deterministic ID, valid for activation
  name: string;
  description: string;
  signal_type: "custom";
  category_type: string;
  estimated_audience_size: number;
  coverage_percentage: number;
  pricing_options: Array<{
    pricing_option_id: string;
    pricing_model: string;
    cpm?: number;
    currency?: string;
  }>;
  deployments: SignalDeployment[];
  generation_rationale: string;      // why this segment matches the brief
}

// AdCP Signals spec-compliant signal object
export interface SignalSummary {
  signal_agent_segment_id: string;
  name: string;
  description: string;
  signal_type: "marketplace" | "custom" | "owned";
  data_provider: string;
  coverage_percentage: number;
  deployments: SignalDeployment[];
  pricing_options: Array<{
    pricing_option_id: string;
    pricing_model: string;
    cpm?: number;
    flat_fee?: number;
    currency?: string;
  }>;
  category_type: SignalCategoryType;
  taxonomy_system: string;
  external_taxonomy_id?: string;
  generation_mode: GenerationMode;
  estimated_audience_size?: number;
  geography?: string[];
  status: string;
}

// Spec: discriminated union - type "platform" or "agent"
export interface SignalDeployment {
  type: "platform" | "agent";
  platform?: string;
  agent_url?: string;
  is_live: boolean;
  decisioning_platform_segment_id: string;
  activation_supported: boolean;
  activation_key?: { type: string; segment_id: string };
}

// ── Activation ────────────────────────────────────────────────────────────────

export interface ActivateSignalRequest {
  signalId: string;
  destination: string;
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

export type OperationStatus = "submitted" | "processing" | "completed" | "failed";

export interface OperationRecord {
  operationId: string;
  signalId: string;
  destination: string;
  accountId?: string;
  campaignId?: string;
  webhookUrl?: string;
  webhookFired: boolean;
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

// ── Errors ────────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
  requestId?: string;
}
