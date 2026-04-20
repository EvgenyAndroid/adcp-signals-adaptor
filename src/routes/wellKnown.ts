// src/routes/wellKnown.ts
// RFC 9728 (OAuth 2.0 Protected Resource Metadata) and RFC 8414 (OAuth 2.0
// Authorization Server Metadata) endpoints.
//
// The AdCP security_baseline/oauth_discovery storyboard probes these at
// fixed .well-known paths. Both are static JSON documents — this agent
// doesn't implement the full OAuth handshake for its primary API-key auth,
// but we advertise a minimally conformant issuer pointing at this same
// worker so downstream runners can follow the discovery chain without
// 404-ing. Clients that actually need a token still authenticate via the
// API-key path documented in README / SECURITY_MODEL.
//
// Endpoints served (both unauthenticated per RFC):
//   GET /.well-known/oauth-protected-resource/mcp
//   GET /.well-known/oauth-authorization-server

/**
 * RFC 9728 §3: protected-resource metadata. `resource` MUST equal the agent
 * URL being called (including path). We key off the incoming request URL so
 * the same worker can serve multiple resource paths without branch
 * duplication.
 */
export function handleProtectedResourceMetadata(request: Request, resourcePath: string): Response {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const body = {
    resource: `${origin}${resourcePath}`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * RFC 8414 §3: authorization-server metadata.
 *
 * Sec-24a: this agent doesn't implement an OAuth token endpoint for its
 * primary API-key auth, so we MUST NOT advertise grant types we can't
 * honor. A buyer agent that auto-discovers this document and attempts
 * `client_credentials` would fail hard on the token endpoint and classify
 * the agent as broken — worse than not advertising OAuth at all.
 *
 * So we advertise:
 *   - `grant_types_supported: []` (empty array — RFC 8414 §2 permits)
 *   - `response_types_supported: []`
 *   - a `token_endpoint` that returns HTTP 501 so any client that ignores
 *     the empty grants array still gets a clean, documented terminal
 *     failure rather than 404.
 *
 * Clients following the spec read the empty arrays and skip the OAuth
 * path; the conformance probe only validates document reachability +
 * shape, which is still satisfied.
 */
export function handleAuthorizationServerMetadata(request: Request): Response {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const body = {
    issuer: origin,
    token_endpoint: `${origin}/oauth/token`,
    grant_types_supported: [],
    response_types_supported: [],
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * RFC 6749 token endpoint — stub. Returns 501 Not Implemented with an
 * OAuth-shaped `error` body so any client that ignored the empty
 * `grant_types_supported` array still sees a documented terminal
 * failure instead of 404. This agent authenticates with a static API
 * key; see the /.well-known/oauth-authorization-server docstring.
 */
export function handleOAuthTokenStub(): Response {
  const body = {
    error: "unsupported_grant_type",
    error_description:
      "This agent does not implement OAuth token exchange. " +
      "Authenticate with a static API key via `Authorization: Bearer <key>` on /mcp. " +
      "The OAuth authorization-server metadata advertises an empty grant_types_supported.",
  };
  return new Response(JSON.stringify(body), {
    status: 501,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
