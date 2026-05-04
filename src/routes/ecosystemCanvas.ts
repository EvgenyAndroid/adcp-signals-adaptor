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

  /* Phase banner — sits below the topbar, centered. The single most
     important affordance: tells the viewer WHAT IS HAPPENING right now
     ("PHASE 2 of 6 · governance check"). Updates in real time as cycle
     events arrive over SSE. */
  .phase-banner {
    position: fixed; top: 64px; left: 50%;
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
  .legend-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; }

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
    position: fixed; top: 78px; left: 18px; z-index: 11;
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
    color: #2eff6a;
    font: 10.5px ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    line-height: 1.45;
    text-shadow: 0 0 6px rgba(46, 255, 106, 0.55);
    position: relative;
  }
  .matrix-rain pre {
    margin: 0 0 14px;
    white-space: pre-wrap; word-break: break-all;
    opacity: 0.0;
    animation: matrix-fade-in 0.6s ease forwards;
  }
  .matrix-rain pre:nth-child(odd) { color: #2eff6a; }
  .matrix-rain pre:nth-child(even) { color: #5eff8e; }
  @keyframes matrix-fade-in {
    0% { opacity: 0; transform: translateY(-8px); }
    100% { opacity: 0.92; transform: translateY(0); }
  }

  .home-link {
    position: fixed; top: 18px; right: 18px; z-index: 11;
    background: rgba(0,0,0,0.4); color: var(--text-dim);
    padding: 6px 12px; font-size: 11px; text-decoration: none;
    border: 1px solid rgba(56, 182, 255, 0.16); border-radius: 12px;
    pointer-events: auto;
  }
  .home-link:hover { color: var(--accent); border-color: var(--accent); }

  .hero-overlay {
    position: fixed; inset: 0; pointer-events: none; z-index: 5;
    background: radial-gradient(circle at 50% 50%, transparent, rgba(0,0,0,0.45));
  }
</style>
</head>
<body>
<div id="stage"></div>
<div class="hero-overlay"></div>
<div id="label-layer"></div>

<div class="phase-banner" id="phase-banner">
  <span class="phase-dot" aria-hidden="true"></span>
  <span class="phase-num" id="phase-num">PHASE —</span>
  <span id="phase-title">awaiting first brief</span>
  <span class="phase-meta" id="phase-meta"></span>
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
  </div>
</div>

<a href="/" class="home-link">← back to demo</a>

<div class="legend">
  <div class="legend-title">Agent roles</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-signals)"></div>Signals (5)</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-sales)"></div>Sales (10)</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-buying)"></div>Buying (5)</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-creative)"></div>Creative (3)</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-measurement)"></div>Measurement (3)</div>
  <div class="legend-row"><div class="legend-dot" style="background:var(--c-governance)"></div>Governance (3)</div>
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
<button class="audio-toggle" id="cinema-toggle" style="left: 350px;">▶ cinema</button>
<button class="audio-toggle" id="hide-ui-toggle" style="left: 470px;">⌘ hide UI</button>

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

// ── Constants ────────────────────────────────────────────────────────────
const ROLE_COLORS = {
  sales:       0xffb454,
  signals:     0x38b6ff,
  buying:      0xff5e87,
  creative:    0xc98aff,
  measurement: 0x5fd9c4,
  governance:  0xf59e0b,
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
const buyerGeo = new THREE.SphereGeometry(1.4, 32, 32);
const buyerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.4 });
const buyerMesh = new THREE.Mesh(buyerGeo, buyerMat);
scene.add(buyerMesh);
{
  // Buyer halo
  const haloGeo = new THREE.RingGeometry(1.7, 2.1, 64);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.2 });
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
  // De-class the label after a short delay; the mesh emission decays
  // in the animation loop via firingTimeout.
  setTimeout(function () { if (m.label) m.label.classList.remove("firing"); }, 480);
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

function spawnBeam(fromId, toId, colorHint) {
  const from = getPos(fromId);
  const to = getPos(toId);
  if (!from || !to) return;
  // Pulse both endpoints so the viewer can SEE which agents are
  // currently exchanging the message. The buyer (origin) is always
  // an endpoint but doesn't have an agent record — skip it cleanly.
  if (fromId !== BUYER_AGENT_ID) flashAgentFiring(fromId);
  if (toId !== BUYER_AGENT_ID) flashAgentFiring(toId);
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
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);

  // A pulse sprite that travels the curve
  const pulseGeo = new THREE.SphereGeometry(0.18, 12, 12);
  const pulseMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const pulse = new THREE.Mesh(pulseGeo, pulseMat);
  pulse.position.copy(from);
  scene.add(pulse);

  beams.push({ line, mat, pulse, pulseMat, curve, t: 0, life: 1.0, color });

  // Trim if too many
  while (beams.length > MAX_BEAMS) {
    const old = beams.shift();
    if (old) {
      scene.remove(old.line);
      scene.remove(old.pulse);
      old.line.geometry.dispose();
      old.mat.dispose();
      old.pulseMat.dispose();
    }
  }

  audioBlip(colorHint);
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

let currentBriefCard = null;
function appendBrief(brief) {
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

function appendTrace(trace) {
  if (tracePaused) return;
  if (!currentBriefCard) return;
  const line = document.createElement("div");
  line.className = "trace-line";
  const dotColor = (trace.kind && trace.kind.includes("signal")) ? "var(--c-signal)"
    : (trace.kind && trace.kind.includes("governance")) ? "var(--c-policy)"
    : (trace.kind && trace.kind.includes("sales")) ? "var(--c-product)"
    : (trace.kind && trace.kind.includes("buying")) ? "var(--c-bid)"
    : (trace.kind && trace.kind.includes("measurement")) ? "var(--c-measure)"
    : (trace.kind && trace.kind.includes("creative")) ? "var(--c-creative-msg)"
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "\\"" ? "&quot;" : "&#39;";
  });
}

function updateState(state) {
  if (!state) return;
  if (state.cycle_count !== undefined) metaCycle.textContent = state.cycle_count;
  if (state.feedback) {
    metaAudio.textContent = state.feedback.audio_pull.toFixed(2);
    metaCtv.textContent = state.feedback.ctv_pull.toFixed(2);
    metaB2b.textContent = state.feedback.b2b_pull.toFixed(2);
  }
  if (state.lift_by_agent) {
    for (const x of state.lift_by_agent) {
      const m = agentMeshes.get(x.agent_id);
      if (m) m.lift = x.score;
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
      break;
    case "cycle_end":
      setPhaseIdle("cycle complete · awaiting next brief");
      break;
    case "ecosystem_state":
      if (ev.state) updateState(ev.state);
      break;
    case "trace":
      if (ev.trace) appendTrace(ev.trace);
      if (ev.trace && ev.trace.kind) setPhaseFromKind(ev.trace.kind);
      // Stash trace into per-agent log for matrix-rain replay
      if (ev.trace && ev.trace.agent_id) recordAgentFrame(ev.trace.agent_id, ev.trace);
      break;
    case "message":
      if (ev.message) {
        spawnBeam(ev.message.from_agent_id, ev.message.to_agent_id, ev.message.color_hint);
        setPhaseFromKind(ev.message.kind);
        // Both endpoints get the message in their log
        if (ev.message.from_agent_id && ev.message.from_agent_id !== BUYER_AGENT_ID) recordAgentFrame(ev.message.from_agent_id, ev.message);
        if (ev.message.to_agent_id && ev.message.to_agent_id !== BUYER_AGENT_ID) recordAgentFrame(ev.message.to_agent_id, ev.message);
      }
      break;
    case "lift_update":
      if (ev.lift) {
        const m = agentMeshes.get(ev.lift.agent_id);
        if (m) {
          m.lift = ev.lift.score;
          // Pulse the halo
          liftHaloDecay.set(ev.lift.agent_id, { intensity: 0.8, decayPerFrame: 0.012 });
          audioLiftBlip(ev.lift.score);
        }
      }
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
//   - Single click on agent → details panel (top-left)
//   - Double click on agent → matrix-rain drop-in (full-screen frame stream)
//   - Click outside → close any open panels
let lastClickTime = 0;
let lastClickAgentId = null;
const DOUBLE_CLICK_MS = 320;
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
      lastClickTime = now;
      lastClickAgentId = id;
    }
  } else {
    agentPanel.classList.remove("open");
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

const cinemaToggle = document.getElementById("cinema-toggle");
let cinemaOn = false;
let cinemaStart = 0;

const CINEMA_KEYFRAMES = [
  // [t_seconds, camera position (x,y,z), look-at target (x,y,z)]
  { t:  0, pos: [ 0,  6, 38], look: [ 0,  0,  0] },  // Wide opener
  { t:  8, pos: [22,  4, 30], look: [ 0,  0,  0] },  // Pan to signals ring
  { t: 16, pos: [12, -8, 22], look: [ 0,  0,  0] },  // Dive under, looking up at sales ring
  { t: 24, pos: [-18, 10, 24], look: [ 0,  0,  0] },  // Swing left + up
  { t: 32, pos: [ 0,  18, 22], look: [ 0, -2,  0] },  // Top-down looking at buyer + governance ring
  { t: 40, pos: [-22, -2, 28], look: [ 0,  0,  0] },  // Side angle, full constellation
  { t: 48, pos: [ 6,  4, 44], look: [ 0,  0,  0] },  // Pull back wide
  { t: 56, pos: [ 0,  6, 38], look: [ 0,  0,  0] },  // Return to opener
  { t: 60, pos: [ 0,  6, 38], look: [ 0,  0,  0] },  // Hold on opener
];

function lerp(a, b, t) { return a + (b - a) * t; }
function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

function cinemaTick() {
  if (!cinemaOn) return;
  const elapsed = (performance.now() - cinemaStart) / 1000;
  if (elapsed >= 60) {
    // Loop back to start for continuous recordable footage
    cinemaStart = performance.now();
    return;
  }
  // Find the segment we're in
  let segA = CINEMA_KEYFRAMES[0];
  let segB = CINEMA_KEYFRAMES[1];
  for (let i = 0; i < CINEMA_KEYFRAMES.length - 1; i++) {
    if (elapsed >= CINEMA_KEYFRAMES[i].t && elapsed < CINEMA_KEYFRAMES[i + 1].t) {
      segA = CINEMA_KEYFRAMES[i];
      segB = CINEMA_KEYFRAMES[i + 1];
      break;
    }
  }
  const segT = (elapsed - segA.t) / (segB.t - segA.t);
  // Smoothstep for cinematic ease-in/out
  const eased = segT * segT * (3 - 2 * segT);
  const pos = lerp3(segA.pos, segB.pos, eased);
  const look = lerp3(segA.look, segB.look, eased);
  camera.position.set(pos[0], pos[1], pos[2]);
  controls.target.set(look[0], look[1], look[2]);
  // Don't call controls.update() here — it would re-apply auto-rotate.
  // Instead, just set the camera matrix directly.
  camera.lookAt(look[0], look[1], look[2]);
}

cinemaToggle.addEventListener("click", function () {
  cinemaOn = !cinemaOn;
  cinemaToggle.textContent = cinemaOn ? "■ stop" : "▶ cinema";
  cinemaToggle.classList.toggle("on", cinemaOn);
  if (cinemaOn) {
    cinemaStart = performance.now();
    controls.autoRotate = false;
    controls.enabled = false;
  } else {
    controls.autoRotate = true;
    controls.enabled = true;
  }
});

// ── Hide-UI mode (clean recordings) ─────────────────────────────────────
const hideUIToggle = document.getElementById("hide-ui-toggle");
hideUIToggle.addEventListener("click", function () {
  document.body.classList.toggle("hide-ui");
  hideUIToggle.classList.toggle("on", document.body.classList.contains("hide-ui"));
  hideUIToggle.textContent = document.body.classList.contains("hide-ui") ? "⌘ show UI" : "⌘ hide UI";
});

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

  // Buyer pulse
  const t = performance.now() * 0.001;
  buyerMesh.material.emissiveIntensity = 0.5 + 0.18 * Math.sin(t * 1.3);

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
      beams.splice(i, 1);
      continue;
    }
    const p = b.curve.getPointAt(Math.min(b.t, 0.999));
    b.pulse.position.copy(p);
    b.mat.opacity = Math.max(0, b.life * 0.55);
    b.pulseMat.opacity = Math.max(0, b.life);
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
      m.halo.material.opacity = decay.intensity;
      decay.intensity -= decay.decayPerFrame;
      if (decay.intensity <= 0) liftHaloDecay.delete(agentId);
    } else {
      // Persistent low-intensity halo proportional to long-term lift
      m.halo.material.opacity = 0.05 + (m.lift - 0.4) * 0.4;
      if (m.halo.material.opacity < 0) m.halo.material.opacity = 0;
    }
    m.halo.lookAt(camera.position);

    // Mesh emissive: base + sine-wave pulse + firing-pulse boost
    let emiBase = (m.agent.stage === "live" ? 0.55 : 0.30) + 0.12 * Math.sin(t * 2 + m.position.x);
    if (m.firingTimeout > 0) {
      // Strong glow that decays over ~22 frames (~0.36s @ 60fps)
      emiBase += 0.7 * (m.firingTimeout / 22);
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

  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Stash the demo key for any future authed fetches.
window.__DEMO_KEY = ${safeKey};
</script>
</body>
</html>`;
}
