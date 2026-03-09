/**
 * src/activations/adapters/linkedin/adapter.ts
 *
 * LinkedIn activation adapter — orchestrates mapper + client.
 * Uses getValidAccessToken() for auto-refresh.
 * Auto-creates or reuses campaign group via KV cache.
 */

import { mapDimensionsToLinkedIn } from './mapper';
import { createCampaign, createCampaignGroup, listCampaignGroups, LinkedInApiError } from './client';
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

export type LinkedInAdapterEnv = LinkedInEnv & LinkedInAuthEnv & { SIGNALS_CACHE: KVNamespace };

const KV_GROUP_KEY = 'linkedin:campaign_group_urn';

export class LinkedInAdapter {
  readonly platform = 'linkedin';

  // ── Live activation ─────────────────────────────────────────────────────────

  async activate(
    request: LinkedInActivationRequest,
    env: LinkedInAdapterEnv,
  ): Promise<LinkedInActivationResult> {

    if (!env.LINKEDIN_AD_ACCOUNT_ID) {
      return this.error('LINKEDIN_AD_ACCOUNT_ID not configured.');
    }

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(env);
    } catch (err) {
      return this.error(err instanceof Error ? err.message : String(err));
    }

    const dimensions = this.resolveDimensions(request);
    if (dimensions.length === 0) {
      return this.error('No dimensions provided and could not infer from signal_agent_segment_id.');
    }

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
      if (dr.status === 'proxied')       warnings.push(`Proxy: ${dr.dimension}:${dr.value} — ${dr.note}`);
      if (dr.status === 'not_supported') warnings.push(`Excluded: ${dr.dimension}:${dr.value} — ${dr.note}`);
    }

    // ── Resolve campaign group — cache in KV, create if none exists ───────────
    let campaignGroupUrn: string | null = await env.SIGNALS_CACHE.get(KV_GROUP_KEY);

    if (!campaignGroupUrn) {
      try {
        const groups = await listCampaignGroups(env.LINKEDIN_AD_ACCOUNT_ID, accessToken);
        if (groups.length > 0) {
          campaignGroupUrn = `urn:li:sponsoredCampaignGroup:${groups[0].id}`;
        } else {
          campaignGroupUrn = await createCampaignGroup(env.LINKEDIN_AD_ACCOUNT_ID, accessToken, 'AdCP Signals');
        }
        await env.SIGNALS_CACHE.put(KV_GROUP_KEY, campaignGroupUrn, { expirationTtl: 30 * 24 * 60 * 60 });
      } catch (err) {
        // Non-fatal — campaign can be created without group in some account configs
        warnings.push(`Campaign group lookup failed: ${err instanceof Error ? err.message : String(err)}`);
        campaignGroupUrn = null;
      }
    }

    // ── Build campaign payload ────────────────────────────────────────────────
    const campaignName = request.campaign_name
      ?? `AdCP — ${request.signal_agent_segment_id ?? 'Custom'} — ${new Date().toISOString().slice(0, 10)}`;

    const objective: LinkedInObjectiveType = request.objective ?? 'BRAND_AWARENESS';
    const accountUrn = `urn:li:sponsoredAccount:${env.LINKEDIN_AD_ACCOUNT_ID}`;
    const todayMs = Date.now();

    const payload: LinkedInCampaignPayload = {
      account: accountUrn,
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
      runSchedule: { start: todayMs },
      offsiteDeliveryEnabled: false,
      ...(campaignGroupUrn ? { campaignGroup: campaignGroupUrn } : {}),
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
        ? `${err.message}${err.isAuthError ? ' — visit /auth/linkedin/init to reauthorize' : ''}`
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

  // ── Dry run ─────────────────────────────────────────────────────────────────

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
      if (dr.status === 'proxied')       warnings.push(`Proxy: ${dr.dimension}:${dr.value} — ${dr.note}`);
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