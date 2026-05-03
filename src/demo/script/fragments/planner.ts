// src/demo/script/fragments/planner.ts
//
// Cross-stage planner: pool/chip wiring, REM candidates, run-button, result render.
//
// Source range (in pre-refactor src/demo/script.ts): lines 6241..6461 (221 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const plannerJs = `function _plannerWirePool(key, chipsId, searchId, suggId, countId, max, fromCatalog) {
  _plannerRenderChips(key, chipsId, countId, max, fromCatalog);
  if (!searchId || !suggId) return;
  _plannerRenderSugg(key, "", suggId, max, chipsId, countId);
  var searchEl = document.getElementById(searchId);
  if (!searchEl) return;
  searchEl.addEventListener("input", function () {
    _plannerRenderSugg(key, searchEl.value.trim().toLowerCase(), suggId, max, chipsId, countId);
  });
  searchEl.addEventListener("focus", function () {
    _plannerRenderSugg(key, searchEl.value.trim().toLowerCase(), suggId, max, chipsId, countId);
  });
}

function _plannerRenderChips(key, chipsId, countId, max, _fromCatalog) {
  var host = document.getElementById(chipsId);
  var countEl = document.getElementById(countId);
  var list = state.planner[key] || [];
  if (countEl) countEl.textContent = list.length + " / " + max;
  if (!host) return;
  if (list.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0;font-style:italic">None.</div>';
  } else {
    host.innerHTML = list.map(function (s, i) {
      var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
      return '<div class="overlap-chip" data-sid="' + escapeHtml(sid) + '">' +
        '<div><div class="oc-name">' + escapeHtml(s.name) + '</div>' +
        '<div style="font-size:10.5px;color:var(--text-mut);font-family:var(--font-mono)">' + fmtNumber(s.estimated_audience_size) + '</div></div>' +
        '<button class="oc-remove" data-idx="' + i + '"><svg class="ico"><use href="#icon-close"/></svg></button>' +
      '</div>';
    }).join("");
    host.querySelectorAll(".oc-remove").forEach(function (b) {
      b.addEventListener("click", function () {
        state.planner[key].splice(Number(b.dataset.idx), 1);
        _plannerRenderChips(key, chipsId, countId, max, _fromCatalog);
        if (key === "cur") { _plannerRenderRemCandidates(); }
        _plannerRefreshRunBtn();
      });
    });
  }
  _plannerRefreshRunBtn();
}

function _plannerRenderSugg(key, q, suggId, max, chipsId, countId) {
  var host = document.getElementById(suggId);
  if (!host) return;
  var list = state.planner[key] || [];
  if (list.length >= max) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0">Max ' + max + '.</div>';
    return;
  }
  var selectedIds = new Set(list.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }));
  // For Add pool, also filter out anything already in current.
  if (key === "add") {
    state.planner.cur.forEach(function (s) { selectedIds.add(s.signal_agent_segment_id || (s.signal_id && s.signal_id.id)); });
  }
  var rows = state.catalog.all || [];
  if (q) rows = rows.filter(function (s) {
    return (s.name || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
  });
  rows = rows.filter(function (s) {
    return !selectedIds.has(s.signal_agent_segment_id || (s.signal_id && s.signal_id.id));
  }).slice(0, 8);
  if (rows.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0">No catalog matches.</div>';
    return;
  }
  host.innerHTML = rows.map(function (s) {
    var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
    return '<div class="overlap-suggestion" data-sid="' + escapeHtml(sid) + '">' +
      '<div>' + escapeHtml(s.name) + '</div>' +
      '<div class="sub">' + fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "—") + '</div>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".overlap-suggestion").forEach(function (el) {
    el.addEventListener("click", function () {
      var sid = el.dataset.sid;
      var sig = state.catalog.all.find(function (x) {
        return (x.signal_agent_segment_id || (x.signal_id && x.signal_id.id)) === sid;
      });
      if (!sig) return;
      if (state.planner[key].length >= max) return;
      state.planner[key].push(sig);
      _plannerRenderChips(key, chipsId, countId, max, true);
      _plannerRenderSugg(key, "", suggId, max, chipsId, countId);
      if (key === "cur") {
        _plannerRenderRemCandidates();
        // Adds pool may now need to refilter.
        _plannerRenderSugg("add", "", "plan-add-sugg", 6, "plan-add-chips", "plan-add-count");
      }
    });
  });
}

function _plannerRenderRemCandidates() {
  var host = document.getElementById("plan-rem-candidates");
  if (!host) return;
  if (state.planner.cur.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0">Remove picks come from your current portfolio. Add some first.</div>';
    return;
  }
  var candidates = state.planner.cur.filter(function (s) {
    var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id);
    return !state.planner.rem.some(function (r) {
      return (r.signal_agent_segment_id || (r.signal_id && r.signal_id.id)) === sid;
    });
  });
  if (candidates.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0">All current signals marked for removal.</div>';
    return;
  }
  host.innerHTML = '<div style="font-size:10.5px;color:var(--text-mut);padding:4px 0 6px">Click to mark for removal:</div>' +
    candidates.map(function (s) {
      var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
      return '<div class="overlap-suggestion" data-sid="' + escapeHtml(sid) + '" style="padding:6px 8px">' +
        '<div style="font-size:11.5px">' + escapeHtml(s.name) + '</div>' +
      '</div>';
    }).join("");
  host.querySelectorAll(".overlap-suggestion").forEach(function (el) {
    el.addEventListener("click", function () {
      if (state.planner.rem.length >= 6) { showToast("Remove pool full (max 6).", true); return; }
      var sid = el.dataset.sid;
      var sig = state.planner.cur.find(function (x) {
        return (x.signal_agent_segment_id || (x.signal_id && x.signal_id.id)) === sid;
      });
      if (!sig) return;
      state.planner.rem.push(sig);
      _plannerRenderChips("rem", "plan-rem-chips", "plan-rem-count", 6, false);
      _plannerRenderRemCandidates();
    });
  });
}

function _plannerRefreshRunBtn() {
  var btn = document.getElementById("plan-run");
  if (!btn) return;
  var hasCurrent = state.planner.cur.length > 0;
  var hasChange = state.planner.add.length > 0 || state.planner.rem.length > 0;
  btn.disabled = !(hasCurrent && hasChange);
}

async function runPlanner() {
  var host = document.getElementById("plan-result");
  var curIds = state.planner.cur.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean);
  var addIds = state.planner.add.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean);
  var remIds = state.planner.rem.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean);
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Evaluating scenario…</div></div>';
  try {
    var r = await fetch("/portfolio/what-if", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: curIds, add: addIds, remove: remIds }),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.planner.lastResult = data;
    _renderPlannerResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function _renderPlannerResult(data) {
  var host = document.getElementById("plan-result");
  var before = data.before || {};
  var after = data.after || {};
  var recColor = data.recommendation === "operation_accepted" ? "var(--success)" :
                 data.recommendation === "operation_marginal" ? "var(--warning)" : "var(--error)";
  var recLabel = data.recommendation === "operation_accepted" ? "Keep" :
                 data.recommendation === "operation_marginal" ? "Marginal" : "Reject";
  var deltaReach = data.delta_reach || 0;
  var deltaCost = data.delta_cost || 0;
  var cards =
    '<div class="plan-cards">' +
      '<div class="plan-card"><div class="label">Before</div><div class="value mono">' + fmtNumber(before.reach || 0) + '</div><div class="sub">$' + fmtNumber(Math.round(before.cost || 0)) + ' · ' + (before.signal_count || 0) + ' signals</div></div>' +
      '<div class="plan-card"><div class="label">After</div><div class="value mono">' + fmtNumber(after.reach || 0) + '</div><div class="sub">$' + fmtNumber(Math.round(after.cost || 0)) + ' · ' + (after.signal_count || 0) + ' signals</div></div>' +
      '<div class="plan-card plan-delta"><div class="label">Δ Reach</div><div class="value mono" style="color:' + (deltaReach >= 0 ? 'var(--success)' : 'var(--error)') + '">' + (deltaReach >= 0 ? '+' : '') + fmtNumber(deltaReach) + '</div><div class="sub">' + (deltaCost >= 0 ? '+' : '') + '$' + fmtNumber(Math.round(deltaCost)) + '</div></div>' +
      '<div class="plan-card"><div class="label">Reach / $</div><div class="value mono">' + (data.delta_reach_per_dollar != null ? fmtNumber(data.delta_reach_per_dollar) : '—') + '</div><div class="sub">efficiency</div></div>' +
      '<div class="plan-card" style="border-left:3px solid ' + recColor + '"><div class="label">Recommendation</div><div class="value" style="color:' + recColor + '">' + recLabel + '</div><div class="sub">' + escapeHtml((data.reasoning || "").slice(0, 80)) + (data.reasoning && data.reasoning.length > 80 ? '…' : '') + '</div></div>' +
    '</div>';
  host.innerHTML = cards;
  document.getElementById("plan-explainer").innerHTML = renderChartExplainer({
    what: "Portfolio what-if: compare the current set against the current + adds − removes.",
    how: "Both sets are scored by the same greedy-marginal-reach engine the optimizer uses (<code>/portfolio/optimize</code>). Delta reach and delta cost come from the difference of the two scores; recommendation is keep / marginal / reject based on reach-per-dollar thresholds.",
    read: "Positive Δ reach at low Δ cost is a <strong>keep</strong>. Positive reach but expensive is <strong>marginal</strong> — verify creative alignment first. Flat or negative reach is a <strong>reject</strong>.",
    limits: "Reach is estimated at the signal level; dedup uses Jaccard affinity, not real ID intersection. Verify winning scenarios in a clean-room before committing spend.",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Sec-45: Audience Snapshots — save/list/diff current composition.
// Snapshots are auth-gated + operator-scoped in KV. This UI uses the
// Composer's current Set-Builder pools as the source of truth for "save".
// ─────────────────────────────────────────────────────────────────────────
var _snapshotsLoaded = false;

async function ensureSnapshots() {
  if (_snapshotsLoaded) return;
  _snapshotsLoaded = true;
  document.getElementById("snap-save").addEventListener("click", saveSnapshot);
  document.getElementById("snap-refresh").addEventListener("click", loadSnapshots);
  await loadSnapshots();
}

async function loadSnapshots() {
  var host = document.getElementById("snap-list");
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading snapshots…</div></div>';
  try {
    var r = await fetch("/snapshots", {
      headers: { "Authorization": "Bearer " + DEMO_KEY },
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.snapshots.list = data.snapshots || [];
    var countEl = document.getElementById("snap-count");
    if (countEl) countEl.textContent = state.snapshots.list.length;
    _renderSnapList();
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

`;
