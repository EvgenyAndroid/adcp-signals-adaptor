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
 * RFC 8414 §3: authorization-server metadata. The minimal document must
 * expose `issuer` + `token_endpoint` and one of `grant_types_supported` or
 * `response_types_supported`. The `token_endpoint` is a nominal URL — a
 * full OAuth handshake is out of scope for this demo agent; the probe only
 * verifies reachability + shape.
 */
export function handleAuthorizationServerMetadata(request: Request): Response {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const body = {
    issuer: origin,
    token_endpoint: `${origin}/oauth/token`,
    grant_types_supported: ["client_credentials"],
    token_endpoint_auth_methods_supported: ["client_secret_basic"],
    response_types_supported: ["token"],
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
