// src/demo/script/fragments/embedding-lab.ts
//
// Embedding Lab: shortlist toggles, result list, action bar, playground/arithmetic/analogy/neighborhood subtabs.
//
// Source range (in pre-refactor src/demo/script.ts): lines 4476..4938 (463 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const embeddingLabJs = `function shortlistHas(sid) { return _shortlist.some(function (s) { return s.sid === sid; }); }
function shortlistToggle(sid, name, category) {
  var idx = _shortlist.findIndex(function (s) { return s.sid === sid; });
  if (idx >= 0) _shortlist.splice(idx, 1);
  else _shortlist.push({ sid: sid, name: name, category: category });
}

// Resolve a humanized id back to the real catalog name when possible.
// Falls back to the provided label. Used by the arithmetic/analogy/
// neighborhood selects so "sig_age_25_34" renders as "Core Millennials,
// 25-34" (from catalog) instead of the mangled "Age 25 34".
function prettyNameFor(sid, fallback) {
  if (state.catalog && state.catalog.all) {
    var hit = state.catalog.all.find(function (s) { return s.signal_agent_segment_id === sid; });
    if (hit && hit.name) return hit.name;
  }
  return fallback || sid;
}

// Render a result list from query-vector / arithmetic / analogy /
// neighborhood / brief-portfolio. Each row now has:
//   1) cosine bar
//   2) add-to-shortlist checkbox
//   3) activate-now icon button
//   4) click row background to open detail panel
// The surrounding action bar is rendered separately by renderActionBar().
function renderEmbResultList(results, cosineKey, contextId) {
  cosineKey = cosineKey || "cosine";
  contextId = contextId || "default";
  if (!results || !results.length) {
    return '<div class="empty-state" style="padding:14px"><div class="empty-desc">No matches. Try a different query.</div></div>';
  }
  return '<div class="emb-result-list" data-ctx="' + escapeHtml(contextId) + '">' + results.map(function (r, i) {
    var cos = r[cosineKey] !== undefined ? r[cosineKey] : r.cosine_or_score;
    var cosPct = Math.max(0, cos) * 100;
    var sid = r.signal_agent_segment_id || r.signal_id || "";
    var name = prettyNameFor(sid, r.name);
    var category = r.category_type || r.category || "";
    var inShortlist = shortlistHas(sid);
    return '<div class="emb-result-row" data-sid="' + escapeHtml(sid) + '" data-name="' + escapeHtml(name) + '" data-category="' + escapeHtml(category) + '">' +
      '<label class="err-check" title="Add to shortlist"><input type="checkbox" data-sl-sid="' + escapeHtml(sid) + '"' + (inShortlist ? ' checked' : '') + '/></label>' +
      '<div class="err-rank">' + (i + 1) + '</div>' +
      '<div class="err-main">' +
        '<div class="err-name">' + escapeHtml(name) + '</div>' +
        '<div class="err-sid mono">' + escapeHtml(sid) + (category ? ' \u00b7 ' + escapeHtml(category) : '') + '</div>' +
      '</div>' +
      '<div class="err-cos">' +
        '<div class="err-cos-val mono">' + (typeof cos === "number" ? cos.toFixed(3) : "—") + '</div>' +
        '<div class="err-cos-bar"><div class="err-cos-fill" style="width:' + cosPct.toFixed(1) + '%"></div></div>' +
      '</div>' +
      '<button class="err-activate" data-activate-sid="' + escapeHtml(sid) + '" title="Activate to mock_dsp">' +
        '<svg class="ico"><use href="#icon-bolt"/></svg>' +
      '</button>' +
    '</div>';
  }).join("") + '</div>';
}

// Render the universal action bar — placed above every ranked result list.
// Shows shortlist count + bulk actions. Action identifiers (e.g. "lab-pg")
// are scoped so each tab's buttons don't collide.
function renderActionBar(contextId) {
  var count = _shortlist.length;
  return '<div class="result-actionbar">' +
    '<div class="result-actionbar-info">' +
      (count > 0
        ? '<strong>' + count + '</strong> in shortlist across tabs'
        : 'Shortlist is empty \u2014 check rows below')
    + '</div>' +
    '<button class="btn-secondary" data-result-action="clear-shortlist" data-ctx="' + escapeHtml(contextId) + '" style="padding:4px 12px;font-size:11.5px"' + (count === 0 ? ' disabled' : '') + '>Clear</button>' +
    '<button class="btn-secondary" data-result-action="export-csv" data-ctx="' + escapeHtml(contextId) + '" style="padding:4px 12px;font-size:11.5px"' + (count === 0 ? ' disabled' : '') + '><svg class="ico"><use href="#icon-book"/></svg><span>Export CSV</span></button>' +
    '<button class="btn-secondary" data-result-action="send-builder" data-ctx="' + escapeHtml(contextId) + '" style="padding:4px 12px;font-size:11.5px"' + (count === 0 ? ' disabled' : '') + '><svg class="ico"><use href="#icon-builder"/></svg><span>Open in Builder</span></button>' +
    '<button class="btn-primary" data-result-action="activate-selected" data-ctx="' + escapeHtml(contextId) + '" style="padding:4px 12px;font-size:11.5px"' + (count === 0 ? ' disabled' : '') + '><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate selected</span></button>' +
  '</div>';
}

// Wire per-row + action-bar handlers for a results container. Called
// after rendering into a host. onRerender is a closure that re-renders
// the list with updated shortlist state so checkbox ticks remain consistent.
function wireResultList(host, onRerender) {
  if (!host) return;
  // Checkbox → toggle shortlist
  host.querySelectorAll('[data-sl-sid]').forEach(function (cb) {
    cb.addEventListener('change', function (e) {
      e.stopPropagation();
      var row = cb.closest('.emb-result-row');
      var sid = cb.dataset.slSid;
      var name = row ? row.dataset.name : sid;
      var category = row ? row.dataset.category : "";
      shortlistToggle(sid, name, category);
      if (onRerender) onRerender();
    });
  });
  // Activate button → fire single activation
  host.querySelectorAll('[data-activate-sid]').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      e.stopPropagation();
      var sid = btn.dataset.activateSid;
      btn.disabled = true;
      btn.classList.add("err-activating");
      try {
        var data = await callTool("activate_signal", _activateArgs(sid));
        showToast("\u2713 Activated " + sid + (data.operation_id ? " \u00b7 " + data.operation_id : ""));
        btn.classList.remove("err-activating");
        btn.classList.add("err-activated");
      } catch (err) {
        showToast("Activation failed: " + err.message, true);
        btn.classList.remove("err-activating");
        btn.disabled = false;
      }
    });
  });
  // Row click → open detail panel
  host.querySelectorAll('.emb-result-row').forEach(function (row) {
    row.addEventListener('click', function (e) {
      if (e.target.closest('input, button, label')) return;
      openDetailHydrated(row.dataset.sid);
    });
  });
  // Action bar buttons
  host.querySelectorAll('[data-result-action]').forEach(function (btn) {
    btn.addEventListener('click', function () { handleResultAction(btn.dataset.resultAction, onRerender); });
  });
}

async function handleResultAction(action, onRerender) {
  if (action === "clear-shortlist") {
    _shortlist = [];
    if (onRerender) onRerender();
  } else if (action === "export-csv") {
    if (_shortlist.length === 0) return;
    function esc(v) { var s = v == null ? "" : String(v); return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    var rows = _shortlist.map(function (s, i) { return [i + 1, s.sid, s.name, s.category].map(esc).join(","); });
    var csv = "rank,signal_id,name,category\\n" + rows.join("\\n");
    var blob = new Blob([csv], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "shortlist-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast("CSV downloaded (" + _shortlist.length + " signals)");
  } else if (action === "send-builder") {
    if (_shortlist.length === 0) return;
    // Pre-populate builder stack with shortlist
    if (!state.catalog.all.length) await loadCatalog();
    _builderStack.selected = _shortlist.map(function (s) {
      return state.catalog.all.find(function (c) { return c.signal_agent_segment_id === s.sid; });
    }).filter(Boolean);
    switchTab("builder");
    showToast("Opened Builder with " + _builderStack.selected.length + " shortlisted signals");
  } else if (action === "activate-selected") {
    if (_shortlist.length === 0) return;
    showToast("Activating " + _shortlist.length + " signals\u2026");
    var results = await Promise.allSettled(_shortlist.map(function (s) {
      return callTool("activate_signal", _activateArgs(s.sid));
    }));
    var ok = results.filter(function (r) { return r.status === "fulfilled"; }).length;
    showToast("\u2713 Activated " + ok + "/" + _shortlist.length + ". See Activations tab for status.");
  }
}

// ─── Embedding Lab ───────────────────────────────────────────────────────
var _labLoaded = false;
async function ensureLab() {
  if (_labLoaded) return;
  _labLoaded = true;
  // Load embeddings AND catalog so select dropdowns show real signal names
  // (e.g. "Age 25-34" not the mangled "Age 25 34" from the humanizer).
  await Promise.all([loadEmbSignals(), state.catalog.all.length === 0 ? loadCatalog() : Promise.resolve()]);
  // Upgrade _embSignals names with real catalog names where available
  if (_embSignals && state.catalog.all && state.catalog.all.length) {
    _embSignals = _embSignals.map(function (s) {
      var real = state.catalog.all.find(function (c) { return c.signal_agent_segment_id === s.id; });
      return real ? Object.assign({}, s, { name: real.name }) : s;
    });
  }
  wireLabSubtabs();
  wireLabPlayground();
  wireLabArithmetic();
  wireLabAnalogy();
  wireLabNeighborhood();
}

function wireLabSubtabs() {
  document.querySelectorAll(".lab-subtab[data-lab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.dataset.lab;
      document.querySelectorAll(".lab-subtab[data-lab]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      document.querySelectorAll(".lab-subpanel[data-lab-panel]").forEach(function (p) {
        p.style.display = p.dataset.labPanel === target ? "" : "none";
      });
      if (target === "coverage") renderCoverageGaps();
    });
  });
}

// Playground — /ucp/query-vector
function wireLabPlayground() {
  var mode = "text";
  document.querySelectorAll("[data-pg-mode]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      mode = btn.dataset.pgMode;
      document.querySelectorAll("[data-pg-mode]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      document.getElementById("pg-text-shell").style.display = mode === "text" ? "" : "none";
      document.getElementById("pg-vector-shell").style.display = mode === "vector" ? "" : "none";
    });
  });
  document.querySelectorAll("#pg-sample-briefs .lab-chip").forEach(function (c) {
    c.addEventListener("click", function () { document.getElementById("pg-text").value = c.dataset.brief; });
  });

  // Transcode text -> 512-d vector. Pre-fills the vector textarea with
  // 6-decimal comma-separated floats so the user can run /ucp/query-vector
  // without pasting 512 numbers by hand. Uses the same engine the catalog
  // uses for embedSignal so the produced vector is in the same space_id.
  document.getElementById("pg-transcode-btn").addEventListener("click", async function () {
    var input = document.getElementById("pg-transcode-text");
    var meta = document.getElementById("pg-transcode-meta");
    var btn = this;
    var text = (input.value || "").trim();
    if (!text) {
      meta.textContent = "Enter text above first.";
      meta.style.color = "var(--error)";
      return;
    }
    var origLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span>Transcoding…</span>';
    meta.style.color = "var(--text-mut)";
    meta.textContent = "calling /ucp/embed-text…";
    try {
      var r = await fetch("/ucp/embed-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text }),
      });
      var data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || ("HTTP " + r.status));
      // Pre-fill the vector textarea with 6-decimal comma-separated floats.
      // Six decimals is enough precision for cosine queries to land on the
      // same neighbors as the raw float64 vector while keeping the textarea
      // human-scannable (~5KB instead of ~10KB).
      document.getElementById("pg-vector").value = data.vector
        .map(function (x) { return x.toFixed(6); })
        .join(", ");
      var phaseLabel = data.engine_phase === "pseudo-v1"
        ? "pseudo (deterministic hash — demo only)"
        : "live (" + data.model_label + ")";
      meta.style.color = "var(--success, #5fd9c4)";
      meta.innerHTML =
        "✓ transcoded · " + data.dim + "-d · space=" +
        escapeHtml(data.space_id) + " · phase=" + escapeHtml(phaseLabel) +
        " · " + data.duration_ms + "ms";
    } catch (e) {
      meta.style.color = "var(--error)";
      meta.textContent = "transcode failed: " + (e && e.message ? e.message : String(e));
    } finally {
      btn.disabled = false;
      btn.innerHTML = origLabel;
    }
  });

  document.getElementById("pg-run").addEventListener("click", async function () {
    var host = document.getElementById("pg-results");
    host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Computing cosines\u2026</div></div>';
    var body = { mode: mode, k: parseInt(document.getElementById("pg-k").value, 10) || 10 };
    if (mode === "text") body.text = document.getElementById("pg-text").value;
    else {
      var raw = document.getElementById("pg-vector").value.split(/[,\s]+/).map(function (s) { return parseFloat(s); }).filter(function (v) { return !isNaN(v); });
      body.vector = raw;
    }
    try {
      var r = await fetch("/ucp/query-vector", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      var data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || ("HTTP " + r.status));
      var rerenderPg = function () {
        host.innerHTML = renderActionBar("pg") + renderEmbResultList(data.results, "cosine", "pg");
        wireResultList(host, rerenderPg);
      };
      rerenderPg();
      document.getElementById("pg-explainer").innerHTML = renderChartExplainer({
        what: "Top-" + data.k + " catalog audiences most semantically similar to your query.",
        how: data.method + " (" + data.query_vector_source + "). Each result\u2019s cosine is the dot product of L2-normalized vectors. Use the bolt icon to activate any row directly, or check the boxes to bulk-activate.",
        read: "Higher cosine = stronger semantic match. Cosines above 0.5 are usually solid; below 0.2 are tenuous. Click a row to open its detail panel; check rows to add to the cross-tab shortlist.",
        limits: mode === "text" ? "Text mode uses a deterministic pseudo-hash vector \u2014 useful for demo but not as semantically rich as a real LLM embedding. POST mode=vector with your own vector for production quality." : "Vector mode: caller-provided vector. Ensure your vector is from the same space_id (" + data.space_id + ").",
      });
    } catch (e) {
      host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    }
  });
}

// Arithmetic — /ucp/arithmetic
var _arithTerms = [{ sign: "base", id: "", weight: 1 }, { sign: "plus", id: "", weight: 1 }];
function renderArithTerms() {
  var host = document.getElementById("arith-terms");
  if (!host) return;
  host.innerHTML = _arithTerms.map(function (t, i) {
    var options = (_embSignals || []).map(function (s) {
      return '<option value="' + escapeHtml(s.id) + '"' + (t.id === s.id ? ' selected' : '') + '>' + escapeHtml(s.name) + '</option>';
    }).join("");
    var signHtml = i === 0
      ? '<span class="arith-sign mono" style="min-width:40px">base</span>'
      : '<select class="arith-sign" data-idx="' + i + '"><option value="plus"' + (t.sign === "plus" ? ' selected' : '') + '>+</option><option value="minus"' + (t.sign === "minus" ? ' selected' : '') + '>\u2212</option></select>';
    return '<div class="arith-term">' +
      signHtml +
      '<input type="number" min="0" max="2" step="0.1" value="' + t.weight + '" class="arith-weight" data-idx="' + i + '"/>' +
      '<span>\u00d7</span>' +
      '<select class="arith-id" data-idx="' + i + '"><option value="">\u2014 pick signal \u2014</option>' + options + '</select>' +
      (i >= 1 ? '<button class="arith-remove" data-idx="' + i + '"><svg class="ico"><use href="#icon-close"/></svg></button>' : '') +
    '</div>';
  }).join("");
  host.querySelectorAll(".arith-sign").forEach(function (el) { el.addEventListener("change", function () { _arithTerms[parseInt(el.dataset.idx, 10)].sign = el.value; }); });
  host.querySelectorAll(".arith-weight").forEach(function (el) { el.addEventListener("input", function () { _arithTerms[parseInt(el.dataset.idx, 10)].weight = parseFloat(el.value) || 1; }); });
  host.querySelectorAll(".arith-id").forEach(function (el) { el.addEventListener("change", function () { _arithTerms[parseInt(el.dataset.idx, 10)].id = el.value; }); });
  host.querySelectorAll(".arith-remove").forEach(function (el) { el.addEventListener("click", function () { _arithTerms.splice(parseInt(el.dataset.idx, 10), 1); renderArithTerms(); }); });
}
function wireLabArithmetic() {
  renderArithTerms();
  document.getElementById("arith-add-term").addEventListener("click", function () {
    if (_arithTerms.length >= 6) { showToast("Max 6 terms", true); return; }
    _arithTerms.push({ sign: "plus", id: "", weight: 1 });
    renderArithTerms();
  });
  document.querySelectorAll(".lab-chip[data-preset]").forEach(function (c) {
    c.addEventListener("click", function () {
      var preset = c.dataset.preset;
      if (preset === "luxury_millennial") {
        _arithTerms = [{ sign: "base", id: "sig_high_income_households", weight: 1 }, { sign: "plus", id: "sig_age_25_34", weight: 1 }];
      } else if (preset === "cord_cutter_parents") {
        _arithTerms = [{ sign: "base", id: "sig_streaming_enthusiasts", weight: 1 }, { sign: "plus", id: "sig_age_35_44", weight: 1 }];
      } else if (preset === "affluent_minus_urban") {
        _arithTerms = [{ sign: "base", id: "sig_high_income_households", weight: 1 }, { sign: "minus", id: "sig_age_18_24", weight: 0.5 }];
      }
      renderArithTerms();
    });
  });
  document.getElementById("arith-run").addEventListener("click", async function () {
    var host = document.getElementById("arith-results");
    var expr = document.getElementById("arith-expression");
    host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Composing vectors\u2026</div></div>';
    var terms = _arithTerms.filter(function (t) { return t.id; });
    if (terms.length < 1) { host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Pick at least one signal</div></div>'; return; }
    var body = { plus: [], minus: [], weights: {}, k: parseInt(document.getElementById("arith-k").value, 10) || 10 };
    terms.forEach(function (t) {
      if (t.sign === "base") body.base = t.id;
      else if (t.sign === "plus") body.plus.push(t.id);
      else if (t.sign === "minus") body.minus.push(t.id);
      body.weights[t.id] = t.weight;
    });
    try {
      var r = await fetch("/ucp/arithmetic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      var data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || ("HTTP " + r.status));
      expr.innerHTML = '<div class="lab-expr-inner">' + escapeHtml(data.expression) + ' <span class="mono" style="color:var(--text-mut);margin-left:8px">pre-norm norm: ' + data.composed_vector_norm_before_normalize + '</span></div>';
      var rerenderAr = function () {
        host.innerHTML = renderActionBar("arith") + renderEmbResultList(data.results, "cosine", "arith");
        wireResultList(host, rerenderAr);
      };
      rerenderAr();
      document.getElementById("arith-explainer").innerHTML = renderChartExplainer({
        what: "Top audiences closest to the composed vector you built. Bolt icon on each row activates immediately; check rows to bulk-activate or send to Builder.",
        how: "Weighted sum of input vectors: base + \u03a3 (plus) \u2212 \u03a3 (minus), then L2-normalized. Results rank by cosine to the composed vector. Input signals excluded to prevent self-match.",
        read: "High-cosine results reflect the meaning combination you built. E.g., luxury + millennial \u2192 upscale young-adult audiences.",
        limits: "Works best with signals whose vectors are semantically coherent. Out-of-distribution combinations may produce low-confidence matches.",
      });
    } catch (e) {
      host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    }
  });
}

// Analogy — /ucp/analogy
function wireLabAnalogy() {
  var options = (_embSignals || []).map(function (s) { return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name) + '</option>'; }).join("");
  ["ana-a", "ana-b", "ana-c"].forEach(function (id) { var el = document.getElementById(id); if (el) el.innerHTML = '<option value="">\u2014 pick \u2014</option>' + options; });
  var algorithm = "3cos_add";
  document.querySelectorAll("[data-ana-algo]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      algorithm = btn.dataset.anaAlgo;
      document.querySelectorAll("[data-ana-algo]").forEach(function (b) { b.classList.toggle("active", b === btn); });
    });
  });
  document.getElementById("ana-run").addEventListener("click", async function () {
    var host = document.getElementById("ana-results");
    var a = document.getElementById("ana-a").value, b = document.getElementById("ana-b").value, c = document.getElementById("ana-c").value;
    if (!a || !b || !c) { host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Pick A, B, and C</div></div>'; return; }
    host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Solving for D\u2026</div></div>';
    try {
      var r = await fetch("/ucp/analogy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: a, b: b, c: c, algorithm: algorithm, k: 10 }) });
      var data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || ("HTTP " + r.status));
      var analogyHeader = '<div class="lab-expr-inner" style="margin-bottom:10px">' + escapeHtml(data.analogy) + ' <span class="mono" style="color:var(--text-mut);margin-left:8px">algorithm: ' + data.algorithm + '</span></div>';
      var rerenderAna = function () {
        host.innerHTML = analogyHeader + renderActionBar("analogy") + renderEmbResultList(data.results, "cosine_or_score", "analogy");
        wireResultList(host, rerenderAna);
      };
      rerenderAna();
      document.getElementById("ana-explainer").innerHTML = renderChartExplainer({
        what: "Top candidate signals filling the analogy A:B::C:? \u2014 click the bolt on any row to activate, or check rows to bulk-activate.",
        how: data.algorithm === "3cos_add" ? "3CosAdd: D = L2-normalize(B \u2212 A + C), then rank by cosine. The rotation direction from A to B is applied to C." : "3CosMul (Levy & Goldberg 2014): rank by (cos(x,B)+1) \u00d7 (cos(x,C)+1) / (cos(x,A)+\u03b5+1). More robust to degenerate analogies.",
        read: "Top result is the best vector-space analogy. High scores = parallel direction between (A\u2192B) and (C\u2192result).",
        limits: "Works best when the A\u2192B relation is simple (tier upgrade, demographic shift). Complex relations may not generalize.",
      });
    } catch (e) {
      host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    }
  });
}

// Neighborhood — /ucp/neighborhood
function wireLabNeighborhood() {
  var options = (_embSignals || []).map(function (s) { return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name) + '</option>'; }).join("");
  var sel = document.getElementById("nbh-seed");
  if (sel) sel.innerHTML = '<option value="">\u2014 pick \u2014</option>' + options;
  document.getElementById("nbh-run").addEventListener("click", async function () {
    var host = document.getElementById("nbh-results");
    var seed = document.getElementById("nbh-seed").value;
    if (!seed) { host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Pick a seed signal</div></div>'; return; }
    host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Exploring neighborhood\u2026</div></div>';
    try {
      var r = await fetch("/ucp/neighborhood", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signal_id: seed, k: parseInt(document.getElementById("nbh-k").value, 10) || 10 }) });
      var data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || ("HTTP " + r.status));
      var statsHtml = '<div class="nbh-stats">' +
        '<div class="nbh-stat"><div class="nbh-stat-label">Local density</div><div class="nbh-stat-val">' + data.local_density + '</div></div>' +
        '<div class="nbh-stat"><div class="nbh-stat-label">Distance to centroid</div><div class="nbh-stat-val">' + data.catalog_centroid_distance + '</div></div>' +
        '<div class="nbh-stat"><div class="nbh-stat-label">Role</div><div class="nbh-stat-val">' + (data.is_prototypical ? "prototypical" : "edge case") + '</div></div>' +
      '</div>';
      var rerenderNbh = function () {
        host.innerHTML = statsHtml + renderActionBar("nbh") + renderEmbResultList(data.neighbors, "cosine", "nbh");
        wireResultList(host, rerenderNbh);
      };
      rerenderNbh();
      document.getElementById("nbh-explainer").innerHTML = renderChartExplainer({
        what: "The k nearest neighbors of your seed signal, plus local density stats. Row bolt activates immediately; checkboxes add to cross-tab shortlist.",
        how: "Cosine-rank across the 26-vector embedding store. Local density = mean cosine to top-k neighbors (0..1). Centroid distance = 1 \u2212 cos(signal, catalog_centroid).",
        read: "High local density = tight cluster (alternatives). Low centroid distance = \u201cprototypical\u201d of the catalog; high = specialty/edge audience.",
        limits: "Computed over the 26 embedded signals only. Future: extend to full 520-signal catalog via incremental embedding.",
      });
      host.querySelectorAll(".emb-result-row").forEach(function (row) {
        row.addEventListener("click", function () { openDetailHydrated(row.dataset.sid); });
      });
    } catch (e) {
      host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    }
  });
}

// Coverage gaps — /analytics/coverage-gaps
async function renderCoverageGaps() {
  var host = document.getElementById("cov-viz");
  if (!host || host.dataset.loaded) return;
  host.dataset.loaded = "1";
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Computing gap heatmap\u2026</div></div>';
  try {
    var r = await fetch("/analytics/coverage-gaps");
    var data = await r.json();
    var W = 600, H = 500;
    var cellW = W / data.grid_w, cellH = H / data.grid_h;
    var cellMap = {};
    (data.cells_with_points || []).forEach(function (c) { cellMap[c.row + "_" + c.col] = c; });
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';
    for (var r2 = 0; r2 < data.grid_h; r2++) {
      for (var c2 = 0; c2 < data.grid_w; c2++) {
        var key = r2 + "_" + c2;
        var cell = cellMap[key];
        var count = cell ? cell.count : 0;
        var density = cell ? cell.density : 0;
        var fill;
        if (count === 0) {
          fill = "rgba(255, 122, 92, 0.15)";  // warm gap
        } else {
          var intensity = 0.3 + density * 0.7;
          fill = "rgba(79, 142, 255, " + intensity.toFixed(3) + ")";
        }
        svg += '<rect x="' + (c2 * cellW) + '" y="' + (r2 * cellH) + '" width="' + cellW + '" height="' + cellH + '" fill="' + fill + '" stroke="var(--bg-surface)" stroke-width="0.5">' +
          '<title>cell (' + r2 + ',' + c2 + '): ' + count + ' signals, density=' + density.toFixed(2) + '</title>' +
        '</rect>';
      }
    }
    // Highlight top-3 gap cells
    (data.gap_cells || []).slice(0, 3).forEach(function (g) {
      var cx = (g.col + 0.5) * cellW, cy = (g.row + 0.5) * cellH;
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (Math.min(cellW, cellH) * 0.35) + '" fill="none" stroke="var(--warn)" stroke-width="2" stroke-dasharray="4,2"/>';
      svg += '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" font-size="10" fill="var(--warn)" font-weight="600">gap</text>';
    });
    svg += '</svg>';
    host.innerHTML = svg +
      '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Coverage score</div><div class="lab-stat-val">' + Math.round(data.summary.coverage_score * 100) + '%</div></div>' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Empty cells</div><div class="lab-stat-val">' + data.summary.empty_cells + ' / ' + data.summary.total_cells + '</div></div>' +
      '</div>';
    document.getElementById("cov-explainer").innerHTML = renderChartExplainer({
      what: "A 12\u00d712 grid overlay on the 2D embedding projection. Each cell is colored by how many audiences occupy it.",
      how: "Projects 26 embedded vectors to 2D via JL random projection, bins them into a 12\u00d712 grid. Warm/orange cells = gaps (below-median density). Top-3 gaps are circled and labeled.",
      read: "Blue dense cells = catalog is saturated here. Orange gaps = \u201cmarketplace opportunities\u201d \u2014 concept regions we could expand into via new signals or partners.",
      limits: "Operates on 26 embedded reference signals, not the full 520-signal catalog. Gaps are approximate.",
    });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    host.dataset.loaded = "";
  }
}

// ─── Portfolio ───────────────────────────────────────────────────────────
var _portLoaded = false;
async function ensurePortfolio() {
  if (_portLoaded) return;
  _portLoaded = true;
  wirePortSubtabs();
  wirePortOptimizer();
  wirePortFromBrief();
  renderPortPareto();
  renderPortLorenz();
}
`;
