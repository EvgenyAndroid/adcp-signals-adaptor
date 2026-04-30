// src/domain/agenticHelpers.ts
//
// Three small agentic helpers, grouped because each is light:
//
//   1. agenticMemory  — KV-backed recall of past similar workflows
//   2. agenticRecovery — auto-retry strategy on tool failures
//   3. agenticRemediation — compliance suggestions (signal swaps to unblock)

import type { Env } from "../types/env";
import { type AgenticContext, type ReasoningStep, newReasoningStep } from "./agenticCore";
import type { ExpandedBrief } from "./agenticBrief";
import { POLICIES } from "./policyRegistry";
import { predictGovernance, type GovernanceAdvisory } from "./governanceMock";
import { getDemoProviderAttestations } from "./workflowOrchestration";

// ── 1. Memory ──────────────────────────────────────────────────────────────

const MEMORY_INDEX_KEY = "agentic_memory_index:v1";
const MEMORY_PREFIX = "agentic_memory:";
const MEMORY_TTL = 60 * 60 * 24 * 30;  // 30 days
const MEMORY_MAX = 50;

export interface MemoryEntry {
  memory_id: string;
  ran_at: string;
  brief_input: string;
  brief_industries: string[];
  brief_kpi: string;
  outcome: "success" | "partial" | "failed";
  chosen_signals: string[];
  chosen_formats: string[];
  notable_findings: string[];
}

export async function recallSimilar(env: Env, brief: ExpandedBrief): Promise<{ matches: MemoryEntry[]; hint: string }> {
  let idx: MemoryEntry[] = [];
  try {
    const raw = await env.SIGNALS_CACHE.get(MEMORY_INDEX_KEY, "json");
    if (Array.isArray(raw)) idx = raw as MemoryEntry[];
  } catch { /* empty */ }

  const briefIndsLower = brief.industries.map((s) => s.toLowerCase());
  const scored = idx.map((m) => {
    const overlap = m.brief_industries.filter((i) => briefIndsLower.includes(i.toLowerCase())).length;
    const kpiMatch = m.brief_kpi === brief.kpi ? 1 : 0;
    return { m, score: overlap * 2 + kpiMatch };
  }).filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const matches = scored.map((x) => x.m);
  const hint = matches.length === 0
    ? "No prior similar workflows in memory."
    : `Found ${matches.length} similar prior run(s). Top match: ${matches[0]!.brief_input.slice(0, 80)}…`;
  return { matches, hint };
}

export async function rememberWorkflow(env: Env, entry: MemoryEntry): Promise<void> {
  try {
    await env.SIGNALS_CACHE.put(MEMORY_PREFIX + entry.memory_id, JSON.stringify(entry), { expirationTtl: MEMORY_TTL });
    let idx: MemoryEntry[] = [];
    try {
      const raw = await env.SIGNALS_CACHE.get(MEMORY_INDEX_KEY, "json");
      if (Array.isArray(raw)) idx = raw as MemoryEntry[];
    } catch { /* fresh */ }
    idx = [entry, ...idx.filter((e) => e.memory_id !== entry.memory_id)].slice(0, MEMORY_MAX);
    await env.SIGNALS_CACHE.put(MEMORY_INDEX_KEY, JSON.stringify(idx), { expirationTtl: MEMORY_TTL });
  } catch { /* non-fatal */ }
}

// ── 2. Recovery ────────────────────────────────────────────────────────────

export interface RecoveryStrategy {
  /** Plain-language description of what we'll try. */
  approach: string;
  /** Concrete next-step suggestions. */
  retry_actions: Array<{ kind: "alternate_agent" | "simplified_payload" | "drop_field" | "fallback_dry_run"; detail: string }>;
}

const AUTH_GATE_RE = /principal id not found|authentication required|auth_token_invalid|unauthorized|\b401\b|tenant policy/i;
const SHAPE_ERR_RE = /validation error|input should be|extra field not allowed|required field is missing|schema/i;

export function suggestRecovery(failedTool: string, errorText: string, alternateAgents: string[]): RecoveryStrategy {
  const isAuth = AUTH_GATE_RE.test(errorText);
  const isShape = SHAPE_ERR_RE.test(errorText);

  const actions: RecoveryStrategy["retry_actions"] = [];
  if (isAuth && alternateAgents.length > 0) {
    actions.push({ kind: "alternate_agent", detail: `Retry on ${alternateAgents.slice(0, 2).join(", ")} — different vendors may not auth-gate.` });
  }
  if (isAuth) {
    actions.push({ kind: "fallback_dry_run", detail: `Auth-gated — switch to dry-run mode and present payload-preview only.` });
  }
  if (isShape) {
    actions.push({ kind: "simplified_payload", detail: `Drop optional fields and retry — Sec-48r6 vendor adapter rules suggest scalar budget, drop signal_attestations, etc.` });
    actions.push({ kind: "drop_field", detail: `Inspect the validation error: missing-field name = required to add; extra-field name = required to drop.` });
  }
  if (actions.length === 0) {
    actions.push({ kind: "fallback_dry_run", detail: `Unrecognized error — falling back to dry-run preview to keep the workflow visible.` });
  }

  return {
    approach: isAuth
      ? `Auth boundary detected. Either rotate to an unauthenticated alternate or fall back to dry-run.`
      : isShape
        ? `Shape mismatch detected. Apply per-vendor adapter rules and retry.`
        : `Generic error — fall back to dry-run preview and surface the error trace.`,
    retry_actions: actions,
  };
}

// ── 3. Compliance auto-remediation ─────────────────────────────────────────
//
// Given a governance BLOCK, suggest signal swaps that would unblock.
// Strategy: for each `block`-outcome policy, look for a substitute
// signal in our attestation set that claims compliant/exempt for that
// policy. If found, suggest swapping. If no substitute, document why
// override is required.

export interface RemediationSuggestion {
  blocking_policy: string;
  policy_name: string;
  why_blocked: string;
  suggestion: "swap_signal" | "add_attestation" | "manual_override_only";
  detail: string;
}

export function suggestRemediations(advisory: GovernanceAdvisory): RemediationSuggestion[] {
  const out: RemediationSuggestion[] = [];
  const attest = getDemoProviderAttestations();
  const attestedClaims = new Map(attest.map((a) => [a.policy_id, a.claim]));

  for (const a of advisory.advisories.filter((x) => x.outcome === "block")) {
    const policy = POLICIES.find((p) => p.policy_id === a.policy_id);
    const policyName = policy?.name ?? a.policy_id;

    const knownClaim = attestedClaims.get(a.policy_id);
    if (knownClaim && (knownClaim === "compliant" || knownClaim === "exempt" || knownClaim === "out_of_scope" || knownClaim === "not_applicable")) {
      out.push({
        blocking_policy: a.policy_id,
        policy_name: policyName,
        why_blocked: a.reason,
        suggestion: "add_attestation",
        detail: `Provider already attests "${knownClaim}" to this policy — wire the existing attestation into the signal_attestations[] array on create_media_buy.`,
      });
      continue;
    }

    if (policy?.industries_inferred.includes("ai_generated_content")) {
      out.push({
        blocking_policy: a.policy_id,
        policy_name: policyName,
        why_blocked: a.reason,
        suggestion: "add_attestation",
        detail: `EU AI Act Article 50: file an attestor process documenting that no AI-generated content is included in signal payloads, then sign + add to attestations.`,
      });
      continue;
    }

    out.push({
      blocking_policy: a.policy_id,
      policy_name: policyName,
      why_blocked: a.reason,
      suggestion: "manual_override_only",
      detail: `No automated remediation. Operator must override (with documented justification) or remove the offending audience scope.`,
    });
  }

  return out;
}

// ── Convenience: full compliance check + remediation in one ────────────────

export function checkAndRemediate(brief: ExpandedBrief): { advisory: GovernanceAdvisory; remediations: RemediationSuggestion[]; trace: ReasoningStep[] } {
  const trace: ReasoningStep[] = [];
  trace.push(newReasoningStep("analyze", `Running predictive governance check on industries [${brief.industries.join(",")}].`));
  // Pull policies for the brief's industries.
  const indLower = brief.industries.map((i) => i.toLowerCase());
  const applicable = POLICIES.filter((p) => p.industries_inferred.includes("all") || p.industries_inferred.some((i) => indLower.includes(i.toLowerCase())));
  const advisory = predictGovernance(applicable, getDemoProviderAttestations());
  trace.push(newReasoningStep("decide", `Outcome: ${advisory.outcome.toUpperCase()}. ${advisory.restricted_attributes.length} block(s), ${advisory.advisories.filter((a) => a.outcome === "warn").length} warn(s), ${advisory.advisories.filter((a) => a.outcome === "allow").length} allow(s).`, { restricted_attributes: advisory.restricted_attributes }));
  const remediations = suggestRemediations(advisory);
  if (remediations.length > 0) {
    trace.push(newReasoningStep("remediate", `Generated ${remediations.length} remediation suggestion(s) for unblocking.`, undefined));
  }
  return { advisory, remediations, trace };
}

// Helpers exposed for endpoints
export { newReasoningStep };
