/**
 * src/activations/adapters/linkedin/client.ts
 *
 * LinkedIn Marketing API HTTP client.
 * App ID: 239110166 — Development Tier — Advertising API
 *
 * Endpoint base: https://api.linkedin.com/rest
 * Version: 202503 (March 2025 — active stable)
 */

import type { LinkedInCampaignPayload, LinkedInCampaignResponse } from '../../types/linkedin';

const BASE = 'https://api.linkedin.com/rest';
const LI_VERSION = '202503';

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
  adAccountId: string,
): Promise<LinkedInCampaignResponse> {
  const url = `${BASE}/adAccounts/${adAccountId}/adCampaigns`;

  const res = await fetch(url, {
    method: 'POST',
    headers: DEFAULT_HEADERS(accessToken),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new LinkedInApiError(res.status, body, `POST /rest/adAccounts/${adAccountId}/adCampaigns`);
  }

  // LinkedIn returns 201 with empty body — ID is in X-RestLi-Id header
  const idHeader = res.headers.get('x-restli-id') ?? res.headers.get('X-RestLi-Id');

  let json: Partial<LinkedInCampaignResponse> = {};
  const text = await res.text();
  if (text && text.trim().length > 0) {
    try { json = JSON.parse(text); } catch { /* empty body is normal for 201 */ }
  }

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
  adAccountId: string,
): Promise<LinkedInCampaignResponse> {
  const res = await fetch(`${BASE}/adAccounts/${adAccountId}/adCampaigns/${campaignId}`, {
    headers: DEFAULT_HEADERS(accessToken),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new LinkedInApiError(res.status, body, `GET /rest/adAccounts/${adAccountId}/adCampaigns/${campaignId}`);
  }

  return res.json() as Promise<LinkedInCampaignResponse>;
}

// ─── Campaign Groups ──────────────────────────────────────────────────────────

export async function listCampaignGroups(
  adAccountId: string,
  accessToken: string,
): Promise<Array<{ id: number; name: string; status: string }>> {
  // Simple search without status filter — LinkedIn rejects search.status.values[] param
  const url = `${BASE}/adAccounts/${adAccountId}/adCampaignGroups?q=search&count=10`;

  const res = await fetch(url, {
    headers: DEFAULT_HEADERS(accessToken),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new LinkedInApiError(res.status, body, `GET /rest/adAccounts/${adAccountId}/adCampaignGroups`);
  }

  const json = await res.json() as { elements?: Array<{ id: number; name: string; status: string }> };
  return (json.elements ?? []).filter(g => g.status === 'ACTIVE' || g.status === 'DRAFT');
}

export async function createCampaignGroup(
  adAccountId: string,
  accessToken: string,
  name = 'AdCP Signals',
): Promise<string> {
  const url = `${BASE}/adAccounts/${adAccountId}/adCampaignGroups`;

  const res = await fetch(url, {
    method: 'POST',
    headers: DEFAULT_HEADERS(accessToken),
    body: JSON.stringify({
      account: `urn:li:sponsoredAccount:${adAccountId}`,
      name,
      status: 'ACTIVE',
      runSchedule: { start: Date.now() },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new LinkedInApiError(res.status, body, `POST /rest/adAccounts/${adAccountId}/adCampaignGroups`);
  }

  const idHeader = res.headers.get('x-restli-id') ?? res.headers.get('X-RestLi-Id');
  const json = await res.json() as { id?: number };
  const id = idHeader ?? String(json.id ?? '');
  return `urn:li:sponsoredCampaignGroup:${id}`;
}

// ─── Token validation ─────────────────────────────────────────────────────────

export async function validateToken(
  accessToken: string,
): Promise<{ valid: boolean; sub?: string; name?: string }> {
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