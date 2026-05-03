// src/demo/script/fragments/trace-inspector.ts
//
// Universal trace inspector: capture, render, panel, fetch interceptor.
//
// Source range (in pre-refactor src/demo/script.ts): lines 559..832 (274 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const traceInspectorJs = `function _isAutoDefaultTrace(t) {
  if (!t || !Array.isArray(t.steps)) return false;
  return t.steps.length === 1 && t.steps[0] && t.steps[0].id === "handler";
}
function _captureTrace(trace) {
  if (!trace || typeof trace !== "object") return false;
  if (!trace.operation && !trace.steps) return false;
  // Preserve rich existing trace from being clobbered by auto-default.
  if (window.__lastTrace && !_isAutoDefaultTrace(window.__lastTrace) && _isAutoDefaultTrace(trace)) {
    return false;
  }
  window.__lastTrace = trace;
  _showTraceTrigger();
  return true;
}

// Reset on tab switch so stale traces don't carry across pages.
function _resetTrace() {
  window.__lastTrace = null;
  var t = document.getElementById("trace-trigger");
  if (t) {
    t.classList.remove("is-visible");
    t.classList.remove("is-pulsing");
  }
  var p = document.getElementById("trace-panel");
  if (p && p.classList.contains("is-open")) _closeTracePanel();
}

function _showTraceTrigger() {
  var t = document.getElementById("trace-trigger");
  if (!t) return;
  t.classList.add("is-visible");
  // Pulse 3 times to telegraph "new info available."
  t.classList.remove("is-pulsing");
  void t.offsetWidth; // force restart
  t.classList.add("is-pulsing");
}

function _openTracePanel() {
  if (!window.__lastTrace) return;
  _renderTracePanel(window.__lastTrace);
  document.getElementById("trace-backdrop").classList.add("is-open");
  document.getElementById("trace-panel").classList.add("is-open");
  document.getElementById("trace-panel").setAttribute("aria-hidden", "false");
}
function _closeTracePanel() {
  document.getElementById("trace-backdrop").classList.remove("is-open");
  document.getElementById("trace-panel").classList.remove("is-open");
  document.getElementById("trace-panel").setAttribute("aria-hidden", "true");
}

function _fmtMs(ms) {
  if (typeof ms !== "number") return "—";
  if (ms < 1000) return ms + "ms";
  return (ms / 1000).toFixed(2) + "s";
}
function _fmtRelTs(iso) {
  try {
    var diff = Date.now() - new Date(iso).getTime();
    if (diff < 5000) return "just now";
    if (diff < 60000) return Math.floor(diff / 1000) + "s ago";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    return new Date(iso).toLocaleTimeString();
  } catch (e) { return iso; }
}

// Animate the duration counter from 0 to the final value over 600ms.
function _animateDuration(el, targetMs) {
  if (!el) return;
  var start = performance.now();
  var dur = 600;
  function tick(t) {
    var pct = Math.min(1, (t - start) / dur);
    var eased = 1 - Math.pow(1 - pct, 3); // ease-out cubic
    var v = Math.round(targetMs * eased);
    el.textContent = _fmtMs(v);
    if (pct < 1) requestAnimationFrame(tick);
    else el.textContent = _fmtMs(targetMs);
  }
  requestAnimationFrame(tick);
}

function _renderTraceStep(step, idx) {
  var details = (step.details || []).map(function(d) {
    return '<div class="trace-detail-k">' + escapeHtml(d.k) + '</div>' +
           '<div class="trace-detail-v">' + escapeHtml(d.v) + '</div>';
  }).join("");
  var detailsBlock = details ? '<div class="trace-detail-grid">' + details + '</div>' : "";

  var matchesBlock = "";
  if (Array.isArray(step.matches) && step.matches.length > 0) {
    var maxScore = step.matches.reduce(function(m, x) { return x.score > m ? x.score : m; }, 0);
    if (maxScore <= 0) maxScore = 1;
    var rows = step.matches.map(function(m, i) {
      var pct = Math.max(2, Math.min(100, (m.score / maxScore) * 100));
      var rank = '<div class="trace-match-rank">#' + (i + 1) + '</div>';
      var bar = '<div class="trace-match-bar-wrap">' +
                '  <div class="trace-match-bar" style="width:' + pct.toFixed(1) + '%"></div>' +
                '  <div class="trace-match-text">' + escapeHtml(m.label) + '</div>' +
                '</div>';
      var sc = '<div class="trace-match-score">' + (typeof m.score === "number" ? m.score.toFixed(2) : "—") + '</div>';
      var meta = m.meta ? '<div class="trace-match-meta">' + escapeHtml(m.meta) + '</div>' : "";
      return '<li class="trace-match-li">' +
             '  <div class="trace-match">' + rank + bar + sc + '</div>' +
             meta +
             '</li>';
    }).join("");
    matchesBlock = '<ol class="trace-match-list">' + rows + '</ol>';
  }

  var histoBlock = "";
  if (step.histogram && Array.isArray(step.histogram.bins)) {
    var h = step.histogram;
    var maxBin = h.max || h.bins.reduce(function(m, b) { return b > m ? b : m; }, 1) || 1;
    var bars = h.bins.map(function(b) {
      var hp = (b / maxBin) * 100;
      return '<div class="trace-histo-bar" style="height:' + Math.max(2, hp) + '%" title="count: ' + b + '"></div>';
    }).join("");
    var thresh = "";
    if (typeof h.threshold === "number") {
      var tp = (h.threshold / h.bins.length) * 100;
      thresh = '<div class="trace-histo-threshold" style="left:' + tp + '%"></div>';
    }
    histoBlock = '<div class="trace-histo">' +
                 '  <div class="trace-histo-label">distribution</div>' +
                 '  <div class="trace-histo-bars">' + bars + thresh + '</div>' +
                 '  <div class="trace-histo-axis"><span>' + escapeHtml(h.axis_range || "") + '</span></div>' +
                 '</div>';
  }

  var note = step.note ? '<div class="trace-step-note">' + escapeHtml(step.note) + '</div>' : "";
  var dur = (typeof step.duration_ms === "number") ? '<span class="trace-step-duration">' + _fmtMs(step.duration_ms) + '</span>' : "";

  // Stagger entry: each step gets an animation-delay so they cascade in.
  var delay = (idx * 0.08).toFixed(2) + "s";

  return '<div class="trace-step is-open" style="animation-delay:' + delay + '" data-trace-step="' + escapeHtml(step.id) + '">' +
         '  <button class="trace-step-head" type="button">' +
         '    <span class="trace-step-num">' + (idx + 1) + '</span>' +
         '    <span class="trace-step-label">' + escapeHtml(step.label) + '</span>' +
         '    ' + dur +
         '    <svg class="trace-step-chevron" viewBox="0 0 16 16"><path d="M4 6 L8 10 L12 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
         '  </button>' +
         '  <div class="trace-step-body">' +
              note + detailsBlock + matchesBlock + histoBlock +
         '  </div>' +
         '</div>';
}

function _renderTracePerf(perf) {
  if (!perf || typeof perf !== "object") return "";
  var keys = Object.keys(perf).filter(function(k) { return k !== "total"; });
  var total = perf.total || keys.reduce(function(s, k) { return s + (perf[k] || 0); }, 0);
  if (total <= 0) return "";
  var palette = ["var(--accent)", "var(--violet)", "var(--cyan)", "var(--success)", "var(--warning)"];
  var segments = keys.map(function(k, i) {
    var pct = (perf[k] / total) * 100;
    var color = palette[i % palette.length];
    return '<div class="trace-perf-segment" style="width:' + pct.toFixed(1) + '%; background:' + color + '" title="' + escapeHtml(k) + ': ' + _fmtMs(perf[k]) + '"></div>';
  }).join("");
  var legend = keys.map(function(k, i) {
    var color = palette[i % palette.length];
    return '<div class="trace-perf-legend-row">' +
           '  <span class="trace-perf-legend-swatch" style="background:' + color + '"></span>' +
           '  <span class="trace-perf-legend-k">' + escapeHtml(k) + '</span>' +
           '  <span class="trace-perf-legend-v">' + _fmtMs(perf[k]) + '</span>' +
           '</div>';
  }).join("");
  return '<div class="trace-perf-label">timing breakdown · total ' + _fmtMs(total) + '</div>' +
         '<div class="trace-perf-bar">' + segments + '</div>' +
         '<div class="trace-perf-legend">' + legend + '</div>';
}

function _renderTracePanel(trace) {
  document.getElementById("trace-eyebrow").textContent = "trace inspector";
  document.getElementById("trace-operation").textContent = trace.operation || "Trace";
  var inputEl = document.getElementById("trace-input");
  if (trace.input) {
    inputEl.textContent = '"' + trace.input + '"';
    inputEl.style.display = "inline-block";
  } else {
    inputEl.style.display = "none";
  }
  _animateDuration(document.getElementById("trace-duration"), trace.duration_ms || 0);
  document.getElementById("trace-step-count").textContent = (trace.steps || []).length;
  document.getElementById("trace-ts").textContent = trace.ts ? _fmtRelTs(trace.ts) : "—";
  document.getElementById("trace-perf").innerHTML = _renderTracePerf(trace.performance || null);
  // Sec-31u T1#5: timeline scrubber — proportional bar across the top
  // of the steps list. Each segment width = step.duration_ms / total.
  // Click any segment to scroll its expanded step into view + highlight.
  var stepsArr = trace.steps || [];
  var totalDur = stepsArr.reduce(function (a, s) { return a + (typeof s.duration_ms === "number" ? s.duration_ms : 0); }, 0) || 1;
  var scrubberHost = document.getElementById("trace-timeline-scrubber");
  if (scrubberHost) {
    if (stepsArr.length > 0) {
      var palette = ["#4f8eff", "#8b6eff", "#2bd4a0", "#ffcb5c", "#ff7a5c", "#ff4d8e"];
      var segs = stepsArr.map(function (s, i) {
        var w = ((typeof s.duration_ms === "number" ? s.duration_ms : 0) / totalDur) * 100;
        var color = palette[i % palette.length];
        return '<button type="button" class="trace-tl-seg" data-tl-step="' + escapeHtml(s.id) +
          '" style="width:' + w.toFixed(2) + '%;background:' + color + '"' +
          ' title="' + escapeHtml(s.label || s.id) + ' · ' + _fmtMs(s.duration_ms || 0) + '">' +
          '<span class="trace-tl-seg-label">' + escapeHtml(s.label || s.id) + '</span>' +
        '</button>';
      }).join("");
      scrubberHost.innerHTML = '<div class="trace-tl-track">' + segs + '</div>' +
        '<div class="trace-tl-axis"><span>0ms</span><span>total ' + _fmtMs(totalDur) + '</span></div>';
    } else {
      scrubberHost.innerHTML = '';
    }
  }
  document.getElementById("trace-steps").innerHTML = stepsArr.map(_renderTraceStep).join("");
  // Wire step-head clicks (accordion toggle)
  document.querySelectorAll(".trace-step-head").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var step = btn.closest(".trace-step");
      if (step) step.classList.toggle("is-open");
    });
  });
  // Wire timeline-segment clicks → scroll matching step into view + glow
  if (scrubberHost) {
    scrubberHost.querySelectorAll(".trace-tl-seg").forEach(function (seg) {
      seg.addEventListener("click", function () {
        var stepId = seg.getAttribute("data-tl-step");
        var stepEl = document.querySelector('.trace-step[data-trace-step="' + stepId + '"]');
        if (!stepEl) return;
        stepEl.classList.add("is-open");
        stepEl.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof glowOnce === "function") setTimeout(function () { glowOnce(stepEl); }, 300);
        // Highlight active segment
        scrubberHost.querySelectorAll(".trace-tl-seg").forEach(function (s) { s.classList.remove("is-active"); });
        seg.classList.add("is-active");
      });
    });
  }
  // Animate match-bar widths in after a small delay so the transition triggers.
  setTimeout(function() {
    document.querySelectorAll(".trace-match-bar").forEach(function(b) {
      var w = b.style.width; b.style.width = "0";
      requestAnimationFrame(function() { b.style.width = w; });
    });
  }, 50);
  // JSON tab content
  document.getElementById("trace-json").textContent = JSON.stringify(trace, null, 2);
  // Reset to overview tab
  _selectTraceTab("overview");
}

function _selectTraceTab(name) {
  document.querySelectorAll("[data-trace-tab]").forEach(function(b) {
    var on = b.getAttribute("data-trace-tab") === name;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll("[data-trace-pane]").forEach(function(p) {
    p.classList.toggle("is-active", p.getAttribute("data-trace-pane") === name);
  });
  // Slide the indicator under the active tab.
  var active = document.querySelector(".trace-tab.is-active");
  var ind = document.getElementById("trace-tab-indicator");
  if (active && ind) {
    ind.style.left = active.offsetLeft + "px";
    ind.style.width = active.offsetWidth + "px";
  }
}

(function() {
  var trigger = document.getElementById("trace-trigger");
  var close = document.getElementById("trace-close");
  var backdrop = document.getElementById("trace-backdrop");
  if (trigger) trigger.addEventListener("click", _openTracePanel);
  if (close) close.addEventListener("click", _closeTracePanel);
  if (backdrop) backdrop.addEventListener("click", _closeTracePanel);
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") _closeTracePanel();
  });
  document.querySelectorAll("[data-trace-tab]").forEach(function(b) {
    b.addEventListener("click", function() { _selectTraceTab(b.getAttribute("data-trace-tab")); });
  });
  var copyBtn = document.getElementById("trace-copy-json");
  if (copyBtn) copyBtn.addEventListener("click", function() {
    var pre = document.getElementById("trace-json");
    if (!pre) return;
    try {
      navigator.clipboard.writeText(pre.textContent || "");
      copyBtn.textContent = "Copied!";
      setTimeout(function() { copyBtn.textContent = "Copy JSON"; }, 1200);
    } catch (e) {}
  });
})();

//────────────────────────────────────────────────────────────────────────
// Brief try-chips — one-click fill. Any element with [data-brief-target]
// fills the input/textarea with that target id when clicked. Wired
// globally (not gated on ensureCanvas) so chips on Federation /
// Orchestrator / Workflow tabs work without visiting the Canvas tab
// first.
//────────────────────────────────────────────────────────────────────────
document.querySelectorAll("[data-brief-target]").forEach(function(b) {
  b.addEventListener("click", function() {
    var targetId = b.getAttribute("data-brief-target");
    var target = targetId ? document.getElementById(targetId) : null;
    if (!target) return;
    target.value = (b.textContent || "").trim();
    target.focus();
  });
});

//────────────────────────────────────────────────────────────────────────
// Lane info popovers — "How this works" explainers per Brand Canvas lane.
// Click the (?) icon → popover opens anchored below the icon. One open at
// a time; click outside or hit Esc to dismiss. Non-modal — backdrop is
// transparent, the rest of the UI stays interactive.
//────────────────────────────────────────────────────────────────────────
`;
