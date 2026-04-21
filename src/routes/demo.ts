// src/routes/demo.ts
// Sec-31: DSP-style interactive demo UI served at `/`.
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
// Auth uses DEMO_API_KEY (public by design). Same-origin fetches to
// /mcp and /capabilities; CORS is a non-issue on this host.

export function handleDemo(env: { DEMO_API_KEY: string }): Response {
  return new Response(renderHtml(env.DEMO_API_KEY), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "script-src 'self' 'unsafe-inline'; img-src 'self' data:;",
    },
  });
}

function renderHtml(demoKey: string): string {
  const safeKey = JSON.stringify(demoKey);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>adcp·signals — Signals Marketplace</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='2' fill='%234f8eff'/%3E%3Ccircle cx='8' cy='8' r='5' fill='none' stroke='%234f8eff' stroke-width='0.8' opacity='0.6'/%3E%3Ccircle cx='8' cy='8' r='7.5' fill='none' stroke='%234f8eff' stroke-width='0.5' opacity='0.3'/%3E%3C/svg%3E"/>
${STYLES}
</head>
<body>

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
  </defs>
</svg>

<div class="app">

  <!-- ── Sidebar ─────────────────────────────────────────────────────────── -->
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-mark"><svg class="ico"><use href="#icon-radar"/></svg></div>
      <div class="brand-text">
        <div class="brand-title">adcp<span class="dot">·</span>signals</div>
        <div class="brand-sub">marketplace agent</div>
      </div>
    </div>

    <nav class="sidebar-nav">
      <div class="nav-group-label">Workspace</div>
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

      <div class="nav-group-label">Reference</div>
      <a class="nav-item" href="/capabilities" target="_blank" rel="noopener">
        <svg class="ico"><use href="#icon-info"/></svg><span>Capabilities</span>
      </a>
      <a class="nav-item" href="https://github.com/EvgenyAndroid/adcp-signals-adaptor" target="_blank" rel="noopener">
        <svg class="ico"><use href="#icon-book"/></svg><span>GitHub</span>
      </a>
      <a class="nav-item" href="https://adcontextprotocol.org" target="_blank" rel="noopener">
        <svg class="ico"><use href="#icon-bolt"/></svg><span>AdCP spec</span>
      </a>
    </nav>

    <div class="sidebar-footer">
      <div class="kv"><span class="k">Version</span><span class="v mono">3.0-rc</span></div>
      <div class="kv"><span class="k">Client</span><span class="v mono">@adcp/5.6</span></div>
      <div class="kv"><span class="k">Status</span><span class="v"><span class="status-dot ok"></span>live</span></div>
      <div class="kv"><span class="k">Conformance</span><span class="v"><span class="pill pill-success">3 / 3</span></span></div>
    </div>
  </aside>

  <!-- ── Main ────────────────────────────────────────────────────────────── -->
  <main class="main">

    <header class="topbar">
      <div class="crumbs">
        <span class="crumb muted">adcp·signals</span>
        <span class="crumb-sep">/</span>
        <span class="crumb" id="crumb-current">Discover</span>
      </div>
      <div class="topbar-meta">
        <span class="pill pill-muted mono">Sandbox</span>
        <span class="pill pill-muted mono" id="topbar-version">...</span>
      </div>
    </header>

    <div class="workspace">

      <!-- ── TAB: Discover ──────────────────────────────────────────────── -->
      <section class="tab-pane active" data-tab="discover">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Brief-driven discovery</h1>
            <p class="pane-subtitle">Describe an audience in natural language. Catalog matches and AI-generated custom proposals return inline, activatable.</p>
          </div>
        </div>

        <div class="discover-hero">
          <div class="brief-input-shell">
            <textarea id="brief" rows="3" placeholder="e.g. affluent families 35-44 in top-10 DMAs interested in luxury travel"></textarea>
            <div class="brief-actions">
              <div class="brief-hints">
                <span class="hint-label">Try</span>
                <button class="hint" data-brief="luxury automotive intenders 45+ in top DMAs">luxury auto intenders</button>
                <button class="hint" data-brief="new parents in the last 12 months">new parents 0-12mo</button>
                <button class="hint" data-brief="cord-cutters 25-44 with high streaming affinity">cord-cutters 25-44</button>
                <button class="hint" data-brief="B2B IT decision makers at mid-market companies">IT decision makers</button>
                <button class="hint" data-brief="health conscious affluent millennials in urban metros">health-conscious urban</button>
              </div>
              <button class="btn-primary" id="discover-btn">
                <svg class="ico"><use href="#icon-radar"/></svg>
                <span>Find signals</span>
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
            <p class="pane-subtitle">Full marketplace inventory — 15 verticals, across the dimensions a DSP buyer thinks in.</p>
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
            <h1 class="pane-title">UCP concept registry</h1>
            <p class="pane-subtitle">Cross-taxonomy audience concepts. Each concept carries semantic mappings to IAB, LiveRamp, TradeDesk, and internal taxonomies.</p>
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

    </div>
  </main>

  <!-- ── Detail side panel (slides in from right) ──────────────────────── -->
  <aside class="detail-panel" id="detail-panel" aria-hidden="true">
    <div class="detail-header">
      <div class="detail-header-left">
        <span class="detail-type-badge" id="detail-type">—</span>
        <h2 class="detail-title" id="detail-name">—</h2>
      </div>
      <button class="detail-close" id="detail-close" aria-label="Close panel">
        <svg class="ico"><use href="#icon-close"/></svg>
      </button>
    </div>

    <div class="detail-body" id="detail-body">
      <!-- populated on open -->
    </div>

    <div class="detail-footer" id="detail-footer">
      <!-- activate button populated on open -->
    </div>
  </aside>

  <div class="backdrop" id="backdrop"></div>

</div>

<div id="toast" class="toast"></div>

${SCRIPT_TAG(safeKey)}
</body>
</html>`;
}

// Extracted for readability — the <style> block.
const STYLES = `<style>
:root {
  /* Surfaces */
  --bg-base:    #0b1017;
  --bg-sidebar: #0d1320;
  --bg-top:     #0d1320;
  --bg-surface: #121a28;
  --bg-raised:  #1a2230;
  --bg-input:   #0b1220;
  --bg-hover:   #182132;

  /* Borders */
  --border:         #1c2636;
  --border-strong:  #2a3547;
  --border-focus:   #3b5a87;

  /* Text */
  --text:     #e6edf3;
  --text-dim: #8b98a9;
  --text-mut: #5d6b7e;
  --text-dis: #3d4658;

  /* Accents */
  --accent:      #4f8eff;
  --accent-hot:  #6fa4ff;
  --accent-dim:  rgba(79, 142, 255, 0.12);
  --accent-border: rgba(79, 142, 255, 0.3);

  --success:     #10b981;
  --success-dim: rgba(16, 185, 129, 0.12);
  --warning:     #f59e0b;
  --warning-dim: rgba(245, 158, 11, 0.12);
  --error:       #ef4444;
  --error-dim:   rgba(239, 68, 68, 0.12);
  --violet:      #8b5cf6;
  --cyan:        #06b6d4;

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;

  --sidebar-w: 232px;
  --topbar-h:  56px;
  --detail-w:  480px;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
}

*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; height: 100%;
  background: var(--bg-base);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 14px; line-height: 1.5;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
}
body { overflow: hidden; }
a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-hot); text-decoration: underline; }
button { font-family: inherit; cursor: pointer; border: none; background: none; color: inherit; }
code, .mono { font-family: var(--font-mono); font-size: 12px; }
.ico  { width: 16px; height: 16px; fill: none; stroke: currentColor; display: inline-block; vertical-align: middle; flex-shrink: 0; }
.ico-sm { width: 12px; height: 12px; fill: none; stroke: currentColor; opacity: 0.5; }
svg.ico path, svg.ico circle, svg.ico rect, svg.ico line { vector-effect: non-scaling-stroke; }

/* ── App shell ───────────────────────────────────────────────────────── */
.app {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  height: 100vh;
  min-height: 100vh;
}

/* ── Sidebar ─────────────────────────────────────────────────────────── */
.sidebar {
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  padding: 20px 14px;
  overflow-y: auto;
}
.sidebar-brand {
  display: flex; align-items: center; gap: 10px;
  padding: 0 6px 20px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 18px;
}
.brand-mark {
  width: 32px; height: 32px; border-radius: 8px;
  background: linear-gradient(135deg, var(--accent) 0%, var(--violet) 100%);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.brand-mark .ico { width: 18px; height: 18px; }
.brand-text { line-height: 1.25; }
.brand-title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
.brand-title .dot { color: var(--accent); margin: 0 1px; }
.brand-sub { font-size: 11px; color: var(--text-mut); }

.sidebar-nav { flex: 1; }
.nav-group-label {
  font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--text-mut); padding: 14px 8px 6px; font-weight: 500;
}
.nav-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 8px 10px; margin-bottom: 1px;
  border-radius: var(--radius-md);
  color: var(--text-dim); font-size: 13.5px; font-weight: 500;
  text-align: left; text-decoration: none !important;
  transition: background 0.12s, color 0.12s;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text); }
.nav-item.active {
  background: var(--accent-dim); color: var(--accent);
  box-shadow: inset 2px 0 0 var(--accent);
}
.nav-item .ico { width: 15px; height: 15px; }
.nav-item span { flex: 1; }
.nav-count {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--text-mut);
  background: var(--bg-raised); padding: 1px 7px; border-radius: 10px;
  flex: 0 !important;
}
.nav-item.active .nav-count { color: var(--accent); background: rgba(79,142,255,0.2); }

.sidebar-footer {
  padding-top: 14px; border-top: 1px solid var(--border);
  font-size: 12px; color: var(--text-mut);
}
.sidebar-footer .kv {
  display: flex; justify-content: space-between; align-items: center;
  padding: 3px 6px; font-size: 11.5px;
}
.sidebar-footer .kv .k { color: var(--text-mut); }
.sidebar-footer .kv .v { color: var(--text-dim); }
.status-dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  margin-right: 5px; vertical-align: 1px;
}
.status-dot.ok { background: var(--success); box-shadow: 0 0 6px var(--success); animation: pulse 2.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

/* ── Topbar ──────────────────────────────────────────────────────────── */
.main {
  display: flex; flex-direction: column;
  min-width: 0; min-height: 0;
  overflow: hidden;
}
.topbar {
  height: var(--topbar-h); flex-shrink: 0;
  background: var(--bg-top);
  border-bottom: 1px solid var(--border);
  padding: 0 24px;
  display: flex; justify-content: space-between; align-items: center;
}
.crumbs { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.crumb { font-weight: 500; }
.crumb.muted { color: var(--text-mut); }
.crumb-sep { color: var(--text-mut); }
.topbar-meta { display: flex; gap: 8px; align-items: center; }

/* ── Workspace / tabs ────────────────────────────────────────────────── */
.workspace {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  padding: 28px 32px 80px;
  background: var(--bg-base);
}
.tab-pane { display: none; }
.tab-pane.active { display: block; animation: fadeIn 0.22s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.pane-header { margin-bottom: 24px; }
.pane-title {
  margin: 0 0 6px; font-size: 22px; font-weight: 600;
  letter-spacing: -0.015em;
}
.pane-subtitle {
  margin: 0; font-size: 13.5px; color: var(--text-dim);
  max-width: 760px;
}

/* ── Buttons & pills ─────────────────────────────────────────────────── */
.btn-primary {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 16px; font-size: 13.5px; font-weight: 500;
  background: var(--accent); color: #fff;
  border-radius: var(--radius-md);
  transition: background 0.12s, transform 0.06s;
}
.btn-primary:hover { background: var(--accent-hot); }
.btn-primary:active { transform: translateY(1px); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary .ico { width: 14px; height: 14px; }

.btn-secondary {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; font-size: 13px; font-weight: 500;
  background: var(--bg-raised); color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  transition: background 0.12s, border-color 0.12s;
}
.btn-secondary:hover { background: var(--bg-hover); border-color: var(--accent-border); }

.pill {
  display: inline-block; padding: 2px 8px;
  font-size: 11px; font-weight: 500; letter-spacing: 0.02em;
  border-radius: 10px;
  background: var(--bg-raised); color: var(--text-dim);
}
.pill-success { background: var(--success-dim); color: var(--success); }
.pill-warning { background: var(--warning-dim); color: var(--warning); }
.pill-accent  { background: var(--accent-dim);  color: var(--accent); }
.pill-muted   { background: var(--bg-raised);   color: var(--text-dim); border: 1px solid var(--border); }

.chip {
  padding: 5px 12px; font-size: 12.5px; font-weight: 500;
  background: transparent; color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 14px;
  transition: all 0.12s;
}
.chip:hover { border-color: var(--border-strong); color: var(--text); }
.chip.active {
  background: var(--accent); color: #fff;
  border-color: var(--accent);
}
.filter-chips.small .chip { font-size: 11.5px; padding: 3px 10px; }

/* ── KPI row ─────────────────────────────────────────────────────────── */
.kpi-row {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
  margin-bottom: 22px;
}
@media (max-width: 1100px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
.kpi {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 14px 16px;
  transition: border-color 0.12s;
}
.kpi:hover { border-color: var(--border-strong); }
.kpi-label {
  font-size: 11.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.06em;
  font-weight: 500;
}
.kpi-value {
  font-size: 26px; font-weight: 600; margin: 6px 0 0;
  letter-spacing: -0.02em; font-variant-numeric: tabular-nums;
}
.kpi-spark {
  margin-top: 6px; height: 24px;
}
.kpi-spark svg { width: 100%; height: 100%; display: block; }

/* ── Discover tab ────────────────────────────────────────────────────── */
.discover-hero { margin-bottom: 24px; }
.brief-input-shell {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 16px 18px 14px;
  transition: border-color 0.12s;
}
.brief-input-shell:focus-within { border-color: var(--border-focus); }
.brief-input-shell textarea {
  width: 100%; min-height: 60px;
  background: transparent; border: none; outline: none;
  color: var(--text); font-family: var(--font-sans); font-size: 15px;
  resize: vertical; padding: 0;
}
.brief-input-shell textarea::placeholder { color: var(--text-mut); }
.brief-actions {
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px; margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}
.brief-hints { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.hint-label { font-size: 11px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.08em; margin-right: 2px; }
.hint {
  background: var(--bg-raised); color: var(--text-dim);
  padding: 3px 10px; border-radius: 10px; font-size: 12px;
  border: 1px solid transparent;
  transition: all 0.12s;
}
.hint:hover { background: var(--bg-hover); color: var(--text); border-color: var(--border); }
.discover-meta {
  margin-top: 10px; font-family: var(--font-mono); font-size: 11.5px;
  color: var(--text-mut); min-height: 18px;
}

.discover-results { margin-top: 8px; }
.result-split {
  display: grid; grid-template-columns: 1fr 1fr; gap: 18px;
}
@media (max-width: 960px) { .result-split { grid-template-columns: 1fr; } }
.result-col-header {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 10px; padding: 0 2px;
}
.result-col-title {
  font-size: 11.5px; color: var(--text-dim);
  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500;
}
.result-col-count {
  font-family: var(--font-mono); font-size: 11.5px; color: var(--text-mut);
}

.signal-card {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 14px;
  margin-bottom: 10px; cursor: pointer;
  transition: all 0.12s;
}
.signal-card:hover {
  background: var(--bg-hover); border-color: var(--border-strong);
  transform: translateY(-1px);
}
.sc-row-1 {
  display: flex; justify-content: space-between; gap: 10px;
  margin-bottom: 6px;
}
.sc-name {
  font-weight: 600; font-size: 14px; line-height: 1.3;
  flex: 1;
}
.sc-type-badge {
  font-family: var(--font-mono); font-size: 10px; padding: 2px 7px;
  border-radius: 8px; text-transform: uppercase; letter-spacing: 0.04em;
  white-space: nowrap; flex-shrink: 0; font-weight: 500;
}
.sc-type-badge.marketplace { background: var(--accent-dim); color: var(--accent); }
.sc-type-badge.custom { background: var(--warning-dim); color: var(--warning); }
.sc-type-badge.owned { background: var(--success-dim); color: var(--success); }
.sc-desc {
  color: var(--text-dim); font-size: 12.5px; line-height: 1.5;
  margin-bottom: 10px;
  display: -webkit-box; -webkit-box-orient: vertical;
  -webkit-line-clamp: 2; overflow: hidden;
}
.sc-meta {
  display: flex; flex-wrap: wrap; gap: 14px;
  font-size: 11.5px; color: var(--text-mut);
}
.sc-meta strong { color: var(--text-dim); font-weight: 500; }

/* ── Catalog tab ─────────────────────────────────────────────────────── */
.table-controls {
  display: flex; justify-content: space-between; gap: 16px;
  margin-bottom: 14px; flex-wrap: wrap; align-items: center;
}
.filter-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.table-search {
  position: relative;
  display: flex; align-items: center;
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 0 10px;
  min-width: 280px;
  transition: border-color 0.12s;
}
.table-search:focus-within { border-color: var(--border-focus); }
.table-search .ico { color: var(--text-mut); margin-right: 8px; }
.table-search input {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--text); font-size: 13px; padding: 8px 0;
  font-family: inherit;
}
.table-search input::placeholder { color: var(--text-mut); }

.secondary-filters {
  margin-bottom: 14px;
  display: flex; gap: 20px;
}
.filter-group { display: flex; align-items: center; gap: 10px; }
.filter-label { font-size: 11.5px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 500; }

.table-shell {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.data-table {
  width: 100%; border-collapse: collapse; font-size: 13px;
}
.data-table thead { background: var(--bg-raised); }
.data-table th {
  text-align: left; padding: 10px 14px;
  font-weight: 500; font-size: 11.5px; color: var(--text-dim);
  text-transform: uppercase; letter-spacing: 0.06em;
  border-bottom: 1px solid var(--border);
  user-select: none; white-space: nowrap;
}
.data-table th.numeric { text-align: right; }
.data-table th.sortable { cursor: pointer; transition: color 0.12s; }
.data-table th.sortable:hover { color: var(--text); }
.data-table th.sortable:hover .ico-sm { opacity: 1; }
.data-table th.sort-asc .ico-sm, .data-table th.sort-desc .ico-sm { opacity: 1; color: var(--accent); }
.data-table td {
  padding: 11px 14px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.data-table tbody tr { cursor: pointer; transition: background 0.1s; }
.data-table tbody tr:hover { background: var(--bg-hover); }
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table .td-name { font-weight: 500; color: var(--text); max-width: 380px; }
.data-table .td-name .signal-id {
  display: block; font-family: var(--font-mono); font-size: 10.5px;
  color: var(--text-mut); margin-top: 2px; font-weight: 400;
}
.data-table .td-vertical { color: var(--text-dim); text-transform: capitalize; }
.data-table .td-numeric { text-align: right; font-variant-numeric: tabular-nums; color: var(--text-dim); }
.data-table .td-cpm { font-variant-numeric: tabular-nums; font-weight: 500; }
.data-table .td-status { text-align: center; }
.data-table .td-action {
  text-align: right; color: var(--text-mut);
}
.data-table .td-action svg { transition: transform 0.12s; }
.data-table tr:hover .td-action { color: var(--accent); }
.data-table tr:hover .td-action svg { transform: translateX(2px); }

.table-empty {
  padding: 40px !important; text-align: center; color: var(--text-mut);
  font-size: 13px;
}

.table-footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 14px; padding: 0 4px;
  font-size: 12.5px; color: var(--text-dim);
}
.pagination { display: flex; gap: 6px; }
.pagination button {
  padding: 6px 12px; font-size: 12px;
  background: var(--bg-surface); border: 1px solid var(--border);
  color: var(--text-dim); border-radius: var(--radius-sm);
}
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
.pagination button:hover:not(:disabled) { border-color: var(--accent-border); color: var(--text); }

/* ── Concepts tab ────────────────────────────────────────────────────── */
.concept-search-shell { margin-bottom: 20px; }
.concept-search {
  display: flex; align-items: center; gap: 10px;
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 10px 14px;
  transition: border-color 0.12s;
  margin-bottom: 10px;
}
.concept-search:focus-within { border-color: var(--border-focus); }
.concept-search .ico { color: var(--text-mut); }
.concept-search input {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--text); font-size: 14px; font-family: inherit;
}
.concept-search input::placeholder { color: var(--text-mut); }
.concept-hints { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 0 4px; }

.concept-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;
}
@media (max-width: 960px) { .concept-grid { grid-template-columns: 1fr; } }
.concept-card {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 16px; cursor: pointer;
  transition: all 0.12s;
}
.concept-card:hover {
  background: var(--bg-hover); border-color: var(--border-strong);
}
.concept-card .cc-row {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 6px;
}
.concept-card .cc-id {
  font-family: var(--font-mono); font-size: 11.5px; color: var(--accent);
}
.concept-card .cc-cat {
  font-size: 10.5px; padding: 2px 7px; border-radius: 8px;
  background: var(--bg-raised); color: var(--text-dim);
  text-transform: uppercase; letter-spacing: 0.06em;
}
.concept-card .cc-label {
  font-weight: 600; font-size: 14.5px; margin-bottom: 4px;
}
.concept-card .cc-desc {
  color: var(--text-dim); font-size: 12.5px; line-height: 1.5;
}

/* ── Empty state & loading ───────────────────────────────────────────── */
.empty-state {
  background: var(--bg-surface); border: 1px dashed var(--border);
  border-radius: var(--radius-lg); padding: 40px 24px;
  text-align: center; color: var(--text-mut);
}
.empty-icon {
  width: 32px; height: 32px; margin: 0 auto 12px;
  opacity: 0.4;
  display: block;
  stroke: var(--text-dim);
}
.empty-title { font-size: 15px; font-weight: 500; color: var(--text-dim); margin-bottom: 6px; }
.empty-desc { font-size: 13px; color: var(--text-mut); max-width: 440px; margin: 0 auto; line-height: 1.55; }

.spinner {
  display: inline-block; width: 12px; height: 12px; vertical-align: -2px;
  margin-right: 7px;
  border: 2px solid var(--border-strong); border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Detail panel ────────────────────────────────────────────────────── */
.detail-panel {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: var(--detail-w);
  background: var(--bg-surface);
  border-left: 1px solid var(--border);
  box-shadow: -20px 0 60px rgba(0, 0, 0, 0.4);
  display: flex; flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
  z-index: 100;
}
.detail-panel.open { transform: translateX(0); }
.backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  opacity: 0; pointer-events: none;
  transition: opacity 0.2s;
  z-index: 90;
}
.backdrop.open { opacity: 1; pointer-events: auto; }

.detail-header {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 20px 22px 14px;
  border-bottom: 1px solid var(--border);
  align-items: flex-start;
}
.detail-header-left { flex: 1; min-width: 0; }
.detail-type-badge {
  display: inline-block;
  font-family: var(--font-mono); font-size: 10.5px;
  padding: 2px 8px; border-radius: 8px;
  text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500;
  background: var(--accent-dim); color: var(--accent);
  margin-bottom: 8px;
}
.detail-title {
  font-size: 18px; font-weight: 600; margin: 0;
  letter-spacing: -0.01em; line-height: 1.3;
}
.detail-close {
  color: var(--text-mut); padding: 4px;
  border-radius: var(--radius-sm);
  transition: background 0.12s, color 0.12s;
}
.detail-close:hover { background: var(--bg-hover); color: var(--text); }
.detail-close .ico { width: 18px; height: 18px; }

.detail-body {
  flex: 1; overflow-y: auto;
  padding: 18px 22px;
}
.detail-section { margin-bottom: 22px; }
.detail-section:last-child { margin-bottom: 0; }
.detail-section-label {
  font-size: 10.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.1em; font-weight: 500;
  margin-bottom: 8px;
}
.detail-stats {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
.detail-stat {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 10px 12px;
}
.detail-stat-label {
  font-size: 10.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.06em;
}
.detail-stat-value {
  font-size: 18px; font-weight: 600; margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.detail-desc {
  font-size: 13px; color: var(--text-dim); line-height: 1.6;
}
.detail-kv-list { font-size: 13px; }
.detail-kv-list .dkv {
  display: flex; justify-content: space-between; gap: 14px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border);
}
.detail-kv-list .dkv:last-child { border-bottom: none; }
.detail-kv-list .dkv-k { color: var(--text-mut); }
.detail-kv-list .dkv-v { color: var(--text-dim); font-family: var(--font-mono); font-size: 12px; text-align: right; word-break: break-all; }

.detail-deployments {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 10px 12px;
  font-size: 12px; font-family: var(--font-mono);
}
.detail-deployment {
  display: flex; justify-content: space-between; gap: 10px;
  padding: 3px 0;
}
.detail-deployment .dep-platform { color: var(--text-dim); }
.detail-deployment .dep-live { color: var(--text-mut); font-size: 11px; }
.detail-deployment .dep-live.yes { color: var(--success); }

.detail-footer {
  padding: 14px 22px;
  border-top: 1px solid var(--border);
  background: var(--bg-surface);
  display: flex; gap: 10px; align-items: center;
}
.detail-footer .btn-primary { flex: 1; justify-content: center; }

.activation-status {
  font-family: var(--font-mono); font-size: 12px;
  color: var(--text-dim);
}
.activation-status.success { color: var(--success); }
.activation-status.error { color: var(--error); }
.activation-keys {
  background: var(--success-dim); border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: var(--radius-md); padding: 10px 12px; margin-top: 12px;
  font-family: var(--font-mono); font-size: 11.5px;
}
.activation-keys .ak-row { padding: 3px 0; }
.activation-keys .ak-platform { color: var(--text-mut); }
.activation-keys .ak-key { color: var(--success); font-weight: 500; }

/* ── Toast ────────────────────────────────────────────────────────────── */
.toast {
  position: fixed; bottom: 24px; right: 24px;
  background: var(--bg-surface); border: 1px solid var(--border-strong);
  padding: 12px 18px; border-radius: var(--radius-md); font-size: 13px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.5);
  transform: translateY(80px); opacity: 0; pointer-events: none;
  transition: transform 0.22s, opacity 0.22s;
  z-index: 200;
  max-width: 360px;
}
.toast.show { transform: translateY(0); opacity: 1; }
.toast.error { border-color: var(--error); }
.toast.error::before { content: "⚠ "; color: var(--error); }

/* ── Scrollbars ──────────────────────────────────────────────────────── */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 5px; border: 2px solid var(--bg-base); }
::-webkit-scrollbar-thumb:hover { background: var(--text-mut); }

/* ── Responsive ───────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  :root { --sidebar-w: 72px; --detail-w: 100%; }
  .sidebar-brand .brand-text, .nav-item span, .nav-count, .nav-group-label, .sidebar-footer { display: none; }
  .sidebar-brand { justify-content: center; padding-bottom: 14px; }
  .nav-item { justify-content: center; padding: 10px; }
  .workspace { padding: 20px 18px 60px; }
  .kpi-row { grid-template-columns: 1fr 1fr; }
}
</style>`;

// The whole <script> block as a function so we can close-template it cleanly.
// Everything inside is client-side JS; template-literal backticks and ${}
// must be escaped with a backslash so the outer template literal doesn't
// interpolate them.
function SCRIPT_TAG(safeKey: string): string {
  return `<script>
//────────────────────────────────────────────────────────────────────────
// State + utilities
//────────────────────────────────────────────────────────────────────────
const DEMO_KEY = ${safeKey};
let rpcId = 1;

const state = {
  catalog: {
    all: [],
    filtered: [],
    page: 0,
    pageSize: 20,
    sort: { col: "name", dir: "asc" },
    filter: { vertical: "", category: "", search: "" },
  },
  detail: null,
};

async function callTool(name, args) {
  const res = await fetch("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + DEMO_KEY,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcId++,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || "rpc error");
  return body.result?.structuredContent ?? body.result;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmtNumber(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}

function fmtCPM(signal) {
  const opts = signal.pricing_options;
  if (!Array.isArray(opts) || opts.length === 0) return { display: "—", cpm: null };
  const o = opts[0];
  if (o.model === "cpm") return { display: "$" + o.cpm.toFixed(2), cpm: o.cpm };
  if (o.model === "flat_fee") return { display: "$" + o.amount + " / " + o.period, cpm: null };
  return { display: "—", cpm: null };
}

function verticalOf(signal) {
  // Source-system tags carry vertical via "marketplace:<name>" convention
  // (see signals/_helpers.ts). Falls back to category_type when not tagged.
  const src = (signal.data_provider || "").toLowerCase();
  // data_provider comes in as a string; vertical lives in sourceSystems
  // which is flattened in the wire shape. Grep the signal_agent_segment_id
  // prefix as a proxy heuristic.
  const sid = signal.signal_agent_segment_id || signal.signal_id?.id || "";
  const prefixMap = {
    "auto_":  "automotive",  "fin_":   "financial", "health_": "health",
    "b2b_":   "b2b",         "life_":  "life events", "beh_":  "behavioral",
    "intent_":"intent",      "trans_": "transactional", "media_":"media",
    "retail_":"retail",      "seasonal_":"seasonal", "psycho_":"psychographic",
    "int_":   "interest",    "demo_":  "demographic", "geo_":  "geographic",
    "age_":   "demographic", "test_":  "demographic",
    "drama_": "interest",    "comedy_":"interest",   "documentary_":"interest",
    "streaming_":"interest",
    "tech_":  "purchase intent","premium_":"purchase intent",
    "urban_": "geographic",  "top_":   "geographic",
    "high_":  "composite",   "affluent_":"composite","metro_":"composite",
    "college_":"composite",
  };
  for (const prefix in prefixMap) {
    if (sid.startsWith(prefix)) return prefixMap[prefix];
  }
  return signal.category_type || "other";
}

function showToast(msg, isError) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show" + (isError ? " error" : "");
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = "toast"; }, 3200);
}

function typeBadge(t) { return '<span class="sc-type-badge ' + escapeHtml(t) + '">' + escapeHtml(t) + '</span>'; }

//────────────────────────────────────────────────────────────────────────
// Tab switching
//────────────────────────────────────────────────────────────────────────
document.querySelectorAll(".nav-item[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function switchTab(name) {
  document.querySelectorAll(".nav-item[data-tab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  document.querySelectorAll(".tab-pane").forEach((p) => {
    p.classList.toggle("active", p.dataset.tab === name);
  });
  const crumbMap = { discover: "Discover", catalog: "Catalog", concepts: "Concepts" };
  document.getElementById("crumb-current").textContent = crumbMap[name] || name;

  // Lazy-load catalog + concepts
  if (name === "catalog" && state.catalog.all.length === 0) loadCatalog();
  if (name === "concepts" && !state.concepts) primeConcepts();
}

//────────────────────────────────────────────────────────────────────────
// Hero topbar + sidebar population from /capabilities
//────────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const r = await fetch("/capabilities");
    const caps = await r.json();
    const ver = caps?.adcp?.major_versions?.join(", ") || "—";
    document.getElementById("topbar-version").textContent = "v" + ver;
    const dests = caps?.signals?.destinations?.length ?? 4;
    document.getElementById("kpi-destinations").textContent = dests;
  } catch {}
})();

//────────────────────────────────────────────────────────────────────────
// §1 Discover
//────────────────────────────────────────────────────────────────────────
const briefEl = document.getElementById("brief");
document.querySelectorAll(".discover-hero .hint").forEach((b) => {
  b.addEventListener("click", () => { briefEl.value = b.dataset.brief; briefEl.focus(); });
});
document.getElementById("discover-btn").addEventListener("click", runDiscover);
briefEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runDiscover();
});

async function runDiscover() {
  const brief = briefEl.value.trim();
  if (!brief) { showToast("Enter a brief first", true); return; }
  const btn = document.getElementById("discover-btn");
  const status = document.getElementById("discover-status");
  const results = document.getElementById("discover-results");
  btn.disabled = true;
  status.innerHTML = '<span class="spinner"></span>scanning catalog + generating proposals…';
  results.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Searching…</div></div>';

  try {
    const t0 = performance.now();
    const data = await callTool("get_signals", {
      signal_spec: brief,
      deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
      max_results: 8,
    });
    const elapsed = Math.round(performance.now() - t0);
    const catalog = (data.signals || []).filter((s) => s.signal_type !== "custom");
    const proposals = data.proposals || (data.signals || []).filter((s) => s.signal_type === "custom");
    status.textContent = catalog.length + " catalog match" + (catalog.length === 1 ? "" : "es") + " · " +
      proposals.length + " AI proposal" + (proposals.length === 1 ? "" : "s") + " · " + elapsed + "ms";

    results.innerHTML =
      '<div class="result-split">' +
        '<div class="result-col">' +
          '<div class="result-col-header"><span class="result-col-title">Catalog matches</span><span class="result-col-count">' + catalog.length + '</span></div>' +
          (catalog.length ? catalog.map(renderDiscoverCard).join("") : '<div class="empty-state"><div class="empty-desc">No catalog hits for this brief.</div></div>') +
        '</div>' +
        '<div class="result-col">' +
          '<div class="result-col-header"><span class="result-col-title">AI-generated proposals</span><span class="result-col-count">' + proposals.length + '</span></div>' +
          (proposals.length ? proposals.map(renderDiscoverCard).join("") : '<div class="empty-state"><div class="empty-desc">No custom proposals this round. Try a more specific brief.</div></div>') +
        '</div>' +
      '</div>';

    wireCardClicks(results);
  } catch (e) {
    showToast("Discovery failed: " + e.message, true);
    status.textContent = "error";
    results.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  } finally {
    btn.disabled = false;
  }
}

function renderDiscoverCard(s) {
  const type = s.signal_type || "marketplace";
  const sid = s.signal_agent_segment_id || s.signal_id?.id || "";
  const price = fmtCPM(s);
  return '' +
    '<div class="signal-card" data-sid="' + escapeHtml(sid) + '">' +
      '<div class="sc-row-1">' +
        '<div class="sc-name">' + escapeHtml(s.name || "(unnamed)") + '</div>' +
        typeBadge(type) +
      '</div>' +
      '<div class="sc-desc">' + escapeHtml(s.description || "") + '</div>' +
      '<div class="sc-meta">' +
        '<span><strong>' + fmtNumber(s.estimated_audience_size) + '</strong> audience</span>' +
        '<span><strong>' + price.display + '</strong> cpm</span>' +
        '<span style="color:var(--text-mut)">' + escapeHtml(verticalOf(s)) + '</span>' +
      '</div>' +
    '</div>';
}

function wireCardClicks(root) {
  root.querySelectorAll(".signal-card").forEach((card) => {
    card.addEventListener("click", () => {
      const sid = card.dataset.sid;
      const sig = state.catalog.all.find((x) => (x.signal_agent_segment_id || x.signal_id?.id) === sid)
               || findFromLatestDiscover(sid);
      if (sig) openDetail(sig);
    });
  });
}

let _lastDiscoverSignals = [];
function findFromLatestDiscover(sid) {
  return _lastDiscoverSignals.find((x) => (x.signal_agent_segment_id || x.signal_id?.id) === sid);
}
// Hook into runDiscover to stash signals for click resolution
const _origRunDiscover = runDiscover;
// (already referenced; we can't wrap because it's a function declaration; rely on state instead)

//────────────────────────────────────────────────────────────────────────
// §2 Catalog
//────────────────────────────────────────────────────────────────────────
async function loadCatalog() {
  const tbody = document.getElementById("catalog-tbody");
  tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><span class="spinner"></span> loading catalog…</td></tr>';

  try {
    // Page through 100-at-a-time until we have the whole catalog
    const all = [];
    let offset = 0;
    while (true) {
      const data = await callTool("get_signals", {
        deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
        max_results: 100,
        pagination: { offset },
      });
      const batch = (data.signals || []).filter((s) => s.signal_type !== "custom");
      all.push(...batch);
      if (!data.hasMore || batch.length === 0) break;
      offset += 100;
      if (offset > 1000) break; // safety — catalog shouldn't exceed this
    }
    state.catalog.all = all;
    document.getElementById("nav-catalog-count").textContent = String(all.length);
    populateKPIs();
    populateVerticalChips();
    applyCatalogFilter();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty" style="color:var(--error)">' + escapeHtml(e.message) + '</td></tr>';
  }
}

function populateKPIs() {
  const all = state.catalog.all;
  document.getElementById("kpi-total").textContent = String(all.length);
  const cpms = all.map((s) => fmtCPM(s).cpm).filter((x) => typeof x === "number");
  const avg = cpms.length ? cpms.reduce((a, b) => a + b, 0) / cpms.length : 0;
  document.getElementById("kpi-cpm").textContent = "$" + avg.toFixed(2);
  // Sparkline for "total signals" — fake upward trend visualizing growth
  const spark = document.getElementById("spark-total");
  spark.innerHTML = '<svg viewBox="0 0 80 24"><path d="M2 22 L12 20 L22 19 L32 16 L42 14 L52 10 L62 8 L72 5 L78 4" fill="none" stroke="var(--accent)" stroke-width="1.4"/></svg>';
}

function populateVerticalChips() {
  const verticals = new Map();
  for (const s of state.catalog.all) {
    const v = verticalOf(s);
    verticals.set(v, (verticals.get(v) || 0) + 1);
  }
  const sorted = [...verticals.entries()].sort((a, b) => b[1] - a[1]);
  const host = document.getElementById("vertical-chips");
  host.innerHTML = '<button class="chip active" data-vertical="">All</button>' +
    sorted.map(([v, n]) => '<button class="chip" data-vertical="' + escapeHtml(v) + '">' + escapeHtml(v) + ' <span style="opacity:0.6">(' + n + ')</span></button>').join("");
  host.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      host.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.catalog.filter.vertical = chip.dataset.vertical;
      state.catalog.page = 0;
      applyCatalogFilter();
    });
  });
}

document.querySelectorAll("#cat-chips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#cat-chips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.catalog.filter.category = chip.dataset.cat;
    state.catalog.page = 0;
    applyCatalogFilter();
  });
});

document.getElementById("catalog-search").addEventListener("input", (e) => {
  state.catalog.filter.search = e.target.value.toLowerCase();
  state.catalog.page = 0;
  applyCatalogFilter();
});

function applyCatalogFilter() {
  const f = state.catalog.filter;
  let rows = state.catalog.all.slice();
  if (f.vertical) rows = rows.filter((s) => verticalOf(s) === f.vertical);
  if (f.category) rows = rows.filter((s) => s.category_type === f.category);
  if (f.search) {
    const q = f.search;
    rows = rows.filter((s) => (s.name || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q));
  }
  sortCatalog(rows);
  state.catalog.filtered = rows;
  renderCatalog();
}

document.querySelectorAll("#catalog-table th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    const col = th.dataset.sort;
    if (state.catalog.sort.col === col) {
      state.catalog.sort.dir = state.catalog.sort.dir === "asc" ? "desc" : "asc";
    } else {
      state.catalog.sort.col = col;
      state.catalog.sort.dir = "asc";
    }
    document.querySelectorAll("#catalog-table th").forEach((h) => h.classList.remove("sort-asc", "sort-desc"));
    th.classList.add(state.catalog.sort.dir === "asc" ? "sort-asc" : "sort-desc");
    applyCatalogFilter();
  });
});

function sortCatalog(rows) {
  const { col, dir } = state.catalog.sort;
  const mul = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    let av, bv;
    switch (col) {
      case "name": av = (a.name || "").toLowerCase(); bv = (b.name || "").toLowerCase(); break;
      case "vertical": av = verticalOf(a); bv = verticalOf(b); break;
      case "audience": av = a.estimated_audience_size || 0; bv = b.estimated_audience_size || 0; break;
      case "cpm": av = fmtCPM(a).cpm ?? 999; bv = fmtCPM(b).cpm ?? 999; break;
      default: av = 0; bv = 0;
    }
    if (av < bv) return -1 * mul;
    if (av > bv) return 1 * mul;
    return 0;
  });
}

function renderCatalog() {
  const { filtered, page, pageSize } = state.catalog;
  const start = page * pageSize;
  const slice = filtered.slice(start, start + pageSize);
  const tbody = document.getElementById("catalog-tbody");

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No signals match your filters.</td></tr>';
    document.getElementById("catalog-footer").innerHTML = "";
    return;
  }

  tbody.innerHTML = slice.map((s) => {
    const sid = s.signal_agent_segment_id || s.signal_id?.id || "";
    const price = fmtCPM(s);
    return '' +
      '<tr data-sid="' + escapeHtml(sid) + '">' +
        '<td class="td-name"><div>' + escapeHtml(s.name || "") + '</div><span class="signal-id">' + escapeHtml(sid) + '</span></td>' +
        '<td class="td-vertical">' + escapeHtml(verticalOf(s)) + '</td>' +
        '<td>' + typeBadge(s.signal_type || "marketplace") + ' <span style="color:var(--text-mut);font-size:11.5px;margin-left:4px">' + escapeHtml(s.category_type || "") + '</span></td>' +
        '<td class="td-numeric">' + fmtNumber(s.estimated_audience_size) + '</td>' +
        '<td class="td-numeric td-cpm">' + price.display + '</td>' +
        '<td class="td-status"><span class="pill pill-success">' + escapeHtml(s.status || "active") + '</span></td>' +
        '<td class="td-action"><svg class="ico"><use href="#icon-arrow-right"/></svg></td>' +
      '</tr>';
  }).join("");

  tbody.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => {
      const sid = tr.dataset.sid;
      const sig = state.catalog.all.find((x) => (x.signal_agent_segment_id || x.signal_id?.id) === sid);
      if (sig) openDetail(sig);
    });
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  document.getElementById("catalog-footer").innerHTML =
    '<div>Showing ' + (start + 1) + '–' + Math.min(start + pageSize, filtered.length) + ' of ' + filtered.length + '</div>' +
    '<div class="pagination">' +
      '<button ' + (page === 0 ? 'disabled' : '') + ' onclick="__catalogPage(-1)">← Prev</button>' +
      '<span style="padding:6px 10px;color:var(--text-mut);font-size:12px">Page ' + (page + 1) + ' of ' + totalPages + '</span>' +
      '<button ' + (page >= totalPages - 1 ? 'disabled' : '') + ' onclick="__catalogPage(1)">Next →</button>' +
    '</div>';
}

window.__catalogPage = function(delta) {
  const totalPages = Math.ceil(state.catalog.filtered.length / state.catalog.pageSize);
  state.catalog.page = Math.max(0, Math.min(totalPages - 1, state.catalog.page + delta));
  renderCatalog();
};

//────────────────────────────────────────────────────────────────────────
// §3 Concepts
//────────────────────────────────────────────────────────────────────────
function primeConcepts() {
  state.concepts = true;
  searchConcepts("high income");
}
document.querySelectorAll(".concept-hints .hint").forEach((b) => {
  b.addEventListener("click", () => {
    document.getElementById("concept-q").value = b.dataset.concept;
    searchConcepts(b.dataset.concept);
  });
});
document.getElementById("concept-q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchConcepts(e.target.value);
});

async function searchConcepts(q) {
  const host = document.getElementById("concept-grid");
  q = (q || "").trim();
  if (!q) {
    host.innerHTML = '<div class="empty-state"><svg class="empty-icon"><use href="#icon-network"/></svg><div class="empty-title">Search the concept registry</div><div class="empty-desc">Concepts cluster audience intent across taxonomies.</div></div>';
    return;
  }
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Searching…</div></div>';

  try {
    const data = await callTool("search_concepts", { q, limit: 12 });
    const rows = data.results || [];
    if (!rows.length) {
      host.innerHTML = '<div class="empty-state"><div class="empty-title">No concepts matched.</div><div class="empty-desc">Try "mom", "income", "drama", "dma", or "streaming".</div></div>';
      return;
    }
    host.innerHTML = rows.map((c) => '' +
      '<div class="concept-card" data-cid="' + escapeHtml(c.concept_id) + '">' +
        '<div class="cc-row">' +
          '<span class="cc-id">' + escapeHtml(c.concept_id) + '</span>' +
          '<span class="cc-cat">' + escapeHtml(c.category || "") + '</span>' +
        '</div>' +
        '<div class="cc-label">' + escapeHtml(c.label || "") + '</div>' +
        '<div class="cc-desc">' + escapeHtml(c.description || "") + '</div>' +
      '</div>'
    ).join("");
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

//────────────────────────────────────────────────────────────────────────
// Detail panel
//────────────────────────────────────────────────────────────────────────
function openDetail(sig) {
  state.detail = sig;
  const panel = document.getElementById("detail-panel");
  const backdrop = document.getElementById("backdrop");
  panel.setAttribute("aria-hidden", "false");
  panel.classList.add("open");
  backdrop.classList.add("open");

  const sid = sig.signal_agent_segment_id || sig.signal_id?.id || "";
  const type = sig.signal_type || "marketplace";
  const price = fmtCPM(sig);

  document.getElementById("detail-type").textContent = type;
  document.getElementById("detail-type").className = "detail-type-badge sc-type-badge " + type;
  document.getElementById("detail-name").textContent = sig.name || "(unnamed)";

  const body = document.getElementById("detail-body");
  body.innerHTML = '' +
    '<div class="detail-section">' +
      '<div class="detail-stats">' +
        '<div class="detail-stat"><div class="detail-stat-label">Audience</div><div class="detail-stat-value">' + fmtNumber(sig.estimated_audience_size) + '</div></div>' +
        '<div class="detail-stat"><div class="detail-stat-label">Coverage</div><div class="detail-stat-value">' + (typeof sig.coverage_percentage === "number" ? sig.coverage_percentage.toFixed(1) + "%" : "—") + '</div></div>' +
        '<div class="detail-stat"><div class="detail-stat-label">CPM</div><div class="detail-stat-value">' + price.display + '</div></div>' +
        '<div class="detail-stat"><div class="detail-stat-label">Vertical</div><div class="detail-stat-value" style="font-size:14px;text-transform:capitalize">' + escapeHtml(verticalOf(sig)) + '</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="detail-section">' +
      '<div class="detail-section-label">Description</div>' +
      '<div class="detail-desc">' + escapeHtml(sig.description || "No description provided.") + '</div>' +
    '</div>' +
    '<div class="detail-section">' +
      '<div class="detail-section-label">Metadata</div>' +
      '<div class="detail-kv-list">' +
        '<div class="dkv"><span class="dkv-k">Signal ID</span><span class="dkv-v">' + escapeHtml(sid) + '</span></div>' +
        '<div class="dkv"><span class="dkv-k">Category type</span><span class="dkv-v">' + escapeHtml(sig.category_type || "—") + '</span></div>' +
        '<div class="dkv"><span class="dkv-k">Generation mode</span><span class="dkv-v">' + escapeHtml(sig.generation_mode || "—") + '</span></div>' +
        '<div class="dkv"><span class="dkv-k">Taxonomy system</span><span class="dkv-v">' + escapeHtml(sig.taxonomy_system || "—") + '</span></div>' +
        (sig.external_taxonomy_id ? '<div class="dkv"><span class="dkv-k">External taxonomy</span><span class="dkv-v">' + escapeHtml(sig.external_taxonomy_id) + '</span></div>' : '') +
        '<div class="dkv"><span class="dkv-k">Data provider</span><span class="dkv-v">' + escapeHtml(sig.data_provider || "—") + '</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="detail-section">' +
      '<div class="detail-section-label">Deployments</div>' +
      '<div class="detail-deployments">' +
        (Array.isArray(sig.deployments) && sig.deployments.length
          ? sig.deployments.map((d) => '<div class="detail-deployment"><span class="dep-platform">' + escapeHtml(d.platform || d.type) + '</span><span class="dep-live ' + (d.is_live ? "yes" : "") + '">' + (d.is_live ? "live" : "ready") + '</span></div>').join("")
          : '<div class="dep-live">No deployments declared</div>') +
      '</div>' +
    '</div>';

  document.getElementById("detail-footer").innerHTML =
    '<button class="btn-primary" id="detail-activate"><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate to mock_dsp</span></button>' +
    '<div class="activation-status" id="detail-status"></div>';
  document.getElementById("detail-activate").addEventListener("click", () => activateFromDetail(sig));
}

function closeDetail() {
  document.getElementById("detail-panel").classList.remove("open");
  document.getElementById("backdrop").classList.remove("open");
  state.detail = null;
}
document.getElementById("detail-close").addEventListener("click", closeDetail);
document.getElementById("backdrop").addEventListener("click", closeDetail);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.detail) closeDetail();
});

async function activateFromDetail(sig) {
  const btn = document.getElementById("detail-activate");
  const status = document.getElementById("detail-status");
  btn.disabled = true;
  status.innerHTML = '<span class="spinner"></span> activating…';

  const sid = sig.signal_agent_segment_id || sig.signal_id?.id || "";
  try {
    const act = await callTool("activate_signal", {
      signal_agent_segment_id: sid,
      deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
    });
    const taskId = act.task_id;
    status.innerHTML = '<span class="spinner"></span> polling task ' + taskId.slice(0, 14) + '…';

    let finalState = null;
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1200));
      const op = await callTool("get_operation_status", { task_id: taskId });
      if (op.status === "completed" || op.status === "failed") { finalState = op; break; }
      status.innerHTML = '<span class="spinner"></span> ' + op.status + ' · ' + (i + 1) + '/8';
    }

    if (finalState && finalState.status === "completed") {
      status.className = "activation-status success";
      status.textContent = "✓ activated";
      const deps = (finalState.deployments || []).map((d) => {
        const key = d.activation_key?.segment_id || "";
        return '<div class="ak-row"><span class="ak-platform">' + escapeHtml(d.platform || d.type) + '</span> → <span class="ak-key">' + escapeHtml(key) + '</span></div>';
      }).join("");
      document.getElementById("detail-footer").insertAdjacentHTML("beforeend",
        '<div class="activation-keys">' + (deps || '<div>No deployments returned</div>') + '</div>');
    } else if (finalState && finalState.status === "failed") {
      status.className = "activation-status error";
      status.textContent = "✗ activation failed";
    } else {
      status.className = "activation-status";
      status.textContent = "still processing (task " + taskId.slice(0, 14) + "…)";
    }
  } catch (e) {
    status.className = "activation-status error";
    status.textContent = "✗ " + e.message;
    btn.disabled = false;
  }
}
</script>`;
}
