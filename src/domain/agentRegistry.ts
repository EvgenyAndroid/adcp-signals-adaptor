// src/domain/agentRegistry.ts
// Sec-48: curated list of AdCP directory agents we know about. Seed data
// was compiled 2026-04-24 from the directory listing. Use it as the
// starting set for probe-all + orchestration. Directory agents marked
// "Issues" in the directory (Bidcliq, BidMachine, Apex, AdCP Test Agent,
// Equativ) are included here with stage="known_issue" so the UI can
// surface "we tried" without attempting to call them.

export type AgentStage = "live" | "roadmap" | "known_issue";
export type AgentRole = "signals" | "buying" | "creative" | "unclassified";

export interface RegisteredAgent {
  id: string;
  name: string;
  vendor: string;
  mcp_url: string | null;
  capabilities_url?: string | null;
  stage: AgentStage;
  role: AgentRole;
  protocols: string[];
  specialties?: string[];
  tools_exposed?: string[];
  notes?: string;
  /** Approximate tool count as listed in the public directory. Used as a
   * baseline for UI rendering before a live probe returns the real tools. */
  directory_tool_count?: number;
  mcp_version?: string;
}

export const SELF_AGENT_ID = "evgeny_signals";
export const SELF_URL = "https://adcp-signals-adaptor.evgeny-193.workers.dev";

export const AGENT_REGISTRY: RegisteredAgent[] = [
  {
    id: "evgeny_signals",
    name: "Evgeny AdCP Signals adapter",
    vendor: "Evgeny",
    mcp_url: SELF_URL + "/mcp",
    capabilities_url: SELF_URL + "/capabilities",
    stage: "live",
    role: "signals",
    protocols: ["adcp_3.0", "ucp_0.2", "dts_1.2", "mcp_streamable_http"],
    specialties: [
      "cross_taxonomy_bridge_9_systems",
      "ucp_embedding_live",
      "dts_label_v12",
      "embedding_lab_analytics",
      "portfolio_optimizer",
      "audience_composer_ast",
    ],
    tools_exposed: [
      "get_adcp_capabilities", "get_signals", "activate_signal",
      "get_operation_status", "get_similar_signals", "query_signals_nl",
      "get_concept", "search_concepts",
    ],
    directory_tool_count: 8,
  },
  {
    id: "dstillery",
    name: "AdCP Signals Discovery Agent (Dstillery)",
    vendor: "Dstillery",
    mcp_url: "https://adcp-signals-agent.dstillery.com/mcp",
    capabilities_url: null,
    stage: "live",
    role: "signals",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["behavioral_audiences", "ttd_deployment", "precision_segments"],
    tools_exposed: ["get_signals"],
    mcp_version: "2.13.1",
    directory_tool_count: 1,
  },
  // ── Creative agents ───────────────────────────────────────────────────
  {
    id: "advertible",
    name: "Advertible Inc.",
    vendor: "Advertible",
    mcp_url: "https://adcp.4dvertible.com/mcp",
    stage: "live",
    role: "creative",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["native_sizeless_formats", "retail_media_native"],
    directory_tool_count: 2,
  },
  {
    id: "celtra",
    name: "Celtra Creative Agent",
    vendor: "Celtra",
    mcp_url: "https://adcp-mcp.celtra.com/mcp",
    stage: "live",
    role: "creative",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["creative_authoring", "dynamic_creative"],
    directory_tool_count: 5,
  },
  // ── Buying agents ─────────────────────────────────────────────────────
  {
    id: "adzymic_apx",
    name: "Adzymic (APX)",
    vendor: "Adzymic",
    mcp_url: "https://apx.sales-agent.adzymic.ai/mcp",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    directory_tool_count: 12,
  },
  {
    id: "adzymic_sph",
    name: "Adzymic (SPH)",
    vendor: "Adzymic",
    mcp_url: "https://sph.sales-agent.adzymic.ai/mcp",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    directory_tool_count: 12,
  },
  {
    id: "adzymic_tsl",
    name: "Adzymic (TSL)",
    vendor: "Adzymic",
    mcp_url: "https://tsl.sales-agent.adzymic.ai/mcp",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    directory_tool_count: 12,
  },
  {
    id: "adzymic_mediacorp",
    name: "Adzymic (Mediacorp)",
    vendor: "Adzymic",
    mcp_url: "https://mediacorp.sales-agent.adzymic.ai/mcp",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    directory_tool_count: 12,
  },
  {
    id: "content_ignite",
    name: "Content Ignite",
    vendor: "Content Ignite",
    mcp_url: "https://sales-agent.contentignite.com",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    directory_tool_count: 16,
  },
  {
    id: "claire_pub",
    name: "Claire Sales Agent",
    vendor: "Philippe Giendaj",
    mcp_url: "https://sales-agent.claire.pub/mcp/",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    directory_tool_count: 16,
  },
  {
    id: "claire_scope3",
    name: "Claire (Scope3 deployment)",
    vendor: "Philippe Giendaj",
    mcp_url: "https://6138516b.sales-agent.scope3.com/mcp",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    directory_tool_count: 16,
  },
  {
    id: "swivel",
    name: "Swivel",
    vendor: "Swivel",
    mcp_url: "https://adcp.swivel.ai/mcp",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    directory_tool_count: 8,
  },
  // ── Known-issue agents (skipped on probe-all) ─────────────────────────
  {
    id: "bidcliq",
    name: "Bidcliq",
    vendor: "Bidcliq",
    mcp_url: "https://agents.bidcliq.com/mcp",
    stage: "known_issue",
    role: "unclassified",
    protocols: ["adcp_3.0"],
    notes: "Directory discovery error: MCP endpoint unreachable at tried paths.",
  },
  {
    id: "bidmachine",
    name: "BidMachine Seller Agent",
    vendor: "BidMachine",
    mcp_url: "https://adcp.bidmachine.io/adcp/mcp",
    stage: "known_issue",
    role: "unclassified",
    protocols: ["adcp_3.0"],
    notes: "Directory: unclassified / handshake issues.",
  },
  {
    id: "adcp_test_agent",
    name: "AdCP Test Agent",
    vendor: "BigAds",
    mcp_url: "https://test-agent.adcontextprotocol.org/mcp",
    stage: "known_issue",
    role: "unclassified",
    protocols: ["adcp_3.0"],
    notes: "Directory: degraded status.",
  },
  {
    id: "equativ",
    name: "Equativ",
    vendor: "Equativ",
    mcp_url: "https://adcp.equativ.com/v1/discover",
    stage: "known_issue",
    role: "unclassified",
    protocols: ["adcp_3.0"],
    notes: "Directory: unclassified.",
  },
  // ── Roadmap (no MCP endpoint yet) ─────────────────────────────────────
  {
    id: "peer39",
    name: "Peer39",
    vendor: "Peer39",
    mcp_url: null,
    stage: "roadmap",
    role: "signals",
    protocols: ["adcp_3.0"],
    specialties: ["contextual", "brand_safety", "cookieless_contextual"],
  },
  {
    id: "scope3",
    name: "Scope3",
    vendor: "Scope3",
    mcp_url: null,
    stage: "roadmap",
    role: "signals",
    protocols: ["adcp_3.0"],
    specialties: ["sustainability", "carbon_aware_audiences"],
  },
  {
    id: "liveramp",
    name: "LiveRamp",
    vendor: "LiveRamp",
    mcp_url: null,
    stage: "roadmap",
    role: "signals",
    protocols: ["adcp_3.0"],
    specialties: ["id_resolution", "abilitec_graph", "ramp_id"],
  },
];

export function getLiveAgents(): RegisteredAgent[] {
  return AGENT_REGISTRY.filter((a) => a.stage === "live");
}

export function getAgentsByRole(role: AgentRole): RegisteredAgent[] {
  return AGENT_REGISTRY.filter((a) => a.role === role);
}

export function findAgent(id: string): RegisteredAgent | undefined {
  return AGENT_REGISTRY.find((a) => a.id === id);
}
