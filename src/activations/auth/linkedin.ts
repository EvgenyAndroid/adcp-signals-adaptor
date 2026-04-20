/**
 * src/activations/auth/linkedin.ts
 *
 * LinkedIn OAuth 2.0 Authorization Code flow with automatic token refresh.
 *
 * SETUP (one-time, operator-driven):
 *   1. Call `GET /auth/linkedin/init` with your API key
 *      (Authorization: Bearer $DEMO_API_KEY). The HTML response
 *      contains a one-click LinkedIn authorize link.
 *   2. Click through to LinkedIn; authorize the app.
 *   3. LinkedIn redirects to `GET /auth/linkedin/callback?code=XXX`
 *      (public by design — state-consumed-once is the defense).
 *   4. Worker exchanges the code for access_token + refresh_token.
 *   5. Both tokens stored in KV — never needed manually again.
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

import { encryptIfConfigured, decryptIfNeeded } from '../../utils/tokenCrypto';
import { fetchWithTimeout } from '../../utils/fetchWithLimits';

const LI_AUTH_URL  = 'https://www.linkedin.com/oauth/v2/authorization';
const LI_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

// w_organization_social required for dark post creation (creative pipeline)
const LI_SCOPES = 'r_ads rw_ads r_organization_social w_organization_social';

// KV key constants — namespaced per operator (Sec-18). Each helper takes
// the operator_id (12-char base64url, see src/utils/operatorId.ts) and
// suffixes the key. Different operators get fully isolated token sets;
// the previous "last-writer-wins" global keys are gone.
function kvAccessToken(operatorId: string)  { return `linkedin:access_token:${operatorId}`; }
function kvRefreshToken(operatorId: string) { return `linkedin:refresh_token:${operatorId}`; }
function kvTokenExpires(operatorId: string) { return `linkedin:token_expires:${operatorId}`; }
function kvTokenMeta(operatorId: string)    { return `linkedin:token_meta:${operatorId}`; }
// Note: OAuth state moved from KV to D1 in Sec-10 (atomic consume), then
// gained operator_id binding in Sec-18 (per-operator isolation).
// Any stray `linkedin:oauth_state:*` or unscoped `linkedin:access_token`
// keys in KV from before will age out via TTL.

// Refresh buffer: refresh 5 minutes before expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// OAuth state TTL — must match the time a user reasonably takes to complete
// the provider login. 10 minutes balances user grace against CSRF window.
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

// ─── Env shape ────────────────────────────────────────────────────────────────

export interface LinkedInAuthEnv {
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  LINKEDIN_REDIRECT_URI: string;
  LINKEDIN_AD_ACCOUNT_ID: string;
  SIGNALS_CACHE: KVNamespace;
  // D1 binding — used for the OAuth state table. Previously the state lived
  // in KV, but KV has no atomic consume-and-delete so two near-simultaneous
  // callbacks could both observe a state before either deletion landed.
  // On the public /callback route where state IS the auth defense, that
  // TOCTOU gap is exploitable. D1 gives us DELETE...RETURNING in a single
  // round-trip.
  DB: D1Database;
  // Optional: when set, access/refresh tokens are AES-GCM encrypted at rest.
  // Unset ⇒ plaintext storage (legacy; reads transparently handle both).
  TOKEN_ENCRYPTION_KEY?: string;
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

export async function handleLinkedInAuthInit(
  env: LinkedInAuthEnv,
  operatorId: string,
): Promise<Response> {
  const state = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_SECONDS * 1000).toISOString();
  // Persist state in D1 — both for atomic consume (Sec-10) and operator
  // binding (Sec-18). The operator_id captured here is what /callback
  // uses to namespace token storage; /callback is public so it can't
  // re-derive the operator from a bearer header. The state row is the
  // trusted server-side carrier.
  //
  // Opportunistic cleanup: drop any expired rows from prior flows on
  // write. Bounds the table without a scheduled cron.
  await env.DB.prepare(
    'DELETE FROM oauth_state WHERE expires_at < ?'
  ).bind(new Date().toISOString()).run();
  await env.DB.prepare(
    'INSERT INTO oauth_state (state, provider, expires_at, operator_id) VALUES (?, ?, ?, ?)'
  ).bind(state, 'linkedin', expiresAt, operatorId).run();

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
  <a href="${escapeHtmlAttr(authUrl)}">Authorize with LinkedIn →</a>
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
  const state     = url.searchParams.get('state');
  const error     = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description');

  // Verify state first — rejects CSRF regardless of whether LinkedIn
  // returned an error or a code. Provider-supplied values are escaped
  // below because the error path still renders them.
  //
  // Sec-18: consumeOAuthState now returns the operator_id that issued the
  // state (or null if the state didn't exist / expired). The /callback
  // route is public, so we can't re-derive the operator from a bearer
  // header — the state row IS the trusted carrier of operator identity.
  const operatorId = state ? await consumeOAuthState(state, env.DB) : null;
  if (!state || operatorId === null) {
    // Observability: log unknown/expired/replayed state so a spike —
    // typically a sign of abuse or a misconfigured relay — is visible in
    // `wrangler tail`. The route is public (provider redirects carry no
    // bearer), so the state machine is the only defense; a spike here is
    // where we'd see it first. Log structure matches createLogger output.
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'linkedin_callback_invalid_state',
      ts: new Date().toISOString(),
      // Don't log the state value — that's the thing someone trying to
      // replay would be leaking. Log presence only.
      state_present: !!state,
      has_code: !!code,
      has_error: !!error,
      ua: request.headers.get('user-agent') ?? null,
    }));
    // 400: caller-side bug or replay. State was missing, expired, or already
    // consumed — none of these are server faults; the client (LinkedIn redirect
    // chain) supplied a value we can't honor.
    return htmlResponse('Invalid State', `
      <p style="color:#ef4444">OAuth state missing, expired, or already used.</p>
      <p>This protects against CSRF. Start the flow fresh.</p>
      <p>Restart the flow by calling <code>GET /auth/linkedin/init</code> with your API key.</p>
    `, 400);
  }

  if (error) {
    // 502: LinkedIn (the upstream provider) returned an OAuth error response.
    // The status code lets uptime/observability distinguish "we're down" from
    // "user declined / scope rejected at LinkedIn."
    return htmlResponse('Authorization Failed', `
      <p style="color:#ef4444">LinkedIn returned an error:</p>
      <pre style="color:#fb923c">${escapeHtml(error)}: ${escapeHtml(errorDesc ?? '')}</pre>
      <p>Common causes: user denied access, or scopes not approved on your app.</p>
      <p>Restart the flow by calling <code>GET /auth/linkedin/init</code> with your API key.</p>
    `, 502);
  }

  if (!code) {
    // 400: malformed callback — the redirect should always carry either a
    // `code` or an `error`. Missing both means the client URL was tampered.
    return htmlResponse('Missing Code', `
      <p style="color:#ef4444">No authorization code in callback URL.</p>
      <p>Restart the flow by calling <code>GET /auth/linkedin/init</code> with your API key.</p>
    `, 400);
  }

  let tokenSet: LinkedInTokenSet;
  try {
    tokenSet = await exchangeCodeForTokens(code, env);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 502: the LinkedIn token endpoint failed for us (network, 5xx, or
    // bad client secret). Distinguishes server-side breakage from the
    // 400 cases above (which are caller / URL problems).
    return htmlResponse('Token Exchange Failed', `
      <p style="color:#ef4444">Failed to exchange code for tokens:</p>
      <pre style="color:#fb923c">${escapeHtml(msg)}</pre>
      <p>Check LINKEDIN_CLIENT_SECRET is set correctly.</p>
      <p>Restart the flow by calling <code>GET /auth/linkedin/init</code> with your API key.</p>
    `, 502);
  }

  // Overwrite observability: per-operator now (Sec-18). A prior token
  // set under THIS operator's namespace means this operator is re-
  // authorizing — legitimate but worth a tail signal. Other operators'
  // tokens live in their own namespaces and are untouched.
  const priorMetaRaw = await env.SIGNALS_CACHE.get(kvTokenMeta(operatorId));
  if (priorMetaRaw) {
    let priorMeta: { scope?: string; obtained_at?: string } = {};
    try { priorMeta = JSON.parse(priorMetaRaw); } catch { /* treat as opaque */ }
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'linkedin_oauth_tokens_overwritten',
      ts: new Date().toISOString(),
      operator_id: operatorId,
      prior_scope: priorMeta.scope ?? null,
      prior_obtained_at: priorMeta.obtained_at ?? null,
      new_scope: tokenSet.scope,
      new_obtained_at: tokenSet.obtained_at,
      // Don't log token values — only the metadata that signals churn.
    }));
  }

  await storeTokens(tokenSet, env.SIGNALS_CACHE, operatorId, env.TOKEN_ENCRYPTION_KEY);

  // Truth-in-UI: the prior "stored securely" wording was only true when
  // TOKEN_ENCRYPTION_KEY is provisioned. On deployments where it's unset
  // (the default), tokens land in KV plaintext — and saying "securely"
  // in that case is misleading. Render a message that matches the
  // deployment posture the operator is actually looking at.
  const encryptedAtRest = !!env.TOKEN_ENCRYPTION_KEY;
  const storageDescription = encryptedAtRest
    ? 'Tokens stored <strong>encrypted</strong> in KV (AES-GCM at rest). The Worker will handle all refreshes automatically.'
    : 'Tokens stored in KV. <strong>Set <code>TOKEN_ENCRYPTION_KEY</code></strong> (via <code>wrangler secret put</code>) to enable encryption at rest; see README.md.';

  return htmlResponse('Authorization Successful ✓', `
    <p style="color:#00ff88; font-size: 20px;">✓ LinkedIn authorization complete.</p>
    <p>${storageDescription}</p>
    <div class="info-row"><span>Scope:</span><span>${escapeHtml(tokenSet.scope)}</span></div>
    <div class="info-row"><span>Access token expires:</span><span>${escapeHtml(new Date(tokenSet.expires_at).toLocaleString())}</span></div>
    <div class="info-row"><span>Refresh token:</span><span>stored (12 month validity)</span></div>
    <div class="info-row"><span>Ad account:</span><span>${escapeHtml(env.LINKEDIN_AD_ACCOUNT_ID)}</span></div>
    <p style="margin-top: 24px; font-size: 13px; color: #4a4a6a;">You can close this tab. Setup is complete.</p>
    <p style="font-size: 12px; color: #4a4a6a;">Verify: <code>curl -H "Authorization: Bearer $DEMO_API_KEY" ${escapeHtml(new URL(request.url).origin)}/auth/linkedin/status</code></p>
  `);
}

/**
 * Atomically verify and consume an OAuth state value.
 *
 * Single SQL round-trip: `DELETE ... RETURNING state` deletes the row and
 * returns the deleted row in the same statement. If the row doesn't exist
 * (never issued, already consumed, or expired), nothing is deleted and
 * nothing is returned — we report the state invalid without a second call.
 *
 * Why atomicity matters here: this function is the only auth defense on the
 * public /callback route. Under the previous KV implementation
 * (`kv.get` → `kv.delete`) two near-simultaneous callbacks could both see
 * the state before either deletion landed, yielding a TOCTOU replay. With
 * D1, SQLite serializes writes — only one DELETE can consume the state;
 * any concurrent DELETE on the same primary key returns zero rows.
 * Strictly single-use.
 *
 * The WHERE clause includes an expiry check so a DB with stale rows (after
 * a clock rewind or a missed cleanup) can't be induced to accept something
 * the CSRF window had already closed on.
 */
/**
 * Sec-18: also returns the operator_id that issued the state — null if
 * the state didn't exist / expired / was already consumed. The /callback
 * handler uses this ID to namespace token storage; without it, every
 * operator's tokens would still land under the same global keys.
 */
async function consumeOAuthState(state: string, db: D1Database): Promise<string | null> {
  const now = new Date().toISOString();
  const row = await db
    .prepare('DELETE FROM oauth_state WHERE state = ? AND expires_at > ? RETURNING operator_id')
    .bind(state, now)
    .first<{ operator_id: string }>();
  return row?.operator_id ?? null;
}

// ─── Route: GET /auth/linkedin/status ────────────────────────────────────────

export async function handleLinkedInAuthStatus(
  env: LinkedInAuthEnv,
  operatorId: string,
): Promise<Response> {
  const [rawAccess, rawRefresh, expiresAt, metaRaw] = await Promise.all([
    env.SIGNALS_CACHE.get(kvAccessToken(operatorId)),
    env.SIGNALS_CACHE.get(kvRefreshToken(operatorId)),
    env.SIGNALS_CACHE.get(kvTokenExpires(operatorId)),
    env.SIGNALS_CACHE.get(kvTokenMeta(operatorId)),
  ]);

  const [accessToken, refreshToken] = await Promise.all([
    decryptIfNeeded(rawAccess,  env.TOKEN_ENCRYPTION_KEY),
    decryptIfNeeded(rawRefresh, env.TOKEN_ENCRYPTION_KEY),
  ]);

  if (!accessToken || !refreshToken) {
    return json({
      configured: false,
      message: 'No LinkedIn tokens found. Call `GET /auth/linkedin/init` with your API key to start the flow.',
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

export async function getValidAccessToken(
  env: LinkedInAuthEnv,
  operatorId: string,
): Promise<string> {
  const [rawAccess, rawRefresh, expiresAt] = await Promise.all([
    env.SIGNALS_CACHE.get(kvAccessToken(operatorId)),
    env.SIGNALS_CACHE.get(kvRefreshToken(operatorId)),
    env.SIGNALS_CACHE.get(kvTokenExpires(operatorId)),
  ]);

  const [accessToken, refreshToken] = await Promise.all([
    decryptIfNeeded(rawAccess,  env.TOKEN_ENCRYPTION_KEY),
    decryptIfNeeded(rawRefresh, env.TOKEN_ENCRYPTION_KEY),
  ]);

  if (!accessToken || !refreshToken) {
    throw new Error('LinkedIn not authorized for this operator. Call `GET /auth/linkedin/init` with your API key to complete setup.');
  }

  const needsRefresh = !expiresAt
    || new Date(expiresAt).getTime() - Date.now() < REFRESH_BUFFER_MS;

  if (!needsRefresh) return accessToken;

  const newTokenSet = await refreshAccessToken(refreshToken, env);
  await storeTokens(newTokenSet, env.SIGNALS_CACHE, operatorId, env.TOKEN_ENCRYPTION_KEY);
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

  const res = await fetchWithTimeout(LI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    timeoutMs: 15_000,
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

  const res = await fetchWithTimeout(LI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    timeoutMs: 15_000,
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

async function storeTokens(
  tokenSet: LinkedInTokenSet,
  kv: KVNamespace,
  operatorId: string,
  encryptionKey?: string,
): Promise<void> {
  const ttl90Days   = 90  * 24 * 60 * 60;
  const ttl12Months = 365 * 24 * 60 * 60;

  // Tokens are the secrets at risk. `expires_at` and `token_meta` are
  // non-sensitive timestamps/scopes, stored plaintext so /status etc. can
  // read them without the encryption key.
  const [encryptedAccess, encryptedRefresh] = await Promise.all([
    encryptIfConfigured(tokenSet.access_token,  encryptionKey),
    encryptIfConfigured(tokenSet.refresh_token, encryptionKey),
  ]);

  // Sec-18: KV keys are namespaced per operator, so concurrent operators
  // don't overwrite each other's tokens.
  await Promise.all([
    kv.put(kvAccessToken(operatorId),  encryptedAccess,  { expirationTtl: ttl90Days }),
    kv.put(kvRefreshToken(operatorId), encryptedRefresh, { expirationTtl: ttl12Months }),
    kv.put(kvTokenExpires(operatorId), tokenSet.expires_at),
    kv.put(kvTokenMeta(operatorId), JSON.stringify({
      scope:       tokenSet.scope,
      obtained_at: tokenSet.obtained_at,
    })),
  ]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Render the OAuth-callback HTML body with the right HTTP status.
 *
 * Default 200 (success page); error paths pass an explicit status so
 * monitoring + cache-control behave correctly:
 *   - Invalid State / Missing Code  → 400 (caller-side bug or replay)
 *   - Authorization Failed (provider) → 502 (upstream returned an error)
 *   - Token Exchange Failed         → 502 (upstream call failed)
 *
 * The HTML body remains identical between a 4xx/5xx and a 200 — browsers
 * still render the same actionable error page; status is for non-browser
 * observers (uptime probes, edge cache, log dashboards).
 */
function htmlResponse(title: string, content: string, status = 200): Response {
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
</html>`, { status, headers: { 'Content-Type': 'text/html' } });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── HTML escaping ────────────────────────────────────────────────────────────

/**
 * Escape a string for safe interpolation inside HTML text content.
 * Prevents XSS from provider-supplied OAuth error strings.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a string for safe interpolation inside a double-quoted HTML attribute.
 * (Same set as escapeHtml — kept as a named helper for intent clarity.)
 */
export function escapeHtmlAttr(s: string): string {
  return escapeHtml(s);
}