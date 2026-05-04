// src/domain/ecosystem.ts
//
// Many-to-many AdCP ecosystem orchestration engine.
//
// Powers the /ecosystem live constellation page. Provides:
//   - A 29-agent population spanning all 6 AdCP protocol domains
//     (sales, signals, buying, creative, measurement, governance).
//     Live agents reuse mcp_url from agentRegistry.ts; synthetic
//     agents fill gaps.
//   - A weighted brief generator that auto-spawns campaigns biased
//     by prior measurement results.
//   - An orchestrator that fans a brief out across signals →
//     governance → sales → creative → buying → measurement, recording
//     a biz-trace tree of every decision.
//   - Schema-valid synthetic responders so every node can answer
//     even when its live counterpart is unreachable.
//   - A feedback loop where measurement results bias the next-cycle
//     brief weights — the ecosystem develops "preferences" over time
//     and starts re-running winning briefs.
//
// All state lives in-memory inside one ECOSYSTEM singleton. Routes
// (ecosystemRoutes.ts) drive ticks via setInterval-equivalent timers
// and stream events to the canvas via SSE.

// ── Types ────────────────────────────────────────────────────────────────────

export type AgentRole =
  | "sales"
  | "signals"
  | "buying"
  | "creative"
  | "measurement"
  | "governance";

export type AgentStage = "live" | "synthetic" | "degraded";

export interface EcosystemAgent {
  id: string;
  name: string;
  vendor: string;
  role: AgentRole;
  stage: AgentStage;
  mcp_url?: string;
  /** 3D layout — radial coords; renderer translates to world coords */
  layout: { ring: number; theta: number; phi: number };
  specialties?: string[];
  /** Soft personality knobs the synthetic responder honors */
  personality?: {
    base_latency_ms?: number;
    failure_rate?: number;
    bid_aggressiveness?: number;
    audience_size_bias?: number;
  };
}

export interface Brief {
  id: string;
  created_at: string;
  prompt: string;
  weights: { audience: number; ctv_bias: number; b2b_bias: number; audio_bias: number };
  budget_usd: number;
  parent_brief_id?: string;
}

export type TraceNodeKind =
  | "brief_spawned"
  | "signals_fanout"
  | "signal_response"
  | "governance_check"
  | "sales_fanout"
  | "sales_response"
  | "creative_match"
  | "buying_bid"
  | "media_buy_executed"
  | "measurement_report"
  | "feedback_applied";

export interface TraceNode {
  id: string;
  kind: TraceNodeKind;
  agent_id?: string;
  brief_id: string;
  ts_ms: number;
  parent_id?: string;
  summary: string;
  detail?: Record<string, unknown>;
}

export interface MessageEvent {
  id: string;
  brief_id: string;
  from_agent_id: string;
  to_agent_id: string;
  kind: TraceNodeKind;
  ts_ms: number;
  /** Visual hint — the renderer picks colors per kind */
  color_hint?: "discovery" | "signal" | "policy" | "product" | "creative" | "bid" | "measurement";
}

export interface AgentLift {
  /** Rolling exponentially-weighted measurement score [0..1]. */
  score: number;
  /** How many measurements have contributed. Used for trust weighting. */
  samples: number;
}

// ── Agent population ─────────────────────────────────────────────────────────

// Layout helper: lay agents out in concentric rings by role so the
// constellation reads as ordered rather than a jumble. The renderer
// converts (ring, theta, phi) to (x, y, z) on a sphere.
function ringTheta(ringIndex: number, indexInRing: number, count: number): { ring: number; theta: number; phi: number } {
  const theta = (indexInRing / count) * Math.PI * 2;
  // Slight phi offset per ring so rings don't all sit on the equator
  const phi = Math.PI / 2 + (ringIndex - 2) * 0.18;
  return { ring: ringIndex, theta, phi };
}

const SALES_AGENTS: EcosystemAgent[] = [
  // Live (per AAO registry — type "sales")
  { id: "adzymic_apx", name: "Adzymic APX", vendor: "Adzymic", role: "sales", stage: "live",
    mcp_url: "https://apx.sales-agent.adzymic.ai/mcp", layout: ringTheta(0, 0, 10),
    specialties: ["programmatic", "open_web"] },
  { id: "adzymic_sph", name: "Adzymic SPH", vendor: "Adzymic", role: "sales", stage: "live",
    mcp_url: "https://sph.sales-agent.adzymic.ai/mcp", layout: ringTheta(0, 1, 10),
    specialties: ["sg_premium", "ctv"] },
  { id: "adzymic_tsl", name: "Adzymic TSL", vendor: "Adzymic", role: "sales", stage: "live",
    mcp_url: "https://tsl.sales-agent.adzymic.ai/mcp", layout: ringTheta(0, 2, 10),
    specialties: ["tw_market"] },
  { id: "adzymic_mediacorp", name: "Adzymic Mediacorp", vendor: "Adzymic", role: "sales", stage: "live",
    mcp_url: "https://mediacorp.sales-agent.adzymic.ai/mcp", layout: ringTheta(0, 3, 10),
    specialties: ["sg_broadcast"] },
  { id: "claire_pub", name: "Claire (.pub)", vendor: "Philippe Giendaj", role: "sales", stage: "live",
    mcp_url: "https://sales-agent.claire.pub/mcp/", layout: ringTheta(0, 4, 10),
    specialties: ["independent_publisher_collective"] },
  { id: "claire_scope3", name: "Claire (Scope3)", vendor: "Scope3", role: "sales", stage: "live",
    mcp_url: "https://6138516b.sales-agent.scope3.com/mcp/", layout: ringTheta(0, 5, 10),
    specialties: ["sustainability_aware", "carbon_priced"] },
  { id: "content_ignite", name: "Content Ignite", vendor: "Content Ignite", role: "sales", stage: "live",
    mcp_url: "https://sales-agent.contentignite.com/mcp/", layout: ringTheta(0, 6, 10),
    specialties: ["contextual_premium"] },
  { id: "vox_media_sales", name: "Vox Media Sales", vendor: "Vox Media", role: "sales", stage: "live",
    mcp_url: "https://salesagent.voxmedia.com", layout: ringTheta(0, 7, 10),
    specialties: ["us_premium_editorial"] },
  // Synthetic
  { id: "mock_premium_ssp", name: "Premium SSP (mock)", vendor: "Synthetic", role: "sales", stage: "synthetic",
    layout: ringTheta(0, 8, 10),
    specialties: ["pmp_deals", "private_marketplace"],
    personality: { base_latency_ms: 180, failure_rate: 0.03, bid_aggressiveness: 0.7 } },
  { id: "mock_ctv_marketplace", name: "CTV Marketplace (mock)", vendor: "Synthetic", role: "sales", stage: "synthetic",
    layout: ringTheta(0, 9, 10),
    specialties: ["ctv_premium", "sports", "live_events"],
    personality: { base_latency_ms: 240, failure_rate: 0.05, bid_aggressiveness: 0.8 } },
];

const SIGNALS_AGENTS: EcosystemAgent[] = [
  { id: "evgeny_signals", name: "Evgeny Signals", vendor: "Evgeny", role: "signals", stage: "live",
    mcp_url: "https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp", layout: ringTheta(1, 0, 5),
    specialties: ["cross_taxonomy_9_systems", "ucp_embedding", "dts_v12"] },
  { id: "dstillery", name: "Dstillery", vendor: "Dstillery", role: "signals", stage: "live",
    mcp_url: "https://adcp-signals-agent.dstillery.com/mcp", layout: ringTheta(1, 1, 5),
    specialties: ["behavioral_audiences", "ttd_deployment"] },
  { id: "affinity_answers", name: "AffinityAnswers", vendor: "AffinityAnswers", role: "signals", stage: "live",
    mcp_url: "https://mcp.affinityanswers.com/mcp", layout: ringTheta(1, 2, 5),
    specialties: ["affinity_brand_alignment", "predictive_behavioral"] },
  { id: "mock_audio_signals", name: "Audio Signals (mock)", vendor: "Synthetic", role: "signals", stage: "synthetic",
    layout: ringTheta(1, 3, 5),
    specialties: ["podcast_listenership", "audio_ad_attention", "iheart_simulcast"],
    personality: { base_latency_ms: 95, failure_rate: 0.02, audience_size_bias: 0.6 } },
  { id: "mock_b2b_intent", name: "B2B Intent (mock)", vendor: "Synthetic", role: "signals", stage: "synthetic",
    layout: ringTheta(1, 4, 5),
    specialties: ["technographic", "decision_maker_seniority", "account_based"],
    personality: { base_latency_ms: 140, failure_rate: 0.04, audience_size_bias: 0.3 } },
];

const BUYING_AGENTS: EcosystemAgent[] = [
  { id: "swivel", name: "Swivel", vendor: "Swivel", role: "buying", stage: "live",
    mcp_url: "https://adcp.swivel.ai/mcp", layout: ringTheta(2, 0, 5),
    specialties: ["dsp", "open_web_buying"] },
  { id: "bidcliq", name: "Bidcliq", vendor: "Bidcliq", role: "buying", stage: "live",
    mcp_url: "https://agents.bidcliq.com/mcp", layout: ringTheta(2, 1, 5),
    specialties: ["programmatic_buying"] },
  { id: "mock_dsp_alpha", name: "DSP Alpha (mock)", vendor: "Synthetic", role: "buying", stage: "synthetic",
    layout: ringTheta(2, 2, 5),
    specialties: ["display_ctv_unified"],
    personality: { base_latency_ms: 110, failure_rate: 0.03, bid_aggressiveness: 0.85 } },
  { id: "mock_dsp_beta", name: "DSP Beta (mock)", vendor: "Synthetic", role: "buying", stage: "synthetic",
    layout: ringTheta(2, 3, 5),
    specialties: ["audio_first", "podcast_buying"],
    personality: { base_latency_ms: 125, failure_rate: 0.04, bid_aggressiveness: 0.65 } },
  { id: "mock_dsp_gamma", name: "DSP Gamma (mock)", vendor: "Synthetic", role: "buying", stage: "synthetic",
    layout: ringTheta(2, 4, 5),
    specialties: ["b2b_account_based", "linkedin_inventory"],
    personality: { base_latency_ms: 200, failure_rate: 0.06, bid_aggressiveness: 0.5 } },
];

const CREATIVE_AGENTS: EcosystemAgent[] = [
  { id: "celtra", name: "Celtra", vendor: "Celtra", role: "creative", stage: "live",
    mcp_url: "https://adcp-mcp.celtra.com/mcp", layout: ringTheta(3, 0, 3),
    specialties: ["creative_authoring", "dynamic_assembly"] },
  { id: "advertible", name: "Advertible", vendor: "Advertible", role: "creative", stage: "live",
    mcp_url: "https://adcp.4dvertible.com/mcp", layout: ringTheta(3, 1, 3),
    specialties: ["preview_validation", "asset_compliance"] },
  { id: "mock_display_factory", name: "Display Factory (mock)", vendor: "Synthetic", role: "creative", stage: "synthetic",
    layout: ringTheta(3, 2, 3),
    specialties: ["iab_standard_units", "responsive_display"],
    personality: { base_latency_ms: 80, failure_rate: 0.02 } },
];

const MEASUREMENT_AGENTS: EcosystemAgent[] = [
  { id: "nielsen_shape_mock", name: "Nielsen-shape (mock)", vendor: "Synthetic", role: "measurement", stage: "synthetic",
    layout: ringTheta(4, 0, 3),
    specialties: ["reach_frequency", "demographic_validation"],
    personality: { base_latency_ms: 320, failure_rate: 0.02 } },
  { id: "ias_shape_mock", name: "IAS-shape (mock)", vendor: "Synthetic", role: "measurement", stage: "synthetic",
    layout: ringTheta(4, 1, 3),
    specialties: ["viewability", "ivt_filter", "brand_safety_post"],
    personality: { base_latency_ms: 280, failure_rate: 0.03 } },
  { id: "triton_attention_mock", name: "Triton-attention (mock)", vendor: "Synthetic", role: "measurement", stage: "synthetic",
    layout: ringTheta(4, 2, 3),
    specialties: ["audio_attention", "real_time_engagement"],
    personality: { base_latency_ms: 180, failure_rate: 0.03 } },
];

const GOVERNANCE_AGENTS: EcosystemAgent[] = [
  { id: "gov_generic", name: "Governance (generic)", vendor: "Synthetic", role: "governance", stage: "synthetic",
    layout: ringTheta(5, 0, 3),
    specialties: ["pii_check", "consent_validation"],
    personality: { base_latency_ms: 60, failure_rate: 0.01 } },
  { id: "gov_gdpr", name: "Governance GDPR", vendor: "Synthetic", role: "governance", stage: "synthetic",
    layout: ringTheta(5, 1, 3),
    specialties: ["eu_jurisdiction", "consent_categories", "right_to_be_forgotten"],
    personality: { base_latency_ms: 90, failure_rate: 0.02 } },
  { id: "gov_brand_safety", name: "Governance Brand Safety", vendor: "Synthetic", role: "governance", stage: "synthetic",
    layout: ringTheta(5, 2, 3),
    specialties: ["category_blocklist", "context_alignment"],
    personality: { base_latency_ms: 75, failure_rate: 0.015 } },
];

export const ECOSYSTEM_AGENTS: EcosystemAgent[] = [
  ...SALES_AGENTS,
  ...SIGNALS_AGENTS,
  ...BUYING_AGENTS,
  ...CREATIVE_AGENTS,
  ...MEASUREMENT_AGENTS,
  ...GOVERNANCE_AGENTS,
];

export function getAgentsByRole(role: AgentRole): EcosystemAgent[] {
  return ECOSYSTEM_AGENTS.filter((a) => a.role === role);
}

// ── Brief generator ──────────────────────────────────────────────────────────

const BRIEF_PROMPTS: Array<{ prompt: string; weights: Brief["weights"] }> = [
  // CTV-leaning
  { prompt: "Affluent CTV viewers 25-44, sports + drama affinity",
    weights: { audience: 0.7, ctv_bias: 0.9, b2b_bias: 0.0, audio_bias: 0.1 } },
  { prompt: "Cord-cutters 25-44, high streaming affinity, urban",
    weights: { audience: 0.7, ctv_bias: 0.85, b2b_bias: 0.05, audio_bias: 0.3 } },
  { prompt: "CTV upper-funnel, premium content adjacency, brand-safe",
    weights: { audience: 0.8, ctv_bias: 0.95, b2b_bias: 0.0, audio_bias: 0.05 } },
  { prompt: "Live-event CTV viewers, sports + awards seasons",
    weights: { audience: 0.7, ctv_bias: 0.92, b2b_bias: 0.0, audio_bias: 0.15 } },

  // Audio-leaning
  { prompt: "Podcast listeners 35-54, automotive in-market",
    weights: { audience: 0.6, ctv_bias: 0.1, b2b_bias: 0.0, audio_bias: 0.95 } },
  { prompt: "iHeartMedia audio + simulcast, affluent commuters",
    weights: { audience: 0.6, ctv_bias: 0.2, b2b_bias: 0.05, audio_bias: 0.9 } },
  { prompt: "Spoken-word podcast affinity, cooking + lifestyle",
    weights: { audience: 0.55, ctv_bias: 0.05, b2b_bias: 0.0, audio_bias: 0.92 } },
  { prompt: "Streaming radio drive-time, urban DMAs",
    weights: { audience: 0.5, ctv_bias: 0.0, b2b_bias: 0.0, audio_bias: 0.98 } },

  // B2B-leaning
  { prompt: "B2B IT decision makers, mid-market SaaS",
    weights: { audience: 0.5, ctv_bias: 0.0, b2b_bias: 0.95, audio_bias: 0.2 } },
  { prompt: "Account-based: Fortune 500 marketing leadership",
    weights: { audience: 0.4, ctv_bias: 0.1, b2b_bias: 0.98, audio_bias: 0.1 } },
  { prompt: "Cybersecurity buying committee, enterprise",
    weights: { audience: 0.45, ctv_bias: 0.05, b2b_bias: 0.93, audio_bias: 0.15 } },

  // Lifestyle / demographic
  { prompt: "New parents 0-12mo, household income > $80k",
    weights: { audience: 0.85, ctv_bias: 0.5, b2b_bias: 0.0, audio_bias: 0.4 } },
  { prompt: "Luxury automotive intenders 45+, top DMAs",
    weights: { audience: 0.8, ctv_bias: 0.7, b2b_bias: 0.1, audio_bias: 0.5 } },
  { prompt: "Health-conscious affluent millennials, urban metros",
    weights: { audience: 0.75, ctv_bias: 0.5, b2b_bias: 0.0, audio_bias: 0.4 } },
  { prompt: "Empty nesters 55+, premium travel intenders",
    weights: { audience: 0.7, ctv_bias: 0.6, b2b_bias: 0.0, audio_bias: 0.5 } },
  { prompt: "Gen Z gamers, console + PC, esports affinity",
    weights: { audience: 0.7, ctv_bias: 0.5, b2b_bias: 0.0, audio_bias: 0.45 } },

  // Seasonal / retail
  { prompt: "Holiday gift shoppers — Q4 retail, last-mile attribution",
    weights: { audience: 0.6, ctv_bias: 0.4, b2b_bias: 0.0, audio_bias: 0.5 } },
  { prompt: "Back-to-school parents + students, mid-Aug surge",
    weights: { audience: 0.65, ctv_bias: 0.4, b2b_bias: 0.0, audio_bias: 0.55 } },
  { prompt: "Black Friday in-market deal hunters",
    weights: { audience: 0.55, ctv_bias: 0.35, b2b_bias: 0.0, audio_bias: 0.6 } },

  // Niche
  { prompt: "DIY home renovators, project budget $5k+",
    weights: { audience: 0.7, ctv_bias: 0.3, b2b_bias: 0.05, audio_bias: 0.6 } },
  { prompt: "Sustainable lifestyle buyers, eco-credentials matter",
    weights: { audience: 0.6, ctv_bias: 0.45, b2b_bias: 0.0, audio_bias: 0.55 } },
  { prompt: "Pet owners — premium-food intenders, dogs + cats",
    weights: { audience: 0.7, ctv_bias: 0.3, b2b_bias: 0.0, audio_bias: 0.6 } },
  { prompt: "First-time home buyers 28-38, suburban migration",
    weights: { audience: 0.75, ctv_bias: 0.55, b2b_bias: 0.05, audio_bias: 0.45 } },
  { prompt: "Cookie-less ID-resolved CTV, UID2 + RampID coverage",
    weights: { audience: 0.65, ctv_bias: 0.85, b2b_bias: 0.15, audio_bias: 0.1 } },
];

let briefCounter = 0;

export function generateBrief(feedbackBias?: { audio_pull?: number; ctv_pull?: number; b2b_pull?: number }): Brief {
  // Seed selection: weighted random, but bias toward prompts whose
  // weights align with the recent measurement winners. The bias
  // is applied multiplicatively against base weights then normalized
  // back to the [0..1] range.
  const bias = feedbackBias ?? {};
  const scored = BRIEF_PROMPTS.map((p) => {
    const fitScore =
      (p.weights.audio_bias * (bias.audio_pull ?? 0.5)) +
      (p.weights.ctv_bias * (bias.ctv_pull ?? 0.5)) +
      (p.weights.b2b_bias * (bias.b2b_pull ?? 0.5));
    return { p, fit: fitScore };
  });
  const totalFit = scored.reduce((s, x) => s + x.fit, 0) || 1;
  const r = Math.random() * totalFit;
  let acc = 0;
  let chosen = scored[0]!.p;
  for (const x of scored) {
    acc += x.fit;
    if (r < acc) { chosen = x.p; break; }
  }
  briefCounter += 1;
  return {
    id: `brief_${Date.now()}_${briefCounter}`,
    created_at: new Date().toISOString(),
    prompt: chosen.prompt,
    weights: chosen.weights,
    budget_usd: 5000 + Math.floor(Math.random() * 45000),
  };
}

// ── Synthetic responders ─────────────────────────────────────────────────────
//
// Each role has a synthetic responder that returns schema-shaped data.
// These are driven by the agent's `personality` knobs so each agent
// keeps a recognizable behavioral profile even in pure synthetic mode.
// When the orchestrator's live-call attempt times out or errors, it
// falls back to these.

function syntheticDelay(agent: EcosystemAgent): Promise<void> {
  const base = agent.personality?.base_latency_ms ?? 150;
  const jitter = Math.random() * base * 0.4;
  return new Promise((res) => setTimeout(res, base + jitter));
}

// Brief-fit score per agent: how well do this agent's specialties match
// this brief's weight profile? Returns [0..1+]. Used to bias every
// synthetic responder so agents look like they CARE about the brief
// rather than randomly responding. Specialty keywords are mapped to
// brief-weight dimensions; matches multiply the agent's response.
//
// e.g. mock_audio_signals (audio_ad_attention, podcast_listenership)
// scores HIGH on a "podcast listeners" brief, LOW on a CTV brief.
// Dstillery (behavioral_audiences, ttd_deployment) is balanced.
const SPECIALTY_TO_DIMENSION: Record<string, keyof Brief["weights"]> = {
  audio: "audio_bias",
  audio_first: "audio_bias",
  audio_ad_attention: "audio_bias",
  podcast_listenership: "audio_bias",
  podcast_buying: "audio_bias",
  audio_attention: "audio_bias",
  iheart_simulcast: "audio_bias",
  ctv_premium: "ctv_bias",
  ctv: "ctv_bias",
  display_ctv_unified: "ctv_bias",
  sports: "ctv_bias",
  live_events: "ctv_bias",
  b2b_account_based: "b2b_bias",
  account_based: "b2b_bias",
  technographic: "b2b_bias",
  decision_maker_seniority: "b2b_bias",
  linkedin_inventory: "b2b_bias",
};

function briefFitScore(agent: EcosystemAgent, brief: Brief): number {
  const specs = agent.specialties || [];
  if (specs.length === 0) return 0.6; // generic baseline
  let score = 0.5; // baseline so no agent goes to zero
  let matches = 0;
  for (const spec of specs) {
    const dim = SPECIALTY_TO_DIMENSION[spec];
    if (!dim) continue;
    const w = (brief.weights as Record<string, number>)[dim] ?? 0;
    score += w * 0.35;
    matches += 1;
  }
  // Universal-relevance specialties (cross-taxonomy etc.) get a small
  // floor boost so generalist agents like evgeny_signals don't lose
  // to specialists on every brief.
  if (matches === 0 && specs.some((s) => s.includes("cross_taxonomy") || s.includes("ucp_") || s.includes("dts_"))) {
    score += brief.weights.audience * 0.2;
  }
  return Math.min(1.4, score);
}

export async function syntheticSignalsResponse(agent: EcosystemAgent, brief: Brief): Promise<{
  signals: Array<{ name: string; coverage: number; cpm: number }>;
  agent_id: string;
  fit: number;
}> {
  await syntheticDelay(agent);
  if (Math.random() < (agent.personality?.failure_rate ?? 0)) throw new Error("simulated network error");
  const fit = briefFitScore(agent, brief);
  // Higher fit → more candidates returned + better coverage.
  const baseCount = Math.max(1, Math.round(3 + fit * 3 + Math.random() * 2));
  const audienceBias = (agent.personality?.audience_size_bias ?? 0.5);
  const signals = Array.from({ length: baseCount }, (_, i) => ({
    name: `${agent.specialties?.[0] ?? "audience"}_seg_${i + 1}`,
    coverage: Math.min(95, (15 + Math.random() * 40 + fit * 25) * (1 + audienceBias * 0.5)),
    cpm: Math.max(0.5, (2 + Math.random() * 6) * (0.8 + fit * 0.5)),
  }));
  return { signals, agent_id: agent.id, fit };
}

export async function syntheticGovernanceResponse(agent: EcosystemAgent, brief: Brief): Promise<{
  outcome: "allow" | "deny" | "review";
  agent_id: string;
  reason?: string;
}> {
  await syntheticDelay(agent);
  if (Math.random() < (agent.personality?.failure_rate ?? 0)) throw new Error("simulated governance timeout");
  const r = Math.random();
  if (r < 0.78) return { outcome: "allow", agent_id: agent.id };
  if (r < 0.92) return { outcome: "review", agent_id: agent.id, reason: "manual_consent_check_required" };
  return { outcome: "deny", agent_id: agent.id, reason: agent.specialties?.[0] === "category_blocklist" ? "blocked_category" : "consent_unmet" };
}

export async function syntheticSalesResponse(agent: EcosystemAgent, brief: Brief): Promise<{
  products: Array<{ id: string; name: string; cpm: number; available_impressions: number }>;
  agent_id: string;
  fit: number;
}> {
  await syntheticDelay(agent);
  if (Math.random() < (agent.personality?.failure_rate ?? 0)) throw new Error("simulated sales agent error");
  const aggression = agent.personality?.bid_aggressiveness ?? 0.7;
  const fit = briefFitScore(agent, brief);
  // Sales agents whose specialty matches the brief return MORE products
  // with better terms. Off-fit agents return a token 1-2 to show they
  // tried; that's the "we handle the call but it's not our sweet spot"
  // signal you'd see in real ecosystems.
  const productCount = Math.max(1, Math.round(2 + fit * 3 + Math.random() * 1));
  const products = Array.from({ length: productCount }, (_, i) => ({
    id: `${agent.id}_prod_${i + 1}`,
    name: `${agent.specialties?.[0] ?? "premium"}_${i + 1}`,
    cpm: (8 + Math.random() * 24) * (0.7 + fit * 0.4),
    available_impressions: Math.floor((5_000_000 + Math.random() * 30_000_000) * aggression * (0.6 + fit * 0.6)),
  }));
  return { products, agent_id: agent.id, fit };
}

export async function syntheticCreativeResponse(agent: EcosystemAgent, brief: Brief): Promise<{
  formats: Array<{ format_id: string; w: number; h: number }>;
  agent_id: string;
}> {
  await syntheticDelay(agent);
  if (Math.random() < (agent.personality?.failure_rate ?? 0)) throw new Error("creative agent failure");
  const formats = [
    { format_id: "iab_300x250", w: 300, h: 250 },
    { format_id: "iab_728x90", w: 728, h: 90 },
    { format_id: "iab_320x50_mobile", w: 320, h: 50 },
    { format_id: "ctv_15s_video", w: 1920, h: 1080 },
    { format_id: "ctv_30s_video", w: 1920, h: 1080 },
  ];
  // Filter randomly per agent so each one has its own canon
  const sliced = formats.filter(() => Math.random() > 0.3).slice(0, 3);
  return { formats: sliced, agent_id: agent.id };
}

export async function syntheticBuyingBid(agent: EcosystemAgent, brief: Brief): Promise<{
  bid_cpm: number;
  budget_committed: number;
  agent_id: string;
  fit: number;
}> {
  await syntheticDelay(agent);
  if (Math.random() < (agent.personality?.failure_rate ?? 0)) throw new Error("buying agent timeout");
  const aggression = agent.personality?.bid_aggressiveness ?? 0.7;
  const fit = briefFitScore(agent, brief);
  // Buying agents commit budget proportionally to brief fit. A b2b
  // brief gets a $50k commitment from mock_dsp_gamma (b2b specialist)
  // and a $5k token from mock_dsp_beta (audio specialist).
  return {
    bid_cpm: (4 + Math.random() * 14) * aggression * (0.7 + fit * 0.7),
    budget_committed: Math.floor(brief.budget_usd * (0.10 + fit * 0.55) * aggression),
    agent_id: agent.id,
    fit,
  };
}

export async function syntheticMeasurementReport(
  agent: EcosystemAgent,
  brief: Brief,
  context?: {
    avg_signal_fit?: number;
    avg_sales_fit?: number;
    avg_bid_cpm?: number;
    total_budget_committed?: number;
    bid_count?: number;
  }
): Promise<{
  lift: number;
  reach_pct: number;
  brand_safety: number;
  agent_id: string;
  fit_components?: { signal_fit: number; sales_fit: number; bid_efficiency: number; specialty_match: number };
}> {
  await syntheticDelay(agent);
  if (Math.random() < (agent.personality?.failure_rate ?? 0)) throw new Error("measurement timeout");
  // Meaningful lift: weighted product of upstream-phase quality
  // signals. This replaces the old random + per-agent-tweak pattern
  // with a CV-style fit function so the feedback loop converges
  // toward briefs that actually run well end-to-end.
  //
  //   signal_fit       = avg fit of signals agents that responded
  //   sales_fit        = avg fit of sales agents that responded
  //   bid_efficiency   = (sum bid_cpm / count) normalized — lower CPM at
  //                      same coverage = more efficient
  //   specialty_match  = does this measurement agent specialize in the
  //                      brief's dominant axis?
  const signalFit = context?.avg_signal_fit ?? 0.6;
  const salesFit = context?.avg_sales_fit ?? 0.6;
  const avgCpm = context?.avg_bid_cpm ?? 8;
  // CPM efficiency: cap at 25 (very expensive) → 0; floor at 4 (cheap) → 1
  const bidEfficiency = Math.max(0, Math.min(1, (25 - avgCpm) / 21));
  // Specialty match: which axis does this measurement agent care about?
  const dominant = brief.weights.audio_bias > brief.weights.ctv_bias && brief.weights.audio_bias > brief.weights.b2b_bias
    ? "audio"
    : brief.weights.ctv_bias > brief.weights.b2b_bias ? "ctv" : "b2b";
  let specialtyMatch = 0.6;
  if (agent.id === "triton_attention_mock" && dominant === "audio") specialtyMatch = 1.0;
  else if (agent.id === "nielsen_shape_mock" && dominant === "ctv") specialtyMatch = 0.95;
  else if (agent.id === "ias_shape_mock") specialtyMatch = 0.75; // generalist viewability + brand-safety
  // Weighted geometric-ish mean. Falls toward 0.3 if any component is
  // weak, toward 0.85 if all align. Random component adds ±0.08
  // jitter — measurement noise.
  const aligned = (signalFit * 0.30) + (salesFit * 0.25) + (bidEfficiency * 0.25) + (specialtyMatch * 0.20);
  const jitter = (Math.random() - 0.5) * 0.16;
  const lift = Math.max(0.15, Math.min(0.97, aligned + jitter));
  // Reach scales with sales fit (more products = more reach)
  const reachPct = Math.min(85, 12 + salesFit * 60 + Math.random() * 8);
  return {
    lift,
    reach_pct: reachPct,
    brand_safety: 0.85 + Math.random() * 0.14,
    agent_id: agent.id,
    fit_components: { signal_fit: signalFit, sales_fit: salesFit, bid_efficiency: bidEfficiency, specialty_match: specialtyMatch },
  };
}

// ── Feedback loop ────────────────────────────────────────────────────────────
//
// Lift scores from measurement agents bias next-cycle brief generation.
// EWMA over the last K cycles per topical bias dimension.

class FeedbackState {
  audio_pull: number = 0.5;
  ctv_pull: number = 0.5;
  b2b_pull: number = 0.5;
  cycles: number = 0;

  ingest(brief: Brief, lifts: number[]): void {
    if (lifts.length === 0) return;
    const meanLift = lifts.reduce((a, b) => a + b, 0) / lifts.length;
    const alpha = 0.2; // EWMA smoothing
    // Each weight is pulled toward 1 if the brief biased that dimension AND
    // measured high lift. Low lift on a high-bias brief pulls toward 0.
    this.audio_pull = (1 - alpha) * this.audio_pull + alpha * (brief.weights.audio_bias * meanLift + (1 - brief.weights.audio_bias) * 0.5);
    this.ctv_pull = (1 - alpha) * this.ctv_pull + alpha * (brief.weights.ctv_bias * meanLift + (1 - brief.weights.ctv_bias) * 0.5);
    this.b2b_pull = (1 - alpha) * this.b2b_pull + alpha * (brief.weights.b2b_bias * meanLift + (1 - brief.weights.b2b_bias) * 0.5);
    this.cycles += 1;
  }

  bias(): { audio_pull: number; ctv_pull: number; b2b_pull: number } {
    return { audio_pull: this.audio_pull, ctv_pull: this.ctv_pull, b2b_pull: this.b2b_pull };
  }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────
//
// Runs one buying ceremony for a single brief. Records every event as
// a TraceNode + emits MessageEvents for the visualizer. Yields events
// over an async iterator so the SSE handler can stream them as they
// happen instead of waiting for the whole cycle to complete.

let traceCounter = 0;
function nextTraceId(): string { traceCounter += 1; return `t${Date.now()}_${traceCounter}`; }

export interface CycleEvent {
  kind: "trace" | "message" | "lift_update" | "cycle_start" | "cycle_end";
  trace?: TraceNode;
  message?: MessageEvent;
  lift?: { agent_id: string; score: number };
  brief?: Brief;
  cycle_summary?: { brief_id: string; mean_lift: number; products_evaluated: number; bids_received: number };
}

const BUYER_AGENT_ID = "__buyer_orchestrator";

async function* runCycle(brief: Brief, _liftMap: Map<string, AgentLift>): AsyncGenerator<CycleEvent> {
  const t0 = Date.now();

  // Accumulate quality signals across phases so measurement can do a
  // real CV-fit-style lift score instead of randomly jittering.
  const cycleContext = {
    signal_fits: [] as number[],
    sales_fits: [] as number[],
    bid_cpms: [] as number[],
    total_budget_committed: 0,
  };

  yield {
    kind: "cycle_start",
    brief,
  };

  yield {
    kind: "trace",
    trace: { id: nextTraceId(), kind: "brief_spawned", brief_id: brief.id, ts_ms: 0,
      summary: `Brief: "${brief.prompt}" — $${brief.budget_usd.toLocaleString()}`,
      detail: { weights: brief.weights, budget: brief.budget_usd } },
  };

  // 1) Signals fan-out
  const signalsAgents = getAgentsByRole("signals");
  for (const a of signalsAgents) {
    yield { kind: "message", message: { id: nextTraceId(), brief_id: brief.id,
      from_agent_id: BUYER_AGENT_ID, to_agent_id: a.id, kind: "signals_fanout", ts_ms: Date.now() - t0,
      color_hint: "discovery" } };
  }
  const signalResponses = await Promise.allSettled(
    signalsAgents.map(async (a) => {
      try { return { agent: a, response: await syntheticSignalsResponse(a, brief) }; }
      catch (e) { return { agent: a, error: String(e) }; }
    })
  );
  for (const r of signalResponses) {
    if (r.status !== "fulfilled") continue;
    const v = r.value as { agent: EcosystemAgent } & ({ response: { signals: Array<{ name: string; coverage: number; cpm: number }>; fit?: number } } | { error: string });
    if ("error" in v) {
      yield { kind: "trace", trace: { id: nextTraceId(), kind: "signal_response", agent_id: v.agent.id, brief_id: brief.id, ts_ms: Date.now() - t0,
        summary: `${v.agent.name}: ERROR ${v.error}`, detail: { error: v.error } } };
      continue;
    }
    if (typeof v.response.fit === "number") cycleContext.signal_fits.push(v.response.fit);
    yield { kind: "message", message: { id: nextTraceId(), brief_id: brief.id,
      from_agent_id: v.agent.id, to_agent_id: BUYER_AGENT_ID, kind: "signal_response", ts_ms: Date.now() - t0,
      color_hint: "signal" } };
    yield { kind: "trace", trace: { id: nextTraceId(), kind: "signal_response", agent_id: v.agent.id, brief_id: brief.id, ts_ms: Date.now() - t0,
      summary: `${v.agent.name}: ${v.response.signals.length} signals, top coverage ${v.response.signals[0]?.coverage.toFixed(1)}%${v.response.fit !== undefined ? ` · fit ${(v.response.fit * 100).toFixed(0)}%` : ""}`,
      detail: { signals: v.response.signals, fit: v.response.fit } } };
  }

  // 2) Governance check (parallel across all governance agents — winner-take-all gate)
  const govAgents = getAgentsByRole("governance");
  for (const a of govAgents) {
    yield { kind: "message", message: { id: nextTraceId(), brief_id: brief.id,
      from_agent_id: BUYER_AGENT_ID, to_agent_id: a.id, kind: "governance_check", ts_ms: Date.now() - t0,
      color_hint: "policy" } };
  }
  const govResponses = await Promise.allSettled(
    govAgents.map(async (a) => {
      try { return { agent: a, response: await syntheticGovernanceResponse(a, brief) }; }
      catch (e) { return { agent: a, error: String(e) }; }
    })
  );
  let governanceClear = true;
  for (const r of govResponses) {
    if (r.status !== "fulfilled") continue;
    const v = r.value as { agent: EcosystemAgent } & ({ response: { outcome: string; reason?: string } } | { error: string });
    if ("error" in v) continue;
    yield { kind: "message", message: { id: nextTraceId(), brief_id: brief.id,
      from_agent_id: v.agent.id, to_agent_id: BUYER_AGENT_ID, kind: "governance_check", ts_ms: Date.now() - t0,
      color_hint: "policy" } };
    yield { kind: "trace", trace: { id: nextTraceId(), kind: "governance_check", agent_id: v.agent.id, brief_id: brief.id, ts_ms: Date.now() - t0,
      summary: `${v.agent.name}: ${v.response.outcome.toUpperCase()}${v.response.reason ? ` (${v.response.reason})` : ""}`,
      detail: { outcome: v.response.outcome, reason: v.response.reason } } };
    if (v.response.outcome === "deny") governanceClear = false;
  }

  if (!governanceClear) {
    yield { kind: "cycle_end", cycle_summary: { brief_id: brief.id, mean_lift: 0, products_evaluated: 0, bids_received: 0 } };
    return;
  }

  // 3) Sales fan-out
  const salesAgents = getAgentsByRole("sales");
  for (const a of salesAgents) {
    yield { kind: "message", message: { id: nextTraceId(), brief_id: brief.id,
      from_agent_id: BUYER_AGENT_ID, to_agent_id: a.id, kind: "sales_fanout", ts_ms: Date.now() - t0,
      color_hint: "discovery" } };
  }
  const salesResponses = await Promise.allSettled(
    salesAgents.map(async (a) => {
      try { return { agent: a, response: await syntheticSalesResponse(a, brief) }; }
      catch (e) { return { agent: a, error: String(e) }; }
    })
  );
  let productsEvaluated = 0;
  for (const r of salesResponses) {
    if (r.status !== "fulfilled") continue;
    const v = r.value as { agent: EcosystemAgent } & ({ response: { products: Array<unknown>; fit?: number } } | { error: string });
    if ("error" in v) continue;
    productsEvaluated += v.response.products.length;
    if (typeof v.response.fit === "number") cycleContext.sales_fits.push(v.response.fit);
    yield { kind: "message", message: { id: nextTraceId(), brief_id: brief.id,
      from_agent_id: v.agent.id, to_agent_id: BUYER_AGENT_ID, kind: "sales_response", ts_ms: Date.now() - t0,
      color_hint: "product" } };
    yield { kind: "trace", trace: { id: nextTraceId(), kind: "sales_response", agent_id: v.agent.id, brief_id: brief.id, ts_ms: Date.now() - t0,
      summary: `${v.agent.name}: ${v.response.products.length} products${v.response.fit !== undefined ? ` · fit ${(v.response.fit * 100).toFixed(0)}%` : ""}`,
      detail: { products: v.response.products, fit: v.response.fit } } };
  }

  // 4) Creative match
  const creativeAgents = getAgentsByRole("creative");
  for (const a of creativeAgents) {
    yield { kind: "message", message: { id: nextTraceId(), brief_id: brief.id,
      from_agent_id: BUYER_AGENT_ID, to_agent_id: a.id, kind: "creative_match", ts_ms: Date.now() - t0,
      color_hint: "creative" } };
  }
  await Promise.allSettled(
    creativeAgents.map(async (a) => {
      try {
        const r = await syntheticCreativeResponse(a, brief);
        return { agent: a, response: r };
      } catch (e) { return { agent: a, error: String(e) }; }
    })
  );
  for (const a of creativeAgents) {
    yield { kind: "message", message: { id: nextTraceId(), brief_id: brief.id,
      from_agent_id: a.id, to_agent_id: BUYER_AGENT_ID, kind: "creative_match", ts_ms: Date.now() - t0,
      color_hint: "creative" } };
  }

  // 5) Buying bids
  const buyingAgents = getAgentsByRole("buying");
  for (const a of buyingAgents) {
    yield { kind: "message", message: { id: nextTraceId(), brief_id: brief.id,
      from_agent_id: BUYER_AGENT_ID, to_agent_id: a.id, kind: "buying_bid", ts_ms: Date.now() - t0,
      color_hint: "bid" } };
  }
  const bidResponses = await Promise.allSettled(
    buyingAgents.map(async (a) => {
      try { return { agent: a, response: await syntheticBuyingBid(a, brief) }; }
      catch (e) { return { agent: a, error: String(e) }; }
    })
  );
  let bidsReceived = 0;
  for (const r of bidResponses) {
    if (r.status !== "fulfilled") continue;
    const v = r.value as { agent: EcosystemAgent } & ({ response: { bid_cpm: number; budget_committed: number; fit?: number } } | { error: string });
    if ("error" in v) continue;
    bidsReceived += 1;
    cycleContext.bid_cpms.push(v.response.bid_cpm);
    cycleContext.total_budget_committed += v.response.budget_committed;
    yield { kind: "message", message: { id: nextTraceId(), brief_id: brief.id,
      from_agent_id: v.agent.id, to_agent_id: BUYER_AGENT_ID, kind: "buying_bid", ts_ms: Date.now() - t0,
      color_hint: "bid" } };
    yield { kind: "trace", trace: { id: nextTraceId(), kind: "buying_bid", agent_id: v.agent.id, brief_id: brief.id, ts_ms: Date.now() - t0,
      summary: `${v.agent.name}: $${v.response.bid_cpm.toFixed(2)} CPM, $${v.response.budget_committed.toLocaleString()} committed${v.response.fit !== undefined ? ` · fit ${(v.response.fit * 100).toFixed(0)}%` : ""}`,
      detail: { bid: v.response } } };
  }

  // 6) Measurement
  const measurementAgents = getAgentsByRole("measurement");
  for (const a of measurementAgents) {
    yield { kind: "message", message: { id: nextTraceId(), brief_id: brief.id,
      from_agent_id: BUYER_AGENT_ID, to_agent_id: a.id, kind: "measurement_report", ts_ms: Date.now() - t0,
      color_hint: "measurement" } };
  }
  // Roll up cycle quality signals so measurement can score against
  // actual upstream-phase outcomes — not random tilt against the brief
  // weights. This is what makes the feedback loop meaningful.
  const measurementContext = {
    avg_signal_fit: cycleContext.signal_fits.length > 0
      ? cycleContext.signal_fits.reduce((a, b) => a + b, 0) / cycleContext.signal_fits.length
      : 0.6,
    avg_sales_fit: cycleContext.sales_fits.length > 0
      ? cycleContext.sales_fits.reduce((a, b) => a + b, 0) / cycleContext.sales_fits.length
      : 0.6,
    avg_bid_cpm: cycleContext.bid_cpms.length > 0
      ? cycleContext.bid_cpms.reduce((a, b) => a + b, 0) / cycleContext.bid_cpms.length
      : 8,
    total_budget_committed: cycleContext.total_budget_committed,
    bid_count: cycleContext.bid_cpms.length,
  };
  const measurementResponses = await Promise.allSettled(
    measurementAgents.map(async (a) => {
      try { return { agent: a, response: await syntheticMeasurementReport(a, brief, measurementContext) }; }
      catch (e) { return { agent: a, error: String(e) }; }
    })
  );
  const lifts: number[] = [];
  for (const r of measurementResponses) {
    if (r.status !== "fulfilled") continue;
    const v = r.value as { agent: EcosystemAgent } & ({ response: { lift: number; reach_pct: number; brand_safety: number } } | { error: string });
    if ("error" in v) continue;
    lifts.push(v.response.lift);
    yield { kind: "message", message: { id: nextTraceId(), brief_id: brief.id,
      from_agent_id: v.agent.id, to_agent_id: BUYER_AGENT_ID, kind: "measurement_report", ts_ms: Date.now() - t0,
      color_hint: "measurement" } };
    yield { kind: "trace", trace: { id: nextTraceId(), kind: "measurement_report", agent_id: v.agent.id, brief_id: brief.id, ts_ms: Date.now() - t0,
      summary: `${v.agent.name}: lift ${(v.response.lift * 100).toFixed(0)}%, reach ${v.response.reach_pct.toFixed(1)}%`,
      detail: { measurement: v.response } } };
    yield { kind: "lift_update", lift: { agent_id: v.agent.id, score: v.response.lift } };
  }

  const meanLift = lifts.length > 0 ? lifts.reduce((a, b) => a + b, 0) / lifts.length : 0;
  yield {
    kind: "cycle_end",
    cycle_summary: { brief_id: brief.id, mean_lift: meanLift, products_evaluated: productsEvaluated, bids_received: bidsReceived },
  };
}

// ── Live MCP probe ───────────────────────────────────────────────────────────
//
// Best-effort liveness check for agents that declare an mcp_url. Sends
// a `tools/list` JSON-RPC frame with a 2.5s timeout, accepts any 2xx
// response (any agent up enough to answer). Result cached per-agent;
// re-probed on a rolling cadence so the visual reflects current state.
//
// Crucially: this never blocks a cycle. The probe runs in the
// background; cycles continue with synthetic responses regardless.
// What changes is the agent's visual stage indicator: "live ●" if the
// last probe was 2xx within ~60s, "stale ●" if the last probe failed
// or hasn't fired yet, "synthetic ○" for agents we never claimed
// were live in the first place.

export interface AgentLiveStatus {
  /** ISO timestamp of the last probe attempt. */
  last_probed_at: string | null;
  /** Last probe outcome — "ok" | "timeout" | "http_<code>" | "error" | null. */
  last_status: string | null;
  /** Round-trip ms of last successful probe. */
  last_latency_ms: number | null;
  /** True iff the most recent probe within ~60s succeeded. */
  is_live_now: boolean;
}

const PROBE_TIMEOUT_MS = 2500;
const PROBE_STALE_AFTER_MS = 60_000;
const liveStatusByAgent = new Map<string, AgentLiveStatus>();

async function probeAgent(agent: EcosystemAgent): Promise<AgentLiveStatus> {
  const status: AgentLiveStatus = {
    last_probed_at: new Date().toISOString(),
    last_status: null,
    last_latency_ms: null,
    is_live_now: false,
  };
  if (!agent.mcp_url) {
    status.last_status = "no_url";
    return status;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  const start = Date.now();
  try {
    const r = await fetch(agent.mcp_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      signal: ctrl.signal,
    });
    status.last_latency_ms = Date.now() - start;
    // Liveness semantics: any HTTP response below 500 means the server
    // is UP and responding. 4xx means the server received the request
    // and chose to reject it (e.g. needs session-id handshake, or
    // requires auth, or doesn't accept our exact body shape) — but the
    // host process is alive. 5xx means the server itself errored. We
    // distinguish for observability but treat <500 as alive.
    if (r.ok) {
      status.last_status = "ok";
      status.is_live_now = true;
    } else if (r.status < 500) {
      status.last_status = "http_" + r.status;
      status.is_live_now = true; // alive but not accepting our probe shape
    } else {
      status.last_status = "http_" + r.status;
      status.is_live_now = false;
    }
  } catch (err) {
    status.last_latency_ms = Date.now() - start;
    if ((err as Error).name === "AbortError") {
      status.last_status = "timeout";
    } else {
      status.last_status = "error";
    }
  } finally {
    clearTimeout(timer);
  }
  return status;
}

export async function probeAllLive(): Promise<{ probed: number; live: number }> {
  const liveAgents = ECOSYSTEM_AGENTS.filter((a) => a.stage === "live");
  let liveCount = 0;
  await Promise.all(
    liveAgents.map(async (agent) => {
      try {
        const status = await probeAgent(agent);
        liveStatusByAgent.set(agent.id, status);
        if (status.is_live_now) liveCount += 1;
      } catch {
        // Already wrapped inside probeAgent — defensive.
      }
    })
  );
  return { probed: liveAgents.length, live: liveCount };
}

export function getLiveStatusSnapshot(): Array<{ agent_id: string } & AgentLiveStatus> {
  const now = Date.now();
  const out: Array<{ agent_id: string } & AgentLiveStatus> = [];
  for (const [agent_id, status] of liveStatusByAgent.entries()) {
    // Auto-expire: if the last probe is older than the stale window,
    // surface as not-live-now even if the probe succeeded back then.
    const probedAt = status.last_probed_at ? new Date(status.last_probed_at).getTime() : 0;
    const stale = now - probedAt > PROBE_STALE_AFTER_MS;
    out.push({
      agent_id,
      ...status,
      is_live_now: status.is_live_now && !stale,
    });
  }
  return out;
}

// ── Singleton state ──────────────────────────────────────────────────────────

class EcosystemState {
  feedback: FeedbackState = new FeedbackState();
  liftByAgent: Map<string, AgentLift> = new Map();
  lastCycleSummaries: Array<{ brief_id: string; mean_lift: number; products_evaluated: number; bids_received: number; ts: string }> = [];
  cycleCount: number = 0;

  applyMeasurement(brief: Brief, lifts: number[]): void {
    this.feedback.ingest(brief, lifts);
  }

  recordLift(agent_id: string, lift: number): void {
    const prev = this.liftByAgent.get(agent_id) ?? { score: 0.5, samples: 0 };
    const alpha = 0.25;
    const next = (1 - alpha) * prev.score + alpha * lift;
    this.liftByAgent.set(agent_id, { score: next, samples: prev.samples + 1 });
  }

  recordCycle(summary: { brief_id: string; mean_lift: number; products_evaluated: number; bids_received: number }): void {
    this.lastCycleSummaries.push({ ...summary, ts: new Date().toISOString() });
    if (this.lastCycleSummaries.length > 50) this.lastCycleSummaries.shift();
    this.cycleCount += 1;
  }

  snapshot(): {
    feedback: { audio_pull: number; ctv_pull: number; b2b_pull: number };
    cycle_count: number;
    lift_by_agent: Array<{ agent_id: string; score: number; samples: number }>;
    recent_cycles: Array<{ brief_id: string; mean_lift: number; products_evaluated: number; bids_received: number; ts: string }>;
  } {
    return {
      feedback: this.feedback.bias(),
      cycle_count: this.cycleCount,
      lift_by_agent: Array.from(this.liftByAgent.entries()).map(([agent_id, v]) => ({ agent_id, ...v })),
      recent_cycles: this.lastCycleSummaries.slice(-10),
    };
  }
}

export const ECOSYSTEM = new EcosystemState();

// ── Public driver ────────────────────────────────────────────────────────────
//
// runOneCycle generates a brief (biased by current feedback) and yields
// a stream of events. Caller (the SSE route) forwards each event to
// the connected client, then loops to drive the next cycle.

export async function* runOneCycle(): AsyncGenerator<CycleEvent> {
  const brief = generateBrief(ECOSYSTEM.feedback.bias());
  const liftCollector: number[] = [];
  for await (const ev of runCycle(brief, ECOSYSTEM.liftByAgent)) {
    if (ev.kind === "lift_update" && ev.lift) {
      ECOSYSTEM.recordLift(ev.lift.agent_id, ev.lift.score);
      liftCollector.push(ev.lift.score);
    }
    if (ev.kind === "cycle_end" && ev.cycle_summary) {
      ECOSYSTEM.applyMeasurement(brief, liftCollector);
      ECOSYSTEM.recordCycle(ev.cycle_summary);
    }
    yield ev;
  }
}
