/**
 * src/activations/auth/linkedin.ts
 *
 * LinkedIn OAuth 2.0 Authorization Code flow with automatic token refresh.
 *
 * SETUP (one-time, in browser):
 *   1. Visit: GET /auth/linkedin/init
 *   2. LinkedIn login page appears — authorize the app
 *   3. LinkedIn redirects to: GET /auth/linkedin/callback?code=XXX
 *   4. Worker exchanges code for access_token + refresh_token
 *   5. Both tokens stored in KV — never needed manually again
 *
 * ALL SUBSEQUENT CALLS (fully automated, server-to-server):
 *   - Worker reads access_token from KV
 *   - If expired, silently exchanges refresh_token for new access_token
 *   - refresh_token valid for 12 months, auto-rotated on each refresh
 *
 * KV keys:
 *   linkedin:access_token    ← current access token
 *   linkedin:refresh_token   ← long-lived refresh token
 *   linkedin:token_expires   ← ISO timestamp of access_token expiry
 *   linkedin:token_meta      ← { scope, obtained_at }
 *
 * Required wrangler.toml [vars]:
 *   LINKEDIN_REDIRECT_URI = "https://adcp-signals-adaptor.evgeny-193.workers.dev/auth/linkedin/callback"
 *
 * Required secrets (npx wrangler secret put ...):
 *   LINKEDIN_CLIENT_ID
 *   LINKEDIN_CLIENT_SECRET
 *   LINKEDIN_AD_ACCOUNT_ID
 *
 * Required KV binding in wrangler.toml:
 *   [[kv_namespaces]]
 *   binding = "SIGNALS_CACHE"
 *   id = "e17c4c99b649460a92016e1257436f22"
 */

const LI_AUTH_URL  = 'https://www.linkedin.com/oauth/v2/authorization';
const LI_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

// w_organization_social required for dark post creation (creative pipeline)
const LI_SCOPES = 'r_ads rw_ads r_organization_social w_organization_social';

// KV key constants
const KV_ACCESS_TOKEN  = 'linkedin:access_token';
const KV_REFRESH_TOKEN = 'linkedin:refresh_token';
const KV_TOKEN_EXPIRES = 'linkedin:token_expires';
const KV_TOKEN_META    = 'linkedin:token_meta';

// Refresh buffer: refresh 5 minutes before expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ─── Env shape ────────────────────────────────────────────────────────────────

export interface LinkedInAuthEnv {
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  LINKEDIN_REDIRECT_URI: string;
  LINKEDIN_AD_ACCOUNT_ID: string;
  SIGNALS_CACHE: KVNamespace;
}

// ─── Token shape ──────────────────────────────────────────────────────────────

export interface LinkedInTokenSet {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
  obtained_at: string;
}

// ─── Route: GET /auth/linkedin/init ──────────────────────────────────────────

export function handleLinkedInAuthInit(env: LinkedInAuthEnv): Response {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.LINKEDIN_CLIENT_ID,
    redirect_uri: env.LINKEDIN_REDIRECT_URI,
    scope: LI_SCOPES,
    state,
  });

  const authUrl = `${LI_AUTH_URL}?${params.toString()}`;

  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>LinkedIn Auth — AdCP Signals Adaptor</title>
  <style>
    body { font-family: monospace; background: #0a0a14; color: #e8e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; flex-direction: column; gap: 24px; }
    h1 { color: #6c63ff; font-size: 28px; }
    p { color: #6a6a8a; max-width: 500px; text-align: center; line-height: 1.6; }
    a { display: inline-block; background: #0A66C2; color: white; padding: 14px 32px; border-radius: 4px; text-decoration: none; font-size: 18px; font-weight: bold; }
    a:hover { background: #004182; }
    .scope { background: #1a1a2e; border: 1px solid #2a2a4a; padding: 12px 20px; border-radius: 8px; font-size: 13px; color: #6c63ff; }
  </style>
</head>
<body>
  <h1>AdCP → LinkedIn Authorization</h1>
  <p>One-time setup. After you authorize, the Worker stores your tokens and handles all refreshes automatically — no manual steps ever again.</p>
  <div class="scope">Scopes: r_ads · rw_ads · r_organization_social · w_organization_social</div>
  <a href="${authUrl}">Authorize with LinkedIn →</a>
  <p style="font-size: 12px; color: #3a3a5a;">App ID: 239110166 · Development Tier · Advertising API</p>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  );
}

// ─── Route: GET /auth/linkedin/callback ──────────────────────────────────────

export async function handleLinkedInAuthCallback(
  request: Request,
  env: LinkedInAuthEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const code      = url.searchParams.get('code');
  const error     = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description');

  if (error) {
    return htmlResponse('Authorization Failed', `
      <p style="color:#ef4444">LinkedIn returned an error:</p>
      <pre style="color:#fb923c">${error}: ${errorDesc}</pre>
      <p>Common causes: user denied access, or scopes not approved on your app.</p>
      <a href="/auth/linkedin/init">Try again →</a>
    `);
  }

  if (!code) {
    return htmlResponse('Missing Code', `
      <p style="color:#ef4444">No authorization code in callback URL.</p>
      <a href="/auth/linkedin/init">Start over →</a>
    `);
  }

  let tokenSet: LinkedInTokenSet;
  try {
    tokenSet = await exchangeCodeForTokens(code, env);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return htmlResponse('Token Exchange Failed', `
      <p style="color:#ef4444">Failed to exchange code for tokens:</p>
      <pre style="color:#fb923c">${msg}</pre>
      <p>Check LINKEDIN_CLIENT_SECRET is set correctly.</p>
      <a href="/auth/linkedin/init">Try again →</a>
    `);
  }

  await storeTokens(tokenSet, env.SIGNALS_CACHE);

  return htmlResponse('Authorization Successful ✓', `
    <p style="color:#00ff88; font-size: 20px;">✓ LinkedIn authorization complete.</p>
    <p>Tokens stored securely in KV. The Worker will handle all refreshes automatically.</p>
    <div class="info-row"><span>Scope:</span><span>${tokenSet.scope}</span></div>
    <div class="info-row"><span>Access token expires:</span><span>${new Date(tokenSet.expires_at).toLocaleString()}</span></div>
    <div class="info-row"><span>Refresh token:</span><span>stored (12 month validity)</span></div>
    <div class="info-row"><span>Ad account:</span><span>${env.LINKEDIN_AD_ACCOUNT_ID}</span></div>
    <p style="margin-top: 24px; font-size: 13px; color: #4a4a6a;">You can close this tab. Setup is complete.</p>
    <a href="/auth/linkedin/status">Check status →</a>
  `);
}

// ─── Route: GET /auth/linkedin/status ────────────────────────────────────────

export async function handleLinkedInAuthStatus(
  env: LinkedInAuthEnv,
): Promise<Response> {
  const [accessToken, refreshToken, expiresAt, metaRaw] = await Promise.all([
    env.SIGNALS_CACHE.get(KV_ACCESS_TOKEN),
    env.SIGNALS_CACHE.get(KV_REFRESH_TOKEN),
    env.SIGNALS_CACHE.get(KV_TOKEN_EXPIRES),
    env.SIGNALS_CACHE.get(KV_TOKEN_META),
  ]);

  if (!accessToken || !refreshToken) {
    return json({
      configured: false,
      message: 'No LinkedIn tokens found. Visit /auth/linkedin/init to authorize.',
    });
  }

  const meta         = metaRaw ? JSON.parse(metaRaw) : {};
  const expiresDate  = expiresAt ? new Date(expiresAt) : null;
  const now          = new Date();
  const isExpired    = expiresDate ? expiresDate.getTime() - now.getTime() < 0 : false;
  const expiresInMs  = expiresDate ? expiresDate.getTime() - now.getTime() : null;
  const expiresInMin = expiresInMs ? Math.round(expiresInMs / 60000) : null;

  return json({
    configured: true,
    access_token_status: isExpired ? 'expired' : 'valid',
    access_token_preview: `${accessToken.slice(0, 12)}...`,
    expires_at: expiresAt,
    expires_in_minutes: expiresInMin,
    refresh_token_present: !!refreshToken,
    scope: meta.scope ?? 'unknown',
    obtained_at: meta.obtained_at ?? 'unknown',
    ad_account_id: env.LINKEDIN_AD_ACCOUNT_ID,
    note: isExpired
      ? 'Access token expired — will auto-refresh on next API call'
      : 'Token valid — auto-refresh enabled',
  });
}

// ─── Token manager ────────────────────────────────────────────────────────────

export async function getValidAccessToken(env: LinkedInAuthEnv): Promise<string> {
  const [accessToken, refreshToken, expiresAt] = await Promise.all([
    env.SIGNALS_CACHE.get(KV_ACCESS_TOKEN),
    env.SIGNALS_CACHE.get(KV_REFRESH_TOKEN),
    env.SIGNALS_CACHE.get(KV_TOKEN_EXPIRES),
  ]);

  if (!accessToken || !refreshToken) {
    throw new Error('LinkedIn not authorized. Visit /auth/linkedin/init to complete setup.');
  }

  const needsRefresh = !expiresAt
    || new Date(expiresAt).getTime() - Date.now() < REFRESH_BUFFER_MS;

  if (!needsRefresh) return accessToken;

  const newTokenSet = await refreshAccessToken(refreshToken, env);
  await storeTokens(newTokenSet, env.SIGNALS_CACHE);
  return newTokenSet.access_token;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

async function exchangeCodeForTokens(
  code: string,
  env: LinkedInAuthEnv,
): Promise<LinkedInTokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: env.LINKEDIN_CLIENT_ID,
    client_secret: env.LINKEDIN_CLIENT_SECRET,
    redirect_uri: env.LINKEDIN_REDIRECT_URI,
  });

  const res = await fetch(LI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn token exchange ${res.status}: ${text}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    refresh_token_expires_in?: number;
    scope: string;
  };

  if (!data.access_token) {
    throw new Error(`No access_token in LinkedIn response: ${JSON.stringify(data)}`);
  }

  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token ?? '',
    expires_at:    new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scope:         data.scope,
    obtained_at:   new Date().toISOString(),
  };
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function refreshAccessToken(
  refreshToken: string,
  env: LinkedInAuthEnv,
): Promise<LinkedInTokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: env.LINKEDIN_CLIENT_ID,
    client_secret: env.LINKEDIN_CLIENT_SECRET,
  });

  const res = await fetch(LI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn token refresh ${res.status}: ${text}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at:    new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scope:         data.scope,
    obtained_at:   new Date().toISOString(),
  };
}

// ─── KV storage ───────────────────────────────────────────────────────────────

async function storeTokens(tokenSet: LinkedInTokenSet, kv: KVNamespace): Promise<void> {
  const ttl90Days   = 90  * 24 * 60 * 60;
  const ttl12Months = 365 * 24 * 60 * 60;

  await Promise.all([
    kv.put(KV_ACCESS_TOKEN,  tokenSet.access_token,  { expirationTtl: ttl90Days }),
    kv.put(KV_REFRESH_TOKEN, tokenSet.refresh_token, { expirationTtl: ttl12Months }),
    kv.put(KV_TOKEN_EXPIRES, tokenSet.expires_at),
    kv.put(KV_TOKEN_META, JSON.stringify({
      scope:       tokenSet.scope,
      obtained_at: tokenSet.obtained_at,
    })),
  ]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function htmlResponse(title: string, content: string): Response {
  return new Response(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title} — AdCP</title>
  <style>
    body { font-family: monospace; background: #0a0a14; color: #e8e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; flex-direction: column; gap: 16px; padding: 40px; }
    h1 { color: #6c63ff; font-size: 24px; margin-bottom: 8px; }
    p { color: #6a6a8a; max-width: 540px; text-align: center; line-height: 1.6; }
    pre { background: #111; padding: 12px 16px; border-radius: 6px; font-size: 12px; max-width: 540px; overflow-x: auto; }
    a { display: inline-block; background: #1a1a2e; border: 1px solid #6c63ff; color: #6c63ff; padding: 10px 24px; border-radius: 4px; text-decoration: none; margin-top: 8px; }
    a:hover { background: #6c63ff; color: #fff; }
    .info-row { display: flex; gap: 16px; justify-content: space-between; background: #111; border: 1px solid #1e1e3a; padding: 8px 16px; border-radius: 6px; width: 100%; max-width: 540px; font-size: 13px; }
    .info-row span:first-child { color: #6a6a8a; }
    .info-row span:last-child  { color: #e8e8f0; font-weight: bold; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${content}
</body>
</html>`, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}