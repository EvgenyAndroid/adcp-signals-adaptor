// tests/signalRepo-count.test.ts
// Sec-7: searchSignals must apply the destination filter in SQL so the
// COUNT(*) and the paginated data query see the same row set — otherwise
// totalCount overcounts and callers paginate into empty pages.
//
// We can't run real D1/SQLite in this test setup, so the test intercepts
// every prepare/bind/first/all call, records SQL + params, and asserts:
//   (a) the COUNT and the data query carry identical WHERE clauses
//   (b) destination is bound as a SQL param (not grep-and-substituted)
//   (c) the WHERE clause uses json_each on the destinations column — the
//       only shape D1 supports for JSON-array membership without a full
//       column rewrite.
//
// A complementary correctness check runs against the live worker in
// scripts/test-live.sh.

import { describe, it, expect } from "vitest";
import { searchSignals } from "../src/storage/signalRepo";

interface Call {
  sql: string;
  params: unknown[];
}

function makeRecordingDb(countTotal: number, rowResults: unknown[]): {
  db: D1Database;
  calls: Call[];
} {
  const calls: Call[] = [];
  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          bound = args;
          return this;
        },
        async first<T>() {
          calls.push({ sql, params: bound });
          if (sql.toUpperCase().includes("COUNT(*)")) {
            return { total: countTotal } as unknown as T;
          }
          return null as unknown as T;
        },
        async all<T>() {
          calls.push({ sql, params: bound });
          return { results: rowResults as T[] };
        },
        async run() {
          calls.push({ sql, params: bound });
          return { success: true, meta: {} } as unknown as D1Result;
        },
      };
    },
  } as unknown as D1Database;
  return { db, calls };
}

// Pull the WHERE clause out of a query so the count and data queries can be
// compared structurally rather than by string-equality (the data query
// adds a trailing ORDER BY / LIMIT).
function extractWhere(sql: string): string {
  const m = sql.match(/WHERE\s+(.*?)(?:\s+ORDER BY|\s*$)/i);
  return m ? m[1]!.trim() : "";
}

describe("searchSignals — totalCount vs destination filter", () => {
  it("no destination: count and data queries share WHERE, no json_each", async () => {
    const { db, calls } = makeRecordingDb(42, []);
    const out = await searchSignals(db, {
      categoryType: "demographic",
      limit: 10,
      offset: 0,
    });
    expect(out.totalCount).toBe(42);

    const countCall = calls.find((c) => c.sql.toUpperCase().includes("COUNT(*)"));
    const dataCall = calls.find((c) => !c.sql.toUpperCase().includes("COUNT(*)"));
    expect(countCall).toBeDefined();
    expect(dataCall).toBeDefined();
    expect(extractWhere(countCall!.sql)).toBe(extractWhere(dataCall!.sql));
    expect(countCall!.sql.toLowerCase()).not.toContain("json_each");
  });

  it("destination set: WHERE clause includes json_each on destinations", async () => {
    const { db, calls } = makeRecordingDb(5, []);
    await searchSignals(db, {
      destination: "mock_dsp",
      limit: 10,
      offset: 0,
    });

    const countCall = calls.find((c) => c.sql.toUpperCase().includes("COUNT(*)"));
    const dataCall = calls.find((c) => !c.sql.toUpperCase().includes("COUNT(*)"));
    expect(countCall).toBeDefined();
    expect(dataCall).toBeDefined();

    // Both queries carry the SAME WHERE clause — this is the pin for the
    // totalCount/data-set mismatch bug.
    expect(extractWhere(countCall!.sql)).toBe(extractWhere(dataCall!.sql));

    // json_each membership check is present.
    expect(countCall!.sql.toLowerCase()).toContain("json_each(s.destinations)");

    // Destination is bound as a SQL param, not interpolated into the text.
    expect(countCall!.params).toContain("mock_dsp");
    expect(dataCall!.params).toContain("mock_dsp");

    // Sanity: the raw destination string isn't concatenated into the SQL
    // (regression guard against a future edit that might swap json_each for
    // a LIKE '%"dst"%' string-match).
    expect(countCall!.sql).not.toContain('"mock_dsp"');
  });

  it("returns totalCount unchanged from the count query (no post-filter)", async () => {
    // With the old in-memory post-filter, totalCount would come from the
    // unfiltered count while .signals came from the filtered set.
    // After the fix, the count reflects the destination filter — so the
    // number our mock DB returns is exactly what the caller sees.
    const { db } = makeRecordingDb(7, []);
    const out = await searchSignals(db, {
      destination: "mock_dsp",
      limit: 10,
      offset: 0,
    });
    expect(out.totalCount).toBe(7);
  });

  it("query + destination: both LIKE params and the destination are bound", async () => {
    const { db, calls } = makeRecordingDb(3, []);
    await searchSignals(db, {
      query: "high income",
      destination: "mock_dsp",
      limit: 10,
      offset: 0,
    });

    const countCall = calls.find((c) => c.sql.toUpperCase().includes("COUNT(*)"));
    // LIKE params: two entries of "%high income%"
    const likeParams = countCall!.params.filter((p) => p === "%high income%");
    expect(likeParams.length).toBe(2);
    // Destination bound separately
    expect(countCall!.params).toContain("mock_dsp");
  });
});
