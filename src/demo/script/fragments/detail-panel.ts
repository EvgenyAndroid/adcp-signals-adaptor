// src/demo/script/fragments/detail-panel.ts
//
// Detail panel: openDetail, lineage graph, reach + measurement blocks, MCP inspector, closeDetail.
//
// Source range (in pre-refactor src/demo/script.ts): lines 1575..2286 (712 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const detailPanelJs = `function openDetail(sig) {
  state.detail = sig;
  const panel = document.getElementById("detail-panel");
  const backdrop = document.getElementById("backdrop");
  panel.setAttribute("aria-hidden", "false");
  panel.classList.add("open");
  backdrop.classList.add("open");

  const sid = sig.signal_agent_segment_id || sig.signal_id?.id || "";
  const type = sig.signal_type || "marketplace";
  const price = fmtCPM(sig);

  document.getElementById("detail-type").textContent = type;
  document.getElementById("detail-type").className = "detail-type-badge sc-type-badge " + type;
  // Sec-37 B7: tiny {} affordance next to the title opens the MCP
  // exchange drawer for this signal — agents + humans can see the
  // exact request/response on the wire.
  document.getElementById("detail-name").innerHTML =
    escapeHtml(sig.name || "(unnamed)") +
    ' <button class="mcp-inspect-btn" id="detail-mcp-inspect" title="Inspect MCP exchange">{…}</button>';

  const body = document.getElementById("detail-body");
  body.innerHTML = '' +
    // Hero stats — always span full width, not collapsible
    '<div class="detail-section span-full no-collapse" data-section="stats" data-section-title="Overview">' +
      '<div class="detail-stats">' +
        '<div class="detail-stat"><div class="detail-stat-label">Audience</div><div class="detail-stat-value">' + fmtNumber(sig.estimated_audience_size) + '</div></div>' +
        '<div class="detail-stat"><div class="detail-stat-label">Coverage</div><div class="detail-stat-value">' + (typeof sig.coverage_percentage === "number" ? sig.coverage_percentage.toFixed(1) + "%" : "—") + '</div></div>' +
        '<div class="detail-stat"><div class="detail-stat-label">CPM</div><div class="detail-stat-value">' + price.display + '</div></div>' +
        '<div class="detail-stat"><div class="detail-stat-label">Vertical</div><div class="detail-stat-value" style="font-size:14px;text-transform:capitalize">' + escapeHtml(verticalOf(sig)) + '</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="detail-section span-full" data-section="desc" data-section-title="Description">' +
      '<div class="detail-section-label">Description</div>' +
      '<div class="detail-desc">' + escapeHtml(sig.description || "No description provided.") + '</div>' +
    '</div>' +
    '<div class="detail-section" data-section="meta" data-section-title="Metadata">' +
      '<div class="detail-section-label">Metadata</div>' +
      '<div class="detail-kv-list">' +
        '<div class="dkv"><span class="dkv-k">Signal ID</span><span class="dkv-v">' + escapeHtml(sid) + '</span></div>' +
        '<div class="dkv"><span class="dkv-k">Category type</span><span class="dkv-v">' + escapeHtml(sig.category_type || "—") + '</span></div>' +
        '<div class="dkv"><span class="dkv-k">Generation mode</span><span class="dkv-v">' + escapeHtml(sig.generation_mode || "—") + '</span></div>' +
        '<div class="dkv"><span class="dkv-k">Taxonomy system</span><span class="dkv-v">' + escapeHtml(sig.taxonomy_system || "—") + '</span></div>' +
        (sig.external_taxonomy_id ? '<div class="dkv"><span class="dkv-k">External taxonomy</span><span class="dkv-v">' + escapeHtml(sig.external_taxonomy_id) + '</span></div>' : '') +
        '<div class="dkv"><span class="dkv-k">Data provider</span><span class="dkv-v">' + escapeHtml(sig.data_provider || "—") + '</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="detail-section" data-section="deployments" data-section-title="Deployments">' +
      '<div class="detail-section-label">Deployments</div>' +
      '<div class="detail-deployments">' +
        (Array.isArray(sig.deployments) && sig.deployments.length
          ? sig.deployments.map((d) => '<div class="detail-deployment"><span class="dep-platform">' + escapeHtml(d.platform || d.type) + '</span><span class="dep-live ' + (d.is_live ? "yes" : "") + '">' + (d.is_live ? "live" : "ready") + '</span></div>').join("")
          : '<div class="dep-live">No deployments declared</div>') +
      '</div>' +
    '</div>' +
    // Sec-37 B4: ID resolution matrix.
    (() => {
      const idInfo = idTypePills(sig);
      return '<div class="detail-section" data-section="id_resolution" data-section-title="ID resolution">' +
        '<div class="detail-section-label">ID resolution <span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px">' + idInfo.count + ' supported</span></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + idInfo.pills + ' ' + idInfo.cookielessPill + '</div>' +
        renderChartExplainer({
          what: "Which identifiers a buyer\\'s integration layer would accept for this audience.",
          how: "Derived from the signal\\'s DTS data_sources + audience_precision_levels (household / individual / device / browser / geography).",
          read: "More pills = broader addressability. Cookieless-ready means ≥1 non-3P-cookie ID is available (UID2 / RampID / hashed email / CTV).",
        }) +
      '</div>';
    })() +
    // Sec-37 B2: Reach & frequency forecaster.
    '<div class="detail-section" data-section="reach" data-section-title="Reach & frequency">' +
      '<div class="detail-section-label">Reach &amp; frequency <span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px">@</span> <span class="reach-budget-input" style="display:inline-flex"><span style="color:var(--text-mut)">$</span><input id="reach-budget" type="number" value="10000" min="500" max="10000000" step="500"/><span style="color:var(--text-mut)">/ 30d</span></span></div>' +
      '<div class="reach-block" id="reach-block"></div>' +
    '</div>' +
    // Sec-38 B4: Measurement & lift mock.
    '<div class="detail-section" data-section="measurement" data-section-title="Measurement & lift">' +
      '<div class="detail-section-label">Measurement &amp; lift <span class="pill pill-mut" style="margin-left:8px;font-size:10px">mock</span></div>' +
      '<div id="measurement-block" class="reach-block"></div>' +
    '</div>' +
    // Sec-38 B2: Cross-taxonomy bridge.
    (sig.x_cross_taxonomy && sig.x_cross_taxonomy.length
      ? '<div class="detail-section" data-section="cross_tax" data-section-title="Cross-taxonomy">' +
          '<div class="detail-section-label">Cross-taxonomy bridge <span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px">' + sig.x_cross_taxonomy.length + ' systems</span></div>' +
          '<div class="cross-tax-grid">' +
            sig.x_cross_taxonomy.map(function (e) {
              var stageClass = e.stage === "live" ? "pill-success" : e.stage === "modeled" ? "pill-info" : "pill-mut";
              return '<div class="cross-tax-row">' +
                '<div class="cross-tax-sys">' + escapeHtml(e.system) + '</div>' +
                '<div class="cross-tax-id"><code>' + escapeHtml(e.id) + '</code></div>' +
                '<div class="cross-tax-stage"><span class="pill ' + stageClass + '" style="font-size:10px">' + escapeHtml(e.stage) + '</span></div>' +
              '</div>';
            }).join("") +
          '</div>' +
          renderChartExplainer({
            what: "The same audience\\'s predicted ID in each major buyer-side taxonomy — so a HoldCo planner can locate it in their own stack.",
            how: "Deterministic per-signal hash. Demo-grade mapping; production would use a real bridge table driven by partner handshakes.",
            read: "Stage flag tells you confidence: live = direct match, modeled = heuristic, roadmap = not yet integrated.",
          }) +
        '</div>'
      : "") +
    // Sec-38 B8 (C4): Data lineage graph — span full so the 4-node flow has room.
    (sig.x_dts
      ? '<div class="detail-section span-full" data-section="lineage" data-section-title="Data lineage">' +
          '<div class="detail-section-label">Data lineage <span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px">provenance chain</span></div>' +
          renderLineageGraph(sig) +
          renderChartExplainer({
            what: "The provenance chain this audience flows through, from raw data sources to activation.",
            how: "Each node is pulled from the signal\\'s DTS label: data_sources → inclusion_methodology + refresh cadence → audience attributes → declared deployments.",
            read: "Read left-to-right. Wider methodology nodes (e.g. Observed/Known) mean fresher, less-modeled audiences — typically higher-lift but smaller scale.",
          }) +
        '</div>'
      : "") +
    // Sec-36: Similar signals — span full.
    '<div class="detail-section span-full" data-section="similar" data-section-title="Similar signals">' +
      '<div class="detail-section-label">Similar signals</div>' +
      '<div class="detail-similar" id="detail-similar-shell">' +
        '<button class="detail-similar-btn" id="detail-similar-btn">' +
          '<svg class="ico"><use href="#icon-network"/></svg>' +
          '<span>Find neighbors via <code style="font-size:11px">get_similar_signals</code></span>' +
        '</button>' +
      '</div>' +
    '</div>' +
    // IAB DTS v1.2 label — span full; uses <details> natively, so we bypass our collapse system.
    (sig.x_dts
      ? '<div class="detail-section span-full no-collapse" data-section="dts" data-section-title="DTS label">' +
          '<details class="dts-block">' +
            '<summary class="detail-section-label" style="cursor:pointer;user-select:none">' +
              '<span class="pill pill-success" style="margin-right:8px">DTS v' + escapeHtml(String(sig.x_dts.dts_version || "1.2")) + '</span>' +
              'IAB Data Transparency Label ' +
              '<span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0">(click to expand)</span>' +
            '</summary>' +
            renderDtsLabel(sig.x_dts) +
          '</details>' +
        '</div>'
      : "");

  document.getElementById("detail-footer").innerHTML =
    '<button class="btn-primary" id="detail-activate"><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate to mock_dsp</span></button>' +
    '<div class="activation-status" id="detail-status"></div>';
  document.getElementById("detail-activate").addEventListener("click", () => activateFromDetail(sig));

  // Wire the "find similar" button — lazy-loads only on click so the
  // panel renders instantly. Uses get_similar_signals with the panel's
  // signal as reference; scores come from cosine over the UCP embedding.
  const simBtn = document.getElementById("detail-similar-btn");
  if (simBtn) simBtn.addEventListener("click", () => loadSimilarForDetail(sig));

  // Reach forecaster — pure compute, re-renders on budget input change
  renderReachBlock(sig);
  renderMeasurementBlock(sig);
  const budgetInput = document.getElementById("reach-budget");
  if (budgetInput) {
    budgetInput.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v) && v > 0) {
        state.reach.budgetUsd = v;
        renderReachBlock(sig);
        renderMeasurementBlock(sig);
      }
    });
  }

  // MCP inspector wire
  const mcpBtn = document.getElementById("detail-mcp-inspect");
  if (mcpBtn) mcpBtn.addEventListener("click", () => openMcpInspector(sig));

  // Sec-39: detail panel UX upgrades.
  wireDetailSectionCollapse();
  renderDetailRail();
  applyDetailMode(state.ui.detailMode);
}

// Sec-39: detail panel UX — mode cycling + collapsed-section memory.
// state.ui is initialized in the main state object above.

// Cycle narrow -> wide -> full. Hitting expand on full goes back to narrow.
function cycleDetailMode() {
  var order = ["narrow", "wide", "full"];
  var cur = state.ui.detailMode || "narrow";
  var next = order[(order.indexOf(cur) + 1) % order.length];
  applyDetailMode(next);
}
function applyDetailMode(mode) {
  state.ui.detailMode = mode;
  var panel = document.getElementById("detail-panel");
  if (panel) panel.setAttribute("data-mode", mode);
  var btn = document.getElementById("detail-expand");
  if (btn) {
    btn.title = mode === "narrow" ? "Expand to wide (f)" : mode === "wide" ? "Expand to full (f)" : "Collapse to narrow (f)";
  }
}
// Each section has a clickable header (.detail-section-label) that toggles
// the .collapsed class on its parent .detail-section. Memory is per-title,
// so reopening another signal keeps the same sections expanded/collapsed.
function wireDetailSectionCollapse() {
  document.querySelectorAll("#detail-body .detail-section").forEach(function (sec) {
    if (sec.classList.contains("no-collapse")) return;
    var title = sec.dataset.sectionTitle || sec.dataset.section || "";
    if (state.ui.collapsedSections.has(title)) sec.classList.add("collapsed");
    var label = sec.querySelector(".detail-section-label");
    if (!label || label.__wired) return;
    label.__wired = true;
    label.addEventListener("click", function (ev) {
      // native <details> summary already handles its own toggle
      if (ev.target.closest("summary")) return;
      sec.classList.toggle("collapsed");
      if (sec.classList.contains("collapsed")) state.ui.collapsedSections.add(title);
      else state.ui.collapsedSections.delete(title);
    });
  });
}
// Side rail nav (visible in full mode). Lists every section with a jump link;
// uses IntersectionObserver to highlight the current section while scrolling.
function renderDetailRail() {
  var list = document.getElementById("detail-rail-list");
  if (!list) return;
  var sections = Array.from(document.querySelectorAll("#detail-body .detail-section"));
  list.innerHTML = sections.map(function (sec) {
    var id = sec.dataset.section || "";
    var title = sec.dataset.sectionTitle || id;
    return '<button class="detail-rail-item" data-target="' + escapeHtml(id) + '">' + escapeHtml(title) + '</button>';
  }).join("");
  list.querySelectorAll(".detail-rail-item").forEach(function (b) {
    b.addEventListener("click", function () {
      var target = document.querySelector("#detail-body .detail-section[data-section=\\"" + b.dataset.target + "\\"]");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  // Active-section tracking via IntersectionObserver
  if (window.__detailRailObserver) window.__detailRailObserver.disconnect();
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var sec = en.target;
      var id = sec.dataset.section;
      list.querySelectorAll(".detail-rail-item").forEach(function (b) {
        b.classList.toggle("active", b.dataset.target === id);
      });
    });
  }, { root: document.getElementById("detail-body"), rootMargin: "-20% 0px -60% 0px", threshold: 0 });
  sections.forEach(function (s) { io.observe(s); });
  window.__detailRailObserver = io;
}

// Sec-39: compact chart explainer block rendered beneath visualizations.
// Three labelled lines: what / how / read. Keeps explanations close to the
// chart they describe without cluttering the default view.
function renderChartExplainer(opts) {
  var what = opts.what || "";
  var how = opts.how || "";
  var read = opts.read || "";
  var limits = opts.limits || "";
  return '<div class="chart-explainer">' +
    '<div class="chart-explainer-head">' +
      '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7.5"/><line x1="10" y1="9" x2="10" y2="14" stroke-linecap="round"/><circle cx="10" cy="6.5" r="0.8" fill="currentColor"/></svg>' +
      '<span>How to read this</span>' +
    '</div>' +
    (what ? '<div class="chart-explainer-row"><span class="ce-k">What</span><span class="ce-v">' + escapeHtml(what) + '</span></div>' : '') +
    (how ? '<div class="chart-explainer-row"><span class="ce-k">How</span><span class="ce-v">' + escapeHtml(how) + '</span></div>' : '') +
    (read ? '<div class="chart-explainer-row"><span class="ce-k">Read</span><span class="ce-v">' + escapeHtml(read) + '</span></div>' : '') +
    (limits ? '<div class="chart-explainer-row"><span class="ce-k">Limits</span><span class="ce-v">' + escapeHtml(limits) + '</span></div>' : '') +
  '</div>';
}

// Sec-37 B2: Reach & frequency math. Inputs: audience size, CPM,
// budget. Output: reach (cap 80% of universe), avg frequency, daily
// impressions + unique-reach curve. Curve is a logistic-style
// saturation (reach grows fast early, asymptotes).
function renderReachBlock(sig) {
  const host = document.getElementById("reach-block");
  if (!host) return;
  const audience = sig.estimated_audience_size || 0;
  const cpmOpt = fmtCPM(sig);
  const cpm = cpmOpt.cpm ?? 5.0;
  const budget = state.reach.budgetUsd;
  const impressions = (budget * 1000) / cpm;
  const rawReach = audience > 0 ? Math.min(0.8, (impressions / (audience * 3))) : 0;
  const reach = Math.round(audience * rawReach);
  const freq = reach > 0 ? Math.min(8, impressions / reach) : 0;
  const daily = impressions / 30;

  // 30-day cumulative-reach curve: logistic saturation
  const curvePts = [];
  for (let day = 0; day <= 30; day++) {
    const fraction = 1 - Math.exp(-day / 7);
    curvePts.push({ x: day, y: reach * fraction });
  }
  const maxY = reach || 1;
  const path = curvePts.map((p, i) => (i === 0 ? "M" : "L") + (p.x * (300 / 30)) + "," + (50 - (p.y / maxY) * 45)).join(" ");

  host.innerHTML = '' +
    '<div class="reach-stats">' +
      '<div class="reach-stat"><div class="reach-stat-label">Unique reach</div><div class="reach-stat-value">' + fmtNumber(reach) + '</div></div>' +
      '<div class="reach-stat"><div class="reach-stat-label">Avg frequency</div><div class="reach-stat-value">' + freq.toFixed(1) + 'x</div></div>' +
      '<div class="reach-stat"><div class="reach-stat-label">Total impressions</div><div class="reach-stat-value">' + fmtNumber(Math.round(impressions)) + '</div></div>' +
      '<div class="reach-stat"><div class="reach-stat-label">Daily delivery</div><div class="reach-stat-value">' + fmtNumber(Math.round(daily)) + '</div></div>' +
    '</div>' +
    '<div style="font-size:10.5px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-top:10px;margin-bottom:4px">30-day cumulative reach</div>' +
    '<div class="reach-curve"><svg viewBox="0 0 300 50" preserveAspectRatio="none">' +
      '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="1.5"/>' +
      '<path d="' + path + ' L 300,50 L 0,50 Z" fill="var(--accent-dim)"/>' +
    '</svg></div>' +
    '<div style="font-size:10.5px;color:var(--text-mut);margin-top:8px">Methodology: CPM @ $' + cpm.toFixed(2) + ' · reach capped at 80% of addressable audience · logistic saturation τ=7 days. Mock — plug measurement partner for actuals.</div>' +
    renderChartExplainer({
      what: "Expected unique reach and frequency if you spent your budget against this signal over 30 days.",
      how: "impressions = (budget × 1000) / CPM. Unique reach = impressions / 3 (capped at 80% of audience). Frequency = impressions / reach. Curve uses 1 − e^(−day/7) saturation.",
      read: "Flatter curves = audience saturated — diminishing returns from further spend. Steeper curves = still room to reach more unique people.",
      limits: "Mock model. Real reach depends on DSP bid competition, frequency caps, and creative rotation.",
    });
}

// Sec-38 B8 (C4): Data lineage graph. Renders a horizontal 4-node flow
// summarizing the signal's provenance chain from x_dts fields the signal
// already carries. Nodes: (1) raw sources, (2) inclusion methodology,
// (3) audience expression, (4) distribution deployments. Connectors are
// simple SVG paths; no external graph library.
function renderLineageGraph(sig) {
  var dts = sig.x_dts || {};
  var sources = Array.isArray(dts.data_sources) ? dts.data_sources : ["Online Survey"];
  var methodology = dts.audience_inclusion_methodology || "Modeled";
  var refresh = dts.audience_refresh || "Static";
  var depPlatforms = (sig.deployments || []).map(function (d) { return d.platform || d.type; }).filter(Boolean);
  var categoryType = sig.category_type || "—";
  var size = sig.estimated_audience_size || 0;

  var nodes = [
    {
      label: "Raw sources",
      lines: sources.slice(0, 3),
      extra: sources.length > 3 ? "+" + (sources.length - 3) + " more" : "",
      color: "#2bd4a0",
    },
    {
      label: "Methodology",
      lines: [methodology, "Refresh: " + refresh],
      extra: "",
      color: "#4f8eff",
    },
    {
      label: "Audience",
      lines: [categoryType, fmtNumber(size) + " people"],
      extra: "",
      color: "#8b6eff",
    },
    {
      label: "Distribution",
      lines: depPlatforms.slice(0, 3),
      extra: depPlatforms.length > 3 ? "+" + (depPlatforms.length - 3) + " more" : "",
      color: "#ff7a5c",
    },
  ];

  var W = 680, H = 130;
  var nodeW = 140, nodeH = 74;
  var gap = (W - nodes.length * nodeW) / (nodes.length - 1);
  var yMid = (H - nodeH) / 2;
  var nodesSvg = nodes.map(function (n, i) {
    var x = i * (nodeW + gap);
    return '<g transform="translate(' + x + ',' + yMid + ')">' +
      '<rect x="0" y="0" width="' + nodeW + '" height="' + nodeH + '" rx="6" fill="' + n.color + '" fill-opacity="0.14" stroke="' + n.color + '" stroke-opacity="0.7" stroke-width="1.2"/>' +
      '<text x="10" y="18" fill="' + n.color + '" font-size="10.5" font-weight="700" font-family="ui-sans-serif" text-transform="uppercase">' + escapeHtml(n.label) + '</text>' +
      n.lines.map(function (ln, li) {
        return '<text x="10" y="' + (34 + li * 13) + '" fill="var(--text)" font-size="11" font-family="ui-monospace">' + escapeHtml(String(ln).slice(0, 22)) + '</text>';
      }).join("") +
      (n.extra ? '<text x="10" y="' + (34 + n.lines.length * 13) + '" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">' + escapeHtml(n.extra) + '</text>' : "") +
    '</g>';
  }).join("");

  var connectorsSvg = "";
  for (var i = 0; i < nodes.length - 1; i++) {
    var x1 = i * (nodeW + gap) + nodeW;
    var x2 = (i + 1) * (nodeW + gap);
    var y = yMid + nodeH / 2;
    connectorsSvg += '<path d="M' + x1 + ',' + y + ' C' + (x1 + gap / 2) + ',' + y + ' ' + (x1 + gap / 2) + ',' + y + ' ' + x2 + ',' + y + '" ' +
      'fill="none" stroke="var(--text-mut)" stroke-opacity="0.4" stroke-width="1.2" marker-end="url(#lineage-arrow)"/>';
  }

  return '<div class="lineage-graph">' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
      '<defs><marker id="lineage-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="var(--text-mut)" fill-opacity="0.5"/></marker></defs>' +
      connectorsSvg + nodesSvg +
    '</svg>' +
  '</div>';
}

// Sec-38 B4: Measurement & lift mock panel. Three sub-panels:
//   1) Lift forecast  — baseline vs exposed brand-awareness / purchase-intent
//                       delta modeled as a function of signal specificity.
//   2) Delivery sim   — daily pacing bars over 30 days (mock smooth delivery).
//   3) Campaign over  — overlap-with-existing-campaigns placeholder tile.
// All numbers are synthesized from (audience_size, cpm, budget) and the
// signal's specificity (category_type + has rules). Clearly mock.
function renderMeasurementBlock(sig) {
  var host = document.getElementById("measurement-block");
  if (!host) return;
  var audience = sig.estimated_audience_size || 0;
  var cpmOpt = fmtCPM(sig);
  var cpm = cpmOpt.cpm || 5.0;
  var budget = state.reach.budgetUsd;
  var impressions = (budget * 1000) / cpm;

  // Specificity score 0..1 — tightly-defined signals get higher lift.
  // Purchase-intent composites > interest > demographic > geo.
  var specScore =
    sig.category_type === "purchase_intent" ? 0.85
    : sig.category_type === "composite" ? 0.80
    : sig.category_type === "interest" ? 0.65
    : sig.category_type === "demographic" ? 0.45
    : 0.40;
  // Smaller audiences = more specific = higher lift (diminishing at extremes)
  var sizeFactor = audience > 0 ? Math.min(1, 50_000_000 / (audience + 1_000_000)) : 0.5;
  var liftPct = Math.max(2, Math.min(28, Math.round(specScore * sizeFactor * 32 * 10) / 10));
  var baselineCTR = 0.12;
  var exposedCTR = baselineCTR * (1 + liftPct / 100);

  // Delivery simulator — 30-day bars with weekend dip + small noise
  var bars = [];
  for (var d = 0; d < 30; d++) {
    var weekend = (d % 7 === 5 || d % 7 === 6) ? 0.75 : 1.0;
    var noise = 0.85 + (Math.sin(d * 0.7 + sig.signal_agent_segment_id.length) + 1) * 0.12;
    bars.push(weekend * noise);
  }
  var barMax = Math.max.apply(null, bars);
  var dailyImps = impressions / 30;

  // Campaign overlap — placeholder showing how a cleanroom match would work.
  // We draw 3 fake campaign rows with synthesized overlap % derived from
  // signal ID hash so it's stable per signal.
  function hashFrac(s, salt) {
    var h = 5381;
    var str = s + salt;
    for (var i = 0; i < str.length; i++) { h = ((h << 5) + h) ^ str.charCodeAt(i); h = h >>> 0; }
    return (h % 1000) / 1000;
  }
  var sid = sig.signal_agent_segment_id || "";
  var campaigns = [
    { name: "Q1 Awareness · Display",   overlap: Math.round(hashFrac(sid, "q1d") * 24 + 4) },
    { name: "Always-On · Retargeting",  overlap: Math.round(hashFrac(sid, "aor") * 38 + 10) },
    { name: "CTV · Brand Pulse",        overlap: Math.round(hashFrac(sid, "ctv") * 18 + 2) },
  ];

  var liftColor = liftPct >= 15 ? "var(--ok)" : liftPct >= 8 ? "var(--accent)" : "var(--warn)";

  host.innerHTML = '' +
    // Lift forecast
    '<div class="meas-row">' +
      '<div class="meas-cell">' +
        '<div class="reach-stat-label">Predicted brand-lift</div>' +
        '<div class="reach-stat-value" style="color:' + liftColor + '">+' + liftPct.toFixed(1) + '%</div>' +
        '<div style="font-size:10.5px;color:var(--text-mut);margin-top:2px">vs unexposed baseline</div>' +
      '</div>' +
      '<div class="meas-cell">' +
        '<div class="reach-stat-label">Exposed CTR (mock)</div>' +
        '<div class="reach-stat-value">' + (exposedCTR * 100).toFixed(2) + '%</div>' +
        '<div style="font-size:10.5px;color:var(--text-mut);margin-top:2px">baseline ' + (baselineCTR * 100).toFixed(2) + '%</div>' +
      '</div>' +
      '<div class="meas-cell">' +
        '<div class="reach-stat-label">Specificity score</div>' +
        '<div class="reach-stat-value">' + (specScore * 100).toFixed(0) + '</div>' +
        '<div style="font-size:10.5px;color:var(--text-mut);margin-top:2px">0-100 · drives lift</div>' +
      '</div>' +
    '</div>' +
    // Delivery simulator
    '<div style="font-size:10.5px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;margin-bottom:6px">Delivery simulator — 30-day pacing</div>' +
    '<div class="delivery-bars">' +
      bars.map(function (b, i) {
        var h = Math.max(4, Math.round((b / barMax) * 42));
        var isWknd = (i % 7 === 5 || i % 7 === 6);
        return '<div class="delivery-bar" title="Day ' + (i + 1) + ' · ~' + fmtNumber(Math.round(dailyImps * b)) + ' imps" style="height:' + h + 'px;opacity:' + (isWknd ? 0.55 : 1) + '"></div>';
      }).join("") +
    '</div>' +
    '<div style="font-size:10.5px;color:var(--text-mut);margin-top:4px">Smooth pacing · ~' + fmtNumber(Math.round(dailyImps)) + ' imps/day avg · weekends dip ~25%</div>' +
    // Campaign overlap placeholder
    '<div style="font-size:10.5px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;margin-bottom:6px">Overlap with existing campaigns <span style="text-transform:none;letter-spacing:0">(cleanroom-matched mock)</span></div>' +
    '<div class="campaign-overlap">' +
      campaigns.map(function (c) {
        return '<div class="campaign-row">' +
          '<div class="campaign-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="campaign-bar-wrap"><div class="campaign-bar" style="width:' + c.overlap + '%"></div></div>' +
          '<div class="campaign-pct">' + c.overlap + '%</div>' +
        '</div>';
      }).join("") +
    '</div>' +
    '<div style="font-size:10.5px;color:var(--text-mut);margin-top:8px">Methodology: lift modeled from signal specificity × size-coverage. Plug a measurement partner (Nielsen / IAS / DV / Kantar / Circana) for actuals. Campaign overlap would resolve via your 1P campaign IDs in a cleanroom.</div>' +
    renderChartExplainer({
      what: "Three sub-panels: predicted brand-lift, daily delivery pacing, and how much this audience overlaps with existing campaigns.",
      how: "Lift = specificity × size-factor × 32 (capped 2-28%). Specificity score leans on category (purchase_intent > composite > interest > demographic > geo). Pacing bars are synthetic daily impressions with a ~25% weekend dip. Campaign overlap % is a hashed placeholder for what a cleanroom match would return.",
      read: "Higher lift + steady pacing + low campaign overlap = best incremental reach. High overlap means you\\'d be re-buying the same people.",
      limits: "All three sub-panels are mocks clearly flagged at the capability level (ext.measurement.*.supported = \\"mock\\").",
    });
}

// Sec-37 B7: MCP inspector. Shows the get_signals{signal_ids:[sid]}
// exchange as it would appear on the wire. "Run live" replays it
// against /mcp and swaps the response with the actual result.
function openMcpInspector(sig) {
  const drawer = document.getElementById("mcp-drawer");
  const body = document.getElementById("mcp-drawer-body");
  const sid = sig.signal_agent_segment_id || sig.signal_id?.id || "";
  document.getElementById("mcp-drawer-title").textContent = "MCP exchange · " + sig.name;
  const request = {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: {
      name: "get_signals",
      arguments: {
        signal_ids: [sid],
        deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
        max_results: 1,
      },
    },
  };
  // Synthesize the expected response shape from the signal we already have
  const response = {
    jsonrpc: "2.0", id: 1,
    result: {
      content: [{ type: "text", text: "[synthesized — run live to fetch]" }],
      isError: false,
      structuredContent: {
        message: "Found 1 signal",
        context_id: "inspect_" + Date.now(),
        signals: [sig],
        count: 1,
        totalCount: 1,
        offset: 0,
        hasMore: false,
      },
    },
  };
  body.innerHTML = '' +
    '<div class="mcp-drawer-section">' +
      '<div class="mcp-drawer-label"><span>Request — POST /mcp</span><button class="copy-btn" data-copy="req">copy</button></div>' +
      '<pre class="caps-raw-json" id="mcp-req" style="max-height:280px">' + highlightJson(JSON.stringify(request, null, 2)) + '</pre>' +
    '</div>' +
    '<div class="mcp-drawer-section">' +
      '<div class="mcp-drawer-label"><span>Response (synthesized)</span><button class="copy-btn" data-copy="resp">copy</button></div>' +
      '<pre class="caps-raw-json" id="mcp-resp" style="max-height:420px">' + highlightJson(JSON.stringify(response, null, 2)) + '</pre>' +
    '</div>';
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  // Copy buttons
  body.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.copy;
      const payload = key === "req" ? request : response;
      try {
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        showToast((key === "req" ? "Request" : "Response") + " copied");
      } catch { showToast("Copy failed", true); }
    });
  });
  // Run-live replaces the synthesized response with the actual one
  document.getElementById("mcp-drawer-run").onclick = async () => {
    const respEl = document.getElementById("mcp-resp");
    respEl.innerHTML = '<span class="spinner"></span> firing /mcp…';
    try {
      const r = await fetch("/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
        body: JSON.stringify(request),
      });
      const actual = await r.json();
      respEl.innerHTML = highlightJson(JSON.stringify(actual, null, 2));
      document.querySelector("#mcp-drawer-body .mcp-drawer-section:last-child .mcp-drawer-label span").textContent = "Response — live " + r.status;
    } catch (e) {
      respEl.innerHTML = '<span style="color:var(--error)">' + escapeHtml(e.message) + '</span>';
    }
  };
}

document.getElementById("mcp-drawer-close").addEventListener("click", () => {
  document.getElementById("mcp-drawer").classList.remove("open");
});

async function loadSimilarForDetail(sig) {
  const shell = document.getElementById("detail-similar-shell");
  const sid = sig.signal_agent_segment_id || sig.signal_id?.id || "";
  shell.innerHTML = '<div style="color:var(--text-mut);font-size:12px;padding:4px 0"><span class="spinner"></span>Computing nearest neighbors…</div>';
  try {
    const data = await callTool("get_similar_signals", {
      signal_agent_segment_id: sid,
      top_k: 5,
      min_similarity: 0.3,
      deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
    });
    const results = (data?.results || []).filter((r) => {
      const rsid = r.signal_agent_segment_id || r.signal_id?.id;
      return rsid && rsid !== sid;
    });
    if (results.length === 0) {
      shell.innerHTML = '<div style="color:var(--text-mut);font-size:12px;padding:4px 0">No neighbors above the 0.3 cosine threshold. This signal is semantically isolated in the catalog.</div>';
      return;
    }
    shell.innerHTML =
      '<div style="font-size:10.5px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Top ' + results.length + ' neighbors (cosine similarity)</div>' +
      '<div class="detail-similar-list">' +
        results.map((r) => {
          const rsid = r.signal_agent_segment_id || r.signal_id?.id || "";
          const score = typeof r.cosine_similarity === "number" ? r.cosine_similarity.toFixed(3) : "—";
          return '<div class="detail-similar-item" data-sid="' + escapeHtml(rsid) + '">' +
            '<div class="ds-name">' + escapeHtml(r.name || "") + '</div>' +
            '<span class="ds-score">' + score + '</span>' +
          '</div>';
        }).join("") +
      '</div>';
    shell.querySelectorAll(".detail-similar-item").forEach((el) => {
      el.addEventListener("click", () => {
        const nsid = el.dataset.sid;
        const nsig = results.find((r) => (r.signal_agent_segment_id || r.signal_id?.id) === nsid);
        if (nsig) openDetail(nsig);
      });
    });
  } catch (e) {
    shell.innerHTML = '<div style="color:var(--error);font-size:12px;padding:4px 0">✗ ' + escapeHtml(e.message) + '</div>';
  }
}

function closeDetail() {
  document.getElementById("detail-panel").classList.remove("open");
  document.getElementById("backdrop").classList.remove("open");
  state.detail = null;
}
document.getElementById("detail-close").addEventListener("click", closeDetail);
document.getElementById("backdrop").addEventListener("click", closeDetail);
// Sec-39: expand cycles mode; collapse-all toggles all sections folded/unfolded
document.getElementById("detail-expand").addEventListener("click", cycleDetailMode);
document.getElementById("detail-collapse-all").addEventListener("click", function () {
  var secs = Array.from(document.querySelectorAll("#detail-body .detail-section:not(.no-collapse)"));
  var anyOpen = secs.some(function (s) { return !s.classList.contains("collapsed"); });
  secs.forEach(function (s) {
    var title = s.dataset.sectionTitle || s.dataset.section || "";
    s.classList.toggle("collapsed", anyOpen);
    if (anyOpen) state.ui.collapsedSections.add(title);
    else state.ui.collapsedSections.delete(title);
  });
});
// Esc + f are handled inside the main keydown listener below (Sec-39).

async function activateFromDetail(sig) {
  const btn = document.getElementById("detail-activate");
  const status = document.getElementById("detail-status");
  btn.disabled = true;
  status.innerHTML = '<span class="spinner"></span> activating…';

  const sid = sig.signal_agent_segment_id || sig.signal_id?.id || "";
  try {
    const act = await callTool("activate_signal", {
      signal_agent_segment_id: sid,
      deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
    });
    // Sec-31w-final: AdCP v3 spec moves task_id off the activate-signal
    // response payload (envelope-level per protocol-envelope.json).
    // MCP server now emits it inside ext for clients that need to poll.
    // Read both shapes for backward-compat: top-level first, then ext.
    const taskId = act.task_id ?? act.ext?.task_id;
    if (!taskId) {
      status.className = "activation-status success";
      status.textContent = "✓ activated (sync, no task to poll)";
      return;
    }
    status.innerHTML = '<span class="spinner"></span> polling task ' + taskId.slice(0, 14) + '…';

    let finalState = null;
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1200));
      const op = await callTool("get_operation_status", { task_id: taskId });
      if (op.status === "completed" || op.status === "failed") { finalState = op; break; }
      status.innerHTML = '<span class="spinner"></span> ' + op.status + ' · ' + (i + 1) + '/8';
    }

    if (finalState && finalState.status === "completed") {
      status.className = "activation-status success";
      status.textContent = "✓ activated";
      const deps = (finalState.deployments || []).map((d) => {
        const key = d.activation_key?.segment_id || "";
        return '<div class="ak-row"><span class="ak-platform">' + escapeHtml(d.platform || d.type) + '</span> → <span class="ak-key">' + escapeHtml(key) + '</span></div>';
      }).join("");
      document.getElementById("detail-footer").insertAdjacentHTML("beforeend",
        '<div class="activation-keys">' + (deps || '<div>No deployments returned</div>') + '</div>');
    } else if (finalState && finalState.status === "failed") {
      status.className = "activation-status error";
      status.textContent = "✗ activation failed";
    } else {
      status.className = "activation-status";
      status.textContent = "still processing (task " + taskId.slice(0, 14) + "…)";
    }
  } catch (e) {
    status.className = "activation-status error";
    status.textContent = "✗ " + e.message;
    btn.disabled = false;
  }
}

//────────────────────────────────────────────────────────────────────────
// §4 Treemap — d3-hierarchy squarify, vanilla SVG via DOM API
//────────────────────────────────────────────────────────────────────────
async function ensureTreemap() {
  if (state.treemap.rendered) return;
  if (state.catalog.all.length === 0) await loadCatalog();
  renderTreemap();
  state.treemap.rendered = true;
  var tmExpl = document.getElementById("treemap-explainer");
  if (tmExpl) tmExpl.innerHTML = renderChartExplainer({
    what: "The whole marketplace at a glance. Each cell is one audience.",
    how: "Treemap layout via d3-hierarchy squarify. Cell area \u221d estimated audience size. Cell color = category type (demographic / interest / purchase-intent / geo / composite).",
    read: "Biggest cells = broadest audiences. Clusters of same-color cells reveal where the catalog is deep (interest) vs narrow (purchase intent). Click any cell to open its detail panel.",
  });

  // Re-layout on container resize
  if (typeof ResizeObserver !== "undefined" && !state.treemap.resizeObserver) {
    const canvas = document.getElementById("treemap-canvas");
    state.treemap.resizeObserver = new ResizeObserver(() => {
      if (document.querySelector(".tab-pane[data-tab=treemap]").classList.contains("active")) {
        renderTreemap();
      }
    });
    state.treemap.resizeObserver.observe(canvas);
  }
}

// Category palette — HSL rotation with fixed S/L so all categories
// look cohesive regardless of how many we have. Skips political-hue
// reds (used for errors) and very-close hues.
`;
