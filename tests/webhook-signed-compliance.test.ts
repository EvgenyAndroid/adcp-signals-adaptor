// tests/webhook-signed-compliance.test.ts
//
// The compliance controller's terminal webhook (force_task_completion →
// deliverCompletionWebhook) is the delivery the storyboard's
// signature_validity phase grades. It must be signed identically to the
// activation path: driven here end-to-end through the MCP handler
// (arm → consume → complete), with the outbound fetch captured and the
// captured request verified by the official @adcp/sdk webhook verifier
// against the public key the same env would publish at jwks.json.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWebhookVerifier, StaticJwksResolver } from "@adcp/sdk/signing/server";
import { handleMcpRequest } from "../src/mcp/server";
import { createLogger } from "../src/utils/logger";
import { loadWebhookSigningKey, publicJwk } from "../src/domain/webhookSigning";
import type { Env } from "../src/types/env";

const KEY = "compliance-signing-test";
const logger = createLogger("compliance-signing-test");
const RECEIVER = "https://receiver.example.com/adcp/webhook/get_signals/op_1";

function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    // The arm lookup reads with type "json" — honor it, or the arm is
    // silently a string and get_signals falls through to a normal search.
    async get(k: string, type?: string) {
      const v = store.get(k);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(k: string, v: string) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async list() { return { keys: [], list_complete: true } as never; },
    async getWithMetadata() { return { value: null, metadata: null } as never; },
  } as unknown as KVNamespace;
}

function makeEmptyDb(): Env["DB"] {
  return {
    prepare(_sql: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() { return { success: true, meta: {} }; },
      };
    },
  } as unknown as Env["DB"];
}

async function mintSecret(kid: string): Promise<string> {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", kp.privateKey)) as JsonWebKey;
  return JSON.stringify({ kid, kty: "OKP", crv: "Ed25519", adcp_use: "request-signing", x: jwk.x, d: jwk.d });
}

function env(jwk?: string): Env {
  return {
    DEMO_API_KEY: KEY,
    SIGNALS_CACHE: makeKv(),
    DB: makeEmptyDb(),
    ...(jwk !== undefined ? { WEBHOOK_SIGNING_PRIVATE_JWK: jwk } : {}),
  } as unknown as Env;
}

async function callTool(e: Env, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const req = new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  return JSON.parse(await (await handleMcpRequest(req, e, logger)).text()) as Record<string, unknown>;
}

interface Captured { url: string; method: string; headers: Record<string, string>; body: string }

function captureFetch(): { last: () => Captured; count: () => number } {
  const seen: Captured[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
    const i = (init ?? {}) as RequestInit;
    seen.push({
      url: String(url),
      method: String(i.method ?? "GET"),
      headers: (i.headers ?? {}) as Record<string, string>,
      body: String(i.body ?? ""),
    });
    return Promise.resolve(new Response(null, { status: 200 }));
  });
  return {
    last: () => { if (seen.length === 0) throw new Error("no outbound fetch captured"); return seen[seen.length - 1]!; },
    count: () => seen.length,
  };
}

async function armConsumeComplete(e: Env, taskId: string): Promise<void> {
  const armed = await callTool(e, "comply_test_controller", {
    scenario: "force_get_signals_arm",
    params: { arm: "submitted", task_id: taskId },
    account: { sandbox: true },
  });
  expect((armed["result"] as { structuredContent: { success: boolean } }).structuredContent.success).toBe(true);

  const consumed = await callTool(e, "get_signals", {
    push_notification_config: { url: RECEIVER, operation_id: "op_1" },
  });
  expect((consumed["result"] as { structuredContent: { status: string } }).structuredContent.status).toBe("submitted");

  const done = await callTool(e, "comply_test_controller", {
    scenario: "force_task_completion",
    params: { task_id: taskId, result: { signals: [{ signal_agent_segment_id: "seg_1" }] } },
    account: { sandbox: true },
  });
  expect((done["result"] as { structuredContent: { success: boolean } }).structuredContent.success).toBe(true);
}

describe("compliance-controller terminal webhook — signed under adcp/webhook-signing/v1", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("the delivery carries RFC 9421 headers and verifies against the key jwks.json would publish", async () => {
    const secret = await mintSecret("compliance-kid");
    const e = env(secret);
    const cap = captureFetch();

    await armConsumeComplete(e, "task_signed_1");

    expect(cap.count()).toBe(1);
    const { url, method, headers, body } = cap.last();
    expect(url).toBe(RECEIVER);
    expect(headers["Signature-Input"]).toContain('keyid="compliance-kid"');
    expect(headers["Signature-Input"]).toContain('tag="adcp/webhook-signing/v1"');
    expect(headers["Content-Digest"]).toMatch(/^sha-256=:/);
    expect(headers["User-Agent"]).toBe("adcp-signals-adaptor/1.0");
    expect(headers["X-AdCP-Signature"]).toBeUndefined();

    // The body is the canonical mcp-webhook-payload shape from earlier today.
    const payload = JSON.parse(body) as Record<string, unknown>;
    expect(payload["operation_id"]).toBe("op_1");
    expect(payload["task_id"]).toBe("task_signed_1");
    expect(typeof payload["idempotency_key"]).toBe("string");

    const key = loadWebhookSigningKey(secret)!;
    const verify = createWebhookVerifier({ jwks: new StaticJwksResolver([publicJwk(key)]) });
    const result = await verify({ method, url, headers, body });
    expect(result.status).toBe("verified");
    expect(result.keyid).toBe("compliance-kid");
  });

  it("without a key the delivery still happens, unsigned", async () => {
    const e = env();
    const cap = captureFetch();

    await armConsumeComplete(e, "task_unsigned_1");

    expect(cap.count()).toBe(1);
    const { headers } = cap.last();
    expect(headers["Signature"]).toBeUndefined();
    expect(headers["Signature-Input"]).toBeUndefined();
    expect(headers["Content-Digest"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
