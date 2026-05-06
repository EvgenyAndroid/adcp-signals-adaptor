// src/demo/script/fragments/portfolio.ts
//
// Portfolio optimizer: subtab wiring, optimizer flow, lorenz card, brief-derived flow.
//
// Source range (in pre-refactor src/demo/script.ts): lines 4939..5393 (455 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const portfolioJs = `function wirePortSubtabs() {
  document.querySelectorAll(".lab-subtab[data-port]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.dataset.port;
      document.querySelectorAll(".lab-subtab[data-port]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      document.querySelectorAll(".lab-subpanel[data-port-panel]").forEach(function (p) {
        p.style.display = p.dataset.portPanel === target ? "" : "none";
      });
    });
  });
}
async function renderPortPareto() {
  var host = document.getElementById("port-pareto-viz");
  try {
    // Pull both the Pareto frontier AND the full catalog so we can show
    // dominated points as context behind the highlighted frontier.
    if (state.catalog.all.length === 0) await loadCatalog();
    var r = await fetch("/portfolio/pareto");
    var data = await r.json();
    var frontier = data.frontier || [];
    if (!frontier.length) { host.innerHTML = '<div class="empty-state"><div class="empty-title">No frontier points</div></div>'; return; }
    var frontierIds = new Set(frontier.map(function (p) { return p.signal_id; }));
    // Build all-points list from catalog (dominated + frontier)
    var allPoints = state.catalog.all
      .filter(function (s) { return (s.estimated_audience_size || 0) > 0 && fmtCPM(s).cpm > 0; })
      .map(function (s) {
        var cpm = fmtCPM(s).cpm;
        var specificity = s.category_type === "purchase_intent" ? 0.85
          : s.category_type === "composite" ? 0.80
          : s.category_type === "interest" ? 0.65
          : s.category_type === "demographic" ? 0.45 : 0.40;
        return {
          signal_id: s.signal_agent_segment_id,
          name: s.name,
          reach: s.estimated_audience_size,
          cpm: cpm,
          specificity: specificity,
          category: s.category_type,
          on_frontier: frontierIds.has(s.signal_agent_segment_id),
        };
      });
    if (!allPoints.length) allPoints = frontier.map(function (p) { return Object.assign({}, p, { on_frontier: true }); });

    var reaches = allPoints.map(function (p) { return p.reach; });
    var cpms = allPoints.map(function (p) { return p.cpm; });
    var rMinLog = Math.log10(Math.max(1, Math.min.apply(null, reaches)) + 1);
    var rMaxLog = Math.log10(Math.max.apply(null, reaches) + 1);
    var cMin = 0;
    var cMax = Math.max.apply(null, cpms);
    cMax = Math.ceil(cMax * 1.1);
    // Expand a bit so dots at extremes aren't clipped
    var xPad = (rMaxLog - rMinLog) * 0.05 || 0.5;
    rMinLog = Math.max(0, rMinLog - xPad);
    rMaxLog = rMaxLog + xPad;

    var W = 760, H = 460, padL = 60, padR = 28, padT = 24, padB = 52;
    var colorMap = { demographic: "#4f8eff", interest: "#8b6eff", purchase_intent: "#ff7a5c", geo: "#2bd4a0", composite: "#ffcb5c" };
    function sx(reach) { return padL + (Math.log10(reach + 1) - rMinLog) / (rMaxLog - rMinLog + 1e-9) * (W - padL - padR); }
    function sy(cpm)   { return H - padB - (cpm - cMin) / (cMax - cMin + 1e-9) * (H - padT - padB); }

    // X tick marks: log scale, so use round powers of 10 between min and max reach
    var xTicks = [];
    var decStart = Math.floor(rMinLog);
    var decEnd = Math.ceil(rMaxLog);
    for (var d = decStart; d <= decEnd; d++) {
      var v = Math.pow(10, d);
      if (Math.log10(v + 1) >= rMinLog - 0.01 && Math.log10(v + 1) <= rMaxLog + 0.01) {
        xTicks.push({ v: v, label: v >= 1e9 ? (v / 1e9) + "B" : v >= 1e6 ? (v / 1e6) + "M" : v >= 1e3 ? (v / 1e3) + "K" : String(v) });
      }
    }
    // Y tick marks: 5 evenly-spaced round dollar values
    var yTicks = [];
    for (var i = 0; i <= 5; i++) {
      var yv = cMin + (cMax - cMin) * i / 5;
      yTicks.push({ v: yv, label: "$" + yv.toFixed(yv >= 10 ? 0 : 1) });
    }

    var gridlines = '';
    xTicks.forEach(function (t) {
      var x = sx(t.v);
      gridlines += '<line x1="' + x + '" y1="' + padT + '" x2="' + x + '" y2="' + (H - padB) + '" stroke="var(--border)" stroke-opacity="0.35" stroke-dasharray="2,3"/>';
      gridlines += '<text x="' + x + '" y="' + (H - padB + 16) + '" text-anchor="middle" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">' + t.label + '</text>';
    });
    yTicks.forEach(function (t) {
      var y = sy(t.v);
      gridlines += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="var(--border)" stroke-opacity="0.35" stroke-dasharray="2,3"/>';
      gridlines += '<text x="' + (padL - 8) + '" y="' + (y + 3) + '" text-anchor="end" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">' + t.label + '</text>';
    });

    // Draw dominated first (behind), then frontier (in front, gold halo)
    function dot(p, isFrontier) {
      var radius = isFrontier ? (4.5 + (p.specificity || 0) * 5) : 3;
      var color = colorMap[p.category] || "#8892a6";
      var stroke = isFrontier ? 'stroke="gold" stroke-width="1.3"' : 'stroke="rgba(255,255,255,0.1)" stroke-width="0.5"';
      var op = isFrontier ? 0.9 : 0.35;
      return '<circle cx="' + sx(p.reach).toFixed(1) + '" cy="' + sy(p.cpm).toFixed(1) + '" r="' + radius.toFixed(1) + '" fill="' + color + '" fill-opacity="' + op + '" ' + stroke + ' data-sid="' + escapeHtml(p.signal_id) + '" class="' + (isFrontier ? 'pareto-front' : 'pareto-dom') + '">' +
        '<title>' + escapeHtml(p.name) + ' · reach=' + (p.reach / 1e6).toFixed(1) + 'M · CPM=$' + p.cpm.toFixed(2) + ' · spec=' + (p.specificity || 0).toFixed(2) + (isFrontier ? ' · PARETO-OPTIMAL' : '') + '</title>' +
      '</circle>';
    }
    var dominated = allPoints.filter(function (p) { return !p.on_frontier; }).map(function (p) { return dot(p, false); }).join("");
    var front = allPoints.filter(function (p) { return p.on_frontier; }).map(function (p) { return dot(p, true); }).join("");

    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" class="pareto-svg">' +
      gridlines +
      // Axes
      '<line x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '" stroke="var(--border)" stroke-width="1"/>' +
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (H - padB) + '" stroke="var(--border)" stroke-width="1"/>' +
      // Axis titles
      '<text x="' + ((padL + W - padR) / 2) + '" y="' + (H - 8) + '" text-anchor="middle" fill="var(--text)" font-size="11" font-weight="600">Reach (log scale, unique audience)</text>' +
      '<text x="16" y="' + ((padT + H - padB) / 2) + '" text-anchor="middle" fill="var(--text)" font-size="11" font-weight="600" transform="rotate(-90, 16, ' + ((padT + H - padB) / 2) + ')">CPM ($)</text>' +
      dominated + front +
    '</svg>' +
    // Summary cards
    '<div class="pareto-stats">' +
      '<div class="lab-stat-card"><div class="lab-stat-label">Total signals</div><div class="lab-stat-val">' + allPoints.length + '</div></div>' +
      '<div class="lab-stat-card"><div class="lab-stat-label">On frontier</div><div class="lab-stat-val" style="color:gold">' + frontier.length + '</div></div>' +
      '<div class="lab-stat-card"><div class="lab-stat-label">Most reach</div><div class="lab-stat-val" style="font-size:13px">' + escapeHtml(data.summary.most_reach || "—") + '</div></div>' +
      '<div class="lab-stat-card"><div class="lab-stat-label">Lowest CPM</div><div class="lab-stat-val" style="font-size:13px">' + escapeHtml(data.summary.lowest_cost || "—") + '</div></div>' +
    '</div>' +
    '<div class="pareto-legend">' +
      Object.keys(colorMap).map(function (k) { return '<span class="pl-item"><span class="pl-dot" style="background:' + colorMap[k] + '"></span>' + k.replace("_", " ") + '</span>'; }).join('') +
      '<span class="pl-item" style="margin-left:auto"><span class="pl-dot" style="background:transparent;border:1.5px solid gold"></span>Pareto-optimal</span>' +
      '<span class="pl-item"><span class="pl-dot" style="background:#8892a6;opacity:0.45"></span>dominated</span>' +
    '</div>';
    document.getElementById("port-pareto-explainer").innerHTML = renderChartExplainer({
      what: "Every signal in the catalog plotted as reach (log-scale X) vs CPM (Y). Gold-outlined dots are Pareto-efficient — no other signal beats them on all three of {more reach, less CPM, more specificity}.",
      how: "A signal is Pareto-efficient if no other signal has \u2265 reach AND \u2264 CPM AND \u2265 specificity (with at least one strict inequality). Dot radius \u221d specificity score; color = category type. Frontier: " + frontier.length + " of " + allPoints.length + " candidates.",
      read: "Upper-left = premium-CPM niche audiences. Lower-right = cheap broad reach. Gold dots are the only rational picks — dominated dots are strictly worse than at least one gold dot. Click any dot to open its detail panel.",
      limits: "Static snapshot. Ignores temporal availability and deployment-platform compatibility. Specificity is heuristic (category-derived).",
    });
    host.querySelectorAll("circle").forEach(function (el) { if (el.dataset.sid) el.addEventListener("click", function () { openDetailHydrated(el.dataset.sid); }); });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Could not load frontier: ' + escapeHtml(String(e.message || e)) + '</div></div>';
  }
}
function wirePortOptimizer() {
  document.getElementById("opt-run").addEventListener("click", async function () {
    var host = document.getElementById("opt-results");
    host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Running greedy solver\u2026</div></div>';
    var body = {
      budget: parseFloat(document.getElementById("opt-budget").value) || 250000,
      max_signals: parseInt(document.getElementById("opt-max-sig").value, 10) || 6,
    };
    var target = parseFloat(document.getElementById("opt-target").value);
    if (target > 0) body.target_reach = target;
    try {
      var r = await fetch("/portfolio/optimize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      var data = await r.json();
      if (data.picked.length === 0) { host.innerHTML = '<div class="empty-state"><div class="empty-title">No signals fit budget</div></div>'; return; }
      // Waterfall with per-row activate + bulk action bar
      var maxMarg = Math.max.apply(null, data.picked.map(function (p) { return p.marginal_reach; }));
      var wf = '<div class="opt-waterfall">' + data.picked.map(function (p, i) {
        var pct = maxMarg > 0 ? (p.marginal_reach / maxMarg) * 100 : 0;
        return '<div class="opt-row" data-sid="' + escapeHtml(p.signal_id) + '">' +
          '<div class="opt-rank">' + (i + 1) + '</div>' +
          '<div class="opt-name">' + escapeHtml(p.name) + '<br><span class="mono" style="font-size:10.5px;color:var(--text-mut)">$' + p.cost.toFixed(0) + ' \u00b7 CPM $' + p.cpm.toFixed(2) + '</span></div>' +
          '<div class="opt-bar"><div class="opt-bar-fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
          '<div class="opt-margin mono">+' + (p.marginal_reach / 1e6).toFixed(2) + 'M</div>' +
          '<button class="err-activate" data-opt-activate="' + escapeHtml(p.signal_id) + '" title="Activate to mock_dsp"><svg class="ico"><use href="#icon-bolt"/></svg></button>' +
        '</div>';
      }).join("") + '</div>';
      var summary = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Total cost</div><div class="lab-stat-val">$' + data.total_cost.toLocaleString() + '</div></div>' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Unique reach</div><div class="lab-stat-val">' + (data.total_unique_reach / 1e6).toFixed(1) + 'M</div></div>' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Efficiency</div><div class="lab-stat-val">' + data.efficiency.toLocaleString() + '/k$</div></div>' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Overlap waste</div><div class="lab-stat-val">' + (data.overlap_waste / 1e6).toFixed(1) + 'M</div></div>' +
      '</div>';
      var actionBar = '<div class="campaign-cta">' +
        '<div class="campaign-cta-info"><strong>' + data.picked.length + '-signal portfolio</strong> \u2014 budget $' + data.total_cost.toLocaleString() + ', reach ' + (data.total_unique_reach / 1e6).toFixed(1) + 'M</div>' +
        '<button class="btn-secondary" data-opt-action="export" style="padding:6px 14px">Export plan</button>' +
        '<button class="btn-secondary" data-opt-action="builder" style="padding:6px 14px">Open in Builder</button>' +
        '<button class="btn-primary" data-opt-action="activate-all" style="padding:6px 14px"><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate portfolio</span></button>' +
      '</div>';
      host.innerHTML = summary + actionBar + wf;
      // Wire
      host.querySelectorAll('[data-opt-activate]').forEach(function (b) {
        b.addEventListener('click', async function (e) {
          e.stopPropagation();
          var sid = b.dataset.optActivate;
          b.disabled = true;
          try { await callTool("activate_signal", _activateArgs(sid)); showToast("\u2713 Activated"); b.classList.add("err-activated"); }
          catch (err) { showToast("Failed: " + err.message, true); b.disabled = false; }
        });
      });
      host.querySelectorAll('[data-opt-action]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var act = btn.dataset.optAction;
          if (act === "activate-all") {
            showToast("Activating portfolio (" + data.picked.length + " signals)\u2026");
            var res = await Promise.allSettled(data.picked.map(function (p) { return callTool("activate_signal", _activateArgs(p.signal_id)); }));
            var ok = res.filter(function (x) { return x.status === "fulfilled"; }).length;
            showToast("\u2713 Portfolio activated: " + ok + "/" + data.picked.length);
          } else if (act === "export") {
            function esc(v) { var s = v == null ? "" : String(v); return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
            var hdr = "rank,signal_id,name,cost,cpm,marginal_reach,cumulative_reach";
            var rws = data.picked.map(function (p, i) { return [i + 1, p.signal_id, p.name, p.cost, p.cpm, p.marginal_reach, p.cumulative_reach].map(esc).join(","); });
            var blob = new Blob([hdr + "\\n" + rws.join("\\n")], { type: "text/csv" });
            var url = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = url; a.download = "portfolio-optimized.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            showToast("Portfolio exported");
          } else if (act === "builder") {
            if (!state.catalog.all.length) await loadCatalog();
            _builderStack.selected = data.picked.map(function (p) {
              return state.catalog.all.find(function (s) { return s.signal_agent_segment_id === p.signal_id; });
            }).filter(Boolean);
            switchTab("builder");
            showToast("Opened in Builder");
          }
        });
      });
      host.querySelectorAll('.opt-row').forEach(function (row) {
        row.addEventListener('click', function (e) { if (e.target.closest('button')) return; if (row.dataset.sid) openDetailHydrated(row.dataset.sid); });
      });
      document.getElementById("opt-explainer").innerHTML = renderChartExplainer({
        what: "Greedy portfolio: signals picked one at a time, each iteration the one adding the most unique reach. <strong>Activate portfolio</strong> fires them all in parallel.",
        how: "At each step: for each candidate not yet picked, compute marginal reach = reach \u2212 \u03a3 (jaccard\u00d7min_reach) across already-picked. Pick the one maximizing marginal reach, subject to budget. Cost = reach \u00d7 CPM / 1000.",
        read: "Earlier tall bars = high-value standalones. Later shorter bars = saturating \u2014 overlap with existing picks eats into gains. Click any row's bolt icon to activate just that one; \u201cActivate portfolio\u201d fires everything.",
        limits: "Heuristic Jaccard for overlap; real deduplication needs cleanroom-matched actual audience membership.",
      });
    } catch (e) {
      host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    }
  });
}
async function renderPortLorenz() {
  var host = document.getElementById("port-lorenz-viz");
  try {
    var r = await fetch("/analytics/lorenz?group=vertical");
    var data = await r.json();
    // Render small multiples: one mini chart per top-6 slice + overall
    var picks = (data.slices || []).slice(0, 6);
    var cards = picks.map(function (s, i) { return renderLorenzCard(s, i + 1); }).join("");
    var overall = renderLorenzCard({ group: "OVERALL", signal_count: data.overall.signal_count, lorenz: data.overall.lorenz, gini: data.overall.gini, interpretation: data.overall.interpretation }, 0);
    host.innerHTML = '<div class="lorenz-grid">' + overall + cards + '</div>';
    document.getElementById("port-lorenz-explainer").innerHTML = renderChartExplainer({
      what: "Catalog concentration per vertical. How evenly audience reach is distributed across signals in each group.",
      how: "Lorenz curve: cumulative signal share (x) vs cumulative audience share (y). Gini = 2 \u00d7 area between the curve and y=x. 0 = perfect equality, 1 = one signal owns everything.",
      read: "Gini < 0.2 = balanced \u2014 many comparable signals. Gini > 0.5 = top-heavy \u2014 consolidate or add niche coverage.",
      limits: "Based on declared estimated_audience_size; does not capture true measured reach.",
    });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
  }
}
function renderLorenzCard(s, staggerIdx) {
  var W = 200, H = 140, pad = 20;
  var lz = s.lorenz || [];
  var pts = lz.map(function (p) { return pad + p.x * (W - 2 * pad) + "," + (H - pad - p.y * (H - 2 * pad)); }).join(" ");
  // Stagger entry — index drives --ux-stagger-i (80ms steps) so cards
  // fade-lift in cascade and curves draw left→right.
  var staggerStyle = typeof staggerIdx === "number" ? ' style="--ux-stagger-i:' + staggerIdx + '"' : "";
  // Sec-31u T2#11: hover-scrubber. Invisible-ish dots at each datapoint
  // with native SVG <title> tooltips show exact x (cumulative %) and y
  // (cumulative reach %) values. Filled area-under-curve also added
  // for visual weight.
  var areaPts = pts ? (pad + "," + (H - pad) + " " + pts + " " + (W - pad) + "," + (H - pad)) : "";
  var hoverDots = lz.map(function (p, i) {
    var cx = (pad + p.x * (W - 2 * pad)).toFixed(1);
    var cy = (H - pad - p.y * (H - 2 * pad)).toFixed(1);
    var tt = "x=" + (p.x * 100).toFixed(0) + "% of signals → y=" + (p.y * 100).toFixed(0) + "% of reach";
    return '<circle class="lorenz-dot" cx="' + cx + '" cy="' + cy + '" r="3" fill="var(--accent)" opacity="0.55"><title>' + escapeHtml(tt) + '</title></circle>';
  }).join("");
  return '<div class="lorenz-card"' + staggerStyle + '>' +
    '<div class="lorenz-title">' + escapeHtml(s.group) + ' <span class="lorenz-gini">Gini ' + s.gini.toFixed(2) + '</span></div>' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '">' +
      '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + pad + '" stroke="var(--text-mut)" stroke-dasharray="3,2" stroke-width="1"/>' +
      (areaPts ? '<polygon fill="var(--accent)" fill-opacity="0.10" points="' + areaPts + '"/>' : "") +
      '<polyline fill="none" stroke="var(--accent)" stroke-width="1.5" points="' + pts + '"/>' +
      hoverDots +
    '</svg>' +
    '<div class="lorenz-count mono">' + s.signal_count + ' signals</div>' +
  '</div>';
}
function wirePortFromBrief() {
  // Sec-31u: try-chips fill the brief textarea + budget + auto-submit.
  // Click → populate fields → fire the existing brief-run handler so
  // there's exactly one code path for brief execution.
  document.querySelectorAll("#port-brief-chips .brief-try-chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      var brief = chip.getAttribute("data-brief") || "";
      var budget = chip.getAttribute("data-budget") || "250000";
      var briefEl = document.getElementById("brief-text");
      var budgetEl = document.getElementById("brief-budget");
      if (briefEl) briefEl.value = brief;
      if (budgetEl) budgetEl.value = budget;
      // Mark this chip as the active selection
      document.querySelectorAll("#port-brief-chips .brief-try-chip").forEach(function (c) {
        c.classList.toggle("is-active", c === chip);
      });
      // Auto-submit
      var runBtn = document.getElementById("brief-run");
      if (runBtn) runBtn.click();
    });
  });
  document.getElementById("brief-run").addEventListener("click", async function () {
    var host = document.getElementById("brief-results");
    var brief = document.getElementById("brief-text").value.trim();
    if (!brief) { host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Paste a brief first</div></div>'; return; }
    host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Composing portfolio\u2026</div></div>';
    try {
      var r = await fetch("/portfolio/from-brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: brief, budget: parseFloat(document.getElementById("brief-budget").value) || 250000 }) });
      var data = await r.json();
      var rows = data.portfolio.map(function (p) {
        return '<div class="brief-row" data-sid="' + escapeHtml(p.signal_id) + '">' +
          '<label class="err-check" title="Add to shortlist"><input type="checkbox" data-brief-sl="' + escapeHtml(p.signal_id) + '"' + (shortlistHas(p.signal_id) ? ' checked' : '') + '/></label>' +
          '<div class="brief-rank">' + p.rank + '</div>' +
          '<div class="brief-main"><div class="brief-name">' + escapeHtml(p.name) + '</div><div class="brief-reason mono">' + escapeHtml(p.reasoning) + '</div></div>' +
          '<div class="brief-alloc mono">' + p.allocation_pct + '%</div>' +
          '<button class="err-activate" data-brief-activate="' + escapeHtml(p.signal_id) + '" title="Activate to mock_dsp"><svg class="ico"><use href="#icon-bolt"/></svg></button>' +
        '</div>';
      }).join("");
      // Primary CTA: Activate entire campaign — the "what do I do now" answer
      var campaignBar =
        '<div class="campaign-cta">' +
          '<div class="campaign-cta-info"><strong>' + data.portfolio.length + '-signal campaign</strong> composed from your brief. Total reach ' + (data.total_unique_reach / 1e6).toFixed(1) + 'M at $' + data.total_cost.toLocaleString() + '.</div>' +
          '<button class="btn-secondary" data-brief-action="export" style="padding:6px 14px">Export plan</button>' +
          '<button class="btn-secondary" data-brief-action="builder" style="padding:6px 14px">Open in Builder</button>' +
          '<button class="btn-primary" data-brief-action="activate-all" style="padding:6px 14px"><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate campaign</span></button>' +
        '</div>';
      host.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Total cost</div><div class="lab-stat-val">$' + data.total_cost.toLocaleString() + '</div></div>' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Unique reach</div><div class="lab-stat-val">' + (data.total_unique_reach / 1e6).toFixed(1) + 'M</div></div>' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Candidates</div><div class="lab-stat-val">' + data.candidates_from_embedding + '</div></div>' +
      '</div>' + campaignBar + rows;
      // Wire brief-level actions
      host.querySelectorAll('[data-brief-activate]').forEach(function (b) {
        b.addEventListener('click', async function (e) {
          e.stopPropagation();
          var sid = b.dataset.briefActivate;
          b.disabled = true;
          try { await callTool("activate_signal", _activateArgs(sid)); showToast("\u2713 Activated " + sid); b.classList.add("err-activated"); }
          catch (err) { showToast("Failed: " + err.message, true); b.disabled = false; }
        });
      });
      host.querySelectorAll('[data-brief-sl]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var sid = cb.dataset.briefSl;
          var row = cb.closest('.brief-row');
          var item = data.portfolio.find(function (p) { return p.signal_id === sid; });
          shortlistToggle(sid, item ? item.name : sid, "");
          showToast(shortlistHas(sid) ? "Added to shortlist" : "Removed from shortlist");
        });
      });
      host.querySelectorAll('[data-brief-action]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var act = btn.dataset.briefAction;
          if (act === "activate-all") {
            showToast("Activating " + data.portfolio.length + " signals\u2026");
            var res = await Promise.allSettled(data.portfolio.map(function (p) {
              return callTool("activate_signal", _activateArgs(p.signal_id));
            }));
            var ok = res.filter(function (x) { return x.status === "fulfilled"; }).length;
            showToast("\u2713 Campaign activated: " + ok + "/" + data.portfolio.length + ". Check Activations tab.");
          } else if (act === "export") {
            function esc(v) { var s = v == null ? "" : String(v); return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
            var hdr = "rank,signal_id,name,allocation_pct,cost,marginal_reach";
            var rws = data.portfolio.map(function (p) { return [p.rank, p.signal_id, p.name, p.allocation_pct, p.cost, p.marginal_reach].map(esc).join(","); });
            var blob = new Blob([hdr + "\\n" + rws.join("\\n")], { type: "text/csv" });
            var url = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = url; a.download = "campaign-plan.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            showToast("Plan exported as CSV");
          } else if (act === "builder") {
            if (!state.catalog.all.length) await loadCatalog();
            _builderStack.selected = data.portfolio.map(function (p) {
              return state.catalog.all.find(function (s) { return s.signal_agent_segment_id === p.signal_id; });
            }).filter(Boolean);
            switchTab("builder");
            showToast("Opened Builder with " + _builderStack.selected.length + " signals");
          }
        });
      });
      document.getElementById("brief-explainer").innerHTML = renderChartExplainer({
        what: "A complete signal portfolio generated from your campaign brief \u2014 ready to activate.",
        how: "1. Brief text \u2192 pseudo-vector via djb2 hash. 2. Top-30 catalog matches by cosine. 3. Greedy marginal-reach selection within budget. 4. Allocation % = pick cost / total cost.",
        read: "<strong>Activate campaign</strong> fires all signals to mock_dsp in parallel. <strong>Open in Builder</strong> loads the set into the rule-based builder for tweaking. <strong>Export plan</strong> gives a CSV for sharing.",
        limits: "Demo pseudo-vectorization \u2014 a real production pipeline would embed via OpenAI / Cohere / Anthropic for higher-fidelity matches.",
      });
    } catch (e) {
      host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    }
  });
}

// ─── Seasonality ─────────────────────────────────────────────────────────
var _seaLoaded = false;
async function ensureSeasonality() {
  if (_seaLoaded) return;
  _seaLoaded = true;
  document.getElementById("sea-run").addEventListener("click", renderSeaRanking);
  renderSeaHeatmap();
}
async function renderSeaRanking() {
  var host = document.getElementById("sea-results");
  var w = document.getElementById("sea-window").value;
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Ranking\u2026</div></div>';
  try {
    var r = await fetch("/analytics/best-for?window=" + encodeURIComponent(w));
    var data = await r.json();
    var topSignals = (data.top || []).slice(0, 15);
    var rerenderSea = function () {
      var rows = topSignals.map(function (s, i) {
        return '<div class="sea-row" data-sid="' + escapeHtml(s.signal_id) + '">' +
          '<label class="err-check" title="Add to shortlist"><input type="checkbox" data-sea-sl="' + escapeHtml(s.signal_id) + '"' + (shortlistHas(s.signal_id) ? ' checked' : '') + '/></label>' +
          '<div class="sea-rank">' + (i + 1) + '</div>' +
          '<div class="sea-name">' + escapeHtml(s.name) + '<br><span class="mono" style="font-size:10.5px;color:var(--text-mut)">reach ' + (s.reach / 1e6).toFixed(1) + 'M \u00b7 spec ' + s.specificity + '</span></div>' +
          '<div class="sea-mult mono">\u00d7' + s.window_multiplier + '</div>' +
          '<button class="err-activate" data-sea-activate="' + escapeHtml(s.signal_id) + '" title="Activate to mock_dsp"><svg class="ico"><use href="#icon-bolt"/></svg></button>' +
        '</div>';
      }).join("");
      var topBar = '<div class="campaign-cta" style="margin-bottom:10px">' +
        '<div class="campaign-cta-info">Top ' + topSignals.length + ' signals for ' + escapeHtml(data.window) + '. Click bolt to activate any row.</div>' +
        '<button class="btn-primary" data-sea-action="activate-top5" style="padding:5px 12px;font-size:11.5px"><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate top 5</span></button>' +
      '</div>';
      host.innerHTML = topBar + rows;
      host.querySelectorAll('[data-sea-sl]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var sid = cb.dataset.seaSl;
          var item = topSignals.find(function (s) { return s.signal_id === sid; });
          shortlistToggle(sid, item ? item.name : sid, "");
        });
      });
      host.querySelectorAll('[data-sea-activate]').forEach(function (b) {
        b.addEventListener('click', async function (e) {
          e.stopPropagation();
          var sid = b.dataset.seaActivate;
          b.disabled = true;
          try { await callTool("activate_signal", _activateArgs(sid)); showToast("\u2713 Activated"); b.classList.add("err-activated"); }
          catch (err) { showToast("Failed: " + err.message, true); b.disabled = false; }
        });
      });
      host.querySelectorAll('[data-sea-action="activate-top5"]').forEach(function (b) {
        b.addEventListener('click', async function () {
          var picks = topSignals.slice(0, 5);
          showToast("Activating top 5 for " + data.window + "\u2026");
          await Promise.allSettled(picks.map(function (s) { return callTool("activate_signal", _activateArgs(s.signal_id)); }));
          showToast("\u2713 Top 5 activated to mock_dsp");
        });
      });
      host.querySelectorAll('.sea-row').forEach(function (row) {
        row.addEventListener('click', function (e) { if (e.target.closest('input, button, label')) return; openDetailHydrated(row.dataset.sid); });
      });
    };
    rerenderSea();
    document.getElementById("sea-explainer").innerHTML = renderChartExplainer({
      what: "Signals ranked for the selected time window, with one-click activate per row + bulk top-5 activate.",
      how: "score = window_avg_seasonality \u00d7 specificity \u00d7 log_reach. Seasonality multiplier averages the monthly values across the chosen months.",
      read: "Top rows peak in the selected window. Use as a forward-looking plan ranker.",
      limits: "Seasonality synthesized from signal name/category hints (deterministic).",
    });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
  }
}
async function renderSeaHeatmap() {
  var host = document.getElementById("sea-heatmap");
  try {
    var r = await fetch("/analytics/seasonality");
    var data = await r.json();
    var rows = (data.profiles || []).slice(0, 30);
    var months = ["J","F","M","A","M","J","J","A","S","O","N","D"];
    var cellW = 24, rowH = 20, nameCol = 220;
    var W = nameCol + 12 * cellW + 20;
    var H = rows.length * rowH + 30;
    var html = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMinYMin meet">';
    months.forEach(function (m, i) {
      html += '<text x="' + (nameCol + i * cellW + cellW / 2) + '" y="14" text-anchor="middle" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">' + m + '</text>';
    });
    rows.forEach(function (r2, idx) {
      var y = 24 + idx * rowH;
      html += '<text x="' + (nameCol - 8) + '" y="' + (y + rowH / 2 + 3) + '" text-anchor="end" fill="var(--text)" font-size="10.5">' + escapeHtml(r2.name.slice(0, 30)) + '</text>';
      (r2.monthly || []).forEach(function (m, i) {
        var intensity = Math.min(1, Math.max(0, (m - 0.5) / 1.5));
        var fill = "rgba(79, 142, 255, " + (0.15 + intensity * 0.75).toFixed(3) + ")";
        if (m >= 1.3) fill = "rgba(255, 122, 92, " + ((m - 1) * 0.6).toFixed(3) + ")";
        html += '<rect x="' + (nameCol + i * cellW) + '" y="' + y + '" width="' + cellW + '" height="' + rowH + '" fill="' + fill + '" stroke="var(--bg-surface)" stroke-width="0.5">' +
          '<title>' + escapeHtml(r2.name) + ' \u00b7 month ' + (i + 1) + ' \u00d7' + m.toFixed(2) + '</title>' +
        '</rect>';
      });
    });
    html += '</svg>';
    host.innerHTML = html;
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Could not load heatmap</div></div>';
  }
}

// ─── Composer (Sec-43) ─────────────────────────────────────────────────
// Unified tab talking to POST /audience/{compose,saturation,affinity-audit}.
// Five pickers share one generic wiring helper (wireCompPicker) — each
// backed by state.composer[key]. All 5 pull from the already-loaded
// state.catalog.all so the UI stays responsive.
var _compLoaded = false;

// max = max signals per pool; buttons = ids of buttons to enable once picker has ≥1 selection.
`;
