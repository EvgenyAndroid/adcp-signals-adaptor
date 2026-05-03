// src/demo/script/fragments/composer.ts
//
// Composer: picker chips, suggestion search, compose/saturation/affinity result renderers.
//
// Source range (in pre-refactor src/demo/script.ts): lines 5394..5936 (543 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const composerJs = `function wireCompPicker(key, chipsId, searchId, suggId, countId, max, buttons) {
  var searchEl = document.getElementById(searchId);
  if (!searchEl) return;
  // Debounced search
  searchEl.addEventListener("input", function () {
    compRenderSugg(key, searchEl.value.trim().toLowerCase(), suggId, max);
  });
  searchEl.addEventListener("focus", function () {
    compRenderSugg(key, searchEl.value.trim().toLowerCase(), suggId, max);
  });
  // Initial render
  compRenderChips(key, chipsId, countId, max, suggId, buttons);
  compRenderSugg(key, "", suggId, max);
}

function compRenderChips(key, chipsId, countId, max, suggId, buttons) {
  var host = document.getElementById(chipsId);
  var countEl = document.getElementById(countId);
  var list = state.composer[key] || [];
  if (countEl) countEl.textContent = list.length + " / " + max;
  // Toggle associated buttons
  (buttons || []).forEach(function (bid) {
    var b = document.getElementById(bid);
    if (b) b.disabled = list.length < 1;
  });
  if (!host) return;
  if (list.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11.5px;padding:8px 0;font-style:italic">None.</div>';
    return;
  }
  host.innerHTML = list.map(function (s, i) {
    var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
    return '<div class="overlap-chip" data-sid="' + escapeHtml(sid) + '">' +
      '<div><div class="oc-name">' + escapeHtml(s.name) + '</div>' +
      '<div style="font-size:10.5px;color:var(--text-mut);font-family:var(--font-mono)">' +
        fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "—") +
      '</div></div>' +
      '<button class="oc-remove" data-idx="' + i + '"><svg class="ico"><use href="#icon-close"/></svg></button>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".oc-remove").forEach(function (b) {
    b.addEventListener("click", function () {
      state.composer[key].splice(Number(b.dataset.idx), 1);
      compRenderChips(key, chipsId, countId, max, suggId, buttons);
      compRenderSugg(key, "", suggId, max);
    });
  });
}

function compRenderSugg(key, q, suggId, max) {
  var host = document.getElementById(suggId);
  if (!host) return;
  var list = state.composer[key] || [];
  if (list.length >= max) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:6px 0">Max ' + max + '. Remove one to add another.</div>';
    return;
  }
  var selectedIds = new Set(list.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }));
  var rows = state.catalog.all || [];
  if (q) rows = rows.filter(function (s) {
    return (s.name || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
  });
  rows = rows.filter(function (s) {
    return !selectedIds.has(s.signal_agent_segment_id || (s.signal_id && s.signal_id.id));
  }).slice(0, 10);
  if (rows.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11.5px;padding:6px 0">No catalog matches.</div>';
    return;
  }
  host.innerHTML = rows.map(function (s) {
    var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
    return '<div class="overlap-suggestion" data-sid="' + escapeHtml(sid) + '">' +
      '<div>' + escapeHtml(s.name) + '</div>' +
      '<div class="sub">' + fmtNumber(s.estimated_audience_size) + ' · ' +
      escapeHtml(s.category_type || "—") + ' · ' + escapeHtml(verticalOf(s)) + '</div>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".overlap-suggestion").forEach(function (el) {
    el.addEventListener("click", function () {
      var sid = el.dataset.sid;
      var sig = state.catalog.all.find(function (x) {
        return (x.signal_agent_segment_id || (x.signal_id && x.signal_id.id)) === sid;
      });
      if (!sig) return;
      // Per-picker wiring table tells us chipsId/countId/buttons/max.
      var meta = _compPickerMeta[key];
      if (!meta) return;
      if (state.composer[key].length >= meta.max) return;
      state.composer[key].push(sig);
      compRenderChips(key, meta.chipsId, meta.countId, meta.max, suggId, meta.buttons);
      compRenderSugg(key, "", suggId, meta.max);
    });
  });
}

// Picker metadata so suggestion clicks know how to re-render.
var _compPickerMeta = {};

async function ensureComposer() {
  if (_compLoaded) return;
  _compLoaded = true;
  if (state.catalog.all.length === 0) await loadCatalog();

  // Build picker metadata + wire each.
  _compPickerMeta = {
    inc: { chipsId: "comp-inc-chips", countId: "comp-inc-count", buttons: ["comp-run"],     max: 8 },
    itx: { chipsId: "comp-itx-chips", countId: "comp-itx-count", buttons: [],               max: 4 },
    exc: { chipsId: "comp-exc-chips", countId: "comp-exc-count", buttons: [],               max: 4 },
    sat: { chipsId: "comp-sat-chips", countId: "comp-sat-count", buttons: ["comp-sat-run"], max: 10 },
    aff: { chipsId: "comp-aff-chips", countId: "comp-aff-count", buttons: ["comp-aff-run"], max: 15 },
  };
  wireCompPicker("inc", "comp-inc-chips", "comp-inc-search", "comp-inc-sugg", "comp-inc-count", 8,  ["comp-run"]);
  wireCompPicker("itx", "comp-itx-chips", "comp-itx-search", "comp-itx-sugg", "comp-itx-count", 4,  []);
  wireCompPicker("exc", "comp-exc-chips", "comp-exc-search", "comp-exc-sugg", "comp-exc-count", 4,  []);
  wireCompPicker("sat", "comp-sat-chips", "comp-sat-search", "comp-sat-sugg", "comp-sat-count", 10, ["comp-sat-run"]);
  wireCompPicker("aff", "comp-aff-chips", "comp-aff-search", "comp-aff-sugg", "comp-aff-count", 15, ["comp-aff-run"]);

  // Subtabs
  document.querySelectorAll(".lab-subtab[data-composer]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.dataset.composer;
      document.querySelectorAll(".lab-subtab[data-composer]").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      document.querySelectorAll(".lab-subpanel[data-composer-panel]").forEach(function (p) {
        p.style.display = p.dataset.composerPanel === target ? "" : "none";
      });
    });
  });

  // Lookalike seed dropdown — only signals whose id appears in the
  // embedding store can be seeded (the backend returns SEED_NOT_EMBEDDED
  // otherwise). We probe /ucp/projection for the canonical embedded set.
  try {
    var projRes = await fetch("/ucp/projection");
    var projData = await projRes.json();
    var embIds = new Set((projData.points || []).map(function (p) { return p.signal_id; }));
    var seedSel = document.getElementById("comp-lal-seed");
    if (seedSel) {
      var opts = ['<option value="">— none —</option>'];
      state.catalog.all.forEach(function (s) {
        var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id);
        if (!sid || !embIds.has(sid)) return;
        opts.push('<option value="' + escapeHtml(sid) + '">' + escapeHtml(s.name) + '</option>');
      });
      seedSel.innerHTML = opts.join("");
    }
  } catch (e) { /* dropdown stays minimal on fetch failure */ }

  document.getElementById("comp-run").addEventListener("click", runCompose);
  document.getElementById("comp-sat-run").addEventListener("click", runSaturation);
  document.getElementById("comp-aff-run").addEventListener("click", runAffinity);
}

// ── Set Builder run ─────────────────────────────────────────────────────
function _ids(list) {
  return (list || []).map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean);
}

async function runCompose() {
  var host = document.getElementById("comp-results");
  var include = _ids(state.composer.inc);
  var intersect = _ids(state.composer.itx);
  var exclude = _ids(state.composer.exc);
  var seedEl = document.getElementById("comp-lal-seed");
  var kEl = document.getElementById("comp-lal-k");
  var minEl = document.getElementById("comp-lal-min");
  var seed = seedEl ? seedEl.value : "";
  var body = { include: include, intersect: intersect, exclude: exclude };
  if (seed) body.lookalike = { seed_signal_id: seed, k: Number(kEl.value) || 8, min_cosine: Number(minEl.value) || 0 };
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Computing composition…</div></div>';
  try {
    var r = await fetch("/audience/compose", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.composer.lastCompose = data;
    renderComposeResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function renderComposeResult(data) {
  var host = document.getElementById("comp-results");
  var r = data.reach || {};
  var cards =
    '<div class="composer-reach-cards">' +
      '<div class="composer-reach-card"><div class="label">Union (∪)</div><div class="value">' + fmtNumber(r.union_only || 0) + '</div><div class="sub">include-only reach</div></div>' +
      '<div class="composer-reach-card"><div class="label">After intersect (∩)</div><div class="value">' + fmtNumber(r.after_intersect || 0) + '</div><div class="sub">narrowed by must-match</div></div>' +
      '<div class="composer-reach-card final"><div class="label">Final</div><div class="value">' + fmtNumber(r.final || 0) + '</div><div class="sub">after exclude (−)</div></div>' +
    '</div>';
  var confColor = data.confidence === "high" ? "var(--success)" : data.confidence === "medium" ? "var(--warning)" : "var(--text-mut)";
  var meta =
    '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--text-mut);margin-bottom:14px">' +
      '<div>CPM: <span class="mono" style="color:var(--text)">$' + (data.estimated_cpm || 0).toFixed(2) + '</span></div>' +
      '<div>Est. cost: <span class="mono" style="color:var(--text)">$' + fmtNumber(data.estimated_cost_usd || 0) + '</span></div>' +
      '<div>Confidence: <span class="mono" style="color:' + confColor + '">' + escapeHtml(data.confidence || "—") + '</span></div>' +
    '</div>';
  var lal = "";
  if (data.lookalike && data.lookalike.candidates && data.lookalike.candidates.length > 0) {
    lal =
      '<div class="lab-panel-title" style="margin-top:14px">Lookalike candidates (seed: ' + escapeHtml(data.lookalike.seed) + ')</div>' +
      '<div class="composer-lal-list">' +
        data.lookalike.candidates.map(function (c) {
          return '<div class="composer-lal-item">' +
            '<div><div>' + escapeHtml(c.name) + '</div>' +
            '<div style="font-size:10.5px;color:var(--text-mut);font-family:var(--font-mono)">' +
              fmtNumber(c.estimated_audience_size) +
            '</div></div>' +
            '<div style="display:flex;align-items:center;gap:10px">' +
              '<span class="cos">' + c.cosine.toFixed(3) + '</span>' +
              '<button class="add-btn" data-sid="' + escapeHtml(c.signal_agent_segment_id) + '">+ include</button>' +
            '</div>' +
          '</div>';
        }).join("") +
      '</div>';
  }
  host.innerHTML = cards + meta + lal;
  host.querySelectorAll(".add-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      var sid = b.dataset.sid;
      var sig = state.catalog.all.find(function (x) {
        return (x.signal_agent_segment_id || (x.signal_id && x.signal_id.id)) === sid;
      });
      if (!sig) return;
      if (state.composer.inc.length >= 8) { showToast("Include pool is full (max 8).", true); return; }
      if (_ids(state.composer.inc).indexOf(sid) >= 0) return;
      state.composer.inc.push(sig);
      compRenderChips("inc", "comp-inc-chips", "comp-inc-count", 8, "comp-inc-sugg", ["comp-run"]);
      compRenderSugg("inc", "", "comp-inc-sugg", 8);
      showToast("Added to Include pool.", false);
    });
  });
  document.getElementById("comp-explainer").innerHTML = renderChartExplainer({
    what: "Set-ops composition with embedding-based lookalike proposals.",
    how: "Union uses pairwise inclusion-exclusion against a category-affinity Jaccard heuristic (0.55 within category, 0.20 across). Intersect decays the base by the pairwise overlap rate; exclude subtracts suppressed overlap. Lookalikes are embedding k-NN against the seed.",
    read: "<strong>Union</strong> ≥ largest single signal, ≤ sum of reaches. <strong>Final</strong> = after the whole set-op chain. Lookalike candidates are proposals — they do NOT auto-add to the reach math, so numbers stay auditable.",
    limits: "Catalog signals only expose estimated reach (not user-level membership); overlap is heuristic. For production deployments wire this to a clean-room with real membership data.",
  });
  // Sec-44: fire privacy + holdout checks against the composed reach.
  runPrivacyGate(r.final || 0, _ids(state.composer.inc).concat(_ids(state.composer.itx)));
  runHoldoutForComposer(r.final || 0);
}

// Sec-44: Privacy gate — POST /audience/privacy-check with composed signals.
async function runPrivacyGate(cohortSize, signalIds) {
  var host = document.getElementById("comp-privacy");
  if (!host) return;
  if (cohortSize <= 0) { host.innerHTML = ""; return; }
  try {
    var r = await fetch("/audience/privacy-check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal_ids: signalIds, cohort_size: cohortSize }),
    });
    var data = await r.json();
    if (!r.ok || data.error) { host.innerHTML = ""; return; }
    var statusColor = data.status === "ok" ? "var(--success)" : data.status === "warn" ? "var(--warning)" : "var(--error)";
    var statusLabel = data.status === "ok" ? "Ok to activate" : data.status === "warn" ? "Warning" : "Blocked";
    var reasons = (data.reasons || []).map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join("");
    host.innerHTML =
      '<div class="privacy-gate" style="border-left:3px solid ' + statusColor + '">' +
        '<div class="privacy-title">' +
          '<strong>Privacy gate: ' + statusLabel + '</strong>' +
          '<span class="mono" style="color:var(--text-mut);margin-left:10px">k-anon floor ' + data.min_k + ' · cohort ' + fmtNumber(data.cohort_size) + '</span>' +
        '</div>' +
        (reasons ? '<ul class="privacy-reasons">' + reasons + '</ul>' : '<div style="color:var(--text-mut);font-size:11.5px">No privacy concerns flagged.</div>') +
      '</div>';
  } catch (e) { host.innerHTML = ""; }
}

// Sec-44: Holdout plan — POST /audience/holdout.
async function runHoldoutForComposer(reach) {
  var host = document.getElementById("comp-holdout");
  if (!host) return;
  if (reach <= 0) { host.innerHTML = ""; return; }
  try {
    var r = await fetch("/audience/holdout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reach: reach, holdout_pct: 0.10, baseline_conversion_rate: 0.02 }),
    });
    var data = await r.json();
    if (!r.ok || data.error) { host.innerHTML = ""; return; }
    host.innerHTML =
      '<div class="holdout-block">' +
        '<div class="holdout-title">Incrementality plan <span class="mono" style="color:var(--text-mut);font-weight:400;margin-left:8px">(10% holdout · 2% baseline CR · α=0.05 · 80% power)</span></div>' +
        '<div class="holdout-stats">' +
          '<div><div class="k">Exposed</div><div class="v">' + fmtNumber(data.exposed_size) + '</div></div>' +
          '<div><div class="k">Control</div><div class="v">' + fmtNumber(data.control_size) + '</div></div>' +
          '<div><div class="k">MDE (abs)</div><div class="v mono">' + (data.mde_absolute * 100).toFixed(2) + '%</div></div>' +
          '<div><div class="k">MDE (rel)</div><div class="v mono">' + (data.mde_relative * 100).toFixed(1) + '%</div></div>' +
        '</div>' +
      '</div>';
  } catch (e) { host.innerHTML = ""; }
}

// ── Saturation run ──────────────────────────────────────────────────────
async function runSaturation() {
  var host = document.getElementById("comp-sat-results");
  var ids = _ids(state.composer.sat);
  var body = { signal_ids: ids };
  var budget = Number(document.getElementById("comp-sat-budget").value) || 0;
  var reachOverride = Number(document.getElementById("comp-sat-reach").value) || 0;
  if (budget > 0) body.budget_usd = budget;
  if (reachOverride > 0) body.reach = reachOverride;
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Computing saturation…</div></div>';
  try {
    var r = await fetch("/audience/saturation", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.composer.lastSat = data;
    renderSaturationResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function renderSaturationResult(data) {
  var host = document.getElementById("comp-sat-results");
  var curve = data.curve || [];
  if (curve.length === 0) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">Empty curve</div></div>';
    return;
  }
  // SVG line chart — two series: unique_reach (filled area) + marginal_reach (dots).
  var W = 640, H = 260, P = 40;
  var maxR = 0, maxMarg = 0;
  curve.forEach(function (c) {
    if (c.unique_reach > maxR) maxR = c.unique_reach;
    if (c.marginal_reach > maxMarg) maxMarg = c.marginal_reach;
  });
  var xScale = function (i) { return P + i * ((W - 2 * P) / Math.max(1, curve.length - 1)); };
  var yScale = function (v) { return H - P - v / Math.max(1, maxR) * (H - 2 * P); };
  var yScaleMarg = function (v) { return H - P - v / Math.max(1, maxMarg) * (H - 2 * P); };

  var areaPts = "M " + P + " " + (H - P) + " ";
  curve.forEach(function (c, i) { areaPts += "L " + xScale(i) + " " + yScale(c.unique_reach) + " "; });
  areaPts += "L " + xScale(curve.length - 1) + " " + (H - P) + " Z";

  var kneeIdx = data.knee_frequency != null
    ? curve.findIndex(function (c) { return c.frequency === data.knee_frequency; })
    : -1;

  var svg = '<svg class="comp-sat-curve" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
    '<path d="' + areaPts + '" fill="rgba(79,142,255,0.18)" stroke="none"/>' +
    '<path d="' + curve.map(function (c, i) { return (i === 0 ? "M " : "L ") + xScale(i) + " " + yScale(c.unique_reach); }).join(" ") +
      '" fill="none" stroke="var(--accent)" stroke-width="1.8"/>';
  // Sec-31u T2#10: marginal-reach dots get hover-scrub tooltips +
  // larger interactive radius. Plus invisible-ish over-dots on the
  // unique_reach line for "scrub the curve" behavior.
  curve.forEach(function (c, i) {
    var tt = "F=" + c.frequency + " | reach=" + fmtNumber(c.unique_reach) + " | marginal=" + fmtNumber(c.marginal_reach) + " | cost=$" + fmtNumber(c.cost_usd);
    svg += '<circle class="comp-sat-marg-dot" cx="' + xScale(i) + '" cy="' + yScaleMarg(c.marginal_reach) + '" r="2.5" fill="var(--accent-hot)" opacity="0.7"><title>' + escapeHtml(tt) + '</title></circle>';
    svg += '<circle class="comp-sat-curve-dot" cx="' + xScale(i) + '" cy="' + yScale(c.unique_reach) + '" r="4.5" fill="var(--accent)" opacity="0.0"><title>' + escapeHtml(tt) + '</title></circle>';
  });
  if (kneeIdx >= 0) {
    svg += '<line x1="' + xScale(kneeIdx) + '" y1="' + P + '" x2="' + xScale(kneeIdx) + '" y2="' + (H - P) + '" stroke="var(--warning)" stroke-width="1" stroke-dasharray="4,3"/>';
    svg += '<text x="' + xScale(kneeIdx) + '" y="' + (P - 6) + '" text-anchor="middle" font-size="10" fill="var(--warning)">knee · F=' + data.knee_frequency + '</text>';
  }
  // Axis labels
  curve.forEach(function (c, i) {
    svg += '<text x="' + xScale(i) + '" y="' + (H - P + 14) + '" text-anchor="middle" font-size="9" fill="var(--text-mut)">' + c.frequency + '</text>';
  });
  svg += '<text x="' + (W / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="var(--text-mut)">Frequency (avg exposures per user)</text>';
  svg += '<text x="10" y="' + P + '" font-size="9" fill="var(--accent)">' + fmtNumber(maxR) + ' reach</text>';
  svg += '<text x="10" y="' + (H - P) + '" font-size="9" fill="var(--text-mut)">0</text>';
  svg += '</svg>';

  var rows = curve.map(function (c) {
    var cls = (data.knee_frequency === c.frequency) ? "knee" : "";
    return '<tr class="' + cls + '">' +
      '<td>' + c.frequency + '</td>' +
      '<td>' + fmtNumber(c.unique_reach) + '</td>' +
      '<td>' + (c.reach_fraction * 100).toFixed(1) + '%</td>' +
      '<td>' + fmtNumber(c.marginal_reach) + '</td>' +
      '<td>' + fmtNumber(c.impressions) + '</td>' +
      '<td>$' + fmtNumber(c.cost_usd) + '</td>' +
      '<td>$' + (c.cost_per_unique_reach_usd || 0).toFixed(4) + '</td>' +
    '</tr>';
  }).join("");
  var table =
    '<table class="comp-sat-table">' +
      '<thead><tr><th>F</th><th>Unique reach</th><th>% pop</th><th>Marginal</th><th>Impressions</th><th>Cost</th><th>CP unique</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  var meta =
    '<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:var(--text-mut);margin-bottom:10px">' +
      '<div>Population: <span class="mono" style="color:var(--text)">' + fmtNumber(data.reach_population || 0) + '</span></div>' +
      '<div>CPM: <span class="mono" style="color:var(--text)">$' + (data.cpm || 0).toFixed(2) + '</span></div>' +
      (data.knee_frequency != null ? '<div>Knee: <span class="mono" style="color:var(--warning)">F=' + data.knee_frequency + '</span></div>' : '') +
      (data.affordable_frequency != null ? '<div>Affordable under budget: <span class="mono" style="color:var(--success)">F=' + data.affordable_frequency + '</span></div>' : '') +
    '</div>';

  // Budget-shortfall warning: surface clearly when the user set a budget
  // but it cannot afford even F=1. Without this the curve renders as if
  // budget weren't a constraint, hiding the gap between intent and reality.
  var shortfallBanner = '';
  if (data.budget_usd != null && data.budget_usd > 0 && data.affordable_frequency == null && curve.length > 0) {
    var f1Cost = curve[0].cost_usd;
    var f1Reach = curve[0].unique_reach;
    var deficit = f1Cost - data.budget_usd;
    var coveragePct = (data.budget_usd / f1Cost) * 100;
    shortfallBanner =
      '<div class="comp-sat-shortfall">' +
        '<div class="comp-sat-shortfall-icon">!</div>' +
        '<div class="comp-sat-shortfall-body">' +
          '<div class="comp-sat-shortfall-title">Budget too low for even F=1.</div>' +
          '<div class="comp-sat-shortfall-detail">' +
            '$<strong>' + fmtNumber(data.budget_usd) + '</strong> covers ' +
            '<strong>' + coveragePct.toFixed(1) + '%</strong> of the F=1 cost ' +
            '($' + fmtNumber(Math.round(f1Cost)) + ' for ' + fmtNumber(f1Reach) + ' unique reach). ' +
            'Need <strong>+$' + fmtNumber(Math.round(deficit)) + '</strong> more to hit F=1, or trim the audience to ' +
            fmtNumber(Math.round(data.budget_usd * 1000 / (data.cpm || 1))) + ' impressions worth.' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  host.innerHTML = meta + shortfallBanner + svg + table;
  document.getElementById("comp-sat-explainer").innerHTML = renderChartExplainer({
    what: "Frequency saturation curve under a Poisson exposure model.",
    how: "<code>P(seen ≥ 1 | F) = 1 − exp(−F)</code>. At each sampled F, we compute unique reach, impressions, cost (impressions × CPM / 1000), and marginal reach vs the previous step. The knee is the first F where each +1 buys less than half the F=1 baseline gain.",
    read: "<strong>Before the knee</strong> spend mostly buys new reach. <strong>After the knee</strong> spend mostly buys repeat exposures of users you've already hit. Use the affordable-F line to pick your cap.",
    limits: "Assumes random-impression delivery. Real DSPs with frequency-cap optimizers reach the knee faster; this is an upper bound on diminishing returns.",
  });
}

// ── Affinity audit run ──────────────────────────────────────────────────
async function runAffinity() {
  var host = document.getElementById("comp-aff-results");
  var ids = _ids(state.composer.aff);
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Auditing affinity…</div></div>';
  try {
    var r = await fetch("/audience/affinity-audit", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signal_ids: ids }),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.composer.lastAff = data;
    renderAffinityResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function renderAffinityResult(data) {
  var host = document.getElementById("comp-aff-results");
  var summary = data.summary || {};
  var facets = data.facets || [];

  // Bars: centered at 100 (parity). Width proportional to |index − 100| / 500
  // clamped to the half of the track (so index=200 fills 20%; index=600 caps).
  function bar(row) {
    var idx = row.index;
    var isZero = idx === 0;
    var isOver = idx > 100;
    var delta = Math.min(500, Math.abs(idx - 100));
    var widthPct = (delta / 500) * 50; // 0..50% of track width
    var cls = isZero ? "absent" : idx >= 150 ? "heavy" : isOver ? "over" : "under";
    var style = isZero
      ? 'left:50%;width:0%;'
      : isOver
        ? 'left:50%;width:' + widthPct + '%;'
        : 'right:50%;width:' + widthPct + '%;';
    var indexLabel = isZero ? "absent" : String(idx);
    var indexColor = isZero ? "var(--text-mut)" : isOver ? "var(--accent)" : "var(--warn,var(--text-dim))";
    return '<div class="comp-aff-row' + (isZero ? ' comp-aff-row-zero' : '') + '">' +
      '<div class="comp-aff-key">' + escapeHtml(row.key) + '</div>' +
      '<div class="comp-aff-bar-track">' +
        '<div class="comp-aff-bar-fill ' + cls + '" style="' + style + '"></div>' +
        // 100-parity tick mark always rendered as a vertical line
        '<div class="comp-aff-bar-tick"></div>' +
      '</div>' +
      '<div class="comp-aff-index" style="color:' + indexColor + '">' + indexLabel + '</div>' +
    '</div>';
  }

  var facetsHtml = facets.map(function (f, fi) {
    var allRows = (f.rows || []);
    var liveRows = allRows.filter(function (r) { return r.selection_share > 0; });
    var zeroRows = allRows.filter(function (r) { return r.selection_share === 0 && r.share > 0.001; });
    var hiddenCount = zeroRows.length;
    var liveBars = liveRows.slice(0, 10).map(bar).join("");
    var zeroToggle = hiddenCount > 0
      ? '<div class="comp-aff-zero-toggle"><button type="button" class="comp-aff-show-zeros" data-facet-idx="' + fi + '">+ show ' + hiddenCount + ' absent bucket' + (hiddenCount === 1 ? "" : "s") + '</button></div>'
      : '';
    var zeroBars = zeroRows.map(bar).join("");
    return '<div class="comp-aff-facet" data-facet-idx="' + fi + '">' +
      '<div class="comp-aff-facet-title">' + escapeHtml(f.facet) +
        ' <span class="comp-aff-facet-meta">skew ' + (summary.skew_scores ? summary.skew_scores[f.facet] : "—") +
        ' \u00b7 concentration ' + (summary.concentration ? summary.concentration[f.facet] : "—") + '</span>' +
      '</div>' +
      liveBars +
      zeroToggle +
      '<div class="comp-aff-zero-rows" data-facet-idx="' + fi + '" style="display:none">' + zeroBars + '</div>' +
    '</div>';
  }).join("");

  var top =
    '<div class="comp-aff-summary">' +
      '<div class="comp-aff-summary-meta">' +
        '<div>Selection: <span class="mono" style="color:var(--text)">' + (summary.selection_count || 0) + '</span> signals</div>' +
        '<div>Catalog: <span class="mono" style="color:var(--text)">' + (summary.catalog_count || 0) + '</span> signals</div>' +
        '<div>Facets: <span class="mono" style="color:var(--text)">' + facets.length + '</span></div>' +
      '</div>' +
      '<div class="comp-aff-legend">' +
        '<span><span class="comp-aff-legend-dot under"></span>under-indexed (&lt;100)</span>' +
        '<span><span class="comp-aff-legend-dot tick"></span>parity = 100</span>' +
        '<span><span class="comp-aff-legend-dot over"></span>over-indexed (&gt;100)</span>' +
        '<span><span class="comp-aff-legend-dot heavy"></span>\u22652\u00d7 catalog</span>' +
        '<span><span class="comp-aff-legend-dot absent"></span>absent (0)</span>' +
      '</div>' +
    '</div>';
  host.innerHTML = top + facetsHtml;
  // Wire the "show absent buckets" toggles
  host.querySelectorAll('.comp-aff-show-zeros').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var idx = btn.dataset.facetIdx;
      var rows = host.querySelector('.comp-aff-zero-rows[data-facet-idx="' + idx + '"]');
      if (!rows) return;
      var visible = rows.style.display !== 'none';
      rows.style.display = visible ? 'none' : '';
      btn.textContent = visible
        ? btn.textContent.replace('hide', '+ show')
        : btn.textContent.replace('+ show', 'hide');
    });
  });
  document.getElementById("comp-aff-explainer").innerHTML = renderChartExplainer({
    what: "Reach-weighted affinity index vs the catalog baseline.",
    how: "For each facet (category / vertical / geo band / data provider), share = sum(reach) in each bucket / sum(reach) overall. Index = 100 × (selection_share / baseline_share), capped at 600.",
    read: "Bars extend RIGHT of the center line for <strong>over-indexed</strong> buckets (your selection is heavier there than the catalog is) and LEFT for under-indexed. Skew = mean |index − 100| across live rows; concentration = buckets needed to cover 80% of selection share.",
    limits: "This is a meta-audit of your signal picks, not of the users those signals enroll. It tells you whether your portfolio is biased toward a vertical or provider — not whether the underlying users are.",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Sec-45: Journey Builder — sequential segmentation + funnel viz.
// Each stage has its own include/intersect/exclude pools; the backend
// reach-sizes every stage via /audience/compose then returns a funnel
// with per-stage conversion vs prior, cumulative vs top-of-funnel, and
// drop-off. Stages are clamped monotonically (a later stage's reach can
// never exceed the prior stage).
// ─────────────────────────────────────────────────────────────────────────
var _journeyLoaded = false;

`;
