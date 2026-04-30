// src/domain/agenticCore.ts
//
// Shared LLM-inference primitive for the Agentic Canvas. Two modes:
//
//   1. LIVE — uses Anthropic Messages API when ANTHROPIC_API_KEY is set
//      in env. Same pattern as src/domain/queryParser.ts (model
//      claude-sonnet-4-20250514).
//
//   2. TEMPLATE — rule-based fallback when no API key. Generates
//      structurally-identical reasoning traces from deterministic
//      templates filled with the actual data. Fast, free, suitable
//      for the workshop demo. v2 swaps to live by setting the key.
//
// Why both: the Canvas surface is identical regardless of mode. The
// "agentic" feel comes from streaming the trace, showing decisions
// with rationale, and chaining tool calls — all of which work without
// a live LLM. Live mode adds open-ended brief understanding + novel
// tool-sequence reasoning the templates can't anticipate.

import type { Env } from "../types/env";

export type AgenticMode = "live" | "template";

export interface AgenticContext {
  env: Env;
  mode: AgenticMode;
  /** True when ANTHROPIC_API_KEY is configured. Used to feature-gate
   *  live LLM calls; templates handle everything else. */
  hasLiveLlm: boolean;
  /** Caller-supplied request id for tracing. */
  request_id?: string;
}

export function makeAgenticContext(env: Env, request_id?: string): AgenticContext {
  const hasLiveLlm = typeof env.ANTHROPIC_API_KEY === "string" && env.ANTHROPIC_API_KEY.length > 10;
  return {
    env,
    mode: hasLiveLlm ? "live" : "template",
    hasLiveLlm,
    ...(request_id ? { request_id } : {}),
  };
}

// ── Live Anthropic call ─────────────────────────────────────────────────────

export interface LlmCallOptions {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  max_tokens?: number;
  /** When set, ask the model to return ONLY JSON matching this schema
   *  description (free-form text). We strip ``` fences post-response. */
  json_schema_hint?: string;
  /** Timeout in ms. Default 30s. */
  timeout_ms?: number;
}

export interface LlmCallResult {
  ok: boolean;
  text: string;
  /** Best-effort JSON parse when json_schema_hint set. */
  json?: unknown;
  model: string;
  latency_ms: number;
  error?: string;
}

export async function llmCall(ctx: AgenticContext, opts: LlmCallOptions): Promise<LlmCallResult> {
  if (!ctx.hasLiveLlm) {
    return {
      ok: false,
      text: "",
      model: "template",
      latency_ms: 0,
      error: "ANTHROPIC_API_KEY not configured — agentic templates only",
    };
  }
  const start = Date.now();
  const model = opts.model ?? "claude-sonnet-4-20250514";
  const maxTokens = opts.max_tokens ?? 1500;
  const timeoutMs = opts.timeout_ms ?? 30_000;
  const system = opts.system
    ? (opts.json_schema_hint
        ? opts.system + "\n\nReturn ONLY a JSON object matching this shape — no prose, no markdown:\n" + opts.json_schema_hint
        : opts.system)
    : opts.json_schema_hint
      ? "Return ONLY a JSON object matching this shape — no prose, no markdown:\n" + opts.json_schema_hint
      : "";

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: opts.messages,
  };
  if (system) body.system = system;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": ctx.env.ANTHROPIC_API_KEY!,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latency = Date.now() - start;
    if (!resp.ok) {
      const errText = await resp.text();
      return { ok: false, text: "", model, latency_ms: latency, error: "Claude API " + resp.status + ": " + errText.slice(0, 200) };
    }
    const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = (data.content ?? []).find((b) => b.type === "text")?.text ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    let json: unknown;
    if (opts.json_schema_hint) {
      try { json = JSON.parse(cleaned); } catch { /* return raw text only */ }
    }
    const result: LlmCallResult = {
      ok: true,
      text: cleaned,
      model,
      latency_ms: latency,
    };
    if (json !== undefined) result.json = json;
    return result;
  } catch (e) {
    return {
      ok: false,
      text: "",
      model,
      latency_ms: Date.now() - start,
      error: String((e as Error).message || e),
    };
  }
}

// ── Reasoning trace primitive ────────────────────────────────────────────────
//
// Every agentic decision emits a ReasoningStep. The Canvas streams
// these progressively (via SSE) so the user sees the agent thinking
// in real time. Template mode populates these from rule-based
// templates; live mode fills them from LLM responses.

export type ReasoningStepKind =
  | "analyze"      // observing the input
  | "plan"         // deciding the next step
  | "call"         // invoking a tool
  | "observe"      // recording a tool result
  | "decide"       // a non-tool decision (e.g. picking top-3)
  | "reflect"      // self-evaluation of partial results
  | "recover"      // retry/fallback after an error
  | "remediate"    // suggesting a fix (e.g. swap signal to unblock governance)
  | "complete";    // final summary

export interface ReasoningStep {
  step_id: string;
  ts: string;       // ISO
  kind: ReasoningStepKind;
  /** Plain-language sentence shown to the user. */
  message: string;
  /** Structured payload — varies by kind. */
  data?: unknown;
  /** Latency for this step (e.g. tool call duration). */
  latency_ms?: number;
}

export function newReasoningStep(
  kind: ReasoningStepKind,
  message: string,
  data?: unknown,
  latency_ms?: number,
): ReasoningStep {
  const step: ReasoningStep = {
    step_id: "rs_" + Math.random().toString(36).slice(2, 10),
    ts: new Date().toISOString(),
    kind,
    message,
  };
  if (data !== undefined) step.data = data;
  if (latency_ms !== undefined) step.latency_ms = latency_ms;
  return step;
}
