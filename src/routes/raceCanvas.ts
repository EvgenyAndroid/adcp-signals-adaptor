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
    --accent-dim: rgba(56, 182, 255, 0.15);
    --bg-input: #0d121a;
    --border-faint: #1a2030;
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
  /* Page info popover — same pattern as the main demo's lane-info-*. */
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
  .page-info-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 10px;
  }
  .page-info-steps {
    margin: 0 0 12px;
    padding: 0 0 0 22px;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--text-dim);
  }
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
  .page-info-trace {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    font: 11px var(--font-mono);
    color: var(--text-faint);
    line-height: 1.5;
  }
  .page-info-trace code {
    color: var(--text-dim);
    background: transparent;
    border: none;
    padding: 0;
    font-size: 11px;
  }
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
  /* Try-chips: one-click brief examples below the input. Same pattern
     as demo.ts canvas-quickpicks; reuses [data-brief-target] handler. */
  .try-chips {
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
    margin-top: 10px;
  }
  .try-chips-label {
    font: 10px var(--font-mono);
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-right: 2px;
  }
  .try-chip {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font: 11px var(--font-mono);
    padding: 4px 9px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .try-chip:hover {
    color: var(--accent);
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

  /* ── Disagreement halo overlay (arcs only — text moved to panel) ───── */
  .halo-overlay {
    position: absolute;
    top: 0; left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10;
  }
  .halo-arc {
    animation: arcPulse 2.5s ease-in-out infinite;
  }
  @keyframes arcPulse {
    0%, 100% { opacity: 0.85; }
    50%      { opacity: 0.55; }
  }

  /* ── Disagreements panel (replaces inline callouts) ────────────────── */
  .disagreements-panel {
    margin-top: 16px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    display: none;
  }
  .disagreements-panel.is-active { display: block; }
  .disagreements-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .disagreements-panel-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .disagreements-panel-meta {
    font: 11px/1 var(--font-mono);
    color: var(--text-faint);
  }
  .disagreements-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .disagreement-card {
    border-left: 4px solid var(--block);
    background: var(--bg);
    border-radius: 6px;
    padding: 12px 14px;
    opacity: 0;
    animation: fadeInRow 0.35s ease-out forwards;
  }
  .disagreement-card.warn { border-left-color: var(--warn); }
  .disagreement-card.minor { border-left-color: var(--accent); }
  .disagreement-card-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }
  .disagreement-badge {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    background: var(--block);
    color: #0a0d12;
    font: 700 10px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .disagreement-card.warn .disagreement-badge { background: var(--warn); }
  .disagreement-card.minor .disagreement-badge { background: var(--accent); }
  .disagreement-field {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .disagreement-rationale {
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-dim);
    margin-bottom: 8px;
  }
  .disagreement-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }
  .vendor-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 4px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    font: 11px/1 var(--font-mono);
    color: var(--text);
  }
  .vendor-chip-value {
    color: var(--text-dim);
    margin-left: 4px;
  }
  .disagreement-reconcile {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    line-height: 1.5;
    color: var(--text);
    display: none;
  }
  .disagreement-reconcile.is-active {
    display: block;
    animation: fadeInRow 0.4s ease-out;
  }
  .disagreement-reconcile-label {
    font: 10px/1 var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin-bottom: 4px;
  }
  .disagreement-reconcile-pending {
    color: var(--text-faint);
    font-style: italic;
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

  /* ── Empty state ───────────────────────────────────────────────────── */
  .empty-state {
    color: var(--text-faint);
    font-size: 13px;
    text-align: center;
    padding: 40px 20px;
  }

  /* Sec-31u: Trace inspector — minimal port of the main demo's
     trace inspector for the Race Canvas page. */
  .race-trace-trigger {
    position: fixed; bottom: 20px; right: 20px;
    display: flex; align-items: center; gap: 6px;
    padding: 9px 14px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    color: var(--accent);
    font: 11px var(--font-mono);
    cursor: pointer;
    box-shadow: 0 6px 18px rgba(0,0,0,0.32);
    z-index: 90;
    transition: all 0.15s;
  }
  .race-trace-trigger:hover { transform: translateY(-1px); border-color: var(--accent); }
  .race-trace-trigger.is-pulsing {
    animation: race-trace-pulse 1.6s ease-in-out 3;
    border-color: var(--accent);
  }
  @keyframes race-trace-pulse {
    0%   { box-shadow: 0 6px 18px rgba(0,0,0,0.32), 0 0 0 0 var(--accent); }
    35%  { box-shadow: 0 6px 18px rgba(0,0,0,0.32), 0 0 0 14px transparent; }
    100% { box-shadow: 0 6px 18px rgba(0,0,0,0.32), 0 0 0 0 transparent; }
  }
  .race-trace-panel {
    position: fixed; top: 0; bottom: 0; right: 0;
    width: 420px; max-width: 92vw;
    background: var(--bg-elevated);
    border-left: 1px solid var(--border-strong);
    box-shadow: -8px 0 24px rgba(0,0,0,0.4);
    z-index: 100;
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .race-trace-panel.is-open { transform: translateX(0); }
  .race-trace-panel-head {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    color: var(--text);
  }
  .race-trace-panel-head button {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
    padding: 4px 10px;
    border-radius: 4px;
    font: 11px var(--font-mono);
    cursor: pointer;
  }
  .race-trace-panel-head button:hover { border-color: var(--accent); color: var(--accent); }
  .race-trace-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px 18px;
    color: var(--text);
  }
  .race-trace-empty {
    color: var(--text-faint);
    font: 12px var(--font-mono);
    padding: 20px 0;
  }
  .race-trace-head {
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-faint);
  }
  .race-trace-head .op {
    font-size: 14px; font-weight: 600; color: var(--text);
    margin-bottom: 2px;
  }
  .race-trace-head .meta {
    font: 11px var(--font-mono); color: var(--text-faint);
  }
  .race-trace-step {
    background: var(--bg);
    border: 1px solid var(--border-faint);
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }
  .race-trace-step-head {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 6px;
  }
  .race-trace-step-head .step-idx {
    font: 700 10px var(--font-mono);
    background: var(--accent-dim);
    color: var(--accent);
    padding: 2px 7px;
    border-radius: 999px;
  }
  .race-trace-step-head .step-label {
    flex: 1;
    font: 12.5px var(--font-mono);
    color: var(--text);
  }
  .race-trace-step-head .step-dur {
    font: 11px var(--font-mono);
    color: var(--text-faint);
  }
  .race-trace-detail {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 6px;
    font: 11px var(--font-mono);
    line-height: 1.4;
    padding: 2px 0;
  }
  .race-trace-detail .k { color: var(--text-faint); }
  .race-trace-detail .v { color: var(--text); word-break: break-all; }
  .race-trace-note {
    margin-top: 6px;
    font: 11px var(--font-mono);
    color: var(--text-faint);
    font-style: italic;
    padding: 6px 8px;
    background: var(--bg-input);
    border-radius: 4px;
  }
</style>
</head>
<body>

<div class="app">
  <header class="header">
    <a class="header-back" href="/">&larr; Back to Signals</a>
    <button class="try-chip" id="race-signal-traces" style="margin-left:auto;border-color:var(--accent);color:var(--accent)">{ } Signal traces</button>
    <div class="header-title-block">
      <div class="header-title-row">
        <div class="header-title">Race <span class="accent">Canvas</span></div>
        <button class="page-info-btn" id="page-info-btn" title="How this works" aria-label="How Race Canvas works">
          <svg viewBox="0 0 20 20" width="14" height="14"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="10" y1="9" x2="10" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="6.5" r="0.8" fill="currentColor"/></svg>
        </button>
        <div class="page-info-popover" id="page-info-popover" role="dialog">
          <div class="page-info-title">How Race Canvas works</div>
          <ol class="page-info-steps">
            <li><strong>Parallel race.</strong> 6 vendor agents probed in parallel against the same brief; each returns audience_size, sensitive_category_verdict, recommended_bid_floor, governance_outcome.</li>
            <li><strong>Disagreement halo.</strong> Detector compares responses on 4 fields. Numeric: ±15% threshold (audience), ±20% (bid floor). Categorical: any difference triggers. Severity: blocking / material / minor maps to red / yellow / blue arc.</li>
            <li><strong>Reconciliation.</strong> Median across vendors for numeric; conservative-pick (worst-of) for categorical. Audit receipts (FNV-1a hash of input/output) stack in the right sidebar — click any to inspect raw payload.</li>
          </ol>
          <div class="page-info-trace">Code: <code>/race/start</code> → <code>synthesizeVendorResponse</code> → <code>detectDisagreements</code></div>
        </div>
      </div>
      <div class="header-sub">multi-agent orchestration / disagreement halo / audit receipts</div>
    </div>
    <div class="header-spacer"></div>
    <div class="header-sub">May 7 workshop / iHeartMedia</div>
  </header>

  <main class="main">
    <div class="controls">
      <div class="controls-label">Brief</div>
      <div class="controls-row">
        <input id="brief-input" class="brief-input" placeholder="e.g., Coca-Cola Summer Refresh, $250K, 30 days, ROAS 3.5x"/>
        <button id="btn-start" class="btn">Start race</button>
        <button id="btn-clear" class="btn btn-ghost">Clear</button>
      </div>
      <div class="try-chips">
        <span class="try-chips-label">try:</span>
        <button class="try-chip" data-brief-target="brief-input">Coca-Cola Summer Refresh, $250K, 30 days, ROAS 3.5x</button>
        <button class="try-chip" data-brief-target="brief-input">luxury travelers APAC trips, $500K, 60 days</button>
        <button class="try-chip" data-brief-target="brief-input">Nike running shoes launch, ROAS 3.0</button>
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

    <div class="disagreements-panel" id="disagreements-panel">
      <div class="disagreements-panel-header">
        <div class="disagreements-panel-title">Disagreements detected</div>
        <div class="disagreements-panel-meta" id="disagreements-meta"></div>
      </div>
      <div class="disagreements-list" id="disagreements-list"></div>
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

<!-- Race Canvas Signal traces overlay — slim version of the demo's
     shared viewer, fetches /api/signal-traces and renders a list. -->
<div class="modal-backdrop" id="signal-trace-backdrop" style="display:none">
  <div class="modal" style="max-width:920px;width:96vw;max-height:88vh;overflow-y:auto">
    <div class="modal-title">Signal traces · raw protocol JSON</div>
    <div class="modal-sub" style="opacity:0.7">Get_signals + activate_signal request/response captures with schema validation. Refresh to pull latest.</div>
    <button class="modal-close" id="signal-trace-modal-close">close</button>
    <div style="margin-top:14px"><button class="try-chip" id="signal-trace-refresh">↻ refresh</button></div>
    <div id="signal-trace-list" style="margin-top:12px;font:11.5px ui-monospace,Menlo,Consolas,monospace">loading…</div>
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
    raceComplete: false,
    // Counts arcs already drawn per "minId|maxId" pair so we can offset
    // subsequent arcs and keep them visually distinct.
    arcsByPair: {},
    disagreementCount: 0
  };

  // ── DOM refs ────────────────────────────────────────────────────────
  var elBriefInput = document.getElementById("brief-input");
  var elBtnStart = document.getElementById("btn-start");
  var elBtnClear = document.getElementById("btn-clear");
  var elRows = document.getElementById("vendor-rows");
  var elReceipts = document.getElementById("receipt-list");
  var elRaceMeta = document.getElementById("race-meta");
  var elHalo = document.getElementById("halo-overlay");
  var elDisagreementsPanel = document.getElementById("disagreements-panel");
  var elDisagreementsList = document.getElementById("disagreements-list");
  var elDisagreementsMeta = document.getElementById("disagreements-meta");
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
  // Track how many arcs have been drawn for each (rowA,rowB) pair so we can
  // offset subsequent arcs' curve depth — same pair gets visually distinct
  // arcs instead of overlapping into a single line. Keyed by canonical
  // "minId|maxId" so AB and BA hash the same.
  function pairKey(idA, idB) {
    return idA < idB ? idA + "|" + idB : idB + "|" + idA;
  }

  function renderHaloArc(disagreement) {
    if (!disagreement.conflict_pair || disagreement.conflict_pair.length < 2) return;
    var idA = disagreement.conflict_pair[0].vendor_id;
    var idB = disagreement.conflict_pair[1].vendor_id;
    var rowA = state.rowsByVendor[idA];
    var rowB = state.rowsByVendor[idB];
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

    // Per-pair offset: 1st arc at 60px out, 2nd at 110px, 3rd at 160px, ...
    var key = pairKey(idA, idB);
    var prevCount = state.arcsByPair[key] || 0;
    state.arcsByPair[key] = prevCount + 1;
    var depth = 60 + prevCount * 50;
    var cx = Math.min(ax, bx) - depth;
    var cy = (ay + by) / 2;

    var color = disagreement.severity === "blocking" ? "#ff4d5e" :
                disagreement.severity === "material" ? "#f0b400" : "#38b6ff";

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
  }

  // Render a card in the Disagreements panel. The card stays visible
  // through reconciliation; reconcile_done updates the inline reconciled
  // value rather than appending elsewhere.
  function renderDisagreementCard(disagreement) {
    if (!elDisagreementsPanel.classList.contains("is-active")) {
      elDisagreementsPanel.classList.add("is-active");
      elDisagreementsList.innerHTML = "";
    }
    state.disagreementCount++;
    elDisagreementsMeta.textContent = state.disagreementCount + " field(s) in conflict";

    var card = document.createElement("div");
    var sevClass = disagreement.severity === "minor" ? "minor" : disagreement.severity === "material" ? "warn" : "";
    card.className = "disagreement-card " + sevClass;
    card.setAttribute("data-field", disagreement.field);

    var chipsHtml = "";
    if (Array.isArray(disagreement.all_values)) {
      for (var i = 0; i < disagreement.all_values.length; i++) {
        var v = disagreement.all_values[i];
        var vendorObj = state.vendors.find ? state.vendors.find(function(x){ return x.id === v.vendor_id; }) : null;
        var vendorName = vendorObj ? vendorObj.name : v.vendor_id;
        var displayValue = formatFieldValue(disagreement.field, v.value);
        chipsHtml += "<span class=\\"vendor-chip\\">" + escapeHtml(vendorName) +
                     "<span class=\\"vendor-chip-value\\">" + escapeHtml(displayValue) + "</span></span>";
      }
    }

    card.innerHTML =
      "<div class=\\"disagreement-card-head\\">" +
      "  <span class=\\"disagreement-badge\\">" + escapeHtml(disagreement.severity) + "</span>" +
      "  <span class=\\"disagreement-field\\">" + escapeHtml(disagreement.field_label) + "</span>" +
      "</div>" +
      "<div class=\\"disagreement-rationale\\">" + escapeHtml(disagreement.rationale) + "</div>" +
      "<div class=\\"disagreement-chips\\">" + chipsHtml + "</div>" +
      "<div class=\\"disagreement-reconcile\\" data-reconcile>" +
      "  <div class=\\"disagreement-reconcile-label\\">Claude reconciles</div>" +
      "  <div class=\\"disagreement-reconcile-pending\\" data-reconcile-body>reconciliation queued...</div>" +
      "</div>";
    elDisagreementsList.appendChild(card);
  }

  // Format a value for display in a vendor chip — same rules as the server
  // formatter but client-side so we don't have to round-trip the formatted
  // string.
  function formatFieldValue(field, value) {
    if (field === "audience_size" && typeof value === "number") return fmtAudience(value);
    if (field === "recommended_bid_floor_cents" && typeof value === "number") return fmtFloor(value) + " CPM";
    return String(value);
  }

  // Update the matching card's reconcile section when reconcile_done fires.
  function applyReconcileToCard(field, reconciledValue, reconcileRationale) {
    var card = elDisagreementsList.querySelector("[data-field=\\"" + field + "\\"]");
    if (!card) return;
    var reconcileBlock = card.querySelector("[data-reconcile]");
    var reconcileBody = card.querySelector("[data-reconcile-body]");
    if (!reconcileBlock || !reconcileBody) return;
    reconcileBlock.classList.add("is-active");
    reconcileBody.classList.remove("disagreement-reconcile-pending");
    var displayValue = formatFieldValue(field, reconciledValue);
    reconcileBody.innerHTML =
      "<strong>&rarr; " + escapeHtml(displayValue) + "</strong> &middot; " +
      "<span style=\\"color:var(--text-dim)\\">" + escapeHtml(reconcileRationale) + "</span>";
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
        // Two views in lockstep: the halo arc on the race board (visual
        // link to the conflict pair) + a card in the panel below (full
        // rationale + chips + reconciliation slot).
        renderHaloArc(ev.disagreement);
        renderDisagreementCard(ev.disagreement);
        break;
      case "reconcile_started":
        elRaceMeta.textContent = "reconciling " + ev.field_label + "...";
        break;
      case "reconcile_done":
        applyReconcileToCard(ev.field, ev.reconciled_value, ev.reconcile_rationale);
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
    state.arcsByPair = {};
    state.disagreementCount = 0;
    elHalo.innerHTML = "";
    elReceipts.innerHTML = "<div class=\\"receipt-card-empty\\">Receipts will appear here as vendors respond...</div>";
    elDisagreementsPanel.classList.remove("is-active");
    elDisagreementsList.innerHTML = "";
    elDisagreementsMeta.textContent = "";
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

      // Render any new disagreements — both arc on the board and card
      // in the panel. /race/add-vendor returns disagreements that touch
      // the newly added vendor, so each one is genuinely new info.
      if (data.new_disagreements && data.new_disagreements.length > 0) {
        data.new_disagreements.forEach(function(d, i) {
          setTimeout(function(){
            renderHaloArc(d);
            renderDisagreementCard(d);
          }, 300 + i * 200);
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
  // Try-chips: one-click fill the brief input.
  document.querySelectorAll("[data-brief-target]").forEach(function(b) {
    b.addEventListener("click", function() {
      var targetId = b.getAttribute("data-brief-target");
      var t = targetId ? document.getElementById(targetId) : null;
      if (!t) return;
      t.value = (b.textContent || "").trim();
      t.focus();
    });
  });

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
  elAddBtn.addEventListener("click", addVendor);
  elBriefInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") startRace();
  });

  console.log("Race Canvas ready");

  // Sec-31u: trace inspector integration. Wraps window.fetch so any
  // /race/* response with a _trace field is captured. Trigger button
  // (bottom-right) opens a slide-in panel showing the most recent
  // trace formatted as steps + raw JSON.
  var __raceLastTrace = null;
  var __raceOrigFetch = window.fetch;
  window.fetch = async function () {
    var resp = await __raceOrigFetch.apply(this, arguments);
    try {
      var ct = resp.headers && resp.headers.get && resp.headers.get("content-type") || "";
      if (ct.toLowerCase().indexOf("application/json") >= 0 && resp.ok) {
        var body = await resp.clone().json();
        if (body && body._trace) {
          __raceLastTrace = body._trace;
          var trig = document.getElementById("race-trace-trigger");
          if (trig) {
            trig.style.display = "flex";
            trig.classList.remove("is-pulsing");
            void trig.offsetWidth;
            trig.classList.add("is-pulsing");
          }
        }
      }
    } catch (e) { /* non-fatal */ }
    return resp;
  };

  function _raceFmtMs(ms) {
    if (typeof ms !== "number") return "—";
    if (ms < 1) return ms.toFixed(2) + "ms";
    if (ms < 1000) return Math.round(ms) + "ms";
    return (ms / 1000).toFixed(2) + "s";
  }
  function _raceRenderTrace(t) {
    if (!t) return "<div class=\\"race-trace-empty\\">No trace captured yet — run a race or add a vendor to see one.</div>";
    var steps = (t.steps || []).map(function (s, i) {
      var details = (s.details || []).map(function (d) {
        return "<div class=\\"race-trace-detail\\"><span class=\\"k\\">" + escapeHtml(d.k) + "</span><span class=\\"v\\">" + escapeHtml(d.v) + "</span></div>";
      }).join("");
      return "<div class=\\"race-trace-step\\">" +
        "<div class=\\"race-trace-step-head\\"><span class=\\"step-idx\\">" + (i + 1) + "</span><span class=\\"step-label\\">" + escapeHtml(s.label || s.id) + "</span><span class=\\"step-dur\\">" + _raceFmtMs(s.duration_ms) + "</span></div>" +
        (details ? "<div class=\\"race-trace-details\\">" + details + "</div>" : "") +
        (s.note ? "<div class=\\"race-trace-note\\">" + escapeHtml(s.note) + "</div>" : "") +
      "</div>";
    }).join("");
    return "<div class=\\"race-trace-head\\">" +
        "<div class=\\"op\\">" + escapeHtml(t.operation || "trace") + "</div>" +
        "<div class=\\"meta mono\\">" + _raceFmtMs(t.duration_ms) + " · " + (t.steps || []).length + " step(s) · " + (t.ts || "") + "</div>" +
      "</div>" +
      "<div class=\\"race-trace-steps\\">" + steps + "</div>";
  }
  document.getElementById("race-trace-trigger").addEventListener("click", function () {
    var panel = document.getElementById("race-trace-panel");
    panel.classList.add("is-open");
    document.getElementById("race-trace-body").innerHTML = _raceRenderTrace(__raceLastTrace);
  });
  document.getElementById("race-trace-close").addEventListener("click", function () {
    document.getElementById("race-trace-panel").classList.remove("is-open");
  });
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>\\"']/g, function (c) { return ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"})[c]; }); }

  // ── Signal traces overlay ────────────────────────────────────────────
  // Friendly translations matching the main signals-trace-viewer so
  // Race Canvas + the rest of the demo speak the same vocabulary.
  function _raceHumanizeErr(msg) {
    if (!msg) return "(no detail)";
    var m1 = msg.match(/^Instance does not have required property "([^"]+)"\\.?$/);
    if (m1) return 'missing required "' + m1[1] + '"';
    var m2 = msg.match(/^Property "([^"]+)" does not match schema\\.?$/);
    if (m2) return '"' + m2[1] + '" doesn\\'t match expected shape';
    if (/^Items did not match schema\\.?$/.test(msg)) return "array items don\\'t match expected shape";
    if (/^Instance does not match exactly one subschema/.test(msg)) return "doesn\\'t match any of the expected variants (oneOf)";
    if (/^A subschema had errors\\.?$/.test(msg)) return "(see nested errors below)";
    return msg;
  }
  function _raceRenderErrorList(validation) {
    if (!validation || !validation.errors || validation.errors.length === 0) return "";
    var rows = validation.errors.map(function (e) {
      var human = _raceHumanizeErr(e.message);
      return '<div style="font-size:10.5px;line-height:1.55;padding:2px 0;color:#ffbfa3">' +
        '<code style="background:rgba(255,123,123,0.14);color:#ffd7c8;padding:0 4px;border-radius:2px">' + escapeHtml(e.path || "(root)") + '</code> ' +
        escapeHtml(human) +
        ' <span style="color:#ff9b6b;opacity:0.7">[' + escapeHtml(e.keyword) + ']</span>' +
      '</div>';
    }).join("");
    var legend = '<details style="margin:6px 0;font-size:10.5px;color:#9aa6b3">' +
      '<summary style="cursor:pointer">How to read these errors</summary>' +
      '<div style="padding:6px 0 6px 12px;line-height:1.55">' +
        '<div><strong>Path</strong> (e.g. <code>#/signals/0</code>): JSON-Pointer into the payload below. <code>#</code> is the root.</div>' +
        '<div><strong>Keyword</strong> (e.g. <code>[required]</code>, <code>[oneOf]</code>): which JSON-Schema rule the validator applied.</div>' +
        '<div><strong>Schema link</strong> above: opens the canonical AdCP schema we validated against.</div>' +
      '</div>' +
    '</details>';
    return legend + rows;
  }
  function _raceRenderSignalTrace(t, idx) {
    var dirIcon = t.direction === "outbound" ? "→" : "←";
    var sourceShort = t.source.length > 36 ? t.source.slice(0, 33) + "…" : t.source;
    var statusColor = t.response.status === "ok" ? "#5fd9c4" : "#ff7b7b";
    var reqValid = t.request.validation && t.request.validation.valid;
    var resValid = t.response.validation && t.response.validation.valid;
    var reqErrCount = (t.request.validation && t.request.validation.errors || []).length;
    var resErrCount = (t.response.validation && t.response.validation.errors || []).length;
    function badge(ok, errCount) {
      if (ok) return '<span style="color:#5fd9c4">✓ schema</span>';
      return '<span style="color:#ff9b6b">✗ ' + errCount + ' err</span>';
    }
    // Endpoint URL (outbound only) — clickable, matches the main viewer.
    var endpointBlock = "";
    if (t.endpoint_url) {
      var visible = t.endpoint_url;
      try {
        var u = new URL(t.endpoint_url);
        visible = u.host + u.pathname;
        if (visible.length > 48) visible = visible.slice(0, 45) + "…";
      } catch (_) { if (visible.length > 48) visible = visible.slice(0, 45) + "…"; }
      endpointBlock = ' · <a href="' + escapeHtml(t.endpoint_url) + '" target="_blank" rel="noopener" title="' + escapeHtml(t.endpoint_url) + '" style="color:#38b6ff;font-size:10.5px;text-decoration:none">⎘ ' + escapeHtml(visible) + '</a>';
    }
    // Peer version chip — pulled live from MCP initialize.
    var peerVerBlock = "";
    if (t.peer_server_info && (t.peer_server_info.version || t.peer_server_info.name)) {
      var pv = t.peer_server_info.version || "";
      var pn = t.peer_server_info.name || "";
      var pLabel = pv ? "peer v" + pv : "peer";
      var pTitle = (pn ? pn + " · " : "") + (pv ? "version " + pv : "version unknown") +
        " (advertised by the peer in the MCP initialize handshake)";
      peerVerBlock = ' · <span style="color:#ffcb5c;font-size:10.5px;background:rgba(255,203,92,0.12);padding:1px 6px;border-radius:3px" title="' + escapeHtml(pTitle) + '">' + escapeHtml(pLabel) + '</span>';
    }
    return '<details style="margin-bottom:10px;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:4px">' +
      '<summary style="cursor:pointer;font-size:12px;line-height:1.7">' +
        '<strong>' + escapeHtml(t.tool_name) + '</strong> · ' + dirIcon + ' ' + escapeHtml(sourceShort) +
        endpointBlock +
        peerVerBlock +
        ' · <span style="color:' + statusColor + '">' + escapeHtml(t.response.status) + '</span>' +
        ' · ' + t.duration_ms + 'ms · ' + new Date(t.ts).toLocaleTimeString() +
        ' · ' + badge(reqValid, reqErrCount) + ' req · ' + badge(resValid, resErrCount) + ' res' +
      '</summary>' +
      '<div style="margin-top:8px"><strong style="font-size:10px;letter-spacing:0.1em">REQUEST</strong>' +
        ' · validating against <a href="' + escapeHtml(t.request.validation.schema_url) + '" target="_blank" style="color:#38b6ff;font-size:10px">' + escapeHtml(t.request.validation.schema_url.split("/").slice(-2).join("/")) + ' ↗</a></div>' +
      _raceRenderErrorList(t.request.validation) +
      '<pre style="background:rgba(0,0,0,0.4);padding:8px;border-radius:3px;max-height:240px;overflow:auto;font-size:10.5px;white-space:pre-wrap;word-break:break-all">' + escapeHtml(JSON.stringify(t.request.payload, null, 2)) + '</pre>' +
      '<div><strong style="font-size:10px;letter-spacing:0.1em">RESPONSE</strong>' +
        ' · validating against <a href="' + escapeHtml(t.response.validation.schema_url) + '" target="_blank" style="color:#38b6ff;font-size:10px">' + escapeHtml(t.response.validation.schema_url.split("/").slice(-2).join("/")) + ' ↗</a></div>' +
      _raceRenderErrorList(t.response.validation) +
      '<pre style="background:rgba(0,0,0,0.4);padding:8px;border-radius:3px;max-height:240px;overflow:auto;font-size:10.5px;white-space:pre-wrap;word-break:break-all">' + escapeHtml(JSON.stringify(t.response.payload, null, 2)) + '</pre>' +
    '</details>';
  }
  async function _raceLoadSignalTraces() {
    var listEl = document.getElementById("signal-trace-list");
    listEl.textContent = "loading…";
    try {
      var r = await fetch("/api/signal-traces?limit=25");
      var d = await r.json();
      var traces = (d && d.traces) || [];
      if (traces.length === 0) {
        listEl.innerHTML = '<div style="opacity:0.7;padding:20px;text-align:center">No signal traces buffered yet. Run a race or trigger get_signals/activate_signal from any page.</div>';
        return;
      }
      listEl.innerHTML = traces.map(_raceRenderSignalTrace).join("");
    } catch (e) {
      listEl.textContent = "Failed to load: " + (e && e.message || e);
    }
  }
  document.getElementById("race-signal-traces").addEventListener("click", function () {
    document.getElementById("signal-trace-backdrop").style.display = "flex";
    _raceLoadSignalTraces();
  });
  document.getElementById("signal-trace-modal-close").addEventListener("click", function () {
    document.getElementById("signal-trace-backdrop").style.display = "none";
  });
  document.getElementById("signal-trace-refresh").addEventListener("click", _raceLoadSignalTraces);
  document.getElementById("signal-trace-backdrop").addEventListener("click", function (e) {
    if (e.target === this) this.style.display = "none";
  });
})();
</script>

<!-- Sec-31u: trace inspector for Race Canvas. Trigger appears bottom-right
     once the first traced response lands; panel slides in from right with
     steps formatted from the captured _trace. -->
<button id="race-trace-trigger" class="race-trace-trigger" style="display:none" type="button" aria-label="View trace">
  <svg viewBox="0 0 20 20" width="14" height="14"><circle cx="10" cy="10" r="3" fill="currentColor"/><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.6"/></svg>
  <span>View trace</span>
</button>
<div id="race-trace-panel" class="race-trace-panel" aria-hidden="true">
  <div class="race-trace-panel-head">
    <strong>Trace inspector</strong>
    <button id="race-trace-close" type="button">close</button>
  </div>
  <div id="race-trace-body" class="race-trace-body"></div>
</div>

</body>
</html>`;
}
