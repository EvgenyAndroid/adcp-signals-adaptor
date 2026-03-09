/**
 * src/activations/adapters/linkedin/creativeClient.ts
 *
 * LinkedIn Ad Creative pipeline — v202503 schema.
 *
 * LinkedIn Marketing API v202503 uses a new creative schema:
 *   POST /rest/adCreatives  with content.contentEntities[] structure
 *
 * Pipeline:
 *   Step 1: POST /rest/images?action=initializeUpload  → uploadUrl + imageUrn
 *   Step 2: PUT {uploadUrl} ← raw image bytes
 *   Step 3: POST /rest/adCreatives → creativeUrn
 *
 * Image requirements:
 *   Format: JPEG or PNG
 *   Min: 640×360. Max: 5MB.
 *   Recommended: 1200×628 (1.91:1) or 1200×1000 (near-square)
 *
 * organizationUrn: urn:li:organization:{id}
 *   Find at: https://www.linkedin.com/company/{slug}/admin/
 *
 * API reference:
 *   https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/creative-management
 */

import { LinkedInApiError } from './client';

const BASE = 'https://api.linkedin.com/rest';
const LI_VERSION = '202504';

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

export interface LinkedInCreativeRequest {
  campaignUrn: string;
  organizationUrn: string;
  imageUrn: string;
  headline: string;
  introductoryText: string;
  destinationUrl: string;
  callToAction?: LinkedInCTA;
}

export interface FullCreativeResult {
  success: boolean;
  imageUrn?: string;
  creativeUrn?: string;
  error?: string;
}

// ─── Step 1+2: Upload image ───────────────────────────────────────────────────

export async function uploadImage(
  imageBytes: ArrayBuffer,
  adAccountId: string,
  accessToken: string,
): Promise<LinkedInImageUploadResult> {

  // Initialize upload
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

  // PUT raw bytes to pre-signed URL
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

// ─── Step 3: Create ad creative (v202503 schema) ──────────────────────────────

export async function createAdCreative(
  request: LinkedInCreativeRequest,
  accessToken: string,
): Promise<string> {

  // v202503 creative schema — uses content.contentEntities[] structure
  const body = {
    account: request.campaignUrn.replace('sponsoredCampaign', 'sponsoredAccount').replace(/:\d+$/, `:${request.campaignUrn.split(':').pop()}`),
    campaign: request.campaignUrn,
    status: 'ACTIVE',
    type: 'SPONSORED_UPDATE_V2',
    content: {
      contentEntities: [
        {
          entityLocation: request.destinationUrl,
          thumbnails: [
            { resolvedUrl: request.imageUrn },
          ],
        },
      ],
      title: request.headline,
      description: request.introductoryText,
      landingPage: {
        url: request.destinationUrl,
      },
      callToAction: {
        callToActionType: request.callToAction ?? 'LEARN_MORE',
        landingPage: {
          url: request.destinationUrl,
        },
      },
      shareMediaCategory: 'IMAGE',
      media: {
        id: request.imageUrn,
        title: { text: request.headline },
        description: { text: request.introductoryText },
      },
    },
    author: request.organizationUrn,
  };

  const res = await fetch(`${BASE}/adCreatives`, {
    method: 'POST',
    headers: DEFAULT_HEADERS(accessToken),
    body: JSON.stringify(body),
  });

  // Capture full error for debugging
  const resText = await res.text();

  if (!res.ok) {
    throw new LinkedInApiError(res.status, resText, 'POST /rest/adCreatives');
  }

  const idHeader = res.headers.get('x-restli-id') ?? res.headers.get('X-RestLi-Id');
  let creativeId = idHeader ?? '';

  if (!creativeId && resText && resText.trim().length > 0) {
    try {
      const json = JSON.parse(resText) as { id?: string };
      creativeId = json.id ?? '';
    } catch { /* empty body */ }
  }

  return `urn:li:sponsoredCreative:${creativeId}`;
}

// ─── Full pipeline ────────────────────────────────────────────────────────────

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
    const { imageUrn } = await uploadImage(imageBytes, adAccountId, accessToken);

    const creativeUrn = await createAdCreative({
      campaignUrn,
      organizationUrn,
      imageUrn,
      headline:         options.headline         ?? 'Agentic Audience Discovery',
      introductoryText: options.introductoryText  ?? 'Three IAB standards. One MCP endpoint. Plain English targeting — open source.',
      destinationUrl:   options.destinationUrl    ?? 'https://agenticadvertising.org/members/nofluff',
      callToAction:     options.callToAction      ?? 'LEARN_MORE',
    }, accessToken);

    return { success: true, imageUrn, creativeUrn };

  } catch (err) {
    const msg = err instanceof LinkedInApiError ? err.message : String(err);
    return { success: false, error: msg };
  }
}