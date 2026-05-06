// src/demo/script/fragments/federation.ts
//
// Federated catalog: result render, shortlist toggle, dstillery detail, CSV export, compare.
//
// Source range (in pre-refactor src/demo/script.ts): lines 9949..10256 (308 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const federationJs = `function fedSigKey(m) { return (m.source_agent || "?") + "::" + ((m.signal || {}).signal_agent_segment_id || ""); }

async function runFederatedSearch() {
  var host = document.getElementById("fed-results");
  var brief = document.getElementById("fed-brief").value.trim();
  if (!brief) { host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Enter a brief</div></div>'; return; }
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Fanning out to agents\u2026</div></div>';
  try {
    var r = await fetch("/agents/federated-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: brief, max_results_per_agent: parseInt(document.getElementById("fed-max").value, 10) || 5 }) });
    var data = await r.json();
    _fedLastResults = data.merged || [];
    _captureTrace(data._trace);
    renderFederatedResults(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div><div class="empty-desc">Federation endpoints may not be deployed yet.</div></div>';
  }
}

function renderFederatedResults(data) {
  var host = document.getElementById("fed-results");
  var merged = data.merged || [];
  var shortlistKeys = new Set(_fedShortlist.map(fedSigKey));

  // Summary: per-agent count + total time + CUMULATIVE reach + blended CPM
  var totalReach = 0, totalCostWeighted = 0;
  merged.forEach(function (m) {
    var s = m.signal || {};
    var sz = s.estimated_audience_size || 0;
    var cpm = (s.pricing_options && s.pricing_options[0] && s.pricing_options[0].cpm) || (s.pricing && s.pricing.cpm) || 0;
    totalReach += sz;
    totalCostWeighted += sz * cpm;
  });
  var blendedCpm = totalReach > 0 ? totalCostWeighted / totalReach : 0;

  var agentStats = Object.entries(data.per_agent_count || {}).map(function (kv) {
    var badge = kv[0] === "evgeny_signals" ? "pill-success" : kv[0] === "dstillery" ? "pill-info" : "pill-mut";
    return '<div class="lab-stat-card"><div class="lab-stat-label"><span class="pill ' + badge + '" style="font-size:10px">' + escapeHtml(kv[0]) + '</span></div><div class="lab-stat-val">' + kv[1] + '</div></div>';
  }).join('');
  var summary = '<div class="fed-summary-grid">' + agentStats +
    '<div class="lab-stat-card"><div class="lab-stat-label">Total potential reach</div><div class="lab-stat-val">' + (totalReach > 0 ? (totalReach / 1e6).toFixed(1) + 'M' : '\u2014') + '</div></div>' +
    '<div class="lab-stat-card"><div class="lab-stat-label">Blended CPM</div><div class="lab-stat-val">' + (blendedCpm > 0 ? '$' + blendedCpm.toFixed(2) : '\u2014') + '</div></div>' +
    '<div class="lab-stat-card"><div class="lab-stat-label">Round-trip</div><div class="lab-stat-val">' + (data.total_time_ms || 0) + 'ms</div></div>' +
    '</div>';

  // Rows
  var rowsHtml = merged.map(function (m, i) {
    var agent = m.source_agent;
    var sig = m.signal || {};
    var key = fedSigKey(m);
    var selected = shortlistKeys.has(key);
    var sid = sig.signal_agent_segment_id || "";
    var agentClass = agent === "evgeny_signals" ? "fed-row-evgeny" : agent === "dstillery" ? "fed-row-dstillery" : "";
    var agentPill = agent === "evgeny_signals" ? "pill-success" : agent === "dstillery" ? "pill-info" : "pill-mut";
    // Enriched fields
    var desc = sig.description ? escapeHtml(sig.description.slice(0, 120) + (sig.description.length > 120 ? "\u2026" : "")) : "";
    var cpm = 0;
    if (sig.pricing_options && sig.pricing_options[0]) cpm = sig.pricing_options[0].cpm;
    else if (sig.pricing && sig.pricing.cpm) cpm = sig.pricing.cpm;
    var reach = sig.estimated_audience_size;
    var coverage = sig.coverage_percentage;
    // Deployment target
    var deployment = "";
    if (Array.isArray(sig.deployments) && sig.deployments.length) {
      var d0 = sig.deployments[0];
      var platform = d0.platform || d0.type;
      var platformId = d0.decisioning_platform_segment_id || (d0.activation_key && d0.activation_key.segment_id);
      if (platform) deployment = platform + (platformId ? " \u00b7 id " + platformId : "");
    }
    // Action button — agent-specific
    var actionBtn;
    if (agent === "evgeny_signals") {
      actionBtn = '<button class="fed-action-btn primary" data-action="activate" data-sid="' + escapeHtml(sid) + '" title="Activate to mock_dsp"><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate</span></button>';
    } else if (agent === "dstillery") {
      var ttdId = deployment.match(/id (\d+)/) ? deployment.match(/id (\d+)/)[1] : (sig.deployments && sig.deployments[0] && sig.deployments[0].decisioning_platform_segment_id) || sid;
      actionBtn = '<button class="fed-action-btn" data-action="copy-ttd" data-ttd-id="' + escapeHtml(ttdId) + '" title="Copy TTD segment ID"><svg class="ico"><use href="#icon-check"/></svg><span>Copy TTD ID</span></button>';
    } else {
      actionBtn = '<button class="fed-action-btn" disabled>n/a</button>';
    }
    // Metric pills
    var metrics = [];
    if (reach) metrics.push('<span class="fed-metric">reach <strong>' + fmtNumber(reach) + '</strong></span>');
    if (coverage !== undefined && coverage !== null) metrics.push('<span class="fed-metric">coverage <strong>' + coverage.toFixed(2) + '%</strong></span>');
    if (cpm) metrics.push('<span class="fed-metric">CPM <strong>$' + cpm.toFixed(2) + '</strong></span>');
    if (deployment) metrics.push('<span class="fed-metric mono" style="font-size:10.5px">\u2192 ' + escapeHtml(deployment) + '</span>');

    return '<div class="fed-result-row ' + agentClass + (selected ? ' fed-row-selected' : '') + '" data-key="' + escapeHtml(key) + '" data-idx="' + i + '">' +
      '<label class="fed-check"><input type="checkbox" data-fed-check="' + escapeHtml(key) + '"' + (selected ? ' checked' : '') + '/></label>' +
      '<div class="err-rank">' + (i + 1) + '</div>' +
      '<div class="err-main">' +
        '<div class="err-name">' + escapeHtml(sig.name || sid || "(unnamed)") + '</div>' +
        (desc ? '<div class="fed-desc">' + desc + '</div>' : '') +
        (metrics.length ? '<div class="fed-metrics">' + metrics.join("") + '</div>' : '') +
        '<div class="err-sid mono">' + escapeHtml(sid) + '</div>' +
      '</div>' +
      '<div class="fed-row-actions">' +
        '<span class="pill ' + agentPill + '" style="font-size:10px">' + escapeHtml(agent) + '</span>' +
        actionBtn +
      '</div>' +
    '</div>';
  }).join("");

  // Sticky action bar
  var selectedCount = _fedShortlist.length;
  var actionBar =
    '<div class="fed-actionbar' + (selectedCount > 0 ? ' fed-actionbar-active' : '') + '">' +
      '<div class="fed-actionbar-info">' +
        (selectedCount > 0
          ? '<strong>' + selectedCount + '</strong> selected across agents'
          : 'Select rows to enable bulk actions') +
      '</div>' +
      '<button class="btn-secondary" id="fed-select-all" style="padding:4px 12px;font-size:11.5px">Select all</button>' +
      '<button class="btn-secondary" id="fed-clear" style="padding:4px 12px;font-size:11.5px">Clear</button>' +
      '<button class="btn-secondary" id="fed-export-csv" style="padding:4px 12px;font-size:11.5px"' + (selectedCount === 0 ? ' disabled' : '') + '><svg class="ico"><use href="#icon-book"/></svg><span>Export CSV</span></button>' +
      '<button class="btn-secondary" id="fed-compare" style="padding:4px 12px;font-size:11.5px"' + (selectedCount < 2 ? ' disabled' : '') + '><svg class="ico"><use href="#icon-grid"/></svg><span>Compare</span></button>' +
      '<button class="btn-primary" id="fed-activate-selected" style="padding:4px 12px;font-size:11.5px"' + (selectedCount === 0 ? ' disabled' : '') + '><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate selected</span></button>' +
    '</div>';

  // Sec-31u T3#24: Pairwise agreement heatmap — counts how many signals
  // each pair of agents BOTH surfaced (matched on signal name normalized
  // to lowercase). Shown only when 2+ agents have any results.
  var agentList = Object.keys(data.per_agent_count || {}).filter(function (k) { return data.per_agent_count[k] > 0; });
  var heatmapHtml = "";
  if (agentList.length >= 2) {
    // Build per-agent set of normalized signal-name keys
    var perAgent = {};
    agentList.forEach(function (a) { perAgent[a] = new Set(); });
    merged.forEach(function (m) {
      var name = (m.signal && m.signal.name) ? m.signal.name.toLowerCase().trim() : "";
      if (name && perAgent[m.source_agent]) perAgent[m.source_agent].add(name);
    });
    // Pairwise overlap matrix
    var maxOverlap = 0;
    var cells = [];
    agentList.forEach(function (rowA, ri) {
      agentList.forEach(function (colA, ci) {
        if (rowA === colA) {
          cells.push({ ri: ri, ci: ci, val: perAgent[rowA].size, diag: true });
        } else {
          var overlap = 0;
          perAgent[rowA].forEach(function (k) { if (perAgent[colA].has(k)) overlap++; });
          if (overlap > maxOverlap) maxOverlap = overlap;
          cells.push({ ri: ri, ci: ci, val: overlap, diag: false });
        }
      });
    });
    var n = agentList.length;
    var cols = "auto " + agentList.map(function () { return "1fr"; }).join(" ");
    // Header row: blank + col labels
    var headerRow = '<div></div>' + agentList.map(function (a) {
      return '<div class="fed-agreement-col-label">' + escapeHtml(a) + '</div>';
    }).join("");
    var bodyRows = agentList.map(function (rowA, ri) {
      var rowLabel = '<div class="fed-agreement-row-label mono">' + escapeHtml(rowA) + '</div>';
      var rowCells = agentList.map(function (colA, ci) {
        var c = cells.find(function (x) { return x.ri === ri && x.ci === ci; });
        var v = c ? c.val : 0;
        var bg = "var(--bg)";
        if (!c.diag && maxOverlap > 0 && v > 0) {
          var t = v / maxOverlap;
          // Accent gradient: from faint to full intensity
          var alpha = 0.10 + 0.55 * t;
          bg = "rgba(56, 182, 255, " + alpha.toFixed(2) + ")";
        }
        var classes = "fed-agreement-cell" + (c.diag ? " diag" : "");
        var title = c.diag ? "self: " + v + " signals" : (rowA + " ∩ " + colA + " = " + v + " overlap");
        return '<div class="' + classes + '" style="background:' + bg + '" title="' + escapeHtml(title) + '">' + v + '</div>';
      }).join("");
      return rowLabel + rowCells;
    }).join("");
    heatmapHtml =
      '<div class="fed-agreement-host">' +
        '<div class="fed-agreement-title">Agent agreement (signal-name overlap, max ' + maxOverlap + ')</div>' +
        '<div class="fed-agreement-grid" style="grid-template-columns:' + cols + '">' +
          headerRow + bodyRows +
        '</div>' +
      '</div>';
  }

  host.innerHTML = summary + actionBar +
    '<div class="fed-rows">' + (rowsHtml || '<div class="empty-state"><div class="empty-desc">No results from any agent.</div></div>') + '</div>' +
    heatmapHtml +
    '<div id="fed-compare-host"></div>';

  // Wire row clicks
  host.querySelectorAll('[data-fed-check]').forEach(function (cb) {
    cb.addEventListener('change', function (e) {
      e.stopPropagation();
      toggleFedShortlist(cb.dataset.fedCheck);
      renderFederatedResults({ merged: _fedLastResults, per_agent_count: data.per_agent_count, total_time_ms: data.total_time_ms });
    });
  });
  host.querySelectorAll('.fed-result-row').forEach(function (row) {
    row.addEventListener('click', function (e) {
      if (e.target.closest('input, button, label')) return;
      var idx = parseInt(row.dataset.idx, 10);
      var m = _fedLastResults[idx];
      if (!m) return;
      if (m.source_agent === "evgeny_signals") {
        openDetailHydrated(m.signal.signal_agent_segment_id, m.signal);
      } else if (m.source_agent === "dstillery") {
        openDstilleryDetail(m.signal);
      }
    });
  });
  host.querySelectorAll('[data-action="activate"]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      fedActivateSignal(btn.dataset.sid);
    });
  });
  host.querySelectorAll('[data-action="copy-ttd"]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var id = btn.dataset.ttdId;
      navigator.clipboard.writeText(id).then(function () { showToast("TTD segment id " + id + " copied"); }).catch(function () { showToast("Copy failed", true); });
    });
  });
  var selAll = document.getElementById("fed-select-all");
  if (selAll) selAll.onclick = function () { _fedShortlist = _fedLastResults.slice(); renderFederatedResults(data); };
  var clr = document.getElementById("fed-clear");
  if (clr) clr.onclick = function () { _fedShortlist = []; renderFederatedResults(data); };
  var exp = document.getElementById("fed-export-csv");
  if (exp) exp.onclick = function () { fedExportCsv(); };
  var cmp = document.getElementById("fed-compare");
  if (cmp) cmp.onclick = function () { fedCompareSelected(); };
  var act = document.getElementById("fed-activate-selected");
  if (act) act.onclick = function () { fedActivateSelected(); };

  document.getElementById("fed-explainer").innerHTML = renderChartExplainer({
    what: "Results from every AdCP Signals agent queried in parallel, merged with provenance badges. Each row is directly actionable.",
    how: "Parallel fan-out via MCP tools/call. Evgeny results come from our local catalog (with full deployment metadata). Dstillery results are native TTD segments — the 'Copy TTD ID' button gives you the exact segment_id for use inside TTD's UI.",
    read: "Check rows to shortlist across agents, then use the action bar: <strong>Activate selected</strong> fires evgeny signals to mock_dsp and copies Dstillery TTD IDs. <strong>Compare</strong> shows attributes side-by-side. <strong>Export CSV</strong> gives your planner a shareable shortlist.",
    limits: "Dstillery signals are activated via TTD, not our agent — we surface the segment_id they need. Future: direct TTD OAuth flow.",
  });
}

function toggleFedShortlist(key) {
  var idx = _fedShortlist.findIndex(function (m) { return fedSigKey(m) === key; });
  if (idx >= 0) { _fedShortlist.splice(idx, 1); return; }
  var hit = _fedLastResults.find(function (m) { return fedSigKey(m) === key; });
  if (hit) _fedShortlist.push(hit);
}

// Open an inline detail card for a Dstillery signal (not in our catalog,
// so the signal-detail panel can't hydrate).
function openDstilleryDetail(sig) {
  var host = document.getElementById("fed-compare-host");
  var deployments = (sig.deployments || []).map(function (d) {
    return '<div class="dstl-deploy"><strong>' + escapeHtml(d.platform || d.type || '') + '</strong> · <span class="mono">id ' + escapeHtml(String(d.decisioning_platform_segment_id || '')) + '</span>' + (d.is_live ? ' · <span class="pill pill-success" style="font-size:10px">live</span>' : '') + '</div>';
  }).join("");
  host.innerHTML = '<div class="dstl-detail">' +
    '<div class="dstl-head"><div class="dstl-title">' + escapeHtml(sig.name || '') + ' <span class="pill pill-info" style="margin-left:8px">dstillery</span></div>' +
      '<button class="detail-icon-btn" data-dstl-close="1" aria-label="Close"><svg class="ico"><use href="#icon-close"/></svg></button>' +
    '</div>' +
    (sig.description ? '<div class="dstl-desc">' + escapeHtml(sig.description) + '</div>' : '') +
    '<div class="dstl-grid">' +
      '<div class="lab-stat-card"><div class="lab-stat-label">Segment ID (ours)</div><div class="lab-stat-val mono" style="font-size:13px">' + escapeHtml(sig.signal_agent_segment_id || '') + '</div></div>' +
      '<div class="lab-stat-card"><div class="lab-stat-label">Coverage</div><div class="lab-stat-val">' + (sig.coverage_percentage !== undefined ? sig.coverage_percentage.toFixed(2) + '%' : '\u2014') + '</div></div>' +
      '<div class="lab-stat-card"><div class="lab-stat-label">CPM</div><div class="lab-stat-val">' + (sig.pricing && sig.pricing.cpm ? '$' + sig.pricing.cpm.toFixed(2) : '\u2014') + '</div></div>' +
      '<div class="lab-stat-card"><div class="lab-stat-label">Data provider</div><div class="lab-stat-val" style="font-size:13px">' + escapeHtml(sig.data_provider || 'Dstillery') + '</div></div>' +
    '</div>' +
    (deployments ? '<div class="dstl-section-label">Deployments (active on TTD)</div>' + deployments : '') +
    '<div class="dstl-hint">Dstillery signals activate via their Trade Desk partnership. Use the <strong>decisioning_platform_segment_id</strong> above inside TTD\u2019s UI to add this audience to your campaign. Future: direct TTD OAuth activation from this panel.</div>' +
  '</div>';
  host.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function fedActivateSignal(sid) {
  showToast("Activating " + sid + " to mock_dsp\u2026");
  try {
    var data = await callTool("activate_signal", _activateArgs(sid));
    showToast("\u2713 Activation submitted: " + (data.operation_id || "op pending"));
  } catch (e) {
    showToast("Activation failed: " + e.message, true);
  }
}

async function fedActivateSelected() {
  if (_fedShortlist.length === 0) return;
  var evg = _fedShortlist.filter(function (m) { return m.source_agent === "evgeny_signals"; });
  var dstill = _fedShortlist.filter(function (m) { return m.source_agent === "dstillery"; });
  var messages = [];
  // Activate evgeny signals in parallel
  if (evg.length) {
    showToast("Activating " + evg.length + " Evgeny signals\u2026");
    var results = await Promise.allSettled(evg.map(function (m) {
      return callTool("activate_signal", { signal_agent_segment_id: m.signal.signal_agent_segment_id, destination_platform: "mock_dsp" });
    }));
    var ok = results.filter(function (r) { return r.status === "fulfilled"; }).length;
    messages.push(ok + "/" + evg.length + " Evgeny activated");
  }
  // Copy all TTD IDs to clipboard
  if (dstill.length) {
    var ttdIds = dstill.map(function (m) {
      var d0 = (m.signal.deployments || [])[0];
      return (d0 && d0.decisioning_platform_segment_id) || m.signal.signal_agent_segment_id;
    }).filter(Boolean);
    try {
      await navigator.clipboard.writeText(ttdIds.join("\\n"));
      messages.push(dstill.length + " Dstillery TTD IDs copied");
    } catch { messages.push(dstill.length + " Dstillery IDs — copy failed"); }
  }
  showToast(messages.join(" \u00b7 "));
}

function fedExportCsv() {
  if (_fedShortlist.length === 0) return;
  var header = ["rank", "agent", "signal_id", "name", "reach", "cpm", "coverage_pct", "deployment_platform", "deployment_id"];
  function esc(v) { var s = v === null || v === undefined ? "" : String(v); return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  var rows = _fedShortlist.map(function (m, i) {
    var s = m.signal || {};
    var cpm = (s.pricing_options && s.pricing_options[0] && s.pricing_options[0].cpm) || (s.pricing && s.pricing.cpm) || "";
    var d0 = (s.deployments || [])[0] || {};
    return [i + 1, m.source_agent, s.signal_agent_segment_id, s.name, s.estimated_audience_size || "", cpm, s.coverage_percentage !== undefined ? s.coverage_percentage : "", d0.platform || d0.type || "", d0.decisioning_platform_segment_id || ""].map(esc).join(",");
  });
  var csv = header.join(",") + "\\n" + rows.join("\\n");
  var blob = new Blob([csv], { type: "text/csv" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = "federated-shortlist-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  showToast("CSV downloaded (" + _fedShortlist.length + " rows)");
}

function fedCompareSelected() {
  if (_fedShortlist.length < 2) return;
  var host = document.getElementById("fed-compare-host");
  var cols = _fedShortlist.map(function (m) {
    var s = m.signal || {};
    var cpm = (s.pricing_options && s.pricing_options[0] && s.pricing_options[0].cpm) || (s.pricing && s.pricing.cpm) || 0;
    return {
      agent: m.source_agent,
      name: s.name || s.signal_agent_segment_id,
      sid: s.signal_agent_segment_id,
      reach: s.estimated_audience_size,
      cpm: cpm,
      coverage: s.coverage_percentage,
      category: s.category_type,
      provider: s.data_provider,
      deployment: ((s.deployments || [])[0] || {}).platform || ((s.deployments || [])[0] || {}).type || "",
    };
  });
  var rows = [
    ["Agent", cols.map(function (c) { var p = c.agent === "evgeny_signals" ? "pill-success" : "pill-info"; return '<span class="pill ' + p + '" style="font-size:10px">' + escapeHtml(c.agent) + '</span>'; })],
    ["Signal ID", cols.map(function (c) { return '<span class="mono" style="font-size:11px">' + escapeHtml(c.sid || '') + '</span>'; })],
    ["Reach", cols.map(function (c) { return c.reach ? fmtNumber(c.reach) : '\u2014'; })],
    ["CPM", cols.map(function (c) { return c.cpm ? '$' + c.cpm.toFixed(2) : '\u2014'; })],
    ["Coverage", cols.map(function (c) { return c.coverage !== undefined && c.coverage !== null ? c.coverage.toFixed(2) + '%' : '\u2014'; })],
    ["Category", cols.map(function (c) { return escapeHtml(c.category || '\u2014'); })],
    ["Provider", cols.map(function (c) { return escapeHtml(c.provider || '\u2014'); })],
    ["Deployment", cols.map(function (c) { return escapeHtml(c.deployment || '\u2014'); })],
  ];
  var tbl = '<table class="fed-compare-tbl">' +
    '<thead><tr><th></th>' + cols.map(function (c) { return '<th>' + escapeHtml(c.name || '') + '</th>'; }).join("") + '</tr></thead>' +
    '<tbody>' + rows.map(function (r2) {
      return '<tr><th>' + escapeHtml(r2[0]) + '</th>' + r2[1].map(function (v) { return '<td>' + v + '</td>'; }).join("") + '</tr>';
    }).join("") + '</tbody>' +
  '</table>';
  host.innerHTML = '<div class="dstl-detail">' +
    '<div class="dstl-head"><div class="dstl-title">Compare \u2014 ' + cols.length + ' signals</div>' +
      '<button class="detail-icon-btn" data-dstl-close="1" aria-label="Close"><svg class="ico"><use href="#icon-close"/></svg></button>' +
    '</div>' + tbl + '</div>';
  host.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Sec-38 A7: keyboard shortcuts. Two-key "go to" prefix (g+x). Single
// keys: ? toggles the cheat sheet, Esc closes overlays + detail panel.
// Ignore shortcuts while typing in an input/textarea.
var _kbdPrefix = null, _kbdPrefixTimer = null;
`;
