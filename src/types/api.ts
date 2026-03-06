// src/types/api.ts
// AdCP spec-compliant HTTP request/response shapes

import type { SignalCategoryType, GenerationMode } from "./signal";

// ── Capabilities ──────────────────────────────────────────────────────────────

export interface CapabilitiesResponse {
  provider: string;
  protocolVersion: string;
  adcpVersion: string;
  supportedOperations: string[];
  signalCategories: string[];
  activationMode: "async";
  authMode: "api_key_demo";
  outputFormats: string[];
  dynamicSegmentGeneration: boolean;
  destinations: DestinationInfo[];
  limits: {
    maxSignalsPerRequest: number;
    maxRulesPerSegment: number;
    maxAudienceSizeEstimate: number;
  };
}

export interface DestinationInfo {
  id: string;
  name: string;
  type: "dsp" | "cleanroom" | "cdp" | "measurement";
  activationSupported: boolean;
}

// ── Signal Search ─────────────────────────────────────────────────────────────

export interface SearchSignalsRequest {
  query?: string;
  categoryType?: SignalCategoryType;
  generationMode?: GenerationMode;
  taxonomyId?: string;
  geography?: string[];
  destination?: string;
  activationSupported?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchSignalsResponse {
  message: string;
  context_id: string;
  signals: SignalSummary[];
  count: number;
  totalCount: number;
  offset: number;
  hasMore: boolean;
}

// AdCP Signals spec-compliant signal object
export interface SignalSummary {
  // AdCP spec required fields
  signal_agent_segment_id: string;
  name: string;
  description: string;
  signal_type: "marketplace" | "custom" | "owned";
  data_provider: string;
  coverage_percentage: number;
  deployments: SignalDeployment[];
  pricing_options: SignalPricingOption[];

  // Extended metadata
  category_type: SignalCategoryType;
  taxonomy_system: string;
  external_taxonomy_id?: string;
  generation_mode: GenerationMode;
  estimated_audience_size?: number;
  geography?: string[];
  status: string;

  // Internal ID kept for activation flow compatibility
  signalId: string;
}

export interface SignalDeployment {
  decisioning_platform: string;
  is_live: boolean;
  decisioning_platform_segment_id: string;
  activation_supported: boolean;
}

export interface SignalPricingOption {
  model: "cpm" | "revenue_share" | "flat" | "none";
  value?: number;
  currency?: string;
  description?: string;
}

// ── Activation ────────────────────────────────────────────────────────────────

export interface ActivateSignalRequest {
  signalId: string;
  destination: string;
  accountId?: string;
  campaignId?: string;
  notes?: string;
}

export interface ActivateSignalResponse {
  operationId: string;
  status: OperationStatus;
  signalId: string;
  signal_agent_segment_id: string;
  destination: string;
  decisioning_platform_segment_id: string;
  submittedAt: string;
  estimatedCompletionMs: number;
}

// ── Custom Signal Generation ──────────────────────────────────────────────────

export interface GenerateSignalRequest {
  name?: string;
  description?: string;
  rules: GenerateSignalRule[];
}

export interface GenerateSignalRule {
  dimension: string;
  operator: string;
  value: string | number | string[];
}

export interface GenerateSignalResponse {
  signal: SignalSummary;
  generationNotes: string;
  ruleCount: number;
}

// ── Operations ────────────────────────────────────────────────────────────────

export type OperationStatus =
  | "submitted"
  | "processing"
  | "completed"
  | "failed";

export interface OperationRecord {
  operationId: string;
  signalId: string;
  destination: string;
  accountId?: string;
  campaignId?: string;
  status: OperationStatus;
  submittedAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface GetOperationResponse {
  operationId: string;
  status: OperationStatus;
  signalId: string;
  signal_agent_segment_id: string;
  decisioning_platform_segment_id: string;
  destination: string;
  submittedAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
  signal?: SignalSummary;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
  requestId?: string;
}
