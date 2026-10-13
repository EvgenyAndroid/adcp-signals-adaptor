// tests/outputSchemaConformance.ts
//
// Shared assertion: a tools/call result's structuredContent validates against
// the outputSchema tools/list serves for that tool (ADCP_TOOLS, verbatim).
// MCP clients enforce exactly this on success AND error results —
// @modelcontextprotocol/sdk 1.32.1's Client.callTool once listTools() has
// cached the validators — and the hosted grader (@adcp/sdk 15.8.1) failed the
// 2026-10-12 heartbeat on it with -32602. See TOOL_ERROR_RESULT in
// src/mcp/tools.ts. The suites that drive real tool calls run every result
// through this.

import { expect } from "vitest";
import { Validator } from "@cfworker/json-schema";
import { getToolByName } from "../src/mcp/tools";

export function expectMatchesOutputSchema(toolName: string, structuredContent: unknown): void {
  // A name tools/list does not list (an unknown tool, or an alias such as
  // get_signal_status) has no schema for a client to validate against.
  const tool = getToolByName(toolName);
  if (!tool) return;
  const schema = tool.outputSchema;
  expect(schema, `${toolName} declares an outputSchema`).toBeDefined();
  const result = new Validator(schema as { [k: string]: unknown }, "7", false).validate(structuredContent);
  expect(
    result.valid,
    `${toolName} structuredContent does not match its outputSchema: ${JSON.stringify(result.errors.slice(0, 4))}`,
  ).toBe(true);
}
