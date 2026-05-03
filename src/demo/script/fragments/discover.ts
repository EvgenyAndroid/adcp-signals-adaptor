// src/demo/script/fragments/discover.ts
//
// Discover tab: brief hints, NL/curated dispatch, AST renderer, match cards.
//
// Source range (in pre-refactor src/demo/script.ts): lines 969..1338 (370 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const discoverJs = `function renderBriefHints() {
  const hints = _discoverMode === "nl" ? NL_HINTS : BRIEF_HINTS;
  const host = document.getElementById("brief-hints");
  host.innerHTML = '<span class="hint-label">Try</span>' +
    hints.map((h) => '<button class="hint" data-brief="' + escapeHtml(h.text) + '">' + escapeHtml(h.label) + '</button>').join("");
  host.querySelectorAll(".hint").forEach((b) => {
    b.addEventListener("click", () => { briefEl.value = b.dataset.brief; briefEl.focus(); });
  });
}
renderBriefHints();

// Mode toggle wiring
document.querySelectorAll("#discover-mode-toggle .mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    _discoverMode = btn.dataset.mode;
    document.querySelectorAll("#discover-mode-toggle .mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === _discoverMode));
    // Update header copy + placeholder + button label + hints per mode
    if (_discoverMode === "nl") {
      document.getElementById("discover-mode-subtitle").textContent = "NL Query mode";
      document.getElementById("discover-mode-desc").innerHTML = "boolean-AST decomposition via <code>query_signals_nl</code>. Resolves each dimension against the catalog with hybrid rule + embedding + lexical matching. Returns matched signals with per-match method and a compositional audience-size estimate.";
      briefEl.placeholder = "e.g. soccer moms 35+ who stream heavily";
      document.getElementById("discover-btn-label").textContent = "Run NL query";
    } else {
      document.getElementById("discover-mode-subtitle").textContent = "Brief mode";
      document.getElementById("discover-mode-desc").innerHTML = "semantic similarity via the UCP embedding engine. Returns catalog matches + AI-generated custom proposals alongside each other.";
      briefEl.placeholder = "e.g. affluent families 35-44 in top-10 DMAs interested in luxury travel";
      document.getElementById("discover-btn-label").textContent = "Find signals";
    }
    renderBriefHints();
    // Clear any prior results so the mode switch is obvious
    document.getElementById("discover-results").innerHTML = '<div class="empty-state"><svg class="empty-icon"><use href="#icon-' + (_discoverMode === "nl" ? "network" : "radar") + '"/></svg><div class="empty-title">Run a ' + (_discoverMode === "nl" ? "query" : "brief") + ' to see matches</div><div class="empty-desc">' + (_discoverMode === "nl" ? "Boolean decomposition shows the AST, matched signals with per-match method, and a composite audience size." : "Catalog signals rank by semantic match. AI-generated proposals appear beside them for briefs that don\\'t map cleanly.") + '</div></div>';
    document.getElementById("discover-status").textContent = "";
  });
});

document.getElementById("discover-btn").addEventListener("click", runDiscoverDispatch);
briefEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runDiscoverDispatch();
});

function runDiscoverDispatch() {
  if (_discoverMode === "nl") return runNlQuery();
  return runDiscover();
}

async function runDiscover() {
  const brief = briefEl.value.trim();
  if (!brief) { showToast("Enter a brief first", true); return; }
  const btn = document.getElementById("discover-btn");
  const status = document.getElementById("discover-status");
  const results = document.getElementById("discover-results");
  btn.disabled = true;
  status.innerHTML = '<span class="spinner"></span>scanning catalog + generating proposals…';
  results.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Searching…</div></div>';

  // Fire a parallel /signals/search call to capture the universal _trace
  // payload. Doesn't block the main UI render — when it lands we light up
  // the floating Trace button so the operator can inspect.
  fetch("/signals/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
    body: JSON.stringify({ brief: brief, limit: 8 }),
  }).then(function(r) { return r.ok ? r.json() : null; })
    .then(function(j) {
      if (j && j._trace) {
        window.__lastTrace = j._trace;
        _showTraceTrigger();
      }
    })
    .catch(function() { /* trace is decorative; failure is silent */ });

  try {
    const t0 = performance.now();
    const data = await callTool("get_signals", {
      signal_spec: brief,
      deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
      max_results: 8,
    });
    const elapsed = Math.round(performance.now() - t0);
    const catalog = (data.signals || []).filter((s) => s.signal_type !== "custom");
    const proposals = data.proposals || (data.signals || []).filter((s) => s.signal_type === "custom");
    // Cache signals + proposals so card-click handlers can resolve the
    // signal for the detail panel. Proposals aren't in state.catalog.all
    // (they're ephemeral, not persisted until activation), so without
    // this cache the Discover-tab card click would silently no-op.
    _lastDiscoverSignals = [...catalog, ...proposals];
    status.textContent = catalog.length + " catalog match" + (catalog.length === 1 ? "" : "es") + " · " +
      proposals.length + " AI proposal" + (proposals.length === 1 ? "" : "s") + " · " + elapsed + "ms";

    results.innerHTML =
      '<div class="result-split">' +
        '<div class="result-col">' +
          '<div class="result-col-header"><span class="result-col-title">Catalog matches</span><span class="result-col-count">' + catalog.length + '</span></div>' +
          (catalog.length ? catalog.map(renderDiscoverCard).join("") : '<div class="empty-state"><div class="empty-desc">No catalog hits for this brief.</div></div>') +
        '</div>' +
        '<div class="result-col">' +
          '<div class="result-col-header"><span class="result-col-title">AI-generated proposals</span><span class="result-col-count">' + proposals.length + '</span></div>' +
          (proposals.length ? proposals.map(renderDiscoverCard).join("") : '<div class="empty-state"><div class="empty-desc">No custom proposals this round. Try a more specific brief.</div></div>') +
        '</div>' +
      '</div>';

    wireCardClicks(results);
  } catch (e) {
    showToast("Discovery failed: " + e.message, true);
    status.textContent = "error";
    results.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  } finally {
    btn.disabled = false;
  }
}

// NL Query mode — calls query_signals_nl, renders the boolean AST +
// matched signals with per-match method + composite audience size.
// Different shape from get_signals so gets its own renderer.
async function runNlQuery() {
  const q = briefEl.value.trim();
  if (!q) { showToast("Enter a query first", true); return; }
  const btn = document.getElementById("discover-btn");
  const status = document.getElementById("discover-status");
  const results = document.getElementById("discover-results");
  btn.disabled = true;
  status.innerHTML = '<span class="spinner"></span>decomposing query + resolving dimensions…';
  results.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Running NL query…</div></div>';

  try {
    const t0 = performance.now();
    const data = await callTool("query_signals_nl", { query: q, limit: 8 });
    const elapsed = Math.round(performance.now() - t0);
    // query_signals_nl response lives under data.result (handler wraps
    // the tool output in {success,result}). Unwrap carefully.
    const payload = data?.result ?? data;
    // Capture _trace from the unwrapped payload — NL Query is the
    // most algorithmically rich trace target (real cosine per leaf).
    _captureTrace(payload?._trace);
    const matches = payload?.matched_signals || [];
    const estSize = payload?.estimated_size;
    const confTier = payload?.confidence_tier;
    const confScalar = payload?.confidence;
    const ast = payload?.resolved_ast;

    status.textContent = matches.length + " matched signal" + (matches.length === 1 ? "" : "s") + " · " +
      (estSize != null ? fmtNumber(estSize) + " composite" : "no composite") + " · " + elapsed + "ms";
    _lastDiscoverSignals = matches.slice();

    results.innerHTML = renderNlResult({ payload, matches, estSize, confTier, confScalar, ast });
    wireNlCardClicks();
  } catch (e) {
    showToast("NL query failed: " + e.message, true);
    status.textContent = "error";
    results.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  } finally {
    btn.disabled = false;
  }
}

function renderNlResult({ matches, estSize, confTier, confScalar, ast }) {
  const confStr = confTier
    ? confTier + (typeof confScalar === "number" ? " (" + (confScalar * 100).toFixed(0) + "%)" : "")
    : (typeof confScalar === "number" ? (confScalar * 100).toFixed(0) + "%" : "—");
  const hero = '' +
    '<div class="nl-result-hero">' +
      '<div>' +
        '<div class="nl-size-label">Composite audience</div>' +
        '<div class="nl-size">' + (estSize != null ? fmtNumber(estSize) : "—") + '</div>' +
      '</div>' +
      '<div class="nl-conf">' +
        '<span class="nl-size-label">Confidence</span>' +
        '<span class="nl-conf-value">' + escapeHtml(confStr) + '</span>' +
      '</div>' +
      '<div>' +
        '<div class="nl-size-label">Matches</div>' +
        '<div class="nl-size" style="font-size:20px">' + matches.length + '</div>' +
      '</div>' +
    '</div>';

  const astBlock = ast
    ? '<details class="nl-ast-block" open>' +
        '<summary><span class="label">Resolved boolean AST</span></summary>' +
        '<div class="nl-ast-tree">' + renderAst(ast, 0) + '</div>' +
      '</details>'
    : "";

  const matchList = matches.length
    ? '<div class="result-col-header" style="margin-top:18px"><span class="result-col-title">Matched signals</span><span class="result-col-count">' + matches.length + '</span></div>' +
      matches.map(renderNlMatchCard).join("")
    : '<div class="empty-state" style="margin-top:18px"><div class="empty-desc">No signals matched this NL query. Try a broader phrasing.</div></div>';

  return '<div class="nl-result-shell">' + hero + astBlock + matchList + '</div>';
}

function renderAst(node, depth) {
  if (!node || typeof node !== "object") return "";
  const cls = "depth-" + Math.min(depth, 3);
  if (node.op && Array.isArray(node.children)) {
    const kids = node.children.map((c) => renderAst(c, depth + 1)).join("");
    return '<div class="' + cls + '"><span class="op">' + escapeHtml(String(node.op).toUpperCase()) + '</span></div>' + kids;
  }
  // Leaf
  const label = node.label || node.dimension || node.concept_id || "";
  const value = node.value != null ? " = " + (Array.isArray(node.value) ? node.value.join(" / ") : node.value) : "";
  return '<div class="' + cls + '"><span class="leaf">' + escapeHtml(String(label)) + escapeHtml(String(value)) + '</span></div>';
}

function renderNlMatchCard(m) {
  const sid = m.signal_agent_segment_id || m.signal_id?.id || "";
  const method = m.match_method || "embedding";
  const score = typeof m.match_score === "number" ? m.match_score.toFixed(2) : "—";
  const audience = m.estimated_audience_size != null ? fmtNumber(m.estimated_audience_size) : "—";
  // Sec-38 B7 (C2): explain-this-match. Builds a short human-readable
  // reason string from match_method + any matched tokens/rules the
  // resolver echoed back. Shown as a tooltip-style sub-line so the
  // planner understands *why* this signal scored.
  const reason = explainMatch(m);
  return '' +
    '<div class="nl-match-card" data-sid="' + escapeHtml(sid) + '">' +
      '<div>' +
        '<div class="nl-m-name">' + escapeHtml(m.name || "(unnamed)") + dtsPill(m) + freshnessPill(m) + sensitivePill(m) + '</div>' +
        '<div class="nl-m-sub">' + escapeHtml(sid) + ' · ' + audience + ' audience</div>' +
        (reason ? '<div class="nl-m-reason"><svg class="ico"><use href="#icon-info"/></svg><span>' + escapeHtml(reason) + '</span></div>' : "") +
      '</div>' +
      '<span class="nl-m-method ' + escapeHtml(method) + '">' + escapeHtml(method.replace(/_/g, " ")) + '</span>' +
      '<span class="nl-m-score">' + score + '</span>' +
    '</div>';
}

// Sec-38 B7 (C2): synthesize a human-readable explanation for why the
// resolver matched this signal. Uses whatever breadcrumbs the resolver
// emits (match_method + match_dimensions / matched_rules / matched_terms
// / score_breakdown) and falls back to a method-class description.
function explainMatch(m) {
  const method = m.match_method || "embedding";
  const parts = [];
  if (Array.isArray(m.matched_dimensions) && m.matched_dimensions.length) {
    parts.push("matched " + m.matched_dimensions.slice(0, 3).join(", "));
  }
  if (Array.isArray(m.matched_terms) && m.matched_terms.length) {
    parts.push("lexical overlap: " + m.matched_terms.slice(0, 3).join(", "));
  }
  if (Array.isArray(m.matched_rules) && m.matched_rules.length) {
    parts.push(m.matched_rules.length + " rules matched");
  }
  if (typeof m.match_score === "number") {
    if (method === "embedding" || method === "semantic") {
      parts.push("cos=" + m.match_score.toFixed(2));
    } else if (method === "exact_rule" || method === "rule") {
      parts.push("rule-exact");
    } else if (method === "lexical") {
      parts.push("token match");
    }
  }
  if (parts.length === 0) {
    // Method-class fallback
    if (method === "embedding" || method === "semantic") return "Ranked by semantic similarity in the UCP embedding space.";
    if (method === "exact_rule" || method === "rule") return "Matched directly on declared targeting rules.";
    if (method === "lexical") return "Token-level overlap with the query.";
    return "";
  }
  return parts.join(" · ");
}

function wireNlCardClicks() {
  document.querySelectorAll(".nl-match-card").forEach((card) => {
    card.addEventListener("click", () => {
      const sid = card.dataset.sid;
      const partial = _lastDiscoverSignals.find((x) => (x.signal_agent_segment_id || x.signal_id?.id) === sid);
      openDetailHydrated(sid, partial);
    });
  });
}

// Some panels open with only an abridged signal object — query_signals_nl
// returns {name, signal_agent_segment_id, match_score, match_method,
// estimated_audience_size, coverage_percentage} and nothing else. The
// detail panel renders "—" for category / deployments / DTS when given
// this shape. Hydrate via get_signals {signal_ids: [sid]} first so the
// panel shows the full picture.
async function openDetailHydrated(sid, fallback) {
  // Fast path: full record already in catalog cache
  const fromCatalog = state.catalog.all.find((x) => (x.signal_agent_segment_id || x.signal_id?.id) === sid);
  if (fromCatalog && Array.isArray(fromCatalog.deployments)) {
    openDetail(fromCatalog);
    return;
  }
  // Open with the skinny record immediately so the panel feels
  // responsive, then upgrade in place once the full record arrives.
  if (fallback) openDetail(fallback);
  try {
    const data = await callTool("get_signals", {
      signal_ids: [sid],
      deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
      max_results: 1,
    });
    const full = (data?.signals || []).find((s) => (s.signal_agent_segment_id || s.signal_id?.id) === sid);
    if (full && state.detail && (state.detail.signal_agent_segment_id || state.detail.signal_id?.id) === sid) {
      openDetail(full);
    }
  } catch { /* leave the skinny panel in place */ }
}

function renderDiscoverCard(s) {
  const type = s.signal_type || "marketplace";
  const sid = s.signal_agent_segment_id || s.signal_id?.id || "";
  const price = fmtCPM(s);
  return '' +
    '<div class="signal-card" data-sid="' + escapeHtml(sid) + '">' +
      '<div class="sc-row-1">' +
        '<div class="sc-name">' + escapeHtml(s.name || "(unnamed)") + dtsPill(s) + freshnessPill(s) + sensitivePill(s) + '</div>' +
        typeBadge(type) +
      '</div>' +
      '<div class="sc-desc">' + escapeHtml(s.description || "") + '</div>' +
      '<div class="sc-meta">' +
        '<span><strong>' + fmtNumber(s.estimated_audience_size) + '</strong> audience</span>' +
        '<span><strong>' + price.display + '</strong> cpm</span>' +
        '<span style="color:var(--text-mut)">' + escapeHtml(verticalOf(s)) + '</span>' +
      '</div>' +
    '</div>';
}

function wireCardClicks(root) {
  root.querySelectorAll(".signal-card").forEach((card) => {
    card.addEventListener("click", () => {
      const sid = card.dataset.sid;
      const sig = state.catalog.all.find((x) => (x.signal_agent_segment_id || x.signal_id?.id) === sid)
               || findFromLatestDiscover(sid);
      if (sig) openDetail(sig);
    });
  });
}

let _lastDiscoverSignals = [];
function findFromLatestDiscover(sid) {
  return _lastDiscoverSignals.find((x) => (x.signal_agent_segment_id || x.signal_id?.id) === sid);
}
// Hook into runDiscover to stash signals for click resolution
const _origRunDiscover = runDiscover;
// (already referenced; we can't wrap because it's a function declaration; rely on state instead)

//────────────────────────────────────────────────────────────────────────
// §2 Catalog
//────────────────────────────────────────────────────────────────────────
async function loadCatalog() {
  const tbody = document.getElementById("catalog-tbody");
  tbody.innerHTML = skeletonRows(6, 7);

  try {
    // Page through 100-at-a-time until we have the whole catalog
    const all = [];
    let offset = 0;
    while (true) {
      const data = await callTool("get_signals", {
        deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
        max_results: 100,
        pagination: { offset },
      });
      const batch = (data.signals || []).filter((s) => s.signal_type !== "custom");
      all.push(...batch);
      if (!data.hasMore || batch.length === 0) break;
      offset += 100;
      if (offset > 1000) break; // safety — catalog shouldn't exceed this
    }
    state.catalog.all = all;
    document.getElementById("nav-catalog-count").textContent = String(all.length);
    populateKPIs();
    populateVerticalChips();
    applyCatalogFilter();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty" style="color:var(--error)">' + escapeHtml(e.message) + '</td></tr>';
  }
}

`;
