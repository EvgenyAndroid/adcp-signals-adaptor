// src/demo/script/fragments/activations.ts
//
// Activations polling + row render + time formatting.
//
// Source range (in pre-refactor src/demo/script.ts): lines 4032..4113 (82 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const activationsJs = `function startActivationsPolling() {
  loadActivations();
  if (state.activations.pollTimer) return;
  state.activations.pollTimer = setInterval(loadActivations, 10_000);
}
function stopActivationsPolling() {
  if (state.activations.pollTimer) {
    clearInterval(state.activations.pollTimer);
    state.activations.pollTimer = null;
  }
}

async function loadActivations() {
  const tbody = document.getElementById("activations-tbody");
  try {
    const res = await fetch("/operations?limit=100", {
      headers: { "Authorization": "Bearer " + DEMO_KEY },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
    state.activations.data = data.operations || [];
    document.getElementById("nav-activations-count").textContent = String(data.count || 0);
    if (state.activations.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No activations yet. Activate a signal from any tab to see it here.</td></tr>';
      return;
    }
    tbody.innerHTML = state.activations.data.map(renderActivationRow).join("");
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty" style="color:var(--error)">' + escapeHtml(e.message) + '</td></tr>';
  }
}

function renderActivationRow(op) {
  const submittedAt = fmtTime(op.submittedAt);
  const completedAt = op.completedAt ? fmtTime(op.completedAt) : "—";
  const statusClass = (op.status || "submitted").toLowerCase();
  // {} button → opens the signals trace viewer filtered to THIS row's
  // activation. We pass both signal_id and operation_id (= task_id in
  // the trace's response payload) so the viewer can match a single
  // trace exactly. The previous behaviour swallowed the row id and
  // always opened the same "all activate_signal" view, making every
  // click look identical — fixed by threading data-trace-task-id
  // through the click handler.
  const sigId = (op.signalId || "").replace(/"/g, "&quot;");
  const opId = (op.operationId || "").replace(/"/g, "&quot;");
  return '' +
    '<tr>' +
      '<td class="td-name">' +
        '<div>' + escapeHtml(op.signalName || "(unknown signal)") + '</div>' +
        '<span class="signal-id">' + escapeHtml(op.signalId || "") + '</span>' +
      '</td>' +
      '<td class="td-vertical">' + escapeHtml(op.destination || "—") + '</td>' +
      '<td><span class="status-dot ' + statusClass + '"></span><span style="font-size:12.5px;text-transform:capitalize">' + escapeHtml(op.status || "") + '</span></td>' +
      '<td class="td-time">' + escapeHtml(submittedAt) + '</td>' +
      '<td class="td-time">' + escapeHtml(completedAt) + '</td>' +
      '<td class="td-time">' + (op.webhookFired ? '<span style="color:var(--success)">fired</span>' : (op.webhookUrl ? 'queued' : '—')) + '</td>' +
      '<td class="td-time" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml((op.operationId || "").slice(0, 24)) + '</td>' +
      '<td class="td-time">' +
        '<button class="btn-secondary btn-mini" data-poll-task-id="' + opId + '" data-poll-row-id="' + opId + '" title="Fire get_operation_status against this task. Records a trace under tool=get_operation_status — useful to demo the poll-loop story (the spec\\'s signed-receipt audit trail).">🔍 Poll</button> ' +
        '<button class="btn-secondary btn-mini" data-trace-activation="' + sigId + '" data-trace-task-id="' + opId + '" title="View signal request/response JSON for this activation">{ } JSON</button>' +
      '</td>' +
    '</tr>';
}

// Wire the {} JSON button to open the shared signals trace viewer.
// Uses event delegation so newly-rendered rows pick up the handler.
document.addEventListener("click", function (e) {
  const t = e.target;
  if (!t || !t.matches || !t.matches("[data-trace-activation]")) return;
  const sigId = t.getAttribute("data-trace-activation");
  const taskId = t.getAttribute("data-trace-task-id");
  if (typeof window.openSignalTraceModal !== "function") return;
  // Pass task_id as the primary filter so the viewer can pinpoint the
  // single activate_signal trace whose response.payload.task_id ===
  // this row's operation_id. signal_id is a secondary filter (handles
  // the legacy case where task_id wasn't captured).
  window.openSignalTraceModal({
    tool: "activate_signal",
    task_id: taskId || undefined,
    signal_id: sigId || undefined,
    limit: 25,
  });
});

// Wire the 🔍 Poll button — fires get_operation_status via callTool so
// the request goes through /mcp and produces a trace the audience can
// inspect. Without this, the only path that produces get_operation_status
// traces is the Detail-Panel activation poll loop (detail-panel.ts), which
// requires a fresh Activate click in the current session. The Poll button
// lets the workshop replay the receipt-audit story on any existing row.
document.addEventListener("click", async function (e) {
  const t = e.target;
  if (!t || !t.matches || !t.matches("[data-poll-task-id]")) return;
  const taskId = t.getAttribute("data-poll-task-id");
  if (!taskId) return;
  const orig = t.textContent;
  t.disabled = true;
  t.textContent = "🔍 polling…";
  try {
    const result = await callTool("get_operation_status", { task_id: taskId });
    const newStatus = (result && (result.status || (result.ext && result.ext.status))) || "unknown";
    t.textContent = "🔍 " + newStatus;
    // Re-color the button briefly to show what came back
    t.classList.add("poll-flash");
    setTimeout(function () {
      t.textContent = orig;
      t.classList.remove("poll-flash");
      t.disabled = false;
    }, 2400);
    // Trigger a row refresh so the status pill matches what the poll
    // returned (the in-memory activation may be stale until next /operations).
    if (typeof loadActivations === "function") loadActivations();
  } catch (err) {
    t.textContent = "🔍 ✗";
    setTimeout(function () { t.textContent = orig; t.disabled = false; }, 2400);
    if (typeof showToast === "function") showToast("Poll failed: " + (err && err.message ? err.message : err), true);
  }
});

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + "h ago";
    return d.toISOString().slice(0, 16).replace("T", " ");
  } catch { return iso; }
}

//────────────────────────────────────────────────────────────────────────
// §7 MCP Tool Log — poll GET /mcp/recent every 5s while tab visible
//────────────────────────────────────────────────────────────────────────
document.getElementById("toollog-refresh").addEventListener("click", loadToolLog);
document.getElementById("toollog-filter").addEventListener("change", (e) => {
  state.toolLog.filter = e.target.value || "";
  state.toolLog.expanded.clear();
  loadToolLog();
});
document.getElementById("toollog-pause").addEventListener("click", () => {
  state.toolLog.paused = !state.toolLog.paused;
  document.getElementById("toollog-pause-label").textContent = state.toolLog.paused ? "Resume" : "Pause";
  if (state.toolLog.paused) stopToolLogPolling();
  else startToolLogPolling();
});

`;
