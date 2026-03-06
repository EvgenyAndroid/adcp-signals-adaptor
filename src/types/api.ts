// src/types/api.ts
// AdCP-aligned HTTP request/response shapes

import type { SignalCategoryType, GenerationMode, CanonicalSignal } from "./signal";

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
  signals: SignalSummary[];
  count: number;
  totalCount: number;
  offset: number;
  hasMore: boolean;
}

export interface SignalSummary {
  signalId: string;
  name: string;
  description: string;
  categoryType: SignalCategoryType;
  taxonomySystem: string;
  externalTaxonomyId?: string;
  generationMode: GenerationMode;
  activationSupported: boolean;
  estimatedAudienceSize?: number;
  destinations: string[];
  geography?: string[];
  pricing?: {
    model: string;
    value?: number;
    currency?: string;
  };
  status: string;
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
  destination: string;
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
