// src/domain/agenticPlanner.ts
//
// Tool-selection planner. Given an ExpandedBrief and a coverage matrix
// (which agents advertise which tools), produce an ordered Plan of
// step-by-step tool invocations + per-step rationale.
//
// Live mode: LLM picks the sequence given the catalog of available
// tools + the brief.
// Template mode: deterministic 5-stage plan that mirrors the existing
// Brand Canvas pipeline (signals → creative → products → governance →
// dry-run media-buy), filtered by what's actually live in coverage.

import type { ExpandedBrief } from "./agenticBrief";
import { type AgenticContext, type ReasoningStep, newReasoningStep, llmCall } from "./agenticCore";

export interface PlanStep {
  step_id: string;
  index: number;
  /** Tool name (matches the AdCP tool surface). */
  tool: string;
  /** Which agent(s) to call this tool on. */
  agents: string[];
  /** Plain-language rationale for picking this step. */
  rationale: string;
  /** Args the planner expects to pass (at execution time, the executor
   *  may refine these from prior-step results). */
  args_template: Record<string, unknown>;
  /** What downstream steps depend on this step's output. */
  downstream_uses: string[];
  /** Whether this step can be skipped if zero capable agents. */
  optional: boolean;
}

export interface ExecutionPlan {
  plan_id: string;
  brief: ExpandedBrief;
  steps: PlanStep[];
  /** Estimated total wall-clock for the plan. */
  estimated_duration_ms: number;
  /** Confidence of the plan 0–1. */
  confidence: number;
  source: "live_llm" | "template";
  trace: ReasoningStep[];
}

export interface AgentCoverage {
  agent_id: string;
  agent_name: string;
  vendor: string;
  role: "signals" | "creative" | "buying" | "unclassified";
  tools_supported: string[];
}

const SYSTEM_PROMPT_PLANNER = `You are an agentic media-planning orchestrator.
Given an ExpandedBrief and a list of available agents (with their tools), produce a step-by-step execution plan.

Allowed tools (call only what's available):
  - get_signals          — discover audience signals (signals agents)
  - list_creative_formats — list creative formats (creative agents)
  - get_products         — discover targetable inventory (buying agents)
  - check_governance     — predictive policy check (mocked locally)
  - check_brand_rights   — predictive rights check (mocked locally)
  - create_media_buy     — fire a buy (buying agents; auth-gated mostly)
  - update_media_buy     — mutate an existing buy
  - get_media_buy_delivery — pull pacing/delivery for a fired buy

Plan the SHORTEST useful sequence. Each step states WHY it's there.
Skip steps that would call tools no available agent advertises.`;

const PLAN_SCHEMA_HINT = `{
  "steps": [
    {
      "tool": string,
      "agents": string[],
      "rationale": string,
      "args_template": object,
      "downstream_uses": string[],
      "optional": boolean
    }
  ],
  "confidence": number,
  "estimated_duration_ms": number
}`;

// ── Template planner ────────────────────────────────────────────────────────

function pickAgentsForTool(coverage: AgentCoverage[], tool: string): string[] {
  return coverage.filter((a) => a.tools_supported.includes(tool)).map((a) => a.agent_id);
}

function defaultPlanForBrief(brief: ExpandedBrief, coverage: AgentCoverage[]): PlanStep[] {
  const signalsAgents = coverage.filter((c) => c.role === "signals" && c.tools_supported.includes("get_signals")).map((c) => c.agent_id);
  const creativeAgents = coverage.filter((c) => c.role === "creative" && c.tools_supported.includes("list_creative_formats")).map((c) => c.agent_id);
  const productsAgents = pickAgentsForTool(coverage, "get_products");
  const buyingAgents = pickAgentsForTool(coverage, "create_media_buy");

  const briefStr = brief.input;
  const baseArgs = {
    brief: briefStr,
    industries: brief.industries,
    geo: brief.geo,
    audience_descriptors: brief.audience_descriptors,
  };

  const steps: PlanStep[] = [];
  let idx = 1;
  const mk = (tool: string, agents: string[], rationale: string, args: Record<string, unknown>, downstream: string[], optional: boolean): PlanStep => ({
    step_id: "ps_" + Math.random().toString(36).slice(2, 8),
    index: idx++,
    tool,
    agents,
    rationale,
    args_template: args,
    downstream_uses: downstream,
    optional,
  });

  if (signalsAgents.length > 0) {
    steps.push(mk(
      "get_signals",
      signalsAgents,
      `Discover audience signals matching the brief's audience descriptors (${brief.audience_descriptors.join(", ") || "none extracted"}). Fan out to ${signalsAgents.length} signals agent(s) in parallel; rank by coverage_percentage; pick top-3.`,
      { signal_spec: briefStr, max_results: 10, deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: brief.geo } },
      ["create_media_buy.targeting_overlay", "check_governance.signal_attestations"],
      false,
    ));
  }
  if (creativeAgents.length > 0) {
    steps.push(mk(
      "list_creative_formats",
      creativeAgents,
      `Enumerate available creative formats. Filter by brand industries (${brief.industries.slice(0, 2).join("/")}) — DOOH for retail/CPG, native for editorial brands.`,
      { brand_categories: brief.industries },
      ["create_media_buy.creatives", "check_brand_rights.formats"],
      false,
    ));
  }
  steps.push(mk(
    "check_brand_rights",
    ["self"],
    `Predictive rights check on chosen creative formats × brand classification. Master brands → owned; sub-brands → delegated; DOOH → needs_clearance.`,
    { brand_industries: brief.industries },
    ["create_media_buy.rights_attestation"],
    true,
  ));
  if (productsAgents.length > 0) {
    steps.push(mk(
      "get_products",
      productsAgents,
      `Query targetable inventory from ${productsAgents.length} buying agent(s). Filter by chosen signals + chosen formats. Pick highest-CPM-floor product per agent.`,
      { ...baseArgs, filters: { signals: "${chosen_signal_ids}", format_ids: "${chosen_format_ids}" } },
      ["create_media_buy.product_id"],
      false,
    ));
  }
  steps.push(mk(
    "check_governance",
    ["self"],
    `Predictive governance check: ${brief.industries.length} brand industries × signal attestations. KPI ${brief.kpi}@${brief.kpi_target} carries default catch-alls (GDPR, CSBS).`,
    { brand_industries: brief.industries },
    ["create_media_buy.governance_decision"],
    false,
  ));
  if (buyingAgents.length > 0) {
    const targetBuy = buyingAgents.slice(0, 3);  // cap fan-out for the demo
    steps.push(mk(
      "create_media_buy",
      targetBuy,
      `Synthesize a create_media_buy payload (idempotency_key = FNV-1a hash; signal_attestations propagated). Apply per-vendor adapter rules (Adzymic/Claire/Swivel schema split). Emit dry-run by default — fire only with explicit user opt-in. ${brief.budget_usd_estimate ? `Budget: $${brief.budget_usd_estimate.toLocaleString()}.` : ""}`,
      { brief: briefStr, brand: { domain: brief.brand_domain, name: brief.brand_name }, total_budget: { amount: brief.budget_usd_estimate ?? 1000, currency: "USD" } },
      [],
      false,
    ));
  }
  return steps;
}

// ── Public planner ──────────────────────────────────────────────────────────

export async function planExecution(ctx: AgenticContext, brief: ExpandedBrief, coverage: AgentCoverage[]): Promise<ExecutionPlan> {
  const trace: ReasoningStep[] = [];
  trace.push(newReasoningStep("analyze", `Planning execution for brief: industries=[${brief.industries.join(",")}], kpi=${brief.kpi}@${brief.kpi_target}, ${coverage.length} agents in coverage.`));

  if (ctx.mode === "live") {
    const start = Date.now();
    const r = await llmCall(ctx, {
      system: SYSTEM_PROMPT_PLANNER,
      messages: [{
        role: "user",
        content: `Brief:\n${JSON.stringify(brief, null, 2)}\n\nAvailable agents (only these tools are callable):\n${JSON.stringify(coverage, null, 2)}\n\nProduce a plan.`,
      }],
      json_schema_hint: PLAN_SCHEMA_HINT,
      max_tokens: 2000,
    });
    if (r.ok && r.json) {
      const j = r.json as { steps?: Array<Partial<PlanStep>>; confidence?: number; estimated_duration_ms?: number };
      const steps: PlanStep[] = (j.steps ?? []).map((s, i) => ({
        step_id: "ps_" + Math.random().toString(36).slice(2, 8),
        index: i + 1,
        tool: s.tool ?? "unknown",
        agents: Array.isArray(s.agents) ? s.agents : [],
        rationale: s.rationale ?? "",
        args_template: typeof s.args_template === "object" && s.args_template !== null ? s.args_template : {},
        downstream_uses: Array.isArray(s.downstream_uses) ? s.downstream_uses : [],
        optional: s.optional === true,
      }));
      trace.push(newReasoningStep("decide", `Claude planned ${steps.length} step(s) in ${r.latency_ms}ms with confidence ${j.confidence ?? "?"}.`, { tools: steps.map((s) => s.tool) }, r.latency_ms));
      trace.push(newReasoningStep("complete", `Plan ready: ${steps.map((s) => s.tool).join(" → ")}.`, undefined, Date.now() - start));
      return {
        plan_id: "pl_" + Math.random().toString(36).slice(2, 10),
        brief,
        steps,
        estimated_duration_ms: typeof j.estimated_duration_ms === "number" ? j.estimated_duration_ms : steps.length * 1500,
        confidence: typeof j.confidence === "number" ? j.confidence : 0.75,
        source: "live_llm",
        trace,
      };
    }
    trace.push(newReasoningStep("recover", `Live planner failed (${r.error || "unknown"}); falling back to template plan.`));
  } else {
    trace.push(newReasoningStep("plan", "No live LLM; using deterministic 5-stage template plan filtered by coverage."));
  }

  // Template plan
  const steps = defaultPlanForBrief(brief, coverage);
  trace.push(newReasoningStep("decide", `Template plan: ${steps.length} steps. Skipped tools with 0 capable agents.`, { sequence: steps.map((s) => s.tool) }));
  trace.push(newReasoningStep("complete", `Plan ready: ${steps.map((s) => s.tool).join(" → ")}.`));

  return {
    plan_id: "pl_" + Math.random().toString(36).slice(2, 10),
    brief,
    steps,
    estimated_duration_ms: steps.length * 1500,
    confidence: 0.85,
    source: "template",
    trace,
  };
}
