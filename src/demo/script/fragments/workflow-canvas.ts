// src/demo/script/fragments/workflow-canvas.ts
//
// Workflow Canvas: state, mount shell, timeline cells, stage shells, event paint, error/finalize/agent-complete.
//
// Source range (in pre-refactor src/demo/script.ts): lines 7890..8508 (619 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const workflowCanvasJs = `function _wfNewState() {
  return {
    workflow_id: null,
    brief: "",
    plan: { signals_agents: [], creative_agents: [], buying_agents: [], activate_agents: [] },
    stages: {
      signals:   { status: "pending", agents: {}, chosen: [], total_count: 0 },
      // Sec-48q: creative stage tracks chosen_format_ids (defaulted to
      // top one per vendor when the stage completes; user can click
      // pills to toggle). Same pattern as signals.chosen.
      creative:  { status: "pending", agents: {}, chosen: [], total_count: 0 },
      products:  { status: "pending", agents: {}, chosen_per_agent: {}, total_count: 0 },
      media_buy: { status: "pending", agents: {}, activated: [] },
    },
    start_ms: Date.now(),
    complete: false,
    mode: null,
    error: null,
  };
}

async function runWorkflow() {
  if (_wfRunning) return;
  var host = document.getElementById("wf-results");
  var briefEl = document.getElementById("wf-brief");
  var brief = (briefEl.value || "").trim();
  if (!brief) { showToast("Workflow brief required.", true); return; }
  var activateIds = Array.prototype.slice
    .call(document.querySelectorAll(".wf-activate-cb"))
    .filter(function (cb) { return cb.checked; })
    .map(function (cb) { return cb.value; });

  _wfRunning = true;
  _wfState = _wfNewState();
  _wfState.brief = brief;
  _wfMountShell(host);

  try {
    var r = await fetch("/agents/workflow/run/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: brief, activate_agents: activateIds, timeout_ms: 25000 }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    if (!r.body) throw new Error("stream not available");
    var reader = r.body.getReader();
    var dec = new TextDecoder();
    var buf = "";
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      var nl;
      // See Sec-48c / Sec-48h. This SCRIPT_TAG body is a template
      // literal, so string-literal escapes must be doubled at source.
      // Split NDJSON frames on the newline escape.
      while ((nl = buf.indexOf("\\n")) >= 0) {
        var line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          var ev = JSON.parse(line);
          _wfApplyEvent(ev);
        } catch (e) { /* ignore malformed frame */ }
      }
    }
  } catch (e) {
    _wfState.error = e.message || String(e);
    _wfPaintError();
  } finally {
    _wfRunning = false;
    _wfFinalize();
  }
}

function _wfMountShell(host) {
  // Paint the chrome immediately so the user sees the workflow begin
  // before any server event arrives. Stages start in pending state,
  // flip to active on stage_start, then done on stage_complete.
  host.innerHTML =
    '<div class="wf-header" id="wf-header">' +
      '<div class="wf-header-left">' +
        '<div class="wf-header-id mono" id="wf-header-id">starting\u2026</div>' +
        '<div class="wf-header-brief" id="wf-header-brief">' + escapeHtml(_wfState.brief) + '</div>' +
      '</div>' +
      '<div class="wf-header-right" id="wf-header-right">' +
        '<span class="pill pill-muted mono" id="wf-header-mode" style="font-size:10px">running</span>' +
        '<span class="orch-small mono" id="wf-header-timer" style="margin-left:8px">0 ms</span>' +
      '</div>' +
    '</div>' +
    '<div class="wf-timeline" id="wf-timeline">' + _wfPaintTimelineCells("pending","pending","pending","pending") + '</div>' +
    _wfPaintStageShell("signals",   "1", "Signals") +
    _wfPaintStageShell("creative",  "2", "Creative") +
    _wfPaintStageShell("products",  "3", "Products") +
    _wfPaintStageShell("media_buy", "4", "Media buy");
  // live timer — cleared in _wfFinalize
  if (_wfTimerHandle) clearInterval(_wfTimerHandle);
  _wfTimerHandle = setInterval(function () {
    var el = document.getElementById("wf-header-timer");
    if (!el || !_wfState) return;
    el.textContent = (Date.now() - _wfState.start_ms) + " ms";
  }, 80);
}

var _wfTimerHandle = null;

function _wfPaintTimelineCells(s1, s2, s3, s4) {
  var items = [
    { k: "signals",   label: "Signals",   state: s1 },
    { k: "creative",  label: "Creative",  state: s2 },
    { k: "products",  label: "Products",  state: s3 },
    { k: "media_buy", label: "Media buy", state: s4 },
  ];
  return items.map(function (it, i) {
    var arrow = i < items.length - 1 ? '<span class="wf-timeline-arrow wf-arrow-' + it.state + '">\u2192</span>' : '';
    return '<div class="wf-timeline-cell wf-cell-' + it.state + '" id="wf-timeline-cell-' + it.k + '">' +
      '<div class="wf-timeline-label">' + escapeHtml(it.label) + '</div>' +
      '<div class="wf-timeline-count mono" id="wf-timeline-count-' + it.k + '">\u2014</div>' +
    '</div>' + arrow;
  }).join("");
}

function _wfPaintStageShell(key, num, title) {
  return '<div class="wf-stage wf-stage-' + key + '" id="wf-stage-' + key + '">' +
    '<div class="wf-stage-head">' +
      '<span class="wf-stage-num mono">' + num + '</span>' +
      '<span class="wf-stage-title">' + escapeHtml(title) + '</span>' +
      '<span class="orch-small mono" id="wf-stage-summary-' + key + '"></span>' +
    '</div>' +
    '<div class="wf-stage-agents" id="wf-stage-agents-' + key + '">' +
      '<div class="wf-stage-pending orch-small">waiting\u2026</div>' +
    '</div>' +
    (key === "signals" ? '<div id="wf-chosen-signals"></div>' : "") +
    (key === "creative" ? '<div id="wf-chosen-formats"></div>' : "") +
  '</div>';
}

function _wfUpdateTimelineCell(stageKey, state, countText) {
  var cell = document.getElementById("wf-timeline-cell-" + stageKey);
  if (cell) cell.className = "wf-timeline-cell wf-cell-" + state;
  if (countText) {
    var cnt = document.getElementById("wf-timeline-count-" + stageKey);
    if (cnt) cnt.textContent = countText;
  }
  // Also update the arrow leading INTO this cell when it goes active.
  var arrows = document.querySelectorAll("#wf-timeline .wf-timeline-arrow");
  arrows.forEach(function (a) {
    // Walk the full timeline and class each arrow by the state of the cell before it.
  });
}

function _wfAgentCardShell(stageKey, agent) {
  return '<div class="wf-agent-card wf-agent-pending" id="wf-agent-' + stageKey + '-' + agent.id + '">' +
    '<div class="wf-agent-head">' +
      '<span class="wf-agent-spinner"></span>' +
      '<span class="wf-agent-name mono">' + escapeHtml(agent.id) + '</span>' +
      '<span class="wf-agent-vendor">' + escapeHtml(agent.vendor || '') + '</span>' +
      '<span class="pill pill-muted mono" style="font-size:10px">calling\u2026</span>' +
    '</div>' +
    '<div class="wf-agent-live-timer orch-small mono">\u2014</div>' +
  '</div>';
}

function _wfApplyEvent(ev) {
  if (!_wfState) return;
  if (ev.type === "workflow_start") {
    _wfState.workflow_id = ev.workflow_id;
    _wfState.plan = ev.plan || _wfState.plan;
    var idEl = document.getElementById("wf-header-id");
    if (idEl) idEl.textContent = ev.workflow_id;
    // Pre-populate per-stage agent card shells so the timeline feels alive.
    ["signals_agents","creative_agents","buying_agents"].forEach(function (roleKey, i) {
      var key = i === 0 ? "signals" : i === 1 ? "creative" : "products";
      var host = document.getElementById("wf-stage-agents-" + key);
      if (!host) return;
      var agents = ev.plan[roleKey] || [];
      host.innerHTML = agents.length === 0
        ? '<div class="wf-stage-pending orch-small">no agents</div>'
        : agents.map(function (a) { return _wfAgentCardShell(key, a); }).join("");
    });
    // Stage 4 shares buying_agents
    var mbHost = document.getElementById("wf-stage-agents-media_buy");
    if (mbHost) {
      var buyers = ev.plan.buying_agents || [];
      mbHost.innerHTML = buyers.length === 0
        ? '<div class="wf-stage-pending orch-small">no agents</div>'
        : buyers.map(function (a) { return _wfAgentCardShell("media_buy", a); }).join("");
    }
    return;
  }
  if (ev.type === "stage_start") {
    _wfState.stages[ev.stage].status = "active";
    _wfUpdateTimelineCell(ev.stage, "active");
    return;
  }
  if (ev.type === "agent_start") {
    // Make sure the per-agent spinner is visible and ticking. If card
    // exists, it already has the spinner from workflow_start.
    return;
  }
  if (ev.type === "agent_complete") {
    _wfState.stages[ev.stage].agents[ev.agent_id] = ev;
    _wfPaintAgentComplete(ev);
    return;
  }
  if (ev.type === "stage_complete") {
    _wfState.stages[ev.stage].status = "done";
    _wfState.stages[ev.stage].total_count = (ev.summary && ev.summary.total) || 0;
    _wfUpdateTimelineCell(ev.stage, "done", String(ev.summary && ev.summary.total || 0));
    var sumEl = document.getElementById("wf-stage-summary-" + ev.stage);
    if (sumEl && ev.summary && typeof ev.summary.total === "number") {
      sumEl.textContent = ev.summary.total + " total";
    }
    return;
  }
  if (ev.type === "targeting_chosen") {
    _wfState.stages.signals.chosen = ev.chosen_signal_ids || [];
    _wfRenderChosenSignals();
    _wfMarkChosenSignalRows();
    return;
  }
  if (ev.type === "formats_chosen") {
    _wfState.stages.creative.chosen = ev.chosen_format_ids || [];
    _wfRenderChosenFormats();
    _wfMarkChosenFormatPills();
    return;
  }
  if (ev.type === "products_chosen") {
    _wfState.stages.products.chosen_per_agent = ev.chosen_product_per_agent || {};
    Object.keys(ev.chosen_product_per_agent || {}).forEach(function (agentId) {
      var pid = ev.chosen_product_per_agent[agentId];
      if (!pid) return;
      var card = document.getElementById("wf-agent-products-" + agentId);
      if (!card) return;
      var row = card.querySelector('.wf-product-row[data-product-id="' + pid + '"]');
      if (row) {
        row.classList.add("wf-product-chosen", "wf-chosen-pulse");
        // Remove pulse class after animation so a later re-selection
        // still animates. 900ms matches the CSS animation duration.
        setTimeout(function () { row.classList.remove("wf-chosen-pulse"); }, 900);
      }
    });
    return;
  }
  if (ev.type === "trace") {
    // Streaming trace event — emit by handleWorkflowRunStream just
    // before workflow_complete. Routes into the universal trace panel.
    _captureTrace(ev.trace);
    return;
  }
  if (ev.type === "workflow_complete") {
    _wfState.complete = true;
    _wfState.mode = ev.mode;
    var mEl = document.getElementById("wf-header-mode");
    if (mEl) {
      mEl.className = "pill mono " + (ev.mode === "dry_run" ? "pill-muted" : "pill-accent");
      mEl.style.fontSize = "10px";
      mEl.textContent = ev.mode;
    }
    var tEl = document.getElementById("wf-header-timer");
    if (tEl) tEl.textContent = (ev.total_time_ms || 0) + " ms";
    return;
  }
  if (ev.type === "workflow_error") {
    _wfState.error = ev.error;
    _wfPaintError();
    return;
  }
}

function _wfPaintError() {
  var host = document.getElementById("wf-header");
  if (!host || !_wfState) return;
  var e = document.createElement("div");
  e.className = "wf-agent-error mono";
  e.style.marginTop = "6px";
  e.textContent = _wfState.error || "workflow failed";
  host.appendChild(e);
}

function _wfFinalize() {
  if (_wfTimerHandle) { clearInterval(_wfTimerHandle); _wfTimerHandle = null; }
}

function _wfPaintAgentComplete(ev) {
  var card = document.getElementById("wf-agent-" + ev.stage + "-" + ev.agent_id);
  if (!card) return;
  card.classList.remove("wf-agent-pending");
  card.classList.add(ev.ok ? "wf-agent-ok" : "wf-agent-err");
  var body = "";
  if (ev.stage === "signals") {
    var preview = (ev.summary && ev.summary.preview) || [];
    // Sec-48q: each signal row is pickable — click toggles membership in
    // _wfState.stages.signals.chosen; the active chips render below the
    // stage and the stage-4 payloads live-rewrite.
    var chosenSignalsSet = new Set(_wfState.stages.signals.chosen || []);
    body = '<div class="wf-stage-count mono">' + (ev.summary && ev.summary.count || 0) + ' signals</div>' +
      preview.map(function (s) {
        var cov = typeof s.coverage_percentage === "number" ? (Math.round(s.coverage_percentage * 100) + "%") : "";
        var reach = typeof s.estimated_audience_size === "number" ? ((s.estimated_audience_size / 1e6).toFixed(1) + "M") : "";
        var isChosen = s.id && chosenSignalsSet.has(s.id);
        var cls = "wf-signal-row" + (s.id ? " wf-signal-pickable" : "") + (isChosen ? " wf-signal-chosen" : "");
        return '<div class="' + cls + '" ' +
                 'data-signal-id="' + escapeHtml(s.id || '') + '" ' +
                 (s.id ? ('data-wf-pick-signal="' + escapeHtml(s.id) + '" ') : '') +
                 'title="' + (s.id ? 'click to toggle as targeting signal' : 'no id, unpickable') + '">' +
          '<span class="mono wf-signal-id">' + escapeHtml(s.id || '-') + '</span>' +
          '<span class="wf-signal-name">' + escapeHtml(s.name) + '</span>' +
          (cov ? '<span class="pill pill-muted mono" style="font-size:9.5px">cov ' + cov + '</span>' : '') +
          (reach ? '<span class="pill pill-muted mono" style="font-size:9.5px">' + reach + '</span>' : '') +
        '</div>';
      }).join("");
  } else if (ev.stage === "creative") {
    var previewC = (ev.summary && ev.summary.preview) || [];
    var chosenFormatsSet = new Set(_wfState.stages.creative.chosen || []);
    // Normalize preview: either array of {id, name} objects (new shape) or
    // array of strings (old shape, for safety). Only objects w/ id are pickable.
    var normalized = previewC.map(function (p) {
      if (p && typeof p === "object") return { id: p.id || "", name: p.name || p.id || "(format)" };
      return { id: "", name: String(p) };
    });
    body = '<div class="wf-stage-count mono">' + (ev.summary && ev.summary.count || 0) + ' formats</div>' +
      '<div class="wf-formats-list">' +
        normalized.map(function (p) {
          var isChosen = p.id && chosenFormatsSet.has(p.id);
          var cls = "pill pill-muted mono" + (p.id ? " wf-format-pickable" : "") + (isChosen ? " wf-format-chosen" : "");
          return '<span class="' + cls + '" ' +
                   'style="font-size:10px" ' +
                   (p.id ? ('data-wf-pick-format="' + escapeHtml(p.id) + '" ') : '') +
                   (p.id ? 'title="click to toggle as creative for media buy"' : '') +
                   '>' + escapeHtml(String(p.name).slice(0, 40)) + '</span>';
        }).join(" ") +
      '</div>';
  } else if (ev.stage === "products") {
    var previewP = (ev.summary && ev.summary.preview) || [];
    body = '<div class="wf-stage-count mono">' + (ev.summary && ev.summary.count || 0) + ' products</div>' +
      (previewP.length > 1 ? '<div class="orch-small" style="margin-bottom:2px">click a row to pick</div>' : '') +
      previewP.map(function (p) {
        // Sec-48n: clickable product rows. data-wf-pick-agent + product
        // attrs let the delegated handler on #wf-results identify the
        // target without re-querying the card hierarchy.
        return '<div class="wf-product-row wf-product-pickable" ' +
                 'data-wf-pick-agent="' + escapeHtml(ev.agent_id) + '" ' +
                 'data-wf-pick-product="' + escapeHtml(p.id || '') + '" ' +
                 'data-product-id="' + escapeHtml(p.id || '') + '">' +
          '<span class="mono wf-product-id">' + escapeHtml(p.id || '-') + '</span>' +
          '<span class="wf-product-name">' + escapeHtml(p.name) + '</span>' +
        '</div>';
      }).join("");
  } else if (ev.stage === "media_buy") {
    var sum = ev.summary || {};
    var payload = sum.payload_preview || {};
    // Preserve the server-emitted payload on state so re-picks can mutate it
    // locally without re-calling /run/stream.
    if (!_wfState.stages.media_buy.payload_by_agent) _wfState.stages.media_buy.payload_by_agent = {};
    _wfState.stages.media_buy.payload_by_agent[ev.agent_id] = payload;
    var payloadJson = "";
    try { payloadJson = JSON.stringify(payload, null, 2); } catch (e) { payloadJson = String(e); }
    var fireBadge = sum.fired
      ? (ev.ok ? '<span class="pill pill-success mono" style="font-size:10px">fired \u2713</span>'
               : '<span class="pill pill-error mono" style="font-size:10px">fired \u2717</span>')
      : '<span class="pill pill-muted mono" style="font-size:10px">dry run</span>';
    // Sec-48n: fire button appears only on dry-run cards. Clicking it
    // posts to /agents/workflow/fire-buy with the current pick.
    // Sec-48p: honest copy. We do actually call the vendor with our
    // synthesized payload; the payload satisfies the required-field
    // union but not each vendor's business-logic validation (real
    // brand IDs, authorized properties, PO numbers, inventory
    // windows, ...). Rename from "Fire this buy (live)" to signal that.
    var fireBtn = !sum.fired
      ? '<button class="btn-primary wf-refire-btn" ' +
               'data-wf-refire-agent="' + escapeHtml(ev.agent_id) + '" ' +
               'title="Calls create_media_buy on the agent with our synthesized payload. Vendors typically reject on validation; response body is surfaced below." ' +
               'style="margin-top:8px;width:100%;justify-content:center;padding:6px 10px;font-size:11px">' +
          '<svg class="ico"><use href="#icon-bolt"/></svg>' +
          '<span>Simulate live fire</span>' +
        '</button>'
      : '';
    // Sec-48p: always surface vendor response when fired, not just on
    // success. Failed calls are the interesting case — the vendor's
    // error message tells us what they reject and why. Auto-open on
    // err so the user sees the reason without clicking.
    var responseBlock = "";
    if (sum.fired) {
      var hasResult = sum.result !== undefined && sum.result !== null;
      var hasContent = Array.isArray(sum.content) && sum.content.length > 0;
      var autoOpen = !ev.ok ? ' open' : '';
      if (hasResult) {
        responseBlock +=
          '<details class="wf-result-details"' + autoOpen + '>' +
            '<summary class="orch-small">' + (ev.ok ? 'vendor response' : 'vendor rejection \u2014 result') + '</summary>' +
            '<pre class="wf-json mono">' + escapeHtml(JSON.stringify(sum.result, null, 2)) + '</pre>' +
          '</details>';
      }
      if (hasContent) {
        // MCP content blocks — prefer the first text block's content,
        // fall back to the whole array serialized.
        var textBlock = null;
        for (var ci = 0; ci < sum.content.length; ci++) {
          var blk = sum.content[ci];
          if (blk && typeof blk === "object" && blk.type === "text" && typeof blk.text === "string") {
            textBlock = blk.text; break;
          }
        }
        var display = textBlock !== null ? textBlock : JSON.stringify(sum.content, null, 2);
        responseBlock +=
          '<details class="wf-result-details"' + autoOpen + '>' +
            '<summary class="orch-small">' + (ev.ok ? 'vendor content' : 'vendor rejection \u2014 content') + '</summary>' +
            '<pre class="wf-json mono">' + escapeHtml(display) + '</pre>' +
          '</details>';
      }
      if (!hasResult && !hasContent && !ev.ok && !ev.error) {
        responseBlock +=
          '<div class="orch-small" style="margin-top:6px;color:var(--text-mut);font-style:italic">' +
            'vendor returned no body or error message (isError:true, empty content)' +
          '</div>';
      }
      // Sec-48r5: detect auth-gated rejections and surface a callout. The
      // demo's story: payload shape passed; auth is the ceiling. We scan
      // the serialized content for known auth-rejection idioms seen in
      // the Sec-48r4 live probe across all three default-trio vendors.
      var allText = "";
      if (hasContent) {
        for (var ti = 0; ti < sum.content.length; ti++) {
          var tb = sum.content[ti];
          if (tb && typeof tb === "object" && typeof tb.text === "string") allText += tb.text + " ";
        }
      }
      if (hasResult) {
        try { allText += JSON.stringify(sum.result); } catch (e2) { /* noop */ }
      }
      // Word-boundary in regex needs double-escape per SCRIPT_TAG rule
      // (single-backslash-b would collapse to backspace char in the
      // served JS). Using \\b so the emitted regex has \b.
      var authPatterns = /principal id not found|authentication required|auth_token_invalid|unauthorized|\\b401\\b|tenant policy/i;
      if (authPatterns.test(allText)) {
        responseBlock +=
          '<div class="wf-auth-callout">' +
            '<span class="wf-auth-icon">\u26a0</span>' +
            '<div>' +
              '<div class="wf-auth-title">Auth-gated vendor</div>' +
              '<div class="wf-auth-body">' +
                'Payload shape passed vendor validation. The wall is auth \u2014 ' +
                'this vendor requires credentials we do not have in this public demo. ' +
                'Not a protocol bug, a protocol <em>gap</em>: AdCP has no shared ' +
                'auth-posture contract across signals / creative / buying agents.' +
              '</div>' +
            '</div>' +
          '</div>';
      }
    }
    body = '<div class="wf-stage-count mono" style="display:flex;justify-content:space-between;align-items:center">' + fireBadge + '</div>' +
      '<details class="wf-payload-details"' + (sum.fired ? '' : ' open') + '>' +
        '<summary class="orch-small">create_media_buy payload</summary>' +
        '<pre class="wf-json mono" id="wf-payload-pre-' + escapeHtml(ev.agent_id) + '">' + escapeHtml(payloadJson) + '</pre>' +
      '</details>' +
      responseBlock +
      fireBtn;
  }
  var headHTML = '<div class="wf-agent-head">' +
    '<span class="wf-agent-name mono">' + escapeHtml(ev.agent_id) + '</span>' +
    (ev.ok ? '<span class="pill pill-success mono" style="font-size:10px">ok</span>'
           : '<span class="pill pill-error mono" style="font-size:10px">err</span>') +
    '<span class="orch-small mono" style="margin-left:6px">' + (ev.latency_ms || 0) + ' ms</span>' +
  '</div>';
  var errHTML = ev.error ? '<div class="wf-agent-error mono">' + escapeHtml(String(ev.error).slice(0, 200)) + '</div>' : "";
  card.innerHTML = headHTML + errHTML + '<div class="wf-stage-body wf-body-anim">' + body + '</div>';
}

// (Sec-48g removed the one-shot _wfRender* helpers — workflow UI is now
// entirely event-driven via the NDJSON stream in runWorkflow + _wfApplyEvent.)

// ─── Canvas v2 Phase 1: brand-anchored canvas ───────────────────────────
// Brand picker → /brands/search + /brands/resolve. Renders the live
// brand.json as a card. Three empty lanes are placeholder for Phase 2
// (signals + products + creative fan-outs). Phase 3 fills governance;
// Phase 4 fills measurement. Sec-48 Orchestrator stays as the raw
// transport reference; this is the higher-level operator view.

var _canvasLoaded = false;
var _canvasState = { brand: null, searching: false };

async function ensureCanvas() {
  if (_canvasLoaded) return;
  _canvasLoaded = true;
  var btn = document.getElementById("canvas-search-btn");
  var input = document.getElementById("canvas-search");
  if (btn) btn.addEventListener("click", _canvasRunSearch);
  if (input) input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") _canvasRunSearch();
  });
  // Quick-pick chips fire resolve directly.
  document.querySelectorAll(".canvas-quickpick").forEach(function (b) {
    var d = b.getAttribute("data-domain");
    if (!d) return; // Skip brief-target chips; they're wired globally below.
    b.addEventListener("click", function () { _canvasResolveBrand(d); });
  });
  // Wave 1: Demo mode — single-click canonical run for stage demos.
  var demoBtn = document.getElementById("canvas-demo-btn");
  if (demoBtn) demoBtn.addEventListener("click", _canvasRunCanonicalDemo);
}

// Wave 1: Canonical demo run. Resolves Coca-Cola, then auto-clicks
// "Run workflow" once the brand card finishes hydrating. Single-click
// stage-day insurance — removes typing risk during the live demo.
async function _canvasRunCanonicalDemo() {
  var btn = document.getElementById("canvas-demo-btn");
  if (btn) { btn.disabled = true; btn.querySelector("span").textContent = "running…"; }
  try {
    await _canvasResolveBrand("coca-cola.com");
    // Wait for the brand card to render the run button (single tick).
    await new Promise(function (r) { setTimeout(r, 250); });
    var run = document.getElementById("canvas-run-btn");
    if (run) run.click();
    if (btn) { btn.querySelector("span").textContent = "Re-run canonical demo"; btn.disabled = false; }
  } catch (e) {
    if (btn) { btn.querySelector("span").textContent = "Retry"; btn.disabled = false; }
    showToast("demo run failed: " + ((e && e.message) || e), true);
  }
}

async function _canvasRunSearch() {
  if (_canvasState.searching) return;
  var input = document.getElementById("canvas-search");
  var host = document.getElementById("canvas-search-results");
  if (!input || !host) return;
  var q = (input.value || "").trim();
  if (!q) {
    host.innerHTML = '';
    return;
  }
  _canvasState.searching = true;
  host.innerHTML = '<div class="orch-small canvas-loading"><span class="spinner"></span> searching registry…</div>';
  try {
    var r = await fetch("/brands/search?q=" + encodeURIComponent(q));
    var data = await r.json();
    if (!r.ok) {
      host.innerHTML = '<div class="orch-small" style="color:var(--error)">' + escapeHtml(data.message || data.error || ("HTTP " + r.status)) + '</div>';
      return;
    }
    var brands = data.brands || [];
    if (brands.length === 0) {
      host.innerHTML = '<div class="orch-small" style="color:var(--text-mut)">no matches</div>';
      return;
    }
    var rows = brands.slice(0, 10).map(function (b) {
      var typeBadge = b.keller_type
        ? '<span class="pill pill-muted mono" style="font-size:10px">' + escapeHtml(b.keller_type) + '</span>'
        : '';
      var house = b.house_domain
        ? '<span class="orch-small" style="color:var(--text-mut)">house: ' + escapeHtml(b.house_domain) + '</span>'
        : '';
      // Phase 2 polish: surface verified/manifest/employees/primary-color/sub-brand-count.
      var verified = b.verified
        ? '<span class="pill pill-success mono" style="font-size:9.5px">verified</span>'
        : '';
      var manifest = b.has_manifest
        ? '<span class="pill pill-info mono" style="font-size:9.5px">brand.json</span>'
        : '';
      var subCount = (typeof b.sub_brand_count === "number" && b.sub_brand_count > 0)
        ? '<span class="orch-small" style="color:var(--text-mut)">+' + b.sub_brand_count + ' sub-brands</span>'
        : '';
      var emp = (typeof b.employee_count === "number" && b.employee_count > 0)
        ? '<span class="orch-small" style="color:var(--text-mut)">' + b.employee_count + ' emp</span>'
        : '';
      var primarySwatch = b.primary_color
        ? '<span class="canvas-row-swatch" style="background:' + escapeHtml(b.primary_color) + '" title="primary: ' + escapeHtml(b.primary_color) + '"></span>'
        : '';
      var industries = Array.isArray(b.industries) && b.industries.length > 0
        ? '<span class="orch-small" style="color:var(--text-mut)">' + escapeHtml(b.industries.slice(0, 2).join(" / ")) + '</span>'
        : '';
      return '<div class="canvas-search-row" data-domain="' + escapeHtml(b.domain) + '">' +
        '<div class="canvas-search-name">' + primarySwatch + escapeHtml(b.brand_name) + '  ' + verified + manifest + '</div>' +
        '<div class="canvas-search-meta mono">' + escapeHtml(b.domain) + '  ' + typeBadge + '  ' + house + '  ' + emp + '  ' + subCount + '  ' + industries + '</div>' +
      '</div>';
    }).join("");
    var cacheTag = data.cache === "hit"
      ? '<span class="orch-small" style="color:var(--text-mut)">cache hit</span>'
      : '<span class="orch-small" style="color:var(--text-mut)">' + (data.count || 0) + ' results</span>';
    host.innerHTML = '<div class="canvas-search-list">' + rows + '</div><div style="margin-top:6px">' + cacheTag + '</div>';
    host.querySelectorAll(".canvas-search-row").forEach(function (row) {
      row.addEventListener("click", function () {
        var d = row.getAttribute("data-domain");
        if (d) _canvasResolveBrand(d);
      });
    });
  } catch (e) {
    host.innerHTML = '<div class="orch-small" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div>';
  } finally {
    _canvasState.searching = false;
  }
}

async function _canvasResolveBrand(domain) {
  var card = document.getElementById("canvas-brand-card");
  if (!card) return;
  card.innerHTML = '<div class="canvas-brand-loading"><span class="spinner"></span> resolving ' + escapeHtml(domain) + ' from registry…</div>';
  try {
    var r = await fetch("/brands/resolve?domain=" + encodeURIComponent(domain));
    var data = await r.json();
    if (!r.ok) {
      card.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(data.message || data.error || ("HTTP " + r.status)) + '</div></div>';
      return;
    }
    _canvasState.brand = data;
    _canvasRenderBrandCard(data);
    var lanes = document.getElementById("canvas-lanes");
    if (lanes) lanes.style.display = "";
    var bottom = document.getElementById("canvas-bottom");
    if (bottom) bottom.style.display = "";
    var loopArrow = document.getElementById("canvas-loop-arrow");
    if (loopArrow) loopArrow.style.display = "";
    // Phase B: hydrate registry-status bar (lazy, only on first canvas open).
    _canvasFillRegistryBar();
  } catch (e) {
    card.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
  }
}

`;
