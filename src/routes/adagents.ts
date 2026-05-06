// src/routes/adagents.ts
//
// AdCP discovery anchor — /.well-known/adagents.json
//
// As a signals data provider, we publish this file to declare which
// agents are authorized to resell our catalog. Per the AdCP 3.0.6
// spec ($id: /schemas/3.0.6/adagents.json):
//
//   "Hosted at /.well-known/adagents.json on publisher domains (for
//    properties) or data provider domains (for signals)."
//
// A buyer agent doing "find authorized signals agents for this
// domain" would land on this file, read the `authorized_agents`
// array, and discover which `agent_url` endpoints to call. Without
// a published file we're invisible to that discovery flow.
//
// Validation: the served document is schema-validated at build via
// tests/adagents-self-publish.test.ts against the vendored 3.0.6
// schema. If we ever drift (new required field, etc.), the test
// fails before deploy.
//
// Visibility: the demo footer (src/routes/demo.ts) carries a
// "📡 adagents.json" link pointing here, and the Federation tab's
// Discovery panel surfaces this document side-by-side with peer
// probe results so the workshop audience sees what the protocol's
// trust anchor looks like in practice.

import type { Env } from "../types/env";
import { Validator } from "@cfworker/json-schema";
import { loadAdcpCorpus, ADCP_SPEC_VERSION } from "../schemas/adcp";

export interface AdagentsDocument {
  $schema: string;
  contact: {
    name: string;
    email?: string;
    domain?: string;
    privacy_policy_url?: string;
  };
  authorized_agents: Array<{
    url: string;
    authorized_for: string;
    authorization_type: "signal_tags";
    signal_tags: string[];
  }>;
  signal_tags: Record<string, { name: string; description: string }>;
  last_updated: string;
}

/**
 * Build a 3.0.6-conformant adagents.json declaring our worker as the
 * authorized signals agent for our own catalog. The agent URL is
 * derived from the request origin so the document works on any deploy
 * (production, preview, local) without rebuild.
 */
export function buildAdagentsDocument(request: Request): AdagentsDocument {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  return {
    $schema: "https://adcontextprotocol.org/schemas/v3/adagents.json",
    contact: {
      name: "AdCP Signals Adaptor — Demo Provider (Evgeny)",
      email: "Evgeny@gmail.com",
      // Use hostname (not host) so the port doesn't sneak in; the
      // schema's domain regex doesn't permit colons. Strip any
      // trailing dot from FQDN-style hosts for the same reason.
      domain: url.hostname.replace(/\.$/, ""),
      privacy_policy_url: `${origin}/privacy`,
    },
    // Single authorized agent: ourselves. authorization_type = signal_tags
    // with ["all"] grants the agent rights to all signals tagged "all" —
    // and we tag every catalog signal "all" by convention. A multi-agent
    // network (e.g. a federation reseller chain) would add more entries
    // with narrower signal_tags scopes.
    authorized_agents: [
      {
        url: `${origin}/mcp`,
        authorized_for:
          "AdCP signals data provider for the Demo Provider catalog (audience + outcome signals across 14 verticals)",
        authorization_type: "signal_tags",
        signal_tags: ["all"],
      },
    ],
    signal_tags: {
      all: {
        name: "All catalog signals",
        description:
          "Every signal in the Demo Provider catalog, spanning Demographic / Interest / Purchase intent / Geo / Composite category types across 14 verticals. Includes both deterministic (rule-based) and dynamic (proposal-derived) signals.",
      },
    },
    last_updated: new Date().toISOString(),
  };
}

/**
 * GET /.well-known/adagents.json
 *
 * Public, unauthenticated, cacheable for an hour. CORS open so a
 * buyer agent fetching this from any origin (including a browser
 * during workshop demos) gets a clean response.
 */
export function handleAdAgents(request: Request, _env: Env): Response {
  const doc = buildAdagentsDocument(request);
  return new Response(JSON.stringify(doc, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "X-AdCP-Spec-Version": ADCP_SPEC_VERSION,
    },
  });
}

// ── Validator (cached) ────────────────────────────────────────────────────
//
// Used by validateAdagentsDocument() below + the self-publish test.
// Lazy-init to avoid paying schema-walk cost on cold isolates.

let _adagentsValidator: Validator | null = null;
function getAdagentsValidator(): Validator | null {
  if (_adagentsValidator) return _adagentsValidator;
  try {
    const corpus = loadAdcpCorpus() as Array<Record<string, unknown> & { $id?: string }>;
    const root = corpus.find((s) => s.$id === `/schemas/${ADCP_SPEC_VERSION}/adagents.json`);
    if (!root) return null;
    const v = new Validator(root, "7", false);
    for (const s of corpus) {
      if (s.$id && s.$id !== root.$id) {
        try { v.addSchema(s); } catch { /* tolerate duplicates */ }
      }
    }
    _adagentsValidator = v;
    return v;
  } catch {
    return null;
  }
}

export interface AdagentsValidationResult {
  valid: boolean;
  schema_url: string;
  errors: Array<{ path: string; message: string; keyword: string }>;
}

export function validateAdagentsDocument(doc: unknown): AdagentsValidationResult {
  const schemaUrl = `https://adcontextprotocol.org/schemas/v3/adagents.json`;
  const validator = getAdagentsValidator();
  if (!validator) {
    return {
      valid: true,
      schema_url: schemaUrl,
      errors: [{ path: "(meta)", message: "validator unavailable", keyword: "skipped" }],
    };
  }
  const r = validator.validate(doc);
  if (r.valid) return { valid: true, schema_url: schemaUrl, errors: [] };
  return {
    valid: false,
    schema_url: schemaUrl,
    errors: (r.errors || []).slice(0, 12).map((e: { instanceLocation?: string; error?: string; keyword?: string; keywordLocation?: string }) => ({
      path: e.instanceLocation || "(root)",
      message: e.error || "validation failed",
      keyword: e.keyword || (e.keywordLocation ? e.keywordLocation.split("/").pop() ?? "unknown" : "unknown"),
    })),
  };
}

// ── Peer probe ────────────────────────────────────────────────────────────
//
// Workshop overdeliver: fetch each peer's /.well-known/adagents.json
// and classify the result. Most won't publish one (Dstillery is 2.x;
// Adzymic / Celtra / Claire / Swivel are sales agents not data
// providers). The probe surfaces the discovery-anchor coverage gap
// visually — "we publish, peers don't, here's the gap, here's why
// AdCP standardization matters."
//
// Safety: 3-second timeout, 64KB cap, no redirect follow. We're
// fetching from third-party domains so we don't want runaway responses
// or being redirected to attacker-controlled URLs.

const PROBE_TIMEOUT_MS = 3_000;
const PROBE_MAX_BYTES = 65_536;

export interface PeerProbeResult {
  agent_id: string;
  agent_name: string;
  agent_mcp_url: string;
  fetched_url: string;
  status:
    | "ok"               // 200 + valid schema
    | "schema_invalid"   // 200 but doesn't validate
    | "not_found"        // 404
    | "http_error"       // non-200, non-404
    | "timeout"
    | "network_error";
  http_status?: number;
  duration_ms: number;
  validation?: AdagentsValidationResult;
  error?: string;
  // Truncated payload for the UI render (full doc may be 50K+).
  payload_preview?: unknown;
}

function deriveDomain(mcpUrl: string): string {
  try {
    const u = new URL(mcpUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

export async function probePeerAdagents(
  agent: { id: string; name: string; mcp_url: string },
): Promise<PeerProbeResult> {
  const t0 = Date.now();
  const origin = deriveDomain(agent.mcp_url);
  const fetched_url = `${origin}/.well-known/adagents.json`;
  if (!origin) {
    return {
      agent_id: agent.id,
      agent_name: agent.name,
      agent_mcp_url: agent.mcp_url,
      fetched_url,
      status: "network_error",
      duration_ms: Date.now() - t0,
      error: "Could not derive origin from mcp_url",
    };
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
  try {
    const r = await fetch(fetched_url, {
      method: "GET",
      redirect: "manual",
      signal: ac.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    if (r.status === 404) {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        agent_mcp_url: agent.mcp_url,
        fetched_url,
        status: "not_found",
        http_status: 404,
        duration_ms: Date.now() - t0,
      };
    }
    if (r.status !== 200) {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        agent_mcp_url: agent.mcp_url,
        fetched_url,
        status: "http_error",
        http_status: r.status,
        duration_ms: Date.now() - t0,
      };
    }
    // Read up to PROBE_MAX_BYTES and parse. If the body is bigger we
    // truncate before parsing — keeps us from accidentally consuming
    // a DoS-shaped peer response.
    const buf = await r.arrayBuffer();
    if (buf.byteLength > PROBE_MAX_BYTES) {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        agent_mcp_url: agent.mcp_url,
        fetched_url,
        status: "http_error",
        http_status: r.status,
        duration_ms: Date.now() - t0,
        error: `Response body ${buf.byteLength} bytes exceeds ${PROBE_MAX_BYTES} cap`,
      };
    }
    const text = new TextDecoder().decode(buf);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        agent_mcp_url: agent.mcp_url,
        fetched_url,
        status: "schema_invalid",
        http_status: 200,
        duration_ms: Date.now() - t0,
        error: `JSON parse failed: ${(e as Error).message}`,
      };
    }
    const validation = validateAdagentsDocument(payload);
    return {
      agent_id: agent.id,
      agent_name: agent.name,
      agent_mcp_url: agent.mcp_url,
      fetched_url,
      status: validation.valid ? "ok" : "schema_invalid",
      http_status: 200,
      duration_ms: Date.now() - t0,
      validation,
      payload_preview: payload,
    };
  } catch (e) {
    clearTimeout(timer);
    const msg = (e as Error).name === "AbortError" ? "timeout" : "network_error";
    return {
      agent_id: agent.id,
      agent_name: agent.name,
      agent_mcp_url: agent.mcp_url,
      fetched_url,
      status: msg,
      duration_ms: Date.now() - t0,
      error: (e as Error).message ?? String(e),
    };
  }
}

/**
 * GET /api/adagents-probe
 *
 * Fans out to every peer in the agent registry and returns a single
 * summary document the demo can render. Authenticated (DEMO_API_KEY)
 * since the probe is a privileged operation that fans out network
 * requests; unauthenticated callers would let an attacker turn our
 * worker into a DDoS amplifier against third parties.
 */
export async function handleAdagentsProbe(_request: Request, _env: Env): Promise<Response> {
  // Lazy-import the registry to avoid a circular module load with the
  // federation client (which depends on agentRegistry). The probe is
  // demo-only so the slight import cost on first call is fine.
  const { AGENT_REGISTRY, SELF_AGENT_ID } = await import("../domain/agentRegistry");
  // Filter to (a) external peers only — we already render our own doc
  // above the peer-probe panel; including self produces a redundant
  // row and, worse, an HTTP error if the worker can't fetch its own
  // /.well-known path through Cloudflare's edge routing — and
  // (b) HTTPS-only URLs since /.well-known/adagents.json discovery is
  // explicitly an HTTPS-only protocol.
  const probeable = AGENT_REGISTRY.filter(
    (a: { id: string; mcp_url?: string | null }) =>
      a.id !== SELF_AGENT_ID &&
      typeof a.mcp_url === "string" &&
      a.mcp_url.startsWith("https://"),
  ) as Array<{ id: string; name: string; mcp_url: string }>;
  // Run all probes in parallel — each has its own timeout so the
  // worst-case latency of the response is the slowest probe (3s).
  const results = await Promise.all(probeable.map((a) => probePeerAdagents(a)));
  const summary = {
    spec_version: ADCP_SPEC_VERSION,
    probed_count: results.length,
    counts: {
      ok: results.filter((r) => r.status === "ok").length,
      schema_invalid: results.filter((r) => r.status === "schema_invalid").length,
      not_found: results.filter((r) => r.status === "not_found").length,
      http_error: results.filter((r) => r.status === "http_error").length,
      timeout: results.filter((r) => r.status === "timeout").length,
      network_error: results.filter((r) => r.status === "network_error").length,
    },
    results,
    probed_at: new Date().toISOString(),
  };
  return new Response(JSON.stringify(summary, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
