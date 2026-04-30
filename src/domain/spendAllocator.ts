// src/domain/spendAllocator.ts
//
// Wave 4 — per-vendor spend allocation policies.
//
// AdCP today doesn't speak about budget allocation across multiple
// buying agents. The orchestrator's default behavior gives every
// fired agent the same scalar budget — fine for a demo, terrible
// for production. This module formalizes 4 allocation strategies:
//
//   - equal_split        — total / N (the default; what we have today)
//   - score_weighted     — weight each agent by a score (e.g. coverage
//                          rank, win rate, latency p95)
//   - priority_first     — give the first agent X% of the budget,
//                          split the rest equally across the others
//   - cap_then_split     — apply per-agent caps first, then split the
//                          residual equally across uncapped agents
//
// Returns per-agent allocation in cents (avoids floating-point
// rounding drift). Sum of allocations always equals total_budget_cents
// (within ±1 cent for rounding).

export type AllocationStrategy =
  | "equal_split"
  | "score_weighted"
  | "priority_first"
  | "cap_then_split";

export interface AllocationInput {
  total_budget_usd: number;
  agents: Array<{
    agent_id: string;
    /** Score 0..1; only used by score_weighted. Defaults to 1.0. */
    score?: number;
    /** Per-agent maximum allocation in USD; only used by cap_then_split. */
    max_usd?: number;
    /** Whether this agent is the priority agent; only used by priority_first.
     *  At most one agent should have this set. */
    priority?: boolean;
  }>;
  strategy: AllocationStrategy;
  /** Strategy-specific config. */
  config?: {
    /** priority_first: % of total to give to the priority agent (0-100). Default 40. */
    priority_share_pct?: number;
    /** Floor: minimum allocation per agent in USD. Default 0. */
    min_per_agent_usd?: number;
  };
}

export interface AllocationResult {
  strategy: AllocationStrategy;
  total_budget_usd: number;
  total_budget_cents: number;
  allocations: Array<{
    agent_id: string;
    allocation_usd: number;
    allocation_cents: number;
    /** Share of total budget 0..1. */
    share: number;
    /** Plain-language reason this agent got this allocation. */
    rationale: string;
  }>;
  /** Sum of all allocations in cents (sanity check). */
  total_allocated_cents: number;
  /** Any rounding drift (target - sum), distributed to the largest allocation. */
  rounding_drift_cents: number;
  /** Plain-English summary. */
  summary: string;
}

const USD_TO_CENTS = 100;
const round = (n: number): number => Math.round(n);

export function allocateSpend(input: AllocationInput): AllocationResult {
  const totalCents = round(input.total_budget_usd * USD_TO_CENTS);
  const minPerAgentCents = round((input.config?.min_per_agent_usd ?? 0) * USD_TO_CENTS);
  const n = input.agents.length;
  if (n === 0) {
    return {
      strategy: input.strategy, total_budget_usd: input.total_budget_usd, total_budget_cents: totalCents,
      allocations: [], total_allocated_cents: 0, rounding_drift_cents: 0,
      summary: "No agents to allocate to.",
    };
  }

  let allocCents: number[] = new Array(n).fill(0);
  let summary = "";

  if (input.strategy === "equal_split") {
    const per = Math.floor(totalCents / n);
    allocCents = allocCents.map(() => per);
    summary = `Equal split — $${(per / 100).toFixed(2)} per agent across ${n} agents.`;
  } else if (input.strategy === "score_weighted") {
    const scores = input.agents.map((a) => Math.max(0, Math.min(1, a.score ?? 1)));
    const totalScore = scores.reduce((s, x) => s + x, 0);
    if (totalScore === 0) {
      // Fallback to equal
      const per = Math.floor(totalCents / n);
      allocCents = allocCents.map(() => per);
      summary = `Score-weighted (all scores zero — fell back to equal-split): $${(per / 100).toFixed(2)} per agent.`;
    } else {
      allocCents = scores.map((s) => Math.floor(totalCents * (s / totalScore)));
      const topScoreIdx = scores.indexOf(Math.max(...scores));
      summary = `Score-weighted — agent ${input.agents[topScoreIdx]!.agent_id} (score ${scores[topScoreIdx]!.toFixed(2)}) gets the largest share.`;
    }
  } else if (input.strategy === "priority_first") {
    const priorityIdx = input.agents.findIndex((a) => a.priority === true);
    const priorityShare = (input.config?.priority_share_pct ?? 40) / 100;
    if (priorityIdx === -1 || n === 1) {
      // No priority specified or only one agent — fallback to equal
      const per = Math.floor(totalCents / n);
      allocCents = allocCents.map(() => per);
      summary = `Priority-first (no priority agent specified — fell back to equal-split): $${(per / 100).toFixed(2)} per agent.`;
    } else {
      const priorityCents = Math.floor(totalCents * priorityShare);
      const remaining = totalCents - priorityCents;
      const perOther = Math.floor(remaining / (n - 1));
      allocCents = input.agents.map((_a, i) => i === priorityIdx ? priorityCents : perOther);
      summary = `Priority-first — ${input.agents[priorityIdx]!.agent_id} gets ${(priorityShare * 100).toFixed(0)}% ($${(priorityCents / 100).toFixed(0)}); remaining ${n - 1} agents split the rest equally.`;
    }
  } else if (input.strategy === "cap_then_split") {
    // First, apply per-agent caps; remaining budget splits across uncapped.
    const cappedCents = input.agents.map((a) => a.max_usd !== undefined ? round(a.max_usd * USD_TO_CENTS) : null);
    let consumed = 0;
    const cappedIdx: number[] = [];
    cappedCents.forEach((c, i) => {
      if (c !== null) {
        allocCents[i] = c;
        consumed += c;
        cappedIdx.push(i);
      }
    });
    const uncappedIdx = input.agents.map((_, i) => i).filter((i) => !cappedIdx.includes(i));
    const remaining = totalCents - consumed;
    if (uncappedIdx.length === 0) {
      // All capped — capped allocation IS the result, even if doesn't sum to total
      summary = `Cap-then-split — all ${n} agents have caps; total capped allocation $${(consumed / 100).toFixed(0)} (vs total $${input.total_budget_usd}).`;
    } else if (remaining <= 0) {
      // Caps exceed total — uncapped get zero
      uncappedIdx.forEach((i) => allocCents[i] = 0);
      summary = `Cap-then-split — caps consumed all of $${input.total_budget_usd}; ${uncappedIdx.length} uncapped agent(s) get $0.`;
    } else {
      const perUncapped = Math.floor(remaining / uncappedIdx.length);
      uncappedIdx.forEach((i) => allocCents[i] = perUncapped);
      summary = `Cap-then-split — ${cappedIdx.length} capped agent(s) consume $${(consumed / 100).toFixed(0)}; remaining $${(remaining / 100).toFixed(0)} split across ${uncappedIdx.length} uncapped at $${(perUncapped / 100).toFixed(0)} each.`;
    }
  }

  // Apply minimum-per-agent floor (if any).
  if (minPerAgentCents > 0) {
    allocCents = allocCents.map((c) => Math.max(c, minPerAgentCents));
  }

  // Distribute rounding drift to the largest allocation so the sum
  // exactly matches the input total.
  const sum = allocCents.reduce((s, x) => s + x, 0);
  const drift = totalCents - sum;
  if (drift !== 0 && allocCents.length > 0) {
    const maxIdx = allocCents.indexOf(Math.max(...allocCents));
    allocCents[maxIdx] = (allocCents[maxIdx] ?? 0) + drift;
  }

  // Build final allocation rows with rationales.
  const allocations = input.agents.map((a, i) => {
    const cents = allocCents[i] ?? 0;
    const usd = cents / USD_TO_CENTS;
    const share = totalCents > 0 ? cents / totalCents : 0;
    let rationale = "";
    if (input.strategy === "equal_split") {
      rationale = "Equal split across all agents.";
    } else if (input.strategy === "score_weighted") {
      rationale = `Score ${(a.score ?? 1).toFixed(2)} → ${(share * 100).toFixed(1)}% share.`;
    } else if (input.strategy === "priority_first") {
      rationale = a.priority ? `Priority agent → ${(share * 100).toFixed(0)}% share.` : `Non-priority agent → split of remaining.`;
    } else if (input.strategy === "cap_then_split") {
      if (a.max_usd !== undefined) rationale = `Capped at $${a.max_usd}.`;
      else rationale = `Uncapped — split of residual after caps.`;
    }
    return { agent_id: a.agent_id, allocation_usd: usd, allocation_cents: cents, share, rationale };
  });

  return {
    strategy: input.strategy,
    total_budget_usd: input.total_budget_usd,
    total_budget_cents: totalCents,
    allocations,
    total_allocated_cents: allocCents.reduce((s, x) => s + x, 0),
    rounding_drift_cents: drift,
    summary,
  };
}
