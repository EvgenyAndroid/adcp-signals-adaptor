// src/demo/script/fragments/explain-badges.ts
//
// Explain decision badges: small inline badges that surface decision reasoning.
//
// Source range (in pre-refactor src/demo/script.ts): lines 11160..11303 (144 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const explainBadgesJs = `function _explainBadge(topic, decision) {
  // Returns the HTML for an inline "?" badge. Caller is responsible
  // for wiring the click handler post-innerHTML via the data attrs.
  var key = "ex_" + Math.random().toString(36).slice(2, 8);
  if (!window._explainPayloads) window._explainPayloads = {};
  window._explainPayloads[key] = { topic: topic, decision: decision };
  return '<button class="explain-badge mono" data-explain-key="' + escapeHtml(key) + '" title="Explain this decision">?</button>';
}

document.addEventListener("click", function (e) {
  var t = e.target;
  if (!t || !t.closest) return;
  var btn = t.closest(".explain-badge");
  if (!btn) return;
  var key = btn.getAttribute("data-explain-key");
  if (!key || !window._explainPayloads || !window._explainPayloads[key]) return;
  var payload = window._explainPayloads[key];
  _showExplainModal(payload.topic, payload.decision);
});

async function _showExplainModal(topic, decision) {
  var existing = document.getElementById("explain-modal");
  if (existing) existing.remove();
  var modal = document.createElement("div");
  modal.id = "explain-modal";
  modal.className = "explain-modal";
  modal.innerHTML =
    '<div class="explain-modal-inner">' +
      '<div class="explain-modal-head">' +
        '<span class="mono">explain · ' + escapeHtml(topic) + '</span>' +
        '<button class="explain-modal-close" id="explain-modal-close">×</button>' +
      '</div>' +
      '<div class="explain-modal-body" id="explain-modal-body">' +
        '<span class="orch-small">asking the orchestrator…</span>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  document.getElementById("explain-modal-close").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
  try {
    var r = await fetch("/agentic/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: topic, decision: decision }) });
    var d = await r.json();
    var body = document.getElementById("explain-modal-body");
    if (!body) return;
    body.innerHTML =
      '<div class="explain-mode-pill mono">' + escapeHtml(d.mode || "?") + (d.model ? " · " + escapeHtml(d.model) : "") + (d.latency_ms ? " · " + d.latency_ms + "ms" : "") + '</div>' +
      '<div class="explain-text">' + escapeHtml(d.explanation || "no explanation returned") + '</div>' +
      '<details style="margin-top:8px"><summary class="orch-small" style="cursor:pointer">decision payload</summary><pre class="wf-json mono" style="max-height:200px;overflow:auto;font-size:10.5px">' + escapeHtml(JSON.stringify(decision, null, 2).slice(0, 1500)) + '</pre></details>';
  } catch (e) {
    var b = document.getElementById("explain-modal-body");
    if (b) b.innerHTML = '<span class="orch-small" style="color:var(--error)">' + escapeHtml(String((e && e.message) || e)) + '</span>';
  }
}

// ─────────────────────────────────────────────────────────────────
// Agentic Canvas — chat-first orchestrator
// ─────────────────────────────────────────────────────────────────

var _agenticCurrent = null;
var _agenticTrace = [];
var _agenticInitialized = false;

async function _agenticInit() {
  if (_agenticInitialized) return;
  _agenticInitialized = true;
  // Wire input + suggestions
  var input = document.getElementById("agentic-input");
  var submit = document.getElementById("agentic-submit-btn");
  if (submit) submit.addEventListener("click", _agenticSubmit);
  if (input) {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); _agenticSubmit(); }
    });
  }
  document.querySelectorAll(".agentic-sugg").forEach(function (b) {
    b.addEventListener("click", function () {
      var p = b.getAttribute("data-prompt");
      if (p && input) { input.value = p; _agenticSubmit(); }
    });
  });
  // Probe mode
  try {
    // Cheap mode probe: hit the expand endpoint with a minimal input.
    var r = await fetch("/agentic/brief/expand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: "test" }) });
    var d = await r.json();
    var pill = document.getElementById("agentic-mode-pill");
    if (pill) {
      pill.textContent = d.mode === "live" ? "live · Claude" : "template mode · no API key";
      pill.className = "pill mono " + (d.mode === "live" ? "pill-success" : "pill-muted") + " agentic-mode-pill";
      pill.style.fontSize = "9.5px"; pill.style.marginLeft = "8px"; pill.style.letterSpacing = "0.04em";
    }
  } catch (e) { /* noop */ }
}

async function _agenticSubmit() {
  var input = document.getElementById("agentic-input");
  if (!input || !input.value.trim()) return;
  var brief = input.value.trim();
  _agenticTrace = [];
  _agenticCurrent = { plan: null };
  _agenticUpdateTrace();

  // Pre-render skeletons for every section so the user sees a SHAPE
  // immediately and watches each fill in. Each card pulses while
  // its stage is in-flight; fades to solid + slides into place when
  // its data arrives.
  _agenticShowSkeleton("brief", "Brief expanded");
  _agenticShowSkeleton("plan", "Execution plan");
  _agenticShowSkeleton("compliance", "Governance + remediation");
  _agenticShowSkeleton("memory", "Memory");
  document.getElementById("agentic-exec-section").style.display = "none";

  var btn = document.getElementById("agentic-submit-btn");
  if (btn) { btn.disabled = true; btn.querySelector("span").textContent = "thinking…"; }

  try {
    var resp = await fetch("/agentic/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: brief }) });
    if (!resp.body) throw new Error("no stream body");
    var reader = resp.body.getReader();
    var dec = new TextDecoder();
    var buffer = "";
    while (true) {
      var read = await reader.read();
      if (read.done) break;
      buffer += dec.decode(read.value, { stream: true });
      var lines = buffer.split("\\n");
      buffer = lines.pop() || "";
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li].trim();
        if (!line) continue;
        var ev = null;
        try { ev = JSON.parse(line); } catch (e) { continue; }
        _agenticHandleStreamEvent(ev);
      }
    }
  } catch (e) {
    showToast("agentic chat failed: " + ((e && e.message) || e), true);
  } finally {
    if (btn) { btn.disabled = false; btn.querySelector("span").textContent = "Plan"; }
  }
}

// Render an empty skeleton pulse for a section. Shown while the
// corresponding stage is in-flight.
`;
