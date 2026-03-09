/**
 * src/activations/adapters/linkedin/client.ts
 *
 * LinkedIn Marketing API v2 HTTP client.
 * App ID: 239110166 — Development Tier — Advertising API
 *
 * Handles:
 *   - Campaign creation (POST /adCampaigns)
 *   - Campaign read (GET /adCampaigns/{id})
 *   - Token validation (GET /userinfo)
 *
 * All requests use LinkedIn-Version: 202406 header (stable 2024 schema).
 * X-RestLi-Protocol-Version: 2.0.0 required for all REST.li endpoints.
 *
 * API reference:
 *   https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaigns?view=li-lms-2026-02
 */

import type { LinkedInCampaignPayload, LinkedInCampaignResponse } from '../../types/linkedin';

const BASE = 'https://api.linkedin.com/v2';
const LI_VERSION = '202406';

const DEFAULT_HEADERS = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
  'X-Restli-Protocol-Version': '2.0.0',
  'LinkedIn-Version': LI_VERSION,
});

// ─── Campaign ─────────────────────────────────────────────────────────────────

export async function createCampaign(
  payload: LinkedInCampaignPayload,
  accessToken: string,
): Promise<LinkedInCampaignResponse> {
  const res = await fetch(`${BASE}/adCampaigns`, {
    method: 'POST',
    headers: DEFAULT_HEADERS(accessToken),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new LinkedInApiError(res.status, body, 'POST /adCampaigns');
  }

  const json = await res.json() as Partial<LinkedInCampaignResponse>;

  // LinkedIn returns campaign ID in X-RestLi-Id header AND in body
  const idHeader = res.headers.get('x-restli-id') ?? res.headers.get('X-RestLi-Id');
  const id = idHeader ? parseInt(idHeader, 10) : (json.id ?? 0);

  return {
    id,
    name: json.name ?? payload.name,
    status: json.status ?? 'DRAFT',
    account: json.account ?? payload.account,
    targetingCriteria: json.targetingCriteria ?? payload.targetingCriteria,
  };
}

export async function getCampaign(
  campaignId: number,
  accessToken: string,
): Promise<LinkedInCampaignResponse> {
  const res = await fetch(`${BASE}/adCampaigns/${campaignId}`, {
    headers: DEFAULT_HEADERS(accessToken),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new LinkedInApiError(res.status, body, `GET /adCampaigns/${campaignId}`);
  }

  return res.json() as Promise<LinkedInCampaignResponse>;
}

// ─── Token validation ─────────────────────────────────────────────────────────

export async function validateToken(accessToken: string): Promise<{ valid: boolean; sub?: string; name?: string }> {
  try {
    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) return { valid: false };
    const json = await res.json() as { sub?: string; name?: string };
    return { valid: true, sub: json.sub, name: json.name };
  } catch {
    return { valid: false };
  }
}

// ─── Ad accounts ─────────────────────────────────────────────────────────────

export async function getAdAccount(
  accountId: string,
  accessToken: string,
): Promise<{ id: string; name?: string; status?: string }> {
  const accountUrn = encodeURIComponent(`urn:li:sponsoredAccount:${accountId}`);
  const res = await fetch(`${BASE}/adAccountsV2/${accountUrn}`, {
    headers: DEFAULT_HEADERS(accessToken),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new LinkedInApiError(res.status, body, `GET /adAccountsV2/${accountId}`);
  }

  const json = await res.json() as { id: string; name?: string; status?: string };
  return json;
}

// ─── Error type ───────────────────────────────────────────────────────────────

export class LinkedInApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
    public readonly endpoint: string,
  ) {
    super(`LinkedIn API ${statusCode} on ${endpoint}: ${body.slice(0, 300)}`);
    this.name = 'LinkedInApiError';
  }

  get isAuthError(): boolean { return this.statusCode === 401 || this.statusCode === 403; }
  get isRateLimit(): boolean { return this.statusCode === 429; }
}
