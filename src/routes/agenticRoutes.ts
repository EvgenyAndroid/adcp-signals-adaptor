// src/routes/agenticRoutes.ts
//
// Agentic Canvas endpoints:
//
//   POST /agentic/brief/expand          — natural-language → structured brief
//   POST /agentic/plan                  — given brief + coverage → tool plan
//   POST /agentic/execute               — execute a plan with reasoning trace
//                                         (returns NDJSON stream)
//   POST /agentic/explain               — explain a past decision in prose
//   POST /agentic/chat                  — unified chat: expand + plan + execute
//   POST /agentic/recover               — suggest retry strategy for a failed call
//   POST /agentic/remediate             — suggest signal-swap / attestation fixes
//                                         given a governance BLOCK
//   GET  /agentic/memory/recall?brief=... — recall similar past workflows
//
// All endpoints are unauth (same posture as the other Canvas routes).
// Live LLM mode requires ANTHROPIC_API_KEY in env; otherwise template
// mode kicks in automatically.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse } from "./shared";
import { makeAgenticContext, type ReasoningStep, llmCall, newReasoningStep } from "../domain/agenticCore";
import { expandBrief, type ExpandedBrief } from "../domain/agenticBrief";
import { planExecution, type AgentCoverage, type ExecutionPlan } from "../domain/agenticPlanner";
import { recallSimilar, suggestRecovery, suggestRemediations, checkAndRemediate, rememberWorkflow } from "../domain/agenticHelpers";
import { sanitizeArgsForVendor } from "../domain/agenticArgsSanitizer";
import { AGENT_REGISTRY } from "../domain/agentRegistry";
import { probeAgent, callAgentTool } from "../federation/genericMcpClient";
import { ensureSelfHooksInstalled } from "./agentsEndpoints";
import { predictGovernance, type GovernanceAdvisory } from "../domain/governanceMock";
import { POLICIES } from "../domain/policyRegistry";
import { getDemoProviderAttestations } from "../domain/workflowOrchestration";

// ── Coverage helper ─────────────────────────────────────────────────────────
//
// The planner needs a list of agents + their tools. We build it from
// a fresh probe (cached against the same KV key as /dsp/agents/coverage).

const COVERAGE_KEY = "dsp_coverage:v1";

async function buildCoverage(env: Env): Promise<AgentCoverage[]> {
  // Check KV first.
  try {
    const cached = await env.SIGNALS_CACHE.get(COVERAGE_KEY, "json") as { agents?: Array<{ agent_id: string; agent_name: string; vendor: string; tools_supported: string[] }> } | null;
    if (cached && Array.isArray(cached.agents)) {
      return cached.agents.map((c) => {
        const meta = AGENT_REGISTRY.find((a) => a.id === c.agent_id);
        return {
          agent_id: c.agent_id,
          agent_name: c.agent_name,
          vendor: c.vendor,
          role: (meta?.role ?? "unclassified") as AgentCoverage["role"],
          tools_supported: c.tools_supported,
        };
      });
    }
  } catch { /* fall through */ }
  // Fresh probe (signals + creative + buying).
  const live = AGENT_REGISTRY.filter((a) => a.stage === "live" && a.mcp_url);
  const probes = await Promise.all(live.map(async (a) => {
    const p = await probeAgent(a.mcp_url!, { timeoutMs: 6000 });
    return { agent: a, tools: (p.tools || []).map((t) => t.name) };
  }));
  return probes.map(({ agent, tools }) => ({
    agent_id: agent.id,
    agent_name: agent.name,
    vendor: agent.vendor,
    role: agent.role as AgentCoverage["role"],
    tools_supported: tools,
  }));
}

// ── POST /agentic/brief/expand ─────────────────────────────────────────────

interface ExpandBody { input?: string }

export async function handleAgenticExpand(request: Request, env: Env, logger: Logger): Promise<Response> {
  void logger;
  let body: ExpandBody = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (!body.input || body.input.trim().length === 0) {
    return errorResponse("INVALID_INPUT", "input (string) required", 400);
  }
  if (body.input.length > 1000) return errorResponse("INVALID_INPUT", "input max 1000 chars", 400);

  const ctx = makeAgenticContext(env);
  const expanded = await expandBrief(ctx, body.input.trim());
  return jsonResponse({ mode: ctx.mode, expanded });
}

// ── POST /agentic/plan ─────────────────────────────────────────────────────

interface PlanBody { brief?: ExpandedBrief; coverage_override?: AgentCoverage[] }

export async function handleAgenticPlan(request: Request, env: Env, logger: Logger): Promise<Response> {
  void logger;
  let body: PlanBody = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (!body.brief || !Array.isArray(body.brief.industries)) {
    return errorResponse("INVALID_INPUT", "brief (ExpandedBrief) required", 400);
  }
  const ctx = makeAgenticContext(env);
  const coverage = body.coverage_override ?? (await buildCoverage(env));
  const plan = await planExecution(ctx, body.brief, coverage);
  return jsonResponse({ mode: ctx.mode, plan, coverage_size: coverage.length });
}

// ── POST /agentic/execute ──────────────────────────────────────────────────
//
// Streams reasoning steps as NDJSON. Each line is a JSON object with
// `kind` field describing the event type. The Canvas client reads
// these one at a time and renders them in the trace pane.

export async function handleAgenticExecute(request: Request, env: Env, logger: Logger): Promise<Response> {
  ensureSelfHooksInstalled(env, logger);
  let body: { plan?: ExecutionPlan } = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (!body.plan || !Array.isArray(body.plan.steps)) {
    return errorResponse("INVALID_INPUT", "plan (ExecutionPlan) required", 400);
  }
  const plan = body.plan;
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        emit({ event: "execution_start", plan_id: plan.plan_id, step_count: plan.steps.length, ts: new Date().toISOString() });

        // Emit prior trace from planning stage.
        for (const t of plan.trace || []) emit({ event: "reasoning", step: t });

        const stepResults: Array<{ index: number; tool: string; ok: boolean; agent_results: unknown[] }> = [];
        const choices: { signals: string[]; formats: string[]; products: Record<string, string> } = { signals: [], formats: [], products: {} };

        for (const step of plan.steps) {
          emit({ event: "reasoning", step: newReasoningStep("plan", `Step ${step.index}/${plan.steps.length}: ${step.tool} → ${step.agents.join(", ")}. ${step.rationale}`) });

          if (step.tool === "check_governance" || step.tool === "check_brand_rights") {
            // Local-only mock — no agent call.
            const indLower = (plan.brief.industries || []).map((s) => s.toLowerCase());
            const applicable = POLICIES.filter((p) => p.industries_inferred.includes("all") || p.industries_inferred.some((i) => indLower.includes(i.toLowerCase())));
            const advisory = predictGovernance(applicable, getDemoProviderAttestations());
            emit({ event: "tool_complete", step_id: step.step_id, tool: step.tool, ok: true, latency_ms: 5, result: advisory, agent_results: [] });
            emit({ event: "reasoning", step: newReasoningStep("observe", `${step.tool}: outcome=${advisory.outcome}, ${advisory.restricted_attributes.length} block, ${advisory.advisories.filter((a) => a.outcome === "warn").length} warn`) });
            stepResults.push({ index: step.index, tool: step.tool, ok: true, agent_results: [advisory] });
            continue;
          }

          // Real fan-out
          const targets = step.agents.map((id) => AGENT_REGISTRY.find((a) => a.id === id)).filter((a): a is typeof AGENT_REGISTRY[number] => !!a && !!a.mcp_url);
          if (targets.length === 0) {
            emit({ event: "reasoning", step: newReasoningStep("recover", `Step ${step.index} has no callable targets — skipping (optional=${step.optional}).`) });
            continue;
          }
          const results = await Promise.all(targets.map(async (a) => {
            // Build args from template; resolve "${chosen_*}" interpolations.
            const rawArgs = JSON.parse(JSON.stringify(step.args_template)) as Record<string, unknown>;
            // Resolve filter signal/format placeholders.
            if (rawArgs.filters && typeof rawArgs.filters === "object") {
              const f = rawArgs.filters as Record<string, unknown>;
              if (f.signals === "${chosen_signal_ids}") f.signals = choices.signals;
              if (f.format_ids === "${chosen_format_ids}") f.format_ids = choices.formats;
            }
            // Sanitize: strip unknown fields per the per-tool allowlist
            // and backfill required fields from the brief. Protects against
            // LLM-hallucinated args like `brand` on list_creative_formats
            // (rejected by Adzymic + Advertible) and missing signal_spec
            // on get_signals (rejected by Dstillery). See agenticArgsSanitizer.
            const args = sanitizeArgsForVendor(step.tool, rawArgs, plan.brief);
            const start = Date.now();
            const r = await callAgentTool(a.mcp_url!, step.tool, args, { timeoutMs: 12_000, env });
            return { agent_id: a.id, agent_name: a.name, vendor: a.vendor, ok: r.ok, latency_ms: Date.now() - start, error: r.error, structured_content: r.structured_content, content: r.content };
          }));

          // Update choices from step results
          if (step.tool === "get_signals") {
            interface SigShape { signal_agent_segment_id?: string; id?: string; coverage_percentage?: number }
            const merged: Array<{ id: string; cov: number }> = [];
            for (const r of results) {
              if (!r.ok || !r.structured_content) continue;
              const sc = r.structured_content as { signals?: SigShape[] };
              for (const s of sc.signals || []) {
                const id = s.signal_agent_segment_id ?? s.id ?? "";
                if (id) merged.push({ id, cov: s.coverage_percentage ?? 0 });
              }
            }
            merged.sort((a, b) => b.cov - a.cov);
            const seen = new Set<string>();
            for (const m of merged) {
              if (seen.has(m.id)) continue;
              seen.add(m.id);
              choices.signals.push(m.id);
              if (choices.signals.length >= 3) break;
            }
            emit({ event: "reasoning", step: newReasoningStep("decide", `Picked top-${choices.signals.length} signals by coverage: [${choices.signals.join(", ")}].`) });
          } else if (step.tool === "list_creative_formats") {
            interface FormatShape { format_id?: string; id?: string }
            for (const r of results) {
              if (!r.ok || !r.structured_content) continue;
              const sc = r.structured_content as { formats?: FormatShape[] };
              for (const f of (sc.formats || []).slice(0, 2)) {
                const id = f.format_id ?? f.id;
                if (id && !choices.formats.includes(id)) choices.formats.push(id);
              }
            }
            emit({ event: "reasoning", step: newReasoningStep("decide", `Picked ${choices.formats.length} creative formats: [${choices.formats.slice(0, 3).join(", ")}].`) });
          } else if (step.tool === "get_products") {
            interface ProdShape { product_id?: string; id?: string }
            for (const r of results) {
              if (!r.ok || !r.structured_content) continue;
              const sc = r.structured_content as { products?: ProdShape[] };
              const top = (sc.products || [])[0];
              if (top) {
                const id = top.product_id ?? top.id;
                if (id) choices.products[r.agent_id] = id;
              }
            }
            emit({ event: "reasoning", step: newReasoningStep("decide", `Picked one product per agent: ${Object.keys(choices.products).length} agent(s) returned products.`) });
          } else if (step.tool === "create_media_buy") {
            const okCount = results.filter((r) => r.ok).length;
            const authCount = results.filter((r) => !r.ok && /principal id not found|authentication required|auth_token_invalid|unauthorized|\b401\b|tenant policy/i.test(JSON.stringify(r.content || "") + (r.error || ""))).length;
            emit({ event: "reasoning", step: newReasoningStep("observe", `create_media_buy: ${okCount}/${results.length} OK, ${authCount} auth-gated. Workshop punchline visible inline.`) });
          }

          for (const r of results) {
            const status = r.ok ? "ok" : "error";
            emit({ event: "agent_result", step_id: step.step_id, tool: step.tool, agent_id: r.agent_id, status, latency_ms: r.latency_ms, error: r.error });
          }
          emit({ event: "tool_complete", step_id: step.step_id, tool: step.tool, ok: results.some((r) => r.ok), latency_ms: Math.max(...results.map((r) => r.latency_ms), 0), agent_results: results });
          stepResults.push({ index: step.index, tool: step.tool, ok: results.some((r) => r.ok), agent_results: results });
        }

        emit({ event: "reasoning", step: newReasoningStep("complete", `Plan executed: ${stepResults.filter((s) => s.ok).length}/${stepResults.length} steps successful. Final picks: ${choices.signals.length} signals, ${choices.formats.length} formats, ${Object.keys(choices.products).length} product(s).`) });

        // Streaming trace event — agentic execute compiles the
        // reasoning trace into the universal TraceData shape so the
        // panel can render the same way it does for sync endpoints.
        const stepCount = stepResults.length;
        const okCount = stepResults.filter((s) => s.ok).length;
        emit({
          event: "trace",
          trace: {
            operation: "Agentic Canvas · execute plan",
            input: plan.brief.input,
            duration_ms: 0, // executor doesn't track t0; per-step latencies cover it
            steps: stepResults.map((s, i) => {
              const agentResults = (s.agent_results || []) as Array<{ agent_id?: string; agent_name?: string; ok?: boolean; latency_ms?: number; error?: string }>;
              const latencies = agentResults.map((r) => Number(r.latency_ms) || 0);
              return {
                id: "step_" + i,
                label: "Step " + s.index + ": " + s.tool,
                duration_ms: latencies.length > 0 ? Math.max(...latencies) : 0,
                details: [
                  { k: "tool", v: s.tool },
                  { k: "ok", v: s.ok ? "yes" : "no" },
                  { k: "agents_called", v: String(agentResults.length) },
                  { k: "agents_succeeded", v: String(agentResults.filter((r) => r.ok).length) },
                ],
                matches: agentResults.map((r) => ({
                  id: r.agent_id ?? "?",
                  label: (r.agent_name ?? r.agent_id ?? "?") + " · " + (r.ok ? "ok" : "fail") + " · " + (r.latency_ms || 0) + "ms",
                  score: Number(r.latency_ms) || 0,
                  meta: r.ok ? "succeeded" : "error: " + (r.error ?? "?"),
                })),
              };
            }),
            performance: {
              total_steps: stepCount,
              succeeded: okCount,
              failed: stepCount - okCount,
            },
            ts: new Date().toISOString(),
          },
        });
        emit({ event: "execution_complete", plan_id: plan.plan_id, choices, step_results: stepResults, ts: new Date().toISOString() });

        // Persist memory.
        const memId = "mem_" + Math.random().toString(36).slice(2, 10);
        await rememberWorkflow(env, {
          memory_id: memId,
          ran_at: new Date().toISOString(),
          brief_input: plan.brief.input,
          brief_industries: plan.brief.industries,
          brief_kpi: plan.brief.kpi,
          outcome: stepResults.every((s) => s.ok) ? "success" : stepResults.some((s) => s.ok) ? "partial" : "failed",
          chosen_signals: choices.signals,
          chosen_formats: choices.formats,
          notable_findings: stepResults.flatMap((s) => s.tool === "create_media_buy" && !s.ok ? ["create_media_buy auth-gated"] : []),
        });
      } catch (e) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ event: "error", error: String((e as Error).message || e) }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}

// ── POST /agentic/explain ──────────────────────────────────────────────────
//
// Explain a decision in prose. Live mode = LLM call. Template mode =
// pretty-format the supplied data into a sentence.

interface ExplainBody {
  /** What to explain — e.g. "signal_pick", "governance_outcome", "fire_buy_result". */
  topic: string;
  /** Structured payload describing what was decided. */
  decision: unknown;
  /** Optional brief for context. */
  brief?: ExpandedBrief;
}

export async function handleAgenticExplain(request: Request, env: Env, logger: Logger): Promise<Response> {
  void logger;
  let body: ExplainBody = { topic: "", decision: null };
  try { body = await request.json(); } catch { /* empty */ }
  if (!body.topic) return errorResponse("INVALID_INPUT", "topic required", 400);
  const ctx = makeAgenticContext(env);

  if (ctx.mode === "live") {
    const r = await llmCall(ctx, {
      system: "You are an AdCP orchestrator explaining a decision in plain language. Be concise (2-4 sentences). Cite the data. Focus on WHY, not just WHAT.",
      messages: [{ role: "user", content: `Explain this ${body.topic} decision:\n\n${JSON.stringify(body.decision, null, 2)}\n\n${body.brief ? "Context brief:\n" + JSON.stringify(body.brief, null, 2) : ""}` }],
      max_tokens: 400,
    });
    if (r.ok) return jsonResponse({ mode: "live", explanation: r.text, model: r.model, latency_ms: r.latency_ms });
  }

  // Template explainers
  let explanation = "Decision details:";
  switch (body.topic) {
    case "signal_pick": {
      const d = body.decision as { signal_id?: string; coverage_percentage?: number; source_agent_id?: string; rank?: number };
      explanation = `Picked signal **${d.signal_id ?? "?"}** at rank ${d.rank ?? "?"} because its coverage_percentage of ${d.coverage_percentage ?? "?"}% topped the merged ranking from ${d.source_agent_id ?? "?"}. Tie-break is appearance order across agents.`;
      break;
    }
    case "governance_outcome": {
      const d = body.decision as GovernanceAdvisory;
      explanation = `Governance preview: **${d.outcome.toUpperCase()}**. ${d.restricted_attributes.length === 0 ? "No must-policies are unmet." : `Unmet must-policies: ${d.restricted_attributes.join(", ")}.`} ${d.advisories.length} applicable polic${d.advisories.length === 1 ? "y" : "ies"} evaluated against the signal's attestation set.`;
      break;
    }
    case "fire_buy_result": {
      const d = body.decision as { ok?: boolean; auth_gated?: boolean; agent_id?: string; error?: string };
      if (d.ok) explanation = `Fire succeeded on **${d.agent_id ?? "?"}**. Real media-buy created.`;
      else if (d.auth_gated) explanation = `**Auth-gated** on ${d.agent_id ?? "?"} — payload shape passed validation, vendor requires credentials we don't carry. This is the canonical Sec-48 finding: the buy-side has the surface but no shared auth posture in 3.0 GA.`;
      else explanation = `Fire failed on ${d.agent_id ?? "?"}: ${(d.error || "no error body").slice(0, 200)}.`;
      break;
    }
    default:
      explanation = `Topic "${body.topic}" not in template library. Decision payload: ${JSON.stringify(body.decision).slice(0, 300)}.`;
  }

  return jsonResponse({ mode: "template", explanation, topic: body.topic });
}

// ── POST /agentic/recover ──────────────────────────────────────────────────

interface RecoverBody { failed_tool?: string; error_text?: string; alternate_agents?: string[] }

export async function handleAgenticRecover(request: Request, env: Env, _logger: Logger): Promise<Response> {
  void env;
  let body: RecoverBody = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (!body.failed_tool || !body.error_text) {
    return errorResponse("INVALID_INPUT", "failed_tool and error_text required", 400);
  }
  const strategy = suggestRecovery(body.failed_tool, body.error_text, Array.isArray(body.alternate_agents) ? body.alternate_agents : []);
  return jsonResponse({ failed_tool: body.failed_tool, strategy });
}

// ── POST /agentic/remediate ────────────────────────────────────────────────

interface RemediateBody { brief?: ExpandedBrief }

export async function handleAgenticRemediate(request: Request, env: Env, _logger: Logger): Promise<Response> {
  void env;
  let body: RemediateBody = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (!body.brief) return errorResponse("INVALID_INPUT", "brief required", 400);
  const out = checkAndRemediate(body.brief);
  return jsonResponse({ advisory: out.advisory, remediations: out.remediations, trace: out.trace });
}

// ── POST /agentic/refine ───────────────────────────────────────────────────
//
// Wave 3 — multi-turn conversational refinement.
//
// Caller provides the previous ExpandedBrief + ExecutionPlan + a free-text
// instruction ("actually exclude alcohol", "shorten flight to 14 days",
// "increase budget to $200K", "skip Adzymic"). We re-expand the brief
// taking the instruction into account, then re-plan against the current
// coverage. Returns the diff so the client can highlight what changed.

interface RefineBody {
  previous_brief?: ExpandedBrief;
  previous_plan?: ExecutionPlan;
  instruction?: string;
}

export async function handleAgenticRefine(request: Request, env: Env, logger: Logger): Promise<Response> {
  void logger;
  let body: RefineBody = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (!body.previous_brief || !body.instruction || body.instruction.trim().length === 0) {
    return errorResponse("INVALID_INPUT", "previous_brief and instruction required", 400);
  }
  if (body.instruction.length > 500) {
    return errorResponse("INVALID_INPUT", "instruction max 500 chars", 400);
  }
  const ctx = makeAgenticContext(env);

  // Synthesize a new input by combining the old brief input with the
  // refinement instruction. The expander's LLM path treats this as a
  // fresh expansion; the template path falls back to its rules.
  const composed = `${body.previous_brief.input} — refinement: ${body.instruction}`;
  const refined = await expandBrief(ctx, composed);

  // Diff: industries / kpi / budget / geo / flight that changed.
  const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
  const fields = ["brand_name", "kpi", "kpi_target", "budget_usd_estimate", "flight_days", "dayparting_hint"] as const;
  for (const f of fields) {
    const a = body.previous_brief[f];
    const b = refined[f];
    if (a !== b) changes.push({ field: f, before: a, after: b });
  }
  // Industries: detect added/removed
  const prevInd = new Set((body.previous_brief.industries || []).map((s) => s.toLowerCase()));
  const newInd = new Set((refined.industries || []).map((s) => s.toLowerCase()));
  const addedInd = [...newInd].filter((i) => !prevInd.has(i));
  const removedInd = [...prevInd].filter((i) => !newInd.has(i));
  if (addedInd.length > 0) changes.push({ field: "industries.added", before: null, after: addedInd });
  if (removedInd.length > 0) changes.push({ field: "industries.removed", before: removedInd, after: null });

  // Re-plan against the (refined) brief.
  const coverage = await buildCoverage(env);
  const plan = await planExecution(ctx, refined, coverage);

  // Plan-step diff: what tools changed, what agents changed.
  const prevTools = new Set((body.previous_plan?.steps ?? []).map((s) => s.tool));
  const newTools = new Set(plan.steps.map((s) => s.tool));
  const planChanges: Array<{ kind: string; detail: string }> = [];
  for (const t of newTools) if (!prevTools.has(t)) planChanges.push({ kind: "tool_added", detail: t });
  for (const t of prevTools) if (!newTools.has(t)) planChanges.push({ kind: "tool_removed", detail: t });

  return jsonResponse({
    mode: ctx.mode,
    instruction: body.instruction.trim(),
    refined,
    plan,
    changes,
    plan_changes: planChanges,
    summary: changes.length === 0 && planChanges.length === 0
      ? "No structural changes — the refinement nudged language only."
      : `${changes.length} brief field(s) changed${planChanges.length ? `; ${planChanges.length} plan step(s) changed.` : "."}`,
  });
}

// ── POST /agentic/critique ─────────────────────────────────────────────────
//
// Wave 3 — self-critique. Before execution, ask the agent to review its
// own plan. Live mode = LLM critique (Claude inspects the plan + brief
// for inconsistencies, missing steps, or risky assumptions). Template
// mode = rule-based heuristics (e.g. "plan has create_media_buy but
// no governance gate; flag", "BRAND_LIFT KPI without viewability_floor;
// flag").

interface CritiqueBody {
  brief?: ExpandedBrief;
  plan?: ExecutionPlan;
}

export interface CritiqueIssue {
  severity: "info" | "warn" | "block";
  category: "missing_step" | "risky_assumption" | "kpi_mismatch" | "compliance_gap" | "vendor_concern" | "other";
  message: string;
  suggested_fix?: string;
}

export interface CritiqueResult {
  mode: "live" | "template";
  issues: CritiqueIssue[];
  overall: "looks_good" | "minor_issues" | "needs_revision" | "block";
  summary: string;
  /** Confidence of the critique 0-1. */
  confidence: number;
}

const CRITIQUE_SYSTEM = `You are a senior media-buying strategist reviewing a colleague's execution plan before they fire it. Your job is to flag issues — missing steps, risky assumptions, KPI mismatches, compliance gaps, vendor concerns — in a constructive, terse way. Each issue: severity (info/warn/block), category, message (1 sentence), suggested_fix (optional, 1 sentence). Don't pad; only flag real concerns. Bias toward action — every issue should have a fix the operator can apply.`;

const CRITIQUE_SCHEMA_HINT = `{
  "issues": [
    {
      "severity": "info" | "warn" | "block",
      "category": "missing_step" | "risky_assumption" | "kpi_mismatch" | "compliance_gap" | "vendor_concern" | "other",
      "message": string,
      "suggested_fix": string | null
    }
  ],
  "overall": "looks_good" | "minor_issues" | "needs_revision" | "block",
  "confidence": number
}`;

function templateCritique(brief: ExpandedBrief, plan: ExecutionPlan): CritiqueResult {
  const issues: CritiqueIssue[] = [];
  const tools = new Set(plan.steps.map((s) => s.tool));

  // Heuristic 1: BRAND_LIFT campaign with no viewability hint
  if (brief.kpi === "BRAND_LIFT" && !brief.dayparting_hint) {
    issues.push({
      severity: "info",
      category: "kpi_mismatch",
      message: "BRAND_LIFT KPI without dayparting hint — typical brand-lift campaigns over-index on peak hours for memorability.",
      suggested_fix: "Add dayparting_hint='peak_evening' to the brief for awareness goals.",
    });
  }
  // Heuristic 2: media_buy without governance gate
  if (tools.has("create_media_buy") && !tools.has("check_governance")) {
    issues.push({
      severity: "warn",
      category: "missing_step",
      message: "Plan fires create_media_buy without an explicit governance gate — predictive check is silent.",
      suggested_fix: "Add a check_governance step before media-buy. (Self-mock available; no live vendor needed.)",
    });
  }
  // Heuristic 3: industries-imply-policy but no gate (alcohol/pharma/gambling/tobacco/cannabis/political)
  const REGULATED = ["alcohol", "tobacco", "cannabis", "gambling", "pharma", "political", "ai_generated_content"];
  const hasRegulated = (brief.industries || []).some((i) => REGULATED.some((r) => i.toLowerCase().includes(r)));
  if (hasRegulated && !tools.has("check_governance")) {
    issues.push({
      severity: "block",
      category: "compliance_gap",
      message: `Brand industries include regulated category (${brief.industries.find((i) => REGULATED.some((r) => i.toLowerCase().includes(r)))}); plan does NOT include check_governance.`,
      suggested_fix: "Add check_governance and check_brand_rights before create_media_buy. Don't fire on regulated brands without.",
    });
  }
  // Heuristic 4: plan length sanity
  if (plan.steps.length === 0) {
    issues.push({
      severity: "block",
      category: "other",
      message: "Plan is empty — no steps to execute.",
      suggested_fix: "Re-run brief expansion + planning.",
    });
  }
  // Heuristic 5: budget sanity
  if (brief.budget_usd_estimate !== undefined && brief.budget_usd_estimate < 1000) {
    issues.push({
      severity: "warn",
      category: "risky_assumption",
      message: `Budget estimate is very low ($${brief.budget_usd_estimate}). Most buying agents impose a minimum.`,
      suggested_fix: "Confirm budget with the operator; add a minimum-budget guard before fire.",
    });
  }

  let overall: CritiqueResult["overall"];
  if (issues.some((i) => i.severity === "block")) overall = "block";
  else if (issues.filter((i) => i.severity === "warn").length >= 2) overall = "needs_revision";
  else if (issues.length > 0) overall = "minor_issues";
  else overall = "looks_good";

  const summary = issues.length === 0
    ? "Template critique: no concerns flagged. Plan looks ready to execute."
    : `Template critique flagged ${issues.length} issue(s): ${issues.filter((i) => i.severity === "block").length} block · ${issues.filter((i) => i.severity === "warn").length} warn · ${issues.filter((i) => i.severity === "info").length} info.`;

  return { mode: "template", issues, overall, summary, confidence: 0.85 };
}

export async function handleAgenticCritique(request: Request, env: Env, _logger: Logger): Promise<Response> {
  let body: CritiqueBody = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (!body.brief || !body.plan) return errorResponse("INVALID_INPUT", "brief and plan required", 400);
  const ctx = makeAgenticContext(env);

  if (ctx.mode === "live") {
    const r = await llmCall(ctx, {
      system: CRITIQUE_SYSTEM,
      messages: [{
        role: "user",
        content: `Brief:\n${JSON.stringify(body.brief, null, 2)}\n\nPlan:\n${JSON.stringify(body.plan, null, 2)}\n\nProvide a critique. Be terse and actionable — only flag real concerns.`,
      }],
      json_schema_hint: CRITIQUE_SCHEMA_HINT,
      max_tokens: 1500,
    });
    if (r.ok && r.json) {
      const j = r.json as Partial<CritiqueResult>;
      const issues = Array.isArray(j.issues) ? j.issues : [];
      const out: CritiqueResult = {
        mode: "live",
        issues: issues as CritiqueIssue[],
        overall: (j.overall as CritiqueResult["overall"]) || "looks_good",
        summary: `Claude critique: ${issues.length} issue(s) flagged. Latency ${r.latency_ms}ms.`,
        confidence: typeof j.confidence === "number" ? j.confidence : 0.8,
      };
      return jsonResponse(out);
    }
  }

  // Template fallback (also runs if live mode fails).
  return jsonResponse(templateCritique(body.brief, body.plan));
}

// ── POST /agentic/memory/correction ────────────────────────────────────────
//
// Wave 3 — few-shot learning from corrections.
//
// When the operator overrides governance / rejects a signal pick / swaps
// a product, log the correction to the agentic memory ring buffer so
// future similar briefs surface the prior decision. The correction is
// keyed on the brief that triggered it; recall semantics use the same
// industry-overlap match as the existing memory recall.

interface CorrectionBody {
  brief?: ExpandedBrief;
  correction?: {
    kind: "override_governance" | "reject_signal" | "swap_product" | "add_attestation" | "other";
    before: unknown;
    after: unknown;
    note?: string;
  };
}

export async function handleAgenticCorrection(request: Request, env: Env, _logger: Logger): Promise<Response> {
  let body: CorrectionBody = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (!body.brief || !body.correction || !body.correction.kind) {
    return errorResponse("INVALID_INPUT", "brief and correction.kind required", 400);
  }

  // Memory entry mirrors the workflow-history pattern; corrections live
  // in a parallel ring buffer keyed by industries × kpi.
  const id = "corr_" + Math.random().toString(36).slice(2, 10);
  const entry = {
    correction_id: id,
    ts: new Date().toISOString(),
    brief_input: body.brief.input,
    brief_industries: body.brief.industries,
    brief_kpi: body.brief.kpi,
    kind: body.correction.kind,
    before: body.correction.before,
    after: body.correction.after,
    ...(body.correction.note ? { note: body.correction.note } : {}),
  };

  const indexKey = "agentic_corrections_index:v1";
  try {
    const existing = await env.SIGNALS_CACHE.get(indexKey, "json");
    const list: Array<typeof entry> = Array.isArray(existing) ? (existing as Array<typeof entry>) : [];
    const updated = [entry, ...list].slice(0, 50);
    await env.SIGNALS_CACHE.put(indexKey, JSON.stringify(updated), { expirationTtl: 60 * 60 * 24 * 30 });
  } catch (e) {
    return errorResponse("KV_ERROR", "failed to persist correction: " + String((e as Error).message || e), 500);
  }

  return jsonResponse({ correction_id: id, stored: true });
}

// ── GET /agentic/memory/corrections ────────────────────────────────────────
//
// Wave 3 — recall corrections relevant to a brief. Same scoring as
// recallSimilar (industry-overlap × kpi-match). The Agentic Canvas
// surfaces matching corrections in the memory panel as "you previously
// did X for similar brands" hints.

export async function handleAgenticCorrectionsRecall(request: Request, env: Env, _logger: Logger): Promise<Response> {
  const url = new URL(request.url);
  const industriesStr = url.searchParams.get("industries") || "";
  const kpi = url.searchParams.get("kpi") || "ROAS";
  const indLower = industriesStr.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

  let list: Array<{ correction_id: string; ts: string; brief_industries: string[]; brief_kpi: string; brief_input: string; kind: string; before: unknown; after: unknown; note?: string }> = [];
  try {
    const raw = await env.SIGNALS_CACHE.get("agentic_corrections_index:v1", "json");
    if (Array.isArray(raw)) list = raw as typeof list;
  } catch { /* empty */ }

  const scored = list.map((c) => {
    const overlap = c.brief_industries.filter((i) => indLower.includes(i.toLowerCase())).length;
    const kpiMatch = c.brief_kpi === kpi ? 1 : 0;
    return { c, score: overlap * 2 + kpiMatch };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);

  return jsonResponse({
    matches: scored.map((s) => s.c),
    count: scored.length,
    hint: scored.length === 0 ? "No matching corrections in memory." : `Found ${scored.length} matching correction(s) from prior runs.`,
  });
}

// ── GET /agentic/memory/recall ─────────────────────────────────────────────

export async function handleAgenticMemoryRecall(request: Request, env: Env, _logger: Logger): Promise<Response> {
  const url = new URL(request.url);
  const briefStr = url.searchParams.get("brief") || "";
  const industriesStr = url.searchParams.get("industries") || "";
  const kpi = url.searchParams.get("kpi") || "ROAS";
  if (!briefStr) return errorResponse("INVALID_INPUT", "brief query param required", 400);
  const brief: ExpandedBrief = {
    input: briefStr,
    industries: industriesStr.split(",").map((s) => s.trim()).filter(Boolean),
    audience_descriptors: [],
    kpi: kpi as ExpandedBrief["kpi"],
    geo: ["US"],
    confidence: 1.0,
    source: "template",
    trace: [],
  };
  const r = await recallSimilar(env, brief);
  return jsonResponse(r);
}

// ── POST /agentic/chat ─────────────────────────────────────────────────────
//
// Unified chat endpoint: input → expand → plan → return both. The
// caller can then POST the plan to /agentic/execute for streaming
// execution. We split expand and execute so the user can review the
// plan before it runs.

interface ChatBody { input?: string }

export async function handleAgenticChat(request: Request, env: Env, _logger: Logger): Promise<Response> {
  let body: ChatBody = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (!body.input || body.input.trim().length === 0) {
    return errorResponse("INVALID_INPUT", "input required", 400);
  }
  const input = body.input.trim();
  const ctx = makeAgenticContext(env);

  // Streaming NDJSON. Each stage emits a `stage_start` with a label so
  // the client can skeleton/pulse, then reasoning steps + the final
  // payload for that stage. This is what makes the Agentic Canvas FEEL
  // agentic: the user sees the agent walk through the plan instead of
  // a single "loading…" → fully-rendered jump.
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      try {
        emit({ event: "session_start", input, mode: ctx.mode, ts: new Date().toISOString() });

        // ── Stage 1: brief expansion ─────────────────────────────────────
        emit({ event: "stage_start", stage: "brief", label: ctx.mode === "live" ? "Asking Claude to decompose the brief…" : "Running rule-based brief extractor…" });
        const expanded = await expandBrief(ctx, input);
        for (const t of expanded.trace) emit({ event: "reasoning", step: t });
        emit({ event: "stage_complete", stage: "brief", payload: expanded });

        // ── Stage 2: live MCP coverage probe (parallel discovery) ───────
        emit({ event: "stage_start", stage: "coverage", label: "Probing live MCP agents to learn what tools are advertised…" });
        const coverage = await buildCoverage(env);
        emit({ event: "reasoning", step: newReasoningStep("observe", `Probed ${coverage.length} live agent(s) — ${coverage.reduce((s, a) => s + a.tools_supported.length, 0)} tool(s) total in coverage.`) });
        emit({ event: "stage_complete", stage: "coverage", payload: { count: coverage.length, agents: coverage } });

        // ── Stage 3: plan execution ─────────────────────────────────────
        emit({ event: "stage_start", stage: "plan", label: ctx.mode === "live" ? "Asking Claude to choose the call sequence…" : "Building 5-stage default plan filtered by coverage…" });
        const plan = await planExecution(ctx, expanded, coverage);
        for (const t of plan.trace) emit({ event: "reasoning", step: t });
        emit({ event: "stage_complete", stage: "plan", payload: plan });

        // ── Stage 4: governance preview ─────────────────────────────────
        emit({ event: "stage_start", stage: "governance", label: "Predictive check_governance against brand industries × signal attestations…" });
        const compliance = checkAndRemediate(expanded);
        for (const t of compliance.trace) emit({ event: "reasoning", step: t });
        emit({ event: "stage_complete", stage: "governance", payload: { advisory: compliance.advisory, remediations: compliance.remediations } });

        // ── Stage 5: memory recall ──────────────────────────────────────
        emit({ event: "stage_start", stage: "memory", label: "Recalling similar past workflows from KV…" });
        const memory = await recallSimilar(env, expanded);
        emit({ event: "reasoning", step: newReasoningStep("observe", memory.matches.length > 0 ? `${memory.matches.length} prior similar workflow(s) found.` : "No prior similar workflows in memory.") });
        emit({ event: "stage_complete", stage: "memory", payload: memory });

        // ── Final summary ──────────────────────────────────────────────
        const summaryParts: string[] = [];
        summaryParts.push(`Brief: brand="${expanded.brand_name ?? "(unknown)"}", industries=[${expanded.industries.slice(0, 3).join(", ")}], KPI=${expanded.kpi}@${expanded.kpi_target ?? "?"}.`);
        summaryParts.push(`Plan: ${plan.steps.length} step(s) — ${plan.steps.map((s) => s.tool).join(" → ")}.`);
        summaryParts.push(`Governance: ${compliance.advisory.outcome.toUpperCase()}${compliance.advisory.restricted_attributes.length > 0 ? ` (block on ${compliance.advisory.restricted_attributes.join(", ")})` : ""}.`);
        if (memory.matches.length > 0) summaryParts.push(`Memory: ${memory.hint}`);

        emit({ event: "reasoning", step: newReasoningStep("complete", summaryParts.join(" ")) });

        // Streaming trace — agentic chat compiles the 5 stages into a
        // single TraceData. Surface in the universal panel so the same
        // affordance covers every entry surface.
        emit({
          event: "trace",
          trace: {
            operation: "Agentic Canvas · chat · " + ctx.mode,
            input: input,
            duration_ms: 0,
            steps: [
              {
                id: "brief",
                label: "Stage 1 · brief expansion",
                details: [
                  { k: "mode", v: ctx.mode },
                  { k: "brand_name", v: expanded.brand_name ?? "(unknown)" },
                  { k: "industries", v: expanded.industries.slice(0, 5).join(", ") || "(none)" },
                  { k: "kpi", v: expanded.kpi },
                  { k: "kpi_target", v: expanded.kpi_target !== undefined ? String(expanded.kpi_target) : "—" },
                  { k: "geo", v: (expanded.geo || []).join(", ") },
                  { k: "confidence", v: expanded.confidence !== undefined ? String(expanded.confidence) : "—" },
                ],
                note: ctx.mode === "live" ? "Claude decomposed the brief into structured fields." : "Rule-based extractor (template fallback).",
              },
              {
                id: "coverage",
                label: "Stage 2 · live MCP coverage probe",
                details: [
                  { k: "agents_in_coverage", v: String(coverage.length) },
                  { k: "tools_total", v: String(coverage.reduce((s, a) => s + a.tools_supported.length, 0)) },
                ],
                note: "Each live agent's tools/list pulled in parallel; planner sees only callable tools.",
              },
              {
                id: "plan",
                label: "Stage 3 · execution plan",
                details: [
                  { k: "step_count", v: String(plan.steps.length) },
                  { k: "tools_in_order", v: plan.steps.map((s) => s.tool).join(" → ") },
                  { k: "source", v: plan.source },
                  { k: "confidence", v: String(plan.confidence) },
                ],
                matches: plan.steps.map((s, i) => ({
                  id: s.step_id,
                  label: (i + 1) + ". " + s.tool + " → " + s.agents.join(", "),
                  score: i + 1,
                  meta: s.rationale.slice(0, 140),
                })),
              },
              {
                id: "governance",
                label: "Stage 4 · governance preview",
                details: [
                  { k: "outcome", v: compliance.advisory.outcome.toUpperCase() },
                  { k: "blocks", v: compliance.advisory.restricted_attributes.join(", ") || "(none)" },
                  { k: "policies_evaluated", v: String((compliance.advisory.advisories || []).length) },
                  { k: "remediations", v: String((compliance.remediations || []).length) },
                ],
                note: "Predictive check_governance against brand industries × signal attestations. Mocked locally — no live vendor.",
              },
              {
                id: "memory",
                label: "Stage 5 · memory recall",
                details: [
                  { k: "matches_found", v: String(memory.matches.length) },
                  { k: "hint", v: memory.hint ?? "(none)" },
                ],
                note: "Industry-overlap × KPI-match scoring against past workflow history (KV ring buffer).",
              },
            ],
            performance: {},
            ts: new Date().toISOString(),
          },
        });

        emit({ event: "session_complete", mode: ctx.mode, ts: new Date().toISOString() });
      } catch (e) {
        emit({ event: "error", error: String((e as Error).message || e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
