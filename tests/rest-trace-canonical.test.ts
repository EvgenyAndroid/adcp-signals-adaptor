// tests/rest-trace-canonical.test.ts
//
// Pin the regression: the REST /signals/search trace recorder used to
// trace the raw legacy body { brief, limit, offset } and validate that
// against the canonical AdCP get-signals-request schema, surfacing
// three false-positive errors (anyOf required: signal_spec OR
// signal_ids) on every search the workshop demo'd.
//
// These tests run the adapter functions through the same
// @cfworker/json-schema Validator the trace recorder uses, asserting
// the canonical envelopes pass validation against the vendored
// /schemas/3.0.8/signals/get-{signals-request,signals-response}.json
// shapes.

import { describe, it, expect } from "vitest";
import { Validator } from "@cfworker/json-schema";
import {
  toCanonicalGetSignalsRequest,
  toCanonicalGetSignalsResponse,
} from "../src/routes/searchSignals";
import {
  signals_GetSignalsRequest,
  signals_GetSignalsResponse,
  loadAdcpCorpus,
} from "../src/schemas/adcp";

function makeValidator(rootSchema: { $id?: string; [k: string]: unknown }) {
  const v = new Validator(rootSchema as { $id: string; [k: string]: unknown }, "7", false);
  for (const s of loadAdcpCorpus()) {
    if (s.$id && s.$id !== rootSchema.$id) {
      try { v.addSchema(s as { $id: string; [k: string]: unknown }); } catch (_) { /* dup ok */ }
    }
  }
  return v;
}

describe("REST /signals/search canonical-shape adapters", () => {
  const reqValidator = makeValidator(signals_GetSignalsRequest);
  const resValidator = makeValidator(signals_GetSignalsResponse);

  describe("toCanonicalGetSignalsRequest", () => {
    it("brief + limit + offset → schema-valid AdCP get_signals request", () => {
      const canonical = toCanonicalGetSignalsRequest({
        brief: "new parents in the last 12 months",
        limit: 8,
        offset: 0,
      });
      const r = reqValidator.validate(canonical);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });

    it("offset > 0 emits pagination.cursor (offset:N) instead of top-level offset", () => {
      const canonical = toCanonicalGetSignalsRequest({
        brief: "luxury auto intenders",
        limit: 50,
        offset: 50,
      });
      expect((canonical.pagination as { cursor?: string }).cursor).toBe("offset:50");
      // No top-level offset field — that would fail additionalProperties:false on pagination
      expect(canonical).not.toHaveProperty("offset");
      const r = reqValidator.validate(canonical);
      expect(r.errors).toEqual([]);
    });

    it("missing brief defaults to wildcard signal_spec (catalog-walk path)", () => {
      const canonical = toCanonicalGetSignalsRequest({ limit: 100, offset: 0 });
      expect(canonical.signal_spec).toBe("*");
      const r = reqValidator.validate(canonical);
      expect(r.errors).toEqual([]);
    });

    it("destinations + countries are arrays (not legacy deliver_to wrapper)", () => {
      const canonical = toCanonicalGetSignalsRequest({ brief: "anything", limit: 5, offset: 0 });
      expect(Array.isArray(canonical.destinations)).toBe(true);
      expect(Array.isArray(canonical.countries)).toBe(true);
      expect(canonical).not.toHaveProperty("deliver_to");
    });

    it("limit clamps to schema bounds (1..100) per pagination-request constraints", () => {
      const canonical0 = toCanonicalGetSignalsRequest({ brief: "x", limit: 0, offset: 0 });
      expect((canonical0.pagination as { max_results: number }).max_results).toBe(1);
      const canonical9999 = toCanonicalGetSignalsRequest({ brief: "x", limit: 9999, offset: 0 });
      expect((canonical9999.pagination as { max_results: number }).max_results).toBe(100);
    });
  });

  describe("toCanonicalGetSignalsResponse", () => {
    it("legacy {hasMore, totalCount, offset} → canonical pagination envelope", () => {
      const canonical = toCanonicalGetSignalsResponse(
        { signals: [], totalCount: 0, hasMore: false },
        0,
      );
      expect(canonical.pagination).toEqual({ has_more: false, total_count: 0 });
      const r = resValidator.validate(canonical);
      expect(r.errors).toEqual([]);
    });

    it("hasMore=true emits opaque cursor for next-page walk", () => {
      const canonical = toCanonicalGetSignalsResponse(
        { signals: new Array(50).fill({}), totalCount: 200, hasMore: true, offset: 0 },
        0,
      );
      const pag = canonical.pagination as { cursor?: string; has_more: boolean };
      expect(pag.has_more).toBe(true);
      expect(pag.cursor).toBe("offset:50");
    });

    it("preserves proposals field when present", () => {
      const canonical = toCanonicalGetSignalsResponse(
        {
          signals: [{ name: "x" }],
          totalCount: 1,
          hasMore: false,
          proposals: [{ name: "ai-suggest" }],
        },
        0,
      );
      expect(canonical.proposals).toHaveLength(1);
    });
  });
});
