// src/demo/script/fragments/journey.ts
//
// Journey planner: stage cards, pool/chip rendering, run-button wiring, result render.
//
// Source range (in pre-refactor src/demo/script.ts): lines 5937..6240 (304 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const journeyJs = `function ensureJourney() {
  if (_journeyLoaded) return;
  _journeyLoaded = true;
  if (state.journey.stages.length === 0) {
    state.journey.stages.push(_journeyBlankStage("Awareness"));
    state.journey.stages.push(_journeyBlankStage("Intent"));
  }
  _journeyRenderStages();
  document.getElementById("journey-add").addEventListener("click", function () {
    if (state.journey.stages.length >= 6) { showToast("Max 6 stages.", true); return; }
    var names = ["Awareness", "Consideration", "Intent", "Evaluation", "Conversion", "Retention"];
    var name = names[state.journey.stages.length] || ("Stage " + (state.journey.stages.length + 1));
    state.journey.stages.push(_journeyBlankStage(name));
    _journeyRenderStages();
    _journeyRefreshRunBtn();
  });
  // Sec-46: mode toggle (cumulative vs independent)
  document.querySelectorAll(".journey-mode-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mode = btn.dataset.mode;
      state.journey.cumulative = mode === "cumulative";
      document.querySelectorAll(".journey-mode-btn").forEach(function (b) {
        var active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      var hint = document.getElementById("journey-mode-hint");
      if (hint) hint.textContent = state.journey.cumulative
        ? "Each stage is a subset of the prior — upstream signals fold in as implicit intersects."
        : "Each stage is sized independently, then clamped monotonically. Use when stages come from separate data sources.";
    });
  });
  document.getElementById("journey-run").addEventListener("click", runJourney);
  _journeyRefreshRunBtn();
}

function _journeyBlankStage(name) {
  return { name: name, inc: [], itx: [], exc: [] };
}

function _journeyRenderStages() {
  var host = document.getElementById("journey-stages");
  if (!host) return;
  host.innerHTML = state.journey.stages.map(function (_st, i) {
    return _journeyStageCardHtml(i);
  }).join("");
  state.journey.stages.forEach(function (_st, i) { _journeyWireStage(i); });
}

function _journeyStageCardHtml(i) {
  var st = state.journey.stages[i];
  var canRemove = state.journey.stages.length > 2;
  return '<div class="journey-stage" data-i="' + i + '">' +
    '<div class="journey-stage-head">' +
      '<div class="journey-stage-idx">' + (i + 1) + '</div>' +
      '<input class="journey-stage-name" id="journey-name-' + i + '" value="' + escapeHtml(st.name) + '"/>' +
      (canRemove ? '<button class="journey-stage-remove" id="journey-remove-' + i + '" title="Remove stage"><svg class="ico"><use href="#icon-close"/></svg></button>' : '') +
    '</div>' +
    '<div class="journey-stage-pools">' +
      _journeyPoolHtml(i, "inc", "Include", 4) +
      _journeyPoolHtml(i, "itx", "Intersect", 3) +
      _journeyPoolHtml(i, "exc", "Exclude", 3) +
    '</div>' +
  '</div>';
}

function _journeyPoolHtml(i, pool, label, max) {
  var st = state.journey.stages[i];
  return '<div class="journey-pool">' +
    '<div class="builder-section-label">' + label + ' <span style="color:var(--text-mut);font-weight:400;font-family:var(--font-mono)" id="journey-count-' + i + '-' + pool + '">' + st[pool].length + ' / ' + max + '</span></div>' +
    '<div class="overlap-chips" id="journey-chips-' + i + '-' + pool + '"></div>' +
    '<div class="overlap-search">' +
      '<svg class="ico"><use href="#icon-search"/></svg>' +
      '<input id="journey-search-' + i + '-' + pool + '" placeholder="Search catalog…" autocomplete="off"/>' +
    '</div>' +
    '<div class="overlap-suggestions" id="journey-sugg-' + i + '-' + pool + '"></div>' +
  '</div>';
}

function _journeyWireStage(i) {
  var st = state.journey.stages[i];
  var nameEl = document.getElementById("journey-name-" + i);
  if (nameEl) nameEl.addEventListener("input", function () {
    state.journey.stages[i].name = nameEl.value.slice(0, 40);
  });
  var rm = document.getElementById("journey-remove-" + i);
  if (rm) rm.addEventListener("click", function () {
    if (state.journey.stages.length <= 2) { showToast("Need at least 2 stages.", true); return; }
    state.journey.stages.splice(i, 1);
    _journeyRenderStages();
    _journeyRefreshRunBtn();
  });
  ["inc", "itx", "exc"].forEach(function (pool) {
    var max = pool === "inc" ? 4 : 3;
    _journeyRenderChips(i, pool, max);
    _journeyRenderSugg(i, pool, "", max);
    var searchEl = document.getElementById("journey-search-" + i + "-" + pool);
    if (searchEl) {
      searchEl.addEventListener("input", function () {
        _journeyRenderSugg(i, pool, searchEl.value.trim().toLowerCase(), max);
      });
      searchEl.addEventListener("focus", function () {
        _journeyRenderSugg(i, pool, searchEl.value.trim().toLowerCase(), max);
      });
    }
    void st;
  });
}

function _journeyRenderChips(i, pool, max) {
  var st = state.journey.stages[i];
  var list = st[pool] || [];
  var host = document.getElementById("journey-chips-" + i + "-" + pool);
  var countEl = document.getElementById("journey-count-" + i + "-" + pool);
  if (countEl) countEl.textContent = list.length + " / " + max;
  if (!host) return;
  if (list.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0;font-style:italic">None.</div>';
  } else {
    host.innerHTML = list.map(function (s, idx) {
      var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
      return '<div class="overlap-chip" data-sid="' + escapeHtml(sid) + '">' +
        '<div><div class="oc-name">' + escapeHtml(s.name) + '</div>' +
        '<div style="font-size:10.5px;color:var(--text-mut);font-family:var(--font-mono)">' + fmtNumber(s.estimated_audience_size) + '</div></div>' +
        '<button class="oc-remove" data-idx="' + idx + '"><svg class="ico"><use href="#icon-close"/></svg></button>' +
      '</div>';
    }).join("");
    host.querySelectorAll(".oc-remove").forEach(function (b) {
      b.addEventListener("click", function () {
        state.journey.stages[i][pool].splice(Number(b.dataset.idx), 1);
        _journeyRenderChips(i, pool, max);
        _journeyRenderSugg(i, pool, "", max);
        _journeyRefreshRunBtn();
      });
    });
  }
  _journeyRefreshRunBtn();
}

function _journeyRenderSugg(i, pool, q, max) {
  var st = state.journey.stages[i];
  var host = document.getElementById("journey-sugg-" + i + "-" + pool);
  if (!host) return;
  var list = st[pool] || [];
  if (list.length >= max) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0">Max ' + max + '.</div>';
    return;
  }
  var selected = new Set(list.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }));
  var rows = state.catalog.all || [];
  if (q) rows = rows.filter(function (s) {
    return (s.name || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
  });
  rows = rows.filter(function (s) {
    return !selected.has(s.signal_agent_segment_id || (s.signal_id && s.signal_id.id));
  }).slice(0, 6);
  if (rows.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0">No matches.</div>';
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
      if (state.journey.stages[i][pool].length >= max) return;
      state.journey.stages[i][pool].push(sig);
      _journeyRenderChips(i, pool, max);
      _journeyRenderSugg(i, pool, "", max);
    });
  });
}

function _journeyRefreshRunBtn() {
  var btn = document.getElementById("journey-run");
  if (!btn) return;
  var ok = state.journey.stages.length >= 2 && state.journey.stages.every(function (st) {
    return (st.inc.length + st.itx.length) >= 1;
  });
  btn.disabled = !ok;
}

async function runJourney() {
  var host = document.getElementById("journey-result");
  var stages = state.journey.stages.map(function (st) {
    return {
      name: st.name || "stage",
      include: st.inc.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean),
      intersect: st.itx.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean),
      exclude: st.exc.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean),
    };
  });
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Computing funnel…</div></div>';
  try {
    var r = await fetch("/audience/journey", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stages: stages, cumulative: !!state.journey.cumulative }),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.journey.lastResult = data;
    _renderJourneyResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function _renderJourneyResult(data) {
  var host = document.getElementById("journey-result");
  var stages = data.stages || [];
  if (stages.length === 0) { host.innerHTML = '<div class="empty-state"><div class="empty-title">Empty funnel</div></div>'; return; }
  var top = stages[0].reach || 0;
  var mode = data.mode || "independent";
  var rows = stages.map(function (s, i) {
    var pct = top > 0 ? (s.reach / top) * 100 : 0;
    var convPrior = i === 0 ? null : (s.conversion_rate != null ? s.conversion_rate : null);
    var cumPct = (s.cumulative_rate != null ? s.cumulative_rate * 100 : pct);
    var clampedMark = s.clamped ? ' <span class="pill pill-error mono" style="font-size:10px" title="Stage broader than its parent — clamped down. In cumulative mode this should never happen; in independent mode it means your stages aren\\'t a valid funnel.">clamped</span>' : '';
    // Sec-46: when clamp happened, show both the pre-clamp (natively computed) reach and the clamped value.
    var preClampLine = (s.clamped && s.pre_clamp_reach != null && s.pre_clamp_reach > s.reach)
      ? '<span class="journey-row-preclamp">natively ' + fmtNumber(s.pre_clamp_reach) + ' · clamped to ' + fmtNumber(s.reach) + '</span>'
      : '';
    return '<div class="journey-row' + (s.clamped ? ' journey-row-clamped' : '') + '">' +
      '<div class="journey-row-head">' +
        '<span class="journey-row-name">' + escapeHtml(s.name || ("Stage " + (i + 1))) + clampedMark + '</span>' +
        '<span class="journey-row-reach mono">' + fmtNumber(s.reach || 0) + '</span>' +
      '</div>' +
      '<div class="journey-bar-outer"><div class="journey-bar-inner" style="width:' + pct.toFixed(1) + '%"></div></div>' +
      '<div class="journey-row-meta">' +
        '<span>' + cumPct.toFixed(1) + '% of top-of-funnel</span>' +
        (convPrior != null ? '<span>· ' + (convPrior * 100).toFixed(1) + '% vs prior</span>' : '<span>· top</span>') +
        (s.dropped_off != null && i > 0 ? '<span>· dropped ' + fmtNumber(s.dropped_off) + '</span>' : '') +
        (preClampLine ? '<span class="journey-row-preclamp-wrap">· ' + preClampLine + '</span>' : '') +
      '</div>' +
    '</div>';
  }).join("");
  var overall = data.overall || {};
  var modePill = '<span class="pill ' + (mode === "cumulative" ? "pill-success" : "pill-muted") + ' mono" style="font-size:10px;margin-left:8px">' + escapeHtml(mode) + '</span>';
  var summary =
    '<div class="journey-summary">' +
      '<div><div class="k">Mode</div><div class="v">' + escapeHtml(mode) + '</div></div>' +
      '<div><div class="k">Top</div><div class="v mono">' + fmtNumber(overall.top_of_funnel || 0) + '</div></div>' +
      '<div><div class="k">Bottom</div><div class="v mono">' + fmtNumber(overall.bottom_of_funnel || 0) + '</div></div>' +
      '<div><div class="k">End-to-end</div><div class="v mono">' + ((overall.end_to_end_conversion || 0) * 100).toFixed(1) + '%</div></div>' +
      (overall.biggest_dropoff_stage ? '<div><div class="k">Biggest drop</div><div class="v">' + escapeHtml(overall.biggest_dropoff_stage) + '</div></div>' : '') +
    '</div>';
  // Sec-46: surface a clear warning banner when ANY stage was clamped. In cumulative
  // mode this is rare and points to a heuristic edge case; in independent mode it
  // means the stages aren't actually a funnel (a later stage was broader than its
  // parent) and the user should fix their composition, not trust the conversion
  // numbers below (which read as 100% + 0 dropped after clamp — misleading).
  var clampedStages = stages.filter(function (s) { return s.clamped; }).map(function (s) { return s.name; });
  var warningBanner = "";
  if (clampedStages.length > 0) {
    warningBanner =
      '<div class="journey-warning-banner">' +
        '<div class="journey-warning-icon">!</div>' +
        '<div class="journey-warning-body">' +
          '<div class="journey-warning-title">' + clampedStages.length + ' stage' + (clampedStages.length === 1 ? '' : 's') + ' clamped: ' + escapeHtml(clampedStages.join(", ")) + '</div>' +
          '<div class="journey-warning-detail">' +
            (mode === "cumulative"
              ? 'Cumulative mode should normally prevent this; heuristic edge case. Conversion + drop-off metrics on clamped stages read as 100% / 0 — ignore them.'
              : 'Each clamped stage was <strong>broader than its parent</strong>, so it was capped. Conversion + drop-off metrics on clamped stages read as 100% / 0 — ignore them. Either fix the composition (later stages should narrow, not broaden) or switch to <strong>Cumulative</strong> mode to make subset-of-parent an enforced invariant.') +
          '</div>' +
        '</div>' +
      '</div>';
  }
  host.innerHTML = warningBanner + summary + '<div class="journey-funnel">' + rows + '</div>';
  document.getElementById("journey-explainer").innerHTML = renderChartExplainer({
    what: "Stacked per-stage segmentation with a monotone reach funnel.",
    how: "<strong>Cumulative mode (default):</strong> each stage's signals are intersected with the union of upstream-stage signals, so stage <code>i</code> is automatically a subset of stage <code>i−1</code>. <strong>Independent mode:</strong> each stage is sized on its own via <code>/audience/compose</code>, then reaches are clamped to be monotonically non-increasing after the fact. Reach math: inclusion-exclusion for union, Jaccard-decayed intersect, subtracted overlap for exclude.",
    read: "Bars show each stage's reach as a share of top-of-funnel. % vs prior is the conversion rate between consecutive stages; cumulative % is vs stage 1. A red <code>clamped</code> pill marks stages whose native reach exceeded the parent's — in independent mode that's almost always a configuration error.",
    limits: "Reach math is estimated (catalog-level, not user-level); treat the funnel as a planning sketch, not a production attribution chain. Clamped stages' conversion and drop-off metrics are meaningless after clamp — look at pre-clamp reach to understand what the stage actually described.",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Sec-45: Scenario Planner — wraps /portfolio/what-if.
// Three pools: current portfolio, adds, removes. Remove picks are chosen
// from the current pool (you can't remove something you don't own).
// ─────────────────────────────────────────────────────────────────────────
var _plannerLoaded = false;

async function ensurePlanner() {
  if (_plannerLoaded) return;
  _plannerLoaded = true;
  if (state.catalog.all.length === 0) await loadCatalog();
  _plannerWirePool("cur", "plan-cur-chips", "plan-cur-search", "plan-cur-sugg", "plan-cur-count", 12, true);
  _plannerWirePool("add", "plan-add-chips", "plan-add-search", "plan-add-sugg", "plan-add-count", 6, true);
  _plannerWirePool("rem", "plan-rem-chips", null, null, "plan-rem-count", 6, false);
  _plannerRenderRemCandidates();
  document.getElementById("plan-run").addEventListener("click", runPlanner);
  _plannerRefreshRunBtn();
}

`;
