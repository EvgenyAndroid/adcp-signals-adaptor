/**
 * src/activations/types/linkedin.ts
 *
 * LinkedIn Marketing API v2 — types for the AdCP activation adapter.
 * App ID: 239110166 (Development Tier — Advertising API)
 *
 * Reference:
 *   https://learn.microsoft.com/en-us/linkedin/marketing/?view=li-lms-2026-02
 */

import type { BaseActivationRequest, BaseActivationResult } from './shared';

// ─── LinkedIn OAuth env ───────────────────────────────────────────────────────

export interface LinkedInEnv {
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  LINKEDIN_AD_ACCOUNT_ID: string;
  // LINKEDIN_ACCESS_TOKEN was the v1 manual-token field. Removed: tokens
  // now come from OAuth (src/activations/auth/linkedin.ts) and live in KV
  // under `linkedin:access_token`. Activation calls `getValidAccessToken()`,
  // which auto-refreshes via the stored refresh token.
}

// ─── Targeting ────────────────────────────────────────────────────────────────

export interface LinkedInTargetingCriteria {
  include:
    | { and: Array<{ or: Record<string, string[]> }> }  // multiple dimensions
    | { or: Record<string, string[]> };                  // single dimension (flat)
  exclude?: {
    or: Record<string, string[]>;
  };
}

// ─── Campaign ─────────────────────────────────────────────────────────────────

export type LinkedInCampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'CANCELED';

export type LinkedInObjectiveType =
  | 'BRAND_AWARENESS'
  | 'WEBSITE_VISITS'
  | 'ENGAGEMENT'
  | 'VIDEO_VIEWS'
  | 'LEAD_GENERATION'
  | 'WEBSITE_CONVERSIONS'
  | 'JOB_APPLICANTS';

export interface LinkedInCampaignPayload {
  // account is passed in the URL path, not the body (per LinkedIn REST API docs)
  name: string;
  status: LinkedInCampaignStatus;
  type: 'SPONSORED_UPDATES' | 'TEXT_AD' | 'SPONSORED_INMAILS';
  objectiveType: LinkedInObjectiveType;
  costType: 'CPM' | 'CPC';
  unitCost: { amount: string; currencyCode: string };
  dailyBudget?: { amount: string; currencyCode: string };
  targetingCriteria: LinkedInTargetingCriteria;
  locale: { country: string; language: string };
  runSchedule: { start: number; end?: number };  // epoch ms — required
  offsiteDeliveryEnabled: boolean;               // required
  campaignGroup?: string;                         // urn:li:sponsoredCampaignGroup:{id}
  // politicalIntent omitted — EU-only field, not required for US targeting
}

export interface LinkedInCampaignResponse {
  id: number;
  name: string;
  status: LinkedInCampaignStatus;
  account: string;
  targetingCriteria: LinkedInTargetingCriteria;
}

// ─── Activation request / result ─────────────────────────────────────────────

export interface LinkedInActivationRequest extends BaseActivationRequest {
  objective?: LinkedInObjectiveType;
}

export interface LinkedInActivationResult extends BaseActivationResult {
  platform: 'linkedin';
  campaign_id?: number;
  campaign_urn?: string;
  campaign_manager_url?: string;
  campaign_name?: string;
  status?: LinkedInCampaignStatus;
  targeting_payload?: LinkedInTargetingCriteria;  // included in dry_run
}