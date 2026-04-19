/**
 * src/activations/routes/linkedin.ts
 *
 * Route handler for POST /signals/activate/linkedin
 *
 * ── Modes ──────────────────────────────────────────────────────────────────────
 *
 * 1. Dry run — preview targeting without any API calls:
 *   { "signal_agent_segment_id": "sig_graduate_educated_adults", "dry_run": true }
 *
 * 2. Campaign only — creates DRAFT campaign, no creative:
 *   { "signal_agent_segment_id": "sig_graduate_educated_adults", "dry_run": false }
 *
 * 3. Campaign + creative — creates DRAFT campaign AND attaches the AdCp banner:
 *   {
 *     "signal_agent_segment_id": "sig_graduate_educated_adults",
 *     "dry_run": false,
 *     "with_creative": true,
 *     "organization_urn": "urn:li:organization:YOUR_ORG_ID",
 *     "creative": {
 *       "headline": "Agentic Audience Discovery",
 *       "introductory_text": "Three IAB standards. One MCP endpoint.",
 *       "destination_url": "https://agenticadvertising.org/members/nofluff",
 *       "call_to_action": "LEARN_MORE"
 *     }
 *   }
 *
 * ── Finding your organization_urn ─────────────────────────────────────────────
 *   Go to https://www.linkedin.com/company/agenticadvertising/admin/
 *   The number in the URL is your org ID → urn:li:organization:12345678
 *
 * ── Banner image ──────────────────────────────────────────────────────────────
 *   Default: src/assets/adcp-banner-1200x1000.jpg served via raw.githubusercontent.com
 *   Override by passing creative.image_url in the request body.
 *   Image must be publicly accessible — LinkedIn's upload server fetches it directly.
 */

import { LinkedInAdapter } from '../adapters/linkedin';
import { createFullCreative } from '../adapters/linkedin/creativeClient';
import type { LinkedInEnv, LinkedInActivationRequest } from '../types/linkedin';
import type { LinkedInAuthEnv } from '../auth/linkedin';
import { getValidAccessToken } from '../auth/linkedin';
import { fetchWithTimeout, readBoundedArrayBuffer, BoundedFetchError } from '../../utils/fetchWithLimits';

export interface LinkedInRouteEnv extends LinkedInEnv, LinkedInAuthEnv {
  DEMO_API_KEY: string;
}

export interface LinkedInRouteRequest extends LinkedInActivationRequest {
  dry_run?: boolean;
  with_creative?: boolean;
  organization_urn?: string;
  creative?: {
    headline?: string;
    introductory_text?: string;
    destination_url?: string;
    call_to_action?: string;
    image_url?: string;
  };
}

// Default banner — served from GitHub raw content
// Push src/assets/adcp-banner-1200x1000.jpg to your repo and this URL works automatically
const DEFAULT_BANNER_URL =
  'https://raw.githubusercontent.com/EvgenyAndroid/adcp-signals-adaptor/master/src/assets/adcp-banner-1200x1000.jpg';

// Image fetch guardrails. LinkedIn's own limits are 5 MB for images; we cap
// below that so an attacker-controlled creative.image_url can't make the
// worker download arbitrary data before LinkedIn's upload API rejects it.
// Timeout is generous (15 s) because GitHub/CDN cold starts can be slow;
// the worker's overall budget is 30 s.
const IMAGE_FETCH_TIMEOUT_MS = 15_000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const IMAGE_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif'];

// Only http(s) schemes — otherwise fetch() on Workers will happily resolve
// data: / blob: / file: schemes that short-circuit the guardrails.
function isFetchableImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function handleLinkedInActivate(
  request: Request,
  env: LinkedInRouteEnv,
): Promise<Response> {
  const start = Date.now();

  try {
    const body = await request.json() as LinkedInRouteRequest;

    if (!body.signal_agent_segment_id && (!body.dimensions || body.dimensions.length === 0)) {
      return jsonResponse({
        success: false,
        error: 'Provide signal_agent_segment_id or dimensions[]',
        duration_ms: Date.now() - start,
      }, 400);
    }

    const adapter = new LinkedInAdapter();

    // ── Dry run ────────────────────────────────────────────────────────────────
    if (body.dry_run === true) {
      const result = adapter.dryRun(body);
      return jsonResponse({ success: result.success, result, duration_ms: Date.now() - start });
    }

    // ── Live activation ────────────────────────────────────────────────────────
    const result = await adapter.activate(body, env);

    if (!result.success) {
      return jsonResponse({ success: false, result, duration_ms: Date.now() - start }, 400);
    }

    // ── Optional: attach creative ──────────────────────────────────────────────
    if (body.with_creative && result.campaign_urn) {
      if (!body.organization_urn) {
        result.warnings = result.warnings ?? [];
        result.warnings.push(
          'Creative skipped — organization_urn required. ' +
          'Find yours at linkedin.com/company/agenticadvertising/admin/ ' +
          'then pass "organization_urn": "urn:li:organization:12345678"',
        );
      } else {
        try {
          const accessToken = await getValidAccessToken(env);

          // Fetch banner image from GitHub (or custom URL if provided).
          // The URL can be caller-supplied, so we gate it:
          //   1. scheme allow-list (http/https only; no data: / file: / blob:)
          //   2. 15 s timeout (cold CDN edges can be slow; the worker budget is 30 s)
          //   3. 5 MB body cap, enforced both via Content-Length pre-check and
          //      streaming read (some CDNs use chunked encoding with no length)
          //   4. Content-Type allow-list (image/jpeg, image/png, image/gif)
          const imageUrl = body.creative?.image_url ?? DEFAULT_BANNER_URL;
          if (!isFetchableImageUrl(imageUrl)) {
            throw new Error(`Banner URL rejected (must be http/https): ${imageUrl}`);
          }
          const imageRes = await fetchWithTimeout(imageUrl, {
            timeoutMs: IMAGE_FETCH_TIMEOUT_MS,
          });

          if (!imageRes.ok) {
            throw new Error(`Banner fetch failed: ${imageUrl} → HTTP ${imageRes.status}`);
          }

          let imageBytes: ArrayBuffer;
          try {
            imageBytes = await readBoundedArrayBuffer(imageRes, {
              maxBytes: IMAGE_MAX_BYTES,
              allowedContentTypes: IMAGE_ALLOWED_MIMES,
            });
          } catch (err) {
            if (err instanceof BoundedFetchError) {
              throw new Error(`Banner rejected (${err.reason}): ${err.message}`);
            }
            throw err;
          }

          const creativeResult = await createFullCreative(
            imageBytes,
            env.LINKEDIN_AD_ACCOUNT_ID,
            result.campaign_urn!,
            body.organization_urn,
            accessToken,
            {
              headline:         body.creative?.headline          ?? 'Agentic Audience Discovery',
              introductoryText: body.creative?.introductory_text ?? 'Three IAB standards. One MCP endpoint. Plain English targeting — open source.',
              destinationUrl:   body.creative?.destination_url   ?? 'https://agenticadvertising.org/members/nofluff',
              callToAction:     (body.creative?.call_to_action as any) ?? 'LEARN_MORE',
            },
          );

          result.warnings = result.warnings ?? [];
          if (creativeResult.success) {
            (result as any).creative_urn = creativeResult.creativeUrn;
            (result as any).image_urn    = creativeResult.imageUrn;
            result.warnings.push(`✓ Creative attached: ${creativeResult.creativeUrn}`);
          } else {
            result.warnings.push(`Creative failed (campaign still created): ${creativeResult.error}`);
          }

        } catch (err) {
          result.warnings = result.warnings ?? [];
          result.warnings.push(
            `Creative error (campaign still created): ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    return jsonResponse({ success: result.success, result, duration_ms: Date.now() - start });

  } catch (err) {
    return jsonResponse({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    }, 500);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}