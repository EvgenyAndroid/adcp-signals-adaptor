// tests/wholesale-feed-version.test.ts
//
// AdCP 3.1 wholesale feed mirroring — pins the `wholesale_feed_version` token
// contract. The token is an opaque catalog fingerprint a buyer echoes as
// `if_wholesale_feed_version` for ETag-style conditional fetch; it MUST be
// deterministic for an unchanged catalog and MUST roll when the catalog's
// composition or per-signal content changes.

import { describe, it, expect } from "vitest";
import { feedTokenFor } from "../src/domain/signalService";

const sig = (id: string, name: string, size = 1000) => ({
  signalId: id,
  name,
  estimatedAudienceSize: size,
});

describe("AdCP 3.1 wholesale_feed_version token", () => {
  it("is deterministic for the same catalog", () => {
    const cat = [sig("sig_a", "Alpha"), sig("sig_b", "Beta")];
    expect(feedTokenFor(cat)).toBe(feedTokenFor(cat));
  });

  it("is order-independent (material is sorted before hashing)", () => {
    expect(feedTokenFor([sig("sig_a", "Alpha"), sig("sig_b", "Beta")])).toBe(
      feedTokenFor([sig("sig_b", "Beta"), sig("sig_a", "Alpha")]),
    );
  });

  it("rolls when a signal is added", () => {
    const v1 = feedTokenFor([sig("sig_a", "Alpha")]);
    const v2 = feedTokenFor([sig("sig_a", "Alpha"), sig("sig_b", "Beta")]);
    expect(v2).not.toBe(v1);
  });

  it("rolls when a signal is renamed", () => {
    expect(feedTokenFor([sig("sig_a", "Alpha")])).not.toBe(
      feedTokenFor([sig("sig_a", "Alpha v2")]),
    );
  });

  it("rolls when a signal is re-sized", () => {
    expect(feedTokenFor([sig("sig_a", "Alpha", 1000)])).not.toBe(
      feedTokenFor([sig("sig_a", "Alpha", 2000)]),
    );
  });

  it("encodes the catalog count and a wf_ prefix (opaque but well-formed)", () => {
    const v = feedTokenFor([sig("sig_a", "Alpha"), sig("sig_b", "Beta")]);
    expect(v).toMatch(/^wf_2_[0-9a-f]{8}$/);
  });

  it("handles an empty catalog", () => {
    expect(feedTokenFor([])).toMatch(/^wf_0_[0-9a-f]{8}$/);
  });
});
