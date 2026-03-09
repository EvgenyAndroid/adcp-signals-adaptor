/**
 * src/activations/adapters/linkedin/adapter.ts
 *
 * LinkedIn activation adapter — orchestrates mapper + client.
 * Uses getValidAccessToken() from auth module — handles auto-refresh transparently.
 *
 * Usage:
 *   const adapter = new LinkedInAdapter();
 *   const result = await adapter.activate(request, env);    // live
 *   const result = adapter.dryRun(request);                 // preview only
 */

import { mapDimensionsToLinkedIn } from './mapper';
import { createCampaign, LinkedInApiError } from './client';
import { getValidAccessToken } from '../../auth/linkedin';
import { inferDimensionsFromSignalId } from '../../types/shared';

import type {
  LinkedInEnv,
  LinkedInActivationRequest,
  LinkedInActivationResult,
  LinkedInCampaignPayload,
  LinkedInObjectiveType,
} from '../../types/linkedin';
import type { LinkedInAuthEnv } from '../../auth/linkedin';
import type { SignalDimension } from '../../types/shared';

// Adapter env extends auth env so auto-refresh works (needs KV + client credentials)
export type LinkedInAdapterEnv = LinkedInEnv & LinkedInAuthEnv;

export class LinkedInAdapter {
  readonly platform = 'linkedin';

  // ── Live activation ─────────────────────────────────────────────────────────

  async activate(
    request: LinkedInActivationRequest,
    env: LinkedInAdapterEnv,
  ): Promise<LinkedInActivationResult> {

    if (!env.LINKEDIN_AD_ACCOUNT_ID) {
      return this.error('LINKEDIN_AD_ACCOUNT_ID not configured. Run: npx wrangler secret put LINKEDIN_AD_ACCOUNT_ID');
    }

    // Get valid access token — auto-refreshes if expired, throws if not authorized
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(env);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.error(msg);
    }

    // Resolve dimensions
    const dimensions = this.resolveDimensions(request);
    if (dimensions.length === 0) {
      return this.error('No dimensions provided and could not infer from signal_agent_segment_id.');
    }

    // Map dimensions to LinkedIn targeting
    const {
      criteria,
      dimensionResults,
      supportedCount,
      proxiedCount,
      unsupportedCount,
      coverageNote,
    } = mapDimensionsToLinkedIn(dimensions);

    const warnings: string[] = [];

    if (supportedCount + proxiedCount === 0) {
      return {
        success: false,
        platform: 'linkedin',
        dry_run: false,
        dimension_results: dimensionResults,
        supported_count: 0,
        proxied_count: 0,
        unsupported_count: unsupportedCount,
        coverage_note: coverageNote,
        warnings: ['Zero mappable dimensions — no LinkedIn native equivalent for any signal.'],
        error: 'Cannot create campaign: no supported dimensions.',
      };
    }

    for (const dr of dimensionResults) {
      if (dr.status === 'proxied')      warnings.push(`Proxy: ${dr.dimension}:${dr.value} — ${dr.note}`);
      if (dr.status === 'not_supported') warnings.push(`Excluded: ${dr.dimension}:${dr.value} — ${dr.note}`);
    }

    const campaignName = request.campaign_name
      ?? `AdCP — ${request.signal_agent_segment_id ?? 'Custom'} — ${new Date().toISOString().slice(0,10)}`;

    const objective: LinkedInObjectiveType = request.objective ?? 'BRAND_AWARENESS';
    const accountUrn = `urn:li:sponsoredAccount:${env.LINKEDIN_AD_ACCOUNT_ID}`;

    // runSchedule.start is required — use today as start, no end date for DRAFT
    const todayMs = Date.now();
    const startDate = new Date(todayMs).toISOString().slice(0, 10).replace(/-/g, '/');

    const payload: LinkedInCampaignPayload = {
      account: accountUrn,    // ← add this back
      name: campaignName,
      status: 'DRAFT',
      type: 'SPONSORED_UPDATES',
      objectiveType: objective,
      costType: 'CPM',
      unitCost: {
        amount: (request.bid_usd ?? 10.00).toFixed(2),
        currencyCode: 'USD',
      },
      dailyBudget: {
        amount: (request.daily_budget_usd ?? 50.00).toFixed(2),
        currencyCode: 'USD',
      },
      targetingCriteria: criteria,
      locale: { country: 'US', language: 'en' },
      // Required fields in LinkedIn REST API v202601
      runSchedule: { start: todayMs },
      offsiteDeliveryEnabled: false,
    };

    try {
      const campaign = await createCampaign(payload, accessToken, env.LINKEDIN_AD_ACCOUNT_ID);
      const campaignManagerUrl =
        `https://www.linkedin.com/campaignmanager/accounts/${env.LINKEDIN_AD_ACCOUNT_ID}/campaigns/${campaign.id}`;

      warnings.push('Campaign created as DRAFT — review in Campaign Manager before activating spend.');

      return {
        success: true,
        platform: 'linkedin',
        dry_run: false,
        campaign_id: campaign.id,
        campaign_urn: `urn:li:sponsoredCampaign:${campaign.id}`,
        campaign_manager_url: campaignManagerUrl,
        campaign_name: campaignName,
        status: 'DRAFT',
        dimension_results: dimensionResults,
        supported_count: supportedCount,
        proxied_count: proxiedCount,
        unsupported_count: unsupportedCount,
        coverage_note: coverageNote,
        warnings,
      };

    } catch (err) {
      const msg = err instanceof LinkedInApiError
        ? `${err.message}${err.isAuthError ? ' — token may have been revoked, visit /auth/linkedin/init' : ''}`
        : String(err);
      return {
        success: false,
        platform: 'linkedin',
        dry_run: false,
        dimension_results: dimensionResults,
        supported_count: supportedCount,
        proxied_count: proxiedCount,
        unsupported_count: unsupportedCount,
        coverage_note: coverageNote,
        warnings,
        error: msg,
      };
    }
  }

  // ── Dry run — no API call ───────────────────────────────────────────────────

  dryRun(request: LinkedInActivationRequest): LinkedInActivationResult {
    const dimensions = this.resolveDimensions(request);
    const {
      criteria,
      dimensionResults,
      supportedCount,
      proxiedCount,
      unsupportedCount,
      coverageNote,
    } = mapDimensionsToLinkedIn(dimensions);

    const warnings: string[] = [];
    for (const dr of dimensionResults) {
      if (dr.status === 'proxied')      warnings.push(`Proxy: ${dr.dimension}:${dr.value} — ${dr.note}`);
      if (dr.status === 'not_supported') warnings.push(`Excluded: ${dr.dimension}:${dr.value} — ${dr.note}`);
    }
    warnings.push('DRY RUN — no LinkedIn API call made. Set dry_run: false to create campaign.');

    return {
      success: supportedCount + proxiedCount > 0,
      platform: 'linkedin',
      dry_run: true,
      dimension_results: dimensionResults,
      supported_count: supportedCount,
      proxied_count: proxiedCount,
      unsupported_count: unsupportedCount,
      coverage_note: coverageNote,
      targeting_payload: criteria,
      warnings,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private resolveDimensions(request: LinkedInActivationRequest): SignalDimension[] {
    if (request.dimensions && request.dimensions.length > 0) return request.dimensions;
    if (request.signal_agent_segment_id) return inferDimensionsFromSignalId(request.signal_agent_segment_id);
    return [];
  }

  private error(message: string): LinkedInActivationResult {
    return {
      success: false,
      platform: 'linkedin',
      dry_run: false,
      dimension_results: [],
      supported_count: 0,
      proxied_count: 0,
      unsupported_count: 0,
      coverage_note: 'No mapping attempted.',
      warnings: [],
      error: message,
    };
  }
}