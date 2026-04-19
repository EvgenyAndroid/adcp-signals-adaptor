// tests/webhookSigned.test.ts
// Sec-3: End-to-end wiring — when WEBHOOK_SIGNING_SECRET is passed through
// getOperationService, the outbound fetch carries X-AdCP-Signature and the
// signature verifies against the exact body sent on the wire.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/storage/activationRepo", () => ({
  findOperationById: vi.fn(),
  updateJobStatus: vi.fn(async () => {}),
  markWebhookFired: vi.fn(async () => {}),
  createActivationJob: vi.fn(),
  appendEvent: vi.fn(),
  listJobsBySignal: vi.fn(),
}));

import { getOperationService } from "../src/domain/activationService";
import { findOperationById, markWebhookFired } from "../src/storage/activationRepo";
import { verifyWebhookSignature } from "../src/domain/webhookSigning";
import { createLogger } from "../src/utils/logger";

const mockFindOperation = vi.mocked(findOperationById);
const mockMarkFired = vi.mocked(markWebhookFired);

const db = {} as unknown as import("../src/storage/db").DB;
const logger = createLogger("test-signed");

function opWithWebhook(webhookUrl: string) {
  return {
    operationId: "op_sig_1",
    signalId: "sig_drama_viewers",
    destination: "mock_dsp",
    status: "working" as const,
    webhookUrl,
    webhookFired: false,
    submittedAt: "2026-04-19T00:00:00Z",
    updatedAt: "2026-04-19T00:00:00Z",
  };
}

describe("webhook HMAC signing wiring", () => {
  beforeEach(() => {
    mockFindOperation.mockReset();
    mockMarkFired.mockReset().mockResolvedValue(undefined);
  });

  it("adds X-AdCP-Signature header when WEBHOOK_SIGNING_SECRET is provided", async () => {
    mockFindOperation.mockResolvedValue(opWithWebhook("https://example.com/hook"));
    let captured: { url: string; init: RequestInit } | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      captured = { url: String(url), init: init as RequestInit };
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    await getOperationService(db, "op_sig_1", logger, "super-secret");

    expect(captured).not.toBeNull();
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers["X-AdCP-Signature"]).toBeDefined();
    expect(headers["X-AdCP-Signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });

  it("signature verifies against the exact body sent on the wire", async () => {
    mockFindOperation.mockResolvedValue(opWithWebhook("https://example.com/hook"));
    let captured: { body: string; headers: Record<string, string> } | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const i = init as RequestInit;
      captured = {
        body: i.body as string,
        headers: i.headers as Record<string, string>,
      };
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    const secret = "super-secret";
    await getOperationService(db, "op_sig_1", logger, secret);

    expect(captured).not.toBeNull();
    const { body, headers } = captured!;
    const ok = await verifyWebhookSignature(
      secret,
      body,
      headers["X-AdCP-Signature"]!,
      { tolerance: 60 },
    );
    expect(ok).toBe(true);
  });

  it("omits X-AdCP-Signature when no secret is passed (backwards-compat)", async () => {
    mockFindOperation.mockResolvedValue(opWithWebhook("https://example.com/hook"));
    let captured: { headers: Record<string, string> } | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      captured = { headers: (init as RequestInit).headers as Record<string, string> };
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    await getOperationService(db, "op_sig_1", logger); // no secret

    expect(captured).not.toBeNull();
    expect(captured!.headers["X-AdCP-Signature"]).toBeUndefined();
  });

  it("omits X-AdCP-Signature when secret is the empty string", async () => {
    mockFindOperation.mockResolvedValue(opWithWebhook("https://example.com/hook"));
    let captured: { headers: Record<string, string> } | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      captured = { headers: (init as RequestInit).headers as Record<string, string> };
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    await getOperationService(db, "op_sig_1", logger, "");

    expect(captured).not.toBeNull();
    expect(captured!.headers["X-AdCP-Signature"]).toBeUndefined();
  });

  it("tampering with the captured body invalidates the signature", async () => {
    mockFindOperation.mockResolvedValue(opWithWebhook("https://example.com/hook"));
    let captured: { body: string; headers: Record<string, string> } | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const i = init as RequestInit;
      captured = {
        body: i.body as string,
        headers: i.headers as Record<string, string>,
      };
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    const secret = "super-secret";
    await getOperationService(db, "op_sig_1", logger, secret);

    const tampered = captured!.body.replace("sig_drama_viewers", "sig_evil");
    const ok = await verifyWebhookSignature(
      secret,
      tampered,
      captured!.headers["X-AdCP-Signature"]!,
      { tolerance: 60 },
    );
    expect(ok).toBe(false);
  });
});
