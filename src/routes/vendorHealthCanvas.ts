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
  /* Page info popover — same pattern as Race Canvas. */
  .header-title-block { position: relative; }
  .header-title-row { display: flex; align-items: center; gap: 8px; }
  .page-info-btn {
    width: 24px; height: 24px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 50%;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-faint);
    cursor: pointer;
    transition: all 0.12s;
  }
  .page-info-btn:hover {
    background: var(--bg-panel);
    color: var(--accent);
    border-color: var(--accent);
  }
  .page-info-btn.is-open {
    background: rgba(56,182,255,0.14);
    color: var(--accent);
    border-color: var(--accent);
  }
  .page-info-popover {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 50;
    width: 420px;
    max-width: calc(100vw - 32px);
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 18px 14px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
    display: none;
    animation: pageInfoFade 0.15s ease-out;
  }
  .page-info-popover.is-open { display: block; }
  @keyframes pageInfoFade {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .page-info-popover::before {
    content: "";
    position: absolute;
    top: -7px; left: 18px;
    width: 12px; height: 12px;
    background: var(--bg-panel);
    border-top: 1px solid var(--border);
    border-left: 1px solid var(--border);
    transform: rotate(45deg);
  }
  .page-info-title { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 10px; }
  .page-info-steps { margin: 0 0 12px; padding: 0 0 0 22px; font-size: 12.5px; line-height: 1.55; color: var(--text-dim); }
  .page-info-steps li { margin-bottom: 8px; }
  .page-info-steps li:last-child { margin-bottom: 0; }
  .page-info-steps strong { color: var(--text); }
  .page-info-steps code {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 11px;
    color: var(--accent);
  }
  .page-info-trace { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); font: 11px var(--font-mono); color: var(--text-faint); line-height: 1.5; }
  .page-info-trace code { color: var(--text-dim); background: transparent; border: none; padding: 0; font-size: 11px; }
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
    display: block;
  }
  .vc-spark-wrap {
    position: relative;
    margin-top: 4px;
  }
  .vc-spark-empty {
    font: 10px var(--font-mono);
    color: var(--text-faint);
    line-height: 24px;
  }
  /* Sparkline hover tooltip — anchored to mouse via inline left/top.
     Hidden by default (display:none), JS toggles + positions on
     mouseenter/leave of the sparkline points. */
  .vc-spark-tooltip {
    position: absolute;
    display: none;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    padding: 4px 7px;
    font: 10px/1.4 var(--font-mono);
    color: var(--text);
    pointer-events: none;
    white-space: nowrap;
    z-index: 5;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }
  .vc-spark-tooltip.is-visible { display: block; }
  .vc-spark-tooltip .tt-bucket {
    display: inline-block;
    width: 6px; height: 6px;
    border-radius: 50%;
    margin-right: 4px;
    vertical-align: 1px;
  }

  /* Trend stats row — small pills under the sparkline showing
     uptime%, p50 latency, and a directional arrow. Computed
     client-side from the history ring buffer (24 entries). */
  .vc-trend {
    display: flex;
    gap: 6px;
    margin-top: 6px;
    align-items: center;
  }
  .vc-trend-pill {
    font: 10px/1 var(--font-mono);
    padding: 3px 6px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-dim);
    letter-spacing: 0.02em;
  }
  .vc-trend-pill.good { color: var(--healthy); border-color: var(--healthy); }
  .vc-trend-pill.bad  { color: var(--down); border-color: var(--down); }
  .vc-trend-pill.neutral { color: var(--text-faint); }
  .vc-trend-empty {
    font: 10px var(--font-mono);
    color: var(--text-faint);
    margin-top: 6px;
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
  /* Modal time-series chart — drill-down replacement for the textual
     history dump. Renders the same KV ring-buffer history as the card
     sparkline but at full size: x-axis sample index, y-axis latency
     (ms), bucket-colored points, dashed threshold lines for the 2.5s
     (degraded) and 5s (down) bucket boundaries.
     Empty-state and stat-row visible always; chart fades in once
     there's at least 1 datapoint. */
  .modal-chart-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 12px;
  }
  .modal-chart-stat {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
  }
  .modal-chart-stat-label {
    font: 9px/1 var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    margin-bottom: 4px;
  }
  .modal-chart-stat-value {
    font: 600 14px var(--font-mono);
    color: var(--text);
  }
  .modal-chart-stat-value.good  { color: var(--healthy); }
  .modal-chart-stat-value.bad   { color: var(--down); }
  .modal-chart-stat-value.neutral { color: var(--text-dim); }
  .modal-chart-host {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px;
    overflow-x: auto;
  }
  .modal-chart-svg {
    display: block;
    max-width: 100%;
    min-width: 600px;
  }
  .modal-chart-empty {
    font: 12px/1.5 var(--font-mono);
    color: var(--text-faint);
    padding: 24px 12px;
    text-align: center;
  }
  .modal-chart-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 8px;
    font: 10px/1 var(--font-mono);
    color: var(--text-faint);
  }
  .modal-chart-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .modal-chart-legend-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
  }
  .modal-chart-legend-dash {
    display: inline-block;
    width: 14px;
    border-top: 1px dashed currentColor;
  }
  .modal-actions {
    position: absolute;
    top: 16px;
    right: 16px;
    display: flex;
    gap: 6px;
  }
  .modal-close,
  .modal-reprobe {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font: 11px var(--font-mono);
    transition: all 0.15s;
  }
  .modal-reprobe:hover { border-color: var(--accent); color: var(--accent); }
  .modal-reprobe:disabled { opacity: 0.5; cursor: progress; }
  .modal-reprobe.is-loading::after {
    content: "";
    display: inline-block;
    width: 8px; height: 8px;
    margin-left: 6px;
    border: 1.5px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    vertical-align: -1px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  /* Time-window filter (applies in modal chart). Lives in the same row
     as the chart stats; selecting a window re-renders the chart with
     the matching slice of history. */
  .modal-chart-window {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
    align-items: center;
  }
  .modal-chart-window-label {
    font: 10px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    margin-right: 6px;
  }
  .modal-chart-window-btn {
    padding: 4px 9px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-dim);
    border-radius: 4px;
    font: 10.5px var(--font-mono);
    cursor: pointer;
    transition: all 0.15s;
  }
  .modal-chart-window-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .modal-chart-window-btn.is-active {
    background: var(--accent);
    color: #0a0d12;
    border-color: var(--accent);
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
  <div class="header-title-block">
    <div class="header-title-row">
      <div class="header-title">Vendor <span class="accent">Health</span></div>
      <button class="page-info-btn" id="page-info-btn" title="How this works" aria-label="How Vendor Health works">
        <svg viewBox="0 0 20 20" width="14" height="14"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="10" y1="9" x2="10" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="6.5" r="0.8" fill="currentColor"/></svg>
      </button>
      <div class="page-info-popover" id="page-info-popover" role="dialog">
        <div class="page-info-title">How Vendor Health works</div>
        <ol class="page-info-steps">
          <li><strong>Parallel probe.</strong> Every registry agent's MCP <code>initialize</code> handshake fired in parallel (8s timeout per agent). Self-fetch shim used for our own URL (CF Workers blocks self-fetch — see #144).</li>
          <li><strong>Bucket precedence.</strong> known_issue/roadmap → unknown · circuit OPEN → down · probe failed → down · latency &gt;5s → degraded · circuit half_open → degraded · else healthy. Aggregate counters at top reflect the buckets.</li>
          <li><strong>Sparkline + drill-down.</strong> Per-vendor history stored in KV ring buffer (24-entry, 7-day TTL); each card renders a latency sparkline. Click a card for full identity + probe details + circuit history. Re-probe button refreshes one row without re-fanning the fleet.</li>
        </ol>
        <div class="page-info-trace">Code: <code>buildVendorHealthSnapshot</code> → <code>bucketHealth</code> + <code>vendorHealthHistory</code> KV</div>
      </div>
    </div>
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
    <div class="modal-actions">
      <button class="modal-reprobe" id="modal-reprobe" type="button" title="Re-probe this vendor and refresh the modal in place">↻ Re-probe</button>
      <button class="modal-close" id="modal-close">close</button>
    </div>
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
      <!-- Time-window filter: time-based slices (relative to NOW). Each
           button keeps datapoints whose ts is within the window — "1h"
           = last 60 min, "24h" = last 1440 min, "all" = full ring. -->
      <div class="modal-chart-window" id="modal-chart-window">
        <span class="modal-chart-window-label">window</span>
        <button class="modal-chart-window-btn" data-window="60" type="button">1h</button>
        <button class="modal-chart-window-btn" data-window="1440" type="button">24h</button>
        <button class="modal-chart-window-btn is-active" data-window="all" type="button">all</button>
      </div>
      <!-- Stats row computed from KV ring buffer (24-entry, 7-day TTL).
           Empty until first probe lands. -->
      <div id="modal-chart-stats"></div>
      <div class="modal-chart-host" id="modal-chart-host">
        <div class="modal-chart-empty">No probe history yet.</div>
      </div>
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
  var elModalChartStats = document.getElementById("modal-chart-stats");
  var elModalChartHost = document.getElementById("modal-chart-host");

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

  // ── Stats + chart helpers ──────────────────────────────────────────
  // All operate on the per-vendor history ring buffer (24 entries, 7-day
  // TTL in KV). See src/storage/vendorHealthHistory.ts. These are the
  // analytical layer that sits on top of the raw datapoint array — the
  // dashboard card (small) and modal (large) both render through them.
  function bucketColor(bucket) {
    if (bucket === "healthy") return "#2ed573";
    if (bucket === "degraded") return "#f0b400";
    if (bucket === "down") return "#ff4d5e";
    return "#6b7689";
  }
  function bucketBg(bucket) {
    // Tinted background variant of bucketColor for stat-pill backgrounds.
    if (bucket === "healthy") return "rgba(46,213,115,0.10)";
    if (bucket === "degraded") return "rgba(240,180,0,0.10)";
    if (bucket === "down") return "rgba(255,77,94,0.10)";
    return "rgba(107,118,137,0.10)";
  }
  function median(arr) {
    if (!arr || arr.length === 0) return 0;
    var s = arr.slice().sort(function(a, b) { return a - b; });
    return s[Math.floor(s.length * 0.5)];
  }
  function percentile(arr, p) {
    if (!arr || arr.length === 0) return 0;
    var s = arr.slice().sort(function(a, b) { return a - b; });
    var idx = Math.min(s.length - 1, Math.floor(s.length * p));
    return s[idx];
  }
  // Compute uptime%, p50/p95 latency, trend direction across the
  // history window. Returns null if history is empty/unprobed.
  // Trend heuristic: split probed datapoints into thirds; compare the
  // last third's median latency to the first third's. ±20% = trend
  // shift, otherwise stable. Need at least 6 probed samples.
  function computeTrendStats(history) {
    if (!history || history.length === 0) return null;
    var probed = [];
    for (var i = 0; i < history.length; i++) {
      var dp = history[i];
      if (dp && (dp.alive === true || dp.alive === false)) probed.push(dp);
    }
    if (probed.length === 0) return null;

    var aliveCount = 0;
    var lats = [];
    for (var k = 0; k < probed.length; k++) {
      if (probed[k].alive) aliveCount++;
      if (typeof probed[k].latency_ms === "number") lats.push(probed[k].latency_ms);
    }
    var p50 = lats.length > 0 ? Math.round(percentile(lats, 0.50)) : null;
    var p95 = lats.length > 0 ? Math.round(percentile(lats, 0.95)) : null;
    var uptimePct = Math.round((aliveCount / probed.length) * 100);

    var trend = "stable";
    if (lats.length >= 6) {
      var third = Math.max(2, Math.floor(lats.length / 3));
      var firstChunk = lats.slice(0, third);
      var lastChunk = lats.slice(-third);
      var firstMed = median(firstChunk);
      var lastMed = median(lastChunk);
      // Avoid divide-by-zero with sub-1ms readings.
      var rel = (lastMed - firstMed) / Math.max(firstMed, 1);
      if (rel > 0.20) trend = "degrading";
      else if (rel < -0.20) trend = "improving";
    }

    return {
      uptime_pct: uptimePct,
      p50_ms: p50,
      p95_ms: p95,
      samples: probed.length,
      total_history: history.length,
      trend: trend,
      latest_bucket: probed[probed.length - 1].health_bucket || "unknown"
    };
  }

  // Small pill row under the card sparkline. Empty if history is unprobed.
  function renderTrendPills(stats) {
    if (!stats) {
      return "<div class=\\"vc-trend-empty\\">awaiting first probe</div>";
    }
    var trendIcon = stats.trend === "improving" ? "↘" :
                    stats.trend === "degrading" ? "↗" : "→";
    var trendClass = stats.trend === "improving" ? "good" :
                     stats.trend === "degrading" ? "bad" : "neutral";
    var trendTitle = stats.trend === "improving" ? "latency improving over recent probes" :
                     stats.trend === "degrading" ? "latency degrading over recent probes" :
                     "latency stable over recent probes";
    var p50Display = stats.p50_ms !== null ? stats.p50_ms + "ms" : "—";
    var uptimeClass = stats.uptime_pct === 100 ? "good" :
                      stats.uptime_pct < 70 ? "bad" : "neutral";
    return "<div class=\\"vc-trend\\">" +
      "<span class=\\"vc-trend-pill " + uptimeClass + "\\" title=\\"alive in " + Math.round(stats.uptime_pct * stats.samples / 100) + " of " + stats.samples + " probes\\">uptime " + stats.uptime_pct + "%</span>" +
      "<span class=\\"vc-trend-pill\\" title=\\"median latency, last " + stats.samples + " probes\\">p50 " + p50Display + "</span>" +
      "<span class=\\"vc-trend-pill " + trendClass + "\\" title=\\"" + trendTitle + "\\">" + trendIcon + "</span>" +
      "</div>";
  }

  // Larger time-series chart for the drill-down modal. Renders the SAME
  // history as the card sparkline at full size with axes, dashed
  // threshold lines (2.5s = degraded, 5s = down), and bucket-colored
  // points along the line. Width adapts to the modal but min-width 600.
  function renderHistoryChart(history) {
    if (!history || history.length === 0) {
      return "<div class=\\"modal-chart-empty\\">No probe history yet. Hit \\"Live probe (all)\\" or the per-card re-probe button to start collecting datapoints.</div>";
    }
    var w = 700, h = 220;
    var padX = 50, padTop = 16, padBottom = 32;
    var plotW = w - padX * 2;
    var plotH = h - padTop - padBottom;

    // Y-axis scale: max latency, floored at 1s and rounded up to 1s tick.
    var maxLat = 0;
    for (var i = 0; i < history.length; i++) {
      var l = history[i].latency_ms;
      if (typeof l === "number" && l > maxLat) maxLat = l;
    }
    if (maxLat < 1000) maxLat = 1000;
    maxLat = Math.ceil(maxLat / 1000) * 1000;

    var step = history.length > 1 ? plotW / (history.length - 1) : 0;
    var pathParts = [];
    var pointMarkers = [];
    for (var j = 0; j < history.length; j++) {
      var x = padX + j * step;
      var dp = history[j];
      var y;
      if (typeof dp.latency_ms === "number") {
        y = padTop + plotH - (dp.latency_ms / maxLat) * plotH;
      } else {
        // Probed but no latency — render at the baseline.
        y = padTop + plotH;
      }
      pathParts.push((j === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1));
      var color = bucketColor(dp.health_bucket || "unknown");
      var titleText = (dp.ts || "?") + "\\u000a" +
        "bucket: " + (dp.health_bucket || "unknown") + "\\u000a" +
        "latency: " + (typeof dp.latency_ms === "number" ? dp.latency_ms + "ms" : "—") + "\\u000a" +
        "alive: " + (dp.alive ? "yes" : "no") +
        (dp.circuit_state ? "\\u000acircuit: " + dp.circuit_state : "");
      pointMarkers.push(
        "<circle cx=\\"" + x.toFixed(1) + "\\" cy=\\"" + y.toFixed(1) +
        "\\" r=\\"3.5\\" fill=\\"" + color +
        "\\" stroke=\\"#0a0d12\\" stroke-width=\\"1\\"><title>" +
        escapeHtml(titleText) + "</title></circle>"
      );
    }

    // Y-axis ticks (5 ticks: 0, 25%, 50%, 75%, 100%)
    var ticks = [0, maxLat * 0.25, maxLat * 0.5, maxLat * 0.75, maxLat];
    var yTicksHtml = "";
    for (var t = 0; t < ticks.length; t++) {
      var ty = padTop + plotH - (ticks[t] / maxLat) * plotH;
      var label = ticks[t] >= 1000 ? (ticks[t] / 1000).toFixed(1) + "s" : Math.round(ticks[t]) + "ms";
      yTicksHtml += "<text x=\\"" + (padX - 8) + "\\" y=\\"" + (ty + 3) +
        "\\" text-anchor=\\"end\\" font-size=\\"10\\" fill=\\"#5b6679\\" font-family=\\"monospace\\">" +
        label + "</text>";
      yTicksHtml += "<line x1=\\"" + padX + "\\" y1=\\"" + ty +
        "\\" x2=\\"" + (padX + plotW) + "\\" y2=\\"" + ty +
        "\\" stroke=\\"#232b38\\" stroke-width=\\"0.5\\" opacity=\\"0.6\\"/>";
    }

    // Threshold annotations (only render if visible in plot range).
    var thresh1Y = padTop + plotH - (2500 / maxLat) * plotH;
    var thresh2Y = padTop + plotH - (5000 / maxLat) * plotH;
    var threshHtml = "";
    if (thresh1Y >= padTop && thresh1Y <= padTop + plotH) {
      threshHtml += "<line x1=\\"" + padX + "\\" y1=\\"" + thresh1Y +
        "\\" x2=\\"" + (padX + plotW) + "\\" y2=\\"" + thresh1Y +
        "\\" stroke=\\"#f0b400\\" stroke-width=\\"0.7\\" stroke-dasharray=\\"3,3\\" opacity=\\"0.7\\"/>";
    }
    if (thresh2Y >= padTop && thresh2Y <= padTop + plotH) {
      threshHtml += "<line x1=\\"" + padX + "\\" y1=\\"" + thresh2Y +
        "\\" x2=\\"" + (padX + plotW) + "\\" y2=\\"" + thresh2Y +
        "\\" stroke=\\"#ff4d5e\\" stroke-width=\\"0.7\\" stroke-dasharray=\\"3,3\\" opacity=\\"0.7\\"/>";
    }

    // X-axis label
    var xLabel = "<text x=\\"" + (padX + plotW / 2) + "\\" y=\\"" + (h - 4) +
      "\\" text-anchor=\\"middle\\" font-size=\\"10\\" fill=\\"#5b6679\\" font-family=\\"monospace\\">probe sample (oldest → newest, " +
      history.length + " of 24 max)</text>";

    // Y-axis label (rotated)
    var yLabel = "<text x=\\"14\\" y=\\"" + (padTop + plotH / 2) +
      "\\" transform=\\"rotate(-90 14," + (padTop + plotH / 2) +
      ")\\" text-anchor=\\"middle\\" font-size=\\"10\\" fill=\\"#5b6679\\" font-family=\\"monospace\\">latency</text>";

    var legend = "<div class=\\"modal-chart-legend\\">" +
      "<span class=\\"modal-chart-legend-item\\"><span class=\\"modal-chart-legend-dot\\" style=\\"background:#2ed573\\"></span>healthy</span>" +
      "<span class=\\"modal-chart-legend-item\\"><span class=\\"modal-chart-legend-dot\\" style=\\"background:#f0b400\\"></span>degraded</span>" +
      "<span class=\\"modal-chart-legend-item\\"><span class=\\"modal-chart-legend-dot\\" style=\\"background:#ff4d5e\\"></span>down</span>" +
      "<span class=\\"modal-chart-legend-item\\"><span class=\\"modal-chart-legend-dot\\" style=\\"background:#6b7689\\"></span>unknown</span>" +
      "<span class=\\"modal-chart-legend-item\\" style=\\"color:#f0b400\\"><span class=\\"modal-chart-legend-dash\\"></span>2.5s degraded threshold</span>" +
      "<span class=\\"modal-chart-legend-item\\" style=\\"color:#ff4d5e\\"><span class=\\"modal-chart-legend-dash\\"></span>5s down threshold</span>" +
      "</div>";

    return "<svg class=\\"modal-chart-svg\\" viewBox=\\"0 0 " + w + " " + h +
      "\\" preserveAspectRatio=\\"xMidYMid meet\\">" +
      yTicksHtml +
      threshHtml +
      "<path d=\\"" + pathParts.join(" ") +
      "\\" fill=\\"none\\" stroke=\\"#38b6ff\\" stroke-width=\\"1.5\\"/>" +
      pointMarkers.join("") +
      yLabel +
      xLabel +
      "</svg>" +
      legend;
  }

  // Modal stat row: 4 stats showing uptime, p50/p95 latency, trend.
  function renderChartStats(stats) {
    if (!stats) return "";
    var uptimeClass = stats.uptime_pct === 100 ? "good" :
                      stats.uptime_pct < 70 ? "bad" : "neutral";
    var trendIcon = stats.trend === "improving" ? "↘ improving" :
                    stats.trend === "degrading" ? "↗ degrading" : "→ stable";
    var trendClass = stats.trend === "improving" ? "good" :
                     stats.trend === "degrading" ? "bad" : "neutral";
    var p50 = stats.p50_ms !== null ? stats.p50_ms + " ms" : "—";
    var p95 = stats.p95_ms !== null ? stats.p95_ms + " ms" : "—";
    return "<div class=\\"modal-chart-stats\\">" +
      "<div class=\\"modal-chart-stat\\"><div class=\\"modal-chart-stat-label\\">uptime</div><div class=\\"modal-chart-stat-value " + uptimeClass + "\\">" + stats.uptime_pct + "%</div></div>" +
      "<div class=\\"modal-chart-stat\\"><div class=\\"modal-chart-stat-label\\">p50 latency</div><div class=\\"modal-chart-stat-value\\">" + p50 + "</div></div>" +
      "<div class=\\"modal-chart-stat\\"><div class=\\"modal-chart-stat-label\\">p95 latency</div><div class=\\"modal-chart-stat-value\\">" + p95 + "</div></div>" +
      "<div class=\\"modal-chart-stat\\"><div class=\\"modal-chart-stat-label\\">trend</div><div class=\\"modal-chart-stat-value " + trendClass + "\\">" + trendIcon + "</div></div>" +
      "</div>";
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
      var dpSingle = history[0];
      var ttSingle = (dpSingle.ts || "?") + " | " + bucket + " | " +
        (typeof dpSingle.latency_ms === "number" ? dpSingle.latency_ms + "ms" : "—");
      return "<svg class=\\"vc-spark\\" width=\\"100%\\" height=\\"24\\" viewBox=\\"0 0 100 24\\" preserveAspectRatio=\\"none\\">" +
        "<circle cx=\\"50\\" cy=\\"12\\" r=\\"3\\" fill=\\"" + bucketColor(bucket) + "\\"><title>" +
        escapeHtml(ttSingle) + "</title></circle></svg>";
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
    var hoverDots = [];
    for (var j = 0; j < history.length; j++) {
      var x = j * step;
      var lat = history[j].latency_ms;
      var y = (typeof lat === "number") ? (h - (lat / maxLat) * h * 0.85 - 2) : (h / 2);
      pts.push(x.toFixed(1) + "," + y.toFixed(1));
      // Invisible-but-larger hover targets at each datapoint with a
      // native SVG <title> for hover tooltip. r=3 gives a generous hit
      // box; the visible polyline already shows the trend, so the dot
      // stays at low opacity (0.001 = effectively invisible). Browsers
      // render <title> as a tooltip on hover.
      var dpForTitle = history[j];
      var ttText = (dpForTitle.ts || "?") + " | " +
        (dpForTitle.health_bucket || "unknown") + " | " +
        (typeof dpForTitle.latency_ms === "number" ? dpForTitle.latency_ms + "ms" : "—");
      hoverDots.push(
        "<circle cx=\\"" + x.toFixed(1) + "\\" cy=\\"" + y.toFixed(1) +
        "\\" r=\\"3\\" fill=\\"" + bucketColor(dpForTitle.health_bucket || "unknown") +
        "\\" opacity=\\"0.55\\"><title>" + escapeHtml(ttText) + "</title></circle>"
      );
    }
    var lastBucket = history[history.length - 1].health_bucket || "unknown";
    var color = bucketColor(lastBucket);
    return "<svg class=\\"vc-spark\\" width=\\"100%\\" height=\\"24\\" viewBox=\\"0 0 100 24\\" preserveAspectRatio=\\"none\\">" +
      "<polyline fill=\\"none\\" stroke=\\"" + color + "\\" stroke-width=\\"1.5\\" points=\\"" + pts.join(" ") + "\\"/>" +
      hoverDots.join("") +
      "</svg>";
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
      "  " + renderTrendPills(computeTrendStats(history)) +
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

    // Time-series chart + stat row (replaces the old <pre> text dump).
    // Both render from the same KV ring buffer; the chart fades in the
    // moment a probe lands. The window filter slices the tail of the
    // history before rendering — "all" = full 24, "12" = last 12, etc.
    state._modalAgentId = agentId;
    state._modalWindow = state._modalWindow || "all";
    _renderModalChartForWindow();
    elModalTools.innerHTML = "<span class=\\"modal-tool\\">tools list captured at probe time, see /agents/registry for full list</span>";
    // Sync window-filter button active state
    document.querySelectorAll("[data-window]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-window") === state._modalWindow);
    });

    elModalBackdrop.classList.add("is-open");
  }
  // Time-window-aware chart re-render. Driven by state._modalAgentId
  // and state._modalWindow; called on modal open, window switch, and
  // reprobe completion.
  function _renderModalChartForWindow() {
    var agentId = state._modalAgentId;
    if (!agentId) return;
    var hist = state.histories[agentId] || [];
    var window = state._modalWindow || "all";
    // Time-based slice: window value is "all" or a minute count
    // ("60" = last hour, "1440" = last 24 hours). Filters by ts.
    var sliced;
    if (window === "all" || isNaN(parseInt(window, 10))) {
      sliced = hist;
    } else {
      var minutes = parseInt(window, 10);
      var cutoffMs = Date.now() - minutes * 60 * 1000;
      sliced = hist.filter(function (d) {
        if (!d || !d.ts) return false;
        var t = Date.parse(d.ts);
        return !isNaN(t) && t >= cutoffMs;
      });
    }
    var stats = computeTrendStats(sliced);
    elModalChartStats.innerHTML = renderChartStats(stats);
    elModalChartHost.innerHTML = renderHistoryChart(sliced);
  }
  // Wire window-filter buttons (one-time)
  document.querySelectorAll("[data-window]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state._modalWindow = btn.getAttribute("data-window");
      document.querySelectorAll("[data-window]").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      _renderModalChartForWindow();
    });
  });
  // Wire in-modal re-probe button — runs reprobeOne for the open agent,
  // shows loading state, refreshes the modal in place when done.
  var elModalReprobe = document.getElementById("modal-reprobe");
  if (elModalReprobe) {
    elModalReprobe.addEventListener("click", async function () {
      var agentId = state._modalAgentId;
      if (!agentId) return;
      elModalReprobe.disabled = true;
      elModalReprobe.classList.add("is-loading");
      var origText = elModalReprobe.textContent;
      elModalReprobe.textContent = "Probing";
      try {
        await reprobeOne(agentId);
        // Re-render the open modal with fresh data
        openModal(agentId);
      } catch (e) {
        console.error("modal reprobe failed", e);
      } finally {
        elModalReprobe.disabled = false;
        elModalReprobe.classList.remove("is-loading");
        elModalReprobe.textContent = origText;
      }
    });
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
      // Sec-31u: auto-refresh open modal so its chart picks up the new
      // datapoint without requiring the user to close + reopen.
      if (elModalBackdrop.classList.contains("is-open") && state._modalAgentId) {
        // Re-render via openModal() so all sections (probe, circuit,
        // chart) reflect the updated row + history.
        openModal(state._modalAgentId);
      }
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

  // Page info popover toggle.
  var infoBtn = document.getElementById("page-info-btn");
  var infoPopover = document.getElementById("page-info-popover");
  if (infoBtn && infoPopover) {
    infoBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      var open = infoPopover.classList.toggle("is-open");
      infoBtn.classList.toggle("is-open", open);
    });
    document.addEventListener("click", function(e) {
      var t = e.target;
      if (t === infoBtn || (t && t.closest && (t.closest("#page-info-btn") || t.closest("#page-info-popover")))) return;
      infoPopover.classList.remove("is-open");
      infoBtn.classList.remove("is-open");
    });
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        infoPopover.classList.remove("is-open");
        infoBtn.classList.remove("is-open");
      }
    });
  }

  // Initial load: metadata-only for fast paint. Operator clicks "Live probe" for the slow fan-out.
  loadSnapshot(false);
})();
</script>

</body>
</html>`;
}
