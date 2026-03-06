// tests/mcp.test.ts
// MCP server unit tests

import { describe, it, expect } from "vitest";
import { ADCP_TOOLS, getToolByName } from "../src/mcp/tools";

describe("MCP tool definitions", () => {
  it("exposes exactly 5 tools", () => {
    expect(ADCP_TOOLS).toHaveLength(5);
  });

  it("all tools have required fields", () => {
    for (const tool of ADCP_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("getToolByName finds existing tool", () => {
    expect(getToolByName("get_signals")).toBeDefined();
    expect(getToolByName("activate_signal")).toBeDefined();
    expect(getToolByName("generate_custom_signal")).toBeDefined();
    expect(getToolByName("get_adcp_capabilities")).toBeDefined();
    expect(getToolByName("get_operation_status")).toBeDefined();
  });

  it("getToolByName returns undefined for unknown tool", () => {
    expect(getToolByName("not_a_tool")).toBeUndefined();
  });

  it("activate_signal requires signalId and destination", () => {
    const tool = getToolByName("activate_signal")!;
    expect(tool.inputSchema.required).toContain("signal_agent_segment_id");
    expect(tool.inputSchema.required).toContain("destination");
  });

  it("generate_custom_signal requires rules", () => {
    const tool = getToolByName("generate_custom_signal")!;
    expect(tool.inputSchema.required).toContain("rules");
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
    expect(names).toContain("generate_custom_signal");
    expect(names).toContain("get_operation_status");
  });
});
