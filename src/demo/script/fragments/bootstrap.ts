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

`;
}
