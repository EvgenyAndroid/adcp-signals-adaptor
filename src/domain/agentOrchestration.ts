// src/domain/agentOrchestration.ts
// Sec-48 Part 2: role-based tool routing for the multi-A2A orchestrator.
//
// When the orchestrator fans a brief across the registry, each agent
// gets called with a different tool depending on its role:
//   signals  → get_signals       (AdCP signals tool)
//   buying   → get_products      (AdCP buying tool)
//   creative → list_creative_formats  (read-only directory scan)
//   self     → routed internally, no MCP call
//
// Each tool gets a role-appropriate default argument shape. Callers
// can override both the tool name and the arg builder via the
// orchestrate request body (see handleAgentsOrchestrate).

import type { AgentRole } from "./agentRegistry";

export const ROLE_DEFAULT_TOOL: Record<AgentRole, string | null> = {
  signals: "get_signals",
  buying: "get_products",
  creative: "list_creative_formats",
  self: null, // handled internally
};

export function defaultToolForRole(role: AgentRole): string | null {
  return ROLE_DEFAULT_TOOL[role];
}

export interface OrchestrationArgsContext {
  brief: string;
  maxResultsPerAgent: number;
}

/**
 * Build default arguments for a given tool name. We key on the tool
 * name rather than the role so that an agent-specific override (e.g.
 * "call `search_products` on Adzymic instead of `get_products`") can
 * still get sensible defaults if the override happens to hit a
 * known AdCP tool name.
 *
 * Unknown tool names get `{ brief, max_results }` as a best-effort —
 * most AdCP tools accept a natural-language brief as the primary arg.
 */
export function defaultArgsForTool(
  toolName: string,
  ctx: OrchestrationArgsContext,
): Record<string, unknown> {
  switch (toolName) {
    case "get_signals":
      return { signal_spec: ctx.brief, max_results: ctx.maxResultsPerAgent };
    case "get_products":
      return { brief: ctx.brief, max_results: ctx.maxResultsPerAgent };
    case "list_creative_formats":
      // Directory scan — most implementations accept no args, but passing
      // an empty object is the JSON-RPC-safe default.
      return {};
    case "get_adcp_capabilities":
      return {};
    default:
      return { brief: ctx.brief, max_results: ctx.maxResultsPerAgent };
  }
}
