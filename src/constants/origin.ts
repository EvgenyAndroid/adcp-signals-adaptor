// src/constants/origin.ts
//
// The canonical public origin of this agent — the URL the AAO registry card
// keys on and the one every discovery document points at.
//
// Per-request handlers (adagents.json, brand.json, jwks.json) derive their
// own origin from the incoming request so a preview deploy self-describes
// correctly. This constant exists for the one place that can't do that:
// get_adcp_capabilities is built once and cached in KV across requests, so
// `identity.brand_json_url` must be a fixed absolute URL rather than
// whichever origin happened to warm the cache. It points at production on
// purpose — that is the document the grader resolves signing keys from.
export const CANONICAL_ORIGIN = "https://adcp.signal-stack.io";
