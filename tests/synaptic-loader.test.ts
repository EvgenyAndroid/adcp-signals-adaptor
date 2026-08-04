// synapticLoader tests â€” catalog validation, canonical mapping, and the DTS
// posture the mapper derives for federated synaptic signals.
import { describe, it, expect } from "vitest";
import {
  validateSynapticCatalog,
  buildSynapticSignals,
  SYNAPTIC_SOURCE_SYSTEM,
} from "../src/connectors/synapticLoader";
import { buildDtsLabel } from "../src/mappers/signalMapper";

const CATALOG = {
  catalog_version: "synaptic-v1",
  definition: "session-scoped cookieless publisher audiences",
  avails_basis: "GA4 estimate; measured beacons take over",
  segments: [
    {
      segment_id: "syn_agentic_standards",
      name: "Agentic standards evaluators",
      audience: "Practitioners tracking AdCP/AAMP/UCP and the agentic protocol layer.",
      member_slugs: ["adcp-vs-aamp", "the-standard-that-clears-the-deal"],
      member_count: 2,
      est_monthly_impressions: 102,
      measured_28d_impressions: 7,
    },
    {
      segment_id: "syn_clean_rooms",
      name: "Clean room & data collaboration",
      audience: "Teams operationalizing clean rooms and cross-party measurement.",
      member_slugs: ["amc-is-free-now"],
      member_count: 1,
      est_monthly_impressions: 40,
      measured_28d_impressions: 0,
    },
  ],
};

describe("validateSynapticCatalog", () => {
  it("accepts a well-formed catalog", () => {
    expect(validateSynapticCatalog(CATALOG).segments).toHaveLength(2);
  });

  it("rejects malformed payloads with precise reasons", () => {
    expect(() => validateSynapticCatalog(null)).toThrow(/not an object/);
    expect(() => validateSynapticCatalog({ segments: [] })).toThrow(/missing or empty/);
    expect(() =>
      validateSynapticCatalog({ segments: [{ segment_id: "DROP TABLE" }] })
    ).toThrow(/invalid segment_id/);
    expect(() =>
      validateSynapticCatalog({
        segments: [{ segment_id: "syn_x", name: "x", audience: "y", member_slugs: [] }],
      })
    ).toThrow(/empty member_slugs/);
  });
});

describe("buildSynapticSignals", () => {
  const now = "2026-08-04T12:00:00.000Z";
  const signals = buildSynapticSignals(validateSynapticCatalog(CATALOG), now);

  it("keeps publisher segment ids verbatim and maps canonical fields", () => {
    expect(signals.map((s) => s.signalId)).toEqual([
      "syn_agentic_standards",
      "syn_clean_rooms",
    ]);
    const s = signals[0]!;
    expect(s.categoryType).toBe("composite");
    expect(s.generationMode).toBe("derived");
    expect(s.sourceSystems).toEqual([SYNAPTIC_SOURCE_SYSTEM]);
    expect(s.activationSupported).toBe(false);
    expect(s.estimatedAudienceSize).toBe(102);
    expect(s.status).toBe("available");
    expect(s.description).toContain("7 measured trailing 28d");
    expect(signals[1]!.description).not.toContain("measured trailing");
  });

  it("derives the synaptic DTS posture: Web Usage only, Derived, Daily", () => {
    const label = buildDtsLabel(signals[0]!);
    expect(label.data_sources).toEqual(["Web Usage"]);
    expect(label.audience_inclusion_methodology).toBe("Derived");
    expect(label.audience_refresh).toBe("Daily");
    expect(label.audience_size).toBe(102);
    // First-party web behavior â€” no offline sources, so no onboarder block.
    expect(label.onboarder_match_keys).toBe("N/A");
  });
});
