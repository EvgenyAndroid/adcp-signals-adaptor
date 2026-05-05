// src/routes/demo.ts
// Sec-31: DSP-style interactive demo UI served at `/`.
//
// Architecture (Sec-31r post-refactor):
//   This file is the slim route shell. It owns the response/headers/CSP
//   and the HTML structure (renderHtml). The two heavy assets — CSS and
//   the inlined browser script — live in separate modules:
//
//     src/demo/styles.ts   — `<style>...</style>` template (~5,900 lines)
//     src/demo/script.ts   — `<script>...</script>` template (~11,700 lines)
//     src/demo/config.ts   — shared constants (auth password hash, etc.)
//
//   Both are imported and inlined back into the HTML at render time. Net
//   bytes are unchanged from the pre-refactor monolith — this is purely a
//   readability split. A byte-equivalence test exists at
//   tests/demo-render.test.ts to lock that contract.
//
// Shell: sidebar nav + top bar + workspace with tab-based sections
// (Discover / Catalog / Concepts). Catalog uses a sortable data table
// with vertical + category filters. Every signal click opens a slide-in
// detail panel with activation flow.
//
// Design references: Viant DSP, DV360, Linear dashboard. Dark theme,
// dense-but-breathing layout, inline SVG icons, fake sparklines on
// KPI cards for visual depth. Vanilla HTML/CSS/JS — no build step,
// no CDN, no framework.
//
// Auth uses DEMO_API_KEY for backend calls (public by design). The UI
// itself is gated by a hardcoded viewer password (see src/demo/config.ts)
// — security-through-obscurity to keep randos off the demo URL, while
// the workshop audience can be told the password verbally.

import { SPEC_LABEL } from "../constants/specVersion";
import { BRAND_LOGO_DATA_URI } from "../constants/brandLogo";
import { STYLES } from "../demo/styles";
import { SCRIPT_TAG } from "../demo/script";

export function handleDemo(env: { DEMO_API_KEY: string }): Response {
  return new Response(renderHtml(env.DEMO_API_KEY), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      // Sec-32: script-src opens to esm.sh for d3-hierarchy (treemap
      // squarify math). connect-src stays self because all /mcp and
      // /signals/* calls are same-origin.
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "script-src 'self' 'unsafe-inline' https://esm.sh https://cdn.jsdelivr.net; " +
        "img-src 'self' data:; connect-src 'self' https://esm.sh;",
    },
  });
}

function renderHtml(demoKey: string): string {
  const safeKey = JSON.stringify(demoKey);
  return `<!doctype html>
<html lang="en" class="is-locked">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Evgeny's Marketplace Agent</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='2' fill='%234f8eff'/%3E%3Ccircle cx='8' cy='8' r='5' fill='none' stroke='%234f8eff' stroke-width='0.8' opacity='0.6'/%3E%3Ccircle cx='8' cy='8' r='7.5' fill='none' stroke='%234f8eff' stroke-width='0.5' opacity='0.3'/%3E%3C/svg%3E"/>
<script>
  // Run before body parses so authenticated users never see a flash of
  // the auth overlay. sessionStorage is cleared when the tab closes —
  // intentional, so a shared workshop browser doesn't stay unlocked.
  (function(){
    try {
      if (sessionStorage.getItem("demo-authed") === "1") {
        document.documentElement.classList.remove("is-locked");
      }
    } catch (e) {}
  })();
</script>
${STYLES}
</head>
<body>

<!-- ── Auth overlay ─────────────────────────────────────────────────────
     Visible only while <html class="is-locked">. Inline <head> script
     removes the class on first paint if sessionStorage shows authed,
     so authenticated users never see this overlay.

     Password validation is SHA-256 hash compare client-side. This is UI
     gating to filter URL scrapers, not real security — backend routes
     all gate on DEMO_API_KEY independently. -->
<div class="auth-overlay" id="auth-overlay">
  <form class="auth-card" id="auth-form" autocomplete="off">
    <div class="auth-logo">
      <img src="${BRAND_LOGO_DATA_URI}" alt="signal-stack"/>
    </div>
    <div class="auth-title">Evgeny's Marketplace Agent</div>
    <div class="auth-sub">AdCP signals provider · workshop preview</div>
    <input type="password" id="auth-password" class="auth-input" placeholder="Password" autofocus required spellcheck="false"/>
    <button type="submit" class="auth-submit">Unlock</button>
    <div class="auth-error" id="auth-error" aria-live="polite"></div>
    <div class="auth-hint">Workshop attendees: ask Evgeny for the password.</div>
  </form>
</div>

<!-- Inline SVG sprite — referenced via <use href="#icon-X"/> throughout -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <symbol id="icon-radar" viewBox="0 0 20 20"><circle cx="10" cy="10" r="2" fill="currentColor"/><circle cx="10" cy="10" r="5" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.6"/><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"/><line x1="10" y1="10" x2="16" y2="4" stroke="currentColor" stroke-width="1.3"/></symbol>
    <symbol id="icon-grid" viewBox="0 0 20 20"><rect x="2" y="2" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="2" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="11" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="11" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
    <symbol id="icon-network" viewBox="0 0 20 20"><circle cx="10" cy="4" r="2" fill="currentColor"/><circle cx="4" cy="15" r="2" fill="currentColor"/><circle cx="16" cy="15" r="2" fill="currentColor"/><line x1="10" y1="6" x2="5" y2="13.5" stroke="currentColor" stroke-width="1.3"/><line x1="10" y1="6" x2="15" y2="13.5" stroke="currentColor" stroke-width="1.3"/><line x1="6" y1="15" x2="14" y2="15" stroke="currentColor" stroke-width="1.3"/></symbol>
    <symbol id="icon-close" viewBox="0 0 20 20"><path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></symbol>
    <symbol id="icon-arrow-right" viewBox="0 0 20 20"><path d="M5 10 L15 10 M11 6 L15 10 L11 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-search" viewBox="0 0 20 20"><circle cx="9" cy="9" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="13" y1="13" x2="17" y2="17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></symbol>
    <symbol id="icon-filter" viewBox="0 0 20 20"><path d="M3 5 L17 5 L12 11 L12 17 L8 15 L8 11 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></symbol>
    <symbol id="icon-check" viewBox="0 0 20 20"><path d="M4 10 L8 14 L16 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-book" viewBox="0 0 20 20"><path d="M4 4 L4 16 L16 16 L16 4 L10 4 L10 16 M4 4 L10 4 M10 4 L16 4 M10 8 L14 8 M10 11 L14 11" fill="none" stroke="currentColor" stroke-width="1.4"/></symbol>
    <symbol id="icon-info" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="10" y1="9" x2="10" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="6.5" r="0.8" fill="currentColor"/></symbol>
    <symbol id="icon-bolt" viewBox="0 0 20 20"><path d="M11 2 L4 11 L9 11 L9 18 L16 9 L11 9 Z" fill="currentColor"/></symbol>
    <symbol id="icon-sort" viewBox="0 0 20 20"><path d="M6 4 L6 16 M3 13 L6 16 L9 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 4 L14 16 M17 7 L14 4 L11 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/></symbol>
    <symbol id="icon-chart" viewBox="0 0 20 20"><path d="M3 16 L3 4 M3 16 L17 16" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 13 L9 9 L12 11 L16 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-treemap" viewBox="0 0 20 20"><rect x="2" y="2" width="11" height="8" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="13" y="2" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="13" y="7" width="5" height="3" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="2" y="10" width="6" height="8" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="8" y="10" width="10" height="8" fill="none" stroke="currentColor" stroke-width="1.4"/></symbol>
    <symbol id="icon-builder" viewBox="0 0 20 20"><circle cx="5" cy="5" r="1.8" fill="currentColor"/><circle cx="5" cy="10" r="1.8" fill="currentColor"/><circle cx="5" cy="15" r="1.8" fill="currentColor"/><line x1="9" y1="5" x2="17" y2="5" stroke="currentColor" stroke-width="1.4"/><line x1="9" y1="10" x2="17" y2="10" stroke="currentColor" stroke-width="1.4"/><line x1="9" y1="15" x2="15" y2="15" stroke="currentColor" stroke-width="1.4"/></symbol>
    <symbol id="icon-activations" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 5 L10 10 L13 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></symbol>
    <symbol id="icon-plus" viewBox="0 0 20 20"><line x1="10" y1="4" x2="10" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="icon-minus" viewBox="0 0 20 20"><line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="icon-chevron-down" viewBox="0 0 20 20"><path d="M5 8 L10 13 L15 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="icon-logout" viewBox="0 0 20 20"><path d="M9 4 L4 4 L4 16 L9 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7 L16 10 L12 13 M16 10 L8 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  </defs>
</svg>

<div class="app">

  <!-- ── Sidebar ─────────────────────────────────────────────────────────── -->
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-mark"><img src="${BRAND_LOGO_DATA_URI}" alt="signal-stack"/></div>
      <div class="brand-text">
        <div class="brand-title">Evgeny's <span class="brand-title-mp">Marketplace&nbsp;Agent</span></div>
        <div class="brand-sub">AdCP signals provider</div>
      </div>
    </div>

    <nav class="sidebar-nav">

      <!-- Collapse-all / expand-all toggle. State semantics: if any group
           is currently expanded, click → collapse all (except the
           active-group force-expand). If all groups are collapsed, click
           → expand all. The button mirrors that state in its label/icon
           so users know what the next click will do. -->
      <button class="nav-collapse-all" type="button" data-nav-collapse-all
              title="Collapse / expand all groups"
              aria-label="Toggle all sidebar groups">
        <svg class="ico" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6.5l4 3 4-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="nav-collapse-all-label">Collapse all</span>
      </button>

      <!-- Group: Signals (sell-side discovery + browsing) -->
      <div class="nav-group" data-group-id="signals">
        <button class="nav-group-header" type="button" data-group-toggle>
          <svg class="ico ico-group"><use href="#icon-radar"/></svg>
          <span class="nav-group-title">Signals</span>
          <svg class="nav-group-chevron"><use href="#icon-chevron-down"/></svg>
        </button>
        <div class="nav-group-items">
          <button class="nav-item active" data-tab="discover">
            <svg class="ico"><use href="#icon-radar"/></svg><span>Discover</span>
          </button>
          <button class="nav-item" data-tab="catalog">
            <svg class="ico"><use href="#icon-grid"/></svg><span>Catalog</span>
            <span class="nav-count" id="nav-catalog-count">—</span>
          </button>
          <button class="nav-item" data-tab="concepts">
            <svg class="ico"><use href="#icon-network"/></svg><span>Concepts</span>
          </button>
        </div>
      </div>

      <!-- Group: Analytics (data exploration over the catalog) -->
      <div class="nav-group" data-group-id="analytics">
        <button class="nav-group-header" type="button" data-group-toggle>
          <svg class="ico ico-group"><use href="#icon-chart"/></svg>
          <span class="nav-group-title">Analytics</span>
          <svg class="nav-group-chevron"><use href="#icon-chevron-down"/></svg>
        </button>
        <div class="nav-group-items">
          <button class="nav-item" data-tab="treemap">
            <svg class="ico"><use href="#icon-treemap"/></svg><span>Treemap</span>
          </button>
          <button class="nav-item" data-tab="overlap">
            <svg class="ico"><use href="#icon-network"/></svg><span>Overlap</span>
          </button>
          <button class="nav-item" data-tab="embedding">
            <svg class="ico"><use href="#icon-chart"/></svg><span>Embedding</span>
          </button>
          <button class="nav-item" data-tab="lab">
            <svg class="ico"><use href="#icon-bolt"/></svg><span>Emb. Lab</span>
            <span class="nav-tag">new</span>
          </button>
          <button class="nav-item" data-tab="seasonality">
            <svg class="ico"><use href="#icon-info"/></svg><span>Seasonality</span>
            <span class="nav-tag">new</span>
          </button>
          <button class="nav-item" data-tab="freshness">
            <svg class="ico"><use href="#icon-info"/></svg><span>Freshness</span>
            <span class="nav-tag">new</span>
          </button>
        </div>
      </div>

      <!-- Group: Audience Composition (build + plan audiences) -->
      <div class="nav-group" data-group-id="composition">
        <button class="nav-group-header" type="button" data-group-toggle>
          <svg class="ico ico-group"><use href="#icon-builder"/></svg>
          <span class="nav-group-title">Audience Composition</span>
          <svg class="nav-group-chevron"><use href="#icon-chevron-down"/></svg>
        </button>
        <div class="nav-group-items">
          <button class="nav-item" data-tab="builder">
            <svg class="ico"><use href="#icon-builder"/></svg><span>Builder</span>
          </button>
          <button class="nav-item" data-tab="composer">
            <svg class="ico"><use href="#icon-builder"/></svg><span>Composer</span>
          </button>
          <button class="nav-item" data-tab="expression">
            <svg class="ico"><use href="#icon-network"/></svg><span>Expression</span>
            <span class="nav-tag">new</span>
          </button>
          <button class="nav-item" data-tab="journey">
            <svg class="ico"><use href="#icon-activations"/></svg><span>Journey</span>
            <span class="nav-tag">new</span>
          </button>
          <button class="nav-item" data-tab="portfolio">
            <svg class="ico"><use href="#icon-chart"/></svg><span>Portfolio</span>
            <span class="nav-tag">new</span>
          </button>
          <button class="nav-item" data-tab="planner">
            <svg class="ico"><use href="#icon-chart"/></svg><span>Scenario</span>
            <span class="nav-tag">new</span>
          </button>
          <button class="nav-item" data-tab="snapshots">
            <svg class="ico"><use href="#icon-book"/></svg><span>Snapshots</span>
            <span class="nav-tag">new</span>
          </button>
        </div>
      </div>

      <!-- Group: Workshop Canvases (the three primary demo surfaces) -->
      <div class="nav-group" data-group-id="canvases">
        <button class="nav-group-header" type="button" data-group-toggle>
          <svg class="ico ico-group"><use href="#icon-bolt"/></svg>
          <span class="nav-group-title">Workshop Canvases</span>
          <svg class="nav-group-chevron"><use href="#icon-chevron-down"/></svg>
        </button>
        <div class="nav-group-items">
          <button class="nav-item" data-tab="canvas">
            <svg class="ico"><use href="#icon-bolt"/></svg><span>Brand Canvas</span>
          </button>
          <button class="nav-item" data-tab="campaign">
            <svg class="ico"><use href="#icon-network"/></svg><span>Campaign Canvas</span>
            <span class="nav-tag">DSP</span>
          </button>
          <button class="nav-item" data-tab="agentic">
            <svg class="ico"><use href="#icon-bolt"/></svg><span>Agentic Canvas</span>
            <span class="nav-tag">AI</span>
          </button>
        </div>
      </div>

      <!-- Group: Multi-Agent (federation + orchestration + race + health) -->
      <div class="nav-group" data-group-id="multi-agent">
        <button class="nav-group-header" type="button" data-group-toggle>
          <svg class="ico ico-group"><use href="#icon-network"/></svg>
          <span class="nav-group-title">Multi-Agent</span>
          <svg class="nav-group-chevron"><use href="#icon-chevron-down"/></svg>
        </button>
        <div class="nav-group-items">
          <button class="nav-item" data-tab="federation">
            <svg class="ico"><use href="#icon-network"/></svg><span>Federation</span>
            <span class="nav-tag nav-tag-muted">a2a</span>
          </button>
          <button class="nav-item" data-tab="orchestrator">
            <svg class="ico"><use href="#icon-network"/></svg><span>Orchestrator</span>
            <span class="nav-tag">new</span>
          </button>
          <a class="nav-item" href="/race-canvas">
            <svg class="ico"><use href="#icon-network"/></svg><span>Race Canvas</span>
            <span class="nav-tag">new</span>
          </a>
          <a class="nav-item" href="/vendor-health">
            <svg class="ico"><use href="#icon-radar"/></svg><span>Vendor Health</span>
            <span class="nav-tag">new</span>
          </a>
          <a class="nav-item" href="/ecosystem" target="_blank" rel="noopener">
            <svg class="ico"><use href="#icon-bolt"/></svg><span>Ecosystem</span>
            <span class="nav-tag">live</span>
          </a>
        </div>
      </div>

      <!-- Group: Activations -->
      <div class="nav-group" data-group-id="activations">
        <button class="nav-group-header" type="button" data-group-toggle>
          <svg class="ico ico-group"><use href="#icon-activations"/></svg>
          <span class="nav-group-title">Activations</span>
          <svg class="nav-group-chevron"><use href="#icon-chevron-down"/></svg>
        </button>
        <div class="nav-group-items">
          <button class="nav-item" data-tab="activations">
            <svg class="ico"><use href="#icon-activations"/></svg><span>Activations</span>
            <span class="nav-count" id="nav-activations-count">—</span>
          </button>
          <button class="nav-item" data-tab="destinations">
            <svg class="ico"><use href="#icon-arrow-right"/></svg><span>Destinations</span>
            <span class="nav-count" id="nav-destinations-count">—</span>
          </button>
        </div>
      </div>

      <!-- Group: Reference (docs + spec + tool log) -->
      <div class="nav-group" data-group-id="reference">
        <button class="nav-group-header" type="button" data-group-toggle>
          <svg class="ico ico-group"><use href="#icon-book"/></svg>
          <span class="nav-group-title">Reference</span>
          <svg class="nav-group-chevron"><use href="#icon-chevron-down"/></svg>
        </button>
        <div class="nav-group-items">
          <button class="nav-item" data-tab="capabilities">
            <svg class="ico"><use href="#icon-info"/></svg><span>Capabilities</span>
          </button>
          <button class="nav-item" data-tab="devkit">
            <svg class="ico"><use href="#icon-book"/></svg><span>Dev kit</span>
          </button>
          <button class="nav-item" data-tab="toollog">
            <svg class="ico"><use href="#icon-activations"/></svg><span>Tool Log</span>
            <span class="nav-count" id="nav-toollog-count">—</span>
          </button>
          <a class="nav-item" href="https://github.com/EvgenyAndroid/adcp-signals-adaptor" target="_blank" rel="noopener">
            <svg class="ico"><use href="#icon-book"/></svg><span>GitHub</span>
          </a>
          <a class="nav-item" href="https://adcontextprotocol.org" target="_blank" rel="noopener">
            <svg class="ico"><use href="#icon-bolt"/></svg><span>AdCP spec</span>
          </a>
        </div>
      </div>

    </nav>

    <div class="sidebar-footer">
      <div class="kv"><span class="k">Version</span><span class="v mono">${SPEC_LABEL}</span></div>
      <div class="kv"><span class="k">Client</span><span class="v mono">@adcp/5.25.1</span></div>
      <div class="kv"><span class="k">Status</span><span class="v"><span class="status-dot ok"></span>live</span></div>
      <div class="kv"><span class="k">Conformance</span><span class="v"><span class="pill pill-success">7 / 7</span></span></div>
      <div class="theme-picker" role="group" aria-label="Theme">
        <span class="theme-picker-label">Theme</span>
        <button class="theme-swatch" data-theme-pick="midnight" title="Midnight (dark)" aria-label="Midnight theme"></button>
        <button class="theme-swatch" data-theme-pick="daylight" title="Daylight (light)" aria-label="Daylight theme"></button>
        <button class="theme-swatch" data-theme-pick="solar" title="Solar (warm)" aria-label="Solar theme"></button>
        <button class="theme-swatch" data-theme-pick="paper" title="Paper (high-contrast white)" aria-label="Paper theme"></button>
        <button class="theme-swatch" data-theme-pick="forest" title="Forest (deep green)" aria-label="Forest theme"></button>
      </div>
      <!-- Sign out: manual logout button + paired with 5-min idle auto-logout
           wired in src/demo/script/fragments/auth.ts. Both clear the
           sessionStorage 'demo-authed' flag and re-show the auth overlay. -->
      <button class="logout-btn" id="logout-btn" type="button" title="Sign out (also auto after 5 min idle)" aria-label="Sign out">
        <svg class="ico" aria-hidden="true"><use href="#icon-logout"/></svg>
        <span>Sign out</span>
      </button>
    </div>
  </aside>

  <!-- ── Main ────────────────────────────────────────────────────────────── -->
  <main class="main">

    <header class="topbar">
      <button class="topbar-sidebar-toggle" data-sidebar-toggle aria-label="Toggle sidebar" title="Toggle sidebar (Ctrl/Cmd+B)">
        <svg class="ico" viewBox="0 0 20 20"><line x1="3" y1="6" x2="17" y2="6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="3" y1="14" x2="17" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <div class="crumbs">
        <span class="crumb muted">Evgeny's Marketplace</span>
        <span class="crumb-sep">/</span>
        <span class="crumb" id="crumb-current">Discover</span>
      </div>
      <div class="topbar-meta">
        <span class="pill pill-muted mono">Sandbox</span>
        <span class="pill pill-muted mono" id="topbar-version">...</span>
        <button class="kbd-hint" id="kbd-hint-btn" title="Keyboard shortcuts (press ?)">?</button>
      </div>
    </header>

    <div class="workspace">

      <!-- ── TAB: Discover ──────────────────────────────────────────────── -->
      <section class="tab-pane active" data-tab="discover">
        <div class="pane-header">
          <div>
            <div class="pane-title-with-info">
              <h1 class="pane-title">Brief-driven discovery</h1>
              <button class="lane-info-btn" data-lane-info-toggle="page-discover" title="How this works" aria-label="How brief-driven discovery works"><svg class="ico"><use href="#icon-info"/></svg></button>
              <div class="lane-info-popover" data-lane-info-panel="page-discover" role="dialog">
                <div class="lane-info-title">How brief-driven discovery works</div>
                <ol class="lane-info-steps">
                  <li><strong>Vectorize.</strong> Brief or NL query is embedded via <code>openai-te3-small-d512</code> (512-dim). Same embedding model used for the catalog seed.</li>
                  <li><strong>kNN retrieve.</strong> Top-K signals fetched by cosine similarity in 512-d space; threshold ≥ 0.45.</li>
                  <li><strong>Score + rank.</strong> Each match returns coverage_percentage, freshness, and the cosine score. AI-generated proposals appear alongside catalog matches when no clean mapping exists.</li>
                </ol>
                <div class="lane-info-trace">Code: <code>handleNLQuery</code> → <code>searchSignalsService</code> → <code>cosineSimilarity</code></div>
              </div>
            </div>
            <p class="pane-subtitle">
              <strong id="discover-mode-subtitle">Brief mode</strong> —
              <span id="discover-mode-desc">semantic similarity via the UCP embedding engine. Returns catalog matches + AI-generated custom proposals alongside each other.</span>
            </p>
          </div>
          <div class="mode-toggle" id="discover-mode-toggle">
            <button class="mode-btn active" data-mode="brief"
              data-tooltip="Describe WHAT you're looking for. The embedding engine ranks catalog signals by semantic similarity to your phrase, and an LLM also generates custom proposals inline when no catalog match fits. Best for creative exploration: 'luxury auto intenders', 'affluent millennial streamers', 'families preparing for back-to-school'.">
              <svg class="ico"><use href="#icon-radar"/></svg>
              <span>Brief</span>
              <span class="mode-tool mono">get_signals</span>
            </button>
            <button class="mode-btn" data-mode="nl"
              data-tooltip="Describe WHO you want as a structured audience. The query is parsed into a boolean AST (AND/OR/NOT), each dimension is resolved against the catalog with exact-rule + embedding + lexical matching, and the result is a composite audience size with per-signal match methods. Best for precise audience definitions: 'soccer moms 35+ who stream heavily', 'urban professionals without children who watch sci-fi'.">
              <svg class="ico"><use href="#icon-network"/></svg>
              <span>NL Query</span>
              <span class="mode-tool mono">query_signals_nl</span>
            </button>
          </div>
        </div>

        <div class="discover-hero">
          <div class="brief-input-shell">
            <textarea id="brief" rows="3" placeholder="e.g. affluent families 35-44 in top-10 DMAs interested in luxury travel"></textarea>
            <div class="brief-actions">
              <div class="brief-hints" id="brief-hints">
                <span class="hint-label">Try</span>
                <button class="hint" data-brief="luxury automotive intenders 45+ in top DMAs">luxury auto intenders</button>
                <button class="hint" data-brief="new parents in the last 12 months">new parents 0-12mo</button>
                <button class="hint" data-brief="cord-cutters 25-44 with high streaming affinity">cord-cutters 25-44</button>
                <button class="hint" data-brief="B2B IT decision makers at mid-market companies">IT decision makers</button>
                <button class="hint" data-brief="health conscious affluent millennials in urban metros">health-conscious urban</button>
              </div>
              <button class="btn-primary" id="discover-btn">
                <svg class="ico"><use href="#icon-radar"/></svg>
                <span id="discover-btn-label">Find signals</span>
              </button>
            </div>
          </div>
          <div class="discover-meta" id="discover-status"></div>
        </div>

        <div class="discover-results" id="discover-results">
          <div class="empty-state">
            <svg class="empty-icon"><use href="#icon-radar"/></svg>
            <div class="empty-title">Run a brief to see matches</div>
            <div class="empty-desc">Catalog signals rank by semantic match. AI-generated custom proposals appear beside them for briefs that don't cleanly map to existing segments.</div>
          </div>
        </div>
      </section>

      <!-- ── TAB: Catalog ───────────────────────────────────────────────── -->
      <section class="tab-pane" data-tab="catalog">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Signals catalog</h1>
            <p class="pane-subtitle">
              <span class="mono" id="catalog-subtitle-counts">— signals</span>
              <span style="color:var(--text-mut)"> · </span>
              Automotive · Financial · Health &amp; Wellness · B2B Firmographic · Life Events · Behavioral · Transactional · Media &amp; Device · Retail &amp; CPG · Seasonal · Psychographic · Interest · Demographic · Geographic · Composite.
              <span style="color:var(--text-mut)">Filter by <strong>vertical</strong> (data-provider grouping) and <strong>category type</strong> (AdCP 5-enum) — two independent axes.</span>
            </p>
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi">
            <div class="kpi-label">Total signals</div>
            <div class="kpi-value" id="kpi-total">—</div>
            <div class="kpi-spark" id="spark-total"></div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Verticals covered</div>
            <div class="kpi-value" id="kpi-verticals">15</div>
            <div class="kpi-spark"><svg viewBox="0 0 80 24"><path d="M2 20 L12 15 L22 18 L32 10 L42 13 L52 6 L62 9 L72 4 L78 5" fill="none" stroke="var(--accent)" stroke-width="1.4"/></svg></div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Avg CPM</div>
            <div class="kpi-value" id="kpi-cpm">—</div>
            <div class="kpi-spark"><svg viewBox="0 0 80 24"><path d="M2 12 L12 14 L22 11 L32 13 L42 10 L52 12 L62 9 L72 11 L78 8" fill="none" stroke="var(--success)" stroke-width="1.4"/></svg></div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Activation destinations</div>
            <div class="kpi-value" id="kpi-destinations">4</div>
            <div class="kpi-spark"><svg viewBox="0 0 80 24"><path d="M2 20 L2 20 L20 14 L40 14 L60 8 L78 8" fill="none" stroke="var(--warning)" stroke-width="1.4"/></svg></div>
          </div>
        </div>

        <div class="table-controls">
          <div class="filter-chips" id="vertical-chips">
            <button class="chip active" data-vertical="">All</button>
            <!-- populated from capabilities/catalog -->
          </div>
          <div class="table-search">
            <svg class="ico"><use href="#icon-search"/></svg>
            <input id="catalog-search" placeholder="Search by name, description..." />
          </div>
        </div>

        <div class="secondary-filters">
          <div class="filter-group">
            <span class="filter-label">Category type</span>
            <div class="filter-chips small" id="cat-chips">
              <button class="chip active" data-cat="">All</button>
              <button class="chip" data-cat="demographic">Demographic</button>
              <button class="chip" data-cat="interest">Interest</button>
              <button class="chip" data-cat="purchase_intent">Purchase intent</button>
              <button class="chip" data-cat="geo">Geo</button>
              <button class="chip" data-cat="composite">Composite</button>
            </div>
          </div>
        </div>

        <div class="table-shell">
          <table class="data-table" id="catalog-table">
            <thead>
              <tr>
                <th data-sort="name" class="sortable">Signal <svg class="ico-sm"><use href="#icon-sort"/></svg></th>
                <th data-sort="vertical" class="sortable">Vertical <svg class="ico-sm"><use href="#icon-sort"/></svg></th>
                <th data-sort="category">Category</th>
                <th data-sort="audience" class="sortable numeric">Audience <svg class="ico-sm"><use href="#icon-sort"/></svg></th>
                <th data-sort="cpm" class="sortable numeric">CPM <svg class="ico-sm"><use href="#icon-sort"/></svg></th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="catalog-tbody">
              <tr><td colspan="7" class="table-empty"><span class="spinner"></span> loading catalog…</td></tr>
            </tbody>
          </table>
        </div>

        <div class="table-footer" id="catalog-footer"></div>
      </section>

      <!-- ── TAB: Concepts ──────────────────────────────────────────────── -->
      <section class="tab-pane" data-tab="concepts">
        <div class="pane-header">
          <div>
            <div class="pane-title-with-info">
              <h1 class="pane-title">UCP concept registry</h1>
              <button class="lane-info-btn" data-lane-info-toggle="page-concepts" title="How this works" aria-label="How UCP concept registry works"><svg class="ico"><use href="#icon-info"/></svg></button>
              <div class="lane-info-popover" data-lane-info-panel="page-concepts" role="dialog">
                <div class="lane-info-title">How the concept registry works</div>
                <ol class="lane-info-steps">
                  <li><strong>19 canonical concepts.</strong> Age, intent verticals, life-events, behaviors — each with a fixed 512-d embedding + accepted enums + transformer hints.</li>
                  <li><strong>Cosine search.</strong> A search query embeds in the same space; top-K concepts ranked by cosine similarity to the query vector. Score ≥ 0.45 surfaces.</li>
                  <li><strong>Composition.</strong> Concepts compose conjunctively — a buyer brief that names "luxury travelers" + "high HHI" hits 2 concepts which become AND-joined targeting filters with declared transformer rules.</li>
                </ol>
                <div class="lane-info-trace">Code: <code>handleConceptRoute</code> + <code>handleSearchConcepts</code> → <code>cosineSimilarity</code></div>
              </div>
            </div>
            <p class="pane-subtitle">Cross-taxonomy audience concepts. Each concept carries semantic mappings to IAB, LiveRamp, TradeDesk, and internal taxonomies. Click a concept to find matching signals on the Discover tab.</p>
          </div>
        </div>

        <div class="ucp-banner" id="ucp-banner">
          <div class="ucp-banner-kv">
            <span class="ucp-banner-label">Extension</span>
            <span class="ucp-banner-v mono">ext.ucp</span>
          </div>
          <div class="ucp-banner-kv">
            <span class="ucp-banner-label">Embedding space</span>
            <span class="ucp-banner-v mono" id="ucp-b-space">—</span>
          </div>
          <div class="ucp-banner-kv">
            <span class="ucp-banner-label">Dimensions</span>
            <span class="ucp-banner-v mono" id="ucp-b-dims">—</span>
          </div>
          <div class="ucp-banner-kv">
            <span class="ucp-banner-label">Encoding</span>
            <span class="ucp-banner-v mono" id="ucp-b-enc">—</span>
          </div>
          <div class="ucp-banner-kv">
            <span class="ucp-banner-label">Similarity</span>
            <span class="ucp-banner-v" id="ucp-b-sim">—</span>
          </div>
          <div class="ucp-banner-kv">
            <span class="ucp-banner-label">Concepts</span>
            <span class="ucp-banner-v mono" id="ucp-b-count">—</span>
          </div>
        </div>

        <div class="concept-search-shell">
          <div class="concept-search">
            <svg class="ico"><use href="#icon-search"/></svg>
            <input id="concept-q" placeholder="e.g. soccer mom, afternoon drama viewer, high income household" />
          </div>
          <div class="concept-hints">
            <span class="hint-label">Try</span>
            <button class="hint" data-concept="soccer mom">soccer mom</button>
            <button class="hint" data-concept="high income household">high income</button>
            <button class="hint" data-concept="drama viewer">drama viewer</button>
            <button class="hint" data-concept="nashville DMA">nashville DMA</button>
          </div>
        </div>

        <div class="concept-grid" id="concept-grid">
          <div class="empty-state">
            <svg class="empty-icon"><use href="#icon-network"/></svg>
            <div class="empty-title">Search the concept registry</div>
            <div class="empty-desc">Concepts cluster audience intent across taxonomies. Useful for cross-platform buyers who work across different segment naming systems.</div>
          </div>
        </div>
      </section>

      <!-- ── TAB: Treemap ───────────────────────────────────────────────── -->
      <section class="tab-pane" data-tab="treemap">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Catalog treemap</h1>
            <p class="pane-subtitle">Whole marketplace at a glance. Cell area = audience size; cell color = category. Hover for details, click to open the signal.</p>
          </div>
          <div class="treemap-legend" id="treemap-legend"></div>
        </div>

        <div class="treemap-shell">
          <div class="treemap-canvas" id="treemap-canvas">
            <div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading treemap\u2026</div></div>
          </div>
        </div>
        <div id="treemap-explainer"></div>
      </section>

      <!-- ── TAB: Builder ───────────────────────────────────────────────── -->
      <section class="tab-pane" data-tab="builder">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Segment builder</h1>
            <p class="pane-subtitle">Compose a composite signal from targeting rules. Audience size recomputes on every change via <code>POST /signals/estimate</code>.</p>
          </div>
        </div>

        <div class="builder-grid">
          <div class="builder-rules-col">
            <div class="builder-section-label">Start from template</div>
            <select id="builder-template" class="builder-input">
              <option value="">— blank —</option>
              <option value="affluent_streamers">Affluent streamers (25-44, $150K+, high streaming)</option>
              <option value="cord_cutter_parents">Cord-cutter parents (35-54, family, high streaming)</option>
              <option value="urban_millennials">Urban millennials (25-34, top-10 metros, bachelors)</option>
              <option value="seniors_documentary">Seniors, documentary-affine (65+, documentary)</option>
              <option value="b2b_exec_profile">B2B exec profile (35-54, graduate, 150K+)</option>
            </select>
            <div class="template-confirm" id="template-confirm" style="display:none">
              <span id="template-confirm-msg"></span>
              <div class="template-confirm-actions">
                <button class="btn-primary" id="template-confirm-apply" style="padding:5px 12px;font-size:12px">Replace</button>
                <button class="btn-secondary" id="template-confirm-cancel" style="padding:5px 12px;font-size:12px">Cancel</button>
              </div>
            </div>
            <div style="height:16px"></div>
            <div class="builder-section-label">Rules <span style="color:var(--text-mut);font-weight:400;font-family:var(--font-mono)">(max 6)</span></div>
            <div class="builder-rules" id="builder-rules"></div>
            <div class="builder-row-actions">
              <button class="btn-secondary" id="add-rule-btn">
                <svg class="ico"><use href="#icon-plus"/></svg>
                <span>Add rule</span>
              </button>
              <button class="btn-secondary" id="reset-rules-btn" title="Clear all rules">
                <svg class="ico"><use href="#icon-close"/></svg>
                <span>Reset</span>
              </button>
            </div>

            <div class="builder-section-label" style="margin-top:20px">Segment name</div>
            <input id="builder-name" class="builder-input" placeholder="Auto-generated from rules" />

            <button class="btn-primary" id="generate-btn" style="margin-top:16px;width:100%;justify-content:center">
              <svg class="ico"><use href="#icon-bolt"/></svg>
              <span>Generate segment</span>
            </button>
            <div class="builder-note" id="generate-note"></div>
          </div>

          <div class="builder-preview-col">
            <div class="preview-hero">
              <div class="preview-hero-label">
                Estimated audience
                <span class="preview-confidence-pill" id="preview-confidence"></span>
              </div>
              <div class="preview-hero-value" id="preview-audience">—</div>
              <div class="preview-hero-sub" id="preview-sub">—</div>
              <div class="coverage-bar"><div class="coverage-bar-fill" id="coverage-fill"></div></div>
              <div class="preview-meta" id="preview-meta"></div>
              <div class="preview-floor-warning" id="preview-floor-warning" style="display:none">
                <svg class="ico"><use href="#icon-info"/></svg>
                <span>Rule stack resolves below the 50K floor — the shown number is a minimum, not a true estimate. Remove a rule or widen values.</span>
              </div>
              <div class="preview-explain" id="preview-explain"></div>
            </div>

            <div class="builder-section-label" style="margin-top:20px">
              Similar existing signals
              <span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px;font-family:var(--font-mono)" id="similar-subtitle">—</span>
            </div>
            <div class="similar-signals" id="similar-signals">
              <div class="empty-state" style="padding:20px">
                <div class="empty-desc">Compose a rule and the agent's semantic ranker will surface existing catalog signals that overlap — use one before creating a duplicate.</div>
              </div>
            </div>

            <div class="builder-section-label" style="margin-top:20px">Funnel — size after each rule</div>
            <div class="funnel-chart" id="funnel-chart">
              <div class="empty-state" style="padding:24px"><div class="empty-desc">Add a rule to see the funnel.</div></div>
            </div>

            <!-- Sec-38 B6: Multi-signal audience stack. Lets a planner -->
            <!-- combine several marketplace signals into an OR union and -->
            <!-- see combined unique reach (deduplicated by category      -->
            <!-- affinity × size ratio), total cost, blended CPM.         -->
            <div class="builder-section-label" style="margin-top:24px">
              Multi-signal audience stack
              <span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px;font-family:var(--font-mono)">OR union · dedupe via heuristic Jaccard</span>
            </div>
            <div class="stack-search">
              <svg class="ico"><use href="#icon-search"/></svg>
              <input id="stack-search-input" placeholder="Type to add a signal by name…" autocomplete="off"/>
            </div>
            <div class="stack-suggestions" id="stack-suggestions"></div>
            <div class="stack-list" id="stack-list">
              <div class="empty-state" style="padding:14px"><div class="empty-desc">Pick 2-8 catalog signals to model a stacked audience. Useful when one rule-set can't cleanly capture the target.</div></div>
            </div>
            <div class="stack-summary" id="stack-summary" style="display:none">
              <div class="stack-stat"><div class="stack-stat-label">Combined unique reach</div><div class="stack-stat-value" id="stack-unique">—</div></div>
              <div class="stack-stat"><div class="stack-stat-label">Sum of signal sizes</div><div class="stack-stat-value" id="stack-sum">—</div></div>
              <div class="stack-stat"><div class="stack-stat-label">Overlap waste</div><div class="stack-stat-value" id="stack-overlap">—</div></div>
              <div class="stack-stat"><div class="stack-stat-label">Blended CPM</div><div class="stack-stat-value" id="stack-cpm">—</div></div>
            </div>
            <div class="stack-bar-wrap" id="stack-bar-wrap"></div>
          </div>
        </div>
      </section>

      <!-- ── TAB: Overlap ───────────────────────────────────────────────── -->
      <section class="tab-pane" data-tab="overlap">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Audience overlap</h1>
            <p class="pane-subtitle">Pick 2-6 signals. Jaccard intersection is approximated using category affinity × size ratio — refinable with real embedding cosine in a production deployment. Useful for "can I dedupe these" and "how much do these compete for the same impressions."</p>
          </div>
        </div>
        <div class="overlap-shell">
          <div class="overlap-picker" id="overlap-picker">
            <div class="builder-section-label">Selected signals <span style="color:var(--text-mut);font-weight:400;font-family:var(--font-mono)" id="overlap-count">0 / 6</span></div>
            <div class="overlap-chips" id="overlap-chips"></div>
            <div class="overlap-search">
              <svg class="ico"><use href="#icon-search"/></svg>
              <input id="overlap-search-input" placeholder="Type to search catalog by name…" autocomplete="off"/>
            </div>
            <div class="overlap-suggestions" id="overlap-suggestions"></div>
            <button class="btn-primary" id="overlap-run" disabled style="margin-top:14px;width:100%;justify-content:center">
              <svg class="ico"><use href="#icon-network"/></svg>
              <span>Compute overlap</span>
            </button>
          </div>
          <div class="overlap-results" id="overlap-results">
            <div class="empty-state">
              <svg class="empty-icon"><use href="#icon-network"/></svg>
              <div class="empty-title">Select 2+ signals</div>
              <div class="empty-desc">Pairwise Jaccard scores render as a heat-matrix; 3+ signals also render an UpSet-style subset chart.</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── TAB: Embedding (Sec-38 B5) ─────────────────────────────────── -->
      <!-- Three panels:                                                        -->
      <!--   1) 2D scatter   — JL random-projection of 26 real 512-d vectors   -->
      <!--   2) Heatmap      — pairwise cosine similarity (20×20)              -->
      <!--   3) Cross-tax Sankey — bridge IAB 1.1 → IAB 3.0 → LR/TTD/Nielsen   -->
      <section class="tab-pane" data-tab="embedding">
        <div class="pane-header">
          <div>
            <div class="pane-title-with-info">
              <h1 class="pane-title">Embedding space</h1>
              <button class="lane-info-btn" data-lane-info-toggle="page-embedding" title="How this works" aria-label="How embedding space works"><svg class="ico"><use href="#icon-info"/></svg></button>
              <div class="lane-info-popover" data-lane-info-panel="page-embedding" role="dialog">
                <div class="lane-info-title">How the 2D projection is built</div>
                <ol class="lane-info-steps">
                  <li><strong>Source vectors.</strong> Every signal in the catalog has a 512-dim embedding from <code>openai-te3-small-d512</code>; same model that scores brief queries.</li>
                  <li><strong>Projection.</strong> 512-d → 2-d via Procrustes-SVD against a fixed UCP reference space. Distance is approximately preserved; clusters reflect semantic similarity.</li>
                  <li><strong>Hover + neighbors.</strong> Hover any point for full signal metadata + top-K nearest by cosine. Spatial gaps are signal-coverage holes — surfaced separately as "coverage gaps" in the analytics tabs.</li>
                </ol>
                <div class="lane-info-trace">Code: <code>handleUcpProjection</code> → Procrustes-SVD; vectors served from <code>/signals/&lt;id&gt;/embedding</code></div>
              </div>
            </div>
            <p class="pane-subtitle">Live view of the UCP semantic space powering semantic discovery. Real 512-dim <code>text-embedding-3-small</code> vectors, projected for inspection. Tight clusters = semantically adjacent audiences.</p>
          </div>
          <div class="activations-controls">
            <button class="btn-secondary" id="emb-refresh">
              <svg class="ico"><use href="#icon-chart"/></svg><span>Refresh</span>
            </button>
            <a class="btn-secondary" href="/ucp/projection" target="_blank" rel="noopener">
              <svg class="ico"><use href="#icon-arrow-right"/></svg><span>/ucp/projection</span>
            </a>
          </div>
        </div>
        <!-- Top-level orientation for anyone new to embedding visualizations -->
        <div class="emb-intro">
          <div class="emb-intro-title">What is an embedding space?</div>
          <p class="emb-intro-body">Every audience in this catalog is converted into a 512-dimensional vector by OpenAI\u2019s <code>text-embedding-3-small</code> model. Audiences that mean similar things end up close to each other in that 512-D space \u2014 that\u2019s what powers semantic search, similar-signal lookups, and the NL query resolver. The three panels below each give you a different window into that space.</p>
        </div>
        <div class="emb-grid">
          <div class="emb-panel">
            <div class="emb-panel-title">2D projection <span class="pill pill-muted mono" style="margin-left:8px">JL \u00b7 512\u21922</span></div>
            <div id="emb-scatter" class="emb-scatter">
              <div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading projection\u2026</div></div>
            </div>
            <div class="emb-legend" id="emb-legend"></div>
            <div id="emb-scatter-explainer"></div>
          </div>
          <div class="emb-panel">
            <div class="emb-panel-title">Pairwise cosine similarity <span class="pill pill-muted mono" style="margin-left:8px">20\u00d720</span></div>
            <div id="emb-heatmap" class="emb-heatmap">
              <div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading heatmap\u2026</div></div>
            </div>
            <div id="emb-heatmap-explainer"></div>
          </div>
          <div class="emb-panel emb-panel-wide">
            <div class="emb-panel-title">Cross-taxonomy Sankey <span class="pill pill-muted mono" style="margin-left:8px">IAB 1.1 \u2192 3.0 \u2192 LR/TTD/MC/Nielsen</span></div>
            <div id="emb-sankey" class="emb-sankey">
              <div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading bridge\u2026</div></div>
            </div>
            <div id="emb-sankey-explainer"></div>
          </div>
        </div>
      </section>

      <!-- ── TAB: Embedding Lab (Sec-41 Part 2) ─────────────────────────── -->
      <!-- Advanced vector operations playground. Four sub-panels:          -->
      <!--   1) Custom similarity — text or vector input                    -->
      <!--   2) Semantic arithmetic — plus/minus/weight builder             -->
      <!--   3) Analogy explorer — A:B::C:?                                 -->
      <!--   4) Coverage-gap heatmap                                        -->
      <section class="tab-pane" data-tab="lab">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Embedding Lab</h1>
            <p class="pane-subtitle">Advanced vector operations over the UCP semantic space. Custom similarity, semantic arithmetic, analogy queries, and coverage-gap analysis \u2014 all live against 26 real OpenAI text-embedding-3-small vectors.</p>
          </div>
        </div>

        <!-- Inner tab bar to switch sub-panels -->
        <div class="lab-subtabs">
          <button class="lab-subtab active" data-lab="playground">Playground</button>
          <button class="lab-subtab" data-lab="arithmetic">Arithmetic</button>
          <button class="lab-subtab" data-lab="analogy">Analogy</button>
          <button class="lab-subtab" data-lab="neighborhood">Neighborhood</button>
          <button class="lab-subtab" data-lab="coverage">Coverage Gaps</button>
        </div>

        <!-- 1. Playground — custom similarity -->
        <div class="lab-subpanel" data-lab-panel="playground">
          <div class="lab-grid">
            <div class="lab-panel">
              <div class="lab-panel-title">Query</div>
              <label class="lab-label">Mode</label>
              <div class="lab-tabs">
                <button class="lab-tab active" data-pg-mode="text">Text</button>
                <button class="lab-tab" data-pg-mode="vector">Vector (512-d)</button>
              </div>
              <div id="pg-text-shell">
                <label class="lab-label" style="margin-top:10px">Describe an audience</label>
                <textarea id="pg-text" class="lab-input" rows="4" placeholder="e.g. cord-cutters who just bought a house"></textarea>
                <div class="lab-chips" id="pg-sample-briefs">
                  <span class="lab-chips-label">Try:</span>
                  <button class="lab-chip" data-brief="affluent millennials interested in luxury travel">luxury travel</button>
                  <button class="lab-chip" data-brief="new parents researching baby gear">new parents</button>
                  <button class="lab-chip" data-brief="cord-cutters who just moved">moved cord-cutters</button>
                  <button class="lab-chip" data-brief="B2B decision makers at high-growth tech companies">B2B tech</button>
                </div>
              </div>
              <div id="pg-vector-shell" style="display:none">
                <label class="lab-label" style="margin-top:10px">Paste 512 comma-separated floats</label>
                <textarea id="pg-vector" class="lab-input mono" rows="5" placeholder="0.123, -0.456, ..."></textarea>
              </div>
              <label class="lab-label" style="margin-top:10px">Top K</label>
              <input id="pg-k" type="number" min="1" max="50" value="10" class="lab-input"/>
              <button class="btn-primary" id="pg-run" style="margin-top:12px;width:100%;justify-content:center">
                <svg class="ico"><use href="#icon-radar"/></svg><span>Find neighbors</span>
              </button>
            </div>
            <div class="lab-panel lab-panel-wide">
              <div class="lab-panel-title">Results</div>
              <div id="pg-results"><div class="empty-state"><div class="empty-desc">Enter a query on the left and hit <strong>Find neighbors</strong>. Results rank by cosine similarity in the 512-d UCP space.</div></div></div>
              <div id="pg-explainer"></div>
            </div>
          </div>
        </div>

        <!-- 2. Arithmetic -->
        <div class="lab-subpanel" data-lab-panel="arithmetic" style="display:none">
          <div class="lab-grid">
            <div class="lab-panel">
              <div class="lab-panel-title">Expression builder</div>
              <div class="lab-terms" id="arith-terms">
                <!-- populated by JS -->
              </div>
              <button class="btn-secondary" id="arith-add-term" style="width:100%;margin-top:8px">
                <svg class="ico"><use href="#icon-plus"/></svg><span>Add term</span>
              </button>
              <label class="lab-label" style="margin-top:12px">Top K</label>
              <input id="arith-k" type="number" min="1" max="50" value="10" class="lab-input"/>
              <div class="lab-chips" style="margin-top:12px">
                <span class="lab-chips-label">Presets:</span>
                <button class="lab-chip" data-preset="luxury_millennial">luxury + millennial</button>
                <button class="lab-chip" data-preset="cord_cutter_parents">cord-cutter + parent</button>
                <button class="lab-chip" data-preset="affluent_minus_urban">affluent − urban</button>
              </div>
              <button class="btn-primary" id="arith-run" style="margin-top:12px;width:100%;justify-content:center">
                <svg class="ico"><use href="#icon-bolt"/></svg><span>Compute</span>
              </button>
            </div>
            <div class="lab-panel lab-panel-wide">
              <div class="lab-panel-title">Composed audience</div>
              <div id="arith-expression" class="lab-expr"></div>
              <div id="arith-results"><div class="empty-state"><div class="empty-desc">Compose 2+ terms and hit <strong>Compute</strong>. The builder does weighted vector arithmetic in the 512-d UCP space, then ranks catalog audiences by cosine to the result.</div></div></div>
              <div id="arith-explainer"></div>
            </div>
          </div>
        </div>

        <!-- 3. Analogy -->
        <div class="lab-subpanel" data-lab-panel="analogy" style="display:none">
          <div class="lab-grid">
            <div class="lab-panel">
              <div class="lab-panel-title">Analogy A : B :: C : ?</div>
              <label class="lab-label">A — start of known pair</label>
              <select id="ana-a" class="lab-input"></select>
              <label class="lab-label" style="margin-top:8px">B — end of known pair</label>
              <select id="ana-b" class="lab-input"></select>
              <label class="lab-label" style="margin-top:8px">C — start of new pair</label>
              <select id="ana-c" class="lab-input"></select>
              <label class="lab-label" style="margin-top:8px">Algorithm</label>
              <div class="lab-tabs">
                <button class="lab-tab active" data-ana-algo="3cos_add">3CosAdd</button>
                <button class="lab-tab" data-ana-algo="3cos_mul">3CosMul</button>
              </div>
              <button class="btn-primary" id="ana-run" style="margin-top:12px;width:100%;justify-content:center">
                <svg class="ico"><use href="#icon-network"/></svg><span>Find D</span>
              </button>
            </div>
            <div class="lab-panel lab-panel-wide">
              <div class="lab-panel-title">Analogy result</div>
              <div id="ana-results"><div class="empty-state"><div class="empty-desc">Pick three distinct signals as A, B, C. The system computes <code>D = B − A + C</code> in vector space and returns the closest matches. Good analogies produce parallel vectors.</div></div></div>
              <div id="ana-explainer"></div>
            </div>
          </div>
        </div>

        <!-- 4. Neighborhood -->
        <div class="lab-subpanel" data-lab-panel="neighborhood" style="display:none">
          <div class="lab-grid">
            <div class="lab-panel">
              <div class="lab-panel-title">Seed signal</div>
              <select id="nbh-seed" class="lab-input"></select>
              <label class="lab-label" style="margin-top:8px">Top K</label>
              <input id="nbh-k" type="number" min="1" max="25" value="10" class="lab-input"/>
              <button class="btn-primary" id="nbh-run" style="margin-top:12px;width:100%;justify-content:center">
                <svg class="ico"><use href="#icon-radar"/></svg><span>Explore</span>
              </button>
            </div>
            <div class="lab-panel lab-panel-wide">
              <div class="lab-panel-title">Neighborhood analysis</div>
              <div id="nbh-results"><div class="empty-state"><div class="empty-desc">Pick a seed signal. System returns top-K neighbors by cosine, plus local density + distance to the catalog centroid.</div></div></div>
              <div id="nbh-explainer"></div>
            </div>
          </div>
        </div>

        <!-- 5. Coverage gaps -->
        <div class="lab-subpanel" data-lab-panel="coverage" style="display:none">
          <div class="lab-panel lab-panel-full">
            <div class="lab-panel-title">Coverage gap heatmap</div>
            <div id="cov-viz"><div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading coverage grid\u2026</div></div></div>
            <div id="cov-explainer"></div>
          </div>
        </div>
      </section>

      <!-- ── TAB: Portfolio (Sec-41 Part 2) ─────────────────────────────── -->
      <section class="tab-pane" data-tab="portfolio">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Portfolio Optimizer</h1>
            <p class="pane-subtitle">Pareto frontier across reach / CPM / specificity, greedy marginal-reach allocator, and information-theoretic overlap. Beyond simple Jaccard.</p>
          </div>
        </div>
        <div class="port-subtabs">
          <button class="lab-subtab active" data-port="pareto">Pareto frontier</button>
          <button class="lab-subtab" data-port="optimizer">Greedy optimizer</button>
          <button class="lab-subtab" data-port="lorenz">Lorenz / Gini</button>
          <button class="lab-subtab" data-port="from-brief">Brief \u2192 Portfolio</button>
        </div>
        <div class="lab-subpanel" data-port-panel="pareto">
          <div class="lab-panel lab-panel-full">
            <div class="lab-panel-title">Pareto frontier \u2014 520 signals across reach \u00d7 CPM \u00d7 specificity</div>
            <div id="port-pareto-viz"><div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading frontier\u2026</div></div></div>
            <div id="port-pareto-explainer"></div>
          </div>
        </div>
        <div class="lab-subpanel" data-port-panel="optimizer" style="display:none">
          <div class="lab-grid">
            <div class="lab-panel">
              <div class="lab-panel-title">Constraints</div>
              <label class="lab-label">Budget ($)</label>
              <input id="opt-budget" type="number" min="1000" value="250000" step="10000" class="lab-input"/>
              <label class="lab-label" style="margin-top:8px">Max signals in portfolio</label>
              <input id="opt-max-sig" type="number" min="1" max="20" value="6" class="lab-input"/>
              <label class="lab-label" style="margin-top:8px">Target reach (optional)</label>
              <input id="opt-target" type="number" min="0" value="0" step="1000000" class="lab-input"/>
              <button class="btn-primary" id="opt-run" style="margin-top:12px;width:100%;justify-content:center">
                <svg class="ico"><use href="#icon-bolt"/></svg><span>Optimize</span>
              </button>
            </div>
            <div class="lab-panel lab-panel-wide">
              <div class="lab-panel-title">Greedy picks + marginal reach waterfall</div>
              <div id="opt-results"><div class="empty-state"><div class="empty-desc">Enter a budget and hit Optimize. The greedy allocator iterates catalog candidates, at each step picking the signal that adds the most <strong>unique</strong> reach after subtracting pairwise overlap.</div></div></div>
              <div id="opt-explainer"></div>
            </div>
          </div>
        </div>
        <div class="lab-subpanel" data-port-panel="lorenz" style="display:none">
          <div class="lab-panel lab-panel-full">
            <div class="lab-panel-title">Catalog concentration (Lorenz curve + Gini)</div>
            <div id="port-lorenz-viz"><div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading Lorenz curves\u2026</div></div></div>
            <div id="port-lorenz-explainer"></div>
          </div>
        </div>
        <div class="lab-subpanel" data-port-panel="from-brief" style="display:none">
          <div class="lab-grid">
            <div class="lab-panel">
              <div class="lab-panel-title">Brief</div>
              <!-- Sec-31u: try-chips for one-click brief population. Each chip
                   carries the brief text in data-brief and a budget in data-budget;
                   clicking fills the textarea + budget input + auto-submits.
                   Wired in fragments/portfolio.ts. -->
              <div class="brief-try-chips" id="port-brief-chips">
                <span class="brief-try-label">Try</span>
                <button type="button" class="brief-try-chip" data-budget="250000"
                        data-brief="Launch campaign for affluent urban millennials interested in premium fitness + wellness. Target CTV + podcast.">
                  Premium fitness · CTV + podcast
                </button>
                <button type="button" class="brief-try-chip" data-budget="180000"
                        data-brief="Cord-cutter parents 35-44 with kids at home, household income $100K+. Drama + family streaming on connected TV.">
                  Cord-cutter parents · streaming
                </button>
                <button type="button" class="brief-try-chip" data-budget="500000"
                        data-brief="High-net-worth professionals 35-54 in top-10 DMAs interested in luxury travel, fine dining, business news. Premium audio + video.">
                  HNW professionals · luxury
                </button>
                <button type="button" class="brief-try-chip" data-budget="120000"
                        data-brief="Gen Z college students interested in gaming, esports, and music streaming. Mobile-first, short-form video.">
                  Gen Z gamers · mobile video
                </button>
                <button type="button" class="brief-try-chip" data-budget="300000"
                        data-brief="DIY homeowners 35-64 with high household spend on home improvement. Daypart-aware: weekend mornings, weekday evenings.">
                  DIY homeowners · daypart
                </button>
              </div>
              <textarea id="brief-text" class="lab-input" rows="6" placeholder="Launch campaign for affluent urban millennials interested in premium fitness + wellness. Target CTV + podcast..."></textarea>
              <label class="lab-label" style="margin-top:8px">Budget</label>
              <input id="brief-budget" type="number" min="1000" value="250000" step="10000" class="lab-input"/>
              <button class="btn-primary" id="brief-run" style="margin-top:12px;width:100%;justify-content:center">
                <svg class="ico"><use href="#icon-radar"/></svg><span>Generate portfolio</span>
              </button>
            </div>
            <div class="lab-panel lab-panel-wide">
              <div class="lab-panel-title">Recommended portfolio</div>
              <div id="brief-results"><div class="empty-state"><div class="empty-desc">Paste a full campaign brief. System vectorizes it, retrieves top-K similar signals from the 26-vector embedding space, then greedy-optimizes a portfolio with allocation percentages.</div></div></div>
              <div id="brief-explainer"></div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── TAB: Seasonality (Sec-41 Part 2) ───────────────────────────── -->
      <section class="tab-pane" data-tab="seasonality">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Seasonality Intelligence</h1>
            <p class="pane-subtitle">Forward-looking signal recommendations based on monthly seasonality profiles, volatility indices, and data-freshness decay curves.</p>
          </div>
        </div>
        <div class="lab-grid">
          <div class="lab-panel">
            <div class="lab-panel-title">Best signals for window</div>
            <label class="lab-label">Target window</label>
            <select id="sea-window" class="lab-input">
              <option value="current">Current month</option>
              <option value="Q1">Q1 (Jan-Mar)</option>
              <option value="Q2">Q2 (Apr-Jun)</option>
              <option value="Q3">Q3 (Jul-Sep)</option>
              <option value="Q4">Q4 (Oct-Dec)</option>
              <option value="month_10">November</option>
              <option value="month_11">December</option>
            </select>
            <button class="btn-primary" id="sea-run" style="margin-top:12px;width:100%;justify-content:center">
              <svg class="ico"><use href="#icon-info"/></svg><span>Rank</span>
            </button>
          </div>
          <div class="lab-panel lab-panel-wide">
            <div class="lab-panel-title">Top-ranked signals for this window</div>
            <div id="sea-results"><div class="empty-state"><div class="empty-desc">Pick a window and hit Rank. System scores every signal by <code>window_avg_seasonality \u00d7 specificity \u00d7 log_reach</code>.</div></div></div>
            <div id="sea-explainer"></div>
          </div>
        </div>
        <div class="lab-panel lab-panel-full" style="margin-top:14px">
          <div class="lab-panel-title">Seasonality heatmap \u2014 first 30 signals</div>
          <div id="sea-heatmap"><div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading heatmap\u2026</div></div></div>
        </div>
      </section>

      <!-- TAB: Composer (Sec-43) -->
      <!-- Unified audience composition: set ops + lookalike expand +      -->
      <!-- frequency-saturation planning + affinity audit. Talks to the    -->
      <!-- /audience/* endpoints introduced in Sec-43 Part 1.              -->
      <section class="tab-pane" data-tab="composer">
        <div class="pane-header">
          <div>
            <div class="pane-title-with-info">
              <h1 class="pane-title">Audience Composer</h1>
              <button class="lane-info-btn" data-lane-info-toggle="page-composer" title="How this works" aria-label="How audience composer works"><svg class="ico"><use href="#icon-info"/></svg></button>
              <div class="lane-info-popover" data-lane-info-panel="page-composer" role="dialog">
                <div class="lane-info-title">How audience composition works</div>
                <ol class="lane-info-steps">
                  <li><strong>Saturation model.</strong> P(seen ≥ 1 | F) = 1 − exp(−F) across F=1..15 frequency exposures. Knee detection flags the F at which marginal reach drops below 50% of the F=1 gain.</li>
                  <li><strong>Lookalike expansion.</strong> Take chosen signal's 512-d vector, find top-K nearest in the catalog by cosine. Returns ranked candidates with cosine score + coverage_percentage.</li>
                  <li><strong>Affinity audit + privacy gate.</strong> Composition checked against industry attestations (DTS labels) + minimum-cohort thresholds (≥1k by default). Stages with sub-threshold cohorts auto-drop.</li>
                </ol>
                <div class="lane-info-trace">Code: <code>handleAudienceCompose</code> + <code>handleAudienceSaturation</code> + <code>handleAudiencePrivacyCheck</code></div>
              </div>
            </div>
            <p class="pane-subtitle">Compose audiences from catalog signals with set operations (union \u222a, intersect \u2229, exclude \u2212), optionally expand with embedding-based lookalikes, then plan activation via frequency-saturation curves and affinity audits vs the catalog baseline.</p>
          </div>
        </div>
        <div class="port-subtabs">
          <button class="lab-subtab active" data-composer="build">Set Builder</button>
          <button class="lab-subtab" data-composer="saturation">Frequency Saturation</button>
          <button class="lab-subtab" data-composer="affinity">Affinity Audit</button>
        </div>

        <!-- 1. Set Builder -->
        <div class="lab-subpanel" data-composer-panel="build">
          <div class="composer-grid">
            <div class="lab-panel">
              <div class="lab-panel-title">Include (union \u222a)</div>
              <div class="builder-section-label">Selected <span style="color:var(--text-mut);font-weight:400;font-family:var(--font-mono)" id="comp-inc-count">0 / 8</span></div>
              <div class="overlap-chips" id="comp-inc-chips"></div>
              <div class="overlap-search">
                <svg class="ico"><use href="#icon-search"/></svg>
                <input id="comp-inc-search" placeholder="Search catalog\u2026" autocomplete="off"/>
              </div>
              <div class="overlap-suggestions" id="comp-inc-sugg"></div>
            </div>
            <div class="lab-panel">
              <div class="lab-panel-title">Intersect (\u2229)</div>
              <div class="builder-section-label">Selected <span style="color:var(--text-mut);font-weight:400;font-family:var(--font-mono)" id="comp-itx-count">0 / 4</span></div>
              <div class="overlap-chips" id="comp-itx-chips"></div>
              <div class="overlap-search">
                <svg class="ico"><use href="#icon-search"/></svg>
                <input id="comp-itx-search" placeholder="Search catalog\u2026" autocomplete="off"/>
              </div>
              <div class="overlap-suggestions" id="comp-itx-sugg"></div>
            </div>
            <div class="lab-panel">
              <div class="lab-panel-title">Exclude (\u2212)</div>
              <div class="builder-section-label">Selected <span style="color:var(--text-mut);font-weight:400;font-family:var(--font-mono)" id="comp-exc-count">0 / 4</span></div>
              <div class="overlap-chips" id="comp-exc-chips"></div>
              <div class="overlap-search">
                <svg class="ico"><use href="#icon-search"/></svg>
                <input id="comp-exc-search" placeholder="Search catalog\u2026" autocomplete="off"/>
              </div>
              <div class="overlap-suggestions" id="comp-exc-sugg"></div>
            </div>
          </div>
          <div class="lab-panel" style="margin-top:14px">
            <div class="lab-panel-title">Lookalike expand (optional)</div>
            <div class="composer-lal-row">
              <div>
                <label class="lab-label">Seed signal (must have an embedding)</label>
                <select id="comp-lal-seed" class="lab-input">
                  <option value="">\u2014 none \u2014</option>
                </select>
              </div>
              <div>
                <label class="lab-label">Top K</label>
                <input id="comp-lal-k" type="number" min="1" max="25" value="8" class="lab-input"/>
              </div>
              <div>
                <label class="lab-label">Min cosine</label>
                <input id="comp-lal-min" type="number" min="0" max="1" step="0.05" value="0.55" class="lab-input"/>
              </div>
              <button class="btn-primary" id="comp-run" style="justify-content:center;padding:10px 18px">
                <svg class="ico"><use href="#icon-bolt"/></svg><span>Compute composition</span>
              </button>
            </div>
          </div>
          <div class="lab-panel lab-panel-full" style="margin-top:14px">
            <div class="lab-panel-title">Result</div>
            <div id="comp-results"><div class="empty-state"><div class="empty-desc">Pick at least one signal, then hit <strong>Compute composition</strong>. The system applies pairwise inclusion-exclusion for union, category-affinity Jaccard for intersect, and subtracts suppressed overlap for exclude. A lookalike seed surfaces top-K embedding neighbors as candidates you can add to the <em>Include</em> pool on the next pass.</div></div></div>
            <div id="comp-privacy"></div>
            <div id="comp-holdout"></div>
            <div id="comp-explainer"></div>
          </div>
        </div>

        <!-- 2. Frequency Saturation -->
        <div class="lab-subpanel" data-composer-panel="saturation" style="display:none">
          <div class="lab-grid">
            <div class="lab-panel">
              <div class="lab-panel-title">Audience + constraints</div>
              <div class="builder-section-label">Selected signals <span style="color:var(--text-mut);font-weight:400;font-family:var(--font-mono)" id="comp-sat-count">0 / 10</span></div>
              <div class="overlap-chips" id="comp-sat-chips"></div>
              <div class="overlap-search">
                <svg class="ico"><use href="#icon-search"/></svg>
                <input id="comp-sat-search" placeholder="Search catalog\u2026" autocomplete="off"/>
              </div>
              <div class="overlap-suggestions" id="comp-sat-sugg"></div>
              <label class="lab-label" style="margin-top:12px">Budget ($, optional)</label>
              <input id="comp-sat-budget" type="number" min="0" step="1000" value="50000" class="lab-input"/>
              <label class="lab-label" style="margin-top:8px">Reach override (optional)</label>
              <input id="comp-sat-reach" type="number" min="0" step="1000" placeholder="auto from signals" class="lab-input"/>
              <button class="btn-primary" id="comp-sat-run" style="margin-top:12px;width:100%;justify-content:center" disabled>
                <svg class="ico"><use href="#icon-chart"/></svg><span>Compute saturation</span>
              </button>
            </div>
            <div class="lab-panel lab-panel-wide">
              <div class="lab-panel-title">Diminishing-returns curve</div>
              <div id="comp-sat-results"><div class="empty-state"><div class="empty-desc">Pick at least one signal (or override reach), then hit <strong>Compute saturation</strong>. The system models <code>P(seen \u2265 1 | F) = 1 \u2212 exp(\u2212F)</code> across F=1..15 and flags the knee where marginal reach drops below 50% of the F=1 gain.</div></div></div>
              <div id="comp-sat-explainer"></div>
            </div>
          </div>
        </div>

        <!-- 3. Affinity Audit -->
        <div class="lab-subpanel" data-composer-panel="affinity" style="display:none">
          <div class="lab-grid">
            <div class="lab-panel">
              <div class="lab-panel-title">Selection</div>
              <div class="builder-section-label">Selected signals <span style="color:var(--text-mut);font-weight:400;font-family:var(--font-mono)" id="comp-aff-count">0 / 15</span></div>
              <div class="overlap-chips" id="comp-aff-chips"></div>
              <div class="overlap-search">
                <svg class="ico"><use href="#icon-search"/></svg>
                <input id="comp-aff-search" placeholder="Search catalog\u2026" autocomplete="off"/>
              </div>
              <div class="overlap-suggestions" id="comp-aff-sugg"></div>
              <button class="btn-primary" id="comp-aff-run" style="margin-top:12px;width:100%;justify-content:center" disabled>
                <svg class="ico"><use href="#icon-network"/></svg><span>Audit affinity</span>
              </button>
            </div>
            <div class="lab-panel lab-panel-wide">
              <div class="lab-panel-title">Over / under-index vs catalog baseline</div>
              <div id="comp-aff-results"><div class="empty-state"><div class="empty-desc">Pick at least one signal and hit <strong>Audit affinity</strong>. For every facet (category, vertical, geo band, data provider) the system compares the reach-weighted share of your selection against the catalog baseline. Index 100 = at parity; 200 = 2\u00d7 over-represented; 50 = under-represented.</div></div></div>
              <div id="comp-aff-explainer"></div>
            </div>
          </div>
        </div>
      </section>

      <!-- TAB: Expression (Sec-47) — visual boolean AST tree builder -->
      <section class="tab-pane" data-tab="expression">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Expression Tree <span class="pill pill-accent" style="margin-left:8px;font-size:10px">AST</span></h1>
            <p class="pane-subtitle">Build arbitrary boolean expressions over catalog signals: <code>(A ∪ B) ∩ (C ∪ D) − (E ∩ F)</code>. Drag nodes to reparent. NOT is only legal as a child of AND (it means "exclude"). Reach evaluates recursively bottom-up with the same pairwise-Jaccard heuristic the Composer uses, lifted to subtrees. Depth ≤ 5, nodes ≤ 30. Save any expression as a <strong>Snapshot</strong> to diff it later.</p>
          </div>
          <div class="activations-controls">
            <button class="btn-secondary" id="expr-reset">
              <svg class="ico"><use href="#icon-close"/></svg><span>Reset</span>
            </button>
            <button class="btn-primary" id="expr-run" disabled>
              <svg class="ico"><use href="#icon-bolt"/></svg><span>Compute reach</span>
            </button>
          </div>
        </div>
        <div class="expr-counters mono" id="expr-counters">
          <span id="expr-count-nodes">0</span>/30 nodes · depth <span id="expr-count-depth">0</span>/5
        </div>
        <div class="expr-canvas" id="expr-canvas"></div>
        <div class="lab-panel lab-panel-full" style="margin-top:14px">
          <div class="lab-panel-title">Reach</div>
          <div id="expr-result"><div class="empty-state"><div class="empty-desc">Build a tree above (click <strong>+ Signal</strong> inside a group to pick a catalog signal; click <strong>+ Group</strong> to add nested OR/AND), then hit <strong>Compute reach</strong>. Each subtree's reach will render inline on its node.</div></div></div>
          <div id="expr-privacy"></div>
          <div id="expr-holdout"></div>
          <div id="expr-explainer"></div>
        </div>
        <div class="lab-panel lab-panel-full" style="margin-top:14px" id="expr-save-panel" hidden>
          <div class="lab-panel-title">Save as snapshot</div>
          <div class="expr-save-row">
            <input id="expr-save-name" class="lab-input" placeholder="Snapshot name"/>
            <input id="expr-save-tags" class="lab-input" placeholder="tags (comma-separated)" style="max-width:240px"/>
            <button class="btn-primary" id="expr-save-btn">Save snapshot</button>
          </div>
        </div>
      </section>

      <!-- TAB: Journey Builder (Sec-44) -->
      <!-- Sequential segmentation. 2-5 stage cards; each stage has its own -->
      <!-- include/intersect/exclude pickers. Funnel viz + drop-off stats.  -->
      <section class="tab-pane" data-tab="journey">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Journey Builder</h1>
            <p class="pane-subtitle">Stack 2–6 audience stages (awareness → consideration → intent → conversion) and see per-stage reach, conversion rate vs the prior stage, cumulative rate vs top-of-funnel, and drop-off. <strong>Cumulative mode</strong> (default) makes each stage a subset of the prior by folding upstream signals in as implicit intersects — the mathematically correct funnel interpretation. <strong>Independent mode</strong> sizes each stage on its own and clamps after the fact — use when stages are sized from separate data sources.</p>
          </div>
          <div class="activations-controls">
            <button class="btn-secondary" id="journey-add">
              <svg class="ico"><use href="#icon-plus"/></svg><span>Add stage</span>
            </button>
            <button class="btn-primary" id="journey-run" disabled>
              <svg class="ico"><use href="#icon-activations"/></svg><span>Compute funnel</span>
            </button>
          </div>
        </div>
        <div class="journey-mode-row">
          <span class="journey-mode-label">Mode</span>
          <div class="journey-mode-switch" role="tablist">
            <button class="journey-mode-btn active" data-mode="cumulative" role="tab" aria-selected="true">Cumulative (subset)</button>
            <button class="journey-mode-btn" data-mode="independent" role="tab" aria-selected="false">Independent (legacy)</button>
          </div>
          <span class="journey-mode-hint" id="journey-mode-hint">Each stage is a subset of the prior — upstream signals fold in as implicit intersects.</span>
        </div>
        <div id="journey-stages"></div>
        <div class="lab-panel lab-panel-full" style="margin-top:14px">
          <div class="lab-panel-title">Funnel</div>
          <div id="journey-result"><div class="empty-state"><div class="empty-desc">Define at least 2 stages (each with ≥1 include or intersect signal) and hit <strong>Compute funnel</strong>. Stages are rendered as descending bars with conversion rates between them and cumulative drop-off from the top of funnel.</div></div></div>
          <div id="journey-explainer"></div>
        </div>
      </section>

      <!-- TAB: Scenario Planner (Sec-44) — wires /portfolio/what-if -->
      <section class="tab-pane" data-tab="planner">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Scenario Planner</h1>
            <p class="pane-subtitle">Evaluate the impact of adding or removing signals from a portfolio. Returns delta reach, delta cost, reach-per-dollar efficiency, and a keep/marginal/reject recommendation.</p>
          </div>
        </div>
        <div class="lab-grid">
          <div class="lab-panel">
            <div class="lab-panel-title">Current portfolio</div>
            <div class="builder-section-label">Selected <span style="color:var(--text-mut);font-weight:400;font-family:var(--font-mono)" id="plan-cur-count">0 / 12</span></div>
            <div class="overlap-chips" id="plan-cur-chips"></div>
            <div class="overlap-search">
              <svg class="ico"><use href="#icon-search"/></svg>
              <input id="plan-cur-search" placeholder="Search catalog…" autocomplete="off"/>
            </div>
            <div class="overlap-suggestions" id="plan-cur-sugg"></div>
          </div>
          <div class="lab-panel">
            <div class="lab-panel-title">Proposed changes</div>
            <div class="builder-section-label">Add <span style="color:var(--text-mut);font-weight:400;font-family:var(--font-mono)" id="plan-add-count">0 / 6</span></div>
            <div class="overlap-chips" id="plan-add-chips"></div>
            <div class="overlap-search">
              <svg class="ico"><use href="#icon-search"/></svg>
              <input id="plan-add-search" placeholder="Search catalog to add…" autocomplete="off"/>
            </div>
            <div class="overlap-suggestions" id="plan-add-sugg"></div>
            <div class="builder-section-label" style="margin-top:12px">Remove <span style="color:var(--text-mut);font-weight:400;font-family:var(--font-mono)" id="plan-rem-count">0 / 6</span></div>
            <div class="overlap-chips" id="plan-rem-chips"></div>
            <div id="plan-rem-candidates" style="font-size:11px;color:var(--text-mut);padding:6px 0">Remove picks are chosen from your current portfolio below.</div>
            <button class="btn-primary" id="plan-run" style="margin-top:12px;width:100%;justify-content:center" disabled>
              <svg class="ico"><use href="#icon-bolt"/></svg><span>Evaluate scenario</span>
            </button>
          </div>
        </div>
        <div class="lab-panel lab-panel-full" style="margin-top:14px">
          <div class="lab-panel-title">Delta</div>
          <div id="plan-result"><div class="empty-state"><div class="empty-desc">Build a current portfolio, propose additions or removals, and hit <strong>Evaluate scenario</strong>. The delta is computed against the same greedy marginal-reach math the portfolio optimizer uses.</div></div></div>
          <div id="plan-explainer"></div>
        </div>
      </section>

      <!-- TAB: Snapshots (Sec-44) -->
      <section class="tab-pane" data-tab="snapshots">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Audience Snapshots</h1>
            <p class="pane-subtitle">Named, dated freezes of a composition (include ∪ intersect ∩ exclude + optional lookalike seed). Diff two snapshots side-by-side to see what changed. Operator-scoped — each API-key owner has their own snapshot namespace.</p>
          </div>
          <div class="activations-controls">
            <button class="btn-secondary" id="snap-refresh">
              <svg class="ico"><use href="#icon-chart"/></svg><span>Refresh</span>
            </button>
          </div>
        </div>
        <div class="lab-grid">
          <div class="lab-panel">
            <div class="lab-panel-title">Save current composition</div>
            <label class="lab-label">Source</label>
            <div style="font-size:11.5px;color:var(--text-mut);padding:6px 0">Pulls from the <strong>Composer › Set Builder</strong> pools. Compose first there, then come back here.</div>
            <label class="lab-label" style="margin-top:8px">Name</label>
            <input id="snap-name" class="lab-input" placeholder="e.g. Q4 auto-intenders v3"/>
            <label class="lab-label" style="margin-top:8px">Note (optional)</label>
            <textarea id="snap-note" class="lab-input" rows="3" placeholder="Why this version?"></textarea>
            <label class="lab-label" style="margin-top:8px">Tags (comma-separated)</label>
            <input id="snap-tags" class="lab-input" placeholder="auto, q4, affluent"/>
            <button class="btn-primary" id="snap-save" style="margin-top:12px;width:100%;justify-content:center">
              <svg class="ico"><use href="#icon-plus"/></svg><span>Save snapshot</span>
            </button>
          </div>
          <div class="lab-panel lab-panel-wide">
            <div class="lab-panel-title">Snapshots <span class="pill pill-muted mono" id="snap-count" style="margin-left:8px">0</span></div>
            <div id="snap-list"><div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading snapshots…</div></div></div>
          </div>
        </div>
        <div class="lab-panel lab-panel-full" style="margin-top:14px">
          <div class="lab-panel-title">Diff</div>
          <div id="snap-diff"><div class="empty-state"><div class="empty-desc">Pick two snapshots from the list (click <strong>diff</strong> on two rows) and the comparison lands here: added / removed / kept per facet, plus delta reach.</div></div></div>
        </div>
      </section>

      <!-- TAB: Freshness (Sec-44) -->
      <section class="tab-pane" data-tab="freshness">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Signal Freshness</h1>
            <p class="pane-subtitle">Per-signal data-quality facets derived at mapper time: decay half-life (in days), volatility index (0-100, coefficient-of-variation based), authority score (0-100, from DTS methodology), and ID stability class (stable / semi-stable / volatile). Sort by any column; the warning list at top surfaces signals with half-life &lt; 7 days.</p>
          </div>
        </div>
        <div id="fresh-warnings"></div>
        <div class="lab-panel lab-panel-full">
          <div class="lab-panel-title">All signals</div>
          <div style="overflow:auto">
            <table class="fresh-table" id="fresh-table">
              <thead>
                <tr>
                  <th data-sort="name">Signal</th>
                  <th data-sort="vertical">Vertical</th>
                  <th data-sort="halflife">Half-life (d)</th>
                  <th data-sort="volatility">Volatility</th>
                  <th data-sort="authority">Authority</th>
                  <th data-sort="stability">ID stability</th>
                  <th data-sort="reach">Reach</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <div id="fresh-explainer"></div>
        </div>
      </section>

      <!-- ── TAB: Federation (Sec-41 Part 3 placeholder) ────────────────── -->
      <section class="tab-pane" data-tab="federation">
        <div class="pane-header">
          <div>
            <div class="pane-title-with-info">
              <h1 class="pane-title">Agent Federation <span class="pill pill-success" style="margin-left:8px;font-size:10px">A2A live</span></h1>
              <button class="lane-info-btn" data-lane-info-toggle="page-federation" title="How this works" aria-label="How federation works"><svg class="ico"><use href="#icon-info"/></svg></button>
              <div class="lane-info-popover" data-lane-info-panel="page-federation" role="dialog">
                <div class="lane-info-title">How federated search works</div>
                <ol class="lane-info-steps">
                  <li><strong>Discover.</strong> Live agent registry pulled from <code>/agents/registry</code> — every signals agent we can reach.</li>
                  <li><strong>Parallel fan-out.</strong> Brief sent simultaneously to every live signals agent's <code>get_signals</code>. Per-agent timeouts + circuit breaker.</li>
                  <li><strong>Merge + tag.</strong> Results merged and each row tagged with <code>source_agent</code>. Sorted by coverage_percentage; agent badges visible inline. Bulk-shortlist + CSV export available.</li>
                </ol>
                <div class="lane-info-trace">Code: <code>handleFederatedSearch</code> → <code>Promise.all(agents.map(callAgentTool))</code></div>
              </div>
            </div>
            <p class="pane-subtitle">Cross-agent search across the AdCP Signals Discovery ecosystem. Live partner: Dstillery. More coming.</p>
          </div>
          <div class="activations-controls">
            <button class="btn-secondary" id="fed-signal-traces" title="View raw get_signals + activate_signal request/response JSON for every federated call">
              <span class="mono">{ }</span><span>Signal traces</span>
            </button>
          </div>
        </div>
        <div class="lab-grid">
          <div class="lab-panel">
            <div class="lab-panel-title">Federated search</div>
            <label class="lab-label">Brief</label>
            <textarea id="fed-brief" class="lab-input" rows="4" placeholder="automotive intenders in-market for EVs"></textarea>
            <div class="canvas-quickpicks" style="margin-top:6px">
              <span class="orch-small" style="margin-right:6px">try:</span>
              <button class="canvas-quickpick" data-brief-target="fed-brief">automotive intenders in-market for EVs</button>
              <button class="canvas-quickpick" data-brief-target="fed-brief">luxury travelers high HHI</button>
              <button class="canvas-quickpick" data-brief-target="fed-brief">premium beauty 25-44</button>
            </div>
            <label class="lab-label" style="margin-top:8px">Max results per agent</label>
            <input id="fed-max" type="number" min="1" max="20" value="5" class="lab-input"/>
            <button class="btn-primary" id="fed-run" style="margin-top:12px;width:100%;justify-content:center">
              <svg class="ico"><use href="#icon-network"/></svg><span>Fan out</span>
            </button>
          </div>
          <div class="lab-panel lab-panel-wide">
            <div class="lab-panel-title">Merged results across agents</div>
            <div id="fed-results"><div class="empty-state"><div class="empty-desc">Enter a brief, hit Fan out. System queries <strong>Evgeny Signals (us)</strong> + <strong>Dstillery</strong> in parallel and merges results with agent badges. Partners added to <code>/agents/registry</code>.</div></div></div>
            <div id="fed-explainer"></div>
          </div>
        </div>
        <div class="lab-panel lab-panel-full" style="margin-top:14px">
          <div class="lab-panel-title">Agent registry</div>
          <div id="fed-registry"><div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading agent registry\u2026</div></div></div>
        </div>
      </section>

      <!-- ── TAB: Orchestrator (Sec-48) ──────────────────────────────────── -->
      <section class="tab-pane" data-tab="orchestrator">
        <div class="pane-header">
          <div>
            <div class="pane-title-with-info">
              <h1 class="pane-title">Multi-Agent Orchestrator <span class="pill pill-accent" style="margin-left:8px;font-size:10px">Sec-48</span></h1>
              <button class="lane-info-btn" data-lane-info-toggle="page-orchestrator" title="How this works" aria-label="How orchestration works"><svg class="ico"><use href="#icon-info"/></svg></button>
              <div class="lane-info-popover" data-lane-info-panel="page-orchestrator" role="dialog">
                <div class="lane-info-title">How multi-agent orchestration works</div>
                <ol class="lane-info-steps">
                  <li><strong>Probe.</strong> Every live agent's <code>tools/list</code> is pulled in parallel; capabilities matrix built from the union of advertised tools.</li>
                  <li><strong>4-stage workflow.</strong> Run sequentially: signals (fan-out across signals agents) → creative (list_creative_formats) → products (filtered by chosen signals + formats) → media buy (synthesize payload, optionally fire).</li>
                  <li><strong>Picks thread between stages.</strong> Top-3 signals from stage 1 become <code>filters.signals</code> for stage 3; top-2 formats from stage 2 become <code>filters.format_ids</code>. Stage 4 returns a dry-run payload preview per buying agent; checkboxes opt agents into a real <code>create_media_buy</code> fire.</li>
                </ol>
                <div class="lane-info-trace">Code: <code>handleAgentsOrchestrate</code> + <code>handleWorkflowRun</code> → <code>runSignalsStage</code> / <code>runCreativeStage</code> / <code>runProductsStage</code> / <code>runMediaBuyStage</code></div>
              </div>
            </div>
            <p class="pane-subtitle">Live view of every AdCP agent we know about. Probe each MCP endpoint in parallel to see who's up, what they expose, and how fast they respond. Fan out a signals brief to all live signals agents with one click, or compare tool surfaces side-by-side.</p>
          </div>
          <div class="activations-controls">
            <button class="btn-secondary" id="orch-signal-traces" title="View raw get_signals + activate_signal request/response JSON for every federated call">
              <span class="mono">{ }</span><span>Signal traces</span>
            </button>
            <button class="btn-secondary" id="orch-refresh">
              <svg class="ico"><use href="#icon-chart"/></svg><span>Probe all</span>
            </button>
          </div>
        </div>
        <div class="orch-summary" id="orch-summary"></div>
        <div class="lab-panel lab-panel-full" style="margin-top:8px">
          <div class="lab-panel-title">Agents <span class="pill pill-muted mono" id="orch-agents-count" style="margin-left:8px">—</span></div>
          <div id="orch-agents"><div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading directory\u2026</div></div></div>
        </div>
        <div class="lab-grid" style="margin-top:14px">
          <div class="lab-panel">
            <div class="lab-panel-title">Fan-out signals brief</div>
            <label class="lab-label">Brief</label>
            <textarea id="orch-brief" class="lab-input" rows="3" placeholder="automotive intenders in-market for EVs"></textarea>
            <div class="canvas-quickpicks" style="margin-top:6px">
              <span class="orch-small" style="margin-right:6px">try:</span>
              <button class="canvas-quickpick" data-brief-target="orch-brief">automotive intenders in-market for EVs</button>
              <button class="canvas-quickpick" data-brief-target="orch-brief">luxury travelers high HHI</button>
              <button class="canvas-quickpick" data-brief-target="orch-brief">premium beauty 25-44</button>
            </div>
            <label class="lab-label" style="margin-top:8px">Max results per agent</label>
            <input id="orch-max" type="number" min="1" max="50" value="10" class="lab-input"/>
            <button class="btn-primary" id="orch-run" style="margin-top:12px;width:100%;justify-content:center">
              <svg class="ico"><use href="#icon-bolt"/></svg><span>Fan out to all signals agents</span>
            </button>
            <div style="font-size:11px;color:var(--text-mut);margin-top:8px">Calls <code>/agents/orchestrate</code> → each signals agent's <code>get_signals</code> in parallel. Results tagged with <code>source_agent</code>.</div>
          </div>
          <div class="lab-panel lab-panel-wide">
            <div class="lab-panel-title">Merged results</div>
            <div id="orch-results"><div class="empty-state"><div class="empty-desc">Enter a brief, hit <strong>Fan out</strong>. Signals come back merged with per-agent latency + source tags.</div></div></div>
          </div>
        </div>
        <!-- ── End-to-end multi-role workflow (Sec-48f) ──────────────── -->
        <div class="lab-panel lab-panel-full" style="margin-top:14px">
          <div class="lab-panel-title">
            End-to-end workflow
            <span class="pill pill-accent mono" style="margin-left:8px;font-size:10px">Sec-48f</span>
            <span style="margin-left:8px;color:var(--text-mut);font-weight:400;font-size:11px">signals \u2192 creative \u2192 products \u2192 media buy</span>
          </div>
          <div class="wf-controls">
            <div class="wf-control-row">
              <label class="lab-label">Brief</label>
              <textarea id="wf-brief" class="lab-input" rows="2" placeholder="luxury travelers in-market for APAC trips"></textarea>
              <div class="canvas-quickpicks" style="margin-top:6px">
                <span class="orch-small" style="margin-right:6px">try:</span>
                <button class="canvas-quickpick" data-brief-target="wf-brief">Coca-Cola Summer Refresh, $250K, 30 days</button>
                <button class="canvas-quickpick" data-brief-target="wf-brief">luxury travelers APAC trips</button>
                <button class="canvas-quickpick" data-brief-target="wf-brief">Nike running shoes launch, ROAS 3.0</button>
              </div>
            </div>
            <div class="wf-control-row wf-activate-row">
              <div class="wf-activate-label">Stage 4 activation <span class="orch-small">(default: dry-run only)</span></div>
              <div class="wf-activate-toggles" id="wf-activate-toggles">
                <label class="wf-toggle"><input type="checkbox" value="adzymic_apx" class="wf-activate-cb"/><span>adzymic_apx</span></label>
                <label class="wf-toggle"><input type="checkbox" value="claire_pub" class="wf-activate-cb"/><span>claire_pub</span></label>
                <label class="wf-toggle"><input type="checkbox" value="swivel" class="wf-activate-cb"/><span>swivel</span></label>
              </div>
            </div>
            <button class="btn-primary" id="wf-run" style="width:100%;justify-content:center;margin-top:6px">
              <svg class="ico"><use href="#icon-bolt"/></svg><span>Run workflow</span>
            </button>
            <div style="font-size:11px;color:var(--text-mut);margin-top:8px">
              Fans out to <strong>2 signals</strong> + <strong>2 creative</strong> + <strong>3 buying</strong> agents via <code>/agents/workflow/run</code>.
              Stage 4 always returns a payload preview per buying agent; checked agents also fire <code>create_media_buy</code> for real.
            </div>
          </div>
          <div id="wf-results" style="margin-top:14px">
            <div class="empty-state"><div class="empty-desc">Run the workflow to see all four stages fan out live. Each stage's per-agent results render below as cards.</div></div>
          </div>
        </div>

        <div class="lab-panel lab-panel-full" style="margin-top:14px">
          <div class="lab-panel-title">Capability matrix <button class="btn-secondary" id="orch-matrix-run" style="margin-left:8px;font-size:11px;padding:4px 10px">Build matrix</button></div>
          <div id="orch-matrix"><div class="empty-state"><div class="empty-desc">Click <strong>Build matrix</strong> to compare every live agent's tool surface side-by-side. Each row is a tool name; columns are agents; cells mark which agents declare that tool.</div></div></div>
        </div>
      </section>

      <!-- ── TAB: Canvas (Orchestration v2 Phase 1) ────────────────────── -->
      <section class="tab-pane" data-tab="canvas">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Brand-Anchored Canvas <span class="pill pill-accent" style="margin-left:8px;font-size:10px">v2 phase 1</span></h1>
            <p class="pane-subtitle">Pick a real brand from the AdCP agentic-advertising registry. The brand's <code>brand.json</code> drives the orchestration: industries fan out to signals, colors+fonts+logos feed creative builds, governance category triggers human review for regulated industries.</p>
          </div>
          <div class="activations-controls">
            <button class="btn-secondary" id="canvas-signal-traces" title="View raw get_signals + activate_signal request/response JSON">
              <span class="mono">{ }</span><span>Signal traces</span>
            </button>
          </div>
        </div>

        <!-- Brand picker -->
        <div class="lab-panel lab-panel-full canvas-picker-panel">
          <div class="lab-panel-title">Brand picker</div>
          <div class="canvas-picker-row">
            <input id="canvas-search" class="lab-input" type="text"
              placeholder="Search by domain or name (coca-cola.com, nike, toyota, ...)"
              autocomplete="off"/>
            <button class="btn-secondary" id="canvas-search-btn">
              <svg class="ico"><use href="#icon-network"/></svg><span>Search</span>
            </button>
          </div>
          <div id="canvas-search-results"></div>
          <div class="canvas-quickpicks">
            <span class="orch-small" style="margin-right:6px">try:</span>
            <button class="canvas-quickpick" data-domain="coca-cola.com">Coca-Cola</button>
            <button class="canvas-quickpick" data-domain="nike.com">Nike</button>
            <button class="canvas-quickpick" data-domain="toyota.com">Toyota</button>
            <button class="canvas-quickpick" data-domain="starbucks.com">Starbucks</button>
            <button class="canvas-quickpick" data-domain="spotify.com">Spotify</button>
            <button class="canvas-quickpick" data-domain="airbnb.com">Airbnb</button>
            <button class="canvas-quickpick" data-domain="chase.com">Chase</button>
            <button class="canvas-quickpick" data-domain="target.com">Target</button>
            <span class="canvas-demo-spacer"></span>
            <button class="canvas-demo-btn" id="canvas-demo-btn" title="One-click canonical demo: resolve Coca-Cola, run workflow, fire dry-run on default trio. Use on stage to skip typing.">
              <svg class="ico" style="width:11px;height:11px"><use href="#icon-bolt"/></svg>
              <span>Run canonical demo</span>
            </button>
          </div>
        </div>

        <!-- Brand card -->
        <div id="canvas-brand-card" class="canvas-brand-card-host">
          <div class="empty-state">
            <div class="empty-desc">Search or pick a brand to render its canonical <code>brand.json</code>. Real registry data — no synthesized values.</div>
          </div>
        </div>

        <!-- Three-lane canvas. Phase 2 routes /agents/workflow/run/stream
             events to per-lane render. Bodies have stable IDs for the JS. -->
        <div id="canvas-lanes" class="canvas-lanes" style="display:none">
          <div class="canvas-lane canvas-lane-audiences" id="canvas-lane-signals">
            <div class="canvas-lane-head">
              <span class="canvas-lane-num mono">1</span>
              <span class="canvas-lane-title">Audiences</span>
              <span class="orch-small">signals fan-out</span>
              <button class="lane-info-btn" data-lane-info-toggle="signals" title="How this works" aria-label="How audiences are selected">
                <svg class="ico"><use href="#icon-info"/></svg>
              </button>
              <div class="lane-info-popover" data-lane-info-panel="signals" role="dialog">
                <div class="lane-info-title">How audiences are selected</div>
                <ol class="lane-info-steps">
                  <li><strong>Brief decomposition.</strong> Brand industries (e.g. <code>food_beverage</code>) + audience descriptors are extracted from the brief and forwarded as <code>signal_spec</code>.</li>
                  <li><strong>Parallel fan-out.</strong> Each signals agent (Evgeny + Dstillery) runs <code>get_signals</code> against its own catalog and returns a ranked list with <code>coverage_percentage</code>.</li>
                  <li><strong>Merge + pick.</strong> Results merged across agents, deduped by <code>signal_agent_segment_id</code>, top-3 picked by coverage. Chosen IDs flow into <code>create_media_buy.targeting_overlay</code>.</li>
                </ol>
                <div class="lane-info-trace">
                  Code: <code>runSignalsStage</code> → <code>callAgentTool(get_signals)</code> → merged in <code>handleWorkflowRun</code>
                </div>
              </div>
            </div>
            <div class="canvas-lane-body" id="canvas-lane-audiences-body">
              <div class="orch-small canvas-lane-placeholder">
                Click <strong>Run workflow with this brand</strong> above.
                Brief is auto-derived from this brand's industries.
              </div>
            </div>
          </div>
          <div class="canvas-lane canvas-lane-inventory" id="canvas-lane-products">
            <div class="canvas-lane-head">
              <span class="canvas-lane-num mono">2</span>
              <span class="canvas-lane-title">Inventory</span>
              <span class="orch-small">products fan-out</span>
              <button class="lane-info-btn" data-lane-info-toggle="products" title="How this works" aria-label="How inventory is picked">
                <svg class="ico"><use href="#icon-info"/></svg>
              </button>
              <div class="lane-info-popover" data-lane-info-panel="products" role="dialog">
                <div class="lane-info-title">How inventory is picked</div>
                <ol class="lane-info-steps">
                  <li><strong>Audience handoff.</strong> The 3 chosen signals + brand industries become the <code>audience_brief</code> sent to each buying agent.</li>
                  <li><strong>Filtered fan-out.</strong> Each agent runs <code>get_products</code> with <code>filters.signals</code> + <code>filters.format_ids</code> (from the Creative lane's pick). Results filtered by brand-rights eligibility.</li>
                  <li><strong>One pick per agent.</strong> Best product per buying agent chosen by lowest CPM floor that meets the viewability target. Selected products attach to <code>packages[]</code> in the create_media_buy payload.</li>
                </ol>
                <div class="lane-info-trace">
                  Code: <code>runProductsStage</code> → <code>callAgentTool(get_products)</code> → adapter in <code>workflowOrchestration.ts</code>
                </div>
              </div>
            </div>
            <div class="canvas-lane-body" id="canvas-lane-inventory-body">
              <div class="orch-small canvas-lane-placeholder">
                <code>get_products</code> across the buying-agent default trio
                (adzymic_apx, claire_scope3, swivel).
              </div>
            </div>
          </div>
          <div class="canvas-lane canvas-lane-creative" id="canvas-lane-creative">
            <div class="canvas-lane-head">
              <span class="canvas-lane-num mono">3</span>
              <span class="canvas-lane-title">Creative</span>
              <span class="orch-small">format catalog</span>
              <button class="lane-info-btn" data-lane-info-toggle="creative" title="How this works" aria-label="How creative formats are chosen">
                <svg class="ico"><use href="#icon-info"/></svg>
              </button>
              <div class="lane-info-popover" data-lane-info-panel="creative" role="dialog">
                <div class="lane-info-title">How creative formats are chosen</div>
                <ol class="lane-info-steps">
                  <li><strong>Intent decomposition.</strong> Brief intent decomposes into channel + size hints — DOOH for retail/CPG, native for editorial brands, display+video for BRAND_LIFT KPIs.</li>
                  <li><strong>Filtered fan-out.</strong> Each creative agent (Advertible, Celtra) runs <code>list_creative_formats</code> with the derived <code>filters</code> (asset_types, size caps, channel).</li>
                  <li><strong>Top-2 by intent match.</strong> Formats merged across agents, top-2 picked by score on size/aspect/responsiveness alignment with the brief. Chosen <code>format_ids</code> feed back into the Inventory lane's <code>get_products</code> filter.</li>
                </ol>
                <div class="lane-info-trace">
                  Code: <code>runCreativeStage</code> → <code>deriveCreativeFilter(brief)</code> → <code>callAgentTool(list_creative_formats)</code>
                </div>
              </div>
            </div>
            <div class="canvas-lane-body" id="canvas-lane-creative-body">
              <div class="orch-small canvas-lane-placeholder">
                <code>list_creative_formats</code> across Advertible + Celtra,
                pre-filtered by brief intent.
              </div>
            </div>
          </div>
        </div>

        <!-- Governance + brand rights — Phase 3: show the AdCP 3.0 GA
             tool surface explicitly so the gap is visible by design.
             Three stacked cards mirror the spec's three task families. -->
        <div id="canvas-bottom" class="canvas-bottom" style="display:none">
          <!-- Phase B: registry health strip. Live counts of registry
               agents vs our hardcoded directory; flags new agents the
               registry has that we don't yet have entries for. -->
          <div class="canvas-registry-bar" id="canvas-registry-bar">
            <span class="canvas-registry-label">Registry sync</span>
            <span class="canvas-registry-stat" id="canvas-registry-agents">
              <span class="orch-small">…</span>
            </span>
            <span class="canvas-registry-stat" id="canvas-registry-policies">
              <span class="orch-small">…</span>
            </span>
            <span class="canvas-registry-stat" id="canvas-registry-brands">
              <span class="orch-small">brands: passthrough</span>
            </span>
            <span class="canvas-registry-stat canvas-registry-stat-href">
              <a class="orch-small" href="https://agenticadvertising.org/registry/" target="_blank" rel="noopener">agenticadvertising.org/registry ↗</a>
            </span>
          </div>
          <div class="canvas-spec-block">
            <div class="canvas-spec-header">
              <span class="canvas-spec-label">Governance + brand rights</span>
              <span class="pill pill-warning mono" style="font-size:10px">AdCP 3.0.1 spec'd · no live impl</span>
            </div>
            <div class="canvas-spec-body">
              <div class="canvas-spec-card">
                <div class="canvas-spec-card-name mono">check_governance</div>
                <div class="canvas-spec-card-shape orch-small">in: <code>{plan, brand: BrandRef}</code> · out: <code>{decision, mode, audit_log_url, requires_human_review?}</code></div>
                <div class="canvas-spec-card-note orch-small">would gate alcohol / pharma / lending / housing for regulated brands. Runs BEFORE create_media_buy.</div>
                <div class="canvas-gov-mode-row" title="enforcement posture surfaced via the mode field on check-governance-response (added in AdCP 3.0.1)">
                  <span class="canvas-gov-mode-label orch-small">mode:</span>
                  <span class="canvas-gov-mode-pill canvas-gov-mode-enforce mono" title="check is active and BLOCKS non-compliant plans">enforce</span>
                  <span class="canvas-gov-mode-pill canvas-gov-mode-advisory mono" title="check returns a recommendation but does NOT block">advisory</span>
                  <span class="canvas-gov-mode-pill canvas-gov-mode-audit mono" title="check is logged for audit only — no decision returned">audit</span>
                </div>
              </div>
              <div class="canvas-spec-card">
                <div class="canvas-spec-card-name mono">get_rights · acquire_rights · update_rights</div>
                <div class="canvas-spec-card-shape orch-small">brand-rights lifecycle: discover → negotiate → modify (extend / restrict / revoke)</div>
                <div class="canvas-spec-card-note orch-small">e.g. asset usage rights for the chosen creatives. None of the live directory agents implement this family.</div>
              </div>
              <div class="canvas-spec-card">
                <div class="canvas-spec-card-name mono">sync_plans · report_plan_outcome · get_plan_audit_logs</div>
                <div class="canvas-spec-card-shape orch-small">signed <code>governance_context</code> JWS tokens for plan approval + auditability</div>
                <div class="canvas-spec-card-note orch-small">RFC 9421 HTTP message signatures + idempotency keys per request.</div>
              </div>
            </div>
          </div>

          <div class="canvas-bottom-row canvas-row-mediabuy" id="canvas-lane-mediabuy-row">
            <div class="canvas-bottom-label">Media buy</div>
            <div class="canvas-bottom-body" id="canvas-row-mediabuy-body">
              <span class="orch-small">click Run above; payload assembled with this brand's BrandRef</span>
            </div>
          </div>

          <!-- MVP #7: measurement lane stub. 5th Canvas stage that closes
               the AdCP 4-domain loop. After media-buy fires, this lane
               surfaces a "Sample delivery" button per vendor that hits
               /agents/workflow/measurement-stub and returns synthetic
               pacing + viewability data. Demonstrates the next-cycle
               feedback shape without requiring a live get_media_buy_delivery
               implementation in any vendor agent. -->
          <div class="canvas-bottom-row canvas-row-measurement" id="canvas-lane-measurement-row" style="display:none">
            <div class="canvas-bottom-label">Measurement <span class="pill pill-muted mono" style="font-size:9px;margin-left:6px">stub · closes 4-stage loop</span></div>
            <div class="canvas-bottom-body" id="canvas-row-measurement-body">
              <span class="orch-small">awaiting media-buy fire…</span>
            </div>
          </div>

          <!-- Closed-loop measurement: SVG arc back to Audiences + spec card -->
          <div class="canvas-spec-block">
            <div class="canvas-spec-header">
              <span class="canvas-spec-label">In-flight + measurement</span>
              <span class="pill pill-warning mono" style="font-size:10px">closed-loop unspec'd · no agent type</span>
            </div>
            <div class="canvas-spec-body">
              <div class="canvas-spec-card">
                <div class="canvas-spec-card-name mono">get_media_buy_delivery</div>
                <div class="canvas-spec-card-shape orch-small">in-flight pacing, viewability, measurement_windows (Live, C3, C7)</div>
                <div class="canvas-spec-card-note orch-small">implemented across all 7 buying agents — partial closed loop on the buy side.</div>
              </div>
              <div class="canvas-spec-card canvas-spec-card-gap">
                <div class="canvas-spec-card-name mono">[no spec'd primitive]</div>
                <div class="canvas-spec-card-shape orch-small">measurement → next-cycle signals query</div>
                <div class="canvas-spec-card-note orch-small">"these signals underperformed; surface adjacent ones next time." DV / IAS / Comscore / Nielsen positioning. <strong>Whole role unspec'd.</strong></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Closed-loop indicator (Phase 4): plain text+icon. The earlier
             SVG arc rendered as broken fragments because preserveAspectRatio
             stretched a 100x100 path across a wide-aspect container.
             Information is the same; visual is now reliable. -->
        <div class="canvas-loop-indicator" id="canvas-loop-arrow" style="display:none">
          <span class="canvas-loop-arrow-glyph">↻</span>
          <span class="canvas-loop-text">
            closed loop — measurement output should feed the next-cycle signals query
          </span>
          <span class="pill pill-warning mono" style="font-size:9.5px">phase 4</span>
        </div>

        <!-- View-mode toggle (Phase 4): canvas / role-pivot / capability graph -->
        <div class="canvas-viewmodes">
          <span class="orch-small" style="color:var(--text-mut);margin-right:8px">view:</span>
          <button class="canvas-viewmode active" data-mode="canvas" title="Brand-anchored canvas (current)">brand canvas</button>
          <button class="canvas-viewmode disabled" data-mode="role" title="Pattern B from proposal #98 — coming soon" disabled>role-pivot</button>
          <button class="canvas-viewmode disabled" data-mode="graph" title="Pattern A from proposal #98 — coming soon" disabled>capability graph</button>
        </div>
      </section>

      <!-- ── TAB: Campaign Canvas (DSP buy-side control loop) ─────────── -->
      <section class="tab-pane" data-tab="campaign">
        <div class="pane-header">
          <div>
            <div class="pane-title-with-info">
              <h1 class="pane-title">Campaign Canvas <span class="pill pill-warning mono" style="font-size:9.5px;margin-left:8px;letter-spacing:0.04em">DSP buy-side · all primitives mocked</span></h1>
              <button class="lane-info-btn" data-lane-info-toggle="page-campaign" title="How this works" aria-label="How campaign canvas works"><svg class="ico"><use href="#icon-info"/></svg></button>
              <div class="lane-info-popover" data-lane-info-panel="page-campaign" role="dialog">
                <div class="lane-info-title">How Campaign Canvas works</div>
                <ol class="lane-info-steps">
                  <li><strong>Buy-side primitives.</strong> Four AdCP buy-side tools are unspec'd in 3.0 GA: <code>submit_bid_strategy</code>, <code>get_bid_opportunities</code>, <code>get_pacing_status</code>, <code>optimize_strategy</code>. Each lane below mocks one — same playbook as governanceMock.</li>
                  <li><strong>Deterministic mock.</strong> Per-campaign data keyed off campaign_id (FNV-1a hash). Bid streams, SSP performance distributions, and pacing classifications are reproducible across reloads.</li>
                  <li><strong>Resilience layer.</strong> Live calls (where they exist) wrapped in a per-URL circuit breaker (open after 3 fails, 60s cooldown, half-open recovery). Wave 4 spend allocator splits budget across vendors via 4 strategies: equal_split / score_weighted / priority_first / cap_then_split.</li>
                </ol>
                <div class="lane-info-trace">Code: <code>dspMock.ts</code> + <code>callAgentToolWithCircuit</code> + <code>allocateSpend</code></div>
              </div>
            </div>
            <p class="pane-subtitle">
              Real-time control loop: bid strategy → bid stream → inventory match → brand-safety filter → delivery + attribution → optimization signals fed BACK into strategy.
              <br/>
              <span style="color:var(--text-mut)">All four buy-side AdCP primitives are unspec'd as of 3.0 GA: <code>submit_bid_strategy</code>, <code>get_bid_opportunities</code>, <code>get_pacing_status</code>, <code>optimize_strategy</code>. Every lane below mocks one of them.</span>
            </p>
          </div>
        </div>

        <!-- Live buy-side coverage strip: probes every live buying agent
             and reports which advertise which buy-side primitives. The
             upper-half lanes (strategy / bid-stream) flag 0/N coverage
             prominently; lower-half lanes (delivery, attribution) show
             the live count + opens-up live data path. -->
        <div class="campaign-coverage" id="campaign-coverage">
          <span class="orch-small" style="color:var(--text-mut);margin-right:8px">live MCP coverage:</span>
          <div class="campaign-coverage-pills" id="campaign-coverage-pills">
            <span class="orch-small">probing buying agents…</span>
          </div>
        </div>

        <!-- Campaign selector + LIVE | DEMO toggle -->
        <div class="campaign-selector" id="campaign-selector">
          <span class="orch-small" style="color:var(--text-mut);margin-right:8px">campaign:</span>
          <div class="campaign-selector-buttons" id="campaign-selector-buttons">
            <span class="orch-small">loading…</span>
          </div>
          <span class="campaign-source-toggle" id="campaign-source-toggle">
            <button class="campaign-source-btn active" data-source="demo">demo (mocked)</button>
            <button class="campaign-source-btn" data-source="live">live (from agents)</button>
          </span>
        </div>

        <!-- Live media-buys panel: appears in "live" mode. Aggregates
             get_media_buys across every capable agent. -->
        <div class="campaign-live-panel" id="campaign-live-panel" style="display:none">
          <div class="campaign-live-head">
            <span class="campaign-live-label">Real campaigns from live agents</span>
            <span class="orch-small" id="campaign-live-meta">…</span>
          </div>
          <div id="campaign-live-list">
            <span class="orch-small">querying get_media_buys across capable agents…</span>
          </div>
        </div>

        <!-- Top: Campaign card with KPI / flighting / budget rate -->
        <div class="campaign-card-host" id="campaign-card-host">
          <div class="empty-state"><div class="empty-title">Select a campaign above</div></div>
        </div>

        <!-- Control-loop grid: 5 lanes + feedback arrow back to top -->
        <div class="campaign-loop" id="campaign-loop" style="display:none">

          <!-- LANE 1: Bid strategy -->
          <div class="campaign-lane campaign-lane-strategy" id="campaign-lane-strategy">
            <div class="campaign-lane-head">
              <span class="campaign-lane-label">1 · Bid strategy</span>
              <span class="pill pill-muted mono" style="font-size:9px">submit_bid_strategy mock</span>
            </div>
            <div class="campaign-lane-body" id="campaign-strategy-body">
              <span class="orch-small">…</span>
            </div>
          </div>

          <!-- LANE 2: Bid stream -->
          <div class="campaign-lane campaign-lane-stream" id="campaign-lane-stream">
            <div class="campaign-lane-head">
              <span class="campaign-lane-label">2 · Bid stream (last 60 min)</span>
              <span class="pill pill-muted mono" style="font-size:9px">get_bid_opportunities mock</span>
            </div>
            <div class="campaign-lane-body" id="campaign-stream-body">
              <span class="orch-small">…</span>
            </div>
          </div>

          <!-- LANE 3: Inventory match (per-SSP) + Brand safety -->
          <div class="campaign-lane campaign-lane-inventory" id="campaign-lane-inventory">
            <div class="campaign-lane-head">
              <span class="campaign-lane-label">3 · Inventory match · Brand safety</span>
              <span class="pill pill-muted mono" style="font-size:9px">per-SSP performance · pre-bid filter</span>
            </div>
            <div class="campaign-lane-body campaign-lane-2col" id="campaign-inventory-body">
              <div id="campaign-inventory-ssp"><span class="orch-small">…</span></div>
              <div id="campaign-inventory-safety"><span class="orch-small">…</span></div>
            </div>
          </div>

          <!-- LANE 4: Delivery (pacing curve) -->
          <div class="campaign-lane campaign-lane-delivery" id="campaign-lane-delivery">
            <div class="campaign-lane-head">
              <span class="campaign-lane-label">4 · Delivery · Pacing</span>
              <span class="pill pill-muted mono" style="font-size:9px">get_pacing_status mock</span>
            </div>
            <div class="campaign-lane-body" id="campaign-delivery-body">
              <span class="orch-small">…</span>
            </div>
          </div>

          <!-- LANE 5: Attribution + optimization (the feedback loop) -->
          <div class="campaign-lane campaign-lane-attribution" id="campaign-lane-attribution">
            <div class="campaign-lane-head">
              <span class="campaign-lane-label">5 · Attribution · Optimization signals</span>
              <span class="pill pill-muted mono" style="font-size:9px">optimize_strategy mock</span>
            </div>
            <div class="campaign-lane-body" id="campaign-attribution-body">
              <span class="orch-small">…</span>
            </div>
          </div>

          <!-- Closed-loop feedback arrow: signals feed BACK into strategy -->
          <div class="campaign-feedback-arrow" id="campaign-feedback-arrow">
            <svg class="ico" style="width:14px;height:14px"><use href="#icon-loop"/></svg>
            <span>feedback loop — optimization signals re-tune the bid strategy each cycle</span>
            <span class="campaign-feedback-arrow-tag mono">↻ continuous</span>
          </div>
        </div>
      </section>

      <!-- ── TAB: Agentic Canvas ─────────────────────────────────────── -->
      <section class="tab-pane" data-tab="agentic">
        <div class="pane-header">
          <div>
            <div class="pane-title-with-info">
              <h1 class="pane-title">Agentic Canvas <span class="pill pill-warning mono" style="font-size:9.5px;margin-left:8px;letter-spacing:0.04em" id="agentic-mode-pill">probing mode…</span></h1>
              <button class="lane-info-btn" data-lane-info-toggle="page-agentic" title="How this works" aria-label="How agentic canvas works"><svg class="ico"><use href="#icon-info"/></svg></button>
              <div class="lane-info-popover" data-lane-info-panel="page-agentic" role="dialog">
                <div class="lane-info-title">How the agentic planner works</div>
                <ol class="lane-info-steps">
                  <li><strong>Brief expansion.</strong> Live mode → Claude Sonnet decomposes a one-line brief into structured fields (industries, KPI, geo, flight). Template fallback uses regex + 30-brand registry. Both produce the same shape.</li>
                  <li><strong>Tool planning.</strong> Planner picks an ordered sequence (signals → creative → products → governance → media-buy), filtered by which agents actually advertise each tool. Live mode → Claude chooses; template → 5-stage default.</li>
                  <li><strong>Streaming execution + Wave 3 tools.</strong> NDJSON-streamed reasoning trace + per-step results. Args sanitized (#149: allowlist + required-arg backfill) before fan-out. Refine, self-critique, and correction memory let the operator iterate without restarting from scratch.</li>
                </ol>
                <div class="lane-info-trace">Code: <code>expandBrief</code> → <code>planExecution</code> → <code>handleAgenticExecute</code> + <code>sanitizeArgsForVendor</code></div>
              </div>
            </div>
            <p class="pane-subtitle">
              Type a brief in plain English. The agent expands it, plans the call sequence dynamically, executes against live MCP agents, and narrates every decision.
              <br/>
              <span style="color:var(--text-mut)">Live mode requires <code>ANTHROPIC_API_KEY</code>; otherwise rule-based templates produce the same surface deterministically.</span>
            </p>
          </div>
        </div>

        <div class="agentic-shell">
          <div class="agentic-chat-col">
            <div class="agentic-chat-input-row">
              <textarea class="agentic-input" id="agentic-input" rows="2" placeholder='e.g. "Plan a $50K Coca-Cola summer campaign for Gen Z urban — ROAS 3.5x"'></textarea>
              <button class="agentic-submit-btn" id="agentic-submit-btn">
                <svg class="ico"><use href="#icon-bolt"/></svg>
                <span>Plan</span>
              </button>
            </div>
            <div class="agentic-suggestions" id="agentic-suggestions">
              <span class="orch-small" style="color:var(--text-mut);margin-right:6px">try:</span>
              <button class="agentic-sugg" data-prompt='Plan a $50K Coca-Cola summer campaign for Gen Z urban — ROAS 3.5x'>Coca-Cola summer · Gen Z</button>
              <button class="agentic-sugg" data-prompt='Pfizer healthcare brand-lift study, US adults 35+, $80K budget, 30 days'>Pfizer · brand-lift</button>
              <button class="agentic-sugg" data-prompt='Heineken USA — alcohol, urban DMAs, evening peak, ROAS focus, $200K'>Heineken · alcohol</button>
              <button class="agentic-sugg" data-prompt='LEGO holiday awareness — children, parents, US + EU, $1M, awareness'>LEGO · children</button>
            </div>

            <!-- Brief expansion panel -->
            <div class="agentic-section" id="agentic-brief-section" style="display:none">
              <div class="agentic-section-head">
                <span class="agentic-section-label">1 · Brief expanded</span>
                <span class="agentic-section-source mono" id="agentic-brief-source">…</span>
              </div>
              <div class="agentic-section-body" id="agentic-brief-body"></div>
            </div>

            <!-- Plan panel -->
            <div class="agentic-section" id="agentic-plan-section" style="display:none">
              <div class="agentic-section-head">
                <span class="agentic-section-label">2 · Execution plan</span>
                <span class="agentic-section-source mono" id="agentic-plan-source">…</span>
              </div>
              <div class="agentic-section-body" id="agentic-plan-body"></div>
              <div class="agentic-plan-actions">
                <button class="agentic-execute-btn" id="agentic-execute-btn">
                  <svg class="ico"><use href="#icon-bolt"/></svg>
                  <span>Execute plan</span>
                </button>
                <button class="agentic-critique-btn" id="agentic-critique-btn" title="Self-critique: agent reviews its own plan for missing steps, risky assumptions, compliance gaps before fire">
                  <span>🔍 Self-critique</span>
                </button>
                <span class="orch-small" style="color:var(--text-mut)">streams reasoning + tool results live</span>
              </div>
              <!-- Wave 3: critique result panel -->
              <div class="agentic-critique-result" id="agentic-critique-result"></div>
              <!-- Wave 3: multi-turn refinement input -->
              <div class="agentic-refine-row">
                <input type="text" class="agentic-refine-input" id="agentic-refine-input"
                  placeholder='Refine: "exclude alcohol", "shorten flight to 14 days", "skip Adzymic"…'
                  maxlength="500" />
                <button class="agentic-refine-btn" id="agentic-refine-btn">
                  <span>↻ Refine</span>
                </button>
              </div>
              <div class="agentic-refine-result" id="agentic-refine-result"></div>
            </div>

            <!-- Execution panel -->
            <div class="agentic-section" id="agentic-exec-section" style="display:none">
              <div class="agentic-section-head">
                <span class="agentic-section-label">3 · Execution</span>
                <span class="agentic-section-source mono" id="agentic-exec-status">idle</span>
              </div>
              <div class="agentic-section-body" id="agentic-exec-body"></div>
            </div>

            <!-- Compliance + memory + recovery sidebar -->
            <div class="agentic-section" id="agentic-compliance-section" style="display:none">
              <div class="agentic-section-head">
                <span class="agentic-section-label">Governance + remediation</span>
              </div>
              <div class="agentic-section-body" id="agentic-compliance-body"></div>
            </div>

            <div class="agentic-section" id="agentic-memory-section" style="display:none">
              <div class="agentic-section-head">
                <span class="agentic-section-label">Memory</span>
              </div>
              <div class="agentic-section-body" id="agentic-memory-body"></div>
            </div>
          </div>

          <!-- Right: reasoning trace pane -->
          <div class="agentic-trace-col">
            <div class="agentic-section-head">
              <span class="agentic-section-label">Reasoning trace</span>
              <span class="agentic-section-source mono" id="agentic-trace-count">0 steps</span>
            </div>
            <div class="agentic-trace" id="agentic-trace">
              <span class="orch-small" style="color:var(--text-mut)">decisions will narrate here as the agent works…</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ── TAB: Capabilities ──────────────────────────────────────────── -->
      <section class="tab-pane" data-tab="capabilities">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Agent capabilities</h1>
            <p class="pane-subtitle">Structured view of <code>GET /capabilities</code> — what this agent declares to buyer agents at handshake.</p>
          </div>
          <div class="activations-controls">
            <button class="btn-secondary" id="caps-refresh">
              <svg class="ico"><use href="#icon-info"/></svg>
              <span>Refresh</span>
            </button>
            <button class="btn-secondary" id="caps-copy">
              <svg class="ico"><use href="#icon-check"/></svg>
              <span>Copy JSON</span>
            </button>
            <a class="btn-secondary" href="/capabilities" target="_blank" rel="noopener" id="caps-open">
              <svg class="ico"><use href="#icon-arrow-right"/></svg>
              <span>Open /capabilities</span>
            </a>
            <a class="btn-secondary" href="/openapi.json" target="_blank" rel="noopener" id="caps-openapi">
              <svg class="ico"><use href="#icon-book"/></svg>
              <span>OpenAPI 3.1</span>
            </a>
          </div>
        </div>

        <div id="caps-html">
          <div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading capabilities…</div></div>
        </div>
      </section>

      <!-- ── TAB: Dev kit (Sec-38 B7 — C5 sandbox keys + C7 SDK snippets) ── -->
      <section class="tab-pane" data-tab="devkit">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Dev kit</h1>
            <p class="pane-subtitle">Everything a buyer-agent engineer needs to integrate. Sandbox API key, SDK snippets in TypeScript / Python / Go / curl, and the full endpoint reference.</p>
          </div>
        </div>
        <div class="devkit-grid">
          <div class="devkit-panel">
            <div class="devkit-panel-title">Sandbox API key</div>
            <div class="devkit-key-shell">
              <code id="devkit-key" class="devkit-key">—</code>
              <button class="btn-secondary" id="devkit-key-reveal" style="padding:4px 12px;font-size:12px">Reveal</button>
              <button class="btn-secondary" id="devkit-key-copy" style="padding:4px 12px;font-size:12px">Copy</button>
            </div>
            <div style="font-size:11px;color:var(--text-mut);margin-top:8px">Public demo key — read-only on catalog, write-once on /mcp activate_signal. Rate-limited at 60 req/min/IP. Rotate via Cloudflare Worker secret (DEMO_API_KEY).</div>
          </div>
          <div class="devkit-panel devkit-panel-wide">
            <div class="devkit-panel-title">SDK snippets — <code>get_signals</code> with brief</div>
            <div class="devkit-tabs">
              <button class="devkit-tab active" data-lang="typescript">TypeScript</button>
              <button class="devkit-tab" data-lang="python">Python</button>
              <button class="devkit-tab" data-lang="go">Go</button>
              <button class="devkit-tab" data-lang="curl">curl</button>
            </div>
            <pre class="devkit-code" id="devkit-code"></pre>
            <div class="devkit-actions">
              <button class="btn-secondary" id="devkit-copy-code" style="padding:4px 12px;font-size:12px">Copy snippet</button>
            </div>
          </div>
          <div class="devkit-panel devkit-panel-wide">
            <div class="devkit-panel-title">Endpoints</div>
            <div class="devkit-endpoints">
              <div class="ep-row"><span class="ep-method">POST</span><code>/mcp</code><span class="ep-note">JSON-RPC 2.0 · 8 tools · bearer auth</span></div>
              <div class="ep-row"><span class="ep-method">GET</span><code>/capabilities</code><span class="ep-note">AdCP 3.0 GA capabilities handshake · public</span></div>
              <div class="ep-row"><span class="ep-method">GET</span><code>/signals/search</code><span class="ep-note">Catalog search with filters · bearer</span></div>
              <div class="ep-row"><span class="ep-method">POST</span><code>/signals/estimate</code><span class="ep-note">Rule-based audience sizing · public</span></div>
              <div class="ep-row"><span class="ep-method">POST</span><code>/signals/overlap</code><span class="ep-note">Multi-signal Jaccard overlap · public</span></div>
              <div class="ep-row"><span class="ep-method">GET</span><code>/signals/{id}/embedding</code><span class="ep-note">512-d UCP vector · public</span></div>
              <div class="ep-row"><span class="ep-method">GET</span><code>/ucp/concepts</code><span class="ep-note">Concept registry · public</span></div>
              <div class="ep-row"><span class="ep-method">GET</span><code>/ucp/gts</code><span class="ep-note">GTS anchors · public</span></div>
              <div class="ep-row"><span class="ep-method">GET</span><code>/ucp/projection</code><span class="ep-note">2D JL projection of embedding space · public</span></div>
              <div class="ep-row"><span class="ep-method">GET</span><code>/ucp/similarity?n=20</code><span class="ep-note">Pairwise cosine matrix · public</span></div>
              <div class="ep-row"><span class="ep-method">GET</span><code>/openapi.json</code><span class="ep-note">Full OpenAPI 3.1 spec · public</span></div>
              <div class="ep-row"><span class="ep-method">GET</span><code>/mcp/recent</code><span class="ep-note">Recent MCP tool calls (7-day retention) · public</span></div>
              <div class="ep-row"><span class="ep-method">GET</span><code>/privacy</code><span class="ep-note">Provider privacy policy (DTS-referenced) · public</span></div>
              <div class="ep-row"><span class="ep-method">GET</span><code>/.well-known/oauth-protected-resource/mcp</code><span class="ep-note">RFC 9728 metadata · public</span></div>
              <div class="ep-row"><span class="ep-method">GET</span><code>/.well-known/oauth-authorization-server</code><span class="ep-note">RFC 8414 metadata · public</span></div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── TAB: Tool Log (agent observability) ────────────────────────── -->
      <section class="tab-pane" data-tab="toollog">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">MCP tool log</h1>
            <p class="pane-subtitle">
              Live view of recent <code>tools/call</code> invocations against this agent.
              Ring buffer scoped to this Worker isolate — no arg values recorded, only keys (see
              <a href="/privacy">privacy</a>). Polls every 5s while visible.
            </p>
          </div>
          <div class="activations-controls">
            <select id="toollog-filter" class="builder-input" style="font-size:12px;padding:6px 10px;width:auto">
              <option value="">All tools</option>
              <option value="get_adcp_capabilities">get_adcp_capabilities</option>
              <option value="get_signals">get_signals</option>
              <option value="activate_signal">activate_signal</option>
              <option value="get_operation_status">get_operation_status</option>
              <option value="get_similar_signals">get_similar_signals</option>
              <option value="query_signals_nl">query_signals_nl</option>
              <option value="get_concept">get_concept</option>
              <option value="search_concepts">search_concepts</option>
            </select>
            <button class="btn-secondary" id="toollog-pause">
              <svg class="ico"><use href="#icon-info"/></svg>
              <span id="toollog-pause-label">Pause</span>
            </button>
            <button class="btn-secondary" id="toollog-refresh">
              <svg class="ico"><use href="#icon-activations"/></svg>
              <span>Refresh</span>
            </button>
            <button class="btn-secondary" id="toollog-export">
              <svg class="ico"><use href="#icon-book"/></svg>
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div class="table-shell">
          <table class="data-table" id="toollog-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Tool</th>
                <th>Args</th>
                <th class="numeric">Latency</th>
                <th class="numeric">Resp</th>
                <th>Caller</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="toollog-tbody">
              <tr><td colspan="7" class="table-empty"><span class="spinner"></span> fetching /mcp/recent…</td></tr>
            </tbody>
          </table>
        </div>
        <div class="table-footer">
          <span id="toollog-note" style="color:var(--text-mut);font-family:var(--font-mono);font-size:11.5px">—</span>
        </div>
      </section>

      <!-- ── TAB: Activations ───────────────────────────────────────────── -->
      <section class="tab-pane" data-tab="activations">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Recent activations</h1>
            <p class="pane-subtitle">All activation jobs written to D1. Polls every 10s while this tab is visible so in-flight statuses auto-update.</p>
          </div>
          <div class="activations-controls">
            <button class="btn-secondary" id="refresh-activations">
              <svg class="ico"><use href="#icon-activations"/></svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div class="table-shell">
          <table class="data-table" id="activations-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Completed</th>
                <th>Webhook</th>
                <th>Operation ID</th>
                <th>Trace</th>
              </tr>
            </thead>
            <tbody id="activations-tbody">
              <tr><td colspan="8" class="table-empty"><span class="spinner"></span> loading activations…</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── TAB: Destinations (Sec-39) ─────────────────────────────────── -->
      <section class="tab-pane" data-tab="destinations">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Destinations</h1>
            <p class="pane-subtitle">Every downstream platform this agent can push audiences into. Each card shows the integration stage, auth + ID flow, activation pattern, SLA, and typical use cases. Sourced live from <code>/capabilities</code>.</p>
          </div>
          <div class="activations-controls">
            <button class="btn-secondary" id="dest-refresh">
              <svg class="ico"><use href="#icon-arrow-right"/></svg><span>Refresh</span>
            </button>
            <a class="btn-secondary" href="/capabilities" target="_blank" rel="noopener">
              <svg class="ico"><use href="#icon-info"/></svg><span>Raw JSON</span>
            </a>
          </div>
        </div>
        <div class="dest-summary" id="dest-summary"></div>
        <div class="dest-grid" id="dest-grid">
          <div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading destinations\u2026</div></div>
        </div>
      </section>

    </div>
  </main>

  <!-- ── Detail side panel (slides in from right) ──────────────────────── -->
  <!-- Sec-39: three-mode sizing (narrow / wide / full) + side rail nav -->
  <!-- + collapsible sections. Start in narrow; the f key or expand btn -->
  <aside class="detail-panel" id="detail-panel" aria-hidden="true" data-mode="narrow">
    <div class="detail-header">
      <div class="detail-header-left">
        <span class="detail-type-badge" id="detail-type">—</span>
        <h2 class="detail-title" id="detail-name">—</h2>
      </div>
      <div class="detail-header-actions">
        <button class="detail-icon-btn" id="detail-expand" aria-label="Expand panel" title="Expand (f)">
          <svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 8V3H8 M17 8V3H12 M3 12V17H8 M17 12V17H12"/>
          </svg>
        </button>
        <button class="detail-icon-btn" id="detail-collapse-all" aria-label="Collapse all sections" title="Collapse all sections">
          <svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 8L10 3L15 8 M5 12L10 17L15 12"/>
          </svg>
        </button>
        <button class="detail-icon-btn" id="detail-close" aria-label="Close panel">
          <svg class="ico"><use href="#icon-close"/></svg>
        </button>
      </div>
    </div>

    <div class="detail-panel-body">
      <!-- Side rail nav \u2014 only visible in full mode -->
      <nav class="detail-rail" id="detail-rail" aria-label="Section navigation">
        <div class="detail-rail-label">On this signal</div>
        <div class="detail-rail-list" id="detail-rail-list"></div>
      </nav>

      <div class="detail-body" id="detail-body">
        <!-- populated on open -->
      </div>
    </div>

    <div class="detail-footer" id="detail-footer">
      <!-- activate button populated on open -->
    </div>
  </aside>

  <div class="backdrop" id="backdrop"></div>

  <!-- MCP inspector drawer (Sec-37 B7) -->
  <aside class="mcp-drawer" id="mcp-drawer" aria-hidden="true">
    <div class="mcp-drawer-header">
      <span class="mcp-drawer-title" id="mcp-drawer-title">MCP exchange</span>
      <button class="detail-close" id="mcp-drawer-close" aria-label="Close">
        <svg class="ico"><use href="#icon-close"/></svg>
      </button>
    </div>
    <div class="mcp-drawer-body" id="mcp-drawer-body"></div>
    <div class="mcp-drawer-footer">
      <button class="btn-primary" id="mcp-drawer-run">
        <svg class="ico"><use href="#icon-bolt"/></svg>
        <span>Run live</span>
      </button>
    </div>
  </aside>

</div>

<div id="toast" class="toast"></div>

<!-- Trace panel: slide-in detail view for any traced operation.
     Content filled by JS from the latest _trace field on any traced
     response. Universal schema, so new surfaces are drop-in. -->
<button class="trace-trigger" id="trace-trigger" type="button" aria-label="Open trace inspector" title="Open trace (last operation)">
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
    <path d="M3 10 L8 10 L9.5 6 L10.5 14 L12 10 L17 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <span class="trace-trigger-label">Trace</span>
  <span class="trace-trigger-badge" id="trace-trigger-badge" hidden>1</span>
</button>

<div class="trace-backdrop" id="trace-backdrop" aria-hidden="true"></div>

<aside class="trace-panel" id="trace-panel" role="dialog" aria-label="Trace inspector" aria-hidden="true">
  <div class="trace-head">
    <div class="trace-head-eyebrow" id="trace-eyebrow">trace inspector</div>
    <div class="trace-head-row">
      <h2 class="trace-title" id="trace-operation">No trace yet</h2>
      <button class="trace-close" id="trace-close" type="button" aria-label="Close trace panel">×</button>
    </div>
    <div class="trace-input mono" id="trace-input"></div>
    <div class="trace-meta">
      <span class="trace-meta-pill mono"><span class="trace-meta-k">duration</span><span class="trace-meta-v" id="trace-duration">—</span></span>
      <span class="trace-meta-pill mono"><span class="trace-meta-k">steps</span><span class="trace-meta-v" id="trace-step-count">—</span></span>
      <span class="trace-meta-pill mono"><span class="trace-meta-k">at</span><span class="trace-meta-v" id="trace-ts">—</span></span>
    </div>
  </div>
  <div class="trace-tabs" role="tablist">
    <button class="trace-tab is-active" data-trace-tab="overview" role="tab" aria-selected="true">Overview</button>
    <button class="trace-tab" data-trace-tab="json" role="tab">JSON</button>
    <span class="trace-tab-indicator" id="trace-tab-indicator"></span>
  </div>
  <div class="trace-body">
    <section class="trace-tab-pane is-active" data-trace-pane="overview">
      <div class="trace-perf" id="trace-perf"></div>
      <!-- Sec-31u T1#5: timeline scrubber. Proportional bar across the
           steps; click a segment to jump to that step. Wired in
           fragments/trace-inspector.ts. Empty until first trace lands. -->
      <div class="trace-timeline-scrubber" id="trace-timeline-scrubber"></div>
      <div class="trace-steps" id="trace-steps"></div>
    </section>
    <section class="trace-tab-pane" data-trace-pane="json">
      <button class="trace-copy-btn" id="trace-copy-json" type="button">Copy JSON</button>
      <pre class="trace-json mono" id="trace-json"></pre>
    </section>
  </div>
</aside>

<!-- Keyboard shortcuts cheat-sheet (Sec-38 A7). Opened via \`?\`. -->
<div id="kbd-overlay" class="kbd-overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
  <div class="kbd-card">
    <h3>Keyboard shortcuts</h3>

    <div class="kbd-section-title">Signals</div>
    <div class="kbd-row"><span>Open Discover</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">d</span></span></div>
    <div class="kbd-row"><span>Open Catalog</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">c</span></span></div>
    <div class="kbd-row"><span>Open Concepts</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">y</span></span></div>

    <div class="kbd-section-title">Analytics</div>
    <div class="kbd-row"><span>Open Treemap</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">t</span></span></div>
    <div class="kbd-row"><span>Open Overlap</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">o</span></span></div>
    <div class="kbd-row"><span>Open Embedding</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">e</span></span></div>
    <div class="kbd-row"><span>Open Embedding Lab</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">x</span></span></div>
    <div class="kbd-row"><span>Open Seasonality</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">s</span></span></div>
    <div class="kbd-row"><span>Open Freshness</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">w</span></span></div>

    <div class="kbd-section-title">Audience Composition</div>
    <div class="kbd-row"><span>Open Builder</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">b</span></span></div>
    <div class="kbd-row"><span>Open Composer</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">m</span></span></div>
    <div class="kbd-row"><span>Open Expression</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">r</span></span></div>
    <div class="kbd-row"><span>Open Journey</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">j</span></span></div>
    <div class="kbd-row"><span>Open Portfolio</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">p</span></span></div>
    <div class="kbd-row"><span>Open Scenario (Planner)</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">q</span></span></div>
    <div class="kbd-row"><span>Open Snapshots</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">h</span></span></div>

    <div class="kbd-section-title">Workshop Canvases</div>
    <div class="kbd-row"><span>Open Brand Canvas</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">1</span></span></div>
    <div class="kbd-row"><span>Open Campaign Canvas</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">2</span></span></div>
    <div class="kbd-row"><span>Open Agentic Canvas</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">3</span></span></div>

    <div class="kbd-section-title">Multi-Agent</div>
    <div class="kbd-row"><span>Open Federation</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">f</span></span></div>
    <div class="kbd-row"><span>Open Orchestrator</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">u</span></span></div>

    <div class="kbd-section-title">Activations</div>
    <div class="kbd-row"><span>Open Activations</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">a</span></span></div>
    <div class="kbd-row"><span>Open Destinations</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">n</span></span></div>

    <div class="kbd-section-title">Reference</div>
    <div class="kbd-row"><span>Open Capabilities</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">k</span></span></div>
    <div class="kbd-row"><span>Open Dev kit</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">v</span></span></div>
    <div class="kbd-row"><span>Open Tool Log</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">l</span></span></div>

    <div class="kbd-section-title">Detail panel & UI</div>
    <div class="kbd-row"><span>Toggle sidebar</span><span class="kbd-keys"><span class="kbd-key">Ctrl/Cmd</span><span class="kbd-key">B</span></span></div>
    <div class="kbd-row"><span>Expand / collapse detail panel</span><span class="kbd-keys"><span class="kbd-key">f</span></span></div>
    <div class="kbd-row"><span>Close detail panel / overlay</span><span class="kbd-keys"><span class="kbd-key">Esc</span></span></div>
    <div class="kbd-row"><span>Toggle this sheet</span><span class="kbd-keys"><span class="kbd-key">?</span></span></div>
  </div>
</div>

${SCRIPT_TAG(safeKey)}
</body>
</html>`;
}
