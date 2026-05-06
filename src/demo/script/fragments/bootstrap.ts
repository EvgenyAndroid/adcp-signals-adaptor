// src/demo/script/fragments/bootstrap.ts
//
// Script header: d3-hierarchy CDN load + DEMO_KEY interpolation. Function form because it interpolates the per-request `safeKey`.
//
// Source range (in pre-refactor src/demo/script.ts): lines 27..110 (84 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export function bootstrapJs(safeKey: string): string {
  return `//────────────────────────────────────────────────────────────────────────
// Sec-32: d3-hierarchy for treemap squarify math. Only external dep —
// everything else is hand-rolled. If the CDN fails, the treemap tab
// degrades gracefully (rendered message + link to catalog).
//────────────────────────────────────────────────────────────────────────
let D3;
try {
  D3 = await import("https://esm.sh/d3-hierarchy@3.1.2?bundle");
} catch (e) {
  console.warn("d3-hierarchy failed to load, treemap unavailable:", e);
  D3 = null;
}

//────────────────────────────────────────────────────────────────────────
// State + utilities
//────────────────────────────────────────────────────────────────────────
const DEMO_KEY = ${safeKey};
let rpcId = 1;

const state = {
  catalog: {
    all: [],
    filtered: [],
    page: 0,
    pageSize: 20,
    sort: { col: "name", dir: "asc" },
    filter: { vertical: "", category: "", search: "" },
  },
  detail: null,
  treemap: { rendered: false, resizeObserver: null },
  builder: {
    rules: [],
    generatedSegment: null,
    estimateSeq: 0,
    debounceTimer: null,
  },
  activations: { pollTimer: null, data: [] },
  toolLog: { pollTimer: null, data: [], paused: false, filter: "", expanded: new Set() },
  overlap: { selected: [], lastResult: null, searchQ: "" },
  // Sec-43: Composer state. Five pickers (3 on Set Builder + 1 each on
  // Saturation / Affinity) plus the last result payloads for rendering.
  composer: {
    inc: [], itx: [], exc: [],      // Set Builder pools
    sat: [], aff: [],               // Saturation / Affinity pools
    lastCompose: null, lastSat: null, lastAff: null,
    loaded: false,
  },
  // Sec-44: Journey builder. Dynamic stage list; each stage has its own
  // include/intersect/exclude pool arrays.
  journey: { stages: [], lastResult: null, loaded: false, cumulative: true },
  // Sec-47: boolean expression AST builder. Tree is null until ensureExpression seeds it.
  expression: { tree: null, lastResult: null, loaded: false, nextId: 1, draggedNodeId: null, pickingLeafId: null },
  // Sec-48: multi-agent orchestrator state.
  orchestrator: { directory: [], probe: null, orchestrate: null, matrix: null, loaded: false, probing: false, matrixing: false, orchestrating: false, expandedAgents: {} },
  // Sec-44: Scenario Planner — current / add / remove pools.
  planner: { cur: [], add: [], rem: [], lastResult: null, loaded: false },
  // Sec-44: Snapshots — fetched index + diff selection.
  snapshots: { list: [], diffPair: [], loaded: false },
  // Sec-44: Freshness — sort state + hydrated facets.
  freshness: { sortCol: "halflife", sortDir: "asc", rows: null, loaded: false },
  reach: { budgetUsd: 10_000 },
  // Sec-39: detail panel UX — cycle-mode + collapsed-section memory
  ui: { detailMode: "narrow", collapsedSections: new Set() },
};

async function callTool(name, args) {
  const res = await fetch("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + DEMO_KEY,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcId++,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || "rpc error");
  return body.result?.structuredContent ?? body.result;
}

//────────────────────────────────────────────────────────────────────────
// AdCP 3.0 conformance helpers — replace legacy 2.x shapes the demo
// client used to emit. The trace inspector validates every request
// against the canonical schema (currently pinned at 3.0.6 — see
// scripts/vendor-adcp-schemas.mjs); sending the right shape keeps OUR
// own traces clean (✓ schema valid) so the workshop demonstration of
// "validation surfaces drift" stays focused on PEER drift (Dstillery)
// rather than self-drift in our own client.
//────────────────────────────────────────────────────────────────────────

// 3.0.x activate_signal_request requires an idempotency_key matching
// the pattern ^[A-Za-z0-9_.:-]{16,255}$. Use crypto.randomUUID() — 32
// hex chars after stripping dashes, satisfies the pattern. Fallback
// for older browsers uses Date.now() + Math.random() — also valid.
function _makeIdempotencyKey() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/-/g, "");
    }
  } catch (_) { /* fall through */ }
  // Fallback: 16+ alphanumeric chars, schema-pattern compliant.
  return "ik" + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
}

// 3.0.1 destinations: top-level array of { type, platform | agent_url, account? }
// Replaces the legacy 2.x deliver_to.deployments wrapper. mock_dsp is
// the canonical demo destination — every demo activate_signal call
// ends up here unless overridden.
function _mockDestinations() {
  return [{ type: "platform", platform: "mock_dsp" }];
}

// Build a 3.0.1-conformant activate_signal request body. Use this from
// every demo callsite instead of hand-constructing the shape.
function _activateArgs(signalAgentSegmentId, opts) {
  opts = opts || {};
  return {
    signal_agent_segment_id: signalAgentSegmentId,
    destinations: opts.destinations || _mockDestinations(),
    idempotency_key: _makeIdempotencyKey(),
  };
}

// Build a 3.0.x-conformant get_signals request body. Migration notes:
//   * 3.0 has top-level destinations + countries arrays (2.x nested them
//     under deliver_to.deployments / deliver_to.countries).
//   * signal_ids is an array of discriminated SignalId objects:
//       { source: "agent", agent_url, id }   — agent-native signals
//       { source: "catalog", data_provider_domain, id }   — published catalog
//     Callers may still pass plain string ids; this helper coerces each
//     to the agent shape using the current origin's /mcp as agent_url.
//   * Top-level max_results is deprecated in 3.0.1 (removed in 4.0).
//     Canonical path is pagination.max_results. The helper auto-nests
//     when callers pass max_results on opts; an explicit
//     opts.pagination.max_results still wins.
function _getSignalsArgs(signalSpec, opts) {
  opts = opts || {};
  const out = {};
  if (signalSpec) out.signal_spec = signalSpec;
  if (opts.signal_ids) {
    const agentUrl = (typeof window !== "undefined" ? window.location.origin : "") + "/mcp";
    out.signal_ids = opts.signal_ids.map(function (s) {
      if (typeof s === "string") return { source: "agent", agent_url: agentUrl, id: s };
      return s;
    });
  }
  out.destinations = opts.destinations || _mockDestinations();
  out.countries = opts.countries || ["US"];
  // 3.0.1 deprecation: nest max_results inside pagination. Caller's
  // explicit opts.pagination.max_results wins; otherwise we promote the
  // top-level opts.max_results into the pagination envelope.
  const pag = opts.pagination ? Object.assign({}, opts.pagination) : {};
  if (opts.max_results != null && pag.max_results == null) pag.max_results = opts.max_results;
  if (Object.keys(pag).length > 0) out.pagination = pag;
  return out;
}

`;
}
