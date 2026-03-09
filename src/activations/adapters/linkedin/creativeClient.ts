/**
 * src/activations/adapters/linkedin/creativeClient.ts
 *
 * LinkedIn Single Image Ad creative pipeline — correct v202503 flow.
 *
 * LinkedIn's modern creative API requires a three-step process:
 *
 *   Step 1: POST /rest/images?action=initializeUpload
 *           PUT {uploadUrl} ← raw image bytes
 *           → imageUrn
 *
 *   Step 2: POST /rest/posts  (dark post — not visible on company page feed)
 *           Attaches imageUrn + headline + destination URL
 *           → shareUrn (urn:li:share:{id})
 *
 *   Step 3: POST /rest/adCreatives
 *           References shareUrn + campaign
 *           → creativeUrn (urn:li:sponsoredCreative:{id})
 *
 * The old /adCreatives direct schema (SponsoredUpdateCreativeVariables) is deprecated.
 * The correct flow creates a dark post first, then sponsors it.
 *
 * Image requirements:
 *   Format: JPEG or PNG. Min: 640×360. Max: 5MB.
 *
 * organizationUrn: urn:li:organization:{id}
 *
 * API references:
 *   Images: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api
 *   Posts:  https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/advertising-targeting/version/image-ads-integrations
 *   Creatives: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-creatives
 */

import { LinkedInApiError } from './client';

const BASE = 'https://api.linkedin.com/rest';
const LI_VERSION = '202503';

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
  shareUrn?: string;
  creativeUrn?: string;
  error?: string;
}

// ─── Step 1: Upload image ─────────────────────────────────────────────────────

export async function uploadImage(
  imageBytes: ArrayBuffer,
  adAccountId: string,
  accessToken: string,
): Promise<LinkedInImageUploadResult> {

  // Initialize upload — get pre-signed uploadUrl + imageUrn
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

  // PUT raw bytes to pre-signed URL — no LinkedIn-Version header on this one
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

// ─── Step 2: Create dark post ─────────────────────────────────────────────────
//
// A "dark post" is a sponsored post that doesn't appear in the company page's
// organic feed — it only shows as a paid ad. Set lifecycleState: PUBLISHED and
// feedDistribution: NONE to achieve this.

export async function createDarkPost(
  imageUrn: string,
  organizationUrn: string,
  adAccountId: string,
  accessToken: string,
  options: {
    headline: string;
    commentary: string;
    destinationUrl: string;
  },
): Promise<string> {

  const body = {
    author: organizationUrn,
    commentary: options.commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'NONE',
      thirdPartyDistributionChannels: [],
    },
    content: {
      media: {
        title: options.headline,
        id: imageUrn,
      },
    },
    adContext: {
      dscAdAccount: `urn:li:sponsoredAccount:${adAccountId}`,
      dscStatus: 'ACTIVE',
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: true,
  };

  const res = await fetch(`${BASE}/posts`, {
    method: 'POST',
    headers: DEFAULT_HEADERS(accessToken),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new LinkedInApiError(res.status, text, 'POST /rest/posts');
  }

  // Post ID comes from X-RestLi-Id header
  const idHeader = res.headers.get('x-restli-id') ?? res.headers.get('X-RestLi-Id');
  if (!idHeader) {
    const text = await res.text();
    throw new Error(`POST /rest/posts succeeded but no X-RestLi-Id header returned. Body: ${text.slice(0, 200)}`);
  }

  // shareUrn format: urn:li:share:{id}
  return idHeader.startsWith('urn:') ? idHeader : `urn:li:share:${idHeader}`;
}

// ─── Step 3: Create ad creative ───────────────────────────────────────────────

export async function createAdCreative(
  campaignUrn: string,
  shareUrn: string,
  accessToken: string,
): Promise<string> {

  const body = {
    campaign: campaignUrn,
    intendedStatus: 'ACTIVE',
    content: {
      reference: shareUrn,
    },
  };

  const res = await fetch(`${BASE}/adCreatives`, {
    method: 'POST',
    headers: DEFAULT_HEADERS(accessToken),
    body: JSON.stringify(body),
  });

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
    } catch { /* empty body is normal for 201 */ }
  }

  return creativeId.startsWith('urn:') ? creativeId : `urn:li:sponsoredCreative:${creativeId}`;
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

  const headline         = options.headline         ?? 'Agentic Audience Discovery';
  const introductoryText = options.introductoryText ?? 'Three IAB standards. One MCP endpoint. Plain English targeting — open source.';
  const destinationUrl   = options.destinationUrl   ?? 'https://agenticadvertising.org/members/nofluff';

  try {
    // Step 1 — Upload image
    const { imageUrn } = await uploadImage(imageBytes, adAccountId, accessToken);

    // Step 2 — Create dark post
    const shareUrn = await createDarkPost(
      imageUrn,
      organizationUrn,
      adAccountId,
      accessToken,
      { headline, commentary: introductoryText, destinationUrl },
    );

    // Step 3 — Create ad creative referencing the post
    const creativeUrn = await createAdCreative(campaignUrn, shareUrn, accessToken);

    return { success: true, imageUrn, shareUrn, creativeUrn };

  } catch (err) {
    const msg = err instanceof LinkedInApiError ? err.message : String(err);
    return { success: false, error: msg };
  }
}