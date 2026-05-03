// src/demo/script/fragments/freshness.ts
//
// Freshness panel: row extraction + render.
//
// Source range (in pre-refactor src/demo/script.ts): lines 6633..6737 (105 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const freshnessJs = `function _freshnessExtractRows() {
  return (state.catalog.all || []).map(function (s) {
    var xa = s.x_analytics || {};
    return {
      id: s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "",
      name: s.name || "(unnamed)",
      vertical: verticalOf(s),
      halflife: Number(xa.decayHalfLifeDays) || 0,
      volatility: Number(xa.volatilityIndex) || 0,
      authority: Number(xa.authorityScore) || 0,
      stability: xa.idStabilityClass || "unknown",
      reach: Number(s.estimated_audience_size) || 0,
    };
  });
}

function _freshnessRender() {
  var rows = (state.freshness.rows || []).slice();
  var col = state.freshness.sortCol;
  var dir = state.freshness.sortDir;
  var stabOrder = { stable: 0, "semi-stable": 1, "semi_stable": 1, volatile: 2, unknown: 3 };
  rows.sort(function (a, b) {
    var av = a[col], bv = b[col];
    if (col === "stability") { av = stabOrder[av] != null ? stabOrder[av] : 99; bv = stabOrder[bv] != null ? stabOrder[bv] : 99; }
    if (typeof av === "string") { var cmp = av.localeCompare(bv); return dir === "asc" ? cmp : -cmp; }
    return dir === "asc" ? av - bv : bv - av;
  });
  // Update th arrows
  document.querySelectorAll("#fresh-table th[data-sort]").forEach(function (th) {
    th.classList.remove("fresh-sort-asc", "fresh-sort-desc");
    if (th.dataset.sort === col) th.classList.add(dir === "asc" ? "fresh-sort-asc" : "fresh-sort-desc");
  });
  var tbody = document.querySelector("#fresh-table tbody");
  if (!tbody) return;
  tbody.innerHTML = rows.map(function (r) {
    var hlCls = r.halflife < 7 ? "fresh-warn" : r.halflife < 30 ? "fresh-warm" : "";
    var stabCls = "fresh-stab-" + (r.stability || "unknown").replace("_", "-");
    var volCls = r.volatility > 60 ? "fresh-warn" : r.volatility > 30 ? "fresh-warm" : "";
    var authCls = r.authority >= 80 ? "fresh-good" : r.authority < 40 ? "fresh-warn" : "";
    return '<tr>' +
      '<td class="fresh-name"><div>' + escapeHtml(r.name) + '</div><div class="signal-id">' + escapeHtml(r.id) + '</div></td>' +
      '<td>' + escapeHtml(r.vertical) + '</td>' +
      '<td class="mono ' + hlCls + '">' + r.halflife.toFixed(1) + '</td>' +
      '<td class="mono ' + volCls + '">' + r.volatility.toFixed(0) + '</td>' +
      '<td class="mono ' + authCls + '">' + r.authority.toFixed(0) + '</td>' +
      '<td><span class="pill ' + stabCls + '">' + escapeHtml(r.stability) + '</span></td>' +
      '<td class="mono">' + fmtNumber(r.reach) + '</td>' +
    '</tr>';
  }).join("");
  // Warnings list: signals with halflife < 7
  var warnHost = document.getElementById("fresh-warnings");
  if (warnHost) {
    var warn = rows.filter(function (r) { return r.halflife > 0 && r.halflife < 7; });
    if (warn.length === 0) {
      warnHost.innerHTML = '';
    } else {
      warnHost.innerHTML =
        '<div class="fresh-warning-block">' +
          '<div class="fresh-warning-head">' + warn.length + ' signal' + (warn.length === 1 ? '' : 's') + ' with half-life &lt; 7 days — refresh required before each flight</div>' +
          '<div class="fresh-warning-body">' + warn.slice(0, 10).map(function (r) {
            return '<span class="pill pill-warning" style="font-size:10.5px;margin:3px">' + escapeHtml(r.name) + ' · ' + r.halflife.toFixed(1) + 'd</span>';
          }).join("") + (warn.length > 10 ? '<span style="color:var(--text-mut);font-size:11px;margin-left:6px">+' + (warn.length - 10) + ' more</span>' : '') + '</div>' +
        '</div>';
    }
  }
  var explHost = document.getElementById("fresh-explainer");
  if (explHost && !explHost.innerHTML) {
    explHost.innerHTML = renderChartExplainer({
      what: "Per-signal data-quality facets derived at mapper time from the Sec-41 x_analytics block.",
      how: "Half-life = exponential-decay parameter estimated from observed refresh cadence + category norms. Volatility = coefficient-of-variation over the monthly seasonality profile, 0–100 scaled. Authority = DTS methodology score (provenance + scale + freshness + licensing). Stability class = stable if IDs persist across flights, semi-stable if partial churn, volatile if large churn window-to-window.",
      read: "For planning-heavy buys (upper-funnel, long flights) prioritize <strong>stable + low-volatility + high-authority</strong>. For time-sensitive campaigns (event-based, retail triggers) a short half-life is a feature, not a bug — just refresh before each flight.",
      limits: "All four facets are deterministic derivations from catalog metadata. They don't replace a clean-room validation; for regulated verticals treat them as planning signals, not audit evidence.",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sec-47: Expression Tree Builder — visual boolean AST over catalog signals.
// Tree nodes: { type:"signal", id, signal_id? } | { type:"op", id, op, children }.
// Invariants (enforced client + server): depth ≤ 5, nodes ≤ 30, NOT only
// under AND. Drag-and-drop reparents any node to any group, blocking drops
// into own descendants.
// ─────────────────────────────────────────────────────────────────────────
var _exprLoaded = false;
var EXPR_MAX_DEPTH = 5;
var EXPR_MAX_NODES = 30;

async function ensureExpression() {
  if (_exprLoaded) return;
  _exprLoaded = true;
  if (state.catalog.all.length === 0) await loadCatalog();
  if (!state.expression.tree) {
    state.expression.tree = _exprNewGroup("OR", [_exprNewLeaf(), _exprNewLeaf()]);
  }
  _exprRender();
  document.getElementById("expr-reset").addEventListener("click", function () {
    if (!window.confirm("Reset the tree? All current nodes will be cleared.")) return;
    state.expression.tree = _exprNewGroup("OR", [_exprNewLeaf(), _exprNewLeaf()]);
    state.expression.lastResult = null;
    _exprRender();
  });
  document.getElementById("expr-run").addEventListener("click", runExpression);
  document.getElementById("expr-save-btn").addEventListener("click", saveExpressionSnapshot);
}

`;
