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
            const args = JSON.parse(JSON.stringify(step.args_template)) as Record<string, unknown>;
            // Resolve filter signal/format placeholders.
            if (args.filters && typeof args.filters === "object") {
              const f = args.filters as Record<string, unknown>;
              if (f.signals === "${chosen_signal_ids}") f.signals = choices.signals;
              if (f.format_ids === "${chosen_format_ids}") f.format_ids = choices.formats;
            }
            const start = Date.now();
            const r = await callAgentTool(a.mcp_url!, step.tool, args, { timeoutMs: 12_000 });
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
  const ctx = makeAgenticContext(env);
  const expanded = await expandBrief(ctx, body.input.trim());
  const coverage = await buildCoverage(env);
  const plan = await planExecution(ctx, expanded, coverage);
  const memory = await recallSimilar(env, expanded);
  const compliance = checkAndRemediate(expanded);

  // Compose a short prose summary for the chat surface.
  const summaryParts: string[] = [];
  summaryParts.push(`Brief expanded: brand="${expanded.brand_name ?? "(unknown)"}", industries=[${expanded.industries.slice(0, 3).join(", ")}], KPI=${expanded.kpi}@${expanded.kpi_target ?? "?"}.`);
  summaryParts.push(`Plan: ${plan.steps.length} step(s) — ${plan.steps.map((s) => s.tool).join(" → ")}.`);
  summaryParts.push(`Governance preview: ${compliance.advisory.outcome.toUpperCase()}${compliance.advisory.restricted_attributes.length > 0 ? ` (block on ${compliance.advisory.restricted_attributes.join(", ")})` : ""}.`);
  if (memory.matches.length > 0) summaryParts.push(`Memory: ${memory.hint}`);
  summaryParts.push(`Mode: ${ctx.mode}.`);
  const summary = summaryParts.join(" ");

  // Combine traces for client.
  const trace: ReasoningStep[] = [...expanded.trace, ...plan.trace, ...compliance.trace];

  return jsonResponse({
    mode: ctx.mode,
    summary,
    expanded,
    plan,
    memory,
    compliance,
    trace,
  });
}
