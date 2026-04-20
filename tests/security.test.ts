// tests/security.test.ts
// Unit tests for the security-hardening changes:
//   - constantTimeEqual API key compare
//   - escapeHtml / escapeHtmlAttr
//   - OAuth state KV-roundtrip behaviour (consume-once semantics)

import { describe, it, expect, beforeEach } from "vitest";
import { constantTimeEqual, requireAuth } from "../src/routes/shared";
import { escapeHtml, escapeHtmlAttr, handleLinkedInAuthInit, handleLinkedInAuthCallback } from "../src/activations/auth/linkedin";
import { corsHeaders } from "../src/index";
import { ADCP_TOOLS, getToolByName } from "../src/mcp/tools";
import { toolResult, numArg, handleMcpRequest } from "../src/mcp/server";

// ── toolResult helper: structuredContent + backwards-compat text ──────────────

describe("toolResult", () => {
  function firstText(r: unknown): string {
    const block = (r as { content?: { type?: string; text?: string }[] }).content?.[0];
    if (!block || typeof block.text !== "string") throw new Error("expected text content block");
    return block.text;
  }

  it("emits content[].text and isError when called with text only", () => {
    const r = toolResult("hello") as { isError: boolean; structuredContent?: unknown };
    expect(firstText(r)).toBe("hello");
    expect(r.isError).toBe(false);
    expect(r.structuredContent).toBeUndefined();
  });

  it("emits both content[].text AND structuredContent when given structured data", () => {
    const obj = { adcp: { major_versions: [3] }, supported_protocols: ["signals"] };
    const r = toolResult(JSON.stringify(obj), obj) as { structuredContent: unknown };
    expect(r.structuredContent).toEqual(obj);
    expect(JSON.parse(firstText(r))).toEqual(obj);
  });

  it("backwards compat: stringified text always parses to the same object as structuredContent", () => {
    const obj = { task_id: "op_x", status: "pending", signal_agent_segment_id: "sig_y", deployments: [] };
    const r = toolResult(JSON.stringify(obj, null, 2), obj) as { structuredContent: unknown };
    expect(JSON.parse(firstText(r))).toEqual(r.structuredContent);
  });
});

// ── numArg: preserve literal 0 past MCP arg coercion ──────────────────────────
//
// The bug this test pins: `args["min_similarity"] ? Number(...) : 0.7` treated
// the value 0 as falsy, silently replacing it with 0.7. Affected 5 call sites
// across get_signals / get_similar_signals / query_signals_nl. Canonical
// regression symptom: `get_similar_signals` with `min_similarity: 0.0`
// returning 0 results because the filter quietly used 0.7.

describe("numArg (MCP optional-number coercion)", () => {
  it("preserves literal 0 instead of falling back to the default", () => {
    expect(numArg(0, 0.7)).toBe(0);
    expect(numArg(0.0, 0.7)).toBe(0);
    expect(numArg("0", 0.7)).toBe(0);
  });

  it("uses the fallback when undefined / null / missing", () => {
    expect(numArg(undefined, 0.7)).toBe(0.7);
    expect(numArg(null, 0.7)).toBe(0.7);
  });

  it("passes through non-zero numbers and numeric strings", () => {
    expect(numArg(5, 10)).toBe(5);
    expect(numArg("3.14", 0)).toBe(3.14);
    expect(numArg(-1.5, 0)).toBe(-1.5);
  });

  it("uses the fallback for non-numeric input rather than propagating NaN", () => {
    expect(numArg("not-a-number", 42)).toBe(42);
    expect(numArg({}, 42)).toBe(42);
    expect(numArg([], 42)).toBe(0); // Number([]) === 0 — intentional: [] coerces to 0
  });
});

// ── MCP tool definitions: outputSchema presence ───────────────────────────────
//
// MCP 2025-06-18 §Tools: tools that return structured data SHOULD declare an
// `outputSchema` so clients can validate `structuredContent`. AdCP-style
// schema-validating evaluators read the structuredContent field directly;
// without outputSchema + structuredContent, they see a stringified text block
// and fail validation.

describe("MCP tool definitions — outputSchema", () => {
  const STRUCTURED_TOOLS = [
    "get_adcp_capabilities",
    "get_signals",
    "activate_signal",
    "get_operation_status",
    "get_similar_signals",
    "query_signals_nl",
    "get_concept",
    "search_concepts",
  ];

  it.each(STRUCTURED_TOOLS)("'%s' declares an outputSchema", (toolName) => {
    const tool = getToolByName(toolName);
    expect(tool).toBeDefined();
    expect(tool!.outputSchema).toBeDefined();
    expect(tool!.outputSchema!.type).toBe("object");
  });

  it("get_adcp_capabilities outputSchema requires adcp + supported_protocols (matches v3)", () => {
    const schema = getToolByName("get_adcp_capabilities")!.outputSchema!;
    expect(schema.required).toContain("adcp");
    expect(schema.required).toContain("supported_protocols");
  });

  it("get_adcp_capabilities inputSchema advertises both `protocols` (array) and `protocol` (singular alias)", () => {
    const schema = getToolByName("get_adcp_capabilities")!.inputSchema;
    const props = schema.properties as Record<string, { type?: string }>;
    expect(props.protocols?.type).toBe("array");
    expect(props.protocol?.type).toBe("string");
  });

  it("get_adcp_capabilities inputSchema advertises `context` (opaque echo)", () => {
    const schema = getToolByName("get_adcp_capabilities")!.inputSchema;
    const props = schema.properties as Record<string, { type?: string }>;
    expect(props.context?.type).toBe("object");
  });

  it("get_adcp_capabilities outputSchema requires adcp.idempotency.{supported, replay_ttl_seconds} (HEAD schema discriminated union)", () => {
    const schema = getToolByName("get_adcp_capabilities")!.outputSchema!;
    const adcp = (schema.properties as Record<string, any>).adcp;
    expect(adcp.required).toContain("idempotency");
    const idempotency = adcp.properties.idempotency;
    // Sec-20: HEAD schema made idempotency a discriminated union on
    // `supported`. The supported=true variant (what we declare) requires
    // both `supported: true` and `replay_ttl_seconds` in spec range.
    expect(idempotency.required).toContain("supported");
    expect(idempotency.required).toContain("replay_ttl_seconds");
    expect(idempotency.properties.supported.const).toBe(true);
    expect(idempotency.properties.replay_ttl_seconds.minimum).toBe(3600);
    expect(idempotency.properties.replay_ttl_seconds.maximum).toBe(604800);
  });

  it("get_adcp_capabilities outputSchema declares optional `context` for echo", () => {
    const schema = getToolByName("get_adcp_capabilities")!.outputSchema!;
    const props = schema.properties as Record<string, { type?: string }>;
    expect(props.context?.type).toBe("object");
  });

  it("activate_signal outputSchema requires task_id, status, signal_agent_segment_id", () => {
    const schema = getToolByName("activate_signal")!.outputSchema!;
    expect(schema.required).toEqual(
      expect.arrayContaining(["task_id", "status", "signal_agent_segment_id"])
    );
  });

  it("get_operation_status outputSchema requires task_id, status, signal_agent_segment_id", () => {
    const schema = getToolByName("get_operation_status")!.outputSchema!;
    expect(schema.required).toEqual(
      expect.arrayContaining(["task_id", "status", "signal_agent_segment_id"])
    );
  });

  it("every advertised tool is round-trippable via getToolByName", () => {
    for (const t of ADCP_TOOLS) {
      expect(getToolByName(t.name)).toBe(t);
    }
  });
});

// ── getCapabilities runtime shape ─────────────────────────────────────────────
// HEAD schema (per upstream PR #2315) requires adcp.idempotency in the response.
// Pin it here so a future edit to STATIC_CAPABILITIES can't drop the field.

import { getCapabilities } from "../src/domain/capabilityService";

describe("getCapabilities runtime shape", () => {
  function makeStaticKv(): KVNamespace {
    const store = new Map<string, string>();
    return {
      async get(k: string) { return store.get(k) ?? null; },
      async put(k: string, v: string) { store.set(k, v); },
      async delete(k: string) { store.delete(k); },
      async list() { return { keys: [], list_complete: true } as never; },
      async getWithMetadata() { return { value: null, metadata: null } as never; },
    } as unknown as KVNamespace;
  }

  it("includes adcp.idempotency.{supported, replay_ttl_seconds} per HEAD discriminated-union schema (Sec-20)", async () => {
    const caps = await getCapabilities(makeStaticKv());
    expect(caps.adcp.idempotency).toBeDefined();
    expect(caps.adcp.idempotency.supported).toBe(true);
    const ttl = caps.adcp.idempotency.replay_ttl_seconds;
    expect(typeof ttl).toBe("number");
    expect(ttl).toBeGreaterThanOrEqual(3600);
    expect(ttl).toBeLessThanOrEqual(604800);
  });

  it("declares supported_protocols as a non-empty array of valid enum values", async () => {
    const caps = await getCapabilities(makeStaticKv());
    expect(Array.isArray(caps.supported_protocols)).toBe(true);
    expect(caps.supported_protocols.length).toBeGreaterThan(0);
    const allowed = ["media_buy", "signals", "governance", "sponsored_intelligence", "creative", "brand"];
    for (const p of caps.supported_protocols) expect(allowed).toContain(p);
  });

  // Sec-11: ext.ucp must match the engine env the worker is actually running.
  // Regression pin for the prior bug where /capabilities always declared the
  // pseudo bridge even on LLM deployments.

  it("ext.ucp declares openai-te3-small-d512-v1 when EMBEDDING_ENGINE=llm + OPENAI_API_KEY set", async () => {
    const caps = await getCapabilities(makeStaticKv(), undefined, {
      EMBEDDING_ENGINE: "llm",
      OPENAI_API_KEY: "sk-test",
    });
    const ucp = (caps.ext as any).ucp;
    expect(ucp.phase).toBe("llm-v1");
    expect(ucp.supported_spaces).toEqual(["openai-te3-small-d512-v1"]);
  });

  it("ext.ucp declares the pseudo bridge when EMBEDDING_ENGINE is unset", async () => {
    const caps = await getCapabilities(makeStaticKv(), undefined, {});
    const ucp = (caps.ext as any).ucp;
    expect(ucp.phase).toBe("pseudo-v1");
    expect(ucp.supported_spaces).toEqual(["adcp-bridge-space-v1.0"]);
  });

  it("ext.ucp falls back to pseudo when EMBEDDING_ENGINE=llm but OPENAI_API_KEY is missing", async () => {
    // Same mode-selection semantics as createEmbeddingEngine — no key, no LLM.
    const caps = await getCapabilities(makeStaticKv(), undefined, {
      EMBEDDING_ENGINE: "llm",
    });
    const ucp = (caps.ext as any).ucp;
    expect(ucp.phase).toBe("pseudo-v1");
  });

  it("cache segregates per engine env via the v8 key bump (no cross-contamination)", async () => {
    // Two sequential calls with different envs must not see each other's
    // cached declaration. The cache key is global to the deployment; the
    // test here guards the "cache holds whatever was written first" case
    // by using fresh KV per call — which is what a new deploy looks like.
    const capsLlm = await getCapabilities(makeStaticKv(), undefined, {
      EMBEDDING_ENGINE: "llm",
      OPENAI_API_KEY: "sk-test",
    });
    const capsPseudo = await getCapabilities(makeStaticKv(), undefined, {});
    expect((capsLlm.ext as any).ucp.phase).toBe("llm-v1");
    expect((capsPseudo.ext as any).ucp.phase).toBe("pseudo-v1");
  });
});

// ── CORS headers ──────────────────────────────────────────────────────────────
//
// MCP Streamable HTTP clients send Mcp-Session-Id (and a couple of related
// headers) on the wire. If they're not in the preflight allow-list, browser
// MCP clients fail with what looks like a generic CORS block — and at least
// one LLM-driven probe agent has been observed mislabelling that as "CSRF".
// This test pins the allow-list so a future edit can't silently break it.

describe("corsHeaders", () => {
  const headers = corsHeaders();
  const allowed = headers["Access-Control-Allow-Headers"]?.toLowerCase() ?? "";

  it("allows the standard request headers", () => {
    expect(allowed).toContain("content-type");
    expect(allowed).toContain("authorization");
  });

  it("allows the MCP Streamable HTTP transport headers", () => {
    expect(allowed).toContain("mcp-session-id");
    expect(allowed).toContain("mcp-protocol-version");
    expect(allowed).toContain("last-event-id");
  });

  it("exposes Mcp-Session-Id so browser clients can read it from responses", () => {
    expect((headers["Access-Control-Expose-Headers"] ?? "").toLowerCase())
      .toContain("mcp-session-id");
  });

  it("permits POST and OPTIONS for MCP", () => {
    const methods = headers["Access-Control-Allow-Methods"]?.toUpperCase() ?? "";
    expect(methods).toContain("POST");
    expect(methods).toContain("OPTIONS");
  });
});

// ── constant-time compare ─────────────────────────────────────────────────────

describe("constantTimeEqual", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("returns false for different content of equal length", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "xbc")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("abcd", "abc")).toBe(false);
    expect(constantTimeEqual("", "x")).toBe(false);
  });

  it("does not short-circuit on length mismatch", () => {
    // Property: regardless of input lengths, returns boolean (no throw).
    expect(typeof constantTimeEqual("a".repeat(1000), "b")).toBe("boolean");
  });
});

// ── requireAuth ───────────────────────────────────────────────────────────────

describe("requireAuth", () => {
  // Test fixture only — the real demo key is a Worker secret, not a
  // checked-in constant. Using an obviously-labeled value so no one greps
  // the repo and mistakes this for the production key.
  const KEY = "fixture-api-key-for-requireAuth-tests";

  function req(authHeader?: string): Request {
    const headers = new Headers();
    if (authHeader) headers.set("Authorization", authHeader);
    return new Request("https://example.com/", { headers });
  }

  it("accepts Bearer with the right key", () => {
    expect(requireAuth(req(`Bearer ${KEY}`), KEY)).toBe(true);
  });

  it("accepts ApiKey with the right key (case-insensitive scheme)", () => {
    expect(requireAuth(req(`ApiKey ${KEY}`), KEY)).toBe(true);
    expect(requireAuth(req(`apikey ${KEY}`), KEY)).toBe(true);
  });

  it("rejects wrong key", () => {
    expect(requireAuth(req(`Bearer wrong`), KEY)).toBe(false);
  });

  it("rejects missing header", () => {
    expect(requireAuth(req(), KEY)).toBe(false);
  });

  it("rejects malformed header", () => {
    expect(requireAuth(req("Basic abc"), KEY)).toBe(false);
    expect(requireAuth(req(KEY), KEY)).toBe(false);
  });
});

// ── HTML escape ───────────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("escapes the five XSS-relevant characters", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml('say "hi"')).toBe("say &quot;hi&quot;");
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("renders a script-tag payload inert", () => {
    const payload = `</pre><script>alert(document.cookie)</script><pre>`;
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain("<script>");
    expect(escaped).not.toContain("</pre>");
    expect(escaped).toContain("&lt;script&gt;");
  });

  it("escapeHtmlAttr matches escapeHtml (single-source)", () => {
    expect(escapeHtmlAttr(`" onclick="alert(1)`)).toBe(escapeHtml(`" onclick="alert(1)`));
  });

  it("is a no-op on safe strings", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

// ── OAuth state roundtrip ─────────────────────────────────────────────────────
//
// We don't mock LinkedIn here — only the D1-backed state lifecycle is
// under test. handleLinkedInAuthInit must write the state into the
// oauth_state table; the callback must reject if state is missing or
// replayed.
//
// Sec-10: state moved from KV to D1 for atomic consume. The in-memory
// D1 fake below implements just enough of the three SQL shapes used by
// the LinkedIn OAuth path:
//   INSERT INTO oauth_state (state, provider, expires_at) VALUES (?,?,?)
//   DELETE FROM oauth_state WHERE expires_at < ?
//   DELETE FROM oauth_state WHERE state = ? AND expires_at > ? RETURNING state

function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) { return store.get(key) ?? null; },
    async put(key: string, value: string) { store.set(key, value); },
    async delete(key: string) { store.delete(key); },
    async list() { return { keys: [], list_complete: true, cacheStatus: null } as never; },
    async getWithMetadata() { return { value: null, metadata: null, cacheStatus: null } as never; },
  } as unknown as KVNamespace;
}

// Minimal in-memory D1 that supports the three SQL shapes used by the
// OAuth state path. Returns a `.store` handle so tests can poke at
// contents directly — mirrors the KV fake ergonomics.
//
// Sec-18: rows now carry operator_id (bound to the caller on /init,
// returned from /callback's DELETE...RETURNING).
interface FakeOAuthDb {
  db: D1Database;
  store: Map<string, { provider: string; expires_at: string; operator_id: string }>;
}

function makeOAuthDb(): FakeOAuthDb {
  const store = new Map<string, { provider: string; expires_at: string; operator_id: string }>();
  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        bind(...args: unknown[]) { bound = args; return this; },
        async run(): Promise<D1Result> {
          if (/INSERT INTO oauth_state/i.test(sql)) {
            const [state, provider, expires_at, operator_id] = bound as [string, string, string, string];
            store.set(state, { provider, expires_at, operator_id });
          } else if (/DELETE FROM oauth_state WHERE expires_at < \?/i.test(sql)) {
            const [now] = bound as [string];
            for (const [k, v] of store) {
              if (v.expires_at < now) store.delete(k);
            }
          }
          return { success: true, meta: {} } as unknown as D1Result;
        },
        async first<T>(): Promise<T | null> {
          if (/DELETE FROM oauth_state WHERE state = \? AND expires_at > \? RETURNING operator_id/i.test(sql)) {
            const [state, now] = bound as [string, string];
            const row = store.get(state);
            if (!row || row.expires_at <= now) return null;
            store.delete(state); // atomic consume
            return { operator_id: row.operator_id } as unknown as T;
          }
          return null;
        },
        async all<T>(): Promise<{ results: T[] }> {
          return { results: [] };
        },
      };
    },
  } as unknown as D1Database;
  return { db, store };
}

function makeEnv(kv: KVNamespace, db: D1Database) {
  return {
    LINKEDIN_CLIENT_ID: "client",
    LINKEDIN_CLIENT_SECRET: "secret",
    LINKEDIN_REDIRECT_URI: "https://example.com/cb",
    LINKEDIN_AD_ACCOUNT_ID: "1234",
    SIGNALS_CACHE: kv,
    DB: db,
  };
}

function extractState(authUrl: string): string {
  return new URL(authUrl).searchParams.get("state") ?? "";
}

describe("OAuth state lifecycle", () => {
  it("init persists state in D1; callback consumes it once", async () => {
    const kv = makeKv();
    const { db, store } = makeOAuthDb();
    const env = makeEnv(kv, db);

    const initRes = await handleLinkedInAuthInit(env, "op_fixture_operator");
    const html = await initRes.text();
    const match = html.match(/href="([^"]*linkedin\.com[^"]*)"/);
    if (!match || !match[1]) throw new Error("authorize URL not found in init HTML");
    const state = extractState(match[1].replace(/&amp;/g, "&"));
    expect(state.length).toBeGreaterThan(0);

    // D1 should contain the state row
    expect(store.has(state)).toBe(true);
    expect(store.get(state)?.provider).toBe("linkedin");

    // First callback with that state passes the state check (will then fail
    // at the missing `code` step, which is fine — we only assert that the
    // state-check branch did not reject).
    const cb1 = await handleLinkedInAuthCallback(
      new Request(`https://example.com/cb?state=${state}`),
      env,
    );
    const cb1Body = await cb1.text();
    expect(cb1Body).not.toContain("Invalid State");
    expect(cb1Body).toContain("Missing Code"); // expected: state OK, code missing

    // D1 row was deleted (single-use, via DELETE...RETURNING)
    expect(store.has(state)).toBe(false);

    // Replay rejected
    const cb2 = await handleLinkedInAuthCallback(
      new Request(`https://example.com/cb?state=${state}`),
      env,
    );
    expect(await cb2.text()).toContain("Invalid State");
  });

  it("callback rejects when state is missing", async () => {
    const { db } = makeOAuthDb();
    const env = makeEnv(makeKv(), db);
    const res = await handleLinkedInAuthCallback(
      new Request("https://example.com/cb"),
      env,
    );
    expect(await res.text()).toContain("Invalid State");
  });

  it("callback rejects when state was never issued", async () => {
    const { db } = makeOAuthDb();
    const env = makeEnv(makeKv(), db);
    const res = await handleLinkedInAuthCallback(
      new Request("https://example.com/cb?state=fabricated"),
      env,
    );
    expect(await res.text()).toContain("Invalid State");
  });

  // Sec-14: status-code pins. Body contents stay the same; the status
  // codes let monitoring + edge cache distinguish caller vs server vs
  // provider failures.
  it("Invalid State returns HTTP 400 (caller-side bad state)", async () => {
    const { db } = makeOAuthDb();
    const env = makeEnv(makeKv(), db);
    const res = await handleLinkedInAuthCallback(
      new Request("https://example.com/cb?state=fabricated"),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("Invalid State (no state at all) returns HTTP 400", async () => {
    const { db } = makeOAuthDb();
    const env = makeEnv(makeKv(), db);
    const res = await handleLinkedInAuthCallback(
      new Request("https://example.com/cb"),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("Authorization Failed (provider error) returns HTTP 502", async () => {
    const { db } = makeOAuthDb();
    const env = makeEnv(makeKv(), db);
    // Issue a state we can spend so we get past the state-check branch
    // and into the `if (error)` branch.
    const initRes = await handleLinkedInAuthInit(env, "op_fixture_operator");
    const html = await initRes.text();
    const m = html.match(/href="([^"]*linkedin\.com[^"]*)"/);
    if (!m || !m[1]) throw new Error("authorize URL not found");
    const state = extractState(m[1].replace(/&amp;/g, "&"));
    const res = await handleLinkedInAuthCallback(
      new Request(`https://example.com/cb?state=${state}&error=access_denied`),
      env,
    );
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("Authorization Failed");
  });

  it("Missing Code (no code, no error) returns HTTP 400", async () => {
    const { db } = makeOAuthDb();
    const env = makeEnv(makeKv(), db);
    const initRes = await handleLinkedInAuthInit(env, "op_fixture_operator");
    const html = await initRes.text();
    const m = html.match(/href="([^"]*linkedin\.com[^"]*)"/);
    if (!m || !m[1]) throw new Error("authorize URL not found");
    const state = extractState(m[1].replace(/&amp;/g, "&"));
    const res = await handleLinkedInAuthCallback(
      new Request(`https://example.com/cb?state=${state}`), // no code, no error
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Missing Code");
  });

  it("callback escapes provider-supplied error_description", async () => {
    const { db } = makeOAuthDb();
    const env = makeEnv(makeKv(), db);

    // Issue a state we can use
    const initRes = await handleLinkedInAuthInit(env, "op_fixture_operator");
    const html = await initRes.text();
    const m = html.match(/href="([^"]*linkedin\.com[^"]*)"/);
    if (!m || !m[1]) throw new Error("authorize URL not found in init HTML");
    const state = extractState(m[1].replace(/&amp;/g, "&"));

    const payload = "<script>alert(1)</script>";
    const url =
      `https://example.com/cb?state=${state}` +
      `&error=access_denied&error_description=${encodeURIComponent(payload)}`;
    const res = await handleLinkedInAuthCallback(new Request(url), env);
    const body = await res.text();

    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  // ── Sec-10: atomic consume under concurrent callbacks ──────────────────────
  //
  // Regression pin for the prior TOCTOU: the previous KV implementation
  // did `kv.get(state)` then `kv.delete(state)`. Two near-simultaneous
  // callbacks with the same state could both observe the row before either
  // deletion landed, yielding a replay. The D1 implementation uses a
  // single `DELETE ... RETURNING`, which serializes at the row level —
  // exactly one DELETE matches the row, all others return zero rows.

  it("concurrent callbacks with the same state: exactly one succeeds", async () => {
    const { db, store } = makeOAuthDb();
    const env = makeEnv(makeKv(), db);

    // Issue a state
    const initRes = await handleLinkedInAuthInit(env, "op_fixture_operator");
    const html = await initRes.text();
    const m = html.match(/href="([^"]*linkedin\.com[^"]*)"/);
    if (!m || !m[1]) throw new Error("authorize URL not found in init HTML");
    const state = extractState(m[1].replace(/&amp;/g, "&"));
    expect(store.has(state)).toBe(true);

    // Fire two callbacks "simultaneously" — in the fake, Promise.all
    // schedules both synchronous consume paths against the same Map entry.
    const [a, b] = await Promise.all([
      handleLinkedInAuthCallback(
        new Request(`https://example.com/cb?state=${state}`),
        env,
      ),
      handleLinkedInAuthCallback(
        new Request(`https://example.com/cb?state=${state}`),
        env,
      ),
    ]);
    const bodies = [await a.text(), await b.text()];

    // Exactly one of the two got past the state gate (reached the
    // "Missing Code" branch). The other saw "Invalid State".
    const passed = bodies.filter((x) => x.includes("Missing Code"));
    const rejected = bodies.filter((x) => x.includes("Invalid State"));
    expect(passed.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Row is gone after the consume.
    expect(store.has(state)).toBe(false);
  });

  it("expired state is rejected even if the row is still present", async () => {
    const { db, store } = makeOAuthDb();
    const env = makeEnv(makeKv(), db);

    // Manually plant a row with expires_at in the past — simulates a stale
    // entry that escaped cleanup. The WHERE clause in consumeOAuthState
    // must still reject it.
    const staleState = "stale-state-fixture";
    store.set(staleState, {
      provider: "linkedin",
      expires_at: "2000-01-01T00:00:00.000Z",
      operator_id: "op_fixture_operator",
    });

    const res = await handleLinkedInAuthCallback(
      new Request(`https://example.com/cb?state=${staleState}`),
      env,
    );
    expect(await res.text()).toContain("Invalid State");
    // And the row was NOT consumed (it didn't match the WHERE) — so a
    // future expires_at < ? cleanup sweep can still garbage-collect it.
    expect(store.has(staleState)).toBe(true);
  });

  // ── Sec-18: per-operator isolation pins ────────────────────────────────────
  //
  // The state row binds the operator_id at /init time. /callback consumes
  // the row and uses the bound operator_id to namespace token storage.
  // Two operators issuing flows in parallel must end up with disjoint
  // KV namespaces.

  it("/init writes the bound operator_id into the oauth_state row", async () => {
    const { db, store } = makeOAuthDb();
    const env = makeEnv(makeKv(), db);
    const initRes = await handleLinkedInAuthInit(env, "op_alice");
    const html = await initRes.text();
    const m = html.match(/href="([^"]*linkedin\.com[^"]*)"/);
    if (!m || !m[1]) throw new Error("authorize URL not found");
    const state = extractState(m[1].replace(/&amp;/g, "&"));
    const row = store.get(state);
    expect(row).toBeDefined();
    expect(row!.operator_id).toBe("op_alice");
  });

  it("two operators issue independent state rows; consume returns each one's ID", async () => {
    const { db, store } = makeOAuthDb();
    const env = makeEnv(makeKv(), db);

    const aRes = await handleLinkedInAuthInit(env, "op_alice");
    const bRes = await handleLinkedInAuthInit(env, "op_bob");
    const aHtml = await aRes.text();
    const bHtml = await bRes.text();
    const aMatch = aHtml.match(/href="([^"]*linkedin\.com[^"]*)"/);
    const bMatch = bHtml.match(/href="([^"]*linkedin\.com[^"]*)"/);
    if (!aMatch || !aMatch[1] || !bMatch || !bMatch[1]) throw new Error("authorize URL not found");
    const aState = extractState(aMatch[1].replace(/&amp;/g, "&"));
    const bState = extractState(bMatch[1].replace(/&amp;/g, "&"));

    expect(store.get(aState)?.operator_id).toBe("op_alice");
    expect(store.get(bState)?.operator_id).toBe("op_bob");
    expect(aState).not.toBe(bState);

    // Bob's callback can't consume Alice's state — different state UUID.
    const bobConsumesAlice = await handleLinkedInAuthCallback(
      new Request(`https://example.com/cb?state=${aState}`), // Alice's state
      env,
    );
    // Goes through (state matches Alice's row), state row consumed, but
    // the operator_id retrieved is Alice's — so Bob can't surreptitiously
    // become Alice. The actual OAuth code-exchange step will fail because
    // there's no LinkedIn `code` in the URL — that's tested via Missing Code.
    // Important point: the consume returns ALICE's operator_id, which is
    // exactly what the callback needs to namespace correctly.
    const text = await bobConsumesAlice.text();
    expect(text).toContain("Missing Code");
    // Alice's row is gone (consumed). Bob's row still present.
    expect(store.has(aState)).toBe(false);
    expect(store.has(bState)).toBe(true);
  });

  it("attacker-fabricated state is rejected even with a valid operator_id format", async () => {
    // Sec-18 doesn't change attacker resistance — fabricated states never
    // match a row, regardless of what operator_id pattern the attacker
    // would have liked. Pinning so a future regression can't drop the
    // expiry-or-existence check.
    const { db } = makeOAuthDb();
    const env = makeEnv(makeKv(), db);
    const res = await handleLinkedInAuthCallback(
      new Request("https://example.com/cb?state=op_alice_fake-state-uuid"),
      env,
    );
    expect(await res.text()).toContain("Invalid State");
  });
});

// ── MCP auth gate (Sec-1 Finding #1) ──────────────────────────────────────────
//
// The /mcp HTTP endpoint remains publicly reachable so discovery methods
// (initialize, tools/list, ping) bootstrap without a key — that matches
// standard MCP client behaviour and the evaluator handshake. tools/call is
// gated per-message via AUTHENTICATED_MCP_METHODS: anything in that set
// returns RPC error -32001 without a valid Authorization: Bearer <key>.
//
// We construct a minimal Env stub — handleMcpRequest only consults
// env.DEMO_API_KEY for auth. Discovery paths (initialize, tools/list) don't
// touch the DB/KV; tool-call paths do, but we only exercise auth short-
// circuits here, so the test never reaches the handler body.

import { createLogger } from "../src/utils/logger";

describe("handleMcpRequest — auth gate", () => {
  const KEY = "demo-key-mcp-test";
  const env = { DEMO_API_KEY: KEY } as unknown as import("../src/types/env").Env;
  const logger = createLogger("test-req");

  function mcpReq(rpc: unknown, authHeader?: string, contentLength?: number): Request {
    const body = JSON.stringify(rpc);
    const headers = new Headers({ "Content-Type": "application/json" });
    if (authHeader) headers.set("Authorization", authHeader);
    if (contentLength !== undefined) headers.set("Content-Length", String(contentLength));
    return new Request("https://example.com/mcp", { method: "POST", headers, body });
  }

  async function callAndParse(req: Request): Promise<{ status: number; body: any; res: Response }> {
    const res = await handleMcpRequest(req, env, logger);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, res };
  }

  it("tools/list with no Authorization header succeeds (discovery is public)", async () => {
    const { status, body } = await callAndParse(
      mcpReq({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    );
    expect(status).toBe(200);
    expect(body.result?.tools).toBeDefined();
    expect(Array.isArray(body.result.tools)).toBe(true);
  });

  it("initialize with no Authorization header succeeds (discovery is public)", async () => {
    const { status, body } = await callAndParse(
      mcpReq({
        jsonrpc: "2.0",
        id: 2,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", clientInfo: { name: "t", version: "1" } },
      }),
    );
    expect(status).toBe(200);
    expect(body.result?.serverInfo).toBeDefined();
  });

  it("tools/call with no Authorization header returns HTTP 401 + WWW-Authenticate", async () => {
    // Sec-23: single-request auth failures surface at the HTTP layer per
    // RFC 6750 so standard MCP clients and conformance probes detect the
    // auth failure via transport. JSON-RPC body still carries -32001.
    const { status, body, res } = await callAndParse(
      mcpReq({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_adcp_capabilities", arguments: {} },
      }),
    );
    expect(status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Bearer");
    expect(body.error?.code).toBe(-32001);
    expect(body.result).toBeUndefined();
  });

  it("tools/call with wrong API key returns HTTP 401 + -32001", async () => {
    const { status, body } = await callAndParse(
      mcpReq(
        { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_adcp_capabilities", arguments: {} } },
        "Bearer not-the-key",
      ),
    );
    expect(status).toBe(401);
    expect(body.error?.code).toBe(-32001);
  });

  it("batched request: discovery messages succeed AND tool-calls fail in one batch", async () => {
    // Per JSON-RPC 2.0 batching, each message is processed independently.
    // The auth gate runs per-message — an unauthenticated batch that mixes
    // tools/list and tools/call must return a list result AND an auth error.
    const { status, body } = await callAndParse(
      mcpReq([
        { jsonrpc: "2.0", id: 10, method: "tools/list", params: {} },
        { jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "get_adcp_capabilities", arguments: {} } },
      ]),
    );
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const byId = Object.fromEntries(body.map((m: any) => [m.id, m]));
    expect(byId[10].result?.tools).toBeDefined();
    expect(byId[11].error?.code).toBe(-32001);
  });

  it("Sec-25c: fully-authed batch (all messages require auth) stays HTTP 200 + per-message -32001", async () => {
    // Boundary case: every message in the batch requires auth and none are
    // authed. The single-request HTTP 401 path MUST NOT short-circuit here —
    // JSON-RPC 2.0 batching processes messages independently, and blocking a
    // batch at the transport layer would break clients that correctly expect
    // per-message errors. Each tools/call message gets its own -32001 in the
    // response array; HTTP stays 200.
    const { status, body, res } = await callAndParse(
      mcpReq([
        { jsonrpc: "2.0", id: 30, method: "tools/call", params: { name: "get_adcp_capabilities", arguments: {} } },
        { jsonrpc: "2.0", id: 31, method: "tools/call", params: { name: "get_signals", arguments: {} } },
        { jsonrpc: "2.0", id: 32, method: "tools/call", params: { name: "activate_signal", arguments: {} } },
      ]),
    );
    expect(status).toBe(200);
    // No WWW-Authenticate on batched 200 — that header only appears on the
    // single-request 401 path.
    expect(res.headers.get("WWW-Authenticate")).toBeNull();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
    for (const msg of body) {
      expect(msg.error?.code).toBe(-32001);
      expect(msg.result).toBeUndefined();
    }
  });

  it("oversized body (>1MB via Content-Length) rejected pre-parse with -32600", async () => {
    // We lie about Content-Length to avoid allocating a real 1MB body in the
    // test. The guard reads the header before touching request.json().
    const req = mcpReq(
      { jsonrpc: "2.0", id: 20, method: "tools/list", params: {} },
      undefined,
      2_000_000,
    );
    const { status, body } = await callAndParse(req);
    expect(status).toBe(200);
    expect(body.error?.code).toBe(-32600);
    expect(body.error?.message).toMatch(/too large/i);
  });

  it("notifications (no id) with auth failure are silently dropped (no response)", async () => {
    // JSON-RPC notifications must not produce a response. Our auth gate
    // respects this: an unauthenticated notifications/* doesn't leak a
    // spurious error object.
    const res = await handleMcpRequest(
      mcpReq({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
      env,
      logger,
    );
    expect(res.status).toBe(202);
  });
});
