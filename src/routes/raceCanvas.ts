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

import { SPEC_VERSION } from "../constants/specVersion";

import { SKIN_TOKENS_CSS, THEME_HEAD_SCRIPT } from "../demo/skins";

export function handleRaceCanvas(env: { DEMO_API_KEY: string }): Response {
  return new Response(renderRaceCanvas(env.DEMO_API_KEY), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      // style-src + font-src open to Google Fonts for the house typefaces
      // (Fraunces + Inter, the nofluffadvisory.com families), as on /.
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
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
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='2' fill='%238a6d3b'/%3E%3Ccircle cx='8' cy='8' r='5' fill='none' stroke='%238a6d3b' stroke-width='0.8' opacity='0.6'/%3E%3C/svg%3E"/>
${THEME_HEAD_SCRIPT}
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<!-- Non-blocking: media=print keeps the font CSS off the critical path, so
     the page paints on system fonts even if Google Fonts is slow or
     unreachable; onload swaps it in. -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&amp;family=Inter:wght@400..700&amp;display=swap" media="print" onload="this.media='all'"/>
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&amp;family=Inter:wght@400..700&amp;display=swap"/></noscript>
<style>
  /* House style: the three nofluffadvisory.com skins, shared with the
     dashboard (SKIN_TOKENS_CSS, src/demo/skins.ts). Graphite is the default
     on :root; the head script above applies the saved skin. Components
     read the NFA tokens (ink / paper / rule / accent / warm / risk) and
     the few semantic names below, never raw colours.
     Status: accent = responded / verified, warm = elevated / warn /
     material, risk = blocking / restricted. Every state also carries a
     text label. */
  ${SKIN_TOKENS_CSS}
  :root {
    /* Kit (NFA global.css). Depth mixes the skin's own ink; #fff appears
       only inside the two mats. */
    --accent-on-dark: color-mix(in srgb, var(--accent-2) 55%, var(--paper));
    --mat:          color-mix(in srgb, var(--paper) 35%, #fff);
    --mat-sheet:    color-mix(in srgb, var(--paper) 40%, #fff);
    --mat-edge:     color-mix(in srgb, var(--rule) 70%, transparent);
    --shadow-1: 0 1px 1px color-mix(in srgb, var(--ink) 6%, transparent),
                0 10px 22px -14px color-mix(in srgb, var(--ink) 30%, transparent);
    --shadow-2: 0 1px 1px color-mix(in srgb, var(--ink) 8%, transparent),
                0 8px 18px -8px color-mix(in srgb, var(--ink) 30%, transparent),
                0 26px 44px -26px color-mix(in srgb, var(--ink) 38%, transparent);
    --shadow-3: 0 1px 1px color-mix(in srgb, var(--ink) 8%, transparent),
                0 14px 26px -10px color-mix(in srgb, var(--ink) 34%, transparent),
                0 40px 60px -30px color-mix(in srgb, var(--ink) 42%, transparent);
    --shadow-sheet: 0 1px 1px color-mix(in srgb, var(--ink) 5%, transparent),
                    0 30px 60px -36px color-mix(in srgb, var(--ink) 50%, transparent);
    --scrim:        color-mix(in srgb, var(--ink) 38%, transparent);

    /* Semantic names this page and its inline styles read. */
    --bg:            var(--paper);
    --bg-elevated:   color-mix(in srgb, var(--paper-2) 45%, var(--paper));
    --bg-panel:      var(--mat-sheet);
    --bg-input:      var(--mat);
    --border:        var(--rule);
    --border-faint:  color-mix(in srgb, var(--rule) 55%, var(--mat-sheet));
    --border-strong: color-mix(in srgb, var(--ink) 26%, var(--paper));
    --text:          var(--ink);
    --text-dim:      var(--ink-muted);
    --text-faint:    var(--ink-light);
    --accent-dim:    rgba(var(--accent-rgb), 0.10);
    --accent-border: rgba(var(--accent-rgb), 0.38);
    --ok:            var(--accent);
    --warn:          var(--warm);
    --warn-ink:      color-mix(in srgb, var(--warm) 78%, var(--ink));
    --block:         var(--risk);

    --font-serif: 'Fraunces', 'Iowan Old Style', Georgia, serif;
    --font-sans:  'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --font-mono:  ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    --font-ui:    var(--font-sans);
    --font-label: var(--font-sans);
    --label-size:  11px;
    --label-track: 0.14em;
    --stamp-size:  10px;
    --stamp-track: 0.12em;
    --r-print: 2px;
    --r-card:  4px;
    --r-pill:  999px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background: var(--paper);
    color: var(--ink);
    font: 14px/1.5 var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow-x: hidden;
  }
  ::selection { background: rgba(var(--accent-rgb), 0.2); }
  :where(a, button, input, select, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  code, pre { font-family: var(--font-mono); }
  .app {
    display: grid;
    grid-template-columns: 1fr 380px;
    grid-template-rows: auto 1fr;
    height: 100vh;
    gap: 0;
  }
  .header {
    grid-column: 1 / -1;
    padding: 14px 28px 14px 24px;
    border-bottom: 1px solid var(--rule);
    background: var(--paper);
    display: flex;
    align-items: center;
    gap: 16px;
  }
  /* Page title: Fraunces, the NFA heading face, in ink (the wordmark). */
  .header-title {
    font-family: var(--font-serif);
    font-size: 26px;
    font-weight: 600;
    line-height: 1.08;
    letter-spacing: -0.022em;
    font-variation-settings: 'opsz' 80;
    color: var(--ink);
  }
  .header-title .accent { color: var(--ink); }
  /* Mono caps labels with the house tracking. */
  .header-sub {
    margin-top: 5px;
    font: 600 var(--label-size)/1.4 var(--font-label);
    text-transform: uppercase;
    letter-spacing: var(--label-track);
    color: var(--ink-light);
  }
  .header-back {
    color: var(--ink);
    text-decoration: none;
    font: 500 13px var(--font-sans);
    border: 1px solid var(--border-strong);
    padding: 7px 13px;
    border-radius: var(--r-print);
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .header-back:hover {
    background: var(--paper-2);
    border-color: var(--accent);
    color: var(--accent);
  }
  .header-spacer { flex: 1; }
  /* Page info popover — same pattern as the main demo's lane-info-*. */
  .header-title-block { position: relative; }
  .header-title-row { display: flex; align-items: center; gap: 10px; }
  .page-info-btn {
    width: 24px; height: 24px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 50%;
    background: transparent;
    border: 1px solid transparent;
    color: var(--ink-light);
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
  }
  .page-info-btn:hover {
    background: var(--paper-2);
    color: var(--accent);
    border-color: var(--accent-border);
  }
  .page-info-btn.is-open {
    background: var(--accent-dim);
    color: var(--accent);
    border-color: var(--accent-border);
  }
  .page-info-popover {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 50;
    width: 420px;
    max-width: calc(100vw - 32px);
    background: var(--mat-sheet);
    border: 1px solid var(--rule);
    border-radius: var(--r-card);
    padding: 16px 18px 14px;
    box-shadow: var(--shadow-2);
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
    background: var(--mat-sheet);
    border-top: 1px solid var(--rule);
    border-left: 1px solid var(--rule);
    transform: rotate(45deg);
  }
  .page-info-title {
    font-family: var(--font-serif);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.012em;
    color: var(--ink);
    margin-bottom: 10px;
  }
  .page-info-steps {
    margin: 0 0 12px;
    padding: 0 0 0 22px;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--ink-muted);
  }
  .page-info-steps li { margin-bottom: 8px; }
  .page-info-steps li:last-child { margin-bottom: 0; }
  .page-info-steps strong { color: var(--ink); }
  .page-info-steps code {
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: var(--r-print);
    padding: 1px 5px;
    font-size: 11px;
    color: var(--accent);
  }
  .page-info-trace {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--rule);
    font: 11px var(--font-mono);
    color: var(--ink-light);
    line-height: 1.5;
  }
  .page-info-trace code {
    color: var(--ink-muted);
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
    border-left: 1px solid var(--rule);
    background: var(--bg-elevated);
    overflow-y: auto;
    padding: 22px 20px;
  }

  /* ── Brief input + control bar (a paper sheet on the ground) ───────── */
  .controls {
    background: var(--mat-sheet);
    border: 1px solid var(--mat-edge);
    border-radius: var(--r-card);
    box-shadow: var(--shadow-1);
    padding: 16px 18px;
    margin-bottom: 20px;
  }
  .controls-row {
    display: flex;
    gap: 10px;
    align-items: stretch;
  }
  .controls-label {
    font: 600 var(--label-size)/1.4 var(--font-label);
    text-transform: uppercase;
    letter-spacing: var(--label-track);
    color: var(--accent);
    margin-bottom: 8px;
  }
  .brief-input {
    flex: 1;
    background: var(--mat);
    border: 1px solid var(--rule);
    color: var(--ink);
    padding: 10px 14px;
    border-radius: var(--r-print);
    font: 14px/1.4 var(--font-sans);
    transition: border-color 0.15s;
  }
  .brief-input::placeholder { color: var(--ink-light); }
  .brief-input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .brief-input:focus-visible { outline: 1px solid var(--accent); outline-offset: 0; }
  /* Try-chips: one-click brief examples below the input. Same pattern
     as demo.ts canvas-quickpicks; reuses [data-brief-target] handler. */
  .try-chips {
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--rule);
  }
  .try-chips-label {
    font: 600 var(--stamp-size) var(--font-label);
    color: var(--ink-light);
    text-transform: uppercase;
    letter-spacing: var(--stamp-track);
    margin-right: 4px;
  }
  /* House chip (NFA .art-chip): sheet fill, hairline, 2px radius. */
  .try-chip {
    background: var(--mat-sheet);
    border: 1px solid var(--rule);
    color: var(--ink-muted);
    font: 500 12px/1.3 var(--font-sans);
    padding: 4px 10px;
    border-radius: var(--r-print);
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s, background 0.12s;
  }
  .try-chip:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
  /* House buttons (NFA .btn): flat, 2px radius. Primary = ink fill that
     turns accent on hover; ghost = a hairline. */
  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--ink);
    color: var(--paper);
    border: 1px solid var(--ink);
    padding: 9px 18px;
    border-radius: var(--r-print);
    font: 500 13.5px var(--font-sans);
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .btn:hover { background: var(--accent); border-color: var(--accent); }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn:not(.btn-ghost):disabled:hover { background: var(--ink); border-color: var(--ink); }
  .btn-ghost {
    background: transparent;
    border: 1px solid var(--border-strong);
    color: var(--ink);
  }
  .btn-ghost:hover {
    background: var(--paper-2);
    border-color: var(--accent);
    color: var(--accent);
  }

  /* ── Vendor waterfall: a sheet whose dark file bar is the page's one
     ink feature (NFA .sheet__bar) ───────────────────────────────────── */
  .race-board {
    background: var(--mat-sheet);
    border: 1px solid var(--mat-edge);
    border-radius: var(--r-card);
    box-shadow: var(--shadow-sheet);
    padding: 18px;
    position: relative;
  }
  .race-board-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin: -18px -18px 16px;
    padding: 11px 18px;
    border-radius: 3px 3px 0 0;
    background: linear-gradient(135deg, var(--ink), var(--ink-2));
    color: var(--paper);
  }
  .race-board-title {
    display: flex;
    align-items: center;
    font: 500 12.5px/1.3 var(--font-mono);
    color: var(--paper);
    white-space: nowrap;
  }
  .race-board-title::before {
    content: "";
    width: 7px; height: 7px;
    margin-right: 10px;
    border-radius: 50%;
    background: var(--accent-on-dark);
    flex-shrink: 0;
  }
  .race-board-meta {
    font: 11px/1.4 var(--font-mono);
    color: color-mix(in srgb, var(--paper) 66%, var(--ink));
    text-align: right;
  }
  .vendor-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    min-height: 100px;
  }
  .vendor-row {
    display: grid;
    grid-template-columns: 200px 1fr 280px;
    gap: 16px;
    align-items: center;
    padding: 12px 14px;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: var(--r-print);
    position: relative;
    transition: border-color 0.3s, background-color 0.3s, box-shadow 0.3s;
    opacity: 0;
    animation: fadeInRow 0.35s ease-out forwards;
  }
  @keyframes fadeInRow {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  /* Conflict rows: a status hairline and a 2px status edge (the NFA
     registry row mark), no glow. Blocking also tints the paper, so the
     two states differ by weight as well as hue (olive warm and risk are
     close). Blocking outranks warn when a row sits in both kinds of pair. */
  .vendor-row.is-warn {
    border-color: rgba(var(--warm-rgb), 0.6);
    box-shadow: inset 2px 0 0 var(--warm);
  }
  .vendor-row.is-conflict {
    border-color: rgba(var(--risk-rgb), 0.6);
    background: color-mix(in srgb, var(--risk) 7%, var(--paper));
    box-shadow: inset 2px 0 0 var(--risk);
  }
  .vendor-name {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .vendor-name-primary {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .vendor-name-secondary {
    font: 10.5px/1.3 var(--font-mono);
    color: var(--ink-light);
  }
  /* Progress: the stage label sits above a 6px bar so it never overlaps
     the fill; "responded" turns the label into a stamp. */
  .vendor-progress {
    height: 30px;
    position: relative;
  }
  .vendor-progress::before {
    content: "";
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 6px;
    border-radius: 1px;
    background: var(--paper-2);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rule) 70%, transparent);
  }
  .vendor-progress-fill {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 6px;
    background: rgba(var(--accent-rgb), 0.45);
    border-radius: 1px;
    width: 0;
    transition: width 0.4s ease-out, background-color 0.3s;
  }
  .vendor-progress-fill.is-done { background: var(--accent); }
  .vendor-progress-fill.is-failed { background: var(--risk); }
  .vendor-stage-label {
    position: absolute;
    right: 0;
    top: 0;
    padding: 3px 0;
    font: 600 var(--stamp-size)/1 var(--font-label);
    color: var(--ink-light);
    text-transform: uppercase;
    letter-spacing: var(--stamp-track);
  }
  .vendor-progress-fill.is-done + .vendor-stage-label {
    padding: 3px 6px;
    border-radius: var(--r-print);
    background: color-mix(in srgb, var(--accent) 82%, var(--ink));
    color: var(--paper);
    font-weight: 700;
  }
  .vendor-progress-fill.is-failed + .vendor-stage-label { color: var(--risk); }
  .vendor-response {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px 12px;
    font: 11px/1.45 var(--font-mono);
  }
  .vendor-response-k { color: var(--ink-light); }
  .vendor-response-v { color: var(--ink); text-align: right; font-variant-numeric: tabular-nums; }
  /* Elevated / warn and restricted / block values carry a tinted mark,
     so the state reads in every skin (graphite warm sits near ink). */
  .vendor-response-v.warn,
  .vendor-response-v.block {
    justify-self: end;
    margin-right: -4px;
    padding: 0 4px;
    border-radius: var(--r-print);
    font-weight: 600;
  }
  .vendor-response-v.warn { color: var(--warn-ink); background: rgba(var(--warm-rgb), 0.14); }
  .vendor-response-v.block { color: var(--risk); background: rgba(var(--risk-rgb), 0.12); }
  .vendor-response-empty {
    color: var(--ink-light);
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
  /* Severity reads from the skin: blocking = risk, material = warm,
     minor = accent; material dashes and minor dots, so severity also
     reads without hue. Flat strokes, no glow. */
  .halo-arc {
    fill: none;
    stroke: var(--accent);
    animation: arcPulse 2.5s ease-in-out infinite;
  }
  .halo-arc--blocking { stroke: var(--risk); }
  .halo-arc--material { stroke: var(--warm); stroke-dasharray: 7 5; }
  .halo-arc--minor    { stroke: var(--accent); stroke-dasharray: 2 5; }
  @keyframes arcPulse {
    0%, 100% { opacity: 0.9; }
    50%      { opacity: 0.55; }
  }

  /* ── Disagreements panel (replaces inline callouts) ────────────────── */
  .disagreements-panel {
    margin-top: 16px;
    background: var(--mat-sheet);
    border: 1px solid var(--mat-edge);
    border-radius: var(--r-card);
    box-shadow: var(--shadow-1);
    padding: 16px 18px 18px;
    display: none;
  }
  .disagreements-panel.is-active { display: block; }
  .disagreements-panel-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--rule);
  }
  .disagreements-panel-title {
    font-family: var(--font-serif);
    font-size: 19px;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.015em;
    color: var(--ink);
  }
  .disagreements-panel-meta {
    font: 600 var(--stamp-size)/1 var(--font-label);
    text-transform: uppercase;
    letter-spacing: var(--stamp-track);
    color: var(--ink-light);
  }
  .disagreements-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  /* Severity is the short top stroke (the NFA numeral rule), not a thick
     left border. */
  .disagreement-card {
    position: relative;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: var(--r-print);
    padding: 14px 16px 12px;
    opacity: 0;
    animation: fadeInRow 0.35s ease-out forwards;
  }
  .disagreement-card::before {
    content: "";
    position: absolute;
    top: -1px; left: 16px;
    width: 2.6rem; height: 2px;
    background: var(--risk);
  }
  .disagreement-card.warn::before { background: var(--warm); }
  .disagreement-card.minor::before { background: var(--accent); }
  .disagreement-card-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }
  /* Severity stamps: blocking is solid, material tinted, minor outlined,
     so the three read apart in every skin. */
  .disagreement-badge {
    display: inline-block;
    padding: 3px 6px;
    border-radius: var(--r-print);
    background: color-mix(in srgb, var(--risk) 85%, var(--ink));
    color: var(--paper);
    font: 700 var(--stamp-size)/1 var(--font-label);
    text-transform: uppercase;
    letter-spacing: var(--stamp-track);
  }
  .disagreement-card.warn .disagreement-badge {
    background: rgba(var(--warm-rgb), 0.16);
    color: var(--warn-ink);
    box-shadow: inset 0 0 0 1px rgba(var(--warm-rgb), 0.45);
  }
  .disagreement-card.minor .disagreement-badge {
    background: transparent;
    color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .disagreement-field {
    font-family: var(--font-serif);
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .disagreement-rationale {
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink-muted);
    margin-bottom: 10px;
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
    border-radius: var(--r-print);
    background: var(--mat-sheet);
    border: 1px solid var(--rule);
    font: 11px/1.3 var(--font-mono);
    color: var(--ink);
  }
  .vendor-chip-value {
    color: var(--ink-muted);
    margin-left: 4px;
  }
  .disagreement-reconcile {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed var(--rule);
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink);
    display: none;
  }
  .disagreement-reconcile.is-active {
    display: block;
    animation: fadeInRow 0.4s ease-out;
  }
  /* The reconciled value is a Fraunces figure. */
  .disagreement-reconcile strong {
    font-family: var(--font-serif);
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: lining-nums;
    letter-spacing: -0.01em;
  }
  .disagreement-reconcile-label {
    font: 600 var(--stamp-size)/1 var(--font-label);
    text-transform: uppercase;
    letter-spacing: var(--label-track);
    color: var(--accent);
    margin-bottom: 6px;
  }
  .disagreement-reconcile-pending {
    color: var(--ink-light);
    font: italic 13.5px/1.5 var(--font-serif);
  }

  /* ── Receipt sidebar: a stack of printed receipts ──────────────────── */
  .sidebar-title {
    font: 600 var(--label-size)/1 var(--font-label);
    text-transform: uppercase;
    letter-spacing: var(--label-track);
    color: var(--accent);
    margin-bottom: 8px;
  }
  .sidebar-sub {
    font-family: var(--font-serif);
    font-size: 17px;
    font-weight: 500;
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: var(--ink);
    margin-bottom: 18px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--rule);
  }
  .receipt-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .receipt-card {
    background: var(--mat-sheet);
    border: 1px solid var(--mat-edge);
    border-radius: var(--r-print);
    box-shadow: var(--shadow-1);
    padding: 10px 12px;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
    opacity: 0;
    animation: fadeInRow 0.3s ease-out forwards;
  }
  .receipt-card:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow-2);
  }
  .receipt-card-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .receipt-card-row + .receipt-card-row { margin-top: 5px; }
  /* The hash line reads as the receipt's perforated foot. */
  .receipt-card-row:last-child {
    margin-top: 8px;
    padding-top: 7px;
    border-top: 1px dashed var(--rule);
  }
  .receipt-card-vendor {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink);
  }
  .receipt-card-meta {
    font: 10px/1 var(--font-mono);
    color: var(--ink-light);
  }
  .receipt-card-action {
    font: 10.5px/1 var(--font-mono);
    color: var(--accent);
  }
  /* VERIFIED stamp. */
  .receipt-card-pill {
    display: inline-block;
    padding: 3px 6px;
    border-radius: var(--r-print);
    background: color-mix(in srgb, var(--accent) 82%, var(--ink));
    color: var(--paper);
    font: 700 var(--stamp-size)/1 var(--font-label);
    text-transform: uppercase;
    letter-spacing: var(--stamp-track);
    white-space: nowrap;
  }
  .receipt-card-empty {
    color: var(--ink-light);
    font: italic 14px/1.5 var(--font-serif);
    padding: 16px 0;
    text-align: center;
  }

  /* ── Receipt modal (a sheet over a quiet scrim) ────────────────────── */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .modal-backdrop.is-open { display: flex; }
  .modal {
    position: relative;
    background: var(--mat-sheet);
    border: 1px solid var(--rule);
    border-radius: var(--r-card);
    box-shadow: var(--shadow-3);
    padding: 24px;
    width: 90%;
    max-width: 720px;
    max-height: 80vh;
    overflow-y: auto;
  }
  .modal-title {
    font-family: var(--font-serif);
    font-size: 22px;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.018em;
    color: var(--ink);
    margin-bottom: 6px;
    padding-right: 76px;
  }
  .modal-sub {
    font: 11px/1.5 var(--font-mono);
    color: var(--ink-light);
    margin-bottom: 16px;
  }
  .modal-section {
    margin-top: 14px;
  }
  .modal-section-title {
    font: 600 var(--stamp-size)/1 var(--font-label);
    text-transform: uppercase;
    letter-spacing: var(--label-track);
    color: var(--accent);
    margin-bottom: 6px;
  }
  .modal pre {
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: var(--r-print);
    padding: 10px 12px;
    font: 11px/1.55 var(--font-mono);
    color: var(--ink);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .modal-close {
    position: absolute;
    top: 18px;
    right: 18px;
    background: transparent;
    border: 1px solid var(--border-strong);
    color: var(--ink);
    padding: 6px 10px;
    border-radius: var(--r-print);
    cursor: pointer;
    font: 700 var(--stamp-size)/1 var(--font-label);
    text-transform: uppercase;
    letter-spacing: var(--stamp-track);
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .modal-close:hover {
    background: var(--paper-2);
    border-color: var(--accent);
    color: var(--accent);
  }

  /* ── Add-vendor bar ────────────────────────────────────────────────── */
  .add-vendor-bar {
    margin-top: 24px;
    background: var(--mat-sheet);
    border: 1px solid var(--mat-edge);
    border-radius: var(--r-card);
    box-shadow: var(--shadow-1);
    padding: 14px 18px;
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .add-vendor-bar.is-disabled { opacity: 0.5; pointer-events: none; }
  .add-vendor-label {
    font: 600 var(--label-size)/1 var(--font-label);
    text-transform: uppercase;
    letter-spacing: var(--label-track);
    color: var(--ink-light);
    white-space: nowrap;
  }
  .add-vendor-select {
    flex: 1;
    background: var(--mat);
    border: 1px solid var(--rule);
    color: var(--ink);
    padding: 8px 12px;
    border-radius: var(--r-print);
    font: 13px var(--font-sans);
  }

  /* ── Empty state (NFA hatch-panel register: a dashed hairline) ─────── */
  .empty-state {
    color: var(--ink-light);
    font: italic 15px/1.5 var(--font-serif);
    text-align: center;
    padding: 40px 20px;
    border: 1px dashed color-mix(in srgb, var(--ink) 22%, transparent);
    border-radius: var(--r-card);
  }

  /* Sec-31u: Trace inspector — minimal port of the main demo's
     trace inspector for the Race Canvas page. */
  .race-trace-trigger {
    position: fixed; bottom: 22px; right: 22px;
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px 10px 14px;
    background: var(--mat-sheet);
    border: 1px solid var(--rule);
    border-radius: var(--r-pill);
    color: var(--ink);
    font: 600 12px var(--font-sans);
    cursor: pointer;
    box-shadow: var(--shadow-2);
    z-index: 90;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .race-trace-trigger svg { color: var(--accent); }
  .race-trace-trigger:hover { border-color: var(--accent); background: var(--mat); }
  .race-trace-trigger.is-pulsing {
    animation: race-trace-pulse 1.6s ease-in-out 3;
    border-color: var(--accent);
    color: var(--accent);
  }
  @keyframes race-trace-pulse {
    /* A quiet hairline ring that widens and fades, no glow. */
    0%   { box-shadow: var(--shadow-2), 0 0 0 0 rgba(var(--accent-rgb), 0.45); }
    45%  { box-shadow: var(--shadow-2), 0 0 0 9px rgba(var(--accent-rgb), 0); }
    100% { box-shadow: var(--shadow-2), 0 0 0 0 rgba(var(--accent-rgb), 0); }
  }
  /* Closed, the panel casts no shadow, so nothing bleeds in at the edge. */
  .race-trace-panel {
    position: fixed; top: 0; bottom: 0; right: 0;
    width: 420px; max-width: 92vw;
    background: var(--mat-sheet);
    border-left: 1px solid var(--rule);
    box-shadow: none;
    z-index: 100;
    transform: translateX(102%);
    transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.28s;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .race-trace-panel.is-open {
    transform: translateX(0);
    box-shadow: -22px 0 48px -26px color-mix(in srgb, var(--ink) 45%, transparent);
  }
  .race-trace-panel-head {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--rule);
    color: var(--ink);
  }
  .race-trace-panel-head strong {
    font-family: var(--font-serif);
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.018em;
  }
  .race-trace-panel-head button {
    background: transparent;
    border: 1px solid var(--border-strong);
    color: var(--ink);
    padding: 5px 10px;
    border-radius: var(--r-print);
    font: 700 var(--stamp-size)/1 var(--font-label);
    text-transform: uppercase;
    letter-spacing: var(--stamp-track);
    cursor: pointer;
  }
  .race-trace-panel-head button:hover { background: var(--paper-2); border-color: var(--accent); color: var(--accent); }
  .race-trace-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    color: var(--ink);
  }
  .race-trace-empty {
    color: var(--ink-light);
    font: italic 14px/1.5 var(--font-serif);
    padding: 20px 0;
  }
  .race-trace-head {
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--rule);
  }
  .race-trace-head .op {
    font-family: var(--font-serif);
    font-size: 17px; font-weight: 600; color: var(--ink);
    letter-spacing: -0.012em;
    margin-bottom: 2px;
  }
  .race-trace-head .meta {
    font: 11px var(--font-mono); color: var(--ink-light);
  }
  .race-trace-step {
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: var(--r-print);
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
    border-radius: var(--r-print);
  }
  .race-trace-step-head .step-label {
    flex: 1;
    font: 12.5px var(--font-mono);
    color: var(--ink);
  }
  .race-trace-step-head .step-dur {
    font: 11px var(--font-mono);
    color: var(--ink-light);
  }
  .race-trace-detail {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 6px;
    font: 11px var(--font-mono);
    line-height: 1.4;
    padding: 2px 0;
  }
  .race-trace-detail .k { color: var(--ink-light); }
  .race-trace-detail .v { color: var(--ink); word-break: break-all; }
  .race-trace-note {
    margin-top: 6px;
    font: 11px var(--font-mono);
    color: var(--ink-muted);
    font-style: italic;
    padding: 6px 8px;
    background: var(--paper-2);
    border-radius: var(--r-print);
  }
  @media (prefers-reduced-motion: reduce) {
    .halo-arc, .race-trace-trigger.is-pulsing { animation: none; }
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
            <li><strong>Disagreement halo.</strong> Detector compares responses on 4 fields. Numeric: ±15% threshold (audience), ±20% (bid floor). Categorical: any difference triggers. Severity: blocking / material / minor maps to a solid / dashed / dotted arc.</li>
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
     shared viewer, fetches /api/signal-traces and renders a list.
     Shares the rendering primitives (schema banner, peer version chip,
     humanized errors, extension badge) with the main demo's
     signals-trace-viewer.ts via _raceRender* helpers below — kept
     inline because /race is a standalone HTML page that doesn't load
     the full demo bundle. -->
<div class="modal-backdrop" id="signal-trace-backdrop" style="display:none">
  <div class="modal" style="max-width:920px;width:96vw;max-height:88vh;overflow-y:auto">
    <div class="modal-title">Signal traces · raw protocol JSON</div>
    <div class="modal-sub" style="opacity:0.7">Every recorded AdCP tool call (get_signals, activate_signal, query_signals_nl, get_operation_status, list_creative_formats, get_products, create_media_buy, check_governance) with schema validation against the vendored ${SPEC_VERSION} corpus. Refresh to pull latest.</div>
    <button class="modal-close" id="signal-trace-modal-close">close</button>
    <div style="margin-top:14px"><button class="try-chip" id="signal-trace-refresh">↻ refresh</button></div>
    <div id="signal-trace-list" style="margin-top:12px;font:11.5px var(--font-mono)">loading…</div>
  </div>
</div>

<!-- Sec-31u: trace inspector for Race Canvas. Trigger appears bottom-right
     once the first traced response lands; panel slides in from right with
     steps formatted from the captured _trace. Parsed before the page
     script, which binds its click handlers at load. -->
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

    // Stroke colour comes from the skin via .halo-arc--<severity> in CSS.
    var sevKey = disagreement.severity === "blocking" ? "blocking" :
                 disagreement.severity === "material" ? "material" : "minor";

    var ns = "http://www.w3.org/2000/svg";
    var pathStr = "M" + ax + "," + ay + " Q" + cx + "," + cy + " " + bx + "," + by;
    var path = document.createElementNS(ns, "path");
    path.setAttribute("d", pathStr);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("opacity", "0.85");
    path.setAttribute("stroke-linecap", "round");
    path.classList.add("halo-arc", "halo-arc--" + sevKey);
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
    // Truncate huge "validator threw: Unresolved $ref ... Known schemas: -foo -bar..."
    // dumps so they don't blow up the error row.
    if (/^validator threw: /.test(msg)) {
      var stripped = msg.replace(/^validator threw: /, "");
      var knownIdx = stripped.indexOf(". Known schemas:");
      if (knownIdx > 0 && knownIdx < stripped.length - 10) {
        return "validator threw: " + stripped.slice(0, knownIdx).trim() + " (full schema list in raw trace)";
      }
      if (stripped.length <= 240) return "validator threw: " + stripped;
      return "validator threw: " + stripped.slice(0, 240).trim() + "\\u2026";
    }
    return msg;
  }
  function _raceRenderErrorList(validation) {
    if (!validation || !validation.errors || validation.errors.length === 0) return "";
    var rows = validation.errors.map(function (e) {
      var human = _raceHumanizeErr(e.message);
      return '<div style="font-size:10.5px;line-height:1.55;padding:2px 0;color:var(--risk)">' +
        '<code style="background:rgba(var(--risk-rgb),0.10);color:var(--risk);padding:0 4px;border-radius:var(--r-print)">' + escapeHtml(e.path || "(root)") + '</code> ' +
        escapeHtml(human) +
        ' <span style="color:var(--risk);opacity:0.75">[' + escapeHtml(e.keyword) + ']</span>' +
      '</div>';
    }).join("");
    var legend = '<details style="margin:6px 0;font-size:10.5px;color:var(--ink-light)">' +
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
    var statusColor = t.response.status === "ok" ? "var(--accent)" : "var(--risk)";
    var reqValid = t.request.validation && t.request.validation.valid;
    var resValid = t.response.validation && t.response.validation.valid;
    var reqErrs = (t.request.validation && t.request.validation.errors) || [];
    var resErrs = (t.response.validation && t.response.validation.errors) || [];
    var reqErrCount = reqErrs.length;
    var resErrCount = resErrs.length;
    var reqIsExt = reqErrs.some(function (e) { return e.keyword === "extension"; });
    var resIsExt = resErrs.some(function (e) { return e.keyword === "extension"; });
    var reqIsSkip = reqErrs.some(function (e) { return e.keyword === "skipped" || e.keyword === "missing_schema"; });
    var resIsSkip = resErrs.some(function (e) { return e.keyword === "skipped" || e.keyword === "missing_schema"; });
    function badge(ok, errCount, isExt, isSkip) {
      if (isExt) return '<span style="color:var(--warn-ink)" title="Tool not yet standardized in published AdCP spec — recorded for audit, schema link goes to the proposal.">⚙ ext</span>';
      if (isSkip) return '<span style="color:var(--ink-light)" title="Validator could not run; schema URL link still works">⊘ skip</span>';
      if (ok) return '<span style="color:var(--accent)">✓ schema</span>';
      return '<span style="color:var(--risk)">✗ ' + errCount + ' err</span>';
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
      endpointBlock = ' · <a href="' + escapeHtml(t.endpoint_url) + '" target="_blank" rel="noopener" title="' + escapeHtml(t.endpoint_url) + '" style="color:var(--accent);font-size:10.5px;text-decoration:none">⎘ ' + escapeHtml(visible) + '</a>';
    }
    // Peer version chip — pulled live from MCP initialize.
    var peerVerBlock = "";
    if (t.peer_server_info && (t.peer_server_info.version || t.peer_server_info.name)) {
      var pv = t.peer_server_info.version || "";
      var pn = t.peer_server_info.name || "";
      var pLabel = pv ? "peer v" + pv : "peer";
      var pTitle = (pn ? pn + " · " : "") + (pv ? "version " + pv : "version unknown") +
        " (advertised by the peer in the MCP initialize handshake)";
      peerVerBlock = ' · <span style="color:var(--warn-ink);font-size:10.5px;background:rgba(var(--warm-rgb),0.10);padding:1px 6px;border-radius:var(--r-print)" title="' + escapeHtml(pTitle) + '">' + escapeHtml(pLabel) + '</span>';
    }
    return '<details style="margin-bottom:10px;padding:8px 12px;background:var(--paper);border:1px solid var(--rule);border-radius:var(--r-print)">' +
      '<summary style="cursor:pointer;font-size:12px;line-height:1.7">' +
        '<strong>' + escapeHtml(t.tool_name) + '</strong> · ' + dirIcon + ' ' + escapeHtml(sourceShort) +
        endpointBlock +
        peerVerBlock +
        ' · <span style="color:' + statusColor + '">' + escapeHtml(t.response.status) + '</span>' +
        ' · ' + t.duration_ms + 'ms · ' + new Date(t.ts).toLocaleTimeString() +
        ' · ' + badge(reqValid, reqErrCount, reqIsExt, reqIsSkip) + ' req · ' + badge(resValid, resErrCount, resIsExt, resIsSkip) + ' res' +
      '</summary>' +
      '<div style="margin-top:8px"><strong style="font-size:10px;letter-spacing:0.1em">REQUEST</strong>' +
        ' · validating against <a href="' + escapeHtml(t.request.validation.schema_url) + '" target="_blank" style="color:var(--accent);font-size:10px">' + escapeHtml(t.request.validation.schema_url.split("/").slice(-2).join("/")) + ' ↗</a></div>' +
      _raceRenderErrorList(t.request.validation) +
      '<pre style="background:var(--paper-2);border:1px solid var(--rule);color:var(--ink);padding:8px;border-radius:var(--r-print);max-height:240px;overflow:auto;font-size:10.5px;white-space:pre-wrap;word-break:break-all">' + escapeHtml(JSON.stringify(t.request.payload, null, 2)) + '</pre>' +
      '<div><strong style="font-size:10px;letter-spacing:0.1em">RESPONSE</strong>' +
        ' · validating against <a href="' + escapeHtml(t.response.validation.schema_url) + '" target="_blank" style="color:var(--accent);font-size:10px">' + escapeHtml(t.response.validation.schema_url.split("/").slice(-2).join("/")) + ' ↗</a></div>' +
      _raceRenderErrorList(t.response.validation) +
      '<pre style="background:var(--paper-2);border:1px solid var(--rule);color:var(--ink);padding:8px;border-radius:var(--r-print);max-height:240px;overflow:auto;font-size:10.5px;white-space:pre-wrap;word-break:break-all">' + escapeHtml(JSON.stringify(t.response.payload, null, 2)) + '</pre>' +
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

</body>
</html>`;
}
