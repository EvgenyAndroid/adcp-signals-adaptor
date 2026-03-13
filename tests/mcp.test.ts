// tests/mcp.test.ts
// MCP server unit tests
//
// Bug #3 fix: tool count updated to 8 (matches README protocol compliance table):
//   get_adcp_capabilities, get_signals, activate_signal, get_operation_status,
//   get_similar_signals, query_signals_nl, get_concept, search_concepts
//
// Bug #10 fix: activate_signal required field is "deliver_to" not "deployments"
// Removed: stale generate_custom_signal references (tool was removed)

import { describe, it, expect } from "vitest";
import { ADCP_TOOLS, getToolByName } from "../src/mcp/tools";

describe("MCP tool definitions", () => {
  it("exposes exactly 8 tools (4 AdCP core + get_similar_signals + query_signals_nl + get_concept + search_concepts)", () => {
    expect(ADCP_TOOLS).toHaveLength(8);
  });

  it("all tools have required fields", () => {
    for (const tool of ADCP_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("getToolByName finds all 8 tools", () => {
    expect(getToolByName("get_signals")).toBeDefined();
    expect(getToolByName("activate_signal")).toBeDefined();
    expect(getToolByName("get_adcp_capabilities")).toBeDefined();
    expect(getToolByName("get_operation_status")).toBeDefined();
    expect(getToolByName("get_similar_signals")).toBeDefined();
    expect(getToolByName("query_signals_nl")).toBeDefined();
    expect(getToolByName("get_concept")).toBeDefined();
    expect(getToolByName("search_concepts")).toBeDefined();
  });

  it("getToolByName returns undefined for unknown tool", () => {
    expect(getToolByName("not_a_tool")).toBeUndefined();
  });

  it("generate_custom_signal is NOT present (removed — proposals via get_signals brief)", () => {
    expect(getToolByName("generate_custom_signal")).toBeUndefined();
  });

  it("activate_signal requires signal_agent_segment_id and deliver_to", () => {
    const tool = getToolByName("activate_signal")!;
    expect(tool.inputSchema.required).toContain("signal_agent_segment_id");
    // Bug #10: required field is "deliver_to" (spec name), not "deployments" (old name)
    expect(tool.inputSchema.required).toContain("deliver_to");
    expect(tool.inputSchema.required).not.toContain("deployments");
  });

  it("get_signals uses canonical spec param names (signal_spec, deliver_to, max_results)", () => {
    const tool = getToolByName("get_signals")!;
    expect(tool.inputSchema.properties).toHaveProperty("signal_spec");
    expect(tool.inputSchema.properties).toHaveProperty("deliver_to");
    expect(tool.inputSchema.properties).toHaveProperty("max_results");
    expect(tool.inputSchema.required).toContain("signal_spec");
    expect(tool.inputSchema.required).toContain("deliver_to");
  });

  it("activate_signal supports webhook_url parameter", () => {
    const tool = getToolByName("activate_signal")!;
    expect(tool.inputSchema.properties).toHaveProperty("webhook_url");
  });

  it("get_adcp_capabilities has no required params", () => {
    const tool = getToolByName("get_adcp_capabilities")!;
    expect(tool.inputSchema.required ?? []).toHaveLength(0);
  });

  it("tool names match AdCP operation names", () => {
    const names = ADCP_TOOLS.map((t) => t.name);
    expect(names).toContain("get_adcp_capabilities");
    expect(names).toContain("get_signals");
    expect(names).toContain("activate_signal");
    expect(names).toContain("get_operation_status");
    expect(names).toContain("get_similar_signals");
    expect(names).toContain("query_signals_nl");
    expect(names).toContain("get_concept");
    expect(names).toContain("search_concepts");
    expect(names).not.toContain("generate_custom_signal");
  });

  it("get_similar_signals has signal_agent_segment_id and deliver_to required", () => {
    const tool = getToolByName("get_similar_signals")!;
    expect(tool.inputSchema.required).toContain("signal_agent_segment_id");
    expect(tool.inputSchema.required).toContain("deliver_to");
  });

  it("query_signals_nl has query required", () => {
    const tool = getToolByName("query_signals_nl")!;
    expect(tool.inputSchema.required).toContain("query");
  });

  it("get_concept has concept_id required", () => {
    const tool = getToolByName("get_concept")!;
    expect(tool.inputSchema.required).toContain("concept_id");
  });

  it("search_concepts has q required", () => {
    const tool = getToolByName("search_concepts")!;
    expect(tool.inputSchema.required).toContain("q");
  });
});
