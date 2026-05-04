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
    position: fixed; bottom: 18px; right: 18px; z-index: 11;
    width: 320px;
    background: var(--panel); border: 1px solid var(--panel-border); border-radius: 10px;
    padding: 14px 16px;
    backdrop-filter: blur(8px);
    pointer-events: auto;
    display: none;
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
  }
  .audio-toggle:hover { color: var(--accent); border-color: var(--accent); }
  .audio-toggle.on { color: var(--accent); border-color: var(--accent); }

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

  agentMeshes.set(agent.id, { mesh, halo, position: pos, agent, lift: 0.5 });
  agents.set(agent.id, agent);
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
      break;
    case "cycle_end":
      // Add a separator card so the next brief reads as a new ceremony
      break;
    case "ecosystem_state":
      if (ev.state) updateState(ev.state);
      break;
    case "trace":
      if (ev.trace) appendTrace(ev.trace);
      break;
    case "message":
      if (ev.message) spawnBeam(ev.message.from_agent_id, ev.message.to_agent_id, ev.message.color_hint);
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
    if (agent) showAgent(agent);
  } else {
    agentPanel.classList.remove("open");
  }
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
  controls.update();

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

  // Lift halos
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
    // Gentle pulse on agent emissive
    m.mesh.material.emissiveIntensity = (m.agent.stage === "live" ? 0.55 : 0.30) + 0.12 * Math.sin(t * 2 + m.position.x);
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
