// tests/activation-idempotency.test.ts
//
// Pin the activate_signal idempotency contract:
//   * Same idempotency_key + same (signal, destination) → original task_id
//   * Same idempotency_key + DIFFERENT signal-or-destination → fresh activation
//   * Missing idempotency_key → fresh activation each call (back-compat)
//
// Closes the workshop deck audit gap: schema requires idempotency_key on
// activate_signal_request but the server previously read + ignored it,
// creating duplicate activation_jobs rows on retries.

import { describe, it, expect, vi } from "vitest";
import { activateSignalService } from "../src/domain/activationService";
import type { CanonicalSignal } from "../src/types/signal";

function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(k: string) { return store.get(k) ?? null; },
    async put(k: string, v: string) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async list() { return { keys: [...store.keys()].map((name) => ({ name })), list_complete: true } as never; },
    async getWithMetadata() { return { value: null, metadata: null } as never; },
  } as unknown as KVNamespace;
}

const fakeLogger = {
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
} as never;

const sampleSignal: CanonicalSignal = {
  signalId: "sig_test_audience",
  taxonomySystem: "iab" as never,
  name: "Test Audience",
  description: "synthetic signal for idempotency tests",
  categoryType: "demographic",
  sourceSystems: ["test"],
  destinations: ["mock_dsp"],
  activationSupported: true,
  estimatedAudienceSize: 1_000_000,
  accessPolicy: "public" as never,
  generationMode: "deterministic",
  status: "available" as never,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

/**
 * In-memory D1 fake that supports the queries activationService runs:
 *   - SELECT * FROM signals WHERE signal_id = ? (catalog lookup)
 *   - SELECT * FROM activation_jobs WHERE idempotency_key = ? AND ... (dedup lookup)
 *   - INSERT INTO activation_jobs (...)
 *   - INSERT INTO activation_events (...)
 */
function makeDb(seedSignals: CanonicalSignal[]) {
  const signals = new Map(seedSignals.map((s) => [s.signalId, s]));
  const activationJobs: Array<Record<string, unknown>> = [];

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        bind(...args: unknown[]) { bound = args; return this; },
        async first<T>() {
          // Catalog lookup
          if (sql.includes("FROM signals WHERE signal_id")) {
            const sig = signals.get(bound[0] as string);
            if (!sig) return null as unknown as T;
            return {
              signal_id: sig.signalId,
              name: sig.name,
              description: sig.description,
              category_type: sig.categoryType,
              taxonomy_system: sig.taxonomySystem,
              source_systems: JSON.stringify(sig.sourceSystems),
              destinations: JSON.stringify(sig.destinations),
              activation_supported: sig.activationSupported ? 1 : 0,
              estimated_audience_size: sig.estimatedAudienceSize ?? null,
              access_policy: sig.accessPolicy,
              generation_mode: sig.generationMode,
              status: sig.status,
              created_at: sig.createdAt,
              updated_at: sig.updatedAt,
            } as unknown as T;
          }
          // Idempotency dedup lookup
          if (sql.includes("WHERE idempotency_key")) {
            const [key, sigId, dest] = bound as string[];
            const match = activationJobs.find(
              (j) => j["idempotency_key"] === key && j["signal_id"] === sigId && j["destination"] === dest,
            );
            return (match ?? null) as unknown as T;
          }
          return null as unknown as T;
        },
        async all<T>() { return { results: [] as T[] }; },
        async run() {
          // Capture activation_jobs INSERT
          if (sql.startsWith("INSERT INTO activation_jobs")) {
            // Order from createActivationJob:
            //   operation_id, signal_id, destination, account_id,
            //   campaign_id, notes, webhook_url, status, submitted_at,
            //   updated_at, idempotency_key
            activationJobs.push({
              operation_id: bound[0],
              signal_id: bound[1],
              destination: bound[2],
              account_id: bound[3],
              campaign_id: bound[4],
              notes: bound[5],
              webhook_url: bound[6],
              status: bound[7],
              submitted_at: bound[8],
              updated_at: bound[9],
              idempotency_key: bound[10],
              webhook_fired: 0,
              webhook_attempts: 0,
              webhook_next_attempt_at: null,
              completed_at: null,
              error_message: null,
            });
          }
          return { success: true, meta: {} } as unknown as D1Result;
        },
      };
    },
    async batch(stmts: Array<{ run: () => Promise<D1Result> }>) {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  } as unknown as D1Database;

  return { db, getRows: () => activationJobs };
}

describe("activate_signal idempotency enforcement", () => {
  it("same idempotency_key + same (signal, destination) returns original task_id", async () => {
    const { db, getRows } = makeDb([sampleSignal]);
    const kv = makeKv();
    const key = "ik_abcdef0123456789";

    const r1 = await activateSignalService(db, kv, {
      signalId: "sig_test_audience",
      destination: "mock_dsp",
      idempotencyKey: key,
    }, fakeLogger);

    const r2 = await activateSignalService(db, kv, {
      signalId: "sig_test_audience",
      destination: "mock_dsp",
      idempotencyKey: key,
    }, fakeLogger);

    expect(r2.task_id).toBe(r1.task_id);
    expect(r2.operationId).toBe(r1.operationId);
    expect(getRows()).toHaveLength(1);
  });

  it("same idempotency_key + DIFFERENT signal mints a fresh activation", async () => {
    const sig2 = { ...sampleSignal, signalId: "sig_test_audience_2" };
    const { db, getRows } = makeDb([sampleSignal, sig2]);
    const kv = makeKv();
    const key = "ik_shared_key_across_signals";

    const r1 = await activateSignalService(db, kv, {
      signalId: "sig_test_audience",
      destination: "mock_dsp",
      idempotencyKey: key,
    }, fakeLogger);

    const r2 = await activateSignalService(db, kv, {
      signalId: "sig_test_audience_2",
      destination: "mock_dsp",
      idempotencyKey: key,
    }, fakeLogger);

    expect(r2.task_id).not.toBe(r1.task_id);
    expect(getRows()).toHaveLength(2);
  });

  it("same idempotency_key + DIFFERENT destination mints a fresh activation", async () => {
    const sig = { ...sampleSignal, destinations: ["mock_dsp", "mock_dsp_alt"] };
    const { db, getRows } = makeDb([sig]);
    const kv = makeKv();
    const key = "ik_shared_key_across_destinations";

    const r1 = await activateSignalService(db, kv, {
      signalId: "sig_test_audience",
      destination: "mock_dsp",
      idempotencyKey: key,
    }, fakeLogger);

    const r2 = await activateSignalService(db, kv, {
      signalId: "sig_test_audience",
      destination: "mock_dsp_alt",
      idempotencyKey: key,
    }, fakeLogger);

    expect(r2.task_id).not.toBe(r1.task_id);
    expect(getRows()).toHaveLength(2);
  });

  it("MISSING idempotency_key creates fresh activation each call (back-compat)", async () => {
    const { db, getRows } = makeDb([sampleSignal]);
    const kv = makeKv();

    const r1 = await activateSignalService(db, kv, {
      signalId: "sig_test_audience",
      destination: "mock_dsp",
      // no idempotencyKey
    }, fakeLogger);

    const r2 = await activateSignalService(db, kv, {
      signalId: "sig_test_audience",
      destination: "mock_dsp",
      // no idempotencyKey
    }, fakeLogger);

    expect(r2.task_id).not.toBe(r1.task_id);
    expect(getRows()).toHaveLength(2);
  });

  it("idempotent replay preserves the original submittedAt timestamp", async () => {
    const { db } = makeDb([sampleSignal]);
    const kv = makeKv();
    const key = "ik_timestamp_check_xyz123";

    const r1 = await activateSignalService(db, kv, {
      signalId: "sig_test_audience",
      destination: "mock_dsp",
      idempotencyKey: key,
    }, fakeLogger);

    // Wait a beat to ensure new Date().toISOString() WOULD differ
    await new Promise((resolve) => setTimeout(resolve, 5));

    const r2 = await activateSignalService(db, kv, {
      signalId: "sig_test_audience",
      destination: "mock_dsp",
      idempotencyKey: key,
    }, fakeLogger);

    expect(r2.submittedAt).toBe(r1.submittedAt);
  });
});
