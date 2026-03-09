/**
 * src/activations/adapters/linkedin/creativeClient.ts
 *
 * LinkedIn Ad Creative pipeline:
 *   Step 1: POST /rest/images?action=initializeUpload  → get uploadUrl + imageUrn
 *   Step 2: PUT {uploadUrl} ← raw image bytes
 *   Step 3: POST /rest/adCreatives → create sponsored content creative
 *   Step 4: POST /rest/adCreativeAdAssociations → attach creative to campaign
 *
 * Image requirements:
 *   - Format: JPEG or PNG
 *   - Min size: 640×360 for Sponsored Content
 *   - Max file size: 5MB
 *   - Recommended: 1200×628 (1.91:1) or 1200×1000 (near-square)
 *
 * Required: organizationUrn (LinkedIn Company Page URN)
 *   Find yours at: https://www.linkedin.com/company/{slug}/admin/
 *   URL shows: /company/12345678/ — that number is your org ID
 *   URN format: urn:li:organization:12345678
 *
 * API reference:
 *   https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/creative-management
 */

import { LinkedInApiError } from './client';

const BASE = 'https://api.linkedin.com/rest';
const LI_VERSION = '202412';

const DEFAULT_HEADERS = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
  'X-Restli-Protocol-Version': '2.0.0',
  'LinkedIn-Version': LI_VERSION,
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LinkedInImageUploadResult {
  imageUrn: string;
  uploadUrl: string;
}

export interface LinkedInCreativeRequest {
  campaignUrn: string;          // urn:li:sponsoredCampaign:{id}
  organizationUrn: string;      // urn:li:organization:{id}
  imageUrn: string;             // from uploadImage()
  headline: string;             // max 70 chars
  introductoryText: string;     // max 150 chars — shown above the image
  destinationUrl: string;       // landing page URL
  callToAction?: LinkedInCTA;
}

export type LinkedInCTA =
  | 'LEARN_MORE'
  | 'SIGN_UP'
  | 'DOWNLOAD'
  | 'GET_QUOTE'
  | 'REGISTER'
  | 'SUBSCRIBE'
  | 'APPLY_NOW'
  | 'CONTACT_US'
  | 'SEE_MORE';

export interface LinkedInCreativeResult {
  creativeUrn: string;
  associationUrn: string;
  status: 'ACTIVE' | 'PAUSED' | 'DRAFT';
}

// ─── Step 1+2: Upload image ───────────────────────────────────────────────────

/**
 * uploadImage — initializes upload and PUTs the raw bytes to LinkedIn's upload URL.
 * Returns the imageUrn to use when creating the creative.
 *
 * @param imageBytes  Raw image bytes (JPEG or PNG)
 * @param adAccountId LinkedIn ad account ID (numeric string)
 * @param accessToken Valid OAuth token
 */
export async function uploadImage(
  imageBytes: ArrayBuffer,
  adAccountId: string,
  accessToken: string,
): Promise<LinkedInImageUploadResult> {

  // Step 1: Initialize upload — get uploadUrl + imageUrn
  const initRes = await fetch(`${BASE}/images?action=initializeUpload`, {
    method: 'POST',
    headers: DEFAULT_HEADERS(accessToken),
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: `urn:li:sponsoredAccount:${adAccountId}`,
      },
    }),
  });

  if (!initRes.ok) {
    const body = await initRes.text();
    throw new LinkedInApiError(initRes.status, body, 'POST /rest/images?action=initializeUpload');
  }

  const initData = await initRes.json() as {
    value: { uploadUrl: string; image: string };
  };

  const { uploadUrl, image: imageUrn } = initData.value;

  // Step 2: PUT raw bytes to the pre-signed upload URL
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'image/jpeg',
    },
    body: imageBytes,
  });

  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    throw new LinkedInApiError(uploadRes.status, body, `PUT ${uploadUrl}`);
  }

  return { imageUrn, uploadUrl };
}

// ─── Step 3: Create ad creative ───────────────────────────────────────────────

/**
 * createAdCreative — creates a Sponsored Content Single Image creative.
 * Returns the creativeUrn to use in the campaign association.
 */
export async function createAdCreative(
  request: LinkedInCreativeRequest,
  accessToken: string,
): Promise<string> {

  const body = {
    account: `urn:li:sponsoredAccount:${request.campaignUrn.split(':').pop()}`,
    campaign: request.campaignUrn,
    type: 'SPONSORED_STATUS_UPDATE',
    status: 'ACTIVE',
    variables: {
      data: {
        'com.linkedin.ads.SponsoredUpdateCreativeVariables': {
          directSponsoredContent: 1,
          text: request.introductoryText,
          subject: request.headline,
          landingPage: {
            url: request.destinationUrl,
          },
          media: {
            id: request.imageUrn,
            title: {
              text: request.headline,
            },
            description: {
              text: request.introductoryText,
            },
            landingPage: {
              landingPageUrls: [{ url: request.destinationUrl }],
            },
          },
          callToAction: request.callToAction ?? 'LEARN_MORE',
          shareMediaCategory: 'IMAGE',
          author: request.organizationUrn,
        },
      },
    },
  };

  const res = await fetch(`${BASE}/adCreatives`, {
    method: 'POST',
    headers: DEFAULT_HEADERS(accessToken),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new LinkedInApiError(res.status, text, 'POST /rest/adCreatives');
  }

  const idHeader = res.headers.get('x-restli-id') ?? res.headers.get('X-RestLi-Id');
  const json = await res.json() as { id?: string };
  const creativeId = idHeader ?? json.id ?? '';

  return `urn:li:sponsoredCreative:${creativeId}`;
}

// ─── Full pipeline: upload + create + associate ───────────────────────────────

export interface FullCreativeResult {
  success: boolean;
  imageUrn?: string;
  creativeUrn?: string;
  error?: string;
}

/**
 * createFullCreative — runs the complete pipeline:
 *   1. Upload image bytes → imageUrn
 *   2. Create ad creative with imageUrn → creativeUrn
 *
 * @param imageBytes     Raw JPEG/PNG bytes of the banner
 * @param adAccountId    LinkedIn ad account ID
 * @param campaignUrn    URN of the campaign to attach the creative to
 * @param organizationUrn LinkedIn company page URN
 * @param accessToken    Valid OAuth token
 */
export async function createFullCreative(
  imageBytes: ArrayBuffer,
  adAccountId: string,
  campaignUrn: string,
  organizationUrn: string,
  accessToken: string,
  options: {
    headline?: string;
    introductoryText?: string;
    destinationUrl?: string;
    callToAction?: LinkedInCTA;
  } = {},
): Promise<FullCreativeResult> {
  try {
    // Upload image
    const { imageUrn } = await uploadImage(imageBytes, adAccountId, accessToken);

    // Create creative
    const creativeUrn = await createAdCreative({
      campaignUrn,
      organizationUrn,
      imageUrn,
      headline: options.headline ?? 'Agentic Audience Discovery',
      introductoryText: options.introductoryText
        ?? 'Three IAB standards. One MCP endpoint. Plain English targeting — open source.',
      destinationUrl: options.destinationUrl ?? 'https://agenticadvertising.org/members/nofluff',
      callToAction: options.callToAction ?? 'LEARN_MORE',
    }, accessToken);

    return { success: true, imageUrn, creativeUrn };

  } catch (err) {
    const msg = err instanceof LinkedInApiError ? err.message : String(err);
    return { success: false, error: msg };
  }
}
