// tests/agentOrchestration.test.ts
// Unit tests for the role→tool routing layer shared by /agents/orchestrate
// (Sec-48 Part 2). We test the pure helpers here; the endpoint-level
// fan-out and probe-before-call logic is exercised via the live endpoint.

import { describe, it, expect } from "vitest";
import {
  defaultToolForRole,
  defaultArgsForTool,
  ROLE_DEFAULT_TOOL,
} from "../src/domain/agentOrchestration";

describe("defaultToolForRole", () => {
  it("maps signals role to get_signals", () => {
    expect(defaultToolForRole("signals")).toBe("get_signals");
  });

  it("maps buying role to get_products", () => {
    expect(defaultToolForRole("buying")).toBe("get_products");
  });

  it("maps creative role to list_creative_formats", () => {
    expect(defaultToolForRole("creative")).toBe("list_creative_formats");
  });

  it("returns null for the self role (routed internally)", () => {
    expect(defaultToolForRole("self")).toBeNull();
  });

  it("exposes the full mapping for callers that want to echo defaults in the response", () => {
    expect(ROLE_DEFAULT_TOOL).toEqual({
      signals: "get_signals",
      buying: "get_products",
      creative: "list_creative_formats",
      self: null,
    });
  });
});

describe("defaultArgsForTool", () => {
  const ctx = { brief: "luxury travelers in APAC", maxResultsPerAgent: 7 };

  it("builds signal_spec + max_results for get_signals", () => {
    expect(defaultArgsForTool("get_signals", ctx)).toEqual({
      signal_spec: "luxury travelers in APAC",
      max_results: 7,
    });
  });

  it("builds brief + max_results for get_products", () => {
    expect(defaultArgsForTool("get_products", ctx)).toEqual({
      brief: "luxury travelers in APAC",
      max_results: 7,
    });
  });

  it("returns empty args for list_creative_formats (directory scan)", () => {
    expect(defaultArgsForTool("list_creative_formats", ctx)).toEqual({});
  });

  it("returns empty args for get_adcp_capabilities", () => {
    expect(defaultArgsForTool("get_adcp_capabilities", ctx)).toEqual({});
  });

  it("falls back to brief+max_results for unknown tool names", () => {
    expect(defaultArgsForTool("custom_vendor_search", ctx)).toEqual({
      brief: "luxury travelers in APAC",
      max_results: 7,
    });
  });
});
