// src/routes/ecosystemCanvas.ts
//
// /ecosystem live constellation page.
//
// Full-screen WebGL visualization of the AdCP ecosystem orchestration.
// Loaded as a top-level route (not embedded in demo.ts) for the same
// reason as raceCanvas / vendorHealthCanvas: keeps the SCRIPT_TAG
// escape blast radius small. All JS lives in this file's outer template
// literal — same trap discipline applies.
//
// Architecture:
//   - Three.js (r170 from unpkg) renders ~30 agent nodes laid out in
//     concentric rings on a sphere. Each role gets its own ring +
//     accent color.
//   - Connects to /ecosystem/stream (SSE) on load. Each "message"
//     event spawns a curved beam from src agent to dst agent that
//     fades out over ~1.5s.
//   - Each "lift_update" event grows a halo ring around the agent,
//     decaying back over ~6s.
//   - Side panel shows the live trace tree (top-down by brief).
//   - Click an agent → details popover with role + specialties + last
//     trace excerpt.
//
// Recording target: 60-second screen capture suitable for social.
// The continuous brief loop + organic beam flow means the camera
// catches "alive" energy whenever you press record.

const SAFE_THREE_VERSION = "r170";

export function renderEcosystemCanvas(demoKey: string): string {
  const safeKey = JSON.stringify(demoKey);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AdCP Ecosystem — live agentic orchestration</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='2' fill='%2338b6ff'/%3E%3Ccircle cx='8' cy='8' r='6' fill='none' stroke='%2338b6ff' stroke-width='0.6' opacity='0.5'/%3E%3C/svg%3E"/>
<style>
  :root {
    --bg: #04060a;
    --bg-elev: #0a0e15;
    --panel: rgba(10, 14, 21, 0.92);
    --panel-border: rgba(56, 182, 255, 0.18);
    --text: #d6e1f0;
    --text-dim: #6f8298;
    --text-faint: #455467;
    --accent: #38b6ff;
    --accent-glow: rgba(56, 182, 255, 0.4);

    --c-sales:       #ffb454;
    --c-signals:     #38b6ff;
    --c-buying:      #ff5e87;
    --c-creative:    #c98aff;
    --c-measurement: #5fd9c4;
    --c-governance:  #f59e0b;
    --c-identity:    #80a8ff;   /* fix-all-gaps: ID resolution */
    --c-cleanroom:   #b8a0ff;   /* fix-all-gaps: privacy-preserving join */
    --c-buyer:       #ffffff;

    --c-discovery:   #38b6ff;
    --c-signal:      #5fd9c4;
    --c-policy:      #f59e0b;
    --c-product:     #ffb454;
    --c-creative-msg:#c98aff;
    --c-bid:         #ff5e87;
    --c-measure:     #ffd166;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif; overflow: hidden; }
  #stage { position: fixed; inset: 0; }
  canvas { display: block; }

  .topbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 10;
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px;
    background: linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0));
    pointer-events: none;
  }
  .brand { pointer-events: auto; display: flex; align-items: center; gap: 12px; font-size: 13px; }
  .brand-mark { width: 24px; height: 24px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, var(--accent), rgba(56, 182, 255, 0.1)); box-shadow: 0 0 18px var(--accent-glow); }
  .brand-title { font-weight: 600; letter-spacing: 0.04em; }
  .brand-sub { color: var(--text-dim); font-size: 11px; margin-top: 1px; }
  .topbar-meta { pointer-events: auto; display: flex; gap: 14px; align-items: center; font: 11px ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: var(--text-dim); }
  .meta-pill { padding: 5px 10px; background: rgba(0,0,0,0.4); border: 1px solid rgba(56, 182, 255, 0.16); border-radius: 12px; }
  .meta-pill b { color: var(--text); font-weight: 600; }

  /* Brief banner — the single most prominent affordance. Shows what
     campaign is currently being orchestrated. Spawns with a glow pulse
     animation; settles to a quieter persistent state during the cycle.
     Designed to be readable mid-cinema at any camera distance. */
  .brief-banner {
    position: fixed; top: 60px; left: 50%;
    transform: translateX(-50%);
    z-index: 9;
    pointer-events: none;
    width: min(720px, 86vw);
    padding: 14px 22px 12px;
    background: linear-gradient(135deg, rgba(56, 182, 255, 0.10), rgba(10, 14, 21, 0.92));
    border: 1px solid rgba(56, 182, 255, 0.35);
    border-radius: 10px;
    box-shadow: 0 8px 36px rgba(56, 182, 255, 0.18);
    text-align: center;
    transition: opacity 0.4s, transform 0.4s;
  }
  .brief-banner.hidden { opacity: 0; transform: translateX(-50%) translateY(-8px); }
  .brief-banner-label {
    font: 9.5px ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--accent); margin-bottom: 6px;
    opacity: 0.85;
  }
  .brief-banner-prompt {
    font-size: 16px; font-weight: 500;
    color: var(--text); line-height: 1.35;
    letter-spacing: 0.01em;
  }
  .brief-banner-meta {
    margin-top: 8px;
    display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
    font: 10.5px ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    color: var(--text-dim);
  }
  .brief-meta-pill { padding: 2px 9px; background: rgba(0,0,0,0.35); border: 1px solid rgba(56, 182, 255, 0.16); border-radius: 10px; }
  .brief-meta-pill b { color: var(--text); font-weight: 600; }
  .brief-meta-pill.audio-hot { border-color: rgba(95, 217, 196, 0.45); color: #5fd9c4; }
  .brief-meta-pill.ctv-hot   { border-color: rgba(255, 180, 84, 0.45); color: #ffb454; }
  .brief-meta-pill.b2b-hot   { border-color: rgba(201, 138, 255, 0.45); color: #c98aff; }
  .brief-banner.spawn-pulse {
    animation: brief-spawn 0.9s ease-out;
  }
  @keyframes brief-spawn {
    0%   { transform: translateX(-50%) scale(0.92); box-shadow: 0 0 0 rgba(56, 182, 255, 0); }
    40%  { transform: translateX(-50%) scale(1.03); box-shadow: 0 8px 60px rgba(56, 182, 255, 0.55); }
    100% { transform: translateX(-50%) scale(1.0);  box-shadow: 0 8px 36px rgba(56, 182, 255, 0.18); }
  }

  /* Phase banner — sits below the topbar, centered. The single most
     important affordance: tells the viewer WHAT IS HAPPENING right now
     ("PHASE 2 of 6 · governance check"). Updates in real time as cycle
     events arrive over SSE. */
  .phase-banner {
    position: fixed; top: 178px; left: 50%;
    transform: translateX(-50%);
    z-index: 9;
    pointer-events: none;
    display: flex; align-items: center; gap: 12px;
    padding: 8px 18px;
    background: rgba(10, 14, 21, 0.92);
    border: 1px solid var(--panel-border);
    border-radius: 18px;
    font: 12px ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--text-dim);
    transition: border-color 0.25s, color 0.25s, background 0.25s;
  }
  .phase-banner.is-phase-signals     { border-color: var(--c-signals);     color: var(--c-signals); }
  .phase-banner.is-phase-governance  { border-color: var(--c-governance);  color: var(--c-governance); }
  .phase-banner.is-phase-sales       { border-color: var(--c-sales);       color: var(--c-sales); }
  .phase-banner.is-phase-creative    { border-color: var(--c-creative);    color: var(--c-creative); }
  .phase-banner.is-phase-buying      { border-color: var(--c-buying);      color: var(--c-buying); }
  .phase-banner.is-phase-measurement { border-color: var(--c-measurement); color: var(--c-measurement); }
  .phase-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; box-shadow: 0 0 12px currentColor; animation: phase-pulse 1.4s ease-in-out infinite; }
  @keyframes phase-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
  .phase-num { font-weight: 600; color: var(--text); }
  .phase-meta { color: var(--text-dim); font-size: 10.5px; letter-spacing: 0.04em; text-transform: none; }

  /* Agent name labels — DOM elements positioned every frame from
     each node's projected screen coords. Always visible so viewers
     can read who is firing without clicking. Lower opacity for back-
     hemisphere agents (z behind camera) so the constellation reads
     clearly even when crowded. */
  #label-layer {
    position: fixed; inset: 0; z-index: 6;
    pointer-events: none;
  }
  .agent-label {
    position: absolute;
    transform: translate(-50%, -50%);
    padding: 2px 7px;
    background: rgba(10, 14, 21, 0.78);
    border: 1px solid rgba(56, 182, 255, 0.15);
    border-radius: 4px;
    font: 10px ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    color: var(--text-dim);
    white-space: nowrap;
    letter-spacing: 0.02em;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: opacity 0.18s ease, transform 0.12s ease, border-color 0.2s;
    will-change: left, top, opacity;
  }
  .agent-label.firing {
    color: var(--text);
    border-color: var(--accent);
    background: rgba(56, 182, 255, 0.12);
    transform: translate(-50%, -50%) scale(1.08);
  }

  .legend {
    position: fixed; bottom: 18px; left: 18px; z-index: 10;
    background: var(--panel); border: 1px solid var(--panel-border); border-radius: 8px;
    padding: 10px 14px; font-size: 11px;
    backdrop-filter: blur(8px);
    pointer-events: auto;
  }
  .legend-title { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-faint); margin-bottom: 6px; }
  .legend-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
  .legend-divider { height: 1px; background: rgba(56, 182, 255, 0.12); margin: 8px 0 6px; }

  /* fix-all-gaps: onboarding walkthrough modal — shown on first visit
     (localStorage gates re-show). 5 cards explaining the layout +
     interactions. Dismissible per-card via "Next" or "Skip". */
  .onboarding {
    position: fixed; inset: 0; z-index: 30;
    display: none; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(6px);
  }
  .onboarding.open { display: flex; }
  .onboarding-card {
    background: var(--panel);
    border: 1px solid var(--accent);
    border-radius: 12px;
    padding: 24px 28px;
    width: min(440px, 86vw);
    box-shadow: 0 24px 80px rgba(56, 182, 255, 0.30);
  }
  .onboarding-step {
    font: 9.5px ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: 0.16em;
    color: var(--accent); margin-bottom: 8px;
  }
  .onboarding-title {
    font-size: 18px; font-weight: 600; margin: 0 0 10px;
  }
  .onboarding-body {
    font-size: 13px; line-height: 1.55; color: var(--text-dim); margin-bottom: 20px;
  }
  .onboarding-body kbd {
    background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.16);
    padding: 1px 5px; border-radius: 3px; font-family: ui-monospace, monospace;
    color: var(--text); font-size: 11px;
  }
  .onboarding-body b { color: var(--text); font-weight: 500; }
  .onboarding-actions {
    display: flex; justify-content: space-between; align-items: center; gap: 10px;
  }
  .onboarding-progress { display: flex; gap: 4px; }
  .onboarding-progress-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-faint); }
  .onboarding-progress-dot.active { background: var(--accent); }
  .onboarding-btn {
    background: var(--accent); color: #04060a; border: none;
    padding: 8px 16px; border-radius: 6px;
    font-family: inherit; font-size: 12px; font-weight: 600;
    cursor: pointer;
  }
  .onboarding-btn:hover { background: var(--accent-hot, #6fa4ff); }
  .onboarding-skip {
    background: transparent; color: var(--text-dim); border: none;
    font: 11px ui-monospace, monospace; cursor: pointer;
    padding: 4px 8px;
  }
  .onboarding-skip:hover { color: var(--text); }

  /* Global pause — inline in topbar-meta now (was fixed-positioned). */
  .global-pause {
    background: rgba(0,0,0,0.4); color: var(--text-dim);
    padding: 6px 12px; font-size: 11px; cursor: pointer;
    border: 1px solid rgba(56, 182, 255, 0.16); border-radius: 12px;
    pointer-events: auto; font-family: inherit;
  }
  .global-pause:hover { color: var(--accent); border-color: var(--accent); }
  .global-pause.is-paused { color: #ffb454; border-color: #ffb454; background: rgba(255, 180, 84, 0.12); }

  /* fix-all-gaps: beam filter chips — inline, just below the
     phase banner. Click a chip to filter beams to that phase only. */
  .beam-filter {
    position: fixed; top: 218px; left: 50%;
    transform: translateX(-50%);
    z-index: 8;
    display: flex; gap: 4px; flex-wrap: wrap; justify-content: center;
    pointer-events: auto;
  }
  body.hide-ui .beam-filter { opacity: 0; pointer-events: none; transition: opacity 0.4s; }
  .beam-chip {
    background: rgba(0,0,0,0.55);
    border: 1px solid rgba(56, 182, 255, 0.16);
    color: var(--text-mut);
    padding: 3px 9px; border-radius: 10px;
    font: 10px ui-monospace, monospace; letter-spacing: 0.04em;
    cursor: pointer;
  }
  .beam-chip:hover { color: var(--text); border-color: rgba(56, 182, 255, 0.45); }
  .beam-chip.active { color: var(--text); background: var(--accent-glow); border-color: var(--accent); }

  /* fix-all-gaps: in-scene click highlight ring on the agent panel. */
  .agent-panel { transition: box-shadow 0.25s; }
  .agent-panel.is-clicked-highlight { box-shadow: 0 12px 60px rgba(56, 182, 255, 0.6); }

  .trace-panel {
    position: fixed; top: 70px; right: 18px; bottom: 18px; width: 360px; z-index: 10;
    background: var(--panel); border: 1px solid var(--panel-border); border-radius: 10px;
    padding: 14px 16px;
    backdrop-filter: blur(8px);
    overflow-y: auto;
    pointer-events: auto;
  }
  .trace-panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid rgba(56, 182, 255, 0.12); }
  .trace-panel-title { font-size: 12px; font-weight: 600; }
  .trace-panel-toggle {
    background: transparent; border: 1px solid rgba(56, 182, 255, 0.16);
    color: var(--text-dim); padding: 3px 8px; font-size: 10px; border-radius: 4px;
    cursor: pointer; font-family: inherit;
  }
  .trace-panel-toggle:hover { color: var(--accent); border-color: var(--accent); }
  .brief-card { padding: 8px 10px; margin: 8px 0; background: rgba(56, 182, 255, 0.06); border-left: 2px solid var(--accent); border-radius: 4px; }
  .brief-prompt { font-size: 12px; line-height: 1.4; }
  .brief-meta { font: 10px ui-monospace, "SF Mono", monospace; color: var(--text-dim); margin-top: 4px; }
  .trace-line { display: grid; grid-template-columns: 12px 80px 1fr; gap: 8px; padding: 4px 0; font-size: 11px; line-height: 1.35; border-top: 1px solid rgba(56, 182, 255, 0.05); }
  .trace-line:first-child { border-top: 0; }
  .trace-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; }
  .trace-kind { font: 9.5px ui-monospace, monospace; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.04em; padding-top: 1px; }
  .trace-summary { color: var(--text); }
  .trace-summary.deny { color: #ff7b7b; }
  .trace-summary.allow { color: #5fd9c4; }
  .trace-summary.review { color: #f59e0b; }

  .agent-panel {
    position: fixed; top: 220px; left: 18px; z-index: 11;
    width: 340px;
    background: var(--panel); border: 1px solid var(--panel-border); border-radius: 10px;
    padding: 14px 16px;
    backdrop-filter: blur(8px);
    pointer-events: auto;
    display: none;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6);
  }
  .agent-panel.open { display: block; }
  .agent-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .agent-panel-name { font-weight: 600; font-size: 13px; }
  .agent-panel-vendor { color: var(--text-dim); font-size: 10.5px; margin-top: 2px; }
  .agent-panel-role { padding: 2px 8px; border-radius: 10px; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.08em; font-family: ui-monospace, monospace; }
  .agent-panel-close {
    background: transparent; border: none; color: var(--text-dim); cursor: pointer;
    font-size: 18px; line-height: 1; padding: 0; margin-left: 6px;
  }
  .agent-panel-stage { font: 10px ui-monospace, monospace; color: var(--text-dim); margin-top: 6px; }
  .agent-panel-stage.live { color: #5fd9c4; }
  .agent-panel-spec { margin-top: 8px; font-size: 11px; color: var(--text-dim); line-height: 1.45; }
  .agent-panel-lift { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(56, 182, 255, 0.1); }
  .agent-panel-lift-label { font: 9.5px ui-monospace, monospace; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.08em; }
  .agent-panel-lift-bar { width: 100%; height: 6px; background: rgba(255,255,255,0.04); border-radius: 3px; margin-top: 4px; overflow: hidden; }
  .agent-panel-lift-fill { height: 100%; background: linear-gradient(90deg, #ff5e87, #ffb454, #5fd9c4); transition: width 0.6s ease; }

  .audio-toggle {
    position: fixed; bottom: 18px; left: 230px; z-index: 11;
    background: var(--panel); border: 1px solid var(--panel-border); border-radius: 16px;
    padding: 6px 12px; font-size: 11px; cursor: pointer; color: var(--text-dim);
    pointer-events: auto;
    font-family: inherit;
  }
  .audio-toggle:hover { color: var(--accent); border-color: var(--accent); }
  .audio-toggle.on { color: var(--accent); border-color: var(--accent); }

  /* Hide-UI mode for clean recordings: dim every panel except the
     constellation. Recovers on toggle-off. */
  body.hide-ui .topbar,
  body.hide-ui .legend,
  body.hide-ui .trace-panel,
  body.hide-ui .agent-panel,
  body.hide-ui .home-link,
  body.hide-ui .phase-banner,
  body.hide-ui #label-layer,
  body.hide-ui .audio-toggle:not(#hide-ui-toggle):not(#cinema-toggle) {
    opacity: 0; pointer-events: none; transition: opacity 0.4s;
  }
  body.hide-ui #hide-ui-toggle,
  body.hide-ui #cinema-toggle {
    opacity: 0.45;
  }
  body.hide-ui #hide-ui-toggle:hover,
  body.hide-ui #cinema-toggle:hover { opacity: 1; }

  /* Trace detail modal — opens on click of any trace line. Slides in
     from the right with a staggered reveal of its sections. JSON is
     syntax-tinted; reasoning explains the trace in the ceremony's
     dramaturgy ("why this happened"). */
  .trace-detail-modal {
    position: fixed; inset: 0; z-index: 18;
    display: none; align-items: center; justify-content: flex-end;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(4px);
    pointer-events: none;
  }
  .trace-detail-modal.open { display: flex; pointer-events: auto; }
  .trace-detail-card {
    width: min(540px, 92vw); max-height: 86vh;
    margin-right: 18px;
    background: var(--panel);
    border: 1px solid var(--accent);
    border-radius: 10px;
    padding: 18px 22px 22px;
    overflow-y: auto;
    box-shadow: 0 18px 80px rgba(56, 182, 255, 0.32);
    pointer-events: auto;
    transform: translateX(40px); opacity: 0;
    transition: transform 0.32s ease-out, opacity 0.28s;
  }
  .trace-detail-modal.open .trace-detail-card {
    transform: translateX(0); opacity: 1;
  }
  .trace-detail-head {
    display: flex; align-items: center; gap: 10px;
    padding-bottom: 12px; margin-bottom: 14px;
    border-bottom: 1px solid rgba(56, 182, 255, 0.16);
  }
  .trace-detail-kind {
    font: 10px ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: 0.10em;
    padding: 3px 9px;
    background: var(--accent-glow); color: var(--accent);
    border: 1px solid var(--accent); border-radius: 3px;
  }
  .trace-detail-agent {
    flex: 1;
    font-size: 12.5px; color: var(--text-dim);
  }
  .trace-detail-close {
    background: transparent; border: 1px solid rgba(56, 182, 255, 0.32);
    color: var(--text-dim); width: 26px; height: 26px;
    border-radius: 4px; cursor: pointer; padding: 0;
    font-family: inherit; font-size: 16px; line-height: 22px;
  }
  .trace-detail-close:hover { color: var(--accent); border-color: var(--accent); }
  .trace-detail-summary {
    font-size: 14px; line-height: 1.45;
    color: var(--text);
    padding: 10px 0;
    margin-bottom: 6px;
    opacity: 0;
    transform: translateY(8px);
    animation: td-reveal 0.5s 0.05s ease-out forwards;
  }
  .trace-detail-section { margin-top: 14px; opacity: 0; transform: translateY(10px); animation: td-reveal 0.5s ease-out forwards; }
  .trace-detail-section:nth-of-type(1) { animation-delay: 0.10s; }
  .trace-detail-section:nth-of-type(2) { animation-delay: 0.18s; }
  .trace-detail-section:nth-of-type(3) { animation-delay: 0.26s; }
  .trace-detail-section:nth-of-type(4) { animation-delay: 0.34s; }
  @keyframes td-reveal {
    0%   { opacity: 0; transform: translateY(8px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .trace-detail-section-title {
    font: 9.5px ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--text-faint); margin-bottom: 6px;
  }
  .trace-detail-reasoning {
    font-size: 12.5px; line-height: 1.55;
    color: var(--text-dim);
  }
  .trace-detail-reasoning b { color: var(--text); font-weight: 500; }
  .trace-detail-agents {
    display: flex; flex-wrap: wrap; gap: 6px;
  }
  .trace-detail-agent-pill {
    font: 10.5px ui-monospace, monospace;
    padding: 3px 9px;
    background: rgba(56, 182, 255, 0.08);
    border: 1px solid rgba(56, 182, 255, 0.22);
    border-radius: 3px;
    color: var(--text);
  }
  .trace-detail-agent-pill .role { color: var(--text-faint); margin-right: 6px; }
  .trace-detail-json {
    font: 11px ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    line-height: 1.5;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(56, 182, 255, 0.12);
    border-radius: 6px;
    padding: 12px 14px;
    margin: 0;
    overflow-x: auto;
    color: var(--text-dim);
    max-height: 260px;
    white-space: pre-wrap; word-break: break-all;
  }
  .trace-detail-json .k { color: var(--c-signals); }
  .trace-detail-json .s { color: var(--c-measurement); }
  .trace-detail-json .n { color: var(--c-sales); }
  .trace-detail-json .b { color: var(--c-buying); }
  .trace-detail-brief {
    font-size: 12px; color: var(--text-dim);
    padding: 8px 12px;
    background: rgba(56, 182, 255, 0.05);
    border-left: 2px solid var(--accent);
    border-radius: 4px;
  }

  /* Trace lines are clickable — surface the affordance on hover. */
  .trace-line { cursor: pointer; transition: background 0.12s, opacity 0.2s; }
  .trace-line:hover { background: rgba(56, 182, 255, 0.06); }
  /* When a beam filter is active, dim trace lines that don't match
     the active phase. Matching ones get a subtle accent border so
     the filter affordance is visible in BOTH the constellation and
     the trace panel. */
  .trace-line.filter-dim { opacity: 0.32; }
  .trace-line.filter-match {
    border-left: 2px solid var(--accent);
    margin-left: -8px; padding-left: 8px;
  }
  /* Filter status hint sits next to the chip row. Subtle. */
  .filter-status {
    text-align: center;
    margin-top: 4px;
    font: 10px ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    color: var(--text-faint);
    pointer-events: none;
    transition: opacity 0.3s;
    opacity: 0;
  }
  .filter-status.visible { opacity: 1; }
  .filter-status .matches { color: var(--accent); font-weight: 600; }

  /* Matrix-rain modal: vertical scroll of raw JSON-RPC frames for one
     agent. Phosphor-green retro aesthetic on top of the constellation. */
  .matrix-modal {
    position: fixed; inset: 0; z-index: 20;
    display: none; align-items: stretch; justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
  }
  .matrix-modal.open { display: flex; }
  .matrix-modal-head {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    z-index: 22;
    display: flex; align-items: center; gap: 12px;
    padding: 8px 18px;
    background: rgba(0, 0, 0, 0.85);
    border: 1px solid #2eff6a; border-radius: 4px;
    color: #2eff6a; font: 11px ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .matrix-modal-title { font-weight: 600; }
  .matrix-modal-close {
    background: transparent; border: 1px solid #2eff6a; color: #2eff6a;
    width: 22px; height: 22px; line-height: 18px; padding: 0;
    border-radius: 3px; cursor: pointer;
    font-family: inherit; font-size: 14px;
  }
  .matrix-modal-close:hover { background: rgba(46, 255, 106, 0.15); }
  .matrix-modal-foot {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    z-index: 22;
    color: #2eff6a; font: 10px ui-monospace, monospace;
    opacity: 0.55; letter-spacing: 0.08em;
  }
  .matrix-rain {
    flex: 1;
    align-self: center;
    width: min(720px, 80vw);
    max-height: 80vh;
    overflow: hidden;
    padding: 60px 24px 60px;
    color: #6dd089;     /* fix-all-gaps: less saturated — was #2eff6a */
    font: 10.5px ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    line-height: 1.45;
    text-shadow: 0 0 5px rgba(109, 208, 137, 0.4);
    position: relative;
  }
  .matrix-rain pre {
    margin: 0 0 14px;
    white-space: pre-wrap; word-break: break-all;
    opacity: 0.0;
    animation: matrix-fade-in 0.6s ease forwards;
  }
  .matrix-rain pre:nth-child(odd) { color: #6dd089; }
  .matrix-rain pre:nth-child(even) { color: #8de0a3; }
  @keyframes matrix-fade-in {
    0% { opacity: 0; transform: translateY(-8px); }
    100% { opacity: 0.92; transform: translateY(0); }
  }

  /* Home link + pause now flow inline as part of .topbar-meta — was
     position: fixed before, which overlapped the b2b_pull / back-to-
     demo pills. Inline keeps the topbar tidy and avoids fixed-element
     collisions. */
  .home-link {
    background: rgba(0,0,0,0.4); color: var(--text-dim);
    padding: 6px 12px; font-size: 11px; text-decoration: none;
    border: 1px solid rgba(56, 182, 255, 0.16); border-radius: 12px;
    pointer-events: auto;
    font-family: inherit;
  }
  .home-link:hover { color: var(--accent); border-color: var(--accent); }

  .hero-overlay {
    position: fixed; inset: 0; pointer-events: none; z-index: 5;
    background: radial-gradient(circle at 50% 50%, transparent, rgba(0,0,0,0.45));
  }

  /* Governance-deny flash — full-screen red pulse signaling cycle abort.
     Triggered programmatically by JS by toggling .firing class. Used
     for cinematic drama: the room sees the protocol "fail loud". */
  .deny-flash {
    position: fixed; inset: 0; pointer-events: none; z-index: 8;
    background: radial-gradient(circle at 50% 50%, rgba(255, 70, 70, 0.55), rgba(120, 20, 20, 0.0));
    opacity: 0;
    mix-blend-mode: screen;
  }
  .deny-flash.firing {
    animation: deny-pulse 1.4s ease-out;
  }
  @keyframes deny-pulse {
    0%   { opacity: 0;   transform: scale(0.92); }
    18%  { opacity: 0.85; transform: scale(1.02); }
    52%  { opacity: 0.40; transform: scale(1.05); }
    100% { opacity: 0;   transform: scale(1.10); }
  }

  /* Cinema preset cluster — three buttons sharing space with the audio
     toggle. Hidden in hide-UI mode along with the rest. */
  .cinema-cluster {
    position: fixed; bottom: 18px; left: 350px; z-index: 11;
    display: flex; gap: 6px;
    pointer-events: auto;
  }
  body.hide-ui .cinema-cluster { opacity: 0; pointer-events: none; transition: opacity 0.4s; }
  body.hide-ui .cinema-cluster.armed { opacity: 0.45; }
  body.hide-ui .cinema-cluster:hover { opacity: 1; }
  .cinema-btn {
    background: var(--panel); border: 1px solid var(--panel-border); border-radius: 16px;
    padding: 6px 12px; font-size: 11px; cursor: pointer; color: var(--text-dim);
    font-family: inherit;
  }
  .cinema-btn:hover { color: var(--accent); border-color: var(--accent); }
  .cinema-btn.on { color: var(--accent); border-color: var(--accent); background: rgba(56, 182, 255, 0.08); }

  /* Stats overlay — merged into the legend panel via shared parent.
     Style for the inline section inside .legend (no longer a fixed
     panel of its own; was causing stack overlap with the legend). */
  .stats-section { font: 11px ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  .stat-row { display: flex; justify-content: space-between; padding: 2px 0; gap: 12px; font-size: 11px; }
  .stat-row .k { color: var(--text-mut); }
  .stat-row .v { color: var(--text); font-weight: 600; }
  .stat-row .v.live  { color: #5fd9c4; }
  .stat-row .v.stale { color: #ff9080; }
  /* Legend panel may grow tall — cap it to viewport so the entire
     thing scrolls inside its own bounds rather than overlapping
     other UI when there's lots of agent roles + message kinds. */
  .legend {
    max-height: calc(100vh - 36px);
    overflow-y: auto;
  }

  /* Keyboard hint pill — small bottom-right ribbon listing the keys.
     Fades after 8s on first paint; reappears on '?' keypress. */
  .kbd-hint {
    position: fixed; bottom: 18px; right: 18px; z-index: 11;
    background: var(--panel); border: 1px solid var(--panel-border); border-radius: 6px;
    padding: 6px 10px;
    font: 10.5px ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    color: var(--text-dim);
    pointer-events: none;
    transition: opacity 0.6s;
  }
  .kbd-hint.fade-out { opacity: 0; }
  .kbd-hint kbd {
    background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 1px 5px; border-radius: 3px; margin: 0 1px;
    font-family: inherit; color: var(--text);
  }
</style>
</head>
<body>
<div id="stage"></div>
<div class="hero-overlay"></div>
<div class="deny-flash" id="deny-flash"></div>
<div id="label-layer"></div>

<div class="brief-banner hidden" id="brief-banner">
  <div class="brief-banner-label">CURRENT BRIEF</div>
  <div class="brief-banner-prompt" id="brief-prompt">awaiting first brief…</div>
  <div class="brief-banner-meta" id="brief-meta"></div>
</div>

<div class="phase-banner" id="phase-banner">
  <span class="phase-dot" aria-hidden="true"></span>
  <span class="phase-num" id="phase-num">PHASE —</span>
  <span id="phase-title">awaiting first brief</span>
  <span class="phase-meta" id="phase-meta"></span>
</div>

<!-- Trace detail modal — opens when a trace line is clicked. Renders
     the full trace object as syntax-highlighted JSON, plus a synthesized
     reasoning paragraph explaining the trace's role in the ceremony.
     Streams in with cinematic effects. -->
<div class="trace-detail-modal" id="trace-detail-modal">
  <div class="trace-detail-card" id="trace-detail-card">
    <div class="trace-detail-head">
      <span class="trace-detail-kind" id="td-kind">—</span>
      <span class="trace-detail-agent" id="td-agent"></span>
      <button class="trace-detail-close" id="td-close" aria-label="Close">×</button>
    </div>
    <div class="trace-detail-summary" id="td-summary">—</div>
    <div class="trace-detail-section">
      <div class="trace-detail-section-title">Why this happened</div>
      <div class="trace-detail-reasoning" id="td-reasoning">—</div>
    </div>
    <div class="trace-detail-section">
      <div class="trace-detail-section-title">Connected agents</div>
      <div class="trace-detail-agents" id="td-agents">—</div>
    </div>
    <div class="trace-detail-section">
      <div class="trace-detail-section-title">Full payload (JSON)</div>
      <pre class="trace-detail-json" id="td-json">{}</pre>
    </div>
    <div class="trace-detail-section">
      <div class="trace-detail-section-title">Brief context</div>
      <div class="trace-detail-brief" id="td-brief">—</div>
    </div>
  </div>
</div>

<div class="topbar">
  <div class="brand">
    <div class="brand-mark"></div>
    <div>
      <div class="brand-title">AdCP Ecosystem · live</div>
      <div class="brand-sub" id="brand-sub">connecting…</div>
    </div>
  </div>
  <div class="topbar-meta">
    <span class="meta-pill">cycle <b id="meta-cycle">—</b></span>
    <span class="meta-pill">agents <b id="meta-agents">—</b></span>
    <span class="meta-pill">audio_pull <b id="meta-audio">—</b></span>
    <span class="meta-pill">ctv_pull <b id="meta-ctv">—</b></span>
    <span class="meta-pill">b2b_pull <b id="meta-b2b">—</b></span>
    <button class="global-pause" id="global-pause" type="button">⏸ pause</button>
    <a href="/" class="home-link">← back to demo</a>
  </div>
</div>

<!-- Filter chips: data-filter values are PHASE keys that match the
     ev.message.kind via substring (e.g. "sales" matches both
     "sales_fanout" and "sales_response"). Was filtering by color_hint
     before, which made the "sales" chip filter only response beams
     and miss the fanout. Now filters the entire phase. -->
<div class="beam-filter" id="beam-filter">
  <button class="beam-chip active" data-filter="all">all</button>
  <button class="beam-chip" data-filter="identity">identity</button>
  <button class="beam-chip" data-filter="signal">signals</button>
  <button class="beam-chip" data-filter="governance">governance</button>
  <button class="beam-chip" data-filter="sales">sales</button>
  <button class="beam-chip" data-filter="creative">creative</button>
  <button class="beam-chip" data-filter="buying">bids</button>
  <button class="beam-chip" data-filter="cleanroom">cleanroom</button>
  <button class="beam-chip" data-filter="measurement">measurement</button>
  <button class="beam-chip" data-filter="deactivation">deactivation</button>
  <div class="filter-status" id="filter-status">
    filtering: <span class="matches" id="filter-status-name">—</span> · <span id="filter-status-count">0</span> matched this cycle
  </div>
</div>

<!-- fix-all-gaps: onboarding walkthrough. Shown once on first visit;
     localStorage gate prevents re-show. Skippable via "Skip" button. -->
<div class="onboarding" id="onboarding">
  <div class="onboarding-card" id="onboarding-card">
    <div class="onboarding-step" id="ob-step">STEP 1 / 5</div>
    <h2 class="onboarding-title" id="ob-title">—</h2>
    <div class="onboarding-body" id="ob-body">—</div>
    <div class="onboarding-actions">
      <div class="onboarding-progress" id="ob-progress">
        <span class="onboarding-progress-dot active"></span>
        <span class="onboarding-progress-dot"></span>
        <span class="onboarding-progress-dot"></span>
        <span class="onboarding-progress-dot"></span>
        <span class="onboarding-progress-dot"></span>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="onboarding-skip" id="ob-skip">skip</button>
        <button class="onboarding-btn" id="ob-next">next →</button>
      </div>
    </div>
  </div>
</div>

<!-- Trimmed: Cycles row removed (dup of topbar "cycle"), Build row
     removed (low signal, build version visible at /health),
     per-role agent counts removed (topbar already shows total
     "agents 34"; the legend's job is color→meaning, not counts). -->
<div class="legend">
  <div class="stats-section">
    <div class="legend-title">Live ecosystem</div>
    <div class="stat-row"><span class="k">Avg lift</span><span class="v" id="stat-avg-lift">—</span></div>
    <div class="stat-row"><span class="k">Top agent</span><span class="v" id="stat-top-agent">—</span></div>
    <div class="stat-row"><span class="k">Live probe</span><span class="v live" id="stat-live-probe">—</span></div>
  </div>
  <div class="legend-divider"></div>
  <div class="legend-title">Agent roles</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-signals)"></div>Signals</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-identity)"></div>Identity</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-sales)"></div>Sales</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-buying)"></div>Buying</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-creative)"></div>Creative</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-measurement)"></div>Measurement</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-cleanroom)"></div>Clean room</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-governance)"></div>Governance</div>
  <div class="legend-divider"></div>
  <div class="legend-title">Message colors</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-discovery)"></div>discovery / fanout</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-signal)"></div>signal response</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-policy)"></div>governance / cleanroom</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-product)"></div>products</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-creative-msg)"></div>creative formats</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-bid)"></div>buying bids</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-measure)"></div>measurement / push</div>
</div>

<div class="trace-panel" id="trace-panel">
  <div class="trace-panel-head">
    <div class="trace-panel-title">Live ceremony · biz trace</div>
    <button class="trace-panel-toggle" id="trace-pause">pause</button>
  </div>
  <div id="trace-body">
    <div style="color:var(--text-dim); font-size:11px; padding:18px 0; text-align:center;">waiting for first brief…</div>
  </div>
</div>

<div class="agent-panel" id="agent-panel">
  <div class="agent-panel-head">
    <div>
      <div class="agent-panel-name" id="ap-name">—</div>
      <div class="agent-panel-vendor" id="ap-vendor">—</div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;">
      <span class="agent-panel-role" id="ap-role">—</span>
      <button class="agent-panel-close" id="ap-close" aria-label="Close">×</button>
    </div>
  </div>
  <div class="agent-panel-stage" id="ap-stage">—</div>
  <div class="agent-panel-spec" id="ap-spec">—</div>
  <div class="agent-panel-lift">
    <div class="agent-panel-lift-label">Rolling lift score</div>
    <div class="agent-panel-lift-bar"><div class="agent-panel-lift-fill" id="ap-lift" style="width:50%;"></div></div>
  </div>
</div>

<button class="audio-toggle" id="audio-toggle">♪ audio off</button>
<div class="cinema-cluster" id="cinema-cluster">
  <button class="cinema-btn" data-cinema-preset="15">▶ 15s</button>
  <button class="cinema-btn" data-cinema-preset="60">▶ 60s</button>
  <button class="cinema-btn" data-cinema-preset="180">▶ 3min</button>
</div>
<button class="audio-toggle" id="hide-ui-toggle" style="left: 540px;">⌘ hide UI</button>

<div class="kbd-hint" id="kbd-hint">
  <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> cinema · <kbd>U</kbd> hide UI · <kbd>A</kbd> audio · <kbd>?</kbd> show keys
</div>

<!-- Matrix-rain modal: full-height vertical column of raw JSON-RPC
     frames for a single agent, rendered as scrolling text. Opens on
     click; dismisses on ESC, click outside, or close button. -->
<div class="matrix-modal" id="matrix-modal">
  <div class="matrix-modal-head">
    <span class="matrix-modal-title" id="matrix-modal-title">—</span>
    <button class="matrix-modal-close" id="matrix-modal-close">×</button>
  </div>
  <div class="matrix-rain" id="matrix-rain"></div>
  <div class="matrix-modal-foot">click outside to dismiss · last 24 frames per agent</div>
</div>

<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.170.0/examples/jsm/"
  }
}
</script>

<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// fix-render-fix: hoist mutable UI flags here (before scene init +
// animate() is called) so the animation loop's references can never
// hit a TDZ even if a later init block throws. Defaults are safe:
// not paused, all-filter. Using var (truly hoisted) so any position
// issue from later refactors cannot reintroduce TDZ.
var globalPaused = false;
var beamFilter = "all";

// Surface any unhandled error so silent JS failures (the kind that
// kept the constellation invisible while everything else rendered)
// become visible in DevTools instead of looking like a black canvas.
window.addEventListener("error", function (e) {
  console.error("[ecosystem] uncaught:", e.message, e.filename + ":" + e.lineno + ":" + e.colno);
});
window.addEventListener("unhandledrejection", function (e) {
  console.error("[ecosystem] unhandled promise:", e.reason);
});

// ── Constants ────────────────────────────────────────────────────────────
const ROLE_COLORS = {
  sales:       0xffb454,
  signals:     0x38b6ff,
  buying:      0xff5e87,
  creative:    0xc98aff,
  measurement: 0x5fd9c4,
  governance:  0xf59e0b,
  identity:    0x80a8ff,  // fix-all-gaps: ID-resolution providers
  cleanroom:   0xb8a0ff,  // fix-all-gaps: privacy-preserving joins
};
const HINT_COLORS = {
  discovery:   0x38b6ff,
  signal:      0x5fd9c4,
  policy:      0xf59e0b,
  product:     0xffb454,
  creative:    0xc98aff,
  bid:         0xff5e87,
  measurement: 0xffd166,
};
const BUYER_AGENT_ID = "__buyer_orchestrator";
const SPHERE_RADIUS = 16;

// ── Scene setup ──────────────────────────────────────────────────────────
const stage = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x04060a, 1);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04060a, 0.018);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 6, 38);

// ── Post-processing: bloom the emissive nodes + beams ───────────────────
//
// EffectComposer renders the scene into a render target, then applies
// UnrealBloomPass which threshold-extracts bright pixels and gaussian-
// blurs them at multiple scales for a glow effect. Tuned conservatively
// so we don't drown the constellation in glow — just enough to make
// the firing nodes feel hot. Exposure stays near 1.0 so colors don't
// shift.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.35,   // strength — multi-effect stacking (halos + sparks + buyer
          //            pulse + money particles) overwhelmed even 0.55.
          //            0.35 keeps glow visible without washing the
          //            constellation white.
  0.45,   // radius
  0.45    // threshold — only firing/active emissive crosses; idle
          //              nodes stay crisp and readable
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.minDistance = 22;
controls.maxDistance = 70;

// Soft ambient + a colored rim light
scene.add(new THREE.AmbientLight(0x4060a0, 0.5));
const rim = new THREE.DirectionalLight(0x80b0ff, 0.8);
rim.position.set(20, 20, 10);
scene.add(rim);

// Background star sprinkle for depth
{
  const starGeo = new THREE.BufferGeometry();
  const N = 800;
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 60 + Math.random() * 30;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    positions[i * 3]     = r * Math.sin(p) * Math.cos(t);
    positions[i * 3 + 1] = r * Math.cos(p);
    positions[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0x6080a0, size: 0.06, transparent: true, opacity: 0.55 });
  scene.add(new THREE.Points(starGeo, starMat));
}

// Buyer-orchestrator at origin
const buyerGeo = new THREE.SphereGeometry(1.2, 32, 32);
const buyerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.32, metalness: 0.2, roughness: 0.5 });
const buyerMesh = new THREE.Mesh(buyerGeo, buyerMat);
scene.add(buyerMesh);
{
  // Buyer halo — calmer (was 0.20, now 0.10)
  const haloGeo = new THREE.RingGeometry(1.5, 1.75, 64);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.10 });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.rotation.x = Math.PI / 2;
  scene.add(halo);
}

// ── Agent meshes ─────────────────────────────────────────────────────────
const agentMeshes = new Map();   // id → { mesh, halo, position, agent, lift }
const agents = new Map();        // id → agent record
const liftHaloDecay = new Map(); // id → { intensity, decayPerFrame }

function layoutToPosition(layout) {
  const r = SPHERE_RADIUS - layout.ring * 0.6;
  const x = r * Math.sin(layout.phi) * Math.cos(layout.theta);
  const y = r * Math.cos(layout.phi);
  const z = r * Math.sin(layout.phi) * Math.sin(layout.theta);
  return new THREE.Vector3(x, y, z);
}

function spawnAgent(agent) {
  const pos = layoutToPosition(agent.layout);
  const color = ROLE_COLORS[agent.role] || 0xffffff;
  const geo = new THREE.SphereGeometry(0.7, 24, 24);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: agent.stage === "live" ? 0.55 : 0.30,
    metalness: 0.15, roughness: 0.55,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.userData.agentId = agent.id;
  scene.add(mesh);

  // Halo ring (driven by lift score)
  const haloGeo = new THREE.RingGeometry(1.0, 1.35, 48);
  const haloMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.0 });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.position.copy(pos);
  halo.lookAt(0, 0, 0);
  scene.add(halo);

  // Tether line from buyer to agent (subtle, always visible)
  const tetherGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), pos.clone()]);
  const tetherMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.06 });
  const tether = new THREE.Line(tetherGeo, tetherMat);
  scene.add(tether);

  // Always-visible name label. DOM element positioned each frame
  // by projecting the mesh's 3D position to screen coords. Adds the
  // single missing readability affordance — viewers can see WHO is
  // firing without clicking. Stage-prefix (LIVE/SIM) badge upfront so
  // it's clear which agents are talking to real services.
  const labelEl = document.createElement("div");
  labelEl.className = "agent-label";
  const stageBadge = agent.stage === "live" ? "● " : "○ ";
  labelEl.textContent = stageBadge + agent.name;
  labelEl.style.color = "#" + color.toString(16).padStart(6, "0");
  labelEl.style.borderColor = "rgba(" + ((color >> 16) & 0xff) + "," + ((color >> 8) & 0xff) + "," + (color & 0xff) + ",0.35)";
  document.getElementById("label-layer").appendChild(labelEl);

  agentMeshes.set(agent.id, { mesh, halo, position: pos, agent, lift: 0.5, label: labelEl, firingTimeout: 0 });
  agents.set(agent.id, agent);
}

// Pulse an agent visually when it sends/receives a message — bigger
// glow, a quick scale bump, label highlights. Scheduled with a
// timeout so concurrent beams stack rather than overwriting each
// other's decay. Helps viewers correlate beams to specific nodes.
function flashAgentFiring(agentId) {
  const m = agentMeshes.get(agentId);
  if (!m) return;
  m.firingTimeout = 22; // frames of enhanced emission
  if (m.label) m.label.classList.add("firing");
  setTimeout(function () { if (m.label) m.label.classList.remove("firing"); }, 480);
}

// PR D — drama beats:
// (a) Full-screen red flash when governance denies the cycle. The flash
//     lasts ~1.4s, peaks at 18%, and decays out. Re-arms on every deny
//     (we cancel the previous animation's class-toggle by reflowing).
// (b) Per-agent "scatter" — when this agent is the denying gov agent,
//     spawn a visually distinct expanding red halo to anchor the drama
//     to that specific node.
const denyFlashEl = document.getElementById("deny-flash");
function triggerDenyFlash() {
  denyFlashEl.classList.remove("firing");
  void denyFlashEl.offsetWidth; // force restart of the keyframe
  denyFlashEl.classList.add("firing");
}
function flashAgentDramaScatter(agentId) {
  const m = agentMeshes.get(agentId);
  if (!m) return;
  // Inject a bright red halo with steep decay, overrides the lift halo
  // for a moment.
  liftHaloDecay.set(agentId, { intensity: 1.4, decayPerFrame: 0.018, dramaColor: 0xff4646 });
  // Bigger emissive boost than ordinary firing.
  m.firingTimeout = 50;
  if (m.label) {
    m.label.style.color = "#ff7070";
    m.label.style.borderColor = "rgba(255, 70, 70, 0.7)";
    setTimeout(function () {
      // Restore original styling
      const role = m.agent.role;
      const c = ROLE_COLORS[role] || 0xffffff;
      m.label.style.color = "#" + c.toString(16).padStart(6, "0");
      m.label.style.borderColor = "rgba(" + ((c >> 16) & 0xff) + "," + ((c >> 8) & 0xff) + "," + (c & 0xff) + ",0.35)";
    }, 1400);
  }
}

// PR D — dramatic lift halo amplification.
// PR G — dialed back: prior settings (peak 1.5, scale 2.0, slow decay)
// drowned the constellation in glow when bloom amplified them and
// multiple high-lift halos overlapped. Tuned conservatively now:
//   peak intensity 0.35-0.70, capped well below 1.0
//   pulseScaleMax 1.15-1.40 (was up to 2.0)
//   decay 0.014-0.026/frame (faster — halos resolve in ~1s)
// High-lift agents still announce themselves, but readability stays.
function triggerLiftHalo(agentId, score) {
  // Second pass dial-back. Multiple lift halos firing at once + bloom
  // were drowning the constellation. Cut peak intensity ~30%, scale
  // ~15%, faster decay.
  liftHaloDecay.set(agentId, {
    intensity: 0.22 + score * 0.22,    // max 0.44 (was 0.70)
    decayPerFrame: 0.020 + (1 - score) * 0.012, // resolves in 0.5-1s
    pulseScale: 1.0,
    pulseGrowth: 0.014 + score * 0.010,
    pulseScaleMax: 1.10 + score * 0.18, // max 1.28 (was 1.40)
  });
}

// ── Message beams ────────────────────────────────────────────────────────
//
// Each beam is a Line2-style Catmull-Rom curve from src to dst with a
// pulse traveling along it. We model it as a glowing tube segment that
// moves t = 0 → 1 over its lifetime, then disposes.

const beams = [];
const MAX_BEAMS = 200;

function getPos(agentId) {
  if (agentId === BUYER_AGENT_ID) return new THREE.Vector3(0, 0, 0);
  const m = agentMeshes.get(agentId);
  return m ? m.position.clone() : null;
}

// Beam visual weight by message kind. Governance + measurement messages
// are the heavy beats of the ceremony — render their pulses larger.
// Tone-down pass: line opacities cut ~30% and pulse sizes ~15% so
// 200 concurrent beams + bloom don't smear the whole scene.
const BEAM_WEIGHT = {
  policy:      { pulseSize: 0.24, lineOpacity: 0.55 },
  measurement: { pulseSize: 0.26, lineOpacity: 0.55 },
  bid:         { pulseSize: 0.22, lineOpacity: 0.50 },
  signal:      { pulseSize: 0.17, lineOpacity: 0.42 },
  product:     { pulseSize: 0.17, lineOpacity: 0.42 },
  creative:    { pulseSize: 0.15, lineOpacity: 0.38 },
  discovery:   { pulseSize: 0.15, lineOpacity: 0.35 },
};

function spawnBeam(fromId, toId, colorHint, intensity) {
  const from = getPos(fromId);
  const to = getPos(toId);
  if (!from || !to) return;
  // Intensity multiplier (default 1.0). When the active beam filter
  // doesn't match, the caller passes 0.18 so the beam still spawns
  // (cycle stays visible) but visually recedes.
  const intens = intensity === undefined ? 1.0 : intensity;
  // Pulse endpoints only at full intensity — dimmed beams shouldn't
  // also light up the agents (otherwise the filter affordance is lost).
  if (intens >= 0.9) {
    if (fromId !== BUYER_AGENT_ID) flashAgentFiring(fromId);
    if (toId !== BUYER_AGENT_ID) flashAgentFiring(toId);
  }
  const baseWeight = BEAM_WEIGHT[colorHint] || { pulseSize: 0.18, lineOpacity: 0.55 };
  const weight = {
    pulseSize: baseWeight.pulseSize * (intens < 0.9 ? 0.7 : 1.0),
    lineOpacity: baseWeight.lineOpacity * intens,
  };
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const dir = to.clone().sub(from).normalize();
  const perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();
  // Bend mid-point outward so beams arc rather than line through buyer
  mid.add(perp.multiplyScalar(2 + Math.random() * 1.5));
  mid.y += 0.5 + Math.random();
  const curve = new THREE.CatmullRomCurve3([from, mid, to]);
  const samples = 24;
  const points = curve.getPoints(samples);
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const color = HINT_COLORS[colorHint] || 0x80a0ff;
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: weight.lineOpacity });
  const line = new THREE.Line(geo, mat);
  scene.add(line);

  // A pulse sprite that travels the curve. Heavy-beat messages get
  // a bigger sphere so governance + measurement read as the climax
  // beats of the cycle.
  const pulseGeo = new THREE.SphereGeometry(weight.pulseSize, 14, 14);
  const pulseMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 * intens });
  const pulse = new THREE.Mesh(pulseGeo, pulseMat);
  pulse.position.copy(from);
  scene.add(pulse);

  // Motion-blur trail: a circular buffer of "ghost" pulse sprites that
  // each frame inherit the lead pulse's previous position with decaying
  // opacity. Cheap to render (just N small spheres), creates the comet
  // look without per-frame texture compositing.
  const TRAIL_LEN = 6;
  const trail = [];
  for (let i = 0; i < TRAIL_LEN; i++) {
    const trailGeo = new THREE.SphereGeometry(weight.pulseSize * (1 - i * 0.10), 8, 8);
    const trailMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0 });
    const tMesh = new THREE.Mesh(trailGeo, trailMat);
    tMesh.position.copy(from);
    scene.add(tMesh);
    trail.push({ mesh: tMesh, mat: trailMat });
  }

  beams.push({
    line, mat, pulse, pulseMat, curve, t: 0, life: 1.0, color,
    weight, trail,
    intens,  // intensity multiplier carried through animation
    // Ring buffer of recent positions, used to seed the trail meshes
    // each frame.
    history: [],
  });

  // Trim if too many
  while (beams.length > MAX_BEAMS) {
    const old = beams.shift();
    if (old) {
      scene.remove(old.line);
      scene.remove(old.pulse);
      old.line.geometry.dispose();
      old.mat.dispose();
      old.pulseMat.dispose();
      if (old.trail) {
        for (const tr of old.trail) {
          scene.remove(tr.mesh);
          tr.mesh.geometry.dispose();
          tr.mat.dispose();
        }
      }
    }
  }

  audioBlip(colorHint);
}

// ── Money flow particles ────────────────────────────────────────────────
//
// Gold particles streaming buyer → agent on each bid commit. Each
// particle is a tiny sphere with a random arc (similar to beams but
// thinner + slower + grouped). Particles ride the same Catmull-Rom
// curve scheme as beams; on completion the particle is recycled.
//
// Visual reads as "money is flowing" — adds the missing $ transit
// to the cycle. Higher commits = more particles. The buyer thus
// ALSO becomes a visible attractor, not just a still center.
const moneyParticles = [];
const MAX_MONEY_PARTICLES = 240;

function spawnMoneyFlow(fromId, toId, count) {
  const from = getPos(fromId);
  const to = getPos(toId);
  if (!from || !to) return;
  for (let i = 0; i < count; i++) {
    // Stagger spawn so the stream feels like a flow, not a single burst
    setTimeout(function () {
      const mid = from.clone().add(to).multiplyScalar(0.5);
      // Each particle gets its own arc offset
      const dir = to.clone().sub(from).normalize();
      const perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();
      mid.add(perp.multiplyScalar(1.2 + Math.random() * 1.8));
      mid.y += (Math.random() - 0.4) * 1.6;
      const curve = new THREE.CatmullRomCurve3([from.clone(), mid, to.clone()]);
      // Smaller + dimmer than first pass — particles still readable
      // but no longer trail-painting the screen.
      const geo = new THREE.SphereGeometry(0.07 + Math.random() * 0.04, 6, 6);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd166,    // gold
        transparent: true,
        opacity: 0.65,
      });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.position.copy(from);
      scene.add(sphere);
      moneyParticles.push({
        sphere, mat, curve,
        t: 0,
        speed: 0.012 + Math.random() * 0.008,
      });
      while (moneyParticles.length > MAX_MONEY_PARTICLES) {
        const old = moneyParticles.shift();
        if (old) {
          scene.remove(old.sphere);
          old.sphere.geometry.dispose();
          old.mat.dispose();
        }
      }
    }, i * 28); // 28ms stagger between particles
  }
  // Audio cue for the money stream — short low-pitch coin-clink
  if (audioOn && audioCtx) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 320 + Math.random() * 80;
    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.65);
  }
}

// ── Supernova (cycle-complete finale) ───────────────────────────────────
//
// An expanding wireframe ring + radial particle spray from the buyer
// mesh. Fires once on each cycle_end SSE event. Reads as "the
// ceremony just resolved" — gives the viewer a sense of climax + a
// visual rest beat between cycles. Doubles as audio cue: a soft
// chord swell.
const supernovaRings = [];
function triggerSupernova() {
  // Ring — slimmer + dimmer than the first pass. Was 0.85 peak white,
  // now 0.40 — viewer still sees the punctuation beat without the
  // ring becoming the loudest thing on screen.
  const ringGeo = new THREE.RingGeometry(1.4, 1.50, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.40,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(0, 0, 0);
  scene.add(ring);
  supernovaRings.push({ ring, mat: ringMat, scale: 1.0, life: 1.0 });
  // Radial sparks — count cut 30 → 14, smaller geometry, dimmer base.
  const SPARK_COUNT = 14;
  for (let i = 0; i < SPARK_COUNT; i++) {
    const angle = (i / SPARK_COUNT) * Math.PI * 2 + Math.random() * 0.2;
    const elev = (Math.random() - 0.5) * Math.PI * 0.4;
    const dir = new THREE.Vector3(
      Math.cos(angle) * Math.cos(elev),
      Math.sin(elev),
      Math.sin(angle) * Math.cos(elev)
    );
    const sparkGeo = new THREE.SphereGeometry(0.10, 6, 6);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xfff0c0,
      transparent: true,
      opacity: 0.70,
    });
    const spark = new THREE.Mesh(sparkGeo, sparkMat);
    spark.position.set(0, 0, 0);
    scene.add(spark);
    moneyParticles.push({
      sphere: spark,
      mat: sparkMat,
      // Linear-trajectory particle, distinct from money-flow's curve
      // ones. We piggyback on the money-particle frame loop using a
      // velocity vector + free-flight semantics; t not used here.
      _isSupernovaSpark: true,
      velocity: dir.multiplyScalar(0.45 + Math.random() * 0.3),
      life: 0.85,
    });
  }
  // Audio: short chord-like swell
  if (audioOn && audioCtx) {
    const baseFreq = 528;
    [1, 1.25, 1.5].forEach(function (mult, idx) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = baseFreq * mult;
      const now = audioCtx.currentTime + idx * 0.04;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 1.3);
    });
  }
}

// ── SSE wiring ───────────────────────────────────────────────────────────
const traceBody = document.getElementById("trace-body");
const brandSub = document.getElementById("brand-sub");
const metaCycle = document.getElementById("meta-cycle");
const metaAgents = document.getElementById("meta-agents");
const metaAudio = document.getElementById("meta-audio");
const metaCtv = document.getElementById("meta-ctv");
const metaB2b = document.getElementById("meta-b2b");

let tracePaused = false;
document.getElementById("trace-pause").addEventListener("click", function () {
  tracePaused = !tracePaused;
  this.textContent = tracePaused ? "resume" : "pause";
});

// ── Live probe status integration ───────────────────────────────────────
// /ecosystem/stream emits live_probe events every ~45s with per-agent
// liveness results from a real MCP tools/list ping. This updates the
// agent's stage indicator on the constellation: live ● when the most
// recent probe within the rolling window succeeded; degraded ● when
// it failed or hasn't fired yet; synthetic ○ for agents that never
// claimed a live URL. Updates the agent details panel on next click
// so the stage line reflects the latest probe result.
const liveProbeByAgent = new Map();
function updateLiveProbeStatuses(statuses) {
  for (const s of statuses) {
    liveProbeByAgent.set(s.agent_id, s);
    const m = agentMeshes.get(s.agent_id);
    if (!m || !m.label) continue;
    const agent = m.agent;
    if (agent.stage !== "live") continue;
    // Three-tier liveness indicator:
    //   ● mint   — HTTP 200 (full handshake)
    //   ● amber  — alive but rejecting our probe (HTTP 4xx — needs
    //              session-id, auth, or different body shape)
    //   ◑ red    — server unreachable / 5xx / timeout
    const isOk = s.last_status === "ok";
    const isAlive = s.is_live_now;
    let badge;
    let borderColor;
    if (isOk) {
      badge = "● ";
      borderColor = "rgba(95, 217, 196, 0.55)"; // mint
    } else if (isAlive) {
      // 4xx — alive but won't accept our probe shape
      badge = "● ";
      borderColor = "rgba(245, 158, 11, 0.50)"; // amber
    } else {
      // 5xx / timeout / unreachable
      badge = "◑ ";
      borderColor = "rgba(255, 100, 100, 0.45)"; // dim red
    }
    m.label.textContent = badge + agent.name;
    m.label.style.borderColor = borderColor;
  }
  // HUD: count probes that responded at all (= alive_now), break out
  // the "fully OK" subset for a richer line.
  const live = statuses.filter(function (s) { return s.is_live_now; }).length;
  const ok = statuses.filter(function (s) { return s.last_status === "ok"; }).length;
  const total = statuses.length;
  const probeStat = document.getElementById("stat-live-probe");
  if (probeStat) {
    probeStat.textContent = ok + " ok · " + (live - ok) + " 4xx · " + (total - live) + " down";
    if (probeStat.classList) {
      probeStat.classList.toggle("live", live === total);
      probeStat.classList.toggle("stale", live === 0);
    }
  }
}

// Brief banner — the prominent current-brief display.
const briefBanner = document.getElementById("brief-banner");
const briefPromptEl = document.getElementById("brief-prompt");
const briefMetaEl = document.getElementById("brief-meta");

// Brief-by-id store: lets trace-detail modal show the brief context
// for any historical trace. Trimmed to the last 20 briefs.
const briefById = new Map();
let currentBriefId = null;
let currentBrief = null;

function updateBriefBanner(brief) {
  if (!brief) return;
  briefBanner.classList.remove("hidden");
  briefBanner.classList.remove("spawn-pulse");
  // Force reflow so the keyframe restarts
  void briefBanner.offsetWidth;
  briefBanner.classList.add("spawn-pulse");

  briefPromptEl.textContent = brief.prompt;
  // Highlight whichever weight dimension is dominant
  const weights = brief.weights || {};
  const hot = (weights.audio_bias > weights.ctv_bias && weights.audio_bias > weights.b2b_bias) ? "audio"
    : (weights.ctv_bias > weights.b2b_bias) ? "ctv"
    : (weights.b2b_bias > 0.3) ? "b2b" : null;

  briefMetaEl.innerHTML =
    "<span class=\\"brief-meta-pill\\">budget <b>$" + (brief.budget_usd || 0).toLocaleString() + "</b></span>" +
    "<span class=\\"brief-meta-pill" + (hot === "audio" ? " audio-hot" : "") + "\\">audio <b>" + (weights.audio_bias || 0).toFixed(2) + "</b></span>" +
    "<span class=\\"brief-meta-pill" + (hot === "ctv" ? " ctv-hot" : "") + "\\">ctv <b>" + (weights.ctv_bias || 0).toFixed(2) + "</b></span>" +
    "<span class=\\"brief-meta-pill" + (hot === "b2b" ? " b2b-hot" : "") + "\\">b2b <b>" + (weights.b2b_bias || 0).toFixed(2) + "</b></span>" +
    "<span class=\\"brief-meta-pill\\">id <b>" + brief.id.slice(-8) + "</b></span>";
}

let currentBriefCard = null;
function appendBrief(brief) {
  // Always update the prominent banner — even when paused.
  currentBriefId = brief.id;
  currentBrief = brief;
  briefById.set(brief.id, brief);
  // Trim brief store
  if (briefById.size > 20) {
    const oldestKey = briefById.keys().next().value;
    briefById.delete(oldestKey);
  }
  updateBriefBanner(brief);

  if (tracePaused) return;
  const card = document.createElement("div");
  card.className = "brief-card";
  card.innerHTML =
    "<div class=\\"brief-prompt\\">" + escapeHtml(brief.prompt) + "</div>" +
    "<div class=\\"brief-meta\\">brief " + brief.id.slice(-8) +
    " · $" + (brief.budget_usd || 0).toLocaleString() +
    " · audio " + (brief.weights.audio_bias).toFixed(2) +
    " · ctv " + (brief.weights.ctv_bias).toFixed(2) +
    " · b2b " + (brief.weights.b2b_bias).toFixed(2) + "</div>";
  traceBody.insertBefore(card, traceBody.firstChild);
  currentBriefCard = card;
  // Trim old
  while (traceBody.children.length > 40) traceBody.removeChild(traceBody.lastChild);
}

// Trace store — keyed by trace.id so the click handler can resolve
// click → trace object regardless of how many briefs ago it was.
const traceById = new Map();

function appendTrace(trace) {
  // Always store, even if visible append is paused, so the modal works.
  if (trace.id) traceById.set(trace.id, trace);
  if (traceById.size > 600) {
    const oldestKey = traceById.keys().next().value;
    traceById.delete(oldestKey);
  }

  if (tracePaused) return;
  if (!currentBriefCard) return;
  const line = document.createElement("div");
  line.className = "trace-line";
  if (trace.id) line.dataset.traceId = trace.id;
  // Apply filter-aware classes so matching lines pop and non-matching
  // dim — same affordance as the beam filter, in the trace panel.
  const tk = trace.kind || "";
  if (beamFilter !== "all") {
    const matches = tk.indexOf(beamFilter) !== -1
      || (beamFilter === "measurement" && tk === "realtime_push");
    line.classList.add(matches ? "filter-match" : "filter-dim");
    if (matches) bumpFilterMatchCount();
  }
  const dotColor = (trace.kind && trace.kind.includes("signal")) ? "var(--c-signal)"
    : (trace.kind && trace.kind.includes("governance")) ? "var(--c-policy)"
    : (trace.kind && trace.kind.includes("sales")) ? "var(--c-product)"
    : (trace.kind && trace.kind.includes("buying")) ? "var(--c-bid)"
    : (trace.kind && trace.kind.includes("measurement")) ? "var(--c-measure)"
    : (trace.kind && trace.kind.includes("creative")) ? "var(--c-creative-msg)"
    : (trace.kind && trace.kind.includes("identity")) ? "var(--c-identity, var(--accent))"
    : (trace.kind && trace.kind.includes("cleanroom")) ? "var(--c-cleanroom, var(--accent))"
    : "var(--accent)";
  let summaryClass = "trace-summary";
  const sum = (trace.summary || "").toUpperCase();
  if (sum.indexOf("DENY") !== -1) summaryClass += " deny";
  else if (sum.indexOf("ALLOW") !== -1) summaryClass += " allow";
  else if (sum.indexOf("REVIEW") !== -1) summaryClass += " review";
  line.innerHTML =
    "<div class=\\"trace-dot\\" style=\\"background:" + dotColor + "\\"></div>" +
    "<div class=\\"trace-kind\\">" + escapeHtml((trace.kind || "").replace(/_/g, " ")) + "</div>" +
    "<div class=\\"" + summaryClass + "\\">" + escapeHtml(trace.summary || "") + "</div>";
  currentBriefCard.appendChild(line);
}

// Synthesize a "why this happened" reasoning paragraph for any trace.
// The prose is templated by trace.kind; the template fills with values
// from trace.detail + the brief context. Reads as natural English so a
// non-technical viewer understands the dramaturgy of the moment.
function reasonForTrace(trace, brief) {
  if (!trace) return "—";
  const k = trace.kind || "";
  const det = trace.detail || {};
  const briefPrompt = brief && brief.prompt ? "\\u201C" + brief.prompt + "\\u201D" : "the active brief";
  const agent = trace.agent_id || "an agent";

  if (k === "brief_spawned") {
    const w = (det.weights || {});
    const dimSummary = "audio " + (w.audio_bias || 0).toFixed(2) +
      ", ctv " + (w.ctv_bias || 0).toFixed(2) +
      ", b2b " + (w.b2b_bias || 0).toFixed(2);
    return "The buyer orchestrator generated this brief biased toward " + dimSummary +
      ". The bias comes from the running feedback loop \\u2014 winning briefs in prior cycles pulled the brief generator's weights toward dimensions that measured high lift.";
  }
  if (k === "signals_fanout" || k === "signal_response") {
    const sigCount = (det.signals && det.signals.length) || 0;
    if (k === "signal_response") {
      return "<b>" + agent + "</b> received " + briefPrompt + " and returned <b>" + sigCount + "</b> signal candidates. " +
        "The signals agent matched its catalog against the brief's audience and dimension weights, returning the top-coverage candidates that align with the buyer's intent.";
    }
    return "The orchestrator fanned the brief out to all signals agents in parallel. Each signals agent decides independently which of its catalog entries match \\u2014 there's no central planner.";
  }
  if (k === "governance_check") {
    const outcome = (det.outcome || "").toLowerCase();
    if (outcome === "deny") {
      return "<b>" + agent + "</b> blocked this brief: <b>" + (det.reason || "policy mismatch") + "</b>. " +
        "Governance agents act as parallel gates; any single deny aborts the cycle. This protects buyers from stepping into compliance violations downstream.";
    }
    if (outcome === "review") {
      return "<b>" + agent + "</b> flagged this brief for manual review (" + (det.reason || "review required") + "). " +
        "In a production system, a review verdict would pause the cycle until a human approves; in the demo we let it proceed.";
    }
    return "<b>" + agent + "</b> approved this brief. The agent compared its policy ruleset against the brief's audience claims, consent posture, and target geographies, and saw no blockers.";
  }
  if (k === "sales_fanout" || k === "sales_response") {
    if (k === "sales_response") {
      const prodCount = (det.products && det.products.length) || 0;
      return "<b>" + agent + "</b> returned <b>" + prodCount + "</b> products that match the brief's audience and budget. " +
        "Each product carries inventory metadata (CPM, available impressions) that the buying agents use as bid inputs.";
    }
    return "The orchestrator fanned the now-governance-cleared brief to all sales agents simultaneously. Sales agents are the supply side \\u2014 they hold media inventory and respond with products that match the audience.";
  }
  if (k === "creative_match") {
    return "Creative agents returned the format manifests they support for this brief's chosen products. " +
      "Format selection is a downstream concern \\u2014 by this point the audience and inventory are decided; the buyer just needs assembly instructions.";
  }
  if (k === "buying_bid") {
    const bid = det.bid || {};
    return "<b>" + agent + "</b> committed <b>$" + (bid.budget_committed || 0).toLocaleString() + "</b> at <b>$" + (bid.bid_cpm || 0).toFixed(2) + " CPM</b>. " +
      "Buying agents are the demand side. They aggregate the brief, signals, products, and creative formats into a bid commitment.";
  }
  if (k === "measurement_report") {
    const m = det.measurement || {};
    return "<b>" + agent + "</b> reported <b>" + ((m.lift || 0) * 100).toFixed(0) + "%</b> lift, <b>" + (m.reach_pct || 0).toFixed(1) + "%</b> reach, brand-safety <b>" + ((m.brand_safety || 0) * 100).toFixed(0) + "%</b>. " +
      "This number feeds back into the brief generator: high-lift dimensions get pulled toward in the next cycle's brief weighting. The ecosystem learns from itself.";
  }
  return "Step <b>" + (k.replace(/_/g, " ") || "—") + "</b> in the buying ceremony. " +
    "Each phase fans out to all agents of one role in parallel and waits for responses before advancing.";
}

// ── Trace detail modal logic ────────────────────────────────────────────
const traceDetailModal = document.getElementById("trace-detail-modal");
const tdKindEl = document.getElementById("td-kind");
const tdAgentEl = document.getElementById("td-agent");
const tdSummaryEl = document.getElementById("td-summary");
const tdReasoningEl = document.getElementById("td-reasoning");
const tdAgentsEl = document.getElementById("td-agents");
const tdJsonEl = document.getElementById("td-json");
const tdBriefEl = document.getElementById("td-brief");

function colorizeJson(jsonStr) {
  // Simple syntax highlighter: keys → cyan, strings → mint,
  // numbers → gold, booleans → pink. Operates on already-formatted
  // JSON. Escapes &/</> first so we don't double-encode.
  const escaped = escapeHtml(jsonStr);
  return escaped
    .replace(/(&quot;)([\\w_-]+)(&quot;)(\\s*:)/g, "<span class=\\"k\\">$1$2$3</span>$4")
    .replace(/:\\s*(&quot;)([^&]*)(&quot;)/g, ": <span class=\\"s\\">$1$2$3</span>")
    .replace(/:\\s*(-?\\d+\\.?\\d*)/g, ": <span class=\\"n\\">$1</span>")
    .replace(/:\\s*(true|false|null)/g, ": <span class=\\"b\\">$1</span>");
}

function openTraceDetail(traceId) {
  const trace = traceById.get(traceId);
  if (!trace) return;
  const brief = briefById.get(trace.brief_id) || currentBrief;
  tdKindEl.textContent = (trace.kind || "trace").replace(/_/g, " ");
  tdAgentEl.textContent = trace.agent_id ? ("agent: " + trace.agent_id) : "ceremony-level";
  tdSummaryEl.textContent = trace.summary || "(no summary)";
  tdReasoningEl.innerHTML = reasonForTrace(trace, brief);

  // Connected agents pills — agent that owns the trace + buyer.
  const pills = [];
  if (trace.agent_id) {
    const agent = agents.get(trace.agent_id);
    if (agent) {
      pills.push("<span class=\\"trace-detail-agent-pill\\"><span class=\\"role\\">" + escapeHtml(agent.role) + "</span>" + escapeHtml(agent.name) + "</span>");
    }
  }
  pills.push("<span class=\\"trace-detail-agent-pill\\"><span class=\\"role\\">orchestrator</span>buyer</span>");
  tdAgentsEl.innerHTML = pills.join("");

  // Full payload JSON
  tdJsonEl.innerHTML = colorizeJson(JSON.stringify(trace, null, 2));

  // Brief context
  if (brief) {
    tdBriefEl.innerHTML =
      "<div style=\\"margin-bottom:4px;\\">" + escapeHtml(brief.prompt) + "</div>" +
      "<div style=\\"font:10.5px ui-monospace,monospace;color:var(--text-faint);\\">id " + escapeHtml(brief.id.slice(-12)) +
      " · $" + (brief.budget_usd || 0).toLocaleString() + "</div>";
  } else {
    tdBriefEl.textContent = "(brief not in store)";
  }

  traceDetailModal.classList.add("open");
}
function closeTraceDetail() {
  traceDetailModal.classList.remove("open");
}
document.getElementById("td-close").addEventListener("click", closeTraceDetail);
traceDetailModal.addEventListener("click", function (e) { if (e.target === traceDetailModal) closeTraceDetail(); });
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && traceDetailModal.classList.contains("open")) closeTraceDetail();
});
// Event-delegated click handler on the trace panel — any trace-line gets
// click-detail behavior. New traces get this for free as they're appended.
document.getElementById("trace-panel").addEventListener("click", function (e) {
  const target = e.target && e.target.closest ? e.target.closest(".trace-line") : null;
  if (!target) return;
  const id = target.dataset.traceId;
  if (id) openTraceDetail(id);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "\\"" ? "&quot;" : "&#39;";
  });
}

// Stats overlay refs (cycle count + build now removed — cycle is in
// topbar; build version available at /health for diagnostics).
const statAvgLift = document.getElementById("stat-avg-lift");
const statTopAgent = document.getElementById("stat-top-agent");

function updateState(state) {
  if (!state) return;
  if (state.cycle_count !== undefined) {
    metaCycle.textContent = state.cycle_count;
  }
  if (state.feedback) {
    metaAudio.textContent = state.feedback.audio_pull.toFixed(2);
    metaCtv.textContent = state.feedback.ctv_pull.toFixed(2);
    metaB2b.textContent = state.feedback.b2b_pull.toFixed(2);
  }
  if (state.lift_by_agent) {
    let topAgent = null;
    let topScore = -1;
    let total = 0;
    let count = 0;
    for (const x of state.lift_by_agent) {
      const m = agentMeshes.get(x.agent_id);
      if (m) m.lift = x.score;
      total += x.score;
      count += 1;
      if (x.score > topScore) {
        topScore = x.score;
        topAgent = x;
      }
    }
    if (count > 0) {
      const avg = total / count;
      statAvgLift.textContent = (avg * 100).toFixed(0) + "%";
    }
    if (topAgent) {
      const a = agents.get(topAgent.agent_id);
      const name = a ? a.name : topAgent.agent_id;
      statTopAgent.textContent = name + " · " + (topScore * 100).toFixed(0) + "%";
    }
  }
}

function bootstrapAgents(list) {
  metaAgents.textContent = list.length;
  brandSub.textContent = "streaming · " + list.length + " agents · /ecosystem/stream";
  for (const agent of list) spawnAgent(agent);
}

// Phase banner state — derives the current phase from message kinds.
// The orchestrator runs phases in fixed order; we just watch which kind
// most recently arrived. Index in PHASE_ORDER drives the "PHASE n of 6"
// counter so viewers can see how far through the ceremony we are.
const phaseBanner = document.getElementById("phase-banner");
const phaseNumEl = document.getElementById("phase-num");
const phaseTitleEl = document.getElementById("phase-title");
const phaseMetaEl = document.getElementById("phase-meta");
const PHASE_ORDER = [
  { kinds: ["signals_fanout", "signal_response"],     key: "signals",     title: "Signals discovery",   role_count: 5 },
  { kinds: ["governance_check"],                      key: "governance",  title: "Governance check",    role_count: 3 },
  { kinds: ["sales_fanout", "sales_response"],        key: "sales",       title: "Sales fan-out",       role_count: 10 },
  { kinds: ["creative_match"],                        key: "creative",    title: "Creative match",      role_count: 3 },
  { kinds: ["buying_bid"],                            key: "buying",      title: "Buying bids",         role_count: 5 },
  { kinds: ["measurement_report"],                    key: "measurement", title: "Measurement reports", role_count: 3 },
];
let currentPhaseIdx = -1;
function setPhaseFromKind(kind) {
  if (!kind) return;
  for (let i = 0; i < PHASE_ORDER.length; i++) {
    if (PHASE_ORDER[i].kinds.indexOf(kind) >= 0) {
      if (i === currentPhaseIdx) return;
      currentPhaseIdx = i;
      const ph = PHASE_ORDER[i];
      phaseNumEl.textContent = "PHASE " + (i + 1) + " / 6";
      phaseTitleEl.textContent = ph.title;
      phaseMetaEl.textContent = "· " + ph.role_count + " agents";
      // Swap accent class
      phaseBanner.className = "phase-banner is-phase-" + ph.key;
      return;
    }
  }
}
function setPhaseIdle(label) {
  currentPhaseIdx = -1;
  phaseBanner.className = "phase-banner";
  phaseNumEl.textContent = "PHASE —";
  phaseTitleEl.textContent = label;
  phaseMetaEl.textContent = "";
}

const evtSource = new EventSource("/ecosystem/stream");
evtSource.onmessage = function (msg) {
  let ev;
  try { ev = JSON.parse(msg.data); } catch (e) { return; }
  switch (ev.kind) {
    case "bootstrap":
      if (Array.isArray(ev.agents)) bootstrapAgents(ev.agents);
      if (ev.state) updateState(ev.state);
      break;
    case "cycle_start":
      if (ev.brief) appendBrief(ev.brief);
      setPhaseIdle("brief spawned · " + (ev.brief ? ev.brief.prompt : ""));
      // Reset the filter match counter so it shows per-cycle match count
      if (typeof resetFilterMatchCount === "function") resetFilterMatchCount();
      break;
    case "cycle_end":
      setPhaseIdle("cycle complete · awaiting next brief");
      // Cinematic finale: a supernova burst from the buyer mesh —
      // an expanding ring + radial particle spray. Signals "this
      // ceremony ended; ecosystem is processing." Reads as a beat.
      triggerSupernova();
      break;
    case "ecosystem_state":
      if (ev.state) updateState(ev.state);
      break;
    case "trace":
      if (ev.trace) appendTrace(ev.trace);
      if (ev.trace && ev.trace.kind) setPhaseFromKind(ev.trace.kind);
      // Stash trace into per-agent log for matrix-rain replay
      if (ev.trace && ev.trace.agent_id) recordAgentFrame(ev.trace.agent_id, ev.trace);
      // Drama: governance deny → full-screen red flash + scatter the
      // active agent's halo for cinematic effect.
      if (ev.trace && ev.trace.kind === "governance_check"
          && ev.trace.detail && ev.trace.detail.outcome === "deny") {
        triggerDenyFlash();
        if (ev.trace.agent_id) flashAgentDramaScatter(ev.trace.agent_id);
      }
      // Money flow: a buying_bid trace carries detail.bid.budget_committed.
      // Spawn gold particles flowing from buyer → that buying agent
      // proportional to the budget committed. Reads as the actual
      // dollar transit through the ecosystem.
      if (ev.trace && ev.trace.kind === "buying_bid"
          && ev.trace.detail && ev.trace.detail.bid
          && ev.trace.agent_id) {
        const budget = ev.trace.detail.bid.budget_committed || 0;
        // Particle count scales with budget. Tone-down pass: capped
        // at 12 (was 28) and threshold raised to $2.5k per particle
        // so small bids only get 1-2 particles instead of 3-5.
        const count = Math.max(1, Math.min(12, Math.round(budget / 2500)));
        spawnMoneyFlow(BUYER_AGENT_ID, ev.trace.agent_id, count);
      }
      break;
    case "message":
      if (ev.message) {
        // Filter logic: hybrid kind-substring + color_hint match.
        // Spawn EVERY beam regardless, but matching ones render at
        // full intensity while non-matching ones render at 0.18
        // opacity. Keeps the cycle visible (so the viewer sees the
        // full ceremony rhythm) while making the filtered phase pop.
        // Was suppressing non-matching beams entirely, which made
        // 80% of every cycle look like nothing was happening.
        const kind = ev.message.kind || "";
        const colorHint = ev.message.color_hint || "";
        const beamMatches = beamFilter === "all"
          || kind.indexOf(beamFilter) !== -1
          || colorHint === beamFilter
          // Special: "measurement" filter also catches realtime_push
          //          (same domain, different kind name)
          || (beamFilter === "measurement" && kind === "realtime_push");
        spawnBeam(
          ev.message.from_agent_id,
          ev.message.to_agent_id,
          ev.message.color_hint,
          beamMatches ? 1.0 : 0.18  // dim multiplier for non-matching
        );
        setPhaseFromKind(ev.message.kind);
        if (ev.message.from_agent_id && ev.message.from_agent_id !== BUYER_AGENT_ID) recordAgentFrame(ev.message.from_agent_id, ev.message);
        if (ev.message.to_agent_id && ev.message.to_agent_id !== BUYER_AGENT_ID) recordAgentFrame(ev.message.to_agent_id, ev.message);
      }
      break;
    case "lift_update":
      if (ev.lift) {
        const m = agentMeshes.get(ev.lift.agent_id);
        if (m) {
          m.lift = ev.lift.score;
          triggerLiftHalo(ev.lift.agent_id, ev.lift.score);
          audioLiftBlip(ev.lift.score);
        }
      }
      break;
    case "live_probe":
      if (Array.isArray(ev.statuses)) updateLiveProbeStatuses(ev.statuses);
      break;
  }
};
evtSource.onerror = function () {
  brandSub.textContent = "stream interrupted — reconnecting…";
};

// ── Per-agent frame log (drives matrix-rain) ─────────────────────────────
//
// Every message + trace whose subject is agent X gets pushed into X's
// circular buffer (max 24 frames). Click handler reads the buffer to
// render the matrix-rain stream. The shape is intentionally close to
// the wire format — looks like real JSON-RPC traffic when displayed.
const FRAME_LOG_MAX = 24;
const agentFrames = new Map();
function recordAgentFrame(agentId, payload) {
  let buf = agentFrames.get(agentId);
  if (!buf) { buf = []; agentFrames.set(agentId, buf); }
  // Synthesize a JSON-RPC-shaped envelope so the matrix-rain reads
  // like real protocol traffic. Includes ts, agent_id, payload kind.
  const frame = {
    ts: new Date().toISOString(),
    agent_id: agentId,
    kind: payload.kind || "?",
    payload: payload.summary || payload.color_hint || payload,
  };
  if (payload.detail) frame.detail = payload.detail;
  buf.push(frame);
  if (buf.length > FRAME_LOG_MAX) buf.shift();
}

// ── Matrix-rain modal ────────────────────────────────────────────────────
const matrixModal = document.getElementById("matrix-modal");
const matrixRain = document.getElementById("matrix-rain");
const matrixTitle = document.getElementById("matrix-modal-title");
const matrixClose = document.getElementById("matrix-modal-close");
let matrixTimer = null;
let matrixAgentId = null;

function openMatrix(agentId) {
  matrixAgentId = agentId;
  const agent = agents.get(agentId);
  matrixTitle.textContent = agent ? (agent.name + " · raw frames") : agentId;
  matrixRain.innerHTML = "";
  matrixModal.classList.add("open");
  refreshMatrix();
  if (matrixTimer) clearInterval(matrixTimer);
  matrixTimer = setInterval(refreshMatrix, 700);
}
function refreshMatrix() {
  if (!matrixAgentId) return;
  const buf = agentFrames.get(matrixAgentId) || [];
  // Keep the existing children (already animated in) — only append
  // new ones. We tag each <pre> with its frame timestamp so we can
  // dedupe.
  const existing = new Set(Array.from(matrixRain.children).map(function (c) { return c.dataset.ts; }));
  for (const f of buf) {
    if (existing.has(f.ts)) continue;
    const pre = document.createElement("pre");
    pre.dataset.ts = f.ts;
    const json = JSON.stringify(f, null, 2);
    pre.textContent = json;
    matrixRain.appendChild(pre);
  }
  // Scroll to keep the latest visible
  matrixRain.scrollTop = matrixRain.scrollHeight;
  // Trim DOM nodes to the buffer size
  while (matrixRain.children.length > FRAME_LOG_MAX) {
    matrixRain.removeChild(matrixRain.firstChild);
  }
}
function closeMatrix() {
  matrixModal.classList.remove("open");
  if (matrixTimer) { clearInterval(matrixTimer); matrixTimer = null; }
  matrixAgentId = null;
}
matrixClose.addEventListener("click", closeMatrix);
matrixModal.addEventListener("click", function (e) { if (e.target === matrixModal) closeMatrix(); });
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && matrixModal.classList.contains("open")) closeMatrix();
});

// ── Click-to-detail ─────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const apName = document.getElementById("ap-name");
const apVendor = document.getElementById("ap-vendor");
const apRole = document.getElementById("ap-role");
const apStage = document.getElementById("ap-stage");
const apSpec = document.getElementById("ap-spec");
const apLift = document.getElementById("ap-lift");
const agentPanel = document.getElementById("agent-panel");
document.getElementById("ap-close").addEventListener("click", function () { agentPanel.classList.remove("open"); });

function showAgent(agent) {
  apName.textContent = agent.name;
  apVendor.textContent = agent.vendor;
  apRole.textContent = agent.role;
  apRole.style.background = "rgba(56, 182, 255, 0.12)";
  apRole.style.color = "var(--c-" + agent.role + ", var(--accent))";
  apStage.textContent = agent.stage === "live" ? "● live · " + (agent.mcp_url || "") : "○ synthetic";
  apStage.className = "agent-panel-stage" + (agent.stage === "live" ? " live" : "");
  apSpec.textContent = (agent.specialties || []).join(" · ") || "—";
  const liftValue = (agentMeshes.get(agent.id) && agentMeshes.get(agent.id).lift) || 0.5;
  apLift.style.width = (liftValue * 100).toFixed(1) + "%";
  agentPanel.classList.add("open");
}

// Click strategy:
//   - Single click on agent → details panel (top-left) + in-scene highlight
//   - Double click on agent → matrix-rain drop-in (full-screen frame stream)
//   - Click outside → close any open panels
let lastClickTime = 0;
let lastClickAgentId = null;
const DOUBLE_CLICK_MS = 320;
let clickedAgentId = null;  // fix-all-gaps: in-scene highlight target

renderer.domElement.addEventListener("click", function (e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const meshes = Array.from(agentMeshes.values()).map(function (m) { return m.mesh; });
  const hits = raycaster.intersectObjects(meshes);
  if (hits.length > 0) {
    const id = hits[0].object.userData.agentId;
    const agent = agents.get(id);
    if (!agent) return;
    const now = performance.now();
    if (lastClickAgentId === id && (now - lastClickTime) < DOUBLE_CLICK_MS) {
      openMatrix(id);
      lastClickTime = 0;
      lastClickAgentId = null;
    } else {
      showAgent(agent);
      // fix-all-gaps: in-scene highlight — agent scales up + panel
      // gets a ring shadow. Restore previously-clicked agent.
      if (clickedAgentId && clickedAgentId !== id) {
        const prev = agentMeshes.get(clickedAgentId);
        if (prev) prev.mesh.scale.set(1, 1, 1);
      }
      clickedAgentId = id;
      const m = agentMeshes.get(id);
      if (m) m.mesh.scale.set(1.6, 1.6, 1.6);
      agentPanel.classList.add("is-clicked-highlight");
      setTimeout(function () { agentPanel.classList.remove("is-clicked-highlight"); }, 800);
      lastClickTime = now;
      lastClickAgentId = id;
    }
  } else {
    agentPanel.classList.remove("open");
    if (clickedAgentId) {
      const prev = agentMeshes.get(clickedAgentId);
      if (prev) prev.mesh.scale.set(1, 1, 1);
      clickedAgentId = null;
    }
  }
});

// ── Cinema mode (programmatic camera flythrough for screen recording) ──
//
// Linear interpolation between waypoints over a timed schedule. Disables
// OrbitControls' auto-rotate while running so the viewer doesn't fight
// the keyframe pose. Pressing the button again exits cinema and hands
// control back to OrbitControls' default auto-rotate.
//
// Total duration: 60s. Optimized for a single-take screen recording.

const cinemaCluster = document.getElementById("cinema-cluster");
let cinemaOn = false;
let cinemaStart = 0;
let cinemaDuration = 60;
let cinemaActiveBtn = null;

// Three keyframe sets — one per preset duration. Each is normalized
// over [0..1] internally so we can scale to any duration; here we
// keep them duration-specific for hand-tuned beats.
const CINEMA_PRESETS = {
  // 15s Twitter clip — fast, four hero beats. Ends back at opener
  // so the loop is seamless.
  15: [
    { t:  0, pos: [ 0,  6, 38], look: [ 0,  0,  0] },
    { t:  4, pos: [18,  6, 28], look: [ 0,  0,  0] },
    { t:  8, pos: [-12, 12, 24], look: [ 0,  0,  0] },
    { t: 12, pos: [ 0,  4, 42], look: [ 0,  0,  0] },
    { t: 15, pos: [ 0,  6, 38], look: [ 0,  0,  0] },
  ],
  // 60s default — current keyframes
  60: [
    { t:  0, pos: [ 0,  6, 38], look: [ 0,  0,  0] },
    { t:  8, pos: [22,  4, 30], look: [ 0,  0,  0] },
    { t: 16, pos: [12, -8, 22], look: [ 0,  0,  0] },
    { t: 24, pos: [-18, 10, 24], look: [ 0,  0,  0] },
    { t: 32, pos: [ 0,  18, 22], look: [ 0, -2,  0] },
    { t: 40, pos: [-22, -2, 28], look: [ 0,  0,  0] },
    { t: 48, pos: [ 6,  4, 44], look: [ 0,  0,  0] },
    { t: 56, pos: [ 0,  6, 38], look: [ 0,  0,  0] },
    { t: 60, pos: [ 0,  6, 38], look: [ 0,  0,  0] },
  ],
  // 180s explainer — slower, more rest at each pose, more nuanced
  // angles. Designed for narration over the top.
  180: [
    { t:   0, pos: [ 0,  6, 38], look: [ 0,  0,  0] },
    { t:  20, pos: [22,  4, 30], look: [ 0,  0,  0] },
    { t:  35, pos: [22,  4, 22], look: [ 0,  0,  0] },
    { t:  55, pos: [12, -8, 22], look: [ 0,  0,  0] },
    { t:  75, pos: [-8,  -10, 22], look: [ 0,  0,  0] },
    { t:  95, pos: [-22,   2, 24], look: [ 0,  0,  0] },
    { t: 115, pos: [-18, 12, 22], look: [ 0,  0,  0] },
    { t: 135, pos: [ 0,  20, 18], look: [ 0, -2,  0] },
    { t: 155, pos: [ 14, 12, 28], look: [ 0,  0,  0] },
    { t: 170, pos: [ 6,  4, 44], look: [ 0,  0,  0] },
    { t: 180, pos: [ 0,  6, 38], look: [ 0,  0,  0] },
  ],
};

let activeKeyframes = CINEMA_PRESETS["60"];

function lerp(a, b, t) { return a + (b - a) * t; }
function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

function cinemaTick() {
  if (!cinemaOn) return;
  const elapsed = (performance.now() - cinemaStart) / 1000;
  if (elapsed >= cinemaDuration) {
    cinemaStart = performance.now();
    return;
  }
  let segA = activeKeyframes[0];
  let segB = activeKeyframes[1];
  for (let i = 0; i < activeKeyframes.length - 1; i++) {
    if (elapsed >= activeKeyframes[i].t && elapsed < activeKeyframes[i + 1].t) {
      segA = activeKeyframes[i];
      segB = activeKeyframes[i + 1];
      break;
    }
  }
  const segT = (elapsed - segA.t) / (segB.t - segA.t);
  const eased = segT * segT * (3 - 2 * segT);
  const pos = lerp3(segA.pos, segB.pos, eased);
  const look = lerp3(segA.look, segB.look, eased);
  camera.position.set(pos[0], pos[1], pos[2]);
  controls.target.set(look[0], look[1], look[2]);
  camera.lookAt(look[0], look[1], look[2]);
}

function startCinema(durationSec) {
  cinemaOn = true;
  cinemaDuration = durationSec;
  activeKeyframes = CINEMA_PRESETS[String(durationSec)] || CINEMA_PRESETS["60"];
  cinemaStart = performance.now();
  controls.autoRotate = false;
  controls.enabled = false;
  cinemaCluster.classList.add("armed");
  // Update button visual states
  Array.from(cinemaCluster.querySelectorAll(".cinema-btn")).forEach(function (b) {
    b.classList.toggle("on", String(b.dataset.cinemaPreset) === String(durationSec));
    if (String(b.dataset.cinemaPreset) === String(durationSec)) {
      b.textContent = "■ stop";
      cinemaActiveBtn = b;
    } else {
      b.textContent = "▶ " + (b.dataset.cinemaPreset === "180" ? "3min" : b.dataset.cinemaPreset + "s");
    }
  });
}
function stopCinema() {
  cinemaOn = false;
  controls.autoRotate = true;
  controls.enabled = true;
  cinemaCluster.classList.remove("armed");
  Array.from(cinemaCluster.querySelectorAll(".cinema-btn")).forEach(function (b) {
    b.classList.remove("on");
    b.textContent = "▶ " + (b.dataset.cinemaPreset === "180" ? "3min" : b.dataset.cinemaPreset + "s");
  });
  cinemaActiveBtn = null;
}
Array.from(cinemaCluster.querySelectorAll(".cinema-btn")).forEach(function (btn) {
  btn.addEventListener("click", function () {
    const preset = parseInt(btn.dataset.cinemaPreset, 10);
    if (cinemaOn && cinemaActiveBtn === btn) {
      stopCinema();
    } else {
      startCinema(preset);
    }
  });
});

// ── Hide-UI mode (clean recordings) ─────────────────────────────────────
const hideUIToggle = document.getElementById("hide-ui-toggle");
hideUIToggle.addEventListener("click", function () {
  document.body.classList.toggle("hide-ui");
  hideUIToggle.classList.toggle("on", document.body.classList.contains("hide-ui"));
  hideUIToggle.textContent = document.body.classList.contains("hide-ui") ? "⌘ show UI" : "⌘ hide UI";
});

// ── Keyboard shortcuts + URL params ─────────────────────────────────────
//
// Power-user controls. Press '?' to flash the hint pill again. URL
// params drive auto-start so you can link to a pre-armed page (e.g.
// /ecosystem?cinema=15&hide=1&audio=1 → ready-to-record).
const kbdHint = document.getElementById("kbd-hint");
function flashKbdHint() {
  kbdHint.classList.remove("fade-out");
  setTimeout(function () { kbdHint.classList.add("fade-out"); }, 8000);
}
flashKbdHint();

document.addEventListener("keydown", function (e) {
  // Ignore when typing in an input / contenteditable
  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return; // skip modifier-key combos

  if (e.key === "1") { e.preventDefault(); cinemaOn ? stopCinema() : startCinema(15); }
  else if (e.key === "2") { e.preventDefault(); cinemaOn ? stopCinema() : startCinema(60); }
  else if (e.key === "3") { e.preventDefault(); cinemaOn ? stopCinema() : startCinema(180); }
  else if (e.key === "u" || e.key === "U") { e.preventDefault(); hideUIToggle.click(); }
  else if (e.key === "a" || e.key === "A") { e.preventDefault(); document.getElementById("audio-toggle").click(); }
  else if (e.key === "?") { e.preventDefault(); flashKbdHint(); }
});

// URL params
(function () {
  const sp = new URLSearchParams(window.location.search);
  const cinemaParam = sp.get("cinema");
  const hideParam = sp.get("hide");
  const audioParam = sp.get("audio");
  if (hideParam === "1") document.body.classList.add("hide-ui");
  // Audio + cinema need the page to settle first (audio context requires
  // a user gesture; we trigger via a delayed click that browsers accept
  // when initiated via a meta refresh-style URL action). Safari may block.
  if (audioParam === "1") setTimeout(function () { document.getElementById("audio-toggle").click(); }, 1200);
  if (cinemaParam === "15" || cinemaParam === "60" || cinemaParam === "180") {
    setTimeout(function () { startCinema(parseInt(cinemaParam, 10)); }, 2200);
  }
})();

// ── Audio (Web Audio API) ────────────────────────────────────────────────
let audioOn = false;
let audioCtx = null;
const audioToggle = document.getElementById("audio-toggle");
audioToggle.addEventListener("click", function () {
  audioOn = !audioOn;
  audioToggle.textContent = audioOn ? "♪ audio on" : "♪ audio off";
  audioToggle.classList.toggle("on", audioOn);
  if (audioOn && !audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    startAmbient();
  }
});

let ambientOsc = null;
function startAmbient() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = 60;
  gain.gain.value = 0.015;
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  ambientOsc = osc;
}

const HINT_FREQS = {
  discovery: 440,
  signal: 660,
  policy: 220,
  product: 528,
  creative: 740,
  bid: 880,
  measurement: 990,
};

function audioBlip(hint) {
  if (!audioOn || !audioCtx) return;
  const f = HINT_FREQS[hint] || 500;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.value = f * (0.95 + Math.random() * 0.1);
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.04, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.20);
}

function audioLiftBlip(lift) {
  if (!audioOn || !audioCtx) return;
  const f = 200 + lift * 600;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = f;
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.5);
}

// ── Animation loop ───────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  if (cinemaOn) {
    cinemaTick();
  } else {
    controls.update();
  }
  // fix-all-gaps: global pause freezes everything that's not the
  // camera. Beams, particles, halos, label projections all freeze.
  // The constellation still renders in its current frame, so user
  // can rotate / zoom and inspect.
  if (globalPaused) {
    composer.render();
    return;
  }

  // Buyer pulse — calmer baseline + smaller jitter
  const t = performance.now() * 0.001;
  buyerMesh.material.emissiveIntensity = 0.30 + 0.08 * Math.sin(t * 1.3);

  // Beam progression
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    b.t += 0.022;
    b.life -= 0.012;
    if (b.life <= 0 || b.t > 1.05) {
      scene.remove(b.line);
      scene.remove(b.pulse);
      b.line.geometry.dispose();
      b.mat.dispose();
      b.pulseMat.dispose();
      if (b.trail) {
        for (const tr of b.trail) {
          scene.remove(tr.mesh);
          tr.mesh.geometry.dispose();
          tr.mat.dispose();
        }
      }
      beams.splice(i, 1);
      continue;
    }
    const p = b.curve.getPointAt(Math.min(b.t, 0.999));
    b.pulse.position.copy(p);
    const intens = b.intens === undefined ? 1.0 : b.intens;
    b.mat.opacity = Math.max(0, b.life * (b.weight ? b.weight.lineOpacity : 0.55));
    b.pulseMat.opacity = Math.max(0, b.life * intens);
    // Push position into history; render trail meshes as receding ghosts
    if (b.trail) {
      b.history.unshift(p.clone());
      if (b.history.length > b.trail.length) b.history.length = b.trail.length;
      for (let j = 0; j < b.trail.length; j++) {
        const histPos = b.history[j];
        if (histPos) {
          b.trail[j].mesh.position.copy(histPos);
          // Each ghost fades faster than the last, scaled by overall
          // life. Cut from 0.7 → 0.45 multiplier — trails were
          // adding measurable bloom contribution at high beam counts.
          b.trail[j].mat.opacity = Math.max(0, b.life * (1 - j / b.trail.length) * 0.45);
        }
      }
    }
  }

  // Money particles + supernova sparks. Two flavors share the same
  // array via the _isSupernovaSpark flag: curve-following money flow
  // vs linear-velocity sparks from the buyer.
  for (let i = moneyParticles.length - 1; i >= 0; i--) {
    const p = moneyParticles[i];
    if (p._isSupernovaSpark) {
      p.life -= 0.018;
      p.sphere.position.add(p.velocity);
      // Slight gravity/drag so sparks arc and slow naturally
      p.velocity.multiplyScalar(0.985);
      p.mat.opacity = Math.max(0, p.life);
      if (p.life <= 0) {
        scene.remove(p.sphere);
        p.sphere.geometry.dispose();
        p.mat.dispose();
        moneyParticles.splice(i, 1);
      }
    } else {
      p.t += p.speed;
      if (p.t >= 0.999) {
        scene.remove(p.sphere);
        p.sphere.geometry.dispose();
        p.mat.dispose();
        moneyParticles.splice(i, 1);
        continue;
      }
      // fix-all-gaps: money flow attractor. Particles travel the curve
      // BUT also drift slightly toward the buyer mesh so the stream
      // reads as "drawn back to the orchestrator" — gives the visual
      // an intent rather than just floating along the path.
      const onCurve = p.curve.getPointAt(p.t);
      const toBuyer = onCurve.clone().multiplyScalar(-0.04); // small pull toward origin
      p.sphere.position.copy(onCurve.clone().add(toBuyer));
      const fadeIn = Math.min(1, p.t / 0.1);
      const fadeOut = Math.min(1, (1 - p.t) / 0.2);
      p.mat.opacity = 0.65 * fadeIn * fadeOut;
    }
  }
  // Supernova rings expand + fade — opacity scaling reduced
  // (0.6 → 0.35 cap) so the expanding ring doesn't dominate.
  for (let i = supernovaRings.length - 1; i >= 0; i--) {
    const sn = supernovaRings[i];
    sn.scale += 0.16;
    sn.life -= 0.022; // faster decay so the ring is gone before next phase
    sn.ring.scale.set(sn.scale, sn.scale, 1);
    sn.ring.lookAt(camera.position);
    sn.mat.opacity = Math.max(0, sn.life * 0.35);
    if (sn.life <= 0) {
      scene.remove(sn.ring);
      sn.ring.geometry.dispose();
      sn.mat.dispose();
      supernovaRings.splice(i, 1);
    }
  }

  // Lift halos + label projection + firing pulse
  // Reusable temp vector so we don't allocate one per agent per frame.
  const __projTmp = new THREE.Vector3();
  const halfW = window.innerWidth / 2;
  const halfH = window.innerHeight / 2;
  const camWorldDir = new THREE.Vector3();
  camera.getWorldDirection(camWorldDir);
  for (const [agentId, m] of agentMeshes) {
    const decay = liftHaloDecay.get(agentId);
    if (decay) {
      m.halo.material.opacity = Math.max(0, Math.min(1, decay.intensity));
      decay.intensity -= decay.decayPerFrame;
      // Outward expansion of the halo ring while it pulses
      if (decay.pulseScale !== undefined) {
        decay.pulseScale += decay.pulseGrowth;
        if (decay.pulseScale > decay.pulseScaleMax) decay.pulseScale = decay.pulseScaleMax;
        m.halo.scale.set(decay.pulseScale, decay.pulseScale, 1);
      }
      // Drama color override (governance deny path)
      if (decay.dramaColor !== undefined) {
        m.halo.material.color.setHex(decay.dramaColor);
      } else {
        const baseColor = ROLE_COLORS[m.agent.role] || 0xffffff;
        m.halo.material.color.setHex(baseColor);
      }
      if (decay.intensity <= 0) {
        liftHaloDecay.delete(agentId);
        m.halo.scale.set(1, 1, 1);
        const baseColor = ROLE_COLORS[m.agent.role] || 0xffffff;
        m.halo.material.color.setHex(baseColor);
      }
    } else {
      // Persistent halo — further clipped (third pass). Max opacity
      // now ~0.10 so even top-performing agents keep their halo as
      // a hint, not a glowing aura. Most agents (lift < 0.6) get
      // zero — keeps the constellation crisp at idle.
      m.halo.material.opacity = Math.max(0, Math.max(0, m.lift - 0.6) * 0.22);
      m.halo.scale.set(1, 1, 1);
    }
    m.halo.lookAt(camera.position);

    // Mesh emissive: base + sine-wave pulse + firing-pulse boost.
    // Tone-down pass: live nodes idle around 0.35 (was 0.55), pulse
    // amplitude halved, firing boost cut from 0.7 to 0.4 so agents
    // can't OVER-bloom regardless of bloom threshold tuning.
    let emiBase = (m.agent.stage === "live" ? 0.35 : 0.20) + 0.08 * Math.sin(t * 2 + m.position.x);
    if (m.firingTimeout > 0) {
      emiBase += 0.40 * (m.firingTimeout / 22);
      m.firingTimeout -= 1;
    }
    m.mesh.material.emissiveIntensity = emiBase;

    // Project the agent's world position to screen coords for its
    // DOM label. Skip when agent is behind the camera (dot product
    // with camera forward direction is negative) — keeps labels from
    // crowding when they'd be unreadable anyway.
    if (m.label) {
      __projTmp.copy(m.position);
      const toAgent = __projTmp.clone().sub(camera.position);
      const facing = toAgent.dot(camWorldDir);
      if (facing > 0) {
        __projTmp.copy(m.position).project(camera);
        const x = __projTmp.x * halfW + halfW;
        const y = -__projTmp.y * halfH + halfH;
        // Offset below the node a bit so it doesn't overlap the mesh
        m.label.style.left = x + "px";
        m.label.style.top = (y + 18) + "px";
        m.label.style.opacity = String(Math.min(1, 0.55 + facing * 0.6));
      } else {
        m.label.style.opacity = "0";
      }
    }
  }

  composer.render();
}
animate();

window.addEventListener("resize", function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
});

// Stash the demo key for any future authed fetches.
window.__DEMO_KEY = ${safeKey};

// ── fix-all-gaps: onboarding walkthrough ────────────────────────────────
// Shown on first visit (localStorage flag). 5 cards.
const ONBOARDING_KEY = "ecosystem-onboarded-v1";
const ONBOARDING_STEPS = [
  {
    title: "Welcome to the AdCP ecosystem",
    body: "What you're watching: <b>30 agents</b> across 8 protocol domains running continuous buying ceremonies. Real Adzymic, Claire, Dstillery, Celtra + schema-conformant synthetics. The system has no script — it self-organizes from measurement feedback.",
  },
  {
    title: "The 6+ phases per cycle",
    body: "<b>Identity</b> resolves cohorts → <b>Signals</b> propose audiences → <b>Governance</b> gates approve → <b>Sales</b> return products → <b>Creative</b> matches formats → <b>Buying</b> commits bids → <b>Measurement</b> reports lift. Lift biases the next brief.",
  },
  {
    title: "Read the rhythm",
    body: "Every beam color = a message kind. Heavy beats (governance, measurement) render thicker. Gold particles flow on bid commits. <b>Supernova ring</b> at every cycle complete.",
  },
  {
    title: "Click for detail",
    body: "<b>Single click</b> any agent → details panel. <b>Double click</b> → matrix-rain feed of its raw frames. <b>Click any trace line</b> on the right → full JSON + reasoning modal.",
  },
  {
    title: "Cinema mode for recording",
    body: "<kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> for 15s/60s/3min cinema flythrough · <kbd>U</kbd> hide UI · <kbd>A</kbd> audio · <kbd>?</kbd> show keys. URL params <code>?cinema=60&hide=1</code> drop you into recording mode directly.",
  },
];
let onboardingIdx = 0;
const onboardingEl = document.getElementById("onboarding");
const obStep = document.getElementById("ob-step");
const obTitle = document.getElementById("ob-title");
const obBody = document.getElementById("ob-body");
const obNext = document.getElementById("ob-next");
const obSkip = document.getElementById("ob-skip");
const obProgress = document.getElementById("ob-progress");
function showOnboardingStep(i) {
  const s = ONBOARDING_STEPS[i];
  if (!s) return finishOnboarding();
  if (obStep) obStep.textContent = "STEP " + (i + 1) + " / " + ONBOARDING_STEPS.length;
  if (obTitle) obTitle.textContent = s.title;
  if (obBody) obBody.innerHTML = s.body;
  if (obNext) obNext.textContent = i === ONBOARDING_STEPS.length - 1 ? "go ✓" : "next →";
  if (obProgress) {
    Array.from(obProgress.children).forEach(function (el, idx) {
      el.classList.toggle("active", idx <= i);
    });
  }
}
function finishOnboarding() {
  if (onboardingEl) onboardingEl.classList.remove("open");
  try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch (e) {}
}
// fix-render-fix: every DOM access guarded so a missing element can
// never break the rest of the script (which would crash agent rendering).
if (obNext) obNext.addEventListener("click", function () {
  onboardingIdx += 1;
  if (onboardingIdx >= ONBOARDING_STEPS.length) finishOnboarding();
  else showOnboardingStep(onboardingIdx);
});
if (obSkip) obSkip.addEventListener("click", finishOnboarding);
// Show on first visit
try {
  if (onboardingEl && !localStorage.getItem(ONBOARDING_KEY)) {
    onboardingEl.classList.add("open");
    showOnboardingStep(0);
  }
} catch (e) { /* localStorage blocked — silently skip onboarding */ }
// Re-trigger via URL ?onboard=1
try {
  if (onboardingEl && new URLSearchParams(window.location.search).get("onboard") === "1") {
    onboardingIdx = 0;
    onboardingEl.classList.add("open");
    showOnboardingStep(0);
  }
} catch (e) { /* defensive: never let URL parsing crash init */ }

// ── fix-all-gaps: global pause ─────────────────────────────────────────
// Stops the EventSource (no new events arrive) AND freezes the
// animation loop's beam/particle/halo updates. Click again resumes
// from the same SSE stream.
// (var globalPaused = false declared at top of script for hoisting safety)
const globalPauseBtn = document.getElementById("global-pause");
if (globalPauseBtn) globalPauseBtn.addEventListener("click", function () {
  globalPaused = !globalPaused;
  globalPauseBtn.classList.toggle("is-paused", globalPaused);
  globalPauseBtn.textContent = globalPaused ? "▶ resume" : "⏸ pause";
  if (globalPaused) {
    if (evtSource && evtSource.readyState !== 2) evtSource.close();
  } else {
    // Reconnect by mutating the EventSource — simplest is to swap in
    // a fresh one. Re-binds onmessage/onerror handlers to the new src.
    reconnectStream();
  }
});

function reconnectStream() {
  // The original const evtSource is captured in closure; this function
  // creates a NEW EventSource and re-installs the handlers. We don't
  // need to dispose the old one — paused click already closed it.
  const fresh = new EventSource("/ecosystem/stream");
  fresh.onmessage = evtSource.onmessage;
  fresh.onerror = evtSource.onerror;
  // Replace the binding so future close() calls hit the new one
  window.__ecoEvtSource = fresh;
}

// ── beam filter ────────────────────────────────────────────────────────
// Click a chip to focus beam spawning on one phase. Non-matching
// beams still spawn but at low intensity (cycle stays visible).
// Trace panel also dims non-matching events + accents matching ones.
// Click "all" to clear.
// (var beamFilter = "all" declared at top of script for hoisting safety)
const filterStatusEl = document.getElementById("filter-status");
const filterStatusNameEl = document.getElementById("filter-status-name");
const filterStatusCountEl = document.getElementById("filter-status-count");
let filterMatchCount = 0;
function bumpFilterMatchCount() {
  filterMatchCount += 1;
  if (filterStatusCountEl) filterStatusCountEl.textContent = String(filterMatchCount);
}
function resetFilterMatchCount() {
  filterMatchCount = 0;
  if (filterStatusCountEl) filterStatusCountEl.textContent = "0";
}
function refreshFilterStatusVisibility() {
  if (!filterStatusEl) return;
  if (beamFilter === "all") {
    filterStatusEl.classList.remove("visible");
  } else {
    filterStatusEl.classList.add("visible");
    if (filterStatusNameEl) filterStatusNameEl.textContent = beamFilter;
  }
}
Array.from(document.querySelectorAll("[data-filter]")).forEach(function (chip) {
  chip.addEventListener("click", function () {
    beamFilter = chip.dataset.filter;
    Array.from(document.querySelectorAll("[data-filter]")).forEach(function (c) {
      c.classList.toggle("active", c.dataset.filter === beamFilter);
    });
    resetFilterMatchCount();
    refreshFilterStatusVisibility();
  });
});

// ── fix-all-gaps: trace panel scroll preservation ─────────────────────
// When user scrolls the trace panel, pause auto-scroll. Resume when
// they scroll back to top.
const tracePanelEl = document.getElementById("trace-panel");
var userScrolledTrace = false; // var for hoisting safety (animation loop may grow to read this)
if (tracePanelEl) {
  tracePanelEl.addEventListener("scroll", function () {
    userScrolledTrace = tracePanelEl.scrollTop > 50;
  });
}
</script>
</body>
</html>`;
}
