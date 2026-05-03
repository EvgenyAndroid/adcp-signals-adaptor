// src/demo/script/fragments/tool-log.ts
//
// Tool log polling + row render + expander wiring.
//
// Source range (in pre-refactor src/demo/script.ts): lines 4114..4227 (114 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const toolLogJs = `function startToolLogPolling() {
  if (state.toolLog.paused) return;
  loadToolLog();
  if (state.toolLog.pollTimer) return;
  state.toolLog.pollTimer = setInterval(loadToolLog, 5_000);
}
function stopToolLogPolling() {
  if (state.toolLog.pollTimer) {
    clearInterval(state.toolLog.pollTimer);
    state.toolLog.pollTimer = null;
  }
}

async function loadToolLog() {
  const tbody = document.getElementById("toollog-tbody");
  try {
    const qs = "?limit=50" + (state.toolLog.filter ? "&tool=" + encodeURIComponent(state.toolLog.filter) : "");
    const res = await fetch("/mcp/recent" + qs);
    const data = await res.json();
    state.toolLog.data = data.entries || [];
    document.getElementById("nav-toollog-count").textContent = String(state.toolLog.data.length);
    const noteEl = document.getElementById("toollog-note");
    const scopeBadge = data.scope === "d1"
      ? '<span class="pill pill-success" style="font-size:10px;margin-right:6px">d1</span>'
      : '<span class="pill pill-warning" style="font-size:10px;margin-right:6px">isolate</span>';
    noteEl.innerHTML = scopeBadge + "ℹ " + escapeHtml(data.note || "");
    if (state.toolLog.data.length === 0) {
      const msg = state.toolLog.filter
        ? 'No <code>' + escapeHtml(state.toolLog.filter) + '</code> calls in the window.'
        : 'No tool calls recorded yet. Trigger one from Discover or via <code>curl /mcp</code>.';
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">' + msg + '</td></tr>';
      return;
    }
    tbody.innerHTML = state.toolLog.data.flatMap((entry, i) => renderToolLogRow(entry, i)).join("");
    wireToolLogExpanders();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty" style="color:var(--error)">' + escapeHtml(e.message) + '</td></tr>';
  }
}

function renderToolLogRow(entry, idx) {
  const when = fmtTime(entry.ts);
  // Argument chips — prefer the arg KEYS from the in-memory record, fall
  // back to parsing the D1 arguments_json when the D1 backend supplies
  // the full payload. Either way the display stays tight.
  let argChips;
  if (Array.isArray(entry.argKeys) && entry.argKeys.length) {
    argChips = entry.argKeys;
  } else if (typeof entry.argumentsJson === "string") {
    try {
      const parsed = JSON.parse(entry.argumentsJson);
      argChips = parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 6) : [];
    } catch { argChips = []; }
  } else { argChips = []; }
  const argPill = argChips.length
    ? argChips.map((k) => '<span class="pill pill-muted mono" style="font-size:10.5px">' + escapeHtml(k) + '</span>').join(" ")
    : '<span style="color:var(--text-mut);font-size:11.5px">—</span>';
  const latencyClass = entry.latencyMs > 1500 ? "color:var(--error)" : entry.latencyMs > 500 ? "color:var(--warning)" : "";
  const bytes = entry.responseBytes != null ? fmtNumber(entry.responseBytes) + "B" : "—";
  const callerPill = entry.caller === "authed"
    ? '<span class="pill pill-accent">authed</span>'
    : '<span class="pill pill-muted">unauth</span>';
  const statusPill = entry.ok
    ? '<span class="pill pill-success">ok</span>'
    : '<span class="pill" style="background:var(--error-dim);color:var(--error)">' + escapeHtml((entry.errorKind || "error").split(":")[0]) + '</span>';
  const rowKey = entry.id || String(idx);
  const expanded = state.toolLog.expanded.has(rowKey);
  const rows = [
    '<tr class="toollog-row" data-key="' + escapeHtml(rowKey) + '" style="cursor:pointer">' +
      '<td class="td-time">' + escapeHtml(when) + '</td>' +
      '<td class="td-name" style="font-family:var(--font-mono);font-size:12.5px">' + escapeHtml(entry.tool || "") + '</td>' +
      '<td style="font-size:11px">' + argPill + '</td>' +
      '<td class="td-numeric" style="' + latencyClass + '">' + (entry.latencyMs ?? "—") + ' ms</td>' +
      '<td class="td-numeric">' + bytes + '</td>' +
      '<td>' + callerPill + '</td>' +
      '<td>' + statusPill + '</td>' +
    '</tr>',
  ];
  if (expanded) {
    const argsJson = entry.argumentsJson || JSON.stringify(entry.argKeys ? { keys: entry.argKeys } : {}, null, 2);
    let pretty;
    try { pretty = JSON.stringify(JSON.parse(argsJson), null, 2); }
    catch { pretty = argsJson; }
    const errorBlock = !entry.ok && entry.errorKind
      ? '<div style="color:var(--error);margin-bottom:8px;font-family:var(--font-mono);font-size:11.5px">✗ ' + escapeHtml(entry.errorKind) + '</div>'
      : "";
    rows.push(
      '<tr class="toollog-expanded"><td colspan="7" style="background:var(--bg-raised);padding:14px 18px">' +
        errorBlock +
        '<div style="font-size:10.5px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Arguments</div>' +
        '<pre class="caps-raw-json" style="max-height:320px;margin:0">' + highlightJson(pretty) + '</pre>' +
      '</td></tr>',
    );
  }
  return rows;
}

function wireToolLogExpanders() {
  document.querySelectorAll(".toollog-row").forEach((row) => {
    row.addEventListener("click", () => {
      const key = row.dataset.key;
      if (state.toolLog.expanded.has(key)) state.toolLog.expanded.delete(key);
      else state.toolLog.expanded.add(key);
      // Re-render without refetching — just rebuild the body from cached data
      const tbody = document.getElementById("toollog-tbody");
      tbody.innerHTML = state.toolLog.data.flatMap((e, i) => renderToolLogRow(e, i)).join("");
      wireToolLogExpanders();
    });
  });
}

// Sec-38 B7 — Dev kit tab (C5 sandbox keys + C7 SDK snippets)
var _devkitLang = "typescript";
var _devkitKeyShown = false;
`;
