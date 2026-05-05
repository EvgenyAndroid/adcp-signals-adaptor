// src/demo/script/fragments/signals-trace-viewer.ts
//
// Shared "Signal Trace Viewer" — a self-contained modal that any
// demo page can open to inspect the request/response JSON for a
// get_signals or activate_signal interaction, validated against the
// canonical AdCP schemas.
//
// Surfaces that mount this viewer:
//   - Recent Activations: row → openSignalTraceModal({ correlationId })
//   - Orchestrator: trace inspector → openSignalTraceModal({ briefId })
//   - Brand Canvas: trace inspector → same as orchestrator
//   - Federation: per-agent button → openSignalTraceModal({ agentId })
//   - Race Canvas (separate page): embedded copy of this module
//
// Source range (in pre-refactor): n/a — new module.
// Concatenated by ../index.ts. Byte-equivalent enforced via snapshot.
//
// SCRIPT_TAG_TRAP NOTE: backticks + dollar-curly inside the embedded
// JS must be escaped. Run tmp-mining/trap_audit.py before commit.

export const signalsTraceViewerJs = `
// ── State ───────────────────────────────────────────────────────────────
//
// One global modal element + a state object indicating whether it's
// open and what filter produced its current contents. Every demo-page
// trigger calls openSignalTraceModal({...}), which re-fetches and
// re-renders.
let _signalTraceModalEl = null;
let _signalTraceCurrentFilter = null;

function ensureSignalTraceModalEl() {
  if (_signalTraceModalEl) return _signalTraceModalEl;
  const wrap = document.createElement("div");
  wrap.id = "signal-trace-modal";
  wrap.className = "signal-trace-modal";
  wrap.innerHTML =
    '<div class="signal-trace-card">' +
      '<div class="signal-trace-head">' +
        '<div class="signal-trace-head-title">Signal trace</div>' +
        '<div class="signal-trace-head-meta" id="signal-trace-head-meta">—</div>' +
        '<button class="signal-trace-close" id="signal-trace-close" aria-label="Close">×</button>' +
      '</div>' +
      '<div class="signal-trace-body" id="signal-trace-body">' +
        '<div class="signal-trace-empty">loading traces…</div>' +
      '</div>' +
      '<details class="signal-trace-glossary">' +
        '<summary>Glossary · marketing ↔ AdCP Signals</summary>' +
        '<div class="signal-trace-glossary-body" id="signal-trace-glossary-body"></div>' +
      '</details>' +
    '</div>';
  document.body.appendChild(wrap);
  // Wire close handlers
  wrap.querySelector("#signal-trace-close").addEventListener("click", closeSignalTraceModal);
  wrap.addEventListener("click", function (e) {
    if (e.target === wrap) closeSignalTraceModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && wrap.classList.contains("open")) closeSignalTraceModal();
  });
  _signalTraceModalEl = wrap;
  return wrap;
}

function closeSignalTraceModal() {
  if (_signalTraceModalEl) _signalTraceModalEl.classList.remove("open");
  _signalTraceCurrentFilter = null;
}

// Pretty-print a JSON value with inline glossary annotations on
// known field names. Returns HTML string.
function renderJsonWithGlossary(value, indent) {
  indent = indent || 0;
  if (value === null) return '<span class="json-null">null</span>';
  if (value === undefined) return '<span class="json-null">undefined</span>';
  const t = typeof value;
  if (t === "string") return '<span class="json-str">"' + escapeHtml(value) + '"</span>';
  if (t === "number") return '<span class="json-num">' + value + '</span>';
  if (t === "boolean") return '<span class="json-bool">' + value + '</span>';
  const pad = "  ".repeat(indent);
  const inner = "  ".repeat(indent + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map(function (v) { return inner + renderJsonWithGlossary(v, indent + 1); }).join(",\\n");
    return "[\\n" + items + "\\n" + pad + "]";
  }
  if (t === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    const items = keys.map(function (k) {
      const annotation = (typeof annotateGlossaryField === "function") ? annotateGlossaryField(k) : null;
      const annotationHtml = annotation
        ? ' <span class="json-annotation">// ' + escapeHtml(annotation.label) + (annotation.note ? " — " + escapeHtml(annotation.note) : "") + '</span>'
        : "";
      return inner + '<span class="json-key">"' + escapeHtml(k) + '"</span>: ' + renderJsonWithGlossary(value[k], indent + 1) + annotationHtml;
    }).join(",\\n");
    return "{\\n" + items + "\\n" + pad + "}";
  }
  return escapeHtml(String(value));
}

function renderValidationBadge(validation) {
  if (!validation) return '<span class="trace-vbadge skip">no schema</span>';
  if (validation.errors && validation.errors.some(function (e) { return e.keyword === "skipped" || e.keyword === "missing_schema"; })) {
    return '<span class="trace-vbadge skip">schema unavailable</span>';
  }
  if (validation.valid) return '<span class="trace-vbadge ok">✓ schema valid</span>';
  const n = (validation.errors || []).length;
  return '<span class="trace-vbadge bad">✗ ' + n + ' schema error' + (n === 1 ? "" : "s") + '</span>';
}

function renderValidationErrors(validation) {
  if (!validation || !validation.errors || validation.errors.length === 0) return "";
  return '<div class="trace-verrors">' +
    validation.errors.map(function (e) {
      return '<div class="trace-verr"><code>' + escapeHtml(e.path || "(root)") + '</code> · ' + escapeHtml(e.message) + ' <span class="trace-verr-kw">[' + escapeHtml(e.keyword) + ']</span></div>';
    }).join("") + '</div>';
}

function renderSingleTrace(trace, idx) {
  const tsFmt = new Date(trace.ts).toLocaleTimeString();
  const dirIcon = trace.direction === "outbound" ? "→" : "←";
  const sourceShort = trace.source.length > 36 ? trace.source.slice(0, 33) + "…" : trace.source;
  return '<div class="signal-trace-frame" data-trace-id="' + escapeHtml(trace.trace_id) + '">' +
    '<div class="signal-trace-frame-head">' +
      '<span class="trace-tool trace-tool-' + escapeHtml(trace.tool_name) + '">' + escapeHtml(trace.tool_name) + '</span> ' +
      '<span class="trace-dir">' + dirIcon + ' ' + escapeHtml(sourceShort) + '</span>' +
      '<span class="trace-ts">' + tsFmt + '</span>' +
      '<span class="trace-dur">' + trace.duration_ms + 'ms</span>' +
      (trace.correlation_id ? '<span class="trace-corr">corr: ' + escapeHtml(trace.correlation_id.slice(-12)) + '</span>' : '') +
      (trace.response.status === "error" ? '<span class="trace-status-err">ERROR</span>' : '<span class="trace-status-ok">OK</span>') +
    '</div>' +
    '<div class="signal-trace-section">' +
      '<div class="signal-trace-section-head">' +
        '<span class="signal-trace-section-label">REQUEST</span>' +
        renderValidationBadge(trace.request.validation) +
        '<a class="signal-trace-schemalink" href="' + escapeHtml(trace.request.validation.schema_url) + '" target="_blank" rel="noopener">schema ↗</a>' +
        '<button class="signal-trace-copy" data-copy-target="req-' + idx + '">copy</button>' +
      '</div>' +
      renderValidationErrors(trace.request.validation) +
      '<pre class="signal-trace-json" id="req-' + idx + '">' + renderJsonWithGlossary(trace.request.payload) + '</pre>' +
    '</div>' +
    '<div class="signal-trace-section">' +
      '<div class="signal-trace-section-head">' +
        '<span class="signal-trace-section-label">RESPONSE</span>' +
        renderValidationBadge(trace.response.validation) +
        '<a class="signal-trace-schemalink" href="' + escapeHtml(trace.response.validation.schema_url) + '" target="_blank" rel="noopener">schema ↗</a>' +
        '<button class="signal-trace-copy" data-copy-target="res-' + idx + '">copy</button>' +
      '</div>' +
      renderValidationErrors(trace.response.validation) +
      (trace.response.error_message ? '<div class="signal-trace-errmsg">' + escapeHtml(trace.response.error_message) + '</div>' : '') +
      '<pre class="signal-trace-json" id="res-' + idx + '">' + renderJsonWithGlossary(trace.response.payload) + '</pre>' +
    '</div>' +
  '</div>';
}

function renderGlossarySection() {
  if (typeof SIGNALS_GLOSSARY !== "object") return "";
  const entries = Object.keys(SIGNALS_GLOSSARY).map(function (k) {
    const g = SIGNALS_GLOSSARY[k];
    return '<div class="glossary-row"><code>' + escapeHtml(k) + '</code><span class="glossary-label">' + escapeHtml(g.label) + '</span><span class="glossary-note">' + escapeHtml(g.note) + '</span></div>';
  }).join("");
  return entries;
}

// Open the modal with traces matching the given filter. Filter shape:
//   { correlationId?, agentId?, tool?, traceIds?, sourcePrefix? }
async function openSignalTraceModal(filter) {
  const wrap = ensureSignalTraceModalEl();
  _signalTraceCurrentFilter = filter || {};
  wrap.classList.add("open");
  const body = document.getElementById("signal-trace-body");
  const meta = document.getElementById("signal-trace-head-meta");
  body.innerHTML = '<div class="signal-trace-empty">loading traces…</div>';
  meta.textContent = describeFilter(_signalTraceCurrentFilter);
  // Populate glossary section once per modal open
  const gloss = document.getElementById("signal-trace-glossary-body");
  if (gloss) gloss.innerHTML = renderGlossarySection();
  // Build query string from filter
  const qs = new URLSearchParams();
  if (filter && filter.correlationId) qs.set("correlation_id", filter.correlationId);
  if (filter && filter.agentId) qs.set("agent_id", filter.agentId);
  if (filter && filter.tool) qs.set("tool", filter.tool);
  if (filter && filter.sourcePrefix) qs.set("source_prefix", filter.sourcePrefix);
  qs.set("limit", String((filter && filter.limit) || 25));
  try {
    const r = await fetch("/api/signal-traces?" + qs.toString());
    const data = await r.json();
    let traces = (data && data.traces) || [];
    // If specific traceIds were requested, filter client-side
    if (filter && filter.traceIds && filter.traceIds.length > 0) {
      const wanted = new Set(filter.traceIds);
      traces = traces.filter(function (t) { return wanted.has(t.trace_id); });
    }
    if (traces.length === 0) {
      body.innerHTML = '<div class="signal-trace-empty">No traces match this filter yet.<br/><small>Traces buffer the last 500 signal interactions in-memory; older ones are evicted.</small></div>';
      return;
    }
    body.innerHTML = traces.map(function (t, i) { return renderSingleTrace(t, i); }).join("");
    // Wire copy buttons
    body.querySelectorAll(".signal-trace-copy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const targetId = btn.dataset.copyTarget;
        const pre = document.getElementById(targetId);
        if (pre) {
          const txt = pre.textContent || "";
          navigator.clipboard.writeText(txt).then(function () {
            btn.textContent = "copied ✓";
            setTimeout(function () { btn.textContent = "copy"; }, 1400);
          }).catch(function () { /* clipboard blocked */ });
        }
      });
    });
  } catch (e) {
    body.innerHTML = '<div class="signal-trace-empty">Failed to load traces: ' + escapeHtml(String(e && e.message || e)) + '</div>';
  }
}

function describeFilter(f) {
  if (!f) return "all recent";
  const parts = [];
  if (f.tool) parts.push("tool=" + f.tool);
  if (f.correlationId) parts.push("corr=" + f.correlationId.slice(-12));
  if (f.agentId) parts.push("agent=" + f.agentId);
  if (f.sourcePrefix) parts.push("src⊃ " + f.sourcePrefix);
  return parts.length === 0 ? "all recent" : parts.join(" · ");
}

// Expose to window so other fragments + standalone canvases can call it.
window.openSignalTraceModal = openSignalTraceModal;
window.closeSignalTraceModal = closeSignalTraceModal;

// Wire the per-tab "{ } Signal traces" buttons via event delegation so
// the buttons work regardless of which tab is active when bound.
document.addEventListener("click", function (e) {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest("#orch-signal-traces") || t.closest("#fed-signal-traces")) {
    return openSignalTraceModal({ sourcePrefix: "federation:", limit: 25 });
  }
  if (t.closest("#canvas-signal-traces")) {
    return openSignalTraceModal({ limit: 25 });
  }
});
`;
