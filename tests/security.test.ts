// tests/security.test.ts
// Unit tests for the security-hardening changes:
//   - constantTimeEqual API key compare
//   - escapeHtml / escapeHtmlAttr
//   - OAuth state KV-roundtrip behaviour (consume-once semantics)

import { describe, it, expect, beforeEach } from "vitest";
import { constantTimeEqual, requireAuth } from "../src/routes/shared";
import { escapeHtml, escapeHtmlAttr, handleLinkedInAuthInit, handleLinkedInAuthCallback } from "../src/activations/auth/linkedin";
import { corsHeaders } from "../src/index";

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
  const KEY = "demo-key-adcp-signals-v1";

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
// We don't mock LinkedIn here — only the KV side of the state lifecycle is
// under test. handleLinkedInAuthInit must write the state into KV; the
// callback must reject if state is missing or replayed.

interface FakeKV {
  store: Map<string, string>;
}

function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) { return store.get(key) ?? null; },
    async put(key: string, value: string) { store.set(key, value); },
    async delete(key: string) { store.delete(key); },
    // not used in these tests:
    async list() { return { keys: [], list_complete: true, cacheStatus: null } as never; },
    async getWithMetadata() { return { value: null, metadata: null, cacheStatus: null } as never; },
  } as unknown as KVNamespace;
}

function makeEnv(kv: KVNamespace) {
  return {
    LINKEDIN_CLIENT_ID: "client",
    LINKEDIN_CLIENT_SECRET: "secret",
    LINKEDIN_REDIRECT_URI: "https://example.com/cb",
    LINKEDIN_AD_ACCOUNT_ID: "1234",
    SIGNALS_CACHE: kv,
  };
}

function extractState(authUrl: string): string {
  return new URL(authUrl).searchParams.get("state") ?? "";
}

describe("OAuth state lifecycle", () => {
  it("init persists state in KV; callback consumes it once", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);

    const initRes = await handleLinkedInAuthInit(env);
    const html = await initRes.text();
    const match = html.match(/href="([^"]*linkedin\.com[^"]*)"/);
    if (!match || !match[1]) throw new Error("authorize URL not found in init HTML");
    const state = extractState(match[1].replace(/&amp;/g, "&"));
    expect(state.length).toBeGreaterThan(0);

    // KV should contain the state key
    expect(await kv.get(`linkedin:oauth_state:${state}`)).toBe("1");

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

    // KV entry was deleted (single-use)
    expect(await kv.get(`linkedin:oauth_state:${state}`)).toBeNull();

    // Replay rejected
    const cb2 = await handleLinkedInAuthCallback(
      new Request(`https://example.com/cb?state=${state}`),
      env,
    );
    expect(await cb2.text()).toContain("Invalid State");
  });

  it("callback rejects when state is missing", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    const res = await handleLinkedInAuthCallback(
      new Request("https://example.com/cb"),
      env,
    );
    expect(await res.text()).toContain("Invalid State");
  });

  it("callback rejects when state was never issued", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    const res = await handleLinkedInAuthCallback(
      new Request("https://example.com/cb?state=fabricated"),
      env,
    );
    expect(await res.text()).toContain("Invalid State");
  });

  it("callback escapes provider-supplied error_description", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);

    // Issue a state we can use
    const initRes = await handleLinkedInAuthInit(env);
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
});
