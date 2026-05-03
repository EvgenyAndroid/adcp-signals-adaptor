// src/demo/script/fragments/workflow-handlers.ts
//
// Workflow event handlers: signal/format toggles, chosen renderers, payload rewrites, product picker.
//
// Source range (in pre-refactor src/demo/script.ts): lines 7309..7585 (277 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const workflowHandlersJs = `function _wfOnClick(ev) {
  var target = ev.target;
  if (!target) return;
  // Walk up to find an actionable wrapper.
  var pickRow = target.closest ? target.closest(".wf-product-pickable") : null;
  if (pickRow) {
    var agentId = pickRow.getAttribute("data-wf-pick-agent");
    var productId = pickRow.getAttribute("data-wf-pick-product");
    if (agentId && productId) _wfPickProduct(agentId, productId);
    return;
  }
  // Sec-48q: signal + format toggles.
  var sigRow = target.closest ? target.closest(".wf-signal-pickable") : null;
  if (sigRow) {
    var sid = sigRow.getAttribute("data-wf-pick-signal");
    if (sid) _wfToggleSignal(sid);
    return;
  }
  var fmtPill = target.closest ? target.closest(".wf-format-pickable") : null;
  if (fmtPill) {
    var fid = fmtPill.getAttribute("data-wf-pick-format");
    if (fid) _wfToggleFormat(fid);
    return;
  }
  var fireBtn = target.closest ? target.closest(".wf-refire-btn") : null;
  if (fireBtn) {
    var fa = fireBtn.getAttribute("data-wf-refire-agent");
    if (fa) _wfFireBuy(fa, fireBtn);
    return;
  }
}

// ── Signal + format pick helpers (Sec-48q) ──────────────────────────────
// Both follow the same pattern as _wfPickProduct: mutate state, repaint
// the chosen markers, rewrite every stage-4 payload in place.

function _wfToggleSignal(sid) {
  if (!_wfState) return;
  var chosen = _wfState.stages.signals.chosen || [];
  var idx = chosen.indexOf(sid);
  if (idx >= 0) chosen.splice(idx, 1);
  else chosen.push(sid);
  _wfState.stages.signals.chosen = chosen;
  _wfRenderChosenSignals();
  _wfMarkChosenSignalRows();
  _wfRewriteAllPayloads();
}

function _wfToggleFormat(fid) {
  if (!_wfState) return;
  var chosen = _wfState.stages.creative.chosen || [];
  var idx = chosen.indexOf(fid);
  if (idx >= 0) chosen.splice(idx, 1);
  else chosen.push(fid);
  _wfState.stages.creative.chosen = chosen;
  _wfRenderChosenFormats();
  _wfMarkChosenFormatPills();
  _wfRewriteAllPayloads();
}

function _wfRenderChosenSignals() {
  var host = document.getElementById("wf-chosen-signals");
  if (!host) return;
  var chosen = _wfState.stages.signals.chosen || [];
  if (chosen.length === 0) {
    host.innerHTML = '<div class="wf-chosen wf-chosen-empty"><span class="wf-chosen-label">No signals chosen \u2014 click a row above to add.</span></div>';
    return;
  }
  var html = chosen.map(function (s) {
    return '<code class="mono wf-chosen-chip" data-signal-id="' + escapeHtml(s) + '">' + escapeHtml(s) + '</code>';
  }).join(" ");
  host.innerHTML = '<div class="wf-chosen wf-chosen-anim">' +
    '<span class="wf-chosen-label">Targeting \u2192</span>' + html +
  '</div>';
}

function _wfRenderChosenFormats() {
  var host = document.getElementById("wf-chosen-formats");
  if (!host) return;
  var chosen = _wfState.stages.creative.chosen || [];
  if (chosen.length === 0) {
    host.innerHTML = '<div class="wf-chosen wf-chosen-empty"><span class="wf-chosen-label">No creative chosen \u2014 click a format pill above to add.</span></div>';
    return;
  }
  var html = chosen.map(function (f) {
    return '<code class="mono wf-chosen-chip">' + escapeHtml(f) + '</code>';
  }).join(" ");
  host.innerHTML = '<div class="wf-chosen wf-chosen-anim">' +
    '<span class="wf-chosen-label">Creative \u2192</span>' + html +
  '</div>';
}

function _wfMarkChosenSignalRows() {
  var chosen = new Set(_wfState.stages.signals.chosen || []);
  document.querySelectorAll("#wf-stage-signals .wf-signal-row").forEach(function (row) {
    var sid = row.getAttribute("data-signal-id");
    if (sid && chosen.has(sid)) row.classList.add("wf-signal-chosen");
    else row.classList.remove("wf-signal-chosen");
  });
}

function _wfMarkChosenFormatPills() {
  var chosen = new Set(_wfState.stages.creative.chosen || []);
  document.querySelectorAll("#wf-stage-creative .wf-format-pickable").forEach(function (pill) {
    var fid = pill.getAttribute("data-wf-pick-format");
    if (fid && chosen.has(fid)) pill.classList.add("wf-format-chosen");
    else pill.classList.remove("wf-format-chosen");
  });
}

function _wfRewriteAllPayloads() {
  // On any upstream pick change, rebuild every stage-4 payload so the
  // JSON previews (and the per-agent "Fire this buy" payload) stay in
  // sync. Mutates the cached payload objects.
  if (!_wfState) return;
  var payloads = (_wfState.stages.media_buy.payload_by_agent) || {};
  var signals = _wfState.stages.signals.chosen || [];
  var formats = _wfState.stages.creative.chosen || [];
  Object.keys(payloads).forEach(function (agentId) {
    var p = payloads[agentId];
    if (!p) return;
    // targeting_overlay.required_axe_signals
    if (signals.length === 0) {
      delete p.targeting_overlay;
    } else {
      p.targeting_overlay = { required_axe_signals: signals.slice() };
    }
    // packages[0].creatives
    if (Array.isArray(p.packages) && p.packages.length > 0) {
      if (formats.length === 0) {
        delete p.packages[0].creatives;
      } else {
        p.packages[0].creatives = formats.map(function (fid) { return { format_id: fid }; });
      }
    }
    var pre = document.getElementById("wf-payload-pre-" + agentId);
    if (pre) {
      try {
        pre.textContent = JSON.stringify(p, null, 2);
        pre.classList.remove("wf-body-anim");
        void pre.offsetWidth;
        pre.classList.add("wf-body-anim");
      } catch (e) { /* noop */ }
    }
  });
}

function _wfPickProduct(agentId, productId) {
  if (!_wfState) return;
  var previous = (_wfState.stages.products.chosen_per_agent || {})[agentId];
  if (previous === productId) return; // no-op
  _wfState.stages.products.chosen_per_agent[agentId] = productId;

  // Swap the visual "chosen" marker across rows within the same agent card.
  var card = document.getElementById("wf-agent-products-" + agentId);
  if (card) {
    card.querySelectorAll(".wf-product-row").forEach(function (row) {
      row.classList.remove("wf-product-chosen");
      row.classList.remove("wf-chosen-pulse");
    });
    var newRow = card.querySelector('.wf-product-row[data-product-id="' + productId + '"]');
    if (newRow) {
      newRow.classList.add("wf-product-chosen", "wf-chosen-pulse");
      setTimeout(function () { newRow.classList.remove("wf-chosen-pulse"); }, 900);
    }
  }

  // Live-rewrite the stage-4 payload JSON for that agent. Mutate the cached
  // payload object, re-serialize, fade in the new text.
  var payload = (_wfState.stages.media_buy.payload_by_agent || {})[agentId];
  if (payload && Array.isArray(payload.packages) && payload.packages.length > 0) {
    payload.packages[0].product_id = productId;
    var pre = document.getElementById("wf-payload-pre-" + agentId);
    if (pre) {
      try {
        pre.textContent = JSON.stringify(payload, null, 2);
        pre.classList.remove("wf-body-anim");
        // Force reflow so the animation restarts cleanly on repeated picks.
        void pre.offsetWidth;
        pre.classList.add("wf-body-anim");
      } catch (e) { /* noop */ }
    }
  }
}

async function _wfFireBuy(agentId, btn) {
  if (!_wfState) return;
  if (btn.disabled) return;
  var origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:10px;height:10px;margin-right:6px"></span><span>Firing\u2026</span>';
  var chosenProduct = (_wfState.stages.products.chosen_per_agent || {})[agentId] || null;
  var signalIds = _wfState.stages.signals.chosen || [];
  var formatIds = _wfState.stages.creative.chosen || [];
  try {
    var r = await fetch("/agents/workflow/fire-buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        product_id: chosenProduct,
        signal_ids: signalIds,
        format_ids: formatIds,
        brief: _wfState.brief,
        workflow_id: _wfState.workflow_id,
        timeout_ms: 20000,
      }),
    });
    var data = await r.json();
    if (!r.ok) {
      btn.innerHTML = origHTML;
      btn.disabled = false;
      showToast((data && (data.error || data.message)) || ("HTTP " + r.status), true);
      return;
    }
    // Synthesize an agent_complete-like event so the existing renderer
    // re-paints the card as a fired result.
    _wfApplyEvent({
      type: "agent_complete",
      stage: "media_buy",
      agent_id: agentId,
      ok: !!data.ok,
      error: data.error,
      latency_ms: data.latency_ms || 0,
      summary: {
        dry_run: false,
        fired: true,
        payload_preview: data.payload_preview,
        result: data.result,
        content: data.content,
      },
    });
  } catch (e) {
    btn.innerHTML = origHTML;
    btn.disabled = false;
    showToast(String((e && e.message) || e), true);
  }
}

async function loadOrchDirectory() {
  var host = document.getElementById("orch-agents");
  try {
    var r = await fetch("/agents/directory");
    var data = await r.json();
    state.orchestrator.directory = data.agents || [];
    var countEl = document.getElementById("orch-agents-count");
    if (countEl) countEl.textContent = data.count;
    _orchRenderAgentGrid();
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

async function runOrchProbeAll() {
  if (state.orchestrator.probing) return;
  state.orchestrator.probing = true;
  var btn = document.getElementById("orch-refresh");
  var label = btn ? btn.querySelector("span") : null;
  var origText = label ? label.textContent : "";
  if (label) label.textContent = "Probing\u2026";
  if (btn) btn.disabled = true;
  try {
    var r = await fetch("/agents/probe-all?timeout_ms=10000");
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.orchestrator.probe = data;
    _orchRenderAgentGrid();
    _orchRenderSummary();
  } catch (e) {
    showToast("Probe failed: " + e.message, true);
  } finally {
    state.orchestrator.probing = false;
    if (label) label.textContent = origText;
    if (btn) btn.disabled = false;
  }
}

`;
