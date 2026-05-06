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
        '<button class="signal-trace-reset" id="signal-trace-reset" title="Wipe trace buffer (in-memory + KV) — useful between demo segments">⟲ reset</button>' +
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
  // Reset button — wipes in-memory + KV index. Confirms before firing
  // since the workshop demo doesn't want accidental wipes mid-demo.
  wrap.querySelector("#signal-trace-reset").addEventListener("click", async function () {
    if (!confirm("Wipe trace buffer? This clears in-memory + KV index for this demo. Per-trace KV entries TTL out at 6h regardless.")) return;
    try {
      const r = await fetch("/api/signal-traces", { method: "DELETE" });
      const j = await r.json().catch(function () { return null; });
      if (j && j.ok) {
        // Re-render with the now-empty filter so the user sees the
        // "no traces match this filter yet" empty state confirming
        // the wipe.
        const body = document.getElementById("signal-trace-body");
        if (body) body.innerHTML = '<div class="signal-trace-empty">Trace buffer wiped. Trigger a get_signals or activate_signal call to see new traces appear.</div>';
      } else {
        alert("Reset failed: " + (j && j.error ? j.error : "unknown"));
      }
    } catch (e) {
      alert("Reset failed: " + (e && e.message ? e.message : String(e)));
    }
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
  if (!validation) return '<span class="trace-vbadge skip" title="No schema attached to this trace">no schema</span>';
  // "extension" — tool isn't standardized in the published AdCP spec
  // yet, so we record the trace but skip validation. Distinct badge so
  // the audience doesn't read this as a runtime failure. The schema
  // URL banner still renders (pointing at the spec proposal / issue).
  if (validation.errors && validation.errors.some(function (e) { return e.keyword === "extension"; })) {
    return '<span class="trace-vbadge ext" title="Recorded for audit. Tool not yet standardized in published AdCP spec — schema link goes to the proposal.">⚙ extension</span>';
  }
  // "skipped" or "missing_schema" — the validator couldn't run on the
  // payload (e.g. corpus didn't load, runtime quirk). Distinct from
  // "ran and found 0 errors" — be honest about it. Kept short for
  // the badge; full reason shown in the meta line below the JSON.
  if (validation.errors && validation.errors.some(function (e) { return e.keyword === "skipped" || e.keyword === "missing_schema"; })) {
    return '<span class="trace-vbadge skip" title="Validator could not run; schema URL link still works">⊘ validation skipped</span>';
  }
  if (validation.valid) return '<span class="trace-vbadge ok" title="Payload validates against the canonical AdCP schema">✓ schema valid</span>';
  const n = (validation.errors || []).length;
  return '<span class="trace-vbadge bad" title="Payload does not validate — see errors below">✗ ' + n + ' schema error' + (n === 1 ? "" : "s") + '</span>';
}

// Promoted schema URL banner — shown above the errors block (not a
// tiny ↗ icon hidden in the section head). Surfacing the canonical
// schema URL prominently is the answer to the workshop question
// "what schema are we comparing against?". Click-through opens the
// raw schema in a new tab so the audience can see the contract.
function renderSchemaBanner(validation) {
  if (!validation || !validation.schema_url) return "";
  // Compact display — show the trailing path segments (e.g.
  // "v3/signals/get-signals-response.json"). Full URL is in the
  // href + title attribute for click-through and hover.
  let visible = validation.schema_url;
  try {
    const u = new URL(validation.schema_url);
    visible = u.host + u.pathname;
  } catch (_) { /* not a parseable URL — keep raw */ }
  if (visible.length > 64) visible = "…" + visible.slice(-62);
  return '<div class="trace-schema-banner">' +
    '<span class="trace-schema-banner-label">validating against</span>' +
    '<a class="trace-schema-banner-link" href="' + escapeHtml(validation.schema_url) +
    '" target="_blank" rel="noopener" title="' + escapeHtml(validation.schema_url) + '">' +
    escapeHtml(visible) + ' ↗</a>' +
  '</div>';
}

// Friendly translations for the dense JSON-Schema vocabulary that
// surfaces in validator errors. The audience shouldn't need to learn
// JSON-Pointer + JSON-Schema keywords on the spot to read a trace.
function _humanizeErrorMessage(msg) {
  if (!msg) return "(no detail)";
  // "Instance does not have required property "X"" -> "missing required \"X\""
  const reqMatch = msg.match(/^Instance does not have required property "([^"]+)"\.?$/);
  if (reqMatch) return 'missing required "' + reqMatch[1] + '"';
  // "Property "X" does not match schema." -> "\"X\" doesn't match expected shape"
  const propMatch = msg.match(/^Property "([^"]+)" does not match schema\.?$/);
  if (propMatch) return '"' + propMatch[1] + '" doesn\\'t match expected shape';
  // "Items did not match schema." -> "array items don't match expected shape"
  if (/^Items did not match schema\.?$/.test(msg)) return "array items don\\'t match expected shape";
  // "Instance does not match exactly one subschema (0 matches)." -> "doesn't match any of the expected variants"
  if (/^Instance does not match exactly one subschema/.test(msg)) return "doesn\\'t match any of the expected variants (oneOf)";
  // "A subschema had errors." -> swallow — it's just bookkeeping
  if (/^A subschema had errors\.?$/.test(msg)) return "(see nested errors below)";
  // "validator threw: Unresolved $ref ..." — the @cfworker/json-schema
  // error includes a multi-kilobyte dump of every known schema, which
  // turns the modal into a wall of text. Truncate to just the actual
  // error clause (everything before "Known schemas:") and append a
  // hint that the rest is in the raw payload.
  if (/^validator threw: /.test(msg)) {
    const stripped = msg.replace(/^validator threw: /, "");
    const knownIdx = stripped.indexOf(". Known schemas:");
    if (knownIdx > 0 && knownIdx < stripped.length - 10) {
      const head = stripped.slice(0, knownIdx).trim();
      return "validator threw: " + head + " (full schema list in raw trace)";
    }
    // No "Known schemas:" boilerplate — short error, return as-is.
    if (stripped.length <= 240) return "validator threw: " + stripped;
    return "validator threw: " + stripped.slice(0, 240).trim() + "…";
  }
  return msg;
}

function _humanizeKeyword(k) {
  switch (k) {
    case "required":   return "missing required field";
    case "oneOf":      return "no schema variant matched";
    case "properties": return "wrong shape for a property";
    case "items":      return "wrong shape for an array item";
    case "$ref":       return "referenced subschema failed";
    case "type":       return "wrong type";
    case "enum":       return "value not in enum";
    case "pattern":    return "string didn\\'t match pattern";
    case "additionalProperties": return "unknown property";
    default:           return k || "unknown";
  }
}

// ── "What would the peer need to fix" — synthesized JSON-Patch ops ──────
//
// Walks validator errors and infers a minimal set of RFC 6902 patch
// operations that would make the payload conformant. The workshop
// centerpiece: turns "Dstillery returned 12 errors" from a finger-point
// into an actionable migration ticket. For each error keyword we apply
// a focused heuristic:
//
//   required              -> add op with <TBD> placeholder value
//   additionalProperties  -> remove op
//   const                 -> replace op with "<expected const>" placeholder
//   enum                  -> replace op with "<one of the enum values>"
//   type                  -> replace op with "<correct type>"
//   oneOf / anyOf         -> rely on nested error rows (those carry the
//                            actionable required/type failures)
//
// Values are intentionally placeholders unless the schema specifies a
// const. The point isn't to reconstruct the perfect payload (which
// would require the schema in the browser) — it's to show the SHAPE of
// the fix: which fields to add, which to remove, where each lives in
// the JSON tree. Concrete enough that a peer's engineer can read the
// trace and write the migration.
function inferFixOps(errors) {
  if (!errors || errors.length === 0) return [];
  const ops = [];
  const seen = new Set();
  function push(op) {
    const key = op.op + ":" + op.path;
    if (seen.has(key)) return;
    seen.add(key);
    ops.push(op);
  }
  function jsonPointer(parent, child) {
    // cfworker emits empty-string for root, "/signals/0" otherwise. Our
    // recorder defaults missing instanceLocation to "(root)" for the
    // viewer; normalize both to the JSON-Pointer convention.
    const base = (parent === "(root)" || parent === "") ? "" : parent;
    return base + "/" + child;
  }
  for (let i = 0; i < errors.length; i++) {
    const e = errors[i];
    const path = e.path || "";
    const msg = e.message || "";
    if (e.keyword === "required") {
      const m = msg.match(/required (?:property )?["']([^"']+)["']/);
      if (m) {
        push({
          op: "add",
          path: jsonPointer(path, m[1]),
          value: "<TBD>",
          reason: "schema requires this field",
        });
      }
      continue;
    }
    if (e.keyword === "additionalProperties") {
      const m = msg.match(/property ["']([^"']+)["']/) || msg.match(/Additional property ["']([^"']+)["']/);
      if (m) {
        push({
          op: "remove",
          path: jsonPointer(path, m[1]),
          reason: "field not in schema (additionalProperties: false)",
        });
      }
      continue;
    }
    if (e.keyword === "const") {
      push({ op: "replace", path: path, value: "<expected const>", reason: "must equal a specific value" });
      continue;
    }
    if (e.keyword === "enum") {
      push({ op: "replace", path: path, value: "<one of the enum values>", reason: "not in allowed values" });
      continue;
    }
    if (e.keyword === "type") {
      push({ op: "replace", path: path, value: "<correct type>", reason: "wrong type for this field" });
      continue;
    }
    if (e.keyword === "pattern") {
      push({ op: "replace", path: path, value: "<value matching pattern>", reason: "string didn\\'t match the regex constraint" });
      continue;
    }
    // oneOf/anyOf/$ref/properties/items intentionally skipped — their
    // actionable detail lives in the nested error rows we already
    // surfaced. Showing a top-level "fix oneOf" op would be noise.
  }
  return ops;
}

function renderFixPanel(validation) {
  // Don't render when validation passed, was skipped, or is an
  // extension tool — there's nothing to "fix" in those cases.
  if (!validation || validation.valid) return "";
  const errs = validation.errors || [];
  if (errs.length === 0) return "";
  if (errs.some(function (e) { return e.keyword === "skipped" || e.keyword === "missing_schema" || e.keyword === "extension"; })) return "";
  const ops = inferFixOps(errs);
  if (ops.length === 0) return "";
  const rows = ops.map(function (op) {
    const opLabel = op.op === "add" ? "+ ADD" : op.op === "remove" ? "− REMOVE" : "↻ REPLACE";
    const opClass = "trace-fix-op-" + op.op;
    const valueBlock = op.op === "remove"
      ? ""
      : ' <span class="trace-fix-op-value">→ ' + escapeHtml(op.value || "") + '</span>';
    return '<li class="trace-fix-op ' + opClass + '">' +
      '<span class="trace-fix-op-kind">' + opLabel + '</span>' +
      ' <code class="trace-fix-op-path">' + escapeHtml(op.path) + '</code>' +
      valueBlock +
      ' <span class="trace-fix-op-reason">— ' + escapeHtml(op.reason) + '</span>' +
    '</li>';
  }).join("");
  // RFC 6902 reference for engineers in the audience who recognize the
  // shape but haven't internalized the spec name.
  return '<details class="trace-fix-panel" open>' +
    '<summary class="trace-fix-summary">' +
      '<span class="trace-fix-icon">🔧</span>' +
      '<span class="trace-fix-title">Suggested fix · ' + ops.length + ' operation' + (ops.length === 1 ? "" : "s") + '</span>' +
      '<span class="trace-fix-sublabel">RFC 6902 JSON-Patch the peer would need to apply</span>' +
    '</summary>' +
    '<ul class="trace-fix-ops">' + rows + '</ul>' +
    '<p class="trace-fix-foot">Generated from the validator\\'s keyword + path. Values are placeholders unless the schema specifies a const — the workshop point is the SHAPE of the fix, not the literal values.</p>' +
  '</details>';
}

function renderValidationErrors(validation) {
  if (!validation || !validation.errors || validation.errors.length === 0) return "";
  // Per-error rows now show a humanized message + the keyword as a
  // tooltip-explained chip. Keep the raw path as <code> so workshop
  // attendees can map it to the JSON pretty-print below.
  const rows = validation.errors.map(function (e) {
    const human = _humanizeErrorMessage(e.message);
    const kwHuman = _humanizeKeyword(e.keyword);
    return '<div class="trace-verr">' +
      '<code class="trace-verr-path">' + escapeHtml(e.path || "(root)") + '</code>' +
      '<span class="trace-verr-msg">' + escapeHtml(human) + '</span>' +
      '<span class="trace-verr-kw" title="' + escapeHtml(kwHuman) + '">[' + escapeHtml(e.keyword) + ']</span>' +
      '</div>';
  }).join("");
  // Collapsed legend explains the JSON-Pointer + keyword vocabulary in
  // one click. Defaults to closed so the trace stays scannable; first-
  // time viewers click to expand. Workshop demo: open it once at the
  // top of Block 2 so the audience knows what they're reading.
  const legend = '<details class="trace-verr-legend">' +
    '<summary>How to read these errors</summary>' +
    '<div class="trace-verr-legend-body">' +
      '<div><strong>Path</strong> (e.g. <code>#/signals/0</code>): JSON-Pointer into the payload below. ' +
        '<code>#</code> is the root, <code>#/signals</code> is the <code>signals</code> array, ' +
        '<code>#/signals/0</code> is its first item.</div>' +
      '<div><strong>Keyword</strong> (e.g. <code>[required]</code>, <code>[oneOf]</code>): which JSON-Schema rule the validator applied. ' +
        'Hover the keyword chip for a plain-English meaning.</div>' +
      '<div><strong>Schema link</strong> above the errors: opens the canonical AdCP schema we validated against. ' +
        'Click through to see exactly what shape was expected.</div>' +
    '</div>' +
  '</details>';
  return '<div class="trace-verrors">' + legend + rows + '</div>';
}

// ── Latency percentiles ───────────────────────────────────────────────
//
// Compute per-group percentiles across the loaded trace list so the
// trace head row can show "180ms (p72)" instead of just "180ms". Group
// by (tool_name, source) which is the semantically right grain — a
// federation:dstillery get_signals call should compare against other
// federation:dstillery get_signals, not against an inbound mcp_external
// activate_signal. Percentiles are honest only within a group; mixing
// would mislead.
function computeLatencyPercentiles(traces) {
  const buckets = {};
  for (let i = 0; i < traces.length; i++) {
    const t = traces[i];
    const key = t.tool_name + "::" + t.source;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(t.duration_ms);
  }
  const out = {};
  Object.keys(buckets).forEach(function (k) {
    const sorted = buckets[k].slice().sort(function (a, b) { return a - b; });
    out[k] = sorted; // store sorted so each trace can compute its rank
  });
  return out;
}
function percentileFor(durationMs, sorted) {
  if (!sorted || sorted.length === 0) return null;
  // Largest index whose value <= durationMs. Standard nearest-rank
  // percentile with the rank-of-value definition.
  let idx = 0;
  for (let i = 0; i < sorted.length; i++) { if (sorted[i] <= durationMs) idx = i; else break; }
  // p = (rank / N) * 100, where rank is 1-indexed for display purposes.
  return Math.round(((idx + 1) / sorted.length) * 100);
}
function renderLatencyChip(durationMs, sorted) {
  // Hide chip when the group has fewer than 3 samples — percentile
  // claims would be noise-not-signal at that bucket size.
  if (!sorted || sorted.length < 3) return '<span class="trace-dur">' + durationMs + 'ms</span>';
  const p = percentileFor(durationMs, sorted);
  // Color-code: fast (≤p25) green, ≤p75 neutral, slow (>p75) warm.
  let cls = "neutral";
  if (p <= 25) cls = "fast";
  else if (p > 75) cls = "slow";
  const title = "Within this group (same tool + source, " + sorted.length + " samples), this call is the " + p + "th percentile by latency. p50 = " + sorted[Math.floor(sorted.length / 2)] + "ms.";
  return '<span class="trace-dur trace-dur-' + cls + '" title="' + escapeHtml(title) + '">' + durationMs + 'ms · p' + p + '</span>';
}

function renderSingleTrace(trace, idx, percentileBuckets) {
  const tsFmt = new Date(trace.ts).toLocaleTimeString();
  const dirIcon = trace.direction === "outbound" ? "→" : "←";
  const sourceShort = trace.source.length > 36 ? trace.source.slice(0, 33) + "…" : trace.source;
  // Endpoint URL — render as a clickable link with the full URL in
  // the title attribute so the audience can hover to confirm exactly
  // where the request hit. For long URLs, show only the host:path tail
  // in the visible text. Outbound (federation) URLs are external; we
  // open in a new tab. No-render if missing (legacy traces).
  let endpointBlock = "";
  if (trace.endpoint_url) {
    let visible = trace.endpoint_url;
    try {
      const u = new URL(trace.endpoint_url);
      visible = u.host + u.pathname;
      if (visible.length > 48) visible = visible.slice(0, 45) + "…";
    } catch (_) { /* not a parseable URL — show as-is, truncated */
      if (visible.length > 48) visible = visible.slice(0, 45) + "…";
    }
    endpointBlock =
      '<a class="trace-endpoint" href="' + escapeHtml(trace.endpoint_url) + '" target="_blank" rel="noopener" title="' + escapeHtml(trace.endpoint_url) + '">' +
        '<span class="trace-endpoint-icon">⎘</span>' +
        '<span class="trace-endpoint-url">' + escapeHtml(visible) + '</span>' +
      '</a>';
  }
  // Peer version chip — pulled live from MCP initialize handshake.
  // Surfacing this answers the workshop question "why 12 errors? what
  // version is the peer?" without hardcoding "Dstillery is 2.x". When
  // a peer migrates, the chip follows automatically.
  let peerVersionChip = "";
  if (trace.peer_server_info && (trace.peer_server_info.version || trace.peer_server_info.name)) {
    const name = trace.peer_server_info.name || "";
    const version = trace.peer_server_info.version || "";
    const label = version ? "peer v" + version : "peer";
    const fullTitle = (name ? name + " · " : "") + (version ? "version " + version : "version unknown") +
      " (advertised by the peer in the MCP initialize handshake)";
    peerVersionChip = '<span class="trace-peer-version" title="' + escapeHtml(fullTitle) + '">' +
      escapeHtml(label) + '</span>';
  }
  // Latency chip with percentile rank within (tool, source) group.
  const groupKey = trace.tool_name + "::" + trace.source;
  const sortedDurations = percentileBuckets ? percentileBuckets[groupKey] : null;
  const latencyChip = renderLatencyChip(trace.duration_ms, sortedDurations);
  // Correlation chain — when the trace has a correlation_id, the chip
  // becomes a clickable link that re-opens the modal scoped to the
  // chain (every other trace in that workflow). Lets the audience walk
  // a multi-call workflow (signals → products → media_buy) as a
  // single timeline instead of clicking around for orphan traces.
  let corrChip = "";
  if (trace.correlation_id) {
    const cid = trace.correlation_id;
    const tail = cid.slice(-12);
    corrChip = '<button class="trace-corr trace-corr-link" data-correlation-id="' + escapeHtml(cid) +
      '" title="Show every other trace with the same correlation_id — see the full workflow chain (signals → products → media_buy etc)">' +
      'corr: ' + escapeHtml(tail) + ' ⛓</button>';
  }
  // Replay-as-curl button — generates a curl command for the recorded
  // request and copies it to clipboard. For outbound (federation), this
  // points at the peer's /mcp endpoint so the audience can verify
  // independently. For inbound, it points at our worker.
  const replayBlock = trace.endpoint_url
    ? '<button class="trace-replay" data-replay-target="' + idx + '" title="Copy a curl command that re-fires this exact request to the same endpoint. Verify the peer\\'s response without leaving the room.">↻ curl</button>'
    : '';
  return '<div class="signal-trace-frame" data-trace-id="' + escapeHtml(trace.trace_id) + '">' +
    '<div class="signal-trace-frame-head">' +
      '<span class="trace-tool trace-tool-' + escapeHtml(trace.tool_name) + '">' + escapeHtml(trace.tool_name) + '</span> ' +
      '<span class="trace-dir">' + dirIcon + ' ' + escapeHtml(sourceShort) + '</span>' +
      endpointBlock +
      peerVersionChip +
      '<span class="trace-ts">' + tsFmt + '</span>' +
      latencyChip +
      corrChip +
      replayBlock +
      (trace.response.status === "error" ? '<span class="trace-status-err">ERROR</span>' : '<span class="trace-status-ok">OK</span>') +
    '</div>' +
    '<div class="signal-trace-section">' +
      '<div class="signal-trace-section-head">' +
        '<span class="signal-trace-section-label">REQUEST</span>' +
        renderValidationBadge(trace.request.validation) +
        '<button class="signal-trace-copy" data-copy-target="req-' + idx + '">copy</button>' +
      '</div>' +
      renderSchemaBanner(trace.request.validation) +
      renderValidationErrors(trace.request.validation) +
      renderFixPanel(trace.request.validation) +
      '<pre class="signal-trace-json" id="req-' + idx + '">' + renderJsonWithGlossary(trace.request.payload) + '</pre>' +
    '</div>' +
    '<div class="signal-trace-section">' +
      '<div class="signal-trace-section-head">' +
        '<span class="signal-trace-section-label">RESPONSE</span>' +
        renderValidationBadge(trace.response.validation) +
        '<button class="signal-trace-copy" data-copy-target="res-' + idx + '">copy</button>' +
      '</div>' +
      renderSchemaBanner(trace.response.validation) +
      renderValidationErrors(trace.response.validation) +
      renderFixPanel(trace.response.validation) +
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
//   {
//     correlationId?, agentId?, tool?, traceIds?, sourcePrefix?,
//     task_id?,    // matches trace.response.payload.task_id (activate)
//     signal_id?,  // matches trace.request.payload.signal_agent_segment_id
//     limit?
//   }
//
// Both task_id + signal_id are server-fetched broadly (by tool/source
// prefix) and narrowed client-side, since neither field is indexed
// in the in-memory ring buffer or the KV index.
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
  // Build query string from filter — server-side filters first, then
  // client-side narrowing for fields not in the index (task_id,
  // signal_id, traceIds).
  const qs = new URLSearchParams();
  if (filter && filter.correlationId) qs.set("correlation_id", filter.correlationId);
  if (filter && filter.agentId) qs.set("agent_id", filter.agentId);
  // Single-tool filter: pushed to server. Multi-tool (tools: [...]):
  // we fetch unfiltered and narrow client-side below since the index
  // backing /api/signal-traces only takes one tool name at a time.
  if (filter && filter.tool) qs.set("tool", filter.tool);
  if (filter && filter.sourcePrefix) qs.set("source_prefix", filter.sourcePrefix);
  // Over-fetch a bit if we'll narrow client-side. 25 server-side is
  // plenty for a one-row drill-in (the row is almost always the most
  // recent matching trace).
  const limit = (filter && filter.limit) || 25;
  qs.set("limit", String(limit));
  try {
    const r = await fetch("/api/signal-traces?" + qs.toString());
    const data = await r.json();
    let traces = (data && data.traces) || [];
    // Multi-tool filter (tools: ["a", "b"]) — narrow client-side since
    // the server index keys on a single tool name.
    if (filter && Array.isArray(filter.tools) && filter.tools.length > 0) {
      const want = new Set(filter.tools);
      traces = traces.filter(function (t) { return want.has(t.tool_name); });
    }
    // Specific trace IDs (Race Canvas / orchestrator drill-in).
    if (filter && filter.traceIds && filter.traceIds.length > 0) {
      const wanted = new Set(filter.traceIds);
      traces = traces.filter(function (t) { return wanted.has(t.trace_id); });
    }
    // Client-side narrowing for activations row drill-in.
    if (filter && filter.task_id) {
      traces = traces.filter(function (t) {
        const p = t && t.response && t.response.payload;
        if (!p || typeof p !== "object") return false;
        // task_id can live at the top level OR inside ext.task_id
        // (MCP envelope binding). Match either.
        return p.task_id === filter.task_id || (p.ext && p.ext.task_id === filter.task_id);
      });
    }
    if (filter && filter.signal_id && (!filter.task_id || traces.length === 0)) {
      // Fallback to signal_id matching when task_id didn't pin a row
      // (legacy data, or task_id wasn't captured at trace time).
      traces = ((data && data.traces) || []).filter(function (t) {
        const p = t && t.request && t.request.payload;
        if (!p || typeof p !== "object") return false;
        return p.signal_agent_segment_id === filter.signal_id;
      });
    }
    if (traces.length === 0) {
      body.innerHTML = '<div class="signal-trace-empty">No traces match this filter yet.<br/><small>Traces buffer the last 500 signal interactions in-memory + 6h in KV; older ones are evicted.</small></div>';
      return;
    }
    // Pre-compute (tool, source) percentile buckets across the loaded
    // set so each row's latency chip can show its rank within its peer
    // group. Honest only within a group; mixing federation:dstillery
    // get_signals against inbound activate_signal would mislead.
    const percentileBuckets = computeLatencyPercentiles(traces);
    body.innerHTML = traces.map(function (t, i) { return renderSingleTrace(t, i, percentileBuckets); }).join("");
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
    // Wire correlation-chain links — clicking the corr-id chip re-opens
    // the modal scoped to every trace sharing that correlation_id.
    body.querySelectorAll(".trace-corr-link").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        const cid = btn.dataset.correlationId;
        if (cid) openSignalTraceModal({ correlationId: cid, limit: 50 });
      });
    });
    // Wire replay-as-curl buttons — generate a curl command for the
    // recorded request and copy to clipboard. Audience can paste into
    // a terminal to verify the peer's response independently.
    body.querySelectorAll(".trace-replay").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const replayIdx = parseInt(btn.dataset.replayTarget, 10);
        const t = traces[replayIdx];
        if (!t || !t.endpoint_url) return;
        // For MCP-flavored endpoints, the payload is the inner tool
        // arguments — wrap it back into JSON-RPC tools/call so the
        // curl actually hits a working endpoint shape. For REST, post
        // the payload as-is. Heuristic: endpoint_url ends with /mcp.
        let body, method = "POST";
        if (/\\/mcp\\/?$/.test(t.endpoint_url) || t.source.indexOf("mcp") >= 0 || t.source.indexOf("federation") >= 0) {
          body = JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "tools/call",
            params: { name: t.tool_name, arguments: t.request.payload || {} }
          });
        } else {
          body = JSON.stringify(t.request.payload || {});
        }
        // Single-quoted curl body. Escape single quotes inside the JSON
        // for shell safety.
        const safeBody = body.replace(/'/g, "'\\\\\\''");
        const curl = "curl -X " + method + " '" + t.endpoint_url + "' \\\\\\n" +
          "  -H 'Content-Type: application/json' \\\\\\n" +
          "  -d '" + safeBody + "'";
        navigator.clipboard.writeText(curl).then(function () {
          btn.textContent = "↻ copied ✓";
          setTimeout(function () { btn.textContent = "↻ curl"; }, 1600);
        }).catch(function () { /* clipboard blocked — leave label */ });
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
  if (Array.isArray(f.tools) && f.tools.length > 0) parts.push("tool ∈ {" + f.tools.join(", ") + "}");
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
  // Discover tab: the brief sends a get_signals to OUR /mcp (mcp_external
  // direction is inbound from the demo's POV — the demo browser is
  // calling our worker). Filter by tool to keep the modal scoped. The
  // Discover NL Query mode dispatches query_signals_nl too — open with
  // a multi-tool filter so the audience sees both the Brief mode
  // (get_signals) and NL Query mode (query_signals_nl) traces in one
  // pane and can compare the algorithmic surfaces side by side.
  if (t.closest("#discover-signal-traces")) {
    return openSignalTraceModal({ tools: ["get_signals", "query_signals_nl"], limit: 25 });
  }
  // Catalog tab: the page-walk fires get_signals with a wildcard spec
  // and pagination cursors. Showing the trace exposes the cursor
  // mechanics — multiple traces with chained pagination.cursor values
  // — which is the cleanest pagination story we can tell.
  if (t.closest("#catalog-signal-traces")) {
    return openSignalTraceModal({ tool: "get_signals", limit: 25 });
  }
  // Detail Panel: the row drill-in fires get_signals with signal_ids
  // (the discriminated SignalId form), so the trace shows the lookup
  // path vs the spec/discovery path. Useful contrast for audience
  // questions about "what does signal_id ACTUALLY look like".
  if (t.closest("#detail-signal-traces")) {
    return openSignalTraceModal({ tool: "get_signals", limit: 10 });
  }
  // Activations tab: the demo polls activate_signal then chains
  // get_operation_status calls until the underlying task flips to
  // completed. Wire the chip so the audience can audit the poll
  // sequence (each iteration is its own trace with the same task_id
  // in the request payload).
  if (t.closest("#activation-signal-traces")) {
    return openSignalTraceModal({ tools: ["activate_signal", "get_operation_status"], limit: 25 });
  }
});
`;
