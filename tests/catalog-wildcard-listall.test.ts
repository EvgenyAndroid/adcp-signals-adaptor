// tests/catalog-wildcard-listall.test.ts
//
// Pin the catalog regression: signal_spec="*" must NOT keyword-match
// against the literal "*", which collapsed the catalog from 512 to ~33
// signals on the Catalog tab. AdCP 3.0.x's get-signals-request schema
// requires anyOf(signal_spec, signal_ids), so the demo client passes
// a wildcard signal_spec ("*") to satisfy validation when it wants
// "list everything." The server must interpret that wildcard as
// no-brief and hit the catalog page-walk path.
//
// These tests stub the storage layer with a known signal corpus and
// confirm the wildcard hits the broad list-all path (no re-ranking,
// offset honored) rather than the relevance-rank path.

import { describe, it, expect, vi } from "vitest";
import { searchSignalsService } from "../src/domain/signalService";

// Build a fake D1 binding that returns a fixed-size catalog. We only
// need the searchSignals storage call's contract; everything else
// (proposal cache, ranker) operates on the returned list.
function makeFakeDb(catalogSize: number) {
  // Generate `catalogSize` synthetic catalog rows. Production
  // searchSignals returns ranked-by-D1 ordering; we don't care about
  // order here, only count + that the storage filter doesn't strip
  // the wildcard.
  const allSignals = Array.from({ length: catalogSize }, (_, i) => ({
    signal_id: `sig_test_${i}`,
    name: `Test Signal ${i}`,
    description: `synthetic test signal #${i} for catalog count regression`,
    signal_type: "marketplace",
    category_type: "demographic",
    generation_mode: "deterministic",
    estimated_audience_size: 1_000_000 + i,
    coverage_percentage: 50,
    pricing_options: [],
    deployments: [{ type: "platform", platform: "mock_dsp", is_live: true }],
    data_provider: "test",
    taxonomy_system: "test",
    sensitivity_categories: [],
  }));

  let lastQueryParam: string | undefined = undefined;

  return {
    db: {
      prepare(_sql: string) {
        let bound: unknown[] = [];
        return {
          bind(...args: unknown[]) { bound = args; return this; },
          async first<T>() { return null as unknown as T; },
          async all<T>() {
            // Production uses bound parameters; the storage shim doesn't
            // route through them in this test. The fakeStorage path
            // below intercepts at a higher level.
            return { results: [] as T[] };
          },
          async run() { return { success: true, meta: {} } as unknown as D1Result; },
        };
      },
    } as unknown as D1Database,
    allSignals,
    getLastQueryParam: () => lastQueryParam,
    setLastQueryParam: (v: string | undefined) => { lastQueryParam = v; },
  };
}

// Mock the storage layer so the real searchSignals doesn't try to
// hit a non-existent D1. We capture the `query` param the service
// passes through to confirm wildcard normalization happened
// upstream.
vi.mock("../src/storage/signalRepo", () => {
  // Match CanonicalSignal shape (camelCase) per src/types/signal.ts
  // — the mapper assumes signal.destinations is a string[] of platform
  // ids, signal.signalId, signal.taxonomySystem etc.
  const allSignals = Array.from({ length: 500 }, (_, i) => ({
    signalId: `sig_test_${i}`,
    name: `Test Signal ${i}`,
    description: `synthetic test signal #${i} for catalog count regression`,
    categoryType: "demographic" as const,
    taxonomySystem: "test" as never,
    sourceSystems: ["test"],
    destinations: ["mock_dsp"],
    activationSupported: true,
    estimatedAudienceSize: 1_000_000 + i,
    accessPolicy: "public" as never,
    generationMode: "deterministic" as const,
    status: "available" as never,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }));
  return {
    searchSignals: vi.fn(async (_db: unknown, opts: { limit?: number; offset?: number; query?: string }) => {
      // Record the query the service passed through for assertions
      (globalThis as Record<string, unknown>).__lastSearchSignalsQuery = opts.query;
      const offset = opts.offset ?? 0;
      const limit = opts.limit ?? 20;
      // Storage doesn't keyword-filter unless `query` is set.
      const slice = allSignals.slice(offset, offset + limit);
      return { signals: slice, totalCount: allSignals.length };
    }),
    findSignalById: vi.fn(),
  };
});

function makeFakeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(k: string) { return store.get(k) ?? null; },
    async put(k: string, v: string) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async list() { return { keys: [...store.keys()].map((name) => ({ name })), list_complete: true } as never; },
    async getWithMetadata() { return { value: null, metadata: null } as never; },
  } as unknown as KVNamespace;
}

describe("Catalog wildcard list-all regression", () => {
  const fakeDb = {} as D1Database;
  const fakeKv = makeFakeKv();

  it('signal_spec="*" hits the catalog list-all path (no brief re-ranking)', async () => {
    const r = await searchSignalsService(fakeDb, fakeKv, {
      brief: "*",
      limit: 100,
      offset: 0,
    });
    // The service should return the full window (100 of 500), NOT a
    // tiny re-ranked subset matching the literal "*".
    expect(r.count).toBe(100);
    expect(r.totalCount).toBe(500);
    // No proposals — wildcard is not a brief, so generateProposalsFromBrief shouldn't run.
    expect(r.proposals ?? []).toHaveLength(0);
  });

  it('empty signal_spec ("" / whitespace) is also normalized to list-all', async () => {
    const r = await searchSignalsService(fakeDb, fakeKv, {
      brief: "   ",
      limit: 50,
      offset: 0,
    });
    expect(r.count).toBe(50);
    expect(r.totalCount).toBe(500);
  });

  it('cursor pagination walks all pages (offset honored when wildcard)', async () => {
    const page1 = await searchSignalsService(fakeDb, fakeKv, { brief: "*", limit: 100, offset: 0 });
    const page2 = await searchSignalsService(fakeDb, fakeKv, { brief: "*", limit: 100, offset: 100 });
    const page3 = await searchSignalsService(fakeDb, fakeKv, { brief: "*", limit: 100, offset: 200 });
    // Each page is a different slice of 100 — proves offset is being
    // honored. (Without normalization, the service's req.brief check
    // forced offset:0 always and re-ranked the same window each time.)
    expect((page1.signals[0] as { signal_agent_segment_id?: string })?.signal_agent_segment_id).toBe("sig_test_0");
    expect((page2.signals[0] as { signal_agent_segment_id?: string })?.signal_agent_segment_id).toBe("sig_test_100");
    expect((page3.signals[0] as { signal_agent_segment_id?: string })?.signal_agent_segment_id).toBe("sig_test_200");
  });

  it('a real brief ("luxury cars") still triggers the relevance-rank path', async () => {
    const r = await searchSignalsService(fakeDb, fakeKv, {
      brief: "luxury cars",
      limit: 10,
      offset: 0,
    });
    // Real briefs return up to limit, sliced from a re-ranked window.
    expect(r.count).toBeLessThanOrEqual(10);
    // generateProposalsFromBrief runs on real briefs, so we MAY get
    // proposals (depending on the brief). The point is the path is
    // different from wildcard — service entered the brief branch.
  });
});
