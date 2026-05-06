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
// Canonical user-facing URL. The worker is reachable via both this
// custom domain (adcp.signal-stack.io, primary) and the underlying
// workers.dev URL (legacy / fallback). We use the canonical one in
// the registry so peer probes + federation calls hit the same domain
// the user sees in the browser — and adagents.json's authorized_agents
// array points at consistent origins.
export const SELF_URL = "https://adcp.signal-stack.io";

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
    // Sec-48b: directory listed bare root URL; real endpoint is /mcp/ (trailing slash).
    mcp_url: "https://sales-agent.contentignite.com/mcp/",
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
    // Sec-48b: directory shows both /mcp and /mcp/; only /mcp/ responds.
    mcp_url: "https://6138516b.sales-agent.scope3.com/mcp/",
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
  // ── Backfilled from /api/registry/agents diff (2026-04-29) ──────────
  // Three vendors that appeared upstream after our hardcoded snapshot
  // froze. Marked stage="live" because registry-side metadata says so;
  // not yet probed live by us — first orchestrator run will discover
  // their actual tool surface. Specialties are best-guess from vendor
  // domain reputation; refine when a probe response comes back.
  {
    id: "setupad_gatavocom",
    name: "Setupad — Gatavo.com deployment",
    vendor: "Setupad",
    mcp_url: "https://gatavocom.sales-agent.setupad.ai",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["programmatic_yield_management", "header_bidding"],
    notes: "Backfilled from registry diff 2026-04-29 (added_date 2026-04-28). Tool count TBD — discovery on first orchestrator run.",
  },
  {
    id: "setupad_wheelrandom",
    name: "Setupad — WheelRandom deployment",
    vendor: "Setupad",
    mcp_url: "https://wheelrandom.sales-agent.setupad.ai",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["programmatic_yield_management", "header_bidding"],
    notes: "Backfilled from registry diff 2026-04-29 (added_date 2026-04-28). Same Setupad platform as gatavocom; second tenant.",
  },
  {
    id: "mamamia",
    name: "Mamamia",
    vendor: "Mamamia",
    mcp_url: "https://agent.mamamia.com.au",
    stage: "live",
    role: "buying",
    protocols: ["adcp_3.0", "mcp_streamable_http"],
    specialties: ["womens_media", "publisher_direct", "au_market"],
    notes: "Backfilled from registry diff 2026-04-29 (added_date 2026-04-28). Australian publisher direct sales agent.",
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
