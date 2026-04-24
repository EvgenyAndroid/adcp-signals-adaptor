// src/domain/agentRegistry.ts
// Sec-48 Part 1: static registry of AdCP directory agents the
// orchestrator talks to.
//
// This replaces the hardcoded list previously inlined in
// federationEndpoints.handleAgentsRegistry. Centralizing it here lets
// /agents/probe and the upcoming /agents/orchestrate (Sec-48 Part 2)
// share a single source of truth.
//
// Entries are seeded from a 2026-04-24 scan of the public AdCP agent
// directory (https://adcp.org — "Active Agents"). Agents marked
// "Issues" on that directory are excluded: Bidcliq, BidMachine, Apex
// Network, AdCP Test Agent, Equativ. They can be re-added once the
// upstream directory marks them healthy again.
//
// Stages:
//   "live"    — we believe the MCP endpoint accepts handshakes today.
//               Include in default probe fan-out.
//   "roadmap" — endpoint known / partner relationship exists but no
//               live MCP handshake yet. Excluded from probes by default.
//   "issues"  — flagged by the AdCP directory as unhealthy. Excluded.
//
// Roles drive default tool selection in the Sec-48 Part 2 orchestrator:
//   "signals"  → get_signals
//   "buying"   → get_products / list_creative_formats (vendor-specific)
//   "creative" → creative-format tools
//   "self"     → our own endpoint, routed internally rather than via MCP.

export type AgentRole = "signals" | "buying" | "creative" | "self";
export type AgentStage = "live" | "roadmap" | "issues";

export interface RegisteredAgent {
  id: string;
  name: string;
  vendor: string;
  /** Absolute MCP URL, or null for roadmap entries without a live endpoint. */
  mcp_url: string | null;
  /** Optional /capabilities URL for agents that expose AdCP capabilities out of band. */
  capabilities_url?: string | null;
  stage: AgentStage;
  role: AgentRole;
  protocols: string[];
  specialties: string[];
  /** Tool names we've observed on the agent (informational only — ground truth comes from tools/list during probe). */
  tools_expected?: string[];
  /** Optional observed MCP server version (informational). */
  mcp_version?: string;
  /** Notes for humans — e.g. why an entry is excluded or quirks observed. */
  notes?: string;
}

export const SELF_URL = "https://adcp-signals-adaptor.evgeny-193.workers.dev";

// Seed list from directory scan 2026-04-24. Keep ordering stable so
// diff-based tests and UI grids don't churn.
export const AGENT_REGISTRY: RegisteredAgent[] = [
  // Our own endpoint — handled internally, listed here for UI consistency.
  {
    id: "evgeny_signals",
    name: "Evgeny AdCP Signals adapter",
    vendor: "No Fluff Advisory",
    mcp_url: SELF_URL + "/mcp",
    capabilities_url: SELF_URL + "/capabilities",
    stage: "live",
    role: "self",
    protocols: ["adcp_3.0", "ucp_0.2", "dts_1.2", "mcp_streamable_http"],
    specialties: [
      "cross_taxonomy_bridge_9_systems",
      "ucp_embedding_live",
      "dts_label_v12",
      "embedding_lab_analytics",
      "portfolio_optimizer",
      "audience_composer",
      "expression_tree_builder",
    ],
    tools_expected: [
      "get_adcp_capabilities", "get_signals", "activate_signal",
      "get_operation_status", "get_similar_signals", "query_signals_nl",
      "get_concept", "search_concepts",
    ],
  },

  // Signals agents
  {
    id: "dstillery",
    name: "AdCP Signals Discovery Agent (Dstillery)",
    vendor: "Dstillery",
    mcp_url: "https://adcp-signals-agent.dstillery.com/mcp",
    stage: "live",
    role: "signals",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["behavioral_audiences", "ttd_deployment", "precision_segments"],
    tools_expected: ["get_signals"],
    mcp_version: "2.13.1",
  },

  // Buying agents — Adzymic fleet (4 regional endpoints, same tool surface)
  {
    id: "adzymic_apx",
    name: "Adzymic APX sales agent",
    vendor: "Adzymic",
    mcp_url: "https://apx.sales-agent.adzymic.ai/mcp",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["programmatic_buying", "apac_inventory"],
    tools_expected: [
      "get_products", "list_creative_formats", "create_media_buy",
      "update_media_buy", "get_media_buy_delivery", "sync_creatives",
    ],
  },
  {
    id: "adzymic_sph",
    name: "Adzymic SPH sales agent",
    vendor: "Adzymic",
    mcp_url: "https://sph.sales-agent.adzymic.ai/mcp",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["sph_publisher_inventory"],
    tools_expected: [
      "get_products", "list_creative_formats", "create_media_buy",
      "update_media_buy", "get_media_buy_delivery", "sync_creatives",
    ],
  },
  {
    id: "adzymic_tsl",
    name: "Adzymic TSL sales agent",
    vendor: "Adzymic",
    mcp_url: "https://tsl.sales-agent.adzymic.ai/mcp",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["tsl_publisher_inventory"],
    tools_expected: [
      "get_products", "list_creative_formats", "create_media_buy",
      "update_media_buy", "get_media_buy_delivery", "sync_creatives",
    ],
  },
  {
    id: "adzymic_mediacorp",
    name: "Adzymic Mediacorp sales agent",
    vendor: "Adzymic",
    mcp_url: "https://mediacorp.sales-agent.adzymic.ai/mcp",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["mediacorp_publisher_inventory"],
    tools_expected: [
      "get_products", "list_creative_formats", "create_media_buy",
      "update_media_buy", "get_media_buy_delivery", "sync_creatives",
    ],
  },
  {
    id: "content_ignite",
    name: "Content Ignite sales agent",
    vendor: "Content Ignite",
    mcp_url: "https://sales-agent.contentignite.com",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["contextual_inventory", "publisher_network"],
    tools_expected: ["get_products", "list_creative_formats", "create_media_buy"],
  },
  {
    id: "claire",
    name: "Claire sales agent",
    vendor: "Philippe Giendaj",
    mcp_url: "https://sales-agent.claire.pub/mcp/",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["indie_buying_agent"],
    tools_expected: ["get_products", "list_creative_formats", "create_media_buy"],
  },
  {
    id: "claire_scope3",
    name: "Claire / Scope3 variant",
    vendor: "Scope3",
    mcp_url: "https://6138516b.sales-agent.scope3.com/mcp",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["carbon_aware_buying"],
    tools_expected: ["get_products", "list_creative_formats", "create_media_buy"],
  },
  {
    id: "swivel",
    name: "Swivel sales agent",
    vendor: "Swivel",
    mcp_url: "https://adcp.swivel.ai/mcp",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["programmatic_buying"],
    tools_expected: ["get_products", "list_creative_formats", "create_media_buy"],
  },

  // Creative agents
  {
    id: "advertible",
    name: "Advertible creative agent",
    vendor: "Advertible",
    mcp_url: "https://adcp.4dvertible.com/mcp",
    stage: "live",
    role: "creative",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["creative_generation", "dynamic_creative"],
    tools_expected: ["list_creative_formats", "generate_creative"],
  },
  {
    id: "celtra",
    name: "Celtra creative agent",
    vendor: "Celtra",
    mcp_url: "https://adcp-mcp.celtra.com/mcp",
    stage: "live",
    role: "creative",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["creative_automation", "dynamic_assembly"],
    tools_expected: ["list_creative_formats", "generate_creative"],
  },

  // Roadmap (no live MCP handshake yet — included for UI context)
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
    id: "nextdata",
    name: "NextData",
    vendor: "NextData",
    mcp_url: null,
    stage: "roadmap",
    role: "signals",
    protocols: ["adcp_3.0"],
    specialties: ["b2b_intent", "firmographic"],
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

export function listLiveAgents(): RegisteredAgent[] {
  return AGENT_REGISTRY.filter((a) => a.stage === "live" && a.role !== "self" && a.mcp_url);
}

export function listAgentsByRole(role: AgentRole): RegisteredAgent[] {
  return AGENT_REGISTRY.filter((a) => a.role === role);
}

export function getAgent(id: string): RegisteredAgent | undefined {
  return AGENT_REGISTRY.find((a) => a.id === id);
}
