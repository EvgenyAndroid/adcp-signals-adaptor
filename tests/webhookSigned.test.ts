// tests/webhookSigned.test.ts
//
// End-to-end wiring (#248): when a signing key reaches getOperationService,
// the outbound activation webhook carries RFC 9421 headers that the
// official verifier accepts against the exact bytes sent on the wire —
// and when no key is configured, nothing signature-shaped is sent.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/storage/activationRepo", () => ({
  findOperationById: vi.fn(),
  updateJobStatus: vi.fn(async () => {}),
  markWebhookFired: vi.fn(async () => {}),
  recordWebhookAttempt: vi.fn(async () => {}),
  createActivationJob: vi.fn(),
  appendEvent: vi.fn(),
  listJobsBySignal: vi.fn(),
}));

import { createWebhookVerifier, StaticJwksResolver } from "@adcp/sdk/signing/server";
import { getOperationService } from "../src/domain/activationService";
import { findOperationById, markWebhookFired } from "../src/storage/activationRepo";
import { loadWebhookSigningKey, publicJwk, type WebhookSigningKey } from "../src/domain/webhookSigning";
import { createLogger } from "../src/utils/logger";

const mockFindOperation = vi.mocked(findOperationById);
const mockMarkFired = vi.mocked(markWebhookFired);

const db = {} as unknown as import("../src/storage/db").DB;
const logger = createLogger("test-signed");
const HOOK = "https://example.com/hook";

function opWithWebhook(webhookUrl: string) {
  return {
    operationId: "op_sig_1",
    signalId: "sig_drama_viewers",
    destination: "mock_dsp",
    status: "working" as const,
    webhookUrl,
    webhookFired: false,
    webhookAttempts: 0,
    submittedAt: "2026-04-19T00:00:00Z",
    updatedAt: "2026-04-19T00:00:00Z",
  };
}

async function mintKey(): Promise<WebhookSigningKey> {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", kp.privateKey)) as JsonWebKey;
  const key = loadWebhookSigningKey(
    JSON.stringify({ kid: "wiring-test", kty: "OKP", crv: "Ed25519", adcp_use: "request-signing", x: jwk.x, d: jwk.d }),
  );
  if (!key) throw new Error("minted key failed to load");
  return key;
}

interface Captured { url: string; method: string; headers: Record<string, string>; body: string }

function captureFetch(): { get: () => Captured } {
  let captured: Captured | null = null;
  vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
    const i = (init ?? {}) as RequestInit;
    captured = {
      url: String(url),
      method: String(i.method ?? "GET"),
      headers: (i.headers ?? {}) as Record<string, string>,
      body: String(i.body ?? ""),
    };
    return Promise.resolve(new Response(null, { status: 200 }));
  });
  return {
    get: () => {
      if (!captured) throw new Error("fetch was not called");
      return captured;
    },
  };
}

describe("activation webhook — RFC 9421 wiring through getOperationService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFindOperation.mockReset();
    mockMarkFired.mockReset().mockResolvedValue(undefined);
  });

  it("carries Content-Digest, Signature-Input and Signature when a key is provided", async () => {
    mockFindOperation.mockResolvedValue(opWithWebhook(HOOK));
    const cap = captureFetch();
    await getOperationService(db, "op_sig_1", logger, await mintKey());

    const { headers } = cap.get();
    expect(headers["Content-Digest"]).toMatch(/^sha-256=:/);
    expect(headers["Signature-Input"]).toContain('tag="adcp/webhook-signing/v1"');
    expect(headers["Signature-Input"]).toContain('keyid="wiring-test"');
    expect(headers["Signature"]).toMatch(/^sig1=:/);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["User-Agent"]).toBe("adcp-signals-adaptor/1.0");
    expect(headers["X-AdCP-Signature"]).toBeUndefined();
  });

  it("the official verifier accepts the delivery against the exact URL, headers and body sent", async () => {
    mockFindOperation.mockResolvedValue(opWithWebhook(HOOK));
    const cap = captureFetch();
    const key = await mintKey();
    await getOperationService(db, "op_sig_1", logger, key);

    const { url, method, headers, body } = cap.get();
    const verify = createWebhookVerifier({ jwks: new StaticJwksResolver([publicJwk(key)]) });
    const result = await verify({ method, url, headers, body });
    expect(result.status).toBe("verified");
    expect(result.keyid).toBe("wiring-test");
    expect(mockMarkFired).toHaveBeenCalledWith(db, "op_sig_1");
  });

  it("tampering with the wire body invalidates the delivery", async () => {
    mockFindOperation.mockResolvedValue(opWithWebhook(HOOK));
    const cap = captureFetch();
    const key = await mintKey();
    await getOperationService(db, "op_sig_1", logger, key);

    const { url, method, headers, body } = cap.get();
    const verify = createWebhookVerifier({ jwks: new StaticJwksResolver([publicJwk(key)]) });
    await expect(
      verify({ method, url, headers, body: body.replace("sig_drama_viewers", "sig_evil") }),
    ).rejects.toMatchObject({ code: "webhook_signature_digest_mismatch" });
  });

  it("sends no signature headers when no key is passed", async () => {
    mockFindOperation.mockResolvedValue(opWithWebhook(HOOK));
    const cap = captureFetch();
    await getOperationService(db, "op_sig_1", logger);

    const { headers } = cap.get();
    expect(headers["Signature"]).toBeUndefined();
    expect(headers["Signature-Input"]).toBeUndefined();
    expect(headers["Content-Digest"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sends no signature headers when the key is explicitly null", async () => {
    mockFindOperation.mockResolvedValue(opWithWebhook(HOOK));
    const cap = captureFetch();
    await getOperationService(db, "op_sig_1", logger, null);
    expect(cap.get().headers["Signature"]).toBeUndefined();
  });
});
