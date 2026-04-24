// src/domain/workflowOrchestration.ts
// Sec-48f: pure helpers for the 4-stage end-to-end workflow that
// fans a single brief across signals → creative → products →
// media_buy, using live AdCP directory agents at every stage.
//
// All functions here are deterministic and don't touch the network.
// Transport + fan-out live in agentsEndpoints.ts; schema synth lives
// here so it's unit-testable.
//
// Payload synthesis targets the UNION of required fields across the
// three buying agents we ship with by default (adzymic_apx, claire_pub,
// swivel). Union = buyer_ref + brand_manifest + packages + start_time
// + end_time. Claire accepts less but doesn't reject the extras.
//
// Live probe data 2026-04-24 informs the field list:
//   adzymic_apx.create_media_buy   — 22 props, 5 required
//   claire_pub.create_media_buy    — 24 props, 1 required
//   swivel.create_media_buy        — 10 props, 5 required

export interface SignalLite {
  source_agent?: string;
  signal_agent_segment_id?: string;
  id?: string;
  name?: string;
  description?: string;
  coverage_percentage?: number;
  estimated_audience_size?: number;
  [k: string]: unknown;
}

export interface ProductLite {
  product_id?: string;
  id?: string;
  name?: string;
  description?: string;
  [k: string]: unknown;
}

/** Identify a signal with a single stable string ID regardless of
 *  vendor variations. Dstillery uses signal_agent_segment_id; our
 *  own signals may surface under `id`. */
export function signalId(s: SignalLite): string | null {
  if (typeof s.signal_agent_segment_id === "string") return s.signal_agent_segment_id;
  if (typeof s.id === "string") return s.id;
  return null;
}

/** Identify a product. `product_id` is AdCP canonical; some vendors
 *  surface plain `id`. */
export function productId(p: ProductLite): string | null {
  if (typeof p.product_id === "string") return p.product_id;
  if (typeof p.id === "string") return p.id;
  return null;
}

/** Pick top-N signals from a merged multi-agent list. Ranking is
 *  coverage-desc; ties broken by appearance order. Returns just the
 *  IDs — downstream stages don't need the full signal object. */
export function pickTopSignals(merged: SignalLite[], n: number): string[] {
  const scored = merged
    .map((s, i) => ({ id: signalId(s), cov: typeof s.coverage_percentage === "number" ? s.coverage_percentage : -1, idx: i }))
    .filter((x): x is { id: string; cov: number; idx: number } => x.id !== null);
  scored.sort((a, b) => b.cov - a.cov || a.idx - b.idx);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s.id);
    if (out.length >= n) break;
  }
  return out;
}

/** Pick the first product per agent (deterministic). Returns a map
 *  of agent_id → product_id (or null when the agent returned no
 *  products). */
export function pickProductPerAgent(
  perAgent: Array<{ id: string; products: ProductLite[] }>,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const a of perAgent) {
    const first = a.products.find((p) => productId(p) !== null);
    out[a.id] = first ? productId(first) : null;
  }
  return out;
}

export interface MediaBuyPayloadInput {
  workflowId: string;
  agentId: string;
  brief: string;
  chosenProductId: string | null;
  chosenSignalIds: string[];
  /** Optional override for the demo budget. Default: $1000 USD for 7d. */
  totalBudgetUsd?: number;
  /** Optional override for start delay. Default: +24h from now. */
  startDelayHours?: number;
  /** Optional campaign duration in days. Default: 7. */
  durationDays?: number;
  /** Optional reference clock — injected for testability. Defaults to Date.now(). */
  nowMs?: number;
}

export interface MediaBuyPayload {
  buyer_ref: string;
  brand_manifest: {
    brand: string;
    advertiser: string;
    categories: string[];
  };
  packages: Array<{
    package_ref: string;
    product_id: string | null;
    budget: { amount: number; currency: "USD" };
  }>;
  start_time: string;
  end_time: string;
  total_budget: { amount: number; currency: "USD" };
  targeting_overlay?: {
    required_axe_signals?: string[];
  };
  po_number: string;
}

/** Synthesize a create_media_buy payload that satisfies the union of
 *  required fields across Adzymic / Claire / Swivel. Same payload is
 *  emitted for every agent in the workflow — any per-vendor tailoring
 *  happens at the transport layer. */
export function buildCreateMediaBuyPayload(input: MediaBuyPayloadInput): MediaBuyPayload {
  const now = input.nowMs ?? Date.now();
  const startDelayMs = (input.startDelayHours ?? 24) * 60 * 60 * 1000;
  const durationMs = (input.durationDays ?? 7) * 24 * 60 * 60 * 1000;
  const startIso = new Date(now + startDelayMs).toISOString();
  const endIso = new Date(now + startDelayMs + durationMs).toISOString();
  const totalBudget = input.totalBudgetUsd ?? 1000;

  const payload: MediaBuyPayload = {
    buyer_ref: `wf_${input.workflowId}_${input.agentId}`,
    brand_manifest: {
      brand: "AdCP Workflow Demo",
      advertiser: "AdCP Workflow Demo",
      categories: extractCategories(input.brief),
    },
    packages: [
      {
        package_ref: "pkg_1",
        product_id: input.chosenProductId,
        budget: { amount: totalBudget, currency: "USD" },
      },
    ],
    start_time: startIso,
    end_time: endIso,
    total_budget: { amount: totalBudget, currency: "USD" },
    po_number: `demo_${input.workflowId}`,
  };

  if (input.chosenSignalIds.length > 0) {
    payload.targeting_overlay = { required_axe_signals: input.chosenSignalIds };
  }

  return payload;
}

/** Shallow category extraction for the brand_manifest. Just tokenizes
 *  the brief on whitespace + punctuation and keeps the first 3 alpha
 *  tokens of length ≥4. Good enough to populate the field without
 *  triggering "categories[] required" validators. */
export function extractCategories(brief: string): string[] {
  const tokens = brief.toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 4);
  const uniq: string[] = [];
  for (const t of tokens) {
    if (!uniq.includes(t)) uniq.push(t);
    if (uniq.length >= 3) break;
  }
  return uniq.length > 0 ? uniq : ["general"];
}

/** Create a reasonably unique + human-recognizable workflow id.
 *  Format: wf_<base36-ms><6-random>. Called once per POST. */
export function newWorkflowId(): string {
  const t = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `wf_${t}${rand}`;
}
