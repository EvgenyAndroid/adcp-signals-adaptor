// tests/webhook.test.ts
// Sec-2: the activation webhook now marks `webhook_fired` only when the
// receiver returns 2xx. Prior behavior marked fired regardless of status,
// which silently dropped deliveries to a 500 (the next poll would not
// retry). The tests mock activationRepo so we can assert markWebhookFired
// is / isn't called based on the outbound Response status.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock() must be hoisted before any imports of the module under test.
// We stub the entire activationRepo module — the service layer is the unit
// we're testing, and the repo is irrelevant to the 2xx-gate logic.
vi.mock("../src/storage/activationRepo", () => ({
  findOperationById: vi.fn(),
  updateJobStatus: vi.fn(async () => {}),
  markWebhookFired: vi.fn(async () => {}),
  recordWebhookAttempt: vi.fn(async () => {}),
  createActivationJob: vi.fn(),
  appendEvent: vi.fn(),
  listJobsBySignal: vi.fn(),
}));

import { getOperationService } from "../src/domain/activationService";
import {
  findOperationById,
  updateJobStatus,
  markWebhookFired,
  recordWebhookAttempt,
} from "../src/storage/activationRepo";
import { createLogger } from "../src/utils/logger";

const mockFindOperation = vi.mocked(findOperationById);
const mockUpdateStatus = vi.mocked(updateJobStatus);
const mockMarkFired = vi.mocked(markWebhookFired);
const mockRecordAttempt = vi.mocked(recordWebhookAttempt);

// Minimal DB stub — the service never touches it directly on a completed
// op because updateJobStatus is mocked out at the module layer.
const db = {} as unknown as import("../src/storage/db").DB;
const logger = createLogger("test-webhook");

function completedOpWithWebhook(webhookUrl: string, overrides: Partial<{
  webhookFired: boolean;
  webhookAttempts: number;
  webhookNextAttemptAt: string;
}> = {}) {
  return {
    operationId: "op_test_1",
    signalId: "sig_drama_viewers",
    destination: "mock_dsp",
    status: "working" as const, // lazy state machine will advance to completed on poll
    webhookUrl,
    webhookFired: false,
    webhookAttempts: 0,
    submittedAt: "2026-04-19T00:00:00Z",
    updatedAt: "2026-04-19T00:00:00Z",
    ...overrides,
  };
}

describe("webhook 2xx gate", () => {
  beforeEach(() => {
    mockFindOperation.mockReset();
    mockUpdateStatus.mockReset().mockResolvedValue(undefined);
    mockMarkFired.mockReset().mockResolvedValue(undefined);
    mockRecordAttempt.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks fired on 2xx", async () => {
    mockFindOperation.mockResolvedValue(completedOpWithWebhook("https://example.com/hook"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    await getOperationService(db, "op_test_1", logger);

    expect(mockMarkFired).toHaveBeenCalledWith(db, "op_test_1");
    expect(mockMarkFired).toHaveBeenCalledTimes(1);
  });

  it("marks fired on 204", async () => {
    mockFindOperation.mockResolvedValue(completedOpWithWebhook("https://example.com/hook"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await getOperationService(db, "op_test_1", logger);

    expect(mockMarkFired).toHaveBeenCalledTimes(1);
  });

  it("does NOT mark fired on 4xx", async () => {
    mockFindOperation.mockResolvedValue(completedOpWithWebhook("https://example.com/hook"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad request", { status: 400 }),
    );

    await getOperationService(db, "op_test_1", logger);

    expect(mockMarkFired).not.toHaveBeenCalled();
  });

  it("does NOT mark fired on 5xx (so next poll retries)", async () => {
    mockFindOperation.mockResolvedValue(completedOpWithWebhook("https://example.com/hook"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("server error", { status: 500 }),
    );

    await getOperationService(db, "op_test_1", logger);

    expect(mockMarkFired).not.toHaveBeenCalled();
  });

  it("does NOT mark fired on a network error / timeout", async () => {
    mockFindOperation.mockResolvedValue(completedOpWithWebhook("https://example.com/hook"));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await getOperationService(db, "op_test_1", logger);

    expect(mockMarkFired).not.toHaveBeenCalled();
  });

  it("marks fired (no retry) on an invalid webhook URL — scheme check", async () => {
    mockFindOperation.mockResolvedValue(completedOpWithWebhook("http://example.com/hook"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await getOperationService(db, "op_test_1", logger);

    // Invalid URL is terminally bad — retrying won't help. Mark fired so
    // we don't redo the rejection on every poll.
    expect(mockMarkFired).toHaveBeenCalledTimes(1);
    // And we must NOT have actually dispatched the request.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("marks fired (no retry) on an unparseable webhook URL", async () => {
    mockFindOperation.mockResolvedValue(completedOpWithWebhook("not a url"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await getOperationService(db, "op_test_1", logger);

    expect(mockMarkFired).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("completed op without a webhook_url does not touch fetch or markFired", async () => {
    mockFindOperation.mockResolvedValue({
      ...completedOpWithWebhook("https://example.com/hook"),
      webhookUrl: undefined as unknown as string,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await getOperationService(db, "op_test_1", logger);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockMarkFired).not.toHaveBeenCalled();
  });

  it("already-fired webhook does not fire again", async () => {
    mockFindOperation.mockResolvedValue({
      ...completedOpWithWebhook("https://example.com/hook"),
      webhookFired: true,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await getOperationService(db, "op_test_1", logger);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockMarkFired).not.toHaveBeenCalled();
  });

  it("webhook fetch runs with an AbortController timeout signal", async () => {
    mockFindOperation.mockResolvedValue(completedOpWithWebhook("https://example.com/hook"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    await getOperationService(db, "op_test_1", logger);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
  });
});

// ── Sec-15: bounded retry policy ─────────────────────────────────────────────

describe("webhook retry bounding (Sec-15)", () => {
  beforeEach(() => {
    mockFindOperation.mockReset();
    mockUpdateStatus.mockReset().mockResolvedValue(undefined);
    mockMarkFired.mockReset().mockResolvedValue(undefined);
    mockRecordAttempt.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("non-2xx records the attempt and schedules a backoff", async () => {
    mockFindOperation.mockResolvedValue(completedOpWithWebhook("https://example.com/hook"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    await getOperationService(db, "op_test_1", logger);

    expect(mockMarkFired).not.toHaveBeenCalled();
    // attempts: 0 → 1 after this fire
    const call = mockRecordAttempt.mock.calls.at(-1);
    expect(call).toBeDefined();
    const [, opId, attempts, nextAt] = call!;
    expect(opId).toBe("op_test_1");
    expect(attempts).toBe(1);
    expect(nextAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
  });

  it("backoff window blocks re-fire on the next poll", async () => {
    // attempts=1, next-attempt 5 minutes from now → poll should NOT fire.
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    mockFindOperation.mockResolvedValue(
      completedOpWithWebhook("https://example.com/hook", {
        webhookAttempts: 1,
        webhookNextAttemptAt: future,
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await getOperationService(db, "op_test_1", logger);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockRecordAttempt).not.toHaveBeenCalled();
  });

  it("backoff window expired → poll re-fires", async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    mockFindOperation.mockResolvedValue(
      completedOpWithWebhook("https://example.com/hook", {
        webhookAttempts: 1,
        webhookNextAttemptAt: past,
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    await getOperationService(db, "op_test_1", logger);

    expect(fetchSpy).toHaveBeenCalled();
    // Attempt count incremented to 2
    expect(mockRecordAttempt.mock.calls.at(-1)?.[2]).toBe(2);
  });

  it("hits MAX_WEBHOOK_ATTEMPTS=5 → stops firing on subsequent polls", async () => {
    mockFindOperation.mockResolvedValue(
      completedOpWithWebhook("https://example.com/hook", {
        webhookAttempts: 5, // already at the cap
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await getOperationService(db, "op_test_1", logger);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockRecordAttempt).not.toHaveBeenCalled();
    expect(mockMarkFired).not.toHaveBeenCalled();
  });

  it("the LAST attempt (attempt #5) clears the next-attempt timestamp", async () => {
    // 4 attempts already done, next attempt window has passed.
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    mockFindOperation.mockResolvedValue(
      completedOpWithWebhook("https://example.com/hook", {
        webhookAttempts: 4,
        webhookNextAttemptAt: past,
      }),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    await getOperationService(db, "op_test_1", logger);

    const call = mockRecordAttempt.mock.calls.at(-1);
    expect(call?.[2]).toBe(5);          // attempts after this fire
    expect(call?.[3]).toBe(null);       // no next attempt — exhausted
  });

  it("2xx still bumps the attempts counter alongside markFired (observability)", async () => {
    mockFindOperation.mockResolvedValue(
      completedOpWithWebhook("https://example.com/hook", { webhookAttempts: 2 }),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await getOperationService(db, "op_test_1", logger);

    expect(mockMarkFired).toHaveBeenCalled();
    // attempts: 2 + 1 = 3 on the 2xx fire
    const call = mockRecordAttempt.mock.calls.at(-1);
    expect(call?.[2]).toBe(3);
    expect(call?.[3]).toBe(null); // success clears next-attempt window
  });

  it("network error counts as a retriable attempt (same backoff path)", async () => {
    mockFindOperation.mockResolvedValue(completedOpWithWebhook("https://example.com/hook"));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));

    await getOperationService(db, "op_test_1", logger);

    expect(mockMarkFired).not.toHaveBeenCalled();
    const call = mockRecordAttempt.mock.calls.at(-1);
    expect(call?.[2]).toBe(1);
    expect(call?.[3]).toMatch(/^\d{4}-/); // backoff scheduled
  });
});
