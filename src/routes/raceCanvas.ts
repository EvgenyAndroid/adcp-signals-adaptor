// src/routes/raceCanvas.ts
//
// Wave 6 — Race Canvas HTML page (served at /race-canvas).
//
// Self-contained single-page UI for the vendor race waterfall demo.
// Lives in its own route (not embedded in demo.ts) to keep the SCRIPT_TAG
// escape blast radius small — none of demo.ts's existing JS is touched.
//
// Three features stack on this one page:
//   1. Vendor race waterfall (live progress bars per vendor)
//   2. Disagreement halo (SVG arc connecting conflicting rows)
//   3. Add-vendor mid-flight (chat-style input that appends a new row)
// Plus an Audit Receipt sidebar that fills in real-time.
//
// Escape-trap discipline (see feedback_script_tag_template_trap.md):
//   - All JS strings inside this file's template literal use DOUBLE QUOTES
//   - No regex literals — string.indexOf / split instead
//   - No backticks inside the embedded JS (string concat with +)
//   - For escape sequences in served JS: write \\n / \\t / \\' (doubled)
//   - Every change here must pass tmp-mining/trap_audit.py before commit
//
// Auth: public (path is in publicPaths). DEMO_API_KEY is injected so the
// fetch calls can include it as a Bearer token if any endpoint becomes
// auth-gated later.

export function handleRaceCanvas(env: { DEMO_API_KEY: string }): Response {
  return new Response(renderRaceCanvas(env.DEMO_API_KEY), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; connect-src 'self';",
    },
  });
}

function renderRaceCanvas(demoKey: string): string {
  const safeKey = JSON.stringify(demoKey);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Race Canvas — Vendor Orchestration</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='2' fill='%2338b6ff'/%3E%3Ccircle cx='8' cy='8' r='5' fill='none' stroke='%2338b6ff' stroke-width='0.8' opacity='0.6'/%3E%3C/svg%3E"/>
<style>
  :root {
    --bg: #0a0d12;
    --bg-elevated: #11161e;
    --bg-panel: #161c26;
    --border: #232b38;
    --border-strong: #2e3947;
    --text: #e6ebf2;
    --text-dim: #8a95a8;
    --text-faint: #5b6679;
    --accent: #38b6ff;
    --accent-glow: rgba(56, 182, 255, 0.35);
    --warn: #f0b400;
    --warn-glow: rgba(240, 180, 0, 0.4);
    --block: #ff4d5e;
    --block-glow: rgba(255, 77, 94, 0.45);
    --ok: #2ed573;
    --font-mono: "JetBrains Mono", "SF Mono", Consolas, Menlo, monospace;
    --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background: var(--bg);
    color: var(--text);
    font: 14px/1.5 var(--font-ui);
    overflow-x: hidden;
  }
  .app {
    display: grid;
    grid-template-columns: 1fr 380px;
    grid-template-rows: auto 1fr;
    height: 100vh;
    gap: 0;
  }
  .header {
    grid-column: 1 / -1;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elevated);
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .header-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.01em;
  }
  .header-title .accent { color: var(--accent); }
  .header-sub {
    font: 12px/1.4 var(--font-mono);
    color: var(--text-faint);
  }
  .header-back {
    color: var(--text-dim);
    text-decoration: none;
    font-size: 13px;
    border: 1px solid var(--border);
    padding: 6px 12px;
    border-radius: 6px;
    transition: all 0.15s;
  }
  .header-back:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .header-spacer { flex: 1; }
  .main {
    overflow-y: auto;
    padding: 24px;
    position: relative;
  }
  .sidebar {
    border-left: 1px solid var(--border);
    background: var(--bg-elevated);
    overflow-y: auto;
    padding: 20px;
  }

  /* ── Brief input + control bar ─────────────────────────────────────── */
  .controls {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 20px;
  }
  .controls-row {
    display: flex;
    gap: 12px;
    align-items: stretch;
  }
  .controls-label {
    font: 11px/1.4 var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    margin-bottom: 6px;
  }
  .brief-input {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 10px 14px;
    border-radius: 6px;
    font: 13px/1.4 var(--font-ui);
    transition: border-color 0.15s;
  }
  .brief-input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .btn {
    background: var(--accent);
    color: #0a0d12;
    border: none;
    padding: 10px 18px;
    border-radius: 6px;
    font: 600 13px var(--font-ui);
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn:hover { filter: brightness(1.1); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-ghost {
    background: transparent;
    border: 1px solid var(--border-strong);
    color: var(--text);
  }
  .btn-ghost:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* ── Vendor waterfall ──────────────────────────────────────────────── */
  .race-board {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px;
    position: relative;
  }
  .race-board-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }
  .race-board-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .race-board-meta {
    font: 11px/1.4 var(--font-mono);
    color: var(--text-faint);
  }
  .vendor-rows {
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
    min-height: 100px;
  }
  .vendor-row {
    display: grid;
    grid-template-columns: 200px 1fr 280px;
    gap: 16px;
    align-items: center;
    padding: 12px 14px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    position: relative;
    transition: all 0.3s;
    opacity: 0;
    animation: fadeInRow 0.35s ease-out forwards;
  }
  @keyframes fadeInRow {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .vendor-row.is-conflict {
    border-color: var(--block);
    box-shadow: 0 0 0 1px var(--block-glow), 0 0 20px var(--block-glow);
  }
  .vendor-row.is-warn {
    border-color: var(--warn);
    box-shadow: 0 0 0 1px var(--warn-glow), 0 0 16px var(--warn-glow);
  }
  .vendor-name {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .vendor-name-primary {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .vendor-name-secondary {
    font: 11px/1 var(--font-mono);
    color: var(--text-faint);
  }
  .vendor-progress {
    height: 8px;
    background: var(--bg-elevated);
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }
  .vendor-progress-fill {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    background: linear-gradient(90deg, var(--accent), #6dd5ff);
    border-radius: 4px;
    width: 0;
    transition: width 0.4s ease-out;
  }
  .vendor-progress-fill.is-done {
    background: linear-gradient(90deg, var(--ok), #5eea96);
  }
  .vendor-progress-fill.is-failed {
    background: linear-gradient(90deg, var(--block), #ff7a87);
  }
  .vendor-stage-label {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    font: 10px/1 var(--font-mono);
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .vendor-response {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 12px;
    font: 11px/1.4 var(--font-mono);
  }
  .vendor-response-k { color: var(--text-faint); }
  .vendor-response-v { color: var(--text); text-align: right; }
  .vendor-response-v.warn { color: var(--warn); }
  .vendor-response-v.block { color: var(--block); }
  .vendor-response-empty {
    color: var(--text-faint);
    font-style: italic;
    text-align: right;
  }

  /* ── Disagreement halo overlay ─────────────────────────────────────── */
  .halo-overlay {
    position: absolute;
    top: 0; left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10;
  }
  .halo-callout {
    position: absolute;
    background: rgba(255, 77, 94, 0.95);
    color: #0a0d12;
    padding: 10px 14px;
    border-radius: 8px;
    font: 600 12px var(--font-ui);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.15), 0 12px 32px rgba(255, 77, 94, 0.4);
    max-width: 320px;
    z-index: 11;
    pointer-events: auto;
    animation: pulseCallout 2.5s ease-in-out infinite;
  }
  .halo-callout.warn {
    background: rgba(240, 180, 0, 0.95);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.15), 0 12px 32px rgba(240, 180, 0, 0.4);
  }
  .halo-callout.minor {
    background: rgba(56, 182, 255, 0.95);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.15), 0 12px 32px rgba(56, 182, 255, 0.4);
  }
  .halo-callout-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.7;
    margin-bottom: 4px;
  }
  .halo-callout-body {
    font-size: 13px;
    line-height: 1.4;
  }
  .halo-callout-reconcile {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(0,0,0,0.2);
    font-size: 11px;
    line-height: 1.4;
  }
  @keyframes pulseCallout {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
  }

  /* ── Receipt sidebar ───────────────────────────────────────────────── */
  .sidebar-title {
    font: 11px/1 var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-bottom: 4px;
  }
  .sidebar-sub {
    font-size: 13px;
    color: var(--text);
    margin-bottom: 18px;
  }
  .receipt-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .receipt-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 12px;
    cursor: pointer;
    transition: all 0.15s;
    opacity: 0;
    animation: fadeInRow 0.3s ease-out forwards;
  }
  .receipt-card:hover {
    border-color: var(--accent);
    transform: translateX(-2px);
  }
  .receipt-card-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .receipt-card-row + .receipt-card-row { margin-top: 4px; }
  .receipt-card-vendor {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }
  .receipt-card-meta {
    font: 10px/1 var(--font-mono);
    color: var(--text-faint);
  }
  .receipt-card-action {
    font: 10px/1 var(--font-mono);
    color: var(--accent);
  }
  .receipt-card-pill {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--ok);
    color: #0a0d12;
    font: 600 9px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .receipt-card-empty {
    color: var(--text-faint);
    font-size: 13px;
    font-style: italic;
    padding: 16px 0;
    text-align: center;
  }

  /* ── Receipt modal ─────────────────────────────────────────────────── */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .modal-backdrop.is-open { display: flex; }
  .modal {
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    padding: 24px;
    width: 90%;
    max-width: 720px;
    max-height: 80vh;
    overflow-y: auto;
  }
  .modal-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .modal-sub {
    font: 11px/1.4 var(--font-mono);
    color: var(--text-faint);
    margin-bottom: 16px;
  }
  .modal-section {
    margin-top: 14px;
  }
  .modal-section-title {
    font: 11px/1 var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-bottom: 6px;
  }
  .modal pre {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px;
    font: 11px/1.5 var(--font-mono);
    color: var(--text);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .modal-close {
    position: absolute;
    top: 16px;
    right: 16px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font: 11px var(--font-mono);
  }

  /* ── Add-vendor bar ────────────────────────────────────────────────── */
  .add-vendor-bar {
    margin-top: 24px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .add-vendor-bar.is-disabled { opacity: 0.4; pointer-events: none; }
  .add-vendor-label {
    font: 11px/1 var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
  }
  .add-vendor-select {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 12px;
    border-radius: 6px;
    font: 13px var(--font-ui);
  }

  /* ── Reconcile chat ────────────────────────────────────────────────── */
  .reconcile-chat {
    margin-top: 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
    display: none;
  }
  .reconcile-chat.is-active { display: block; }
  .reconcile-chat-title {
    font: 11px/1 var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin-bottom: 6px;
  }
  .reconcile-chat-body {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
  }
  .reconcile-chat-body em {
    color: var(--text-dim);
    font-style: italic;
  }

  /* ── Empty state ───────────────────────────────────────────────────── */
  .empty-state {
    color: var(--text-faint);
    font-size: 13px;
    text-align: center;
    padding: 40px 20px;
  }
</style>
</head>
<body>

<div class="app">
  <header class="header">
    <a class="header-back" href="/">&larr; Back to Signals</a>
    <div>
      <div class="header-title">Race <span class="accent">Canvas</span></div>
      <div class="header-sub">multi-agent orchestration / disagreement halo / audit receipts</div>
    </div>
    <div class="header-spacer"></div>
    <div class="header-sub">May 7 workshop / iHeartMedia</div>
  </header>

  <main class="main">
    <div class="controls">
      <div class="controls-label">Brief</div>
      <div class="controls-row">
        <input id="brief-input" class="brief-input" placeholder="e.g., Coca-Cola Summer Refresh, $250K, 30 days, ROAS 3.5x" value="Coca-Cola Summer Refresh, $250K, 30 days, ROAS 3.5x"/>
        <button id="btn-start" class="btn">Start race</button>
        <button id="btn-clear" class="btn btn-ghost">Clear</button>
      </div>
    </div>

    <div class="race-board" id="race-board">
      <div class="race-board-header">
        <div class="race-board-title">Vendor Race Waterfall</div>
        <div class="race-board-meta" id="race-meta">awaiting brief...</div>
      </div>
      <div class="vendor-rows" id="vendor-rows">
        <div class="empty-state">Click "Start race" to fan out across 6 vendors.</div>
      </div>
      <svg class="halo-overlay" id="halo-overlay"></svg>
    </div>

    <div class="reconcile-chat" id="reconcile-chat">
      <div class="reconcile-chat-title">Claude reconciles</div>
      <div class="reconcile-chat-body" id="reconcile-body"></div>
    </div>

    <div class="add-vendor-bar is-disabled" id="add-vendor-bar">
      <div class="add-vendor-label">Add vendor:</div>
      <select id="add-vendor-select" class="add-vendor-select" disabled>
        <option value="">— start a race first —</option>
      </select>
      <button id="btn-add-vendor" class="btn" disabled>Add</button>
    </div>
  </main>

  <aside class="sidebar">
    <div class="sidebar-title">Audit Receipt Stack</div>
    <div class="sidebar-sub">Every agent call gets a receipt. Click to inspect.</div>
    <div class="receipt-list" id="receipt-list">
      <div class="receipt-card-empty">No receipts yet — start a race to populate.</div>
    </div>
  </aside>
</div>

<div class="modal-backdrop" id="modal-backdrop">
  <div class="modal">
    <div class="modal-title" id="modal-title">Receipt</div>
    <div class="modal-sub" id="modal-sub"></div>
    <button class="modal-close" id="modal-close">close</button>
    <div class="modal-section">
      <div class="modal-section-title">Hashes</div>
      <pre id="modal-hashes"></pre>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Input</div>
      <pre id="modal-input"></pre>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Output</div>
      <pre id="modal-output"></pre>
    </div>
  </div>
</div>

<script>
(function(){
  "use strict";
  var DEMO_KEY = ${safeKey};
  var state = {
    raceId: null,
    briefInput: "",
    vendors: [],
    responses: [],
    receipts: [],
    rowsByVendor: {},
    raceComplete: false
  };

  // ── DOM refs ────────────────────────────────────────────────────────
  var elBriefInput = document.getElementById("brief-input");
  var elBtnStart = document.getElementById("btn-start");
  var elBtnClear = document.getElementById("btn-clear");
  var elRows = document.getElementById("vendor-rows");
  var elReceipts = document.getElementById("receipt-list");
  var elRaceMeta = document.getElementById("race-meta");
  var elHalo = document.getElementById("halo-overlay");
  var elReconcileChat = document.getElementById("reconcile-chat");
  var elReconcileBody = document.getElementById("reconcile-body");
  var elAddBar = document.getElementById("add-vendor-bar");
  var elAddSelect = document.getElementById("add-vendor-select");
  var elAddBtn = document.getElementById("btn-add-vendor");
  var elModalBackdrop = document.getElementById("modal-backdrop");
  var elModalTitle = document.getElementById("modal-title");
  var elModalSub = document.getElementById("modal-sub");
  var elModalClose = document.getElementById("modal-close");
  var elModalHashes = document.getElementById("modal-hashes");
  var elModalInput = document.getElementById("modal-input");
  var elModalOutput = document.getElementById("modal-output");

  // ── Number formatting ──────────────────────────────────────────────
  function fmtAudience(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(0) + "K";
    return String(n);
  }
  function fmtFloor(cents) {
    return "$" + (cents / 100).toFixed(2);
  }

  // ── Render helpers ─────────────────────────────────────────────────
  function renderEmptyRows(vendors) {
    elRows.innerHTML = "";
    state.rowsByVendor = {};
    vendors.forEach(function(v) {
      var row = document.createElement("div");
      row.className = "vendor-row";
      row.setAttribute("data-vendor-id", v.id);
      row.innerHTML =
        "<div class=\\"vendor-name\\">" +
        "  <div class=\\"vendor-name-primary\\">" + escapeHtml(v.name) + "</div>" +
        "  <div class=\\"vendor-name-secondary\\">" + escapeHtml(v.vendor) + " &middot; " + escapeHtml(v.role) + "</div>" +
        "</div>" +
        "<div class=\\"vendor-progress\\">" +
        "  <div class=\\"vendor-progress-fill\\" data-fill></div>" +
        "  <div class=\\"vendor-stage-label\\" data-stage>queued</div>" +
        "</div>" +
        "<div class=\\"vendor-response\\" data-response>" +
        "  <span class=\\"vendor-response-k\\">audience</span><span class=\\"vendor-response-empty\\">—</span>" +
        "  <span class=\\"vendor-response-k\\">sensitivity</span><span class=\\"vendor-response-empty\\">—</span>" +
        "  <span class=\\"vendor-response-k\\">bid floor</span><span class=\\"vendor-response-empty\\">—</span>" +
        "  <span class=\\"vendor-response-k\\">governance</span><span class=\\"vendor-response-empty\\">—</span>" +
        "</div>";
      elRows.appendChild(row);
      state.rowsByVendor[v.id] = row;
    });
  }

  function updateVendorStage(vendorId, stage) {
    var row = state.rowsByVendor[vendorId];
    if (!row) return;
    var fill = row.querySelector("[data-fill]");
    var label = row.querySelector("[data-stage]");
    if (!fill || !label) return;
    if (stage === "probing") {
      fill.style.width = "20%";
      label.textContent = "probing";
    } else if (stage === "calling") {
      fill.style.width = "60%";
      label.textContent = "calling";
    } else if (stage === "responded") {
      fill.style.width = "100%";
      fill.classList.add("is-done");
      label.textContent = "responded";
    }
  }

  function fillVendorResponse(vendorId, resp) {
    var row = state.rowsByVendor[vendorId];
    if (!row) return;
    var box = row.querySelector("[data-response]");
    if (!box) return;
    var sensClass = resp.sensitive_category_verdict === "elevated" ? "warn" : (resp.sensitive_category_verdict === "restricted" ? "block" : "");
    var govClass = resp.governance_outcome === "warn" ? "warn" : (resp.governance_outcome === "block" ? "block" : "");
    box.innerHTML =
      "<span class=\\"vendor-response-k\\">audience</span><span class=\\"vendor-response-v\\">" + fmtAudience(resp.audience_size) + "</span>" +
      "<span class=\\"vendor-response-k\\">sensitivity</span><span class=\\"vendor-response-v " + sensClass + "\\">" + escapeHtml(resp.sensitive_category_verdict) + "</span>" +
      "<span class=\\"vendor-response-k\\">bid floor</span><span class=\\"vendor-response-v\\">" + fmtFloor(resp.recommended_bid_floor_cents) + "</span>" +
      "<span class=\\"vendor-response-k\\">governance</span><span class=\\"vendor-response-v " + govClass + "\\">" + escapeHtml(resp.governance_outcome) + "</span>";
  }

  function appendReceipt(rcpt) {
    if (state.receipts.length === 0) elReceipts.innerHTML = "";
    state.receipts.push(rcpt);
    var card = document.createElement("div");
    card.className = "receipt-card";
    card.innerHTML =
      "<div class=\\"receipt-card-row\\">" +
      "  <div class=\\"receipt-card-vendor\\">" + escapeHtml(rcpt.vendor_name) + "</div>" +
      "  <span class=\\"receipt-card-pill\\">verified</span>" +
      "</div>" +
      "<div class=\\"receipt-card-row\\">" +
      "  <div class=\\"receipt-card-action\\">" + escapeHtml(rcpt.action) + "</div>" +
      "  <div class=\\"receipt-card-meta\\">" + rcpt.latency_ms + "ms</div>" +
      "</div>" +
      "<div class=\\"receipt-card-row\\">" +
      "  <div class=\\"receipt-card-meta\\">in:" + escapeHtml(rcpt.input_hash) + "</div>" +
      "  <div class=\\"receipt-card-meta\\">out:" + escapeHtml(rcpt.output_digest) + "</div>" +
      "</div>";
    card.addEventListener("click", function(){ openReceiptModal(rcpt); });
    elReceipts.appendChild(card);
    elReceipts.scrollTop = elReceipts.scrollHeight;
  }

  function openReceiptModal(rcpt) {
    elModalTitle.textContent = rcpt.vendor_name + " - " + rcpt.action;
    elModalSub.textContent = "receipt " + rcpt.receipt_id + " - " + rcpt.ts;
    var hashLines = [
      "input_hash:        " + rcpt.input_hash,
      "output_digest:     " + rcpt.output_digest,
      "idempotency_key:   " + rcpt.idempotency_key,
      "latency_ms:        " + rcpt.latency_ms,
      "verified:          " + (rcpt.verified ? "true" : "false")
    ];
    elModalHashes.textContent = hashLines.join("\\n");
    elModalInput.textContent = rcpt.inspect ? JSON.stringify(rcpt.inspect.input, null, 2) : "(no input retained)";
    elModalOutput.textContent = rcpt.inspect ? JSON.stringify(rcpt.inspect.output, null, 2) : "(no output retained)";
    elModalBackdrop.classList.add("is-open");
  }
  elModalClose.addEventListener("click", function(){ elModalBackdrop.classList.remove("is-open"); });
  elModalBackdrop.addEventListener("click", function(e){ if (e.target === elModalBackdrop) elModalBackdrop.classList.remove("is-open"); });

  // ── Halo / disagreement rendering ──────────────────────────────────
  // SVG arc connecting two vendor rows. We measure the rows' positions
  // relative to the race-board container and draw a curved path between them.
  function renderHaloArc(disagreement) {
    if (!disagreement.conflict_pair || disagreement.conflict_pair.length < 2) return;
    var rowA = state.rowsByVendor[disagreement.conflict_pair[0].vendor_id];
    var rowB = state.rowsByVendor[disagreement.conflict_pair[1].vendor_id];
    if (!rowA || !rowB) return;
    var board = document.getElementById("race-board");
    var bRect = board.getBoundingClientRect();
    var aRect = rowA.getBoundingClientRect();
    var rRect = rowB.getBoundingClientRect();
    // Anchor points on the LEFT side of each row.
    var ax = aRect.left - bRect.left + 4;
    var ay = aRect.top - bRect.top + aRect.height / 2;
    var bx = rRect.left - bRect.left + 4;
    var by = rRect.top - bRect.top + rRect.height / 2;
    // Curve control point — pulled left of both anchors.
    var cx = Math.min(ax, bx) - 60;
    var cy = (ay + by) / 2;

    var color = disagreement.severity === "blocking" ? "#ff4d5e" :
                disagreement.severity === "material" ? "#f0b400" : "#38b6ff";

    // Draw a path. Use SVG namespace.
    var ns = "http://www.w3.org/2000/svg";
    var pathStr = "M" + ax + "," + ay + " Q" + cx + "," + cy + " " + bx + "," + by;
    var path = document.createElementNS(ns, "path");
    path.setAttribute("d", pathStr);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", "3");
    path.setAttribute("opacity", "0.85");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("filter", "drop-shadow(0 0 8px " + color + ")");
    path.classList.add("halo-arc");
    elHalo.appendChild(path);

    // Mark the conflicting rows with conflict styling.
    rowA.classList.add(disagreement.severity === "blocking" ? "is-conflict" : "is-warn");
    rowB.classList.add(disagreement.severity === "blocking" ? "is-conflict" : "is-warn");

    // Render callout next to the curve control point.
    var callout = document.createElement("div");
    callout.className = "halo-callout " + (disagreement.severity === "minor" ? "minor" : disagreement.severity === "material" ? "warn" : "");
    callout.style.left = Math.max(20, cx - 100) + "px";
    callout.style.top = (cy - 30) + "px";
    callout.innerHTML =
      "<div class=\\"halo-callout-title\\">disagreement &middot; " + escapeHtml(disagreement.severity) + "</div>" +
      "<div class=\\"halo-callout-body\\">" + escapeHtml(disagreement.field_label) + ": " + escapeHtml(disagreement.rationale) + "</div>";
    callout.setAttribute("data-field", disagreement.field);
    board.appendChild(callout);
  }

  function renderReconcile(field, rationale) {
    if (!elReconcileChat.classList.contains("is-active")) {
      elReconcileChat.classList.add("is-active");
      elReconcileBody.innerHTML = "";
    }
    var line = document.createElement("div");
    line.style.marginBottom = "6px";
    line.innerHTML = "<strong>" + escapeHtml(field) + "</strong> &rarr; <em>" + escapeHtml(rationale) + "</em>";
    elReconcileBody.appendChild(line);
  }

  function escapeHtml(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Stream consumer ─────────────────────────────────────────────────
  // Reads NDJSON, parses each line, dispatches to handlers above.
  async function consumeStream(resp) {
    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      var lines = buffer.split("\\n");
      buffer = lines.pop() || "";
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        try {
          var ev = JSON.parse(line);
          handleEvent(ev);
        } catch (err) {
          console.warn("parse failed", line, err);
        }
      }
    }
    if (buffer.trim()) {
      try { handleEvent(JSON.parse(buffer)); } catch (err) { /* ignore */ }
    }
  }

  function handleEvent(ev) {
    switch (ev.event) {
      case "race_started":
        state.raceId = ev.race_id;
        state.briefInput = ev.brief_input;
        state.vendors = ev.vendors;
        renderEmptyRows(ev.vendors);
        elRaceMeta.textContent = "race " + ev.race_id + " - " + ev.vendors.length + " vendors";
        break;
      case "vendor_stage":
        updateVendorStage(ev.vendor_id, ev.stage);
        break;
      case "vendor_response":
        state.responses.push(ev.response);
        fillVendorResponse(ev.vendor_id, ev.response);
        break;
      case "receipt":
        appendReceipt(ev.receipt);
        break;
      case "all_vendors_responded":
        elRaceMeta.textContent = "all " + ev.responses.length + " vendors responded - " + ev.total_latency_ms + "ms - detecting disagreements...";
        break;
      case "disagreement_detected":
        renderHaloArc(ev.disagreement);
        break;
      case "reconcile_started":
        elRaceMeta.textContent = "reconciling " + ev.field_label + "...";
        break;
      case "reconcile_done":
        renderReconcile(ev.field_label, ev.reconcile_rationale);
        // Update the callout to show reconciled value.
        var existing = document.querySelector("[data-field=\\"" + ev.field + "\\"]");
        if (existing) {
          var rec = document.createElement("div");
          rec.className = "halo-callout-reconcile";
          rec.textContent = "reconciled: " + ev.reconcile_rationale;
          existing.appendChild(rec);
        }
        break;
      case "race_complete":
        state.raceComplete = true;
        elRaceMeta.textContent = "race complete - " + ev.summary.disagreement_count + " disagreement(s) reconciled, " + ev.summary.receipt_count + " receipts";
        elBtnStart.disabled = false;
        elBtnStart.textContent = "Run again";
        // Enable add-vendor flow.
        loadAvailableVendors();
        break;
      case "error":
        console.error("server error", ev.error);
        elRaceMeta.textContent = "error: " + ev.error;
        elBtnStart.disabled = false;
        break;
      default:
        // No-op for unknown events — forward-compatible with future event types.
        break;
    }
  }

  // ── Start race ──────────────────────────────────────────────────────
  async function startRace() {
    var brief = elBriefInput.value.trim();
    if (!brief) { alert("Enter a brief first."); return; }
    elBtnStart.disabled = true;
    elBtnStart.textContent = "Running...";
    state.responses = [];
    state.receipts = [];
    state.raceComplete = false;
    elHalo.innerHTML = "";
    var oldCallouts = document.querySelectorAll(".halo-callout");
    oldCallouts.forEach(function(c){ c.remove(); });
    elReceipts.innerHTML = "<div class=\\"receipt-card-empty\\">Receipts will appear here as vendors respond...</div>";
    elReconcileChat.classList.remove("is-active");
    elReconcileBody.innerHTML = "";
    elAddBar.classList.add("is-disabled");
    elAddSelect.disabled = true;
    elAddBtn.disabled = true;

    try {
      var resp = await fetch("/race/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
        body: JSON.stringify({ brief_input: brief })
      });
      if (!resp.ok || !resp.body) {
        var txt = await resp.text();
        throw new Error("server returned " + resp.status + " " + txt.slice(0, 200));
      }
      await consumeStream(resp);
    } catch (err) {
      console.error("startRace failed", err);
      elRaceMeta.textContent = "fetch failed: " + (err.message || err);
      elBtnStart.disabled = false;
      elBtnStart.textContent = "Start race";
    }
  }

  // ── Available vendors / add vendor ──────────────────────────────────
  async function loadAvailableVendors() {
    try {
      var current = state.vendors.map(function(v){ return v.id; });
      var resp = await fetch("/race/available-vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
        body: JSON.stringify({ current_vendor_ids: current })
      });
      if (!resp.ok) return;
      var data = await resp.json();
      elAddSelect.innerHTML = "";
      var opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— pick a vendor to add —";
      elAddSelect.appendChild(opt);
      data.available.forEach(function(v) {
        var o = document.createElement("option");
        o.value = v.id;
        o.textContent = v.name + " (" + v.role + ")";
        elAddSelect.appendChild(o);
      });
      elAddBar.classList.remove("is-disabled");
      elAddSelect.disabled = false;
      elAddBtn.disabled = false;
    } catch (err) {
      console.warn("loadAvailableVendors failed", err);
    }
  }

  async function addVendor() {
    var vendorId = elAddSelect.value;
    if (!vendorId) return;
    elAddBtn.disabled = true;
    elAddBtn.textContent = "Adding...";
    try {
      var resp = await fetch("/race/add-vendor", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
        body: JSON.stringify({
          brief_input: state.briefInput,
          vendor_id: vendorId,
          prior_responses: state.responses
        })
      });
      if (!resp.ok) {
        var txt = await resp.text();
        throw new Error("server returned " + resp.status + " " + txt.slice(0, 200));
      }
      var data = await resp.json();
      // Append the new row.
      state.vendors.push(data.vendor);
      var newVendorObj = data.vendor;
      var row = document.createElement("div");
      row.className = "vendor-row";
      row.setAttribute("data-vendor-id", newVendorObj.id);
      row.innerHTML =
        "<div class=\\"vendor-name\\">" +
        "  <div class=\\"vendor-name-primary\\">" + escapeHtml(newVendorObj.name) + "</div>" +
        "  <div class=\\"vendor-name-secondary\\">" + escapeHtml(newVendorObj.vendor) + " &middot; " + escapeHtml(newVendorObj.role) + " &middot; added mid-flight</div>" +
        "</div>" +
        "<div class=\\"vendor-progress\\">" +
        "  <div class=\\"vendor-progress-fill is-done\\" data-fill style=\\"width:100%\\"></div>" +
        "  <div class=\\"vendor-stage-label\\" data-stage>responded</div>" +
        "</div>" +
        "<div class=\\"vendor-response\\" data-response></div>";
      elRows.appendChild(row);
      state.rowsByVendor[newVendorObj.id] = row;
      fillVendorResponse(newVendorObj.id, data.response);
      state.responses.push(data.response);
      appendReceipt(data.receipt);

      // Render any new disagreements.
      if (data.new_disagreements && data.new_disagreements.length > 0) {
        data.new_disagreements.forEach(function(d, i) {
          setTimeout(function(){ renderHaloArc(d); }, 300 + i * 200);
        });
      }

      // Refresh the dropdown.
      loadAvailableVendors();
    } catch (err) {
      console.error("addVendor failed", err);
      alert("Add vendor failed: " + (err.message || err));
    } finally {
      elAddBtn.disabled = false;
      elAddBtn.textContent = "Add";
    }
  }

  // ── Wiring ──────────────────────────────────────────────────────────
  elBtnStart.addEventListener("click", startRace);
  elBtnClear.addEventListener("click", function(){
    elBriefInput.value = "";
    elBriefInput.focus();
  });
  elAddBtn.addEventListener("click", addVendor);
  elBriefInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") startRace();
  });

  console.log("Race Canvas ready");
})();
</script>

</body>
</html>`;
}
