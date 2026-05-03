// src/demo/script/fragments/orchestrator.ts
//
// Multi-Agent Orchestrator: agent grid, tool drawer, params form, fanout result, comparison matrix.
//
// Source range (in pre-refactor src/demo/script.ts): lines 7586..7889 (304 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const orchestratorJs = `function _orchRenderSummary() {
  var host = document.getElementById("orch-summary");
  if (!host) return;
  var probe = state.orchestrator.probe;
  if (!probe) { host.innerHTML = ""; return; }
  host.innerHTML =
    '<div class="orch-summary-cards">' +
      '<div class="orch-summary-card"><div class="k">Probed</div><div class="v mono">' + probe.count + '</div></div>' +
      '<div class="orch-summary-card orch-summary-ok"><div class="k">Alive</div><div class="v mono">' + probe.alive_count + '</div></div>' +
      '<div class="orch-summary-card"><div class="k">Down</div><div class="v mono">' + (probe.count - probe.alive_count) + '</div></div>' +
      '<div class="orch-summary-card"><div class="k">Avg latency</div><div class="v mono">' + probe.avg_latency_ms + ' ms</div></div>' +
      '<div class="orch-summary-card"><div class="k">Probed at</div><div class="v mono" style="font-size:11px">' + escapeHtml(probe.probed_at) + '</div></div>' +
    '</div>';
}

function _orchRenderAgentGrid() {
  var host = document.getElementById("orch-agents");
  if (!host) return;
  var agents = state.orchestrator.directory || [];
  if (agents.length === 0) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">No agents in directory</div></div>';
    return;
  }
  // Build per-agent probe lookup.
  var probeByUrl = {};
  if (state.orchestrator.probe) {
    (state.orchestrator.probe.results || []).forEach(function (r) { probeByUrl[r.mcp_url] = r; });
  }
  // Group by role + stage for grid layout.
  var groups = { signals: [], buying: [], creative: [], unclassified: [] };
  var byStage = { live: [], known_issue: [], roadmap: [] };
  agents.forEach(function (a) {
    byStage[a.stage] = byStage[a.stage] || [];
    byStage[a.stage].push(a);
  });
  function renderAgent(a) {
    var probe = a.mcp_url ? probeByUrl[a.mcp_url] : null;
    var probeInfo = probe ? probe.probe : null;
    var alive = probeInfo && probeInfo.alive;
    var status = a.stage === "roadmap" ? "roadmap" :
                 a.stage === "known_issue" ? "issue" :
                 !probeInfo ? "unknown" :
                 alive ? "alive" : "down";
    var statusClass = "orch-agent-" + status;
    var pillClass = status === "alive" ? "pill-success" :
                    status === "down" ? "pill-error" :
                    status === "issue" ? "pill-warning" :
                    status === "roadmap" ? "pill-muted" : "pill-muted";
    var pillLabel = status === "alive" ? "alive" : status === "down" ? "down" :
                    status === "issue" ? "issues" : status === "roadmap" ? "roadmap" : "unknown";
    var toolCount = probeInfo && probeInfo.tools ? probeInfo.tools.length : (a.directory_tool_count != null ? a.directory_tool_count : "—");
    var toolSource = probeInfo && probeInfo.tools ? "live" : "dir";
    var latency = probeInfo ? probeInfo.latency_ms + " ms" : "—";
    var serverInfo = probeInfo && probeInfo.server_info ? (probeInfo.server_info.name || "") + (probeInfo.server_info.version ? " " + probeInfo.server_info.version : "") : "";
    var roleBadge = '<span class="orch-role-badge orch-role-' + a.role + '">' + escapeHtml(a.role) + '</span>';
    // Double-escape the slashes: the SCRIPT_TAG body is a TS template
    // literal, so single-backslash-slash collapses to a plain slash at
    // emission and the regex becomes /^https?:/// which JS reads as a
    // regex followed by a line comment — missing ) after argument list.
    // Using \\/\\/ here so the served JS sees \/\/.
    var urlShort = a.mcp_url ? a.mcp_url.replace(/^https?:\\/\\//, "").slice(0, 50) : "no endpoint";
    var errorLine = probeInfo && probeInfo.error && !alive
      ? '<div class="orch-agent-error mono">' + escapeHtml(String(probeInfo.error).slice(0, 80)) + '</div>'
      : '';
    var firstTools = probeInfo && probeInfo.tools ? probeInfo.tools.slice(0, 3).map(function (t) { return t.name; }).join(", ") : "";
    var hasLiveTools = !!(probeInfo && probeInfo.tools && probeInfo.tools.length > 0);
    var isExpanded = !!state.orchestrator.expandedAgents[a.id];
    var expandable = hasLiveTools;
    var chevron = expandable
      ? '<button class="orch-expand-btn" data-orch-expand="' + escapeHtml(a.id) + '" aria-expanded="' + (isExpanded ? "true" : "false") + '" title="' + (isExpanded ? "Collapse" : "Expand") + ' tools">' + (isExpanded ? "\u25be" : "\u25b8") + '</button>'
      : '';
    var drawer = (expandable && isExpanded) ? _orchRenderToolDrawer(probeInfo.tools) : '';
    return '<div class="orch-agent-card ' + statusClass + (isExpanded ? ' orch-agent-expanded' : '') + '" data-agent-id="' + escapeHtml(a.id) + '">' +
      '<div class="orch-agent-head">' +
        '<div class="orch-agent-name">' + chevron + escapeHtml(a.name) + '</div>' +
        '<span class="pill ' + pillClass + ' mono" style="font-size:10px">' + pillLabel + '</span>' +
      '</div>' +
      '<div class="orch-agent-meta">' + roleBadge +
        '<span class="mono" style="color:var(--text-mut);font-size:10.5px">' + escapeHtml(a.vendor) + '</span>' +
      '</div>' +
      '<div class="orch-agent-url mono" title="' + escapeHtml(a.mcp_url || "") + '">' + escapeHtml(urlShort) + '</div>' +
      '<div class="orch-agent-stats">' +
        '<div><div class="k">Tools</div><div class="v">' + toolCount + ' <span class="orch-small mono">(' + toolSource + ')</span></div></div>' +
        '<div><div class="k">Latency</div><div class="v">' + latency + '</div></div>' +
      '</div>' +
      (serverInfo ? '<div class="orch-agent-server mono">' + escapeHtml(serverInfo) + '</div>' : '') +
      (firstTools && !isExpanded ? '<div class="orch-agent-tools mono">' + escapeHtml(firstTools) + (probeInfo.tools.length > 3 ? " +" + (probeInfo.tools.length - 3) : "") + '</div>' : '') +
      drawer +
      errorLine +
    '</div>';
  }
  var html = "";
  ["live", "known_issue", "roadmap"].forEach(function (stage) {
    var list = byStage[stage] || [];
    if (list.length === 0) return;
    var stageLabel = stage === "live" ? "Live" : stage === "known_issue" ? "Known Issues" : "Roadmap";
    html +=
      '<div class="orch-stage-section">' +
        '<div class="orch-stage-label">' + stageLabel + ' <span class="mono" style="color:var(--text-mut);font-weight:400;margin-left:6px">' + list.length + '</span></div>' +
        '<div class="orch-agent-grid">' + list.map(renderAgent).join("") + '</div>' +
      '</div>';
  });
  host.innerHTML = html;
  void groups;
  // Click handlers for agent-card expand toggles. Event-delegated so we
  // don't re-bind on every re-render.
  host.querySelectorAll(".orch-expand-btn").forEach(function (btn) {
    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var id = btn.getAttribute("data-orch-expand");
      if (!id) return;
      var map = state.orchestrator.expandedAgents;
      if (map[id]) delete map[id]; else map[id] = true;
      _orchRenderAgentGrid();
    });
  });
}

// Sec-48d: render the tool drawer shown when an agent card is expanded.
// Each tool gets name + description + a parameter table parsed from its
// MCP inputSchema. Schemas follow JSON-Schema object-with-properties; if
// any tool deviates (raw scalar schema, no properties) we fall through
// to a pre-block with the raw JSON so the surface is never opaque.
function _orchRenderToolDrawer(tools) {
  if (!tools || tools.length === 0) {
    return '<div class="orch-tool-drawer"><div class="orch-tool-empty">No tools reported by this agent.</div></div>';
  }
  var html = '<div class="orch-tool-drawer">';
  tools.forEach(function (t) {
    var name = t && t.name ? String(t.name) : "(unnamed)";
    var desc = t && t.description ? String(t.description) : "";
    var params = _orchRenderParams(t && t.inputSchema);
    html +=
      '<div class="orch-tool">' +
        '<div class="orch-tool-head mono">' + escapeHtml(name) + '</div>' +
        (desc ? '<div class="orch-tool-desc">' + escapeHtml(desc) + '</div>' : '') +
        params +
      '</div>';
  });
  html += '</div>';
  return html;
}

function _orchRenderParams(schema) {
  if (!schema || typeof schema !== "object") {
    return '<div class="orch-tool-noparams">No parameter schema advertised.</div>';
  }
  var props = schema.properties;
  if (!props || typeof props !== "object" || Object.keys(props).length === 0) {
    // Some tools declare {type:"object"} with no properties (accepts any).
    // Others might advertise a non-object root. Dump as JSON for transparency.
    try {
      return '<pre class="orch-tool-rawschema mono">' + escapeHtml(JSON.stringify(schema, null, 2)) + '</pre>';
    } catch (e) {
      return '<div class="orch-tool-noparams">Parameter schema unparseable.</div>';
    }
  }
  var required = Array.isArray(schema.required) ? schema.required : [];
  var reqSet = {};
  required.forEach(function (k) { reqSet[k] = true; });
  var rows = "";
  Object.keys(props).forEach(function (key) {
    var p = props[key] || {};
    var type = p.type || (p.enum ? "enum" : p["$ref"] ? "ref" : "any");
    if (Array.isArray(type)) type = type.join("|");
    var desc = p.description || "";
    var extra = "";
    if (p["enum"] && Array.isArray(p["enum"])) {
      extra = ' <span class="orch-tool-enum mono">(' + p["enum"].slice(0, 5).map(function (v) { return String(v); }).join(", ") + (p["enum"].length > 5 ? ", \u2026" : "") + ')</span>';
    }
    rows +=
      '<tr>' +
        '<td class="orch-tool-pname mono">' + escapeHtml(key) + '</td>' +
        '<td class="orch-tool-ptype mono">' + escapeHtml(String(type)) + extra + '</td>' +
        '<td class="orch-tool-preq">' + (reqSet[key] ? '<span class="pill pill-info mono" style="font-size:9.5px">required</span>' : '<span class="orch-small" style="color:var(--text-mut)">optional</span>') + '</td>' +
        '<td class="orch-tool-pdesc">' + escapeHtml(desc) + '</td>' +
      '</tr>';
  });
  return '<table class="orch-tool-params">' +
    '<thead><tr><th>name</th><th>type</th><th></th><th>description</th></tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
  '</table>';
}

async function runOrchFanout() {
  if (state.orchestrator.orchestrating) return;
  var briefEl = document.getElementById("orch-brief");
  var maxEl = document.getElementById("orch-max");
  var brief = (briefEl.value || "").trim();
  if (!brief) { showToast("Brief required.", true); return; }
  var maxResults = Number(maxEl.value) || 10;
  state.orchestrator.orchestrating = true;
  var host = document.getElementById("orch-results");
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Fanning out\u2026</div></div>';
  try {
    var r = await fetch("/agents/orchestrate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: brief, max_results_per_agent: maxResults, timeout_ms: 15000 }),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.orchestrator.orchestrate = data;
    _captureTrace(data._trace);
    _orchRenderFanoutResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  } finally {
    state.orchestrator.orchestrating = false;
  }
}

function _orchRenderFanoutResult(data) {
  var host = document.getElementById("orch-results");
  var summaryCards = (data.per_agent || []).map(function (p) {
    var cls = p.ok ? "orch-fanout-ok" : "orch-fanout-err";
    return '<div class="orch-fanout-card ' + cls + '">' +
      '<div class="orch-fanout-name">' + escapeHtml(p.name) + ' <span class="mono" style="color:var(--text-mut);font-size:10px">· ' + escapeHtml(p.vendor) + '</span></div>' +
      '<div class="orch-fanout-stats">' +
        '<span class="mono">' + (p.ok ? p.signal_count + " signals" : "failed") + '</span>' +
        '<span class="mono">' + p.latency_ms + ' ms</span>' +
      '</div>' +
      (p.error ? '<div class="orch-fanout-err-msg mono">' + escapeHtml(String(p.error).slice(0, 80)) + '</div>' : '') +
    '</div>';
  }).join("");
  var signals = data.signals || [];
  var signalRows = signals.slice(0, 50).map(function (s) {
    var sourceAgent = s.source_agent || "?";
    var badgeCls = sourceAgent === "evgeny_signals" ? "pill-success" : sourceAgent === "dstillery" ? "pill-info" : "pill-muted";
    return '<tr>' +
      '<td><span class="pill ' + badgeCls + ' mono" style="font-size:10px">' + escapeHtml(sourceAgent) + '</span></td>' +
      '<td>' + escapeHtml(s.name || "(unnamed)") + '</td>' +
      '<td class="mono">' + escapeHtml(s.signal_agent_segment_id || "") + '</td>' +
      '<td class="mono">' + (s.coverage_percentage != null ? (s.coverage_percentage * 100).toFixed(1) + "%" : "—") + '</td>' +
      '<td class="mono">' + (s.pricing && s.pricing.cpm != null ? "$" + s.pricing.cpm : "—") + '</td>' +
    '</tr>';
  }).join("");
  host.innerHTML =
    '<div class="orch-fanout-summary">' + summaryCards + '</div>' +
    '<div class="orch-fanout-totals mono">' +
      'Total: <strong>' + signals.length + '</strong> signals across <strong>' + data.agents_succeeded.length + '/' + data.agents_queried.length + '</strong> agents' +
    '</div>' +
    (signals.length > 0
      ? '<div style="overflow:auto;margin-top:10px"><table class="orch-signals-table"><thead><tr><th>Source</th><th>Name</th><th>Segment ID</th><th>Coverage</th><th>CPM</th></tr></thead><tbody>' + signalRows + '</tbody></table>' + (signals.length > 50 ? '<div style="color:var(--text-mut);font-size:11px;padding:6px 0">Showing first 50 of ' + signals.length + '.</div>' : '') + '</div>'
      : '<div class="empty-state" style="margin-top:10px"><div class="empty-desc">No signals returned from any agent. Check the per-agent summary above for per-agent errors.</div></div>');
}

async function runOrchMatrix() {
  if (state.orchestrator.matrixing) return;
  state.orchestrator.matrixing = true;
  var host = document.getElementById("orch-matrix");
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Building capability matrix\u2026</div></div>';
  try {
    var r = await fetch("/agents/capability-matrix?timeout_ms=10000");
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.orchestrator.matrix = data;
    _orchRenderMatrix(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  } finally {
    state.orchestrator.matrixing = false;
  }
}

function _orchRenderMatrix(data) {
  var host = document.getElementById("orch-matrix");
  var agents = data.agents || [];
  var tools = data.tools || [];
  if (agents.length === 0 || tools.length === 0) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">No tools discovered</div><div class="empty-desc">All agents either failed to probe or exposed no tools/list.</div></div>';
    return;
  }
  var headerCells = agents.map(function (a) {
    var title = escapeHtml(a.name) + " — " + (a.alive ? "alive" : "down");
    return '<th class="orch-matrix-agent" title="' + title + '"><div class="orch-matrix-agent-name">' + escapeHtml(a.id) + '</div><div class="orch-matrix-agent-meta mono">' + a.tool_count + ' tools</div></th>';
  }).join("");
  var rows = tools.map(function (t) {
    var cells = agents.map(function (a) {
      var supported = t.supported_by.indexOf(a.id) >= 0;
      return '<td class="' + (supported ? "orch-matrix-yes" : "orch-matrix-no") + '">' + (supported ? "●" : "") + '</td>';
    }).join("");
    return '<tr><td class="orch-matrix-tool mono">' + escapeHtml(t.tool) + '</td>' + cells + '</tr>';
  }).join("");
  var uniqueSummary = agents.filter(function (a) { return a.unique_tools && a.unique_tools.length > 0; }).map(function (a) {
    return '<div class="orch-matrix-unique-row"><span class="pill pill-accent mono" style="font-size:10px">' + escapeHtml(a.id) + '</span> <span class="mono" style="font-size:11px">' + escapeHtml(a.unique_tools.join(", ").slice(0, 100)) + '</span></div>';
  }).join("");
  host.innerHTML =
    '<div style="overflow:auto"><table class="orch-matrix-table"><thead><tr><th class="orch-matrix-tool-header">Tool</th>' + headerCells + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (uniqueSummary ? '<div style="margin-top:10px"><div class="lab-label">Unique tools per agent</div>' + uniqueSummary + '</div>' : '') +
    '<div style="font-size:11px;color:var(--text-mut);margin-top:8px">' + tools.length + ' tools across ' + agents.length + ' agents.</div>';
}

// ─── Workflow (Sec-48f + 48g: streaming progressive reveal) ──────────────
// Sec-48g: swap one-shot fetch for NDJSON-streaming. The server emits
// workflow_start / stage_start / agent_start / agent_complete /
// stage_complete / workflow_complete events as each piece lands. UI
// paints each event as it arrives — timeline cells pulse, agent cards
// fade in, the chosen signal IDs + product IDs animate into the
// stage-4 payload. Non-streaming /agents/workflow/run stays available
// for programmatic callers; the UI always uses the streaming variant.

var _wfRunning = false;
var _wfState = null;  // rebuilt on each run; see _wfNewState().

`;
