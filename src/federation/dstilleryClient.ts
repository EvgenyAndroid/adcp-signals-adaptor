// src/federation/dstilleryClient.ts
// Sec-41 Part 3 / Sec-48 Part 1: live A2A federation client for
// Dstillery's public AdCP Signals Discovery Agent MCP endpoint.
//
// Since Sec-48, this module is a thin wrapper over the generic
// Streamable-HTTP MCP client in ./genericMcpClient.ts. The Dstillery
// endpoint (https://adcp-signals-agent.dstillery.com/mcp) exposes one
// tool (get_signals) on MCP 2024-11-05 — the generic client's
// protocol-version fallback handles that automatically.

import { callTool, type ToolCallResult } from "./genericMcpClient";

export const DSTILLERY_MCP_URL = "https://adcp-signals-agent.dstillery.com/mcp";

export interface DstillerySignal {
  signal_agent_segment_id: string;
  name: string;
  description: string;
  data_provider: string;
  signal_type: string;
  coverage_percentage: number;
  pricing?: { cpm: number; currency: string };
  deployments?: Array<{
    platform: string;
    scope?: string;
    is_live?: boolean;
    decisioning_platform_segment_id?: string;
  }>;
}

export interface DstillerySearchResult {
  ok: boolean;
  signals: DstillerySignal[];
  error?: string;
  elapsed_ms: number;
}

export async function dstillerySearch(
  brief: string,
  maxResults: number = 10,
): Promise<DstillerySearchResult> {
  const r: ToolCallResult = await callTool(
    { url: DSTILLERY_MCP_URL, clientName: "evgeny_signals_fed", clientVersion: "41.0" },
    "get_signals",
    { signal_spec: brief, max_results: maxResults },
  );

  if (!r.ok) {
    return {
      ok: false,
      signals: [],
      error: r.error ?? "unknown_error",
      elapsed_ms: r.elapsed_ms,
    };
  }

  const data = r.data as { signals?: DstillerySignal[] } | undefined;
  return {
    ok: true,
    signals: data?.signals ?? [],
    elapsed_ms: r.elapsed_ms,
  };
}
