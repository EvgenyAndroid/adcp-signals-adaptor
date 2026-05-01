// src/routes/vendorHealthCanvas.ts
//
// Wave 5 — Vendor Health Dashboard HTML page (served at /vendor-health).
//
// Self-contained single-page UI for the fleet health view. Same pattern
// as Race Canvas (separate from demo.ts to keep the SCRIPT_TAG escape
// blast radius small).
//
// Initial paint: GET /vendor-health/snapshot?probe=false — instant
// render from registry metadata + cached circuit state.
//
// Live probe: button kicks off GET /vendor-health/snapshot — fans out
// to all 13 live agents in parallel, ~8s wall-clock upper bound,
// updates cards in place and writes history datapoints.
//
// Single-vendor re-probe: per-card "Re-probe" button hits POST
// /vendor-health/probe-one — patches just that card without re-fanning.
//
// Escape-trap discipline (see feedback_script_tag_template_trap.md):
//   - Double-quoted JS strings only
//   - No regex literals containing \\/
//   - No backticks in embedded JS
//   - Audit before commit

export function handleVendorHealthCanvas(env: { DEMO_API_KEY: string }): Response {
  return new Response(renderVendorHealthCanvas(env.DEMO_API_KEY), {
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

function renderVendorHealthCanvas(demoKey: string): string {
  const safeKey = JSON.stringify(demoKey);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Vendor Health — Fleet Dashboard</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='3' fill='%232ed573'/%3E%3Ccircle cx='8' cy='8' r='6' fill='none' stroke='%232ed573' stroke-width='0.8' opacity='0.5'/%3E%3C/svg%3E"/>
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
    --healthy: #2ed573;
    --healthy-glow: rgba(46, 213, 115, 0.3);
    --degraded: #f0b400;
    --degraded-glow: rgba(240, 180, 0, 0.3);
    --down: #ff4d5e;
    --down-glow: rgba(255, 77, 94, 0.3);
    --unknown: #6b7689;
    --font-mono: "JetBrains Mono", "SF Mono", Consolas, Menlo, monospace;
    --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background: var(--bg);
    color: var(--text);
    font: 14px/1.5 var(--font-ui);
  }

  .header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elevated);
    display: flex;
    align-items: center;
    gap: 16px;
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
  .header-back:hover { border-color: var(--accent); color: var(--accent); }
  .header-title {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .header-title .accent { color: var(--accent); }
  .header-sub {
    font: 12px/1.4 var(--font-mono);
    color: var(--text-faint);
  }
  .header-spacer { flex: 1; }
  .btn {
    background: var(--accent);
    color: #0a0d12;
    border: none;
    padding: 9px 16px;
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
  .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

  .main {
    padding: 24px;
    max-width: 1500px;
    margin: 0 auto;
  }

  /* ── Aggregate strip ───────────────────────────────────────────────── */
  .aggregate-strip {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
    margin-bottom: 18px;
  }
  .agg-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .agg-card.healthy { border-left: 4px solid var(--healthy); }
  .agg-card.degraded { border-left: 4px solid var(--degraded); }
  .agg-card.down { border-left: 4px solid var(--down); }
  .agg-card.unknown { border-left: 4px solid var(--unknown); }
  .agg-card.total { border-left: 4px solid var(--accent); }
  .agg-num {
    font: 700 28px/1 var(--font-mono);
    color: var(--text);
  }
  .agg-label {
    font: 11px/1 var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    margin-top: 6px;
  }
  .agg-card .agg-num.healthy { color: var(--healthy); }
  .agg-card .agg-num.degraded { color: var(--degraded); }
  .agg-card .agg-num.down { color: var(--down); }
  .agg-card .agg-num.unknown { color: var(--unknown); }

  /* ── Filter chips ──────────────────────────────────────────────────── */
  .filter-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 18px;
    padding: 12px 14px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .filter-group-label {
    font: 11px/1 var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    align-self: center;
    margin-right: 4px;
  }
  .chip {
    padding: 6px 12px;
    border-radius: 14px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font: 11px/1 var(--font-mono);
    cursor: pointer;
    transition: all 0.15s;
  }
  .chip:hover { border-color: var(--accent); color: var(--accent); }
  .chip.is-active {
    background: var(--accent);
    color: #0a0d12;
    border-color: var(--accent);
  }
  .filter-divider {
    width: 1px;
    background: var(--border);
    margin: 0 4px;
  }
  .filter-status-meta {
    margin-left: auto;
    align-self: center;
    font: 11px/1 var(--font-mono);
    color: var(--text-faint);
  }

  /* ── Vendor grid ───────────────────────────────────────────────────── */
  .vendor-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
    gap: 14px;
  }
  .vendor-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    cursor: pointer;
    transition: all 0.15s;
    position: relative;
  }
  .vendor-card:hover {
    border-color: var(--accent);
    transform: translateY(-1px);
  }
  .vendor-card.healthy { border-left: 4px solid var(--healthy); }
  .vendor-card.degraded { border-left: 4px solid var(--degraded); }
  .vendor-card.down { border-left: 4px solid var(--down); }
  .vendor-card.unknown { border-left: 4px solid var(--unknown); }
  .vendor-card.is-hidden { display: none; }
  .vendor-card.is-probing {
    opacity: 0.5;
    pointer-events: none;
  }
  .vc-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 4px;
    gap: 12px;
  }
  .vc-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
  }
  .vc-vendor {
    font: 11px/1.4 var(--font-mono);
    color: var(--text-faint);
  }
  .vc-status-pill {
    flex-shrink: 0;
    display: inline-block;
    padding: 3px 9px;
    border-radius: 4px;
    font: 700 10px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .vc-status-pill.healthy { background: var(--healthy); color: #0a0d12; }
  .vc-status-pill.degraded { background: var(--degraded); color: #0a0d12; }
  .vc-status-pill.down { background: var(--down); color: #0a0d12; }
  .vc-status-pill.unknown { background: var(--unknown); color: var(--text); }
  .vc-stage {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--bg);
    border: 1px solid var(--border);
    font: 9px/1 var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    margin-right: 4px;
  }
  .vc-stage.live { color: var(--healthy); border-color: var(--healthy); }
  .vc-stage.known_issue { color: var(--down); border-color: var(--down); }
  .vc-stage.roadmap { color: var(--unknown); border-color: var(--unknown); }

  .vc-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    margin: 10px 0;
    padding: 10px 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .vc-metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .vc-metric-label {
    font: 10px/1 var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
  }
  .vc-metric-value {
    font: 600 13px var(--font-mono);
    color: var(--text);
  }
  .vc-metric-value.muted { color: var(--text-faint); }
  .vc-metric-value.warn { color: var(--degraded); }
  .vc-metric-value.bad { color: var(--down); }

  .vc-spark {
    height: 24px;
    margin-top: 4px;
  }
  .vc-spark-empty {
    font: 10px var(--font-mono);
    color: var(--text-faint);
    line-height: 24px;
  }

  .vc-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
    gap: 8px;
  }
  .vc-foot-meta {
    font: 10px/1.4 var(--font-mono);
    color: var(--text-faint);
  }
  .vc-foot-actions {
    display: flex;
    gap: 6px;
  }
  .vc-btn {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-dim);
    padding: 4px 10px;
    border-radius: 4px;
    font: 10px/1 var(--font-mono);
    cursor: pointer;
    transition: all 0.15s;
  }
  .vc-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* ── Drill-down modal ──────────────────────────────────────────────── */
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
    max-width: 760px;
    max-height: 85vh;
    overflow-y: auto;
    position: relative;
  }
  .modal-title {
    font-size: 17px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .modal-sub {
    font: 12px/1.4 var(--font-mono);
    color: var(--text-faint);
    margin-bottom: 16px;
  }
  .modal-section {
    margin-top: 16px;
  }
  .modal-section-title {
    font: 11px/1 var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    margin-bottom: 8px;
  }
  .modal-grid {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 6px 16px;
    font: 12px/1.5 var(--font-mono);
  }
  .modal-grid-key { color: var(--text-faint); }
  .modal-grid-val { color: var(--text); word-break: break-all; }
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
  .modal-tools-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .modal-tool {
    padding: 3px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    font: 11px var(--font-mono);
    color: var(--text);
  }

  .empty-state {
    color: var(--text-faint);
    font-size: 13px;
    text-align: center;
    padding: 60px 20px;
    grid-column: 1 / -1;
  }

  .loading-bar {
    height: 3px;
    background: var(--accent);
    width: 0;
    transition: width 0.3s;
    position: fixed;
    top: 0; left: 0;
    z-index: 200;
  }
  .loading-bar.is-active { animation: progress 8s ease-out forwards; }
  @keyframes progress {
    0% { width: 0; }
    50% { width: 70%; }
    100% { width: 95%; }
  }
</style>
</head>
<body>

<div class="loading-bar" id="loading-bar"></div>

<header class="header">
  <a class="header-back" href="/">&larr; Back to Signals</a>
  <div>
    <div class="header-title">Vendor <span class="accent">Health</span></div>
    <div class="header-sub">live fleet status / circuit state / per-vendor sparklines</div>
  </div>
  <div class="header-spacer"></div>
  <button id="btn-refresh" class="btn">Live probe (all)</button>
  <button id="btn-meta" class="btn btn-ghost">Reload metadata only</button>
</header>

<main class="main">
  <div class="aggregate-strip" id="aggregate-strip"></div>

  <div class="filter-row">
    <span class="filter-group-label">Status:</span>
    <button class="chip is-active" data-filter-bucket="all">All</button>
    <button class="chip" data-filter-bucket="healthy">Healthy</button>
    <button class="chip" data-filter-bucket="degraded">Degraded</button>
    <button class="chip" data-filter-bucket="down">Down</button>
    <button class="chip" data-filter-bucket="unknown">Unknown</button>
    <span class="filter-divider"></span>
    <span class="filter-group-label">Stage:</span>
    <button class="chip is-active" data-filter-stage="all">All</button>
    <button class="chip" data-filter-stage="live">Live</button>
    <button class="chip" data-filter-stage="known_issue">Known issue</button>
    <button class="chip" data-filter-stage="roadmap">Roadmap</button>
    <span class="filter-divider"></span>
    <span class="filter-group-label">Role:</span>
    <button class="chip is-active" data-filter-role="all">All</button>
    <button class="chip" data-filter-role="signals">Signals</button>
    <button class="chip" data-filter-role="buying">Buying</button>
    <button class="chip" data-filter-role="creative">Creative</button>
    <span class="filter-status-meta" id="filter-meta">—</span>
  </div>

  <div class="vendor-grid" id="vendor-grid">
    <div class="empty-state">Loading fleet metadata...</div>
  </div>
</main>

<div class="modal-backdrop" id="modal-backdrop">
  <div class="modal">
    <div class="modal-title" id="modal-title">Vendor</div>
    <div class="modal-sub" id="modal-sub"></div>
    <button class="modal-close" id="modal-close">close</button>
    <div class="modal-section">
      <div class="modal-section-title">Identity</div>
      <div class="modal-grid" id="modal-identity"></div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Probe</div>
      <div class="modal-grid" id="modal-probe"></div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Circuit Breaker</div>
      <div class="modal-grid" id="modal-circuit"></div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Tools advertised</div>
      <div class="modal-tools-list" id="modal-tools"></div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Recent history</div>
      <pre id="modal-history">no history</pre>
    </div>
  </div>
</div>

<script>
(function(){
  "use strict";
  var DEMO_KEY = ${safeKey};
  var state = {
    rows: [],
    histories: {},
    counts: null,
    filter: { bucket: "all", stage: "all", role: "all" },
    isProbing: false
  };

  // ── DOM refs ────────────────────────────────────────────────────────
  var elGrid = document.getElementById("vendor-grid");
  var elAgg = document.getElementById("aggregate-strip");
  var elBtnRefresh = document.getElementById("btn-refresh");
  var elBtnMeta = document.getElementById("btn-meta");
  var elFilterMeta = document.getElementById("filter-meta");
  var elLoadingBar = document.getElementById("loading-bar");
  var elModalBackdrop = document.getElementById("modal-backdrop");
  var elModalTitle = document.getElementById("modal-title");
  var elModalSub = document.getElementById("modal-sub");
  var elModalClose = document.getElementById("modal-close");
  var elModalIdentity = document.getElementById("modal-identity");
  var elModalProbe = document.getElementById("modal-probe");
  var elModalCircuit = document.getElementById("modal-circuit");
  var elModalTools = document.getElementById("modal-tools");
  var elModalHistory = document.getElementById("modal-history");

  // ── Format helpers ─────────────────────────────────────────────────
  function fmtLatency(ms) {
    if (ms === null || ms === undefined) return "—";
    if (ms < 1000) return ms + "ms";
    return (ms / 1000).toFixed(2) + "s";
  }
  function fmtRelTime(iso) {
    if (!iso) return "never";
    var diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) return "just now";
    if (diff < 60000) return Math.floor(diff / 1000) + "s ago";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    return Math.floor(diff / 86400000) + "d ago";
  }
  function escapeHtml(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Aggregate strip ────────────────────────────────────────────────
  function renderAggregate(counts, total) {
    if (!counts) { elAgg.innerHTML = ""; return; }
    elAgg.innerHTML =
      "<div class=\\"agg-card total\\"><div class=\\"agg-num\\">" + total + "</div><div class=\\"agg-label\\">total agents</div></div>" +
      "<div class=\\"agg-card healthy\\"><div class=\\"agg-num healthy\\">" + counts.healthy + "</div><div class=\\"agg-label\\">healthy</div></div>" +
      "<div class=\\"agg-card degraded\\"><div class=\\"agg-num degraded\\">" + counts.degraded + "</div><div class=\\"agg-label\\">degraded</div></div>" +
      "<div class=\\"agg-card down\\"><div class=\\"agg-num down\\">" + counts.down + "</div><div class=\\"agg-label\\">down / known issue</div></div>" +
      "<div class=\\"agg-card unknown\\"><div class=\\"agg-num unknown\\">" + counts.unknown + "</div><div class=\\"agg-label\\">unknown / roadmap</div></div>";
  }

  // ── Sparkline rendering ────────────────────────────────────────────
  // SVG path drawn from latency history. Color matches most recent
  // health bucket. Path is normalized: x evenly distributed, y inverted
  // because SVG y grows downward.
  function renderSparkline(history) {
    if (!history || history.length === 0) {
      return "<div class=\\"vc-spark-empty\\">no probe history yet</div>";
    }
    if (history.length === 1) {
      var bucket = history[0].health_bucket || "unknown";
      var dotColor = bucket === "healthy" ? "#2ed573" : bucket === "degraded" ? "#f0b400" : bucket === "down" ? "#ff4d5e" : "#6b7689";
      return "<svg class=\\"vc-spark\\" width=\\"100%\\" height=\\"24\\" viewBox=\\"0 0 100 24\\" preserveAspectRatio=\\"none\\">" +
        "<circle cx=\\"50\\" cy=\\"12\\" r=\\"3\\" fill=\\"" + dotColor + "\\"/></svg>";
    }
    var maxLat = 0;
    for (var i = 0; i < history.length; i++) {
      var l = history[i].latency_ms;
      if (typeof l === "number" && l > maxLat) maxLat = l;
    }
    if (maxLat === 0) maxLat = 1;
    var w = 100, h = 24;
    var step = w / (history.length - 1);
    var pts = [];
    for (var j = 0; j < history.length; j++) {
      var x = j * step;
      var lat = history[j].latency_ms;
      var y = (typeof lat === "number") ? (h - (lat / maxLat) * h * 0.85 - 2) : (h / 2);
      pts.push(x.toFixed(1) + "," + y.toFixed(1));
    }
    var lastBucket = history[history.length - 1].health_bucket || "unknown";
    var color = lastBucket === "healthy" ? "#2ed573" :
                lastBucket === "degraded" ? "#f0b400" :
                lastBucket === "down" ? "#ff4d5e" : "#6b7689";
    return "<svg class=\\"vc-spark\\" width=\\"100%\\" height=\\"24\\" viewBox=\\"0 0 100 24\\" preserveAspectRatio=\\"none\\">" +
      "<polyline fill=\\"none\\" stroke=\\"" + color + "\\" stroke-width=\\"1.5\\" points=\\"" + pts.join(" ") + "\\"/></svg>";
  }

  // ── Vendor grid ────────────────────────────────────────────────────
  function renderGrid() {
    if (!state.rows || state.rows.length === 0) {
      elGrid.innerHTML = "<div class=\\"empty-state\\">No vendors loaded yet.</div>";
      return;
    }
    var html = "";
    var visible = 0;
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      var passes = filterMatches(r);
      if (!passes) continue;
      visible++;
      var hist = state.histories[r.agent_id] || [];
      html += renderCard(r, hist);
    }
    elGrid.innerHTML = html || "<div class=\\"empty-state\\">No vendors match the current filters.</div>";
    elFilterMeta.textContent = visible + " of " + state.rows.length + " visible";

    // Wire card click + re-probe button.
    var cards = elGrid.querySelectorAll(".vendor-card");
    cards.forEach(function(card) {
      card.addEventListener("click", function(e) {
        if ((e.target).closest && (e.target).closest("[data-action]")) return;
        var id = card.getAttribute("data-agent-id");
        openModal(id);
      });
    });
    var reprobeButtons = elGrid.querySelectorAll("[data-action=reprobe]");
    reprobeButtons.forEach(function(btn) {
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-agent-id");
        reprobeOne(id);
      });
    });
  }

  function renderCard(r, history) {
    var bucket = r.health_bucket || "unknown";
    var latencyClass = "";
    if (typeof r.latency_ms === "number") {
      if (r.latency_ms > 5000) latencyClass = "bad";
      else if (r.latency_ms > 2500) latencyClass = "warn";
    }
    if (!r.alive && r.probed) latencyClass = "bad";
    var circuitDisplay = r.circuit_state ? r.circuit_state : "—";
    var circuitClass = r.circuit_state === "open" ? "bad" :
                       r.circuit_state === "half_open" ? "warn" :
                       r.circuit_state === "closed" ? "" : "muted";
    var toolsDisplay = (typeof r.tools_count === "number") ? String(r.tools_count) : "—";

    return "<div class=\\"vendor-card " + bucket + "\\" data-agent-id=\\"" + escapeHtml(r.agent_id) + "\\" data-bucket=\\"" + bucket + "\\" data-stage=\\"" + escapeHtml(r.stage) + "\\" data-role=\\"" + escapeHtml(r.role) + "\\">" +
      "  <div class=\\"vc-head\\">" +
      "    <div>" +
      "      <div class=\\"vc-name\\">" + escapeHtml(r.agent_name) + "</div>" +
      "      <div class=\\"vc-vendor\\"><span class=\\"vc-stage " + escapeHtml(r.stage) + "\\">" + escapeHtml(r.stage) + "</span> " + escapeHtml(r.vendor) + " &middot; " + escapeHtml(r.role) + "</div>" +
      "    </div>" +
      "    <span class=\\"vc-status-pill " + bucket + "\\">" + escapeHtml(bucket) + "</span>" +
      "  </div>" +
      "  <div class=\\"vc-metrics\\">" +
      "    <div class=\\"vc-metric\\">" +
      "      <div class=\\"vc-metric-label\\">Latency</div>" +
      "      <div class=\\"vc-metric-value " + latencyClass + "\\">" + fmtLatency(r.latency_ms) + "</div>" +
      "    </div>" +
      "    <div class=\\"vc-metric\\">" +
      "      <div class=\\"vc-metric-label\\">Tools</div>" +
      "      <div class=\\"vc-metric-value\\">" + toolsDisplay + "</div>" +
      "    </div>" +
      "    <div class=\\"vc-metric\\">" +
      "      <div class=\\"vc-metric-label\\">Circuit</div>" +
      "      <div class=\\"vc-metric-value " + circuitClass + "\\">" + circuitDisplay + "</div>" +
      "    </div>" +
      "  </div>" +
      "  " + renderSparkline(history) +
      "  <div class=\\"vc-foot\\">" +
      "    <div class=\\"vc-foot-meta\\">probed " + (r.probed ? fmtRelTime(r.snapshot_ts) : "never (this snapshot)") + "</div>" +
      "    <div class=\\"vc-foot-actions\\">" +
      (r.mcp_url ? "      <button class=\\"vc-btn\\" data-action=\\"reprobe\\" data-agent-id=\\"" + escapeHtml(r.agent_id) + "\\">re-probe</button>" : "") +
      "    </div>" +
      "  </div>" +
      "</div>";
  }

  function filterMatches(r) {
    if (state.filter.bucket !== "all" && r.health_bucket !== state.filter.bucket) return false;
    if (state.filter.stage !== "all" && r.stage !== state.filter.stage) return false;
    if (state.filter.role !== "all" && r.role !== state.filter.role) return false;
    return true;
  }

  // ── Filter chip wiring ─────────────────────────────────────────────
  document.querySelectorAll("[data-filter-bucket]").forEach(function(chip) {
    chip.addEventListener("click", function() {
      var val = chip.getAttribute("data-filter-bucket");
      state.filter.bucket = val;
      document.querySelectorAll("[data-filter-bucket]").forEach(function(c) { c.classList.toggle("is-active", c === chip); });
      renderGrid();
    });
  });
  document.querySelectorAll("[data-filter-stage]").forEach(function(chip) {
    chip.addEventListener("click", function() {
      var val = chip.getAttribute("data-filter-stage");
      state.filter.stage = val;
      document.querySelectorAll("[data-filter-stage]").forEach(function(c) { c.classList.toggle("is-active", c === chip); });
      renderGrid();
    });
  });
  document.querySelectorAll("[data-filter-role]").forEach(function(chip) {
    chip.addEventListener("click", function() {
      var val = chip.getAttribute("data-filter-role");
      state.filter.role = val;
      document.querySelectorAll("[data-filter-role]").forEach(function(c) { c.classList.toggle("is-active", c === chip); });
      renderGrid();
    });
  });

  // ── Modal ──────────────────────────────────────────────────────────
  function openModal(agentId) {
    var r = state.rows.find ? state.rows.find(function(x) { return x.agent_id === agentId; }) : null;
    if (!r) return;
    elModalTitle.textContent = r.agent_name;
    elModalSub.textContent = r.vendor + " - " + r.role + " - stage:" + r.stage;

    elModalIdentity.innerHTML =
      kvRow("agent_id", r.agent_id) +
      kvRow("mcp_url", r.mcp_url || "(none)") +
      kvRow("protocols", (r.protocols || []).join(", ") || "—") +
      kvRow("specialties", (r.specialties || []).join(", ") || "—") +
      kvRow("notes", r.notes || "—");

    elModalProbe.innerHTML =
      kvRow("probed", r.probed ? "yes" : "no") +
      kvRow("alive", r.alive ? "yes" : "no") +
      kvRow("latency", fmtLatency(r.latency_ms)) +
      kvRow("tools_count", (r.tools_count !== null && r.tools_count !== undefined) ? String(r.tools_count) : "—") +
      kvRow("server_name", r.server_name || "—") +
      kvRow("protocol_version", r.protocol_version || "—") +
      kvRow("error", r.probe_error || "—") +
      kvRow("snapshot_ts", r.snapshot_ts ? r.snapshot_ts + " (" + fmtRelTime(r.snapshot_ts) + ")" : "—") +
      kvRow("health_reason", r.health_reason || "—");

    elModalCircuit.innerHTML =
      kvRow("state", r.circuit_state || "(no circuit yet — vendor not called this isolate)") +
      kvRow("failure_count", String(r.circuit_failure_count || 0)) +
      kvRow("success_count", String(r.circuit_success_count || 0)) +
      kvRow("last_event", r.circuit_last_event_ts ? fmtRelTime(new Date(r.circuit_last_event_ts).toISOString()) : "—");

    var hist = state.histories[r.agent_id] || [];
    if (hist.length === 0) {
      elModalHistory.textContent = "no probe history (history fills as you click Live probe)";
    } else {
      var lines = hist.map(function(d) {
        return d.ts + "  " + (d.alive ? "alive" : "dead") + "  " + fmtLatency(d.latency_ms) + "  bucket=" + d.health_bucket + "  circuit=" + (d.circuit_state || "—");
      });
      elModalHistory.textContent = lines.join("\\n");
    }
    elModalTools.innerHTML = "<span class=\\"modal-tool\\">tools list captured at probe time, see /agents/registry for full list</span>";

    elModalBackdrop.classList.add("is-open");
  }
  function kvRow(k, v) {
    return "<div class=\\"modal-grid-key\\">" + escapeHtml(k) + "</div><div class=\\"modal-grid-val\\">" + escapeHtml(v) + "</div>";
  }
  elModalClose.addEventListener("click", function() { elModalBackdrop.classList.remove("is-open"); });
  elModalBackdrop.addEventListener("click", function(e) { if (e.target === elModalBackdrop) elModalBackdrop.classList.remove("is-open"); });

  // ── Snapshot fetch ─────────────────────────────────────────────────
  async function loadSnapshot(probeLive) {
    if (state.isProbing) return;
    state.isProbing = true;
    elBtnRefresh.disabled = true;
    elBtnMeta.disabled = true;
    elBtnRefresh.textContent = probeLive ? "Probing..." : "Loading...";
    if (probeLive) elLoadingBar.classList.add("is-active");
    try {
      var url = "/vendor-health/snapshot" + (probeLive ? "" : "?probe=false");
      var resp = await fetch(url, { headers: { "Authorization": "Bearer " + DEMO_KEY } });
      if (!resp.ok) {
        var txt = await resp.text();
        throw new Error("server " + resp.status + ": " + txt.slice(0, 160));
      }
      var data = await resp.json();
      state.rows = data.rows || [];
      state.histories = data.histories || {};
      state.counts = data.counts || null;
      renderAggregate(state.counts, data.total || state.rows.length);
      renderGrid();
    } catch (err) {
      console.error("loadSnapshot failed", err);
      elGrid.innerHTML = "<div class=\\"empty-state\\">Snapshot failed: " + escapeHtml(err.message || String(err)) + "</div>";
    } finally {
      state.isProbing = false;
      elBtnRefresh.disabled = false;
      elBtnMeta.disabled = false;
      elBtnRefresh.textContent = "Live probe (all)";
      elLoadingBar.classList.remove("is-active");
      elLoadingBar.style.width = "0";
    }
  }

  async function reprobeOne(agentId) {
    var card = elGrid.querySelector("[data-agent-id=\\"" + agentId + "\\"]");
    if (card) card.classList.add("is-probing");
    try {
      var resp = await fetch("/vendor-health/probe-one", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
        body: JSON.stringify({ agent_id: agentId })
      });
      if (!resp.ok) {
        var txt = await resp.text();
        throw new Error("server " + resp.status + ": " + txt.slice(0, 160));
      }
      var updated = await resp.json();
      // Patch the row in state.rows.
      var i = -1;
      for (var k = 0; k < state.rows.length; k++) {
        if (state.rows[k].agent_id === agentId) { i = k; break; }
      }
      if (i >= 0) {
        // Preserve registry-side fields; merge probe-side fields from response.
        var existing = state.rows[i];
        state.rows[i] = Object.assign({}, existing, updated);
        // Append a synthetic datapoint to local history so the sparkline updates.
        if (!state.histories[agentId]) state.histories[agentId] = [];
        state.histories[agentId].push({
          ts: updated.snapshot_ts,
          alive: updated.alive,
          latency_ms: updated.latency_ms,
          health_bucket: updated.health_bucket,
          circuit_state: updated.circuit_state
        });
        if (state.histories[agentId].length > 24) {
          state.histories[agentId] = state.histories[agentId].slice(-24);
        }
        // Recompute aggregate.
        recomputeCounts();
      }
      renderGrid();
    } catch (err) {
      console.error("reprobeOne failed", err);
      alert("Re-probe failed: " + (err.message || String(err)));
    } finally {
      if (card) card.classList.remove("is-probing");
    }
  }

  function recomputeCounts() {
    var c = { healthy: 0, degraded: 0, down: 0, unknown: 0 };
    for (var i = 0; i < state.rows.length; i++) {
      var b = state.rows[i].health_bucket;
      if (c[b] !== undefined) c[b]++;
    }
    if (state.counts) {
      state.counts.healthy = c.healthy;
      state.counts.degraded = c.degraded;
      state.counts.down = c.down;
      state.counts.unknown = c.unknown;
    } else {
      state.counts = c;
    }
    renderAggregate(state.counts, state.rows.length);
  }

  // ── Wiring ──────────────────────────────────────────────────────────
  elBtnRefresh.addEventListener("click", function() { loadSnapshot(true); });
  elBtnMeta.addEventListener("click", function() { loadSnapshot(false); });

  // Initial load: metadata-only for fast paint. Operator clicks "Live probe" for the slow fan-out.
  loadSnapshot(false);
})();
</script>

</body>
</html>`;
}
