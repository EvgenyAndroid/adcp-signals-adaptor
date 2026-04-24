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
    <symbol id="icon-treemap" viewBox="0 0 20 20"><rect x="2" y="2" width="11" height="8" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="13" y="2" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="13" y="7" width="5" height="3" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="2" y="10" width="6" height="8" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="8" y="10" width="10" height="8" fill="none" stroke="currentColor" stroke-width="1.4"/></symbol>
    <symbol id="icon-builder" viewBox="0 0 20 20"><circle cx="5" cy="5" r="1.8" fill="currentColor"/><circle cx="5" cy="10" r="1.8" fill="currentColor"/><circle cx="5" cy="15" r="1.8" fill="currentColor"/><line x1="9" y1="5" x2="17" y2="5" stroke="currentColor" stroke-width="1.4"/><line x1="9" y1="10" x2="17" y2="10" stroke="currentColor" stroke-width="1.4"/><line x1="9" y1="15" x2="15" y2="15" stroke="currentColor" stroke-width="1.4"/></symbol>
    <symbol id="icon-activations" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 5 L10 10 L13 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></symbol>
    <symbol id="icon-plus" viewBox="0 0 20 20"><line x1="10" y1="4" x2="10" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="icon-minus" viewBox="0 0 20 20"><line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
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

      <div class="nav-group-label">Visualization</div>
      <button class="nav-item" data-tab="treemap">
        <svg class="ico"><use href="#icon-treemap"/></svg><span>Treemap</span>
      </button>
      <button class="nav-item" data-tab="builder">
        <svg class="ico"><use href="#icon-builder"/></svg><span>Builder</span>
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
      <button class="nav-item" data-tab="portfolio">
        <svg class="ico"><use href="#icon-chart"/></svg><span>Portfolio</span>
        <span class="nav-tag">new</span>
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
      <button class="nav-item" data-tab="planner">
        <svg class="ico"><use href="#icon-chart"/></svg><span>Scenario</span>
        <span class="nav-tag">new</span>
      </button>
      <button class="nav-item" data-tab="snapshots">
        <svg class="ico"><use href="#icon-book"/></svg><span>Snapshots</span>
        <span class="nav-tag">new</span>
      </button>
      <button class="nav-item" data-tab="freshness">
        <svg class="ico"><use href="#icon-info"/></svg><span>Freshness</span>
        <span class="nav-tag">new</span>
      </button>
      <button class="nav-item" data-tab="seasonality">
        <svg class="ico"><use href="#icon-info"/></svg><span>Seasonality</span>
        <span class="nav-tag">new</span>
      </button>
      <button class="nav-item" data-tab="federation">
        <svg class="ico"><use href="#icon-network"/></svg><span>Federation</span>
        <span class="nav-tag nav-tag-muted">a2a</span>
      </button>
      <button class="nav-item" data-tab="orchestrator">
        <svg class="ico"><use href="#icon-network"/></svg><span>Orchestrator</span>
        <span class="nav-tag">new</span>
      </button>
      <button class="nav-item" data-tab="activations">
        <svg class="ico"><use href="#icon-activations"/></svg><span>Activations</span>
        <span class="nav-count" id="nav-activations-count">—</span>
      </button>
      <button class="nav-item" data-tab="destinations">
        <svg class="ico"><use href="#icon-arrow-right"/></svg><span>Destinations</span>
        <span class="nav-count" id="nav-destinations-count">—</span>
      </button>

      <div class="nav-group-label">Reference</div>
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
    </nav>

    <div class="sidebar-footer">
      <div class="kv"><span class="k">Version</span><span class="v mono">3.0 GA</span></div>
      <div class="kv"><span class="k">Client</span><span class="v mono">@adcp/5.13</span></div>
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
        <button class="kbd-hint" id="kbd-hint-btn" title="Keyboard shortcuts (press ?)">?</button>
      </div>
    </header>

    <div class="workspace">

      <!-- ── TAB: Discover ──────────────────────────────────────────────── -->
      <section class="tab-pane active" data-tab="discover">
        <div class="pane-header">
          <div>
            <h1 class="pane-title">Brief-driven discovery</h1>
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
            <h1 class="pane-title">UCP concept registry</h1>
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
            <h1 class="pane-title">Embedding space</h1>
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
            <h1 class="pane-title">Audience Composer</h1>
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
            <h1 class="pane-title">Agent Federation <span class="pill pill-success" style="margin-left:8px;font-size:10px">A2A live</span></h1>
            <p class="pane-subtitle">Cross-agent search across the AdCP Signals Discovery ecosystem. Live partner: Dstillery. More coming.</p>
          </div>
        </div>
        <div class="lab-grid">
          <div class="lab-panel">
            <div class="lab-panel-title">Federated search</div>
            <label class="lab-label">Brief</label>
            <textarea id="fed-brief" class="lab-input" rows="4" placeholder="automotive intenders"></textarea>
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
            <h1 class="pane-title">Multi-Agent Orchestrator <span class="pill pill-accent" style="margin-left:8px;font-size:10px">Sec-48</span></h1>
            <p class="pane-subtitle">Live view of every AdCP agent we know about. Probe each MCP endpoint in parallel to see who's up, what they expose, and how fast they respond. Fan out a signals brief to all live signals agents with one click, or compare tool surfaces side-by-side.</p>
          </div>
          <div class="activations-controls">
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
        <div class="lab-panel lab-panel-full" style="margin-top:14px">
          <div class="lab-panel-title">Capability matrix <button class="btn-secondary" id="orch-matrix-run" style="margin-left:8px;font-size:11px;padding:4px 10px">Build matrix</button></div>
          <div id="orch-matrix"><div class="empty-state"><div class="empty-desc">Click <strong>Build matrix</strong> to compare every live agent's tool surface side-by-side. Each row is a tool name; columns are agents; cells mark which agents declare that tool.</div></div></div>
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
                <th></th>
              </tr>
            </thead>
            <tbody id="activations-tbody">
              <tr><td colspan="7" class="table-empty"><span class="spinner"></span> loading activations…</td></tr>
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

<!-- Keyboard shortcuts cheat-sheet (Sec-38 A7). Opened via \`?\`. -->
<div id="kbd-overlay" class="kbd-overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
  <div class="kbd-card">
    <h3>Keyboard shortcuts</h3>
    <div class="kbd-row"><span>Open Discover</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">d</span></span></div>
    <div class="kbd-row"><span>Open Catalog</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">c</span></span></div>
    <div class="kbd-row"><span>Open Builder</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">b</span></span></div>
    <div class="kbd-row"><span>Open Treemap</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">t</span></span></div>
    <div class="kbd-row"><span>Open Overlap</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">o</span></span></div>
    <div class="kbd-row"><span>Open Embedding</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">e</span></span></div>
    <div class="kbd-row"><span>Open Capabilities</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">k</span></span></div>
    <div class="kbd-row"><span>Open Dev kit</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">v</span></span></div>
    <div class="kbd-row"><span>Open Destinations</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">n</span></span></div>
    <div class="kbd-row"><span>Open Embedding Lab</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">x</span></span></div>
    <div class="kbd-row"><span>Open Portfolio</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">p</span></span></div>
    <div class="kbd-row"><span>Open Seasonality</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">s</span></span></div>
    <div class="kbd-row"><span>Open Federation</span><span class="kbd-keys"><span class="kbd-key">g</span><span class="kbd-key">f</span></span></div>
    <div class="kbd-row"><span>Expand / collapse detail panel</span><span class="kbd-keys"><span class="kbd-key">f</span></span></div>
    <div class="kbd-row"><span>Close detail panel</span><span class="kbd-keys"><span class="kbd-key">Esc</span></span></div>
    <div class="kbd-row"><span>Toggle this sheet</span><span class="kbd-keys"><span class="kbd-key">?</span></span></div>
  </div>
</div>

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
.pill-error   { background: rgba(255, 92, 92, 0.18); color: var(--error); }
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

/* Mode toggle — switches between get_signals and query_signals_nl */
.mode-toggle {
  display: flex; gap: 0;
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 3px;
  position: relative;
}
/* CSS-only hover tooltip for the mode buttons. data-tooltip attribute
   supplies the body copy; positioned below the toggle so it doesn't
   collide with the sticky top bar. Shown after 350ms so an accidental
   mouseover doesn't flash the tip. */
.mode-btn[data-tooltip]:hover::before,
.mode-btn[data-tooltip]:hover::after {
  opacity: 1;
  transition-delay: 350ms;
}
.mode-btn[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute; left: 50%; top: calc(100% + 10px);
  transform: translateX(-50%);
  background: var(--bg-surface); color: var(--text);
  border: 1px solid var(--border-strong); border-radius: var(--radius-md);
  padding: 10px 14px; font-size: 12px; line-height: 1.55;
  font-weight: 400; letter-spacing: 0;
  width: 320px; text-align: left; white-space: normal;
  box-shadow: 0 12px 32px rgba(0,0,0,0.5);
  opacity: 0; pointer-events: none;
  transition: opacity 0.15s;
  z-index: 50;
}
.mode-btn[data-tooltip]::before {
  content: "";
  position: absolute; left: 50%; top: calc(100% + 4px);
  transform: translateX(-50%) rotate(45deg);
  width: 8px; height: 8px;
  background: var(--bg-surface);
  border-left: 1px solid var(--border-strong);
  border-top: 1px solid var(--border-strong);
  opacity: 0; pointer-events: none;
  transition: opacity 0.15s;
  z-index: 51;
}
.mode-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 14px; font-size: 12.5px; font-weight: 500;
  color: var(--text-dim);
  border-radius: var(--radius-sm);
  transition: all 0.12s;
}
.mode-btn:hover { color: var(--text); background: var(--bg-raised); }
.mode-btn.active {
  background: var(--accent); color: #fff;
}
.mode-btn.active:hover { background: var(--accent-hot); }
.mode-btn .ico { width: 13px; height: 13px; }
.mode-btn .mode-tool {
  font-size: 10px; opacity: 0.7;
  padding: 1px 6px; border-radius: 8px;
  background: rgba(255,255,255,0.08);
}
.mode-btn.active .mode-tool { background: rgba(0,0,0,0.2); }

/* NL Query result block — different shape from brief results */
.nl-result-shell { margin-top: 8px; }
.nl-result-hero {
  background: linear-gradient(135deg, rgba(79,142,255,0.1) 0%, rgba(139,92,246,0.1) 100%);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-lg); padding: 18px 22px;
  margin-bottom: 16px;
  display: grid; grid-template-columns: auto 1fr auto; gap: 18px; align-items: center;
}
.nl-result-hero .nl-size { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; color: var(--accent-hot); font-variant-numeric: tabular-nums; }
.nl-result-hero .nl-size-label { font-size: 10.5px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500; }
.nl-result-hero .nl-conf { display: flex; flex-direction: column; gap: 3px; }
.nl-result-hero .nl-conf-value { font-family: var(--font-mono); font-size: 14px; font-weight: 600; }
.nl-ast-block {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 14px 18px; margin-bottom: 14px;
}
.nl-ast-block summary { cursor: pointer; list-style: none; outline: none; }
.nl-ast-block summary::-webkit-details-marker { display: none; }
.nl-ast-block summary .label { font-size: 11px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500; }
.nl-ast-tree { margin-top: 10px; font-family: var(--font-mono); font-size: 11.5px; line-height: 1.7; color: var(--text-dim); }
.nl-ast-tree .op { color: var(--warning); font-weight: 600; }
.nl-ast-tree .leaf { color: var(--text); }
.nl-ast-tree .depth-1 { padding-left: 14px; }
.nl-ast-tree .depth-2 { padding-left: 28px; }
.nl-ast-tree .depth-3 { padding-left: 42px; }

.nl-match-card {
  display: grid; grid-template-columns: 1fr auto auto; gap: 14px;
  align-items: center;
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 12px 16px;
  margin-bottom: 8px; cursor: pointer;
  transition: all 0.12s;
}
.nl-match-card:hover { background: var(--bg-hover); border-color: var(--border-strong); }
.nl-match-card .nl-m-name { font-weight: 500; font-size: 13.5px; }
.nl-match-card .nl-m-reason {
  display: flex; gap: 5px; align-items: center;
  font-size: 11px; color: var(--text-mut);
  margin-top: 4px; font-family: var(--font-mono);
}
.nl-match-card .nl-m-reason .ico { width: 12px; height: 12px; opacity: 0.6; }
.nl-match-card .nl-m-sub { font-size: 11.5px; color: var(--text-mut); font-family: var(--font-mono); margin-top: 2px; }
.nl-match-card .nl-m-method { font-size: 10.5px; padding: 2px 8px; border-radius: 8px; font-family: var(--font-mono); white-space: nowrap; }
.nl-match-card .nl-m-method.exact_rule { background: var(--success-dim); color: var(--success); }
.nl-match-card .nl-m-method.embedding { background: var(--accent-dim); color: var(--accent); }
.nl-match-card .nl-m-method.lexical { background: var(--warning-dim); color: var(--warning); }
.nl-match-card .nl-m-score { font-family: var(--font-mono); font-size: 12.5px; font-weight: 600; color: var(--accent-hot); min-width: 54px; text-align: right; }

/* Similar-signals block in signal detail panel */
.detail-similar {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 12px 14px;
}
.detail-similar-btn {
  width: 100%; background: transparent; color: var(--accent);
  padding: 4px 0; font-size: 12.5px; font-weight: 500;
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
.detail-similar-btn:hover { color: var(--accent-hot); }
.detail-similar-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.detail-similar-item {
  display: grid; grid-template-columns: 1fr auto; gap: 10px;
  align-items: center; padding: 8px 10px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); cursor: pointer;
  transition: all 0.12s;
}
.detail-similar-item:hover { border-color: var(--accent-border); background: var(--bg-hover); }
.detail-similar-item .ds-name { font-size: 12.5px; font-weight: 500; }
.detail-similar-item .ds-score {
  font-family: var(--font-mono); font-size: 11px; font-weight: 600;
  padding: 2px 7px; border-radius: 8px;
  background: var(--accent-dim); color: var(--accent);
}

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
.pill-dts {
  background: rgba(16, 185, 129, 0.12);
  color: var(--success);
  font-size: 9.5px;
  font-family: var(--font-mono);
  padding: 1px 6px;
  border-radius: 6px;
  margin-left: 4px;
  font-weight: 500;
  letter-spacing: 0.04em;
}
.pill-freshness {
  font-size: 9.5px; font-family: var(--font-mono);
  padding: 1px 6px; border-radius: 6px;
  margin-left: 4px; font-weight: 500; letter-spacing: 0.04em;
}
.pill-fresh-7d      { background: rgba(79,142,255,0.12); color: var(--accent); }
.pill-fresh-30d     { background: rgba(139,92,246,0.12); color: var(--violet); }
.pill-fresh-static  { background: var(--bg-raised); color: var(--text-mut); }
.pill-sensitive {
  background: rgba(245,158,11,0.15); color: var(--warning);
  font-size: 9.5px; font-family: var(--font-mono);
  padding: 1px 6px; border-radius: 6px;
  margin-left: 4px; font-weight: 500; letter-spacing: 0.04em;
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
.concept-card .cc-cta {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px dashed var(--border);
  font-size: 11.5px; color: var(--accent);
  display: flex; align-items: center; gap: 6px;
  opacity: 0; transition: opacity 0.15s;
}
.concept-card:hover .cc-cta { opacity: 1; }
.concept-card .cc-cta svg { transition: transform 0.12s; }
.concept-card:hover .cc-cta svg { transform: translateX(3px); }

/* UCP banner at top of Concepts tab — makes the connection between
   this registry and the live embedding infrastructure explicit. */
.ucp-banner {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0;
  background: linear-gradient(135deg, rgba(79,142,255,0.08) 0%, rgba(139,92,246,0.08) 100%);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-lg);
  padding: 14px 18px; margin-bottom: 18px;
}
.ucp-banner-kv {
  padding: 4px 14px;
  border-right: 1px solid var(--border);
}
.ucp-banner-kv:last-child { border-right: none; }
.ucp-banner-label {
  display: block;
  font-size: 10.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500;
  margin-bottom: 3px;
}
.ucp-banner-v { font-size: 13px; color: var(--text); font-weight: 500; }
.ucp-banner-v .pill { font-size: 10.5px; }

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

/* ── Detail panel (Sec-39: three-mode sizing + rail + 2-col grid) ─────── */
.detail-panel {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: var(--detail-w);
  max-width: 100vw;
  background: var(--bg-surface);
  border-left: 1px solid var(--border);
  box-shadow: -20px 0 60px rgba(0, 0, 0, 0.4);
  display: flex; flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1),
              width 0.28s cubic-bezier(0.32, 0.72, 0, 1);
  z-index: 100;
}
.detail-panel.open { transform: translateX(0); }
/* Sizing modes */
.detail-panel[data-mode="narrow"] { width: var(--detail-w); }
.detail-panel[data-mode="wide"]   { width: min(880px, 95vw); }
.detail-panel[data-mode="full"]   { width: min(1240px, 98vw); }

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
.detail-header-actions { display: flex; gap: 4px; }
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
.detail-icon-btn {
  color: var(--text-mut); padding: 6px;
  border-radius: var(--radius-sm);
  transition: background 0.12s, color 0.12s;
  background: transparent; border: 0; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.detail-icon-btn:hover { background: var(--bg-hover); color: var(--text); }
.detail-icon-btn .ico { width: 18px; height: 18px; }
.detail-panel[data-mode="wide"] #detail-expand { color: var(--accent); }
.detail-panel[data-mode="full"] #detail-expand { color: var(--accent); background: var(--accent-dim); }

/* Body is a flex row: rail (only in full mode) + content */
.detail-panel-body {
  flex: 1; min-height: 0;
  display: flex; gap: 0; overflow: hidden;
}
.detail-rail {
  display: none;
  flex: 0 0 180px;
  border-right: 1px solid var(--border);
  padding: 18px 14px;
  overflow-y: auto;
  background: var(--bg-base);
}
.detail-panel[data-mode="full"] .detail-rail { display: block; }
.detail-rail-label {
  font-size: 10px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.08em;
  margin-bottom: 8px; font-weight: 500;
}
.detail-rail-list { display: flex; flex-direction: column; gap: 2px; }
.detail-rail-item {
  display: block;
  background: transparent; border: 0; text-align: left;
  color: var(--text-dim); padding: 6px 10px;
  border-radius: var(--radius-sm); cursor: pointer;
  font-size: 12px; font-family: var(--font-sans);
  transition: background 0.12s, color 0.12s;
}
.detail-rail-item:hover { background: var(--bg-hover); color: var(--text); }
.detail-rail-item.active { background: var(--accent-dim); color: var(--accent); font-weight: 500; }

.detail-body {
  flex: 1; overflow-y: auto;
  padding: 18px 22px;
  scroll-behavior: smooth;
}
/* Multi-column grid when panel is wide or full */
.detail-panel[data-mode="wide"] .detail-body,
.detail-panel[data-mode="full"] .detail-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px 22px;
  align-content: flex-start;
}
.detail-panel[data-mode="wide"] .detail-section,
.detail-panel[data-mode="full"] .detail-section {
  margin-bottom: 0;
}
/* Mark sections that should always span both columns */
.detail-panel[data-mode="wide"] .detail-section.span-full,
.detail-panel[data-mode="full"] .detail-section.span-full {
  grid-column: 1 / -1;
}

.detail-section {
  margin-bottom: 22px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  transition: border-color 0.12s, background 0.12s;
}
.detail-section:last-child { margin-bottom: 0; }
/* Collapsible section header: clickable, shows chevron */
.detail-section-label {
  font-size: 10.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.1em; font-weight: 500;
  margin-bottom: 8px;
  cursor: pointer; user-select: none;
  display: flex; align-items: center; gap: 6px;
  padding: 2px 0;
}
.detail-section-label::before {
  content: ""; width: 0; height: 0;
  border-left: 5px solid var(--text-mut);
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  transform: rotate(90deg);
  transition: transform 0.15s;
  flex: 0 0 auto;
}
.detail-section.collapsed .detail-section-label::before {
  transform: rotate(0deg);
}
.detail-section-label:hover { color: var(--text); }
.detail-section.collapsed > *:not(.detail-section-label) { display: none; }
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

/* ── Treemap ─────────────────────────────────────────────────────────── */
.treemap-shell {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); overflow: hidden;
}
.treemap-canvas {
  position: relative;
  width: 100%; height: 620px;
  min-height: 420px;
}
.treemap-canvas svg {
  width: 100%; height: 100%; display: block;
}
.treemap-legend {
  display: flex; gap: 10px; flex-wrap: wrap; max-width: 560px;
  font-size: 11.5px; color: var(--text-dim);
}
.treemap-legend .lg-item {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 8px; background: var(--bg-raised);
  border-radius: 10px; border: 1px solid var(--border);
}
.treemap-legend .lg-swatch {
  width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0;
}
.treemap-cell {
  cursor: pointer;
  transition: filter 0.12s;
}
.treemap-cell:hover { filter: brightness(1.25); }
/* Halo-stroke approach: white fill with a dark stroke outline and
   paint-order=stroke-fill means the fill paints over the stroke,
   leaving a thin dark halo around each glyph. Readable on any
   background — green, purple, magenta, orange, cyan — without
   luminance detection. Same pattern MapBox + OSM use for labels. */
.treemap-cell-label {
  fill: #ffffff;
  stroke: rgba(10, 14, 22, 0.85);
  stroke-width: 2.8px;
  stroke-linejoin: round;
  paint-order: stroke fill;
  font-size: 11px; font-weight: 600;
  pointer-events: none; user-select: none;
}
.treemap-cell-label.light { fill: #ffffff; } /* legacy hook — no-op now */
.treemap-tooltip {
  position: fixed; pointer-events: none;
  background: var(--bg-surface); border: 1px solid var(--border-strong);
  border-radius: var(--radius-md); padding: 10px 12px;
  font-size: 12px; box-shadow: 0 12px 32px rgba(0,0,0,0.5);
  opacity: 0; transition: opacity 0.12s;
  max-width: 280px; z-index: 150;
}
.treemap-tooltip.show { opacity: 1; }
.treemap-tooltip .tt-name { font-weight: 600; margin-bottom: 4px; color: var(--text); }
.treemap-tooltip .tt-row { display: flex; justify-content: space-between; gap: 12px; font-family: var(--font-mono); font-size: 11px; }
.treemap-tooltip .tt-row .k { color: var(--text-mut); }
.treemap-tooltip .tt-row .v { color: var(--text-dim); }

/* ── Builder ─────────────────────────────────────────────────────────── */
.builder-grid {
  display: grid; grid-template-columns: 380px 1fr; gap: 20px;
}
@media (max-width: 960px) { .builder-grid { grid-template-columns: 1fr; } }
.builder-rules-col, .builder-preview-col {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 18px;
}
.builder-section-label {
  font-size: 11px; color: var(--text-dim);
  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500;
  margin-bottom: 10px;
}
.builder-rules { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.builder-rule {
  display: grid; grid-template-columns: 1fr 70px 1fr auto;
  gap: 6px; align-items: center;
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 6px 8px;
}
.builder-rule select {
  background: var(--bg-input); color: var(--text); border: 1px solid var(--border);
  padding: 6px 8px; border-radius: var(--radius-sm); font-size: 12.5px;
  font-family: inherit; outline: none; min-width: 0;
}
.builder-rule select:focus { border-color: var(--border-focus); }
.builder-rule button.remove-btn {
  color: var(--text-mut); padding: 4px; border-radius: var(--radius-sm);
  transition: all 0.12s; line-height: 0;
}
.builder-rule button.remove-btn:hover { color: var(--error); background: var(--error-dim); }
.builder-input {
  width: 100%; background: var(--bg-input); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 8px 10px; font-size: 13px; font-family: inherit; outline: none;
}
.builder-input:focus { border-color: var(--border-focus); }
.builder-row-actions { display: flex; gap: 8px; }
.builder-row-actions .btn-secondary { flex: 1; justify-content: center; }
#reset-rules-btn:disabled { opacity: 0.4; cursor: not-allowed; }
#reset-rules-btn:hover:not(:disabled) { border-color: var(--error); color: var(--error); }

/* Inline confirm when a template would overwrite non-empty rules */
.template-confirm {
  margin-top: 8px; padding: 10px 12px;
  background: var(--warning-dim);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-md);
  font-size: 12px; color: var(--warning);
  display: flex; flex-direction: column; gap: 8px;
}
.template-confirm-actions { display: flex; gap: 6px; }
.template-confirm-actions .btn-primary,
.template-confirm-actions .btn-secondary { flex: 1; justify-content: center; }
.builder-note {
  margin-top: 8px; font-size: 11.5px; color: var(--text-mut);
  font-family: var(--font-mono); line-height: 1.5;
  min-height: 18px;
}
.builder-note.error { color: var(--error); }
.builder-note.success { color: var(--success); }

.preview-hero {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 18px;
}
.preview-hero-label {
  font-size: 11px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500;
}
.preview-hero-value {
  font-size: 40px; font-weight: 700; margin: 4px 0;
  letter-spacing: -0.03em; font-variant-numeric: tabular-nums;
  color: var(--accent-hot);
  transition: color 0.15s;
}
.preview-hero-value.loading { color: var(--text-mut); opacity: 0.5; }
.preview-hero-sub { font-size: 12.5px; color: var(--text-dim); margin-bottom: 14px; font-family: var(--font-mono); }
.coverage-bar {
  position: relative; height: 4px; background: var(--border);
  border-radius: 2px; overflow: hidden;
}
.coverage-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent) 0%, var(--accent-hot) 100%);
  width: 0%; transition: width 0.28s cubic-bezier(0.32, 0.72, 0, 1);
}
.preview-meta {
  margin-top: 12px; font-size: 12px; color: var(--text-mut); font-family: var(--font-mono);
}
.preview-confidence-pill {
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 600;
  padding: 2px 7px; border-radius: 8px; letter-spacing: 0.05em; text-transform: uppercase;
  margin-left: 8px; vertical-align: 2px;
}
.preview-confidence-pill.high { background: var(--success-dim); color: var(--success); }
.preview-confidence-pill.medium { background: var(--warning-dim); color: var(--warning); }
.preview-confidence-pill.low { background: var(--error-dim); color: var(--error); }
.preview-floor-warning {
  margin-top: 12px; padding: 10px 12px;
  background: var(--warning-dim);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-md);
  font-size: 12px; color: var(--warning);
  display: flex; gap: 8px; align-items: flex-start;
}
.preview-floor-warning .ico { flex-shrink: 0; margin-top: 2px; stroke: var(--warning); }
.preview-explain {
  margin-top: 14px; padding: 10px 12px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 12.5px; color: var(--text-dim); line-height: 1.55;
  font-style: italic;
  min-height: 0;
}
.preview-explain:empty { display: none; }
.preview-explain::before { content: "→ "; color: var(--accent); font-style: normal; font-weight: 600; }

/* Similar-signals block — semantic overlap check on each rule change */
.similar-signals { display: flex; flex-direction: column; gap: 8px; }
.similar-card {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 10px 14px;
  cursor: pointer; transition: all 0.12s;
  display: grid; grid-template-columns: 1fr auto;
  gap: 12px; align-items: center;
}
.similar-card:hover { background: var(--bg-hover); border-color: var(--accent-border); }
.similar-card .sc-main { min-width: 0; }
.similar-card .sc-nm {
  font-size: 13px; font-weight: 500; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.similar-card .sc-sub {
  font-size: 11.5px; color: var(--text-mut); font-family: var(--font-mono);
  margin-top: 1px;
}
.similar-card .sc-rank {
  font-size: 11px; font-weight: 600;
  padding: 3px 9px; border-radius: 10px;
  font-family: var(--font-mono); white-space: nowrap;
}
.similar-card .sc-rank.high   { background: var(--warning-dim); color: var(--warning); }
.similar-card .sc-rank.medium { background: var(--accent-dim);  color: var(--accent); }
.similar-card .sc-rank.low    { background: var(--bg-surface);  color: var(--text-mut); }
.similar-warning {
  background: var(--warning-dim);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-md);
  padding: 10px 12px; margin-bottom: 8px;
  font-size: 12.5px; color: var(--warning);
  display: flex; gap: 8px; align-items: flex-start;
}
.similar-warning .ico { flex-shrink: 0; margin-top: 2px; stroke: var(--warning); }

.funnel-chart {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 14px;
  min-height: 120px;
}
.funnel-step {
  display: grid; grid-template-columns: 1fr 100px;
  gap: 12px; align-items: center;
  margin-bottom: 8px;
}
.funnel-step:last-child { margin-bottom: 0; }
.funnel-step-label {
  font-size: 12px; color: var(--text-dim);
  font-family: var(--font-mono);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.funnel-step-bar {
  position: relative; height: 20px;
  background: var(--bg-surface); border-radius: var(--radius-sm);
  overflow: hidden;
}
.funnel-step-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: linear-gradient(90deg, var(--accent-dim) 0%, var(--accent) 100%);
  transition: width 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}
.funnel-step-meta {
  font-size: 11px; color: var(--text-mut);
  font-family: var(--font-mono); text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ── Capabilities ────────────────────────────────────────────────────── */
.caps-section {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 18px 20px;
  margin-bottom: 14px;
}
.caps-section-title {
  font-size: 11.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500;
  margin-bottom: 12px;
}
.caps-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.caps-card {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 12px 14px;
}
.caps-card-label {
  font-size: 10.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.06em;
}
.caps-card-value {
  font-size: 17px; font-weight: 600; margin-top: 3px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.caps-card-value.small { font-size: 13px; font-weight: 500; font-family: var(--font-mono); letter-spacing: 0; }
.caps-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.caps-dest-list {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}
.caps-dest {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 10px 14px;
}
.caps-dest-meta { display: flex; flex-direction: column; }
.caps-dest-id { font-family: var(--font-mono); font-size: 11px; color: var(--text-mut); }
.caps-dest-name { font-weight: 500; font-size: 13px; }
.caps-raw-json {
  font-family: var(--font-mono); font-size: 12px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 14px 16px;
  overflow-x: auto; overflow-y: auto;
  max-height: 480px;
  line-height: 1.55;
  /* Honor the 2-space indentation from JSON.stringify — without this
     all the newlines collapse and the block renders as one wrapped blob. */
  white-space: pre;
  tab-size: 2;
}
.caps-raw-json .json-key     { color: var(--accent-hot); }
.caps-raw-json .json-str     { color: var(--success); }
.caps-raw-json .json-num     { color: var(--warning); }
.caps-raw-json .json-bool    { color: var(--violet); }
.caps-raw-json .json-null    { color: var(--text-mut); }
.caps-raw-json .json-punct   { color: var(--text-mut); }
.caps-raw-json details summary { cursor: pointer; color: var(--text-dim); outline: none; list-style: none; }
.caps-raw-json details summary::-webkit-details-marker { display: none; }

/* MCP tool catalog cards inside Capabilities tab */
.tool-card {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); margin-bottom: 8px;
}
.tool-card[open] { border-color: var(--border-strong); }
.tool-card summary {
  padding: 12px 14px; cursor: pointer;
  list-style: none; outline: none;
}
.tool-card summary::-webkit-details-marker { display: none; }
.tool-card-head { display: flex; flex-direction: column; gap: 4px; }
.tool-card-main { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tool-card-name { font-family: var(--font-mono); font-size: 13px; font-weight: 600; color: var(--accent-hot); }
.tool-card-desc { font-size: 12px; color: var(--text-dim); line-height: 1.5; }
.tool-card-body {
  padding: 0 14px 14px 14px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}
.tool-card-props-label {
  font-size: 10.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500;
  margin-bottom: 8px;
}
.tool-card-props { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.tool-prop {
  padding: 8px 10px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.tool-prop-key { font-size: 12.5px; }
.tool-prop-type { color: var(--text-mut); font-size: 11px; margin-left: 6px; }
.tool-prop-desc { color: var(--text-dim); font-size: 11.5px; margin-top: 3px; line-height: 1.5; }
.tool-prop-enum { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; }
.tool-prop-enum span {
  font-size: 10.5px; padding: 1px 7px; border-radius: 8px;
  background: var(--bg-surface); color: var(--text-dim);
  border: 1px solid var(--border);
}
.tool-card-curl-label {
  font-size: 10.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500;
  margin-bottom: 6px;
}
.tool-card-curl {
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 10px 12px;
  font-family: var(--font-mono); font-size: 11.5px;
  color: var(--text); overflow-x: auto; margin: 0;
  line-height: 1.6; white-space: pre;
}

/* REST endpoint reference */
.rest-table-shell {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); overflow: hidden;
}
.rest-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.rest-table th {
  text-align: left; padding: 8px 14px;
  font-weight: 500; font-size: 10.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.06em;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}
.rest-table td { padding: 8px 14px; border-bottom: 1px solid var(--border); }
.rest-table tr:last-child td { border-bottom: none; }
.rest-method { font-family: var(--font-mono); font-weight: 600; font-size: 10.5px; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
.rest-method.m-get { background: rgba(79,142,255,0.15); color: var(--accent); }
.rest-method.m-post { background: rgba(16,185,129,0.15); color: var(--success); }
.rest-method.m-delete, .rest-method.m-put { background: rgba(245,158,11,0.15); color: var(--warning); }
.rest-path { font-family: var(--font-mono); font-size: 12px; color: var(--text); }
.rest-note { color: var(--text-dim); font-size: 12px; }

/* DTS label block in signal detail panel */
.dts-block summary::-webkit-details-marker { display: none; }
.dts-block summary { list-style: none; outline: none; padding: 6px 0; }
.dts-block[open] summary { margin-bottom: 10px; }
.dts-groups { display: flex; flex-direction: column; gap: 14px; }
.dts-group {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 10px 14px;
}
.dts-group-title {
  font-size: 10.5px; color: var(--accent);
  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;
  margin-bottom: 8px;
}
.dts-kv-list { font-size: 12.5px; }
.dts-kv {
  display: grid; grid-template-columns: 150px 1fr;
  gap: 10px; padding: 4px 0;
  border-bottom: 1px dashed var(--border);
}
.dts-kv:last-child { border-bottom: none; }
.dts-k { color: var(--text-mut); font-size: 11.5px; padding-top: 1px; }
.dts-v { color: var(--text-dim); font-family: var(--font-mono); font-size: 11.5px; word-break: break-word; }
.dts-v a { color: var(--accent); }

/* ── Activations ─────────────────────────────────────────────────────── */
.activations-controls { display: flex; gap: 8px; align-items: center; }
.status-dot.submitted { background: var(--text-mut); }
.status-dot.working { background: var(--warning); animation: pulse 1.4s ease-in-out infinite; }
.status-dot.completed { background: var(--success); }
.status-dot.failed { background: var(--error); }
.status-dot.canceled, .status-dot.rejected { background: var(--text-mut); }
.td-time {
  font-family: var(--font-mono); font-size: 11.5px;
  color: var(--text-mut); font-variant-numeric: tabular-nums;
}
.td-signal-ref {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-mut);
  margin-top: 2px;
}

/* Overlap tab (Sec-37 B1) */
.overlap-shell { display: grid; grid-template-columns: 340px 1fr; gap: 20px; }
@media (max-width: 960px) { .overlap-shell { grid-template-columns: 1fr; } }
.overlap-picker, .overlap-results {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 18px;
}
.overlap-chips { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; min-height: 20px; }
.overlap-chip {
  display: grid; grid-template-columns: 1fr auto;
  gap: 8px; align-items: center;
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 6px 10px;
}
.overlap-chip .oc-name { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.overlap-chip .oc-remove {
  color: var(--text-mut); padding: 2px;
  line-height: 0;
}
.overlap-chip .oc-remove:hover { color: var(--error); }
.overlap-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 0 10px;
}
.overlap-search:focus-within { border-color: var(--border-focus); }
.overlap-search .ico { color: var(--text-mut); }
.overlap-search input {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--text); font-size: 13px; padding: 8px 0;
  font-family: inherit;
}
.overlap-suggestions {
  max-height: 220px; overflow-y: auto; margin-top: 6px;
  display: flex; flex-direction: column; gap: 3px;
}
.overlap-suggestion {
  padding: 6px 10px; font-size: 12px; cursor: pointer;
  border-radius: var(--radius-sm); border: 1px solid transparent;
}
.overlap-suggestion:hover { background: var(--bg-raised); border-color: var(--border); }
.overlap-suggestion .sub { color: var(--text-mut); font-size: 10.5px; margin-top: 1px; }

/* Overlap heat-matrix */
.overlap-matrix { border-collapse: collapse; font-size: 11px; }
.overlap-matrix th, .overlap-matrix td {
  border: 1px solid var(--border); padding: 6px 8px; text-align: center;
  font-family: var(--font-mono);
}
.overlap-matrix th { background: var(--bg-raised); color: var(--text-dim); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.overlap-matrix td.jcell { color: #000; font-weight: 600; }

/* UpSet-ish bars */
.upset-row { display: grid; grid-template-columns: 1fr 120px 80px; gap: 10px; align-items: center; padding: 4px 0; border-bottom: 1px dashed var(--border); }
.upset-row:last-child { border-bottom: none; }
.upset-sets { font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); display: flex; gap: 4px; flex-wrap: wrap; }
.upset-sets .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); display: inline-block; }
.upset-bar { position: relative; height: 14px; background: var(--bg-raised); border-radius: 3px; overflow: hidden; }
.upset-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, var(--accent-dim), var(--accent)); }
.upset-val { font-family: var(--font-mono); font-size: 11.5px; text-align: right; color: var(--text); }

/* Reach & frequency forecaster in detail panel (Sec-37 B2) */
.reach-block {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 12px 14px;
}
.reach-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.reach-stat {
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 10px;
}
.reach-stat-label { font-size: 10px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.06em; }
.reach-stat-value { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 2px; }
.reach-curve { margin-top: 10px; height: 50px; }
.reach-curve svg { width: 100%; height: 100%; display: block; }
.reach-budget-input {
  display: flex; gap: 8px; align-items: center; font-size: 12px;
}
.reach-budget-input input {
  width: 90px; background: var(--bg-input); border: 1px solid var(--border);
  color: var(--text); padding: 4px 8px; border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: 12px; outline: none;
}

/* Data lineage graph (Sec-38 B8 / C4) */
.lineage-graph {
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px;
}
.lineage-graph svg { width: 100%; height: auto; display: block; }

/* Keyboard shortcut hint button in topbar (Sec-38 A7) */
.kbd-hint {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--bg-raised); border: 1px solid var(--border);
  color: var(--text-mut); font-family: var(--font-mono); font-size: 12px;
  cursor: pointer; transition: all 0.12s;
}
.kbd-hint:hover { color: var(--text); border-color: var(--accent-border); }

/* Keyboard shortcuts cheat-sheet (Sec-38 A7) */
.kbd-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  z-index: 200; display: none; align-items: center; justify-content: center;
}
.kbd-overlay.open { display: flex; animation: fadeIn 0.18s ease; }
.kbd-card {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 20px 24px;
  min-width: 420px; max-width: 640px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.kbd-card h3 { margin: 0 0 14px 0; font-size: 15px; font-weight: 600; }
.kbd-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 0; border-bottom: 1px solid var(--border);
  font-size: 12.5px;
}
.kbd-row:last-child { border-bottom: 0; }
.kbd-keys { display: flex; gap: 4px; }
.kbd-key {
  font-family: var(--font-mono); font-size: 11px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: 3px; padding: 2px 8px; color: var(--text);
}

/* Sec-41: actionable result list (shortlist checkbox + activate icon + row click) */
.emb-result-row {
  display: grid;
  grid-template-columns: 24px 28px 1fr 170px 32px;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.emb-result-row:hover { border-color: var(--accent-border); background: var(--bg-hover); }
.err-check { display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.err-check input[type=checkbox] {
  width: 14px; height: 14px; accent-color: var(--accent); cursor: pointer;
}
.err-activate {
  background: transparent; border: 1px solid var(--border); color: var(--accent);
  padding: 5px; border-radius: 4px; cursor: pointer; display: inline-flex;
  align-items: center; justify-content: center; width: 28px; height: 28px;
  transition: all 0.12s;
}
.err-activate:hover { background: var(--accent-dim); border-color: var(--accent-border); }
.err-activate .ico { width: 14px; height: 14px; }
.err-activate:disabled { opacity: 0.6; cursor: wait; }
.err-activate.err-activating .ico { animation: spin 0.6s linear infinite; }
.err-activate.err-activated { color: var(--ok); border-color: rgba(43, 212, 160, 0.4); background: rgba(43, 212, 160, 0.1); }

/* Universal action bar above every ranked-list */
.result-actionbar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 12px; margin-bottom: 10px;
}
.result-actionbar-info {
  flex: 1; font-size: 12px; color: var(--text-mut); min-width: 180px;
}
.result-actionbar-info strong { color: var(--accent); font-weight: 600; }

/* Campaign CTA bar (Brief -> Portfolio, Greedy optimizer, Seasonality) */
.campaign-cta {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  background: linear-gradient(135deg, var(--accent-dim), transparent);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-md);
  padding: 12px 16px; margin-bottom: 14px;
}
.campaign-cta-info { flex: 1; font-size: 12.5px; color: var(--text); min-width: 200px; }
.campaign-cta .btn-primary, .campaign-cta .btn-secondary { white-space: nowrap; }

/* Brief/Seasonality rows now match result row grid */
.brief-row {
  display: grid;
  grid-template-columns: 24px 28px 1fr 60px 32px;
  gap: 10px; align-items: center;
  padding: 8px 10px; margin-bottom: 4px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.sea-row {
  display: grid;
  grid-template-columns: 24px 28px 1fr 70px 32px;
  gap: 10px; align-items: center;
  padding: 8px 10px; margin-bottom: 4px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); cursor: pointer;
}
.sea-row:hover { border-color: var(--accent-border); background: var(--bg-hover); }
.opt-row {
  display: grid;
  grid-template-columns: 28px 1fr 200px 80px 32px;
  gap: 10px; align-items: center;
  padding: 6px 10px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.opt-row:hover { border-color: var(--accent-border); background: var(--bg-hover); }

/* Arithmetic term select: allow longer names */
.arith-term select.arith-id { min-width: 0; text-overflow: ellipsis; }
.arith-term select option { font-family: var(--font-sans); font-size: 12px; }

/* Pareto scatter (Sec-41) */
.pareto-svg { width: 100%; height: auto; display: block; }
.pareto-svg circle { cursor: pointer; transition: r 0.12s, stroke-width 0.12s; }
.pareto-svg circle:hover { stroke: #fff !important; stroke-width: 2 !important; }
.pareto-stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
  margin-top: 12px;
}
.pareto-legend {
  display: flex; gap: 14px; flex-wrap: wrap;
  margin-top: 10px; font-size: 11px; color: var(--text-mut);
  align-items: center;
}
.pl-item { display: inline-flex; align-items: center; gap: 5px; }
.pl-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }

/* Sec-41 minimal nav tags — text-only, no box. Just a tiny superscript label. */
.nav-tag {
  margin-left: auto;
  font-size: 8px;
  font-weight: 600;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--accent);
  background: transparent;
  border: 0;
  padding: 0;
  line-height: 1;
  opacity: 0.7;
  flex: 0 0 auto;
  align-self: flex-start;
  margin-top: 2px;
}
.nav-tag-muted { color: var(--text-mut); }

/* Sec-41 Embedding Lab + Portfolio + Seasonality + Federation tabs */
.lab-subtabs, .port-subtabs {
  display: flex; gap: 4px; margin-bottom: 14px; flex-wrap: wrap;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0;
}
.lab-subtab {
  background: transparent; border: 0; color: var(--text-mut);
  padding: 10px 16px; font-size: 12.5px; cursor: pointer;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.lab-subtab:hover { color: var(--text); }
.lab-subtab.active { color: var(--accent); border-bottom-color: var(--accent); }
.lab-grid {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 16px;
}
.lab-panel {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 14px 16px;
}
.lab-panel-wide { grid-column: span 1; }
.lab-panel-full { grid-column: 1 / -1; }
.lab-panel-title {
  font-size: 12px; font-weight: 600; color: var(--text);
  text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px;
}
.lab-label {
  font-size: 10.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500;
  display: block; margin-bottom: 4px;
}
.lab-input {
  width: 100%; box-sizing: border-box;
  background: var(--bg-input); border: 1px solid var(--border);
  color: var(--text); padding: 6px 10px; border-radius: var(--radius-sm);
  font-family: var(--font-sans); font-size: 12.5px; outline: none;
  transition: border-color 0.12s;
}
.lab-input:focus { border-color: var(--accent-border); }
.lab-input.mono { font-family: var(--font-mono); font-size: 11px; }
textarea.lab-input { resize: vertical; line-height: 1.5; }
.lab-tabs { display: flex; gap: 4px; }
.lab-tab {
  background: var(--bg-raised); border: 1px solid var(--border);
  color: var(--text-mut); padding: 4px 12px; border-radius: 4px;
  cursor: pointer; font-size: 11.5px; font-family: var(--font-mono);
  transition: all 0.15s;
}
.lab-tab.active { color: var(--accent); border-color: var(--accent-border); background: var(--accent-dim); }
.lab-chips {
  display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 8px;
}
.lab-chips-label {
  font-size: 10.5px; color: var(--text-mut); text-transform: uppercase;
  letter-spacing: 0.08em;
}
.lab-chip {
  background: var(--bg-raised); border: 1px solid var(--border);
  color: var(--text-dim); padding: 3px 10px; border-radius: 12px;
  cursor: pointer; font-size: 11px; transition: all 0.12s;
}
.lab-chip:hover { color: var(--accent); border-color: var(--accent-border); }
.lab-stat-card {
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 12px;
}
.lab-stat-label { font-size: 10px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.06em; }
.lab-stat-val { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 2px; }
.lab-expr {
  background: var(--bg-input); border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm); padding: 10px 12px;
  font-family: var(--font-mono); font-size: 12px; color: var(--accent);
  margin-bottom: 12px;
}
.lab-expr-inner { font-family: var(--font-mono); font-size: 12px; }

/* Arithmetic term rows */
.lab-terms { display: flex; flex-direction: column; gap: 6px; }
.arith-term {
  display: grid; grid-template-columns: 60px 55px 16px 1fr 28px;
  gap: 6px; align-items: center;
}
.arith-term select.arith-sign, .arith-term input.arith-weight, .arith-term select.arith-id {
  background: var(--bg-input); border: 1px solid var(--border);
  color: var(--text); padding: 4px 8px; border-radius: 4px;
  font-family: var(--font-mono); font-size: 11.5px; outline: none;
}
.arith-term .arith-sign.mono { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-mut); padding: 4px 8px; background: var(--bg-raised); border-radius: 4px; }
.arith-term .arith-remove {
  background: transparent; border: 0; color: var(--text-mut); cursor: pointer;
  padding: 4px; border-radius: 4px;
}
.arith-term .arith-remove:hover { color: var(--error); }

/* Embedding result list — layout defined earlier; here only shared bits */
.emb-result-list { display: flex; flex-direction: column; gap: 4px; }
.err-rank { font-family: var(--font-mono); color: var(--text-mut); font-size: 12px; text-align: center; }
.err-name { font-size: 12.5px; color: var(--text); }
.err-sid { font-size: 10.5px; color: var(--text-mut); margin-top: 2px; }
.err-cos { display: flex; flex-direction: column; gap: 2px; }
.err-cos-val { font-size: 12px; color: var(--accent); text-align: right; }
.err-cos-bar { height: 6px; background: var(--bg-raised); border-radius: 3px; overflow: hidden; }
.err-cos-fill { height: 100%; background: linear-gradient(90deg, var(--accent-dim), var(--accent)); }

/* Neighborhood stats */
.nbh-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
.nbh-stat {
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 10px;
}
.nbh-stat-label { font-size: 10px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.06em; }
.nbh-stat-val { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 2px; }

/* Portfolio optimizer waterfall — layout grid defined earlier */
.opt-waterfall { display: flex; flex-direction: column; gap: 4px; }
.opt-rank { font-family: var(--font-mono); color: var(--text-mut); font-size: 12px; text-align: center; }
.opt-name { font-size: 12px; }
.opt-bar { height: 16px; background: var(--bg-raised); border-radius: 3px; overflow: hidden; }
.opt-bar-fill { height: 100%; background: linear-gradient(90deg, var(--ok), var(--accent)); }
.opt-margin { font-size: 12.5px; color: var(--ok); text-align: right; font-weight: 600; }

/* Lorenz small multiples */
.lorenz-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.lorenz-card { background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; }
.lorenz-title { font-size: 12px; color: var(--text); font-weight: 600; display: flex; justify-content: space-between; align-items: center; }
.lorenz-gini { font-family: var(--font-mono); font-size: 11px; color: var(--accent); }
.lorenz-card svg { width: 100%; height: auto; }
.lorenz-count { font-size: 10.5px; color: var(--text-mut); margin-top: 4px; }

/* Brief -> portfolio + Seasonality — layout grids defined earlier */
.brief-rank { font-family: var(--font-mono); color: var(--text-mut); font-size: 12px; text-align: center; }
.brief-name { font-size: 12.5px; color: var(--text); }
.brief-reason { font-size: 10.5px; color: var(--text-mut); margin-top: 2px; }
.brief-alloc { font-size: 14px; color: var(--accent); font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
.sea-rank { font-family: var(--font-mono); color: var(--text-mut); font-size: 12px; text-align: center; }
.sea-name { font-size: 12.5px; color: var(--text); }
.sea-mult { font-size: 14px; color: var(--accent); font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }

/* Federation */
.fed-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.fed-card { background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; }
.fed-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.fed-card-name { font-size: 13px; font-weight: 600; color: var(--text); }
.fed-url { font-size: 10.5px; color: var(--text-mut); margin-bottom: 4px; word-break: break-all; }
.fed-vendor { font-size: 11px; color: var(--text-dim); margin-bottom: 8px; }
.fed-specs { display: flex; gap: 4px; flex-wrap: wrap; }
.fed-result-row {
  display: grid; grid-template-columns: 24px 28px 1fr 150px; gap: 10px;
  align-items: center; padding: 10px 12px; margin-bottom: 6px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.fed-result-row:hover { border-color: var(--accent-border); background: var(--bg-hover); }
.fed-result-row .err-main { min-width: 0; }
.fed-row-actions {
  display: flex; flex-direction: column; gap: 6px;
  align-items: flex-end; justify-self: end;
}
.fed-row-evgeny { border-left: 2px solid rgba(43, 212, 160, 0.5); }
.fed-row-dstillery { border-left: 2px solid rgba(139, 110, 255, 0.5); }
.fed-row-selected { background: var(--bg-hover); border-color: var(--accent-border); }
.fed-check { display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.fed-check input { width: 14px; height: 14px; accent-color: var(--accent); cursor: pointer; }
.fed-desc { font-size: 11.5px; color: var(--text-dim); line-height: 1.45; margin: 3px 0 5px 0; }
.fed-metrics { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: var(--text-mut); margin-bottom: 3px; }
.fed-metric { white-space: nowrap; }
.fed-metric strong { color: var(--text); font-weight: 600; font-family: var(--font-mono); font-size: 11.5px; }
.fed-action-btn {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--bg-raised); color: var(--text-dim);
  border: 1px solid var(--border); border-radius: 4px;
  padding: 4px 10px; font-size: 11px; cursor: pointer;
  transition: all 0.12s; white-space: nowrap;
}
.fed-action-btn:hover { color: var(--accent); border-color: var(--accent-border); }
.fed-action-btn.primary { color: var(--accent); border-color: var(--accent-border); background: var(--accent-dim); }
.fed-action-btn.primary:hover { color: #fff; background: var(--accent); }
.fed-action-btn .ico { width: 12px; height: 12px; }
.fed-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.fed-summary-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px;
  margin-bottom: 12px;
}
.fed-actionbar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 12px; margin-bottom: 10px;
  transition: border-color 0.18s;
}
.fed-actionbar-active { border-color: var(--accent-border); background: var(--accent-dim); }
.fed-actionbar-info { flex: 1; font-size: 12px; color: var(--text-mut); min-width: 180px; }
.fed-actionbar-info strong { color: var(--accent); font-weight: 600; }
.fed-rows { display: flex; flex-direction: column; }

/* Chart explainer (Sec-39) */
.chart-explainer {
  margin-top: 10px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  font-size: 11.5px;
  line-height: 1.55;
}
.chart-explainer-head {
  display: flex; align-items: center; gap: 6px;
  color: var(--accent);
  font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em;
  font-weight: 600; margin-bottom: 6px;
}
.chart-explainer-head .ico { width: 13px; height: 13px; }
.chart-explainer-row {
  display: grid; grid-template-columns: 48px 1fr; gap: 8px;
  padding: 2px 0;
}
.chart-explainer-row .ce-k {
  color: var(--text-mut); font-family: var(--font-mono); font-size: 10.5px;
  text-transform: uppercase; letter-spacing: 0.06em;
  padding-top: 1px;
}
.chart-explainer-row .ce-v {
  color: var(--text-dim);
}

/* Destinations tab (Sec-39) */
.dest-summary {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;
  margin-bottom: 16px;
}
.dest-summary-card {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 12px 14px;
  text-align: center;
}
.dss-v { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.dss-l { font-size: 10.5px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
.dest-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 14px;
}
.dest-card {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 16px 18px;
  display: flex; flex-direction: column; gap: 12px;
}
.dest-card-head {
  display: grid; grid-template-columns: 34px 1fr auto; gap: 12px; align-items: flex-start;
}
.dest-card-icon {
  width: 34px; height: 34px; border-radius: 8px;
  background: var(--accent-dim); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
}
.dest-card-icon .ico { width: 18px; height: 18px; }
.dest-card-title { font-size: 15px; font-weight: 600; color: var(--text); }
.dest-card-sub { font-size: 11.5px; color: var(--text-mut); margin-top: 2px; font-family: var(--font-mono); }
.dest-card-pills { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.dest-notes {
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 12px;
  font-size: 12px; color: var(--text); line-height: 1.5;
}
.dest-field-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.dest-field {
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 6px 10px;
}
.dest-field-label {
  font-size: 9.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500;
}
.dest-field-val {
  font-size: 12px; color: var(--text); margin-top: 2px;
  font-family: var(--font-mono); line-height: 1.4;
  word-break: break-word;
}
.dest-block-label {
  font-size: 10.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500;
  margin-top: 4px;
}
.dest-pills { display: flex; gap: 4px; flex-wrap: wrap; }
.dest-flow {
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 10px 12px;
  color: var(--text); font-family: var(--font-mono); font-size: 11.5px;
  white-space: pre-wrap; line-height: 1.55; margin: 0;
}
.dest-links { display: flex; gap: 8px; }

/* Dev kit tab (Sec-38 B7) */
.devkit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.devkit-panel {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 14px 16px;
}
.devkit-panel-wide { grid-column: 1 / span 2; }
.devkit-panel-title {
  font-size: 12px; font-weight: 600; color: var(--text);
  text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px;
}
.devkit-key-shell {
  display: flex; gap: 8px; align-items: center;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 12px;
}
.devkit-key {
  flex: 1; font-family: var(--font-mono); font-size: 12px;
  color: var(--text); user-select: all;
}
.devkit-tabs { display: flex; gap: 4px; margin-bottom: 10px; }
.devkit-tab {
  background: var(--bg-raised); border: 1px solid var(--border);
  color: var(--text-mut); padding: 5px 12px; border-radius: 4px;
  cursor: pointer; font-size: 11.5px; font-family: var(--font-mono);
}
.devkit-tab.active { color: var(--text); border-color: var(--accent-border); background: var(--accent-dim); }
.devkit-code {
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 12px 14px;
  color: var(--text); font-family: var(--font-mono); font-size: 12px;
  white-space: pre; overflow-x: auto; max-height: 380px; line-height: 1.55;
}
.devkit-actions { margin-top: 10px; display: flex; justify-content: flex-end; }
.devkit-endpoints { display: flex; flex-direction: column; gap: 4px; }
.ep-row {
  display: grid; grid-template-columns: 60px 320px 1fr; gap: 10px; align-items: center;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 6px 10px;
  font-size: 11.5px;
}
.ep-method { font-family: var(--font-mono); font-size: 10.5px; color: var(--accent); font-weight: 600; }
.ep-row code { font-family: var(--font-mono); font-size: 11.5px; color: var(--text); }
.ep-note { color: var(--text-mut); font-size: 11px; }

/* Builder multi-signal stack (Sec-38 B6) */
.stack-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 6px 10px; margin-bottom: 6px;
}
.stack-search input {
  flex: 1; background: transparent; border: 0; color: var(--text); outline: none;
  font-size: 12.5px;
}
.stack-suggestions {
  display: none; background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); margin-bottom: 10px; max-height: 280px; overflow-y: auto;
}
.stack-sugg {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 10px; border-bottom: 1px solid var(--border); cursor: pointer;
}
.stack-sugg:last-child { border-bottom: 0; }
.stack-sugg:hover { background: var(--bg-hover); }
.stack-sugg-name { font-size: 12px; color: var(--text); }
.stack-sugg-meta { font-size: 10.5px; color: var(--text-mut); font-family: var(--font-mono); }
.stack-sugg-empty { padding: 8px 12px; color: var(--text-mut); font-size: 11.5px; font-style: italic; }
.stack-list { display: flex; flex-direction: column; gap: 6px; }
.stack-chip {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 10px;
}
.stack-chip-name { font-size: 12px; color: var(--text); }
.stack-chip-meta { font-size: 10.5px; color: var(--text-mut); font-family: var(--font-mono); }
.stack-remove {
  background: transparent; border: 0; color: var(--text-mut); cursor: pointer;
  padding: 4px; border-radius: 4px;
}
.stack-remove:hover { color: var(--text); background: var(--bg-raised); }
.stack-summary {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px;
}
.stack-stat {
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 10px;
}
.stack-stat-label { font-size: 10px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.06em; }
.stack-stat-value { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 2px; }
.stack-bar-wrap { margin-top: 8px; }

/* Embedding tab intro + heatmap color scale (Sec-39) */
.emb-intro {
  background: linear-gradient(135deg, var(--accent-dim), transparent);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-md); padding: 14px 18px;
  margin-bottom: 14px;
}
.emb-intro-title {
  font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 6px;
}
.emb-intro-body {
  font-size: 12.5px; color: var(--text-dim); line-height: 1.55; margin: 0;
}
.emb-intro-body code {
  font-family: var(--font-mono); font-size: 11.5px;
  background: var(--bg-raised); padding: 1px 6px; border-radius: 3px;
}
.emb-heatmap-scale {
  display: grid; grid-template-columns: 1fr 30px 1fr 30px 1fr;
  gap: 6px; align-items: center;
  margin-top: 12px; padding-top: 10px;
  border-top: 1px solid var(--border);
}
.ehs-label {
  font-size: 10.5px; color: var(--text);
  font-family: var(--font-mono); line-height: 1.35;
}
.ehs-label .ehs-sub {
  font-size: 9.5px; color: var(--text-mut); text-transform: lowercase;
}
.ehs-gradient {
  height: 14px; border-radius: 2px;
  background: linear-gradient(90deg, rgb(22, 52, 120), rgb(60, 100, 200), rgb(240, 240, 240));
}
.ehs-gradient.ehs-gradient-r {
  background: linear-gradient(90deg, rgb(240, 240, 240), rgb(230, 140, 100), rgb(255, 128, 90));
}

/* Embedding tab — 2D scatter + heatmap + Sankey (Sec-38 B5) */
.emb-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.emb-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
}
.emb-panel-wide { grid-column: 1 / span 2; }
.emb-panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
}
.emb-scatter, .emb-heatmap, .emb-sankey {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  min-height: 300px;
  padding: 8px;
}
.emb-scatter svg, .emb-heatmap svg, .emb-sankey svg {
  width: 100%; height: auto; display: block;
}
.emb-legend {
  display: flex; gap: 12px; flex-wrap: wrap;
  margin-top: 10px;
}
.emb-legend-item {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; color: var(--text-mut); font-family: var(--font-mono);
}
.emb-legend-dot {
  width: 10px; height: 10px; border-radius: 50%;
  display: inline-block;
}

/* Measurement block — lift + delivery simulator + campaign overlap (Sec-38 B4) */
.meas-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.meas-cell {
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 10px;
}
.delivery-bars {
  display: flex; gap: 2px; align-items: flex-end; height: 48px;
  padding: 4px 0; background: var(--bg-input);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding-left: 6px; padding-right: 6px;
}
.delivery-bar {
  flex: 1 1 0; min-width: 3px;
  background: linear-gradient(180deg, var(--accent), var(--accent-dim));
  border-radius: 1px;
}
.campaign-overlap { display: flex; flex-direction: column; gap: 4px; }
.campaign-row {
  display: grid; grid-template-columns: 180px 1fr 40px; gap: 10px; align-items: center;
  font-size: 11.5px;
}
.campaign-name { color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.campaign-bar-wrap {
  height: 10px; background: var(--bg-raised); border-radius: 3px; overflow: hidden;
}
.campaign-bar {
  height: 100%; background: linear-gradient(90deg, var(--accent-dim), var(--accent));
  min-width: 1%;
}
.campaign-pct { font-family: var(--font-mono); font-size: 11px; text-align: right; color: var(--text-mut); }

/* Cross-taxonomy bridge (Sec-38 B2) */
.cross-tax-grid { display: flex; flex-direction: column; gap: 4px; }
.cross-tax-row {
  display: grid; grid-template-columns: 200px 1fr 90px; gap: 10px; align-items: center;
  padding: 6px 10px; background: var(--bg-input);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-size: 11.5px;
}
.cross-tax-sys { color: var(--text-mut); font-family: var(--font-mono); font-size: 11px; }
.cross-tax-id code {
  font-family: var(--font-mono); font-size: 11.5px; color: var(--text);
  background: var(--bg-raised); padding: 2px 6px; border-radius: 3px;
}
.cross-tax-stage { text-align: right; }
.pill-mut { color: var(--text-mut); background: var(--bg-raised); border: 1px solid var(--border); padding: 2px 6px; border-radius: 3px; font-size: 11px; }
.pill-info { color: var(--accent); background: var(--accent-dim); border: 1px solid var(--accent-border); padding: 2px 6px; border-radius: 3px; font-size: 11px; }

/* MCP inspector drawer (Sec-37 B7) */
.mcp-inspect-btn {
  color: var(--text-mut); font-family: var(--font-mono);
  font-size: 11px; padding: 2px 6px;
  border-radius: 4px; background: var(--bg-raised); border: 1px solid var(--border);
  cursor: pointer; transition: all 0.12s; vertical-align: middle;
}
.mcp-inspect-btn:hover { color: var(--accent); border-color: var(--accent-border); }
.mcp-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: 560px;
  background: var(--bg-surface); border-left: 1px solid var(--border);
  box-shadow: -20px 0 60px rgba(0,0,0,0.5);
  transform: translateX(100%);
  transition: transform 0.28s cubic-bezier(0.32,0.72,0,1);
  z-index: 110;
  display: flex; flex-direction: column;
}
.mcp-drawer.open { transform: translateX(0); }
.mcp-drawer-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid var(--border);
}
.mcp-drawer-title { font-size: 14px; font-weight: 600; }
.mcp-drawer-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
.mcp-drawer-section { margin-bottom: 16px; }
.mcp-drawer-label {
  font-size: 10.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500;
  margin-bottom: 6px;
  display: flex; justify-content: space-between; align-items: center;
}
.mcp-drawer-label button.copy-btn {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text-mut); padding: 1px 6px;
  border-radius: 4px; background: var(--bg-raised); border: 1px solid var(--border);
  cursor: pointer; text-transform: none; letter-spacing: 0;
}
.mcp-drawer-label button.copy-btn:hover { color: var(--accent); }
.mcp-drawer-footer { padding: 12px 20px; border-top: 1px solid var(--border); }
.mcp-drawer-footer .btn-primary { width: 100%; justify-content: center; }

/* Loading skeletons (Sec-37 A4) */
@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.7; }
}
.skeleton-bar {
  height: 12px; border-radius: 4px;
  background: linear-gradient(90deg, var(--bg-raised) 0%, var(--bg-hover) 50%, var(--bg-raised) 100%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}
.skeleton-card {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 16px; margin-bottom: 10px;
}
.skeleton-card .skeleton-bar { margin-bottom: 8px; }
.skeleton-card .skeleton-bar:last-child { margin-bottom: 0; }

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

/* Sec-43: Audience Composer */
.composer-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.composer-lal-row {
  display: grid; grid-template-columns: 2fr 1fr 1fr auto;
  gap: 12px; align-items: end;
}
.composer-reach-cards {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px;
}
.composer-reach-card {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 12px 14px;
}
.composer-reach-card .label {
  font-size: 10.5px; color: var(--text-mut); text-transform: uppercase;
  letter-spacing: 0.08em; margin-bottom: 4px;
}
.composer-reach-card .value {
  font-size: 22px; font-weight: 700; font-family: var(--font-mono);
  color: var(--text);
}
.composer-reach-card .sub {
  font-size: 10.5px; color: var(--text-mut); font-family: var(--font-mono); margin-top: 2px;
}
.composer-reach-card.final .value { color: var(--accent); }

.composer-lal-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.composer-lal-item {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 8px 12px;
}
.composer-lal-item .cos {
  font-family: var(--font-mono); font-weight: 600; color: var(--accent-hot); font-size: 12px;
}
.composer-lal-item .add-btn {
  background: transparent; border: 1px solid var(--border); color: var(--text);
  padding: 4px 10px; border-radius: var(--radius-sm); font-size: 11px; cursor: pointer;
}
.composer-lal-item .add-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }

/* Saturation curve */
.comp-sat-curve { width: 100%; height: 280px; margin-bottom: 12px; }
.comp-sat-shortfall {
  display: flex; align-items: flex-start; gap: 12px;
  background: rgba(255, 122, 92, 0.08);
  border: 1px solid rgba(255, 122, 92, 0.4);
  border-left: 3px solid #ff7a5c;
  border-radius: var(--radius-sm);
  padding: 10px 12px; margin-bottom: 12px;
}
.comp-sat-shortfall-icon {
  flex: 0 0 22px; width: 22px; height: 22px;
  background: #ff7a5c; color: #1a1a1a;
  border-radius: 50%; font-weight: 700; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
}
.comp-sat-shortfall-title {
  font-weight: 600; color: var(--text); font-size: 12.5px;
  margin-bottom: 4px;
}
.comp-sat-shortfall-detail {
  font-size: 11.5px; color: var(--text-dim); line-height: 1.5;
}
.comp-sat-shortfall-detail strong {
  font-family: var(--font-mono); color: var(--text);
}
.comp-sat-table { width: 100%; border-collapse: collapse; font-size: 11.5px; font-family: var(--font-mono); }
.comp-sat-table th, .comp-sat-table td { padding: 6px 10px; text-align: right; }
.comp-sat-table th {
  font-size: 10.5px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.06em;
  border-bottom: 1px solid var(--border);
}
.comp-sat-table td { border-bottom: 1px solid rgba(255,255,255,0.04); }
.comp-sat-table tr.knee td { background: rgba(255, 192, 64, 0.08); }

/* Affinity bars */
.comp-aff-facet { margin-bottom: 18px; }
.comp-aff-facet-title {
  font-size: 11px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.08em;
  margin-bottom: 8px;
}
.comp-aff-row {
  display: grid; grid-template-columns: 180px 1fr 64px;
  gap: 10px; align-items: center; margin-bottom: 4px; font-size: 11.5px;
}
.comp-aff-bar-track {
  position: relative; height: 14px; background: var(--bg-raised);
  border-radius: 3px; overflow: hidden;
}
.comp-aff-bar-fill {
  position: absolute; top: 0; bottom: 0;
  background: var(--accent);
}
.comp-aff-bar-fill.under { background: var(--text-mut); }
.comp-aff-bar-fill.over  { background: var(--accent); }
.comp-aff-bar-fill.heavy { background: var(--accent-hot, #ffcb5c); }
.comp-aff-bar-fill.absent { background: transparent; }
.comp-aff-bar-track::before {
  content: ""; position: absolute; left: 50%; top: 0; bottom: 0;
  width: 1px; background: var(--border); z-index: 1;
}
.comp-aff-bar-tick {
  position: absolute; left: calc(50% - 1px); top: -2px; bottom: -2px;
  width: 2px; background: var(--text-mut); z-index: 2; opacity: 0.4;
}
.comp-aff-index {
  font-family: var(--font-mono); font-weight: 600; text-align: right;
}
.comp-aff-row-zero .comp-aff-key, .comp-aff-row-zero .comp-aff-index { opacity: 0.55; }
.comp-aff-key { color: var(--text); }
.comp-aff-facet-meta { font-weight: 400; opacity: 0.7; margin-left: 4px; }
.comp-aff-zero-toggle { margin: 4px 0 8px 190px; }
.comp-aff-show-zeros {
  background: transparent; border: 0; color: var(--text-mut); cursor: pointer;
  font-size: 10.5px; padding: 2px 0; font-family: var(--font-mono);
}
.comp-aff-show-zeros:hover { color: var(--accent); }
.comp-aff-summary {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 14px;
}
.comp-aff-summary-meta {
  display: flex; gap: 18px; flex-wrap: wrap; font-size: 12px;
  color: var(--text-mut); margin-bottom: 8px;
}
.comp-aff-legend {
  display: flex; gap: 14px; flex-wrap: wrap; font-size: 10.5px;
  color: var(--text-mut); padding-top: 8px;
  border-top: 1px solid var(--border);
}
.comp-aff-legend > span { display: inline-flex; align-items: center; gap: 5px; }
.comp-aff-legend-dot {
  display: inline-block; width: 10px; height: 10px; border-radius: 2px;
}
.comp-aff-legend-dot.under { background: var(--text-mut); }
.comp-aff-legend-dot.over { background: var(--accent); }
.comp-aff-legend-dot.heavy { background: var(--accent-hot, #ffcb5c); }
.comp-aff-legend-dot.absent { background: transparent; border: 1px dashed var(--text-mut); }
.comp-aff-legend-dot.tick { background: var(--text-mut); width: 2px; height: 12px; opacity: 0.6; border-radius: 0; }

@media (max-width: 1100px) {
  .composer-grid { grid-template-columns: 1fr; }
  .composer-lal-row { grid-template-columns: 1fr; }
}

/* ── Sec-45: Privacy gate + Holdout (in Composer result panel) ─────────── */
.privacy-gate {
  margin-top: 12px; padding: 10px 12px; background: var(--bg-soft, var(--bg-surface));
  border-radius: 6px; border: 1px solid var(--border); border-left-width: 3px;
}
.privacy-title { font-size: 12.5px; display: flex; align-items: center; margin-bottom: 4px; }
.privacy-reasons { margin: 6px 0 0 16px; padding: 0; color: var(--text-mut); font-size: 11.5px; line-height: 1.55; }
.privacy-reasons li { margin: 2px 0; }
.holdout-block {
  margin-top: 10px; padding: 10px 12px; background: var(--bg-soft, var(--bg-surface));
  border-radius: 6px; border: 1px solid var(--border);
}
.holdout-title { font-size: 12.5px; margin-bottom: 8px; }
.holdout-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.holdout-stats .k { font-size: 10.5px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.04em; }
.holdout-stats .v { font-size: 15px; margin-top: 2px; }

/* ── Sec-48: Multi-Agent Orchestrator ─────────────────────────────────── */
.orch-summary {
  margin-bottom: 12px;
}
.orch-summary-cards {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px;
}
.orch-summary-card {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px;
  padding: 8px 12px;
}
.orch-summary-card.orch-summary-ok { border-left: 3px solid var(--success); }
.orch-summary-card .k { font-size: 10px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.04em; }
.orch-summary-card .v { font-size: 16px; margin-top: 2px; font-weight: 500; }

.orch-stage-section { margin-bottom: 14px; }
.orch-stage-label {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-mut); margin-bottom: 8px;
}
.orch-agent-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px;
}
.orch-agent-card {
  background: var(--bg-surface); border: 1px solid var(--border); border-left-width: 3px;
  border-radius: 6px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 6px;
  transition: border-color 0.15s;
}
.orch-agent-card.orch-agent-alive { border-left-color: var(--success); }
.orch-agent-card.orch-agent-down { border-left-color: var(--error); opacity: 0.85; }
.orch-agent-card.orch-agent-issue { border-left-color: var(--warning); opacity: 0.7; }
.orch-agent-card.orch-agent-roadmap { border-left-color: var(--text-mut); opacity: 0.6; }
.orch-agent-card.orch-agent-unknown { border-left-color: var(--text-mut); }
.orch-agent-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; }
.orch-agent-name { font-size: 12.5px; font-weight: 500; line-height: 1.2; }
.orch-agent-meta { display: flex; gap: 8px; align-items: center; }
.orch-role-badge {
  display: inline-block; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em;
  padding: 2px 6px; border-radius: 3px; font-weight: 600;
}
.orch-role-signals { background: rgba(79, 142, 255, 0.18); color: var(--accent); }
.orch-role-buying { background: rgba(79, 195, 127, 0.15); color: var(--success); }
.orch-role-creative { background: rgba(255, 204, 92, 0.18); color: var(--warning); }
.orch-role-unclassified { background: var(--bg-soft, var(--bg-base)); color: var(--text-mut); }
.orch-agent-url { font-size: 10.5px; color: var(--text-mut); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.orch-agent-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.orch-agent-stats .k { font-size: 9.5px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.04em; }
.orch-agent-stats .v { font-size: 13px; font-family: var(--font-mono); margin-top: 1px; }
.orch-small { font-size: 10px; color: var(--text-mut); }
.orch-agent-server { font-size: 10.5px; color: var(--text-mut); }
.orch-agent-tools { font-size: 10.5px; color: var(--text-mut); line-height: 1.3; }
.orch-agent-error { font-size: 10px; color: var(--error); line-height: 1.3; }

.orch-fanout-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; margin-bottom: 10px; }
.orch-fanout-card {
  background: var(--bg-surface); border: 1px solid var(--border); border-left-width: 3px;
  border-radius: 5px; padding: 8px 10px;
}
.orch-fanout-card.orch-fanout-ok { border-left-color: var(--success); }
.orch-fanout-card.orch-fanout-err { border-left-color: var(--error); opacity: 0.85; }
.orch-fanout-name { font-size: 12px; font-weight: 500; margin-bottom: 4px; }
.orch-fanout-stats { display: flex; gap: 10px; font-size: 11px; color: var(--text-mut); }
.orch-fanout-err-msg { font-size: 10px; color: var(--error); margin-top: 4px; }
.orch-fanout-totals {
  font-size: 12px; color: var(--text-mut); padding: 8px 12px;
  background: var(--bg-soft, var(--bg-surface)); border-radius: 5px;
}
.orch-signals-table {
  width: 100%; border-collapse: collapse; font-size: 11.5px;
}
.orch-signals-table th {
  text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--text-mut); border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.orch-signals-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); }

.orch-matrix-table {
  border-collapse: collapse; font-size: 11.5px; margin: 0;
}
.orch-matrix-table th, .orch-matrix-table td {
  padding: 5px 8px; border: 1px solid var(--border); text-align: center;
}
.orch-matrix-table .orch-matrix-tool-header { text-align: left; font-size: 10px; text-transform: uppercase; color: var(--text-mut); }
.orch-matrix-tool { text-align: left; font-size: 11px; white-space: nowrap; background: var(--bg-surface); }
.orch-matrix-agent {
  vertical-align: top; font-weight: 500; min-width: 80px;
}
.orch-matrix-agent-name { font-size: 11px; }
.orch-matrix-agent-meta { font-size: 9.5px; color: var(--text-mut); margin-top: 2px; }
.orch-matrix-yes { color: var(--success); font-size: 14px; background: rgba(79, 195, 127, 0.08); }
.orch-matrix-no { color: var(--border); }
.orch-matrix-unique-row { padding: 4px 0; font-size: 11px; }

/* ── Sec-47: Expression Tree Builder ──────────────────────────────────── */
.expr-counters {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 5px;
  padding: 6px 12px; font-size: 11px; color: var(--text-mut); margin-bottom: 14px;
}
.expr-counters-warn { border-color: var(--warning); color: var(--warning); }
.expr-canvas { display: flex; flex-direction: column; gap: 10px; }
.expr-node {
  position: relative;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
.expr-node.expr-dragging { opacity: 0.4; }
.expr-drag-handle {
  cursor: grab; color: var(--text-mut); font-size: 13px; user-select: none;
  padding: 0 4px; flex-shrink: 0;
}
.expr-drag-handle:active { cursor: grabbing; }
.expr-btn-ghost {
  background: transparent; border: 1px solid var(--border); color: var(--text-mut);
  padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;
  font-family: inherit;
}
.expr-btn-ghost:hover { color: var(--text); border-color: var(--accent-border, var(--accent)); }
.expr-btn-ghost.expr-btn-danger:hover { color: var(--error); border-color: var(--error); }

/* Group (branch) node */
.expr-group {
  background: var(--bg-surface); border: 2px solid var(--border); border-radius: 8px;
  padding: 10px 12px;
}
.expr-group.expr-root { border-width: 2px; }
.expr-group.expr-op-or { border-left: 4px solid var(--accent); }
.expr-group.expr-op-and { border-left: 4px solid var(--success); }
.expr-group.expr-op-not { border-left: 4px solid var(--error); background: rgba(255, 92, 92, 0.04); }
.expr-group.expr-drop-target { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79, 142, 255, 0.18); }
.expr-group-head {
  display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
}
.expr-op-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; user-select: none;
}
.expr-op-chip.expr-op-or { background: rgba(79, 142, 255, 0.18); color: var(--accent); }
.expr-op-chip.expr-op-and { background: rgba(79, 195, 127, 0.15); color: var(--success); }
.expr-op-chip.expr-op-not { background: rgba(255, 92, 92, 0.18); color: var(--error); cursor: default; }
.expr-node-reach {
  margin-left: auto; font-size: 12px; color: var(--text); font-weight: 500;
  background: var(--bg-soft, var(--bg-base)); padding: 3px 10px; border-radius: 4px;
}
.expr-group-actions { display: flex; gap: 4px; }
.expr-group-body {
  display: flex; flex-direction: column; gap: 8px;
  padding-left: 16px; border-left: 1px dashed var(--border);
  margin-bottom: 8px;
}
.expr-empty-group {
  color: var(--text-mut); font-size: 11.5px; font-style: italic; padding: 6px 0;
}
.expr-add-menu {
  display: flex; gap: 6px; flex-wrap: wrap;
  padding-left: 16px; margin-top: 4px;
}

/* Leaf node */
.expr-leaf {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px;
  padding: 8px 12px; position: relative;
}
.expr-leaf.expr-leaf-unfilled { border-style: dashed; }
.expr-leaf-body { flex: 1; min-width: 0; }
.expr-leaf-body.expr-leaf-empty { color: var(--text-mut); font-size: 12px; font-style: italic; }
.expr-leaf-name { font-size: 12.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.expr-leaf-meta { font-size: 10.5px; color: var(--text-mut); margin-top: 2px; }
.expr-leaf-actions { display: flex; gap: 4px; flex-shrink: 0; }
.expr-leaf-picker {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 10;
  margin-top: 4px; background: var(--bg-raised, var(--bg-surface));
  border: 1px solid var(--accent); border-radius: 6px;
  padding: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.35);
}
.expr-leaf-picker-input {
  width: 100%; background: var(--bg-soft, var(--bg-base));
  border: 1px solid var(--border); border-radius: 4px; color: var(--text);
  padding: 6px 10px; font-size: 12px; font-family: inherit; margin-bottom: 6px;
}
.expr-leaf-picker-input:focus { outline: none; border-color: var(--accent); }
.expr-leaf-picker-list { max-height: 240px; overflow: auto; }
.expr-leaf-picker-row {
  padding: 6px 8px; cursor: pointer; border-radius: 4px;
}
.expr-leaf-picker-row:hover { background: var(--bg-soft, var(--bg-base)); }
.expr-leaf-picker-name { font-size: 12px; font-weight: 500; }
.expr-leaf-picker-meta { font-size: 10.5px; color: var(--text-mut); margin-top: 1px; }

/* Result cards */
.expr-result-cards {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px;
}
.expr-result-card {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px;
  padding: 12px 14px;
}
.expr-result-card.expr-result-primary { background: var(--bg-soft, var(--bg-surface)); border-color: var(--accent); }
.expr-result-card .k { font-size: 10.5px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.04em; }
.expr-result-card .v { font-size: 20px; margin-top: 4px; font-weight: 500; }

/* Save row */
.expr-save-row { display: flex; gap: 8px; align-items: center; }
.expr-save-row .lab-input { flex: 1; }

@media (max-width: 900px) {
  .expr-add-menu { padding-left: 8px; }
  .expr-group-body { padding-left: 10px; }
}

/* ── Sec-46: Journey mode switch + clamp surfacing ─────────────────────── */
.journey-mode-row {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin: 0 0 16px 0; padding: 10px 12px;
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px;
}
.journey-mode-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-mut); }
.journey-mode-switch { display: inline-flex; background: var(--bg-soft, var(--bg-base)); border: 1px solid var(--border); border-radius: 5px; overflow: hidden; }
.journey-mode-btn {
  background: transparent; border: none; color: var(--text-mut);
  padding: 6px 12px; font-size: 12px; cursor: pointer; font-family: inherit;
}
.journey-mode-btn.active { background: var(--accent); color: var(--bg-base); }
.journey-mode-btn:not(.active):hover { color: var(--text); background: var(--bg-hover, var(--bg-surface)); }
.journey-mode-hint { font-size: 11px; color: var(--text-mut); flex: 1; min-width: 200px; }
.journey-warning-banner {
  display: flex; gap: 12px; align-items: flex-start;
  background: rgba(255, 92, 92, 0.08); border: 1px solid var(--error); border-left: 3px solid var(--error);
  border-radius: 6px; padding: 10px 12px; margin-bottom: 14px;
}
.journey-warning-icon {
  width: 20px; height: 20px; border-radius: 50%; background: var(--error); color: var(--bg-base);
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;
  flex-shrink: 0;
}
.journey-warning-title { font-size: 12.5px; font-weight: 600; margin-bottom: 4px; color: var(--error); }
.journey-warning-detail { font-size: 11.5px; line-height: 1.55; color: var(--text); }
.journey-row-clamped { border-color: var(--error); }
.journey-row-preclamp { color: var(--error); font-family: var(--font-mono); }
.journey-row-preclamp-wrap { display: inline; }

/* ── Sec-45: Journey Builder ───────────────────────────────────────────── */
.journey-stage {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 14px; margin-bottom: 12px;
}
.journey-stage-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.journey-stage-idx {
  width: 24px; height: 24px; border-radius: 50%; background: var(--accent);
  color: var(--bg-base); display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; flex-shrink: 0;
}
.journey-stage-name {
  flex: 1; background: transparent; border: 1px solid transparent;
  color: var(--text); font-size: 14px; font-weight: 600; padding: 4px 8px; border-radius: 4px;
}
.journey-stage-name:hover { border-color: var(--border); }
.journey-stage-name:focus { outline: none; border-color: var(--accent); background: var(--bg-soft, var(--bg-base)); }
.journey-stage-remove {
  background: transparent; border: 1px solid var(--border); color: var(--text-mut);
  padding: 4px 6px; border-radius: 4px; cursor: pointer;
}
.journey-stage-remove:hover { color: var(--error); border-color: var(--error); }
.journey-stage-pools { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.journey-pool { display: flex; flex-direction: column; }
.journey-summary {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;
  margin-bottom: 14px;
}
.journey-summary > div {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 12px;
}
.journey-summary .k { font-size: 10.5px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.04em; }
.journey-summary .v { font-size: 16px; margin-top: 3px; }
.journey-funnel { display: flex; flex-direction: column; gap: 10px; }
.journey-row {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 12px;
}
.journey-row-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 12.5px; }
.journey-row-name { font-weight: 500; }
.journey-bar-outer {
  width: 100%; height: 10px; background: var(--bg-soft, var(--bg-base));
  border-radius: 5px; overflow: hidden;
}
.journey-bar-inner {
  height: 100%; background: linear-gradient(90deg, var(--accent) 0%, var(--accent-hot, var(--accent)) 100%);
  transition: width 0.3s ease;
}
.journey-row-meta {
  display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px;
  font-size: 11px; color: var(--text-mut); font-family: var(--font-mono);
}

/* ── Sec-45: Scenario Planner ──────────────────────────────────────────── */
.plan-cards {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px;
}
.plan-card {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px;
  padding: 12px 14px;
}
.plan-card.plan-delta { background: var(--bg-soft, var(--bg-surface)); }
.plan-card .label { font-size: 10.5px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.04em; }
.plan-card .value { font-size: 18px; margin-top: 4px; font-weight: 500; }
.plan-card .sub { font-size: 11px; color: var(--text-mut); margin-top: 4px; font-family: var(--font-mono); }

/* ── Sec-45: Snapshots ─────────────────────────────────────────────────── */
.snap-rows { display: flex; flex-direction: column; gap: 6px; }
.snap-row {
  display: flex; align-items: center; gap: 10px;
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 10px 12px;
}
.snap-row-picked { border-color: var(--accent); background: var(--bg-soft, var(--bg-surface)); }
.snap-row-main { flex: 1; min-width: 0; }
.snap-row-name { font-size: 13px; font-weight: 500; }
.snap-row-meta { font-size: 10.5px; color: var(--text-mut); margin-top: 2px; }
.snap-row-actions { display: flex; gap: 6px; flex-shrink: 0; }
.snap-row-actions button { font-size: 11px; padding: 5px 10px; }
.snap-diff-header {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;
  margin-bottom: 14px;
}
.snap-diff-header > div {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 12px;
}
.snap-diff-header .k { font-size: 10.5px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.04em; }
.snap-diff-header .v { font-size: 13px; margin-top: 3px; font-weight: 500; word-break: break-word; }
.snap-diff-header .sub { font-size: 11px; color: var(--text-mut); margin-top: 3px; }
.snap-diff-facet {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 12px; margin-bottom: 8px;
}
.snap-diff-facet-head { font-size: 12px; font-weight: 500; margin-bottom: 4px; }
.snap-diff-line { font-size: 11.5px; font-family: var(--font-mono); line-height: 1.6; word-break: break-all; }
.snap-diff-line.snap-add { color: var(--success); }
.snap-diff-line.snap-rem { color: var(--error); }

/* ── Sec-45: Freshness table ───────────────────────────────────────────── */
.fresh-table {
  width: 100%; border-collapse: collapse; font-size: 12px;
}
.fresh-table th {
  text-align: left; padding: 8px 10px; font-size: 10.5px; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--text-mut); font-weight: 500;
  border-bottom: 1px solid var(--border); cursor: pointer; user-select: none;
  white-space: nowrap; position: relative;
}
.fresh-table th:hover { color: var(--text); }
.fresh-table th.fresh-sort-asc::after { content: " ▲"; font-size: 9px; color: var(--accent); }
.fresh-table th.fresh-sort-desc::after { content: " ▼"; font-size: 9px; color: var(--accent); }
.fresh-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
.fresh-table td.fresh-name { min-width: 220px; }
.fresh-table td.fresh-name .signal-id { font-size: 10px; color: var(--text-mut); font-family: var(--font-mono); margin-top: 2px; }
.fresh-warn { color: var(--error); }
.fresh-warm { color: var(--warning); }
.fresh-good { color: var(--success); }
.fresh-stab-stable { background: rgba(79, 195, 127, 0.15); color: var(--success); }
.fresh-stab-semi-stable { background: rgba(255, 204, 92, 0.18); color: var(--warning); }
.fresh-stab-volatile { background: rgba(255, 92, 92, 0.15); color: var(--error); }
.fresh-stab-unknown { background: var(--bg-soft, var(--bg-surface)); color: var(--text-mut); }
.fresh-warning-block {
  background: var(--bg-soft, var(--bg-surface));
  border: 1px solid var(--warning); border-left: 3px solid var(--warning);
  border-radius: 6px; padding: 10px 12px; margin-bottom: 14px;
}
.fresh-warning-head { font-size: 12.5px; font-weight: 500; margin-bottom: 6px; }
.fresh-warning-body { display: flex; flex-wrap: wrap; gap: 3px; }

@media (max-width: 900px) {
  .journey-stage-pools { grid-template-columns: 1fr; }
  .holdout-stats { grid-template-columns: repeat(2, 1fr); }
}
</style>`;

// The whole <script> block as a function so we can close-template it cleanly.
// Everything inside is client-side JS; template-literal backticks and ${}
// must be escaped with a backslash so the outer template literal doesn't
// interpolate them.
function SCRIPT_TAG(safeKey: string): string {
  return `<script type="module">
//────────────────────────────────────────────────────────────────────────
// Sec-32: d3-hierarchy for treemap squarify math. Only external dep —
// everything else is hand-rolled. If the CDN fails, the treemap tab
// degrades gracefully (rendered message + link to catalog).
//────────────────────────────────────────────────────────────────────────
let D3;
try {
  D3 = await import("https://esm.sh/d3-hierarchy@3.1.2?bundle");
} catch (e) {
  console.warn("d3-hierarchy failed to load, treemap unavailable:", e);
  D3 = null;
}

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
  treemap: { rendered: false, resizeObserver: null },
  builder: {
    rules: [],
    generatedSegment: null,
    estimateSeq: 0,
    debounceTimer: null,
  },
  activations: { pollTimer: null, data: [] },
  toolLog: { pollTimer: null, data: [], paused: false, filter: "", expanded: new Set() },
  overlap: { selected: [], lastResult: null, searchQ: "" },
  // Sec-43: Composer state. Five pickers (3 on Set Builder + 1 each on
  // Saturation / Affinity) plus the last result payloads for rendering.
  composer: {
    inc: [], itx: [], exc: [],      // Set Builder pools
    sat: [], aff: [],               // Saturation / Affinity pools
    lastCompose: null, lastSat: null, lastAff: null,
    loaded: false,
  },
  // Sec-44: Journey builder. Dynamic stage list; each stage has its own
  // include/intersect/exclude pool arrays.
  journey: { stages: [], lastResult: null, loaded: false, cumulative: true },
  // Sec-47: boolean expression AST builder. Tree is null until ensureExpression seeds it.
  expression: { tree: null, lastResult: null, loaded: false, nextId: 1, draggedNodeId: null, pickingLeafId: null },
  // Sec-48: multi-agent orchestrator state.
  orchestrator: { directory: [], probe: null, orchestrate: null, matrix: null, loaded: false, probing: false, matrixing: false, orchestrating: false },
  // Sec-44: Scenario Planner — current / add / remove pools.
  planner: { cur: [], add: [], rem: [], lastResult: null, loaded: false },
  // Sec-44: Snapshots — fetched index + diff selection.
  snapshots: { list: [], diffPair: [], loaded: false },
  // Sec-44: Freshness — sort state + hydrated facets.
  freshness: { sortCol: "halflife", sortDir: "asc", rows: null, loaded: false },
  reach: { budgetUsd: 10_000 },
  // Sec-39: detail panel UX — cycle-mode + collapsed-section memory
  ui: { detailMode: "narrow", collapsedSections: new Set() },
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

// Sec-37 B4: derive ID-resolution surface per signal from the DTS
// label's data_sources + precision_levels. Keeps the canonical schema
// untouched — we're inferring what identifiers the signal can key off,
// which is exactly what a tier-1 data-council reviewer asks.
function idTypesFor(sig) {
  const dts = sig?.x_dts || {};
  const sources = Array.isArray(dts.data_sources) ? dts.data_sources : [];
  const levels = Array.isArray(dts.audience_precision_levels) ? dts.audience_precision_levels : [];
  const ids = new Set(["ip_only"]); // universal baseline
  const hasAny = (arr, needles) => arr.some((x) => needles.some((n) => String(x).toLowerCase().includes(n)));
  if (hasAny(sources, ["app behavior", "app usage"])) { ids.add("maid_ios"); ids.add("maid_android"); }
  if (hasAny(sources, ["tv ott", "stb device"])) ids.add("ctv_device");
  if (hasAny(sources, ["web usage"])) { ids.add("cookie_3p"); ids.add("hashed_email"); }
  if (hasAny(sources, ["online ecommerce", "online transaction", "email"])) {
    ids.add("hashed_email"); ids.add("ramp_id"); ids.add("uid2"); ids.add("id5");
  }
  if (hasAny(sources, ["offline survey", "offline transaction", "public record"])) {
    ids.add("hashed_email"); ids.add("ramp_id");
  }
  if (hasAny(sources, ["loyalty card", "credit data"])) {
    ids.add("hashed_email"); ids.add("ramp_id"); ids.add("uid2");
  }
  if (levels.some((l) => String(l).toLowerCase() === "device")) { ids.add("maid_ios"); ids.add("maid_android"); }
  if (levels.some((l) => String(l).toLowerCase() === "household")) ids.add("ramp_id");
  if (levels.some((l) => String(l).toLowerCase() === "browser")) ids.add("cookie_3p");
  // Fallback if x_dts was sparse — derive from category_type
  if (ids.size === 1) {
    const c = (sig?.category_type || "").toLowerCase();
    if (c === "interest" || c === "purchase_intent") { ids.add("cookie_3p"); ids.add("maid_ios"); ids.add("maid_android"); }
    if (c === "demographic") { ids.add("ramp_id"); ids.add("hashed_email"); }
    if (c === "geo") { ids.add("maid_ios"); ids.add("maid_android"); ids.add("ctv_device"); }
    if (c === "composite") { ids.add("cookie_3p"); ids.add("ramp_id"); ids.add("hashed_email"); }
  }
  return [...ids];
}
const ID_LABELS = {
  cookie_3p: "3P cookie",
  maid_ios: "iOS MAID",
  maid_android: "Android MAID",
  ctv_device: "CTV device ID",
  uid2: "UID 2.0",
  ramp_id: "RampID",
  id5: "ID5",
  hashed_email: "Hashed email",
  ip_only: "IP only",
};
function idTypePills(sig) {
  const ids = idTypesFor(sig);
  const cookieless = !ids.includes("cookie_3p");
  const pills = ids.map((i) => '<span class="pill pill-muted mono" style="font-size:10.5px">' + escapeHtml(ID_LABELS[i] || i) + '</span>').join(" ");
  const cookielessPill = cookieless
    ? '<span class="pill pill-success" style="font-size:10.5px">cookieless ready</span>'
    : '<span class="pill pill-warning" style="font-size:10.5px">cookie-dependent</span>';
  return { pills, cookielessPill, count: ids.length };
}

// Sec-37 A4: loading skeletons — rectangle-pulse placeholders in
// place of spinners in catalog / treemap / capabilities.
function skeletonRows(count, colCount) {
  let rows = "";
  for (let i = 0; i < count; i++) {
    let cells = "";
    for (let c = 0; c < colCount; c++) cells += '<td><div class="skeleton-bar"></div></td>';
    rows += '<tr>' + cells + '</tr>';
  }
  return rows;
}

function fmtCPM(signal) {
  const opts = signal.pricing_options;
  if (!Array.isArray(opts) || opts.length === 0) return { display: "—", cpm: null };
  const o = opts[0];
  if (o.model === "cpm") return { display: "$" + o.cpm.toFixed(2), cpm: o.cpm };
  if (o.model === "flat_fee") return { display: "$" + o.amount + " / " + o.period, cpm: null };
  return { display: "—", cpm: null };
}

// signal_agent_segment_id format: "sig_<vertical>_<rest>" (signalIdFromSlug
// prepends "sig_"). Strip the prefix, take the first underscore-separated
// token, and map to a human-readable vertical label. Labels are chosen to
// be visually DISTINCT from the 5 AdCP category_type enum values so the
// two filter rows (Vertical chips + Category type chips) don't look like
// duplicates — they're different axes over the same catalog.
function verticalOf(signal) {
  const sid = signal.signal_agent_segment_id || signal.signal_id?.id || "";
  const stripped = sid.startsWith("sig_") ? sid.slice(4) : sid;
  const token = (stripped.split("_")[0] || "").toLowerCase();
  const map = {
    // Sec-30 expansion verticals (one file per in src/domain/signals/)
    auto:      "Automotive",
    fin:       "Financial",
    health:    "Health & Wellness",
    b2b:       "B2B & Firmographic",
    life:      "Life Events",
    beh:       "Behavioral",
    intent:    "Cross-Category Intent",
    trans:     "Transactional / Purchase",
    media:     "Media & Device",
    retail:    "Retail & CPG",
    seasonal:  "Seasonal / Occasion",
    psycho:    "Psychographic",
    int:       "Interest & Affinity",
    demo:      "Demographic (extended)",
    geo:       "Geographic (regional)",
    // Older seeded signal prefixes from signalModel.ts
    age:       "Demographic (core)",
    test:      "Demographic (core)",
    urban:     "Geographic (regional)",
    top:       "Geographic (regional)",
    drama:     "Interest & Affinity",
    comedy:    "Interest & Affinity",
    documentary: "Interest & Affinity",
    streaming: "Interest & Affinity",
    action:    "Interest & Affinity",
    sci:       "Interest & Affinity",
    thriller:  "Interest & Affinity",
    animation: "Interest & Affinity",
    romance:   "Interest & Affinity",
    tech:      "Cross-Category Intent",
    premium:   "Cross-Category Intent",
    high:      "Composite",
    affluent:  "Composite",
    metro:     "Composite",
    college:   "Composite",
    // Dynamic signals from POST /signals/generate
    dyn:       "Generated (custom)",
  };
  return map[token] || "Other";
}

function showToast(msg, isError) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show" + (isError ? " error" : "");
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = "toast"; }, 3200);
}

function typeBadge(t) { return '<span class="sc-type-badge ' + escapeHtml(t) + '">' + escapeHtml(t) + '</span>'; }

// Sec-37 A1/A2: compact pills that surface compliance + freshness at
// a glance on every card. Read the same fields the detail panel uses;
// render as 9.5px mono pills so they don't dominate the card.
function dtsPill(sig) {
  if (sig && sig.x_dts && sig.x_dts.dts_version) {
    return ' <span class="pill-dts">DTS ' + escapeHtml(String(sig.x_dts.dts_version)) + '</span>';
  }
  return "";
}
function freshnessPill(sig) {
  const f = sig && (sig.freshness || sig.x_dts?.audience_refresh);
  if (!f) return "";
  const v = String(f).toLowerCase();
  const cls = v === "7d" ? "pill-fresh-7d" : v === "30d" ? "pill-fresh-30d" : "pill-fresh-static";
  const label = v === "7d" || v === "30d" ? v : (v === "static" ? "static" : v);
  return ' <span class="pill-freshness ' + cls + '">' + escapeHtml(label) + '</span>';
}
function sensitivePill(sig) {
  if (sig && sig.sensitive_category && sig.sensitive_category.is_sensitive) {
    return ' <span class="pill-sensitive" title="Sensitive category">⚐ sensitive</span>';
  }
  return "";
}
// Sec-37 A3: confidence → range label. Tier maps to percentage bands.
function confidenceRange(size, tier) {
  if (!Number.isFinite(size) || size <= 0) return null;
  const pct = tier === "high" ? 0.10 : tier === "medium" ? 0.25 : 0.50;
  const delta = Math.round(size * pct);
  return { lo: size - delta, hi: size + delta, pct: Math.round(pct * 100), delta };
}

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
  const crumbMap = {
    discover: "Discover", catalog: "Catalog", concepts: "Concepts",
    treemap: "Treemap", builder: "Builder", activations: "Activations",
    capabilities: "Capabilities", toollog: "Tool Log", overlap: "Overlap",
    embedding: "Embedding space", devkit: "Dev kit", destinations: "Destinations",
    lab: "Embedding Lab", portfolio: "Portfolio", composer: "Composer",
    expression: "Expression",
    journey: "Journey", planner: "Scenario", snapshots: "Snapshots",
    freshness: "Freshness",
    seasonality: "Seasonality", federation: "Federation",
    orchestrator: "Orchestrator",
  };
  document.getElementById("crumb-current").textContent = crumbMap[name] || name;

  // Lazy-load per-tab data
  if (name === "catalog" && state.catalog.all.length === 0) loadCatalog();
  if (name === "concepts" && !state.concepts) primeConcepts();
  if (name === "treemap") ensureTreemap();
  if (name === "builder") ensureBuilder();
  if (name === "capabilities") loadCapabilities();
  if (name === "overlap") ensureOverlap();
  if (name === "embedding") ensureEmbedding();
  if (name === "devkit") ensureDevkit();
  if (name === "destinations") ensureDestinations();
  if (name === "lab") ensureLab();
  if (name === "portfolio") ensurePortfolio();
  if (name === "composer") ensureComposer();
  if (name === "expression") ensureExpression();
  if (name === "journey") ensureJourney();
  if (name === "planner") ensurePlanner();
  if (name === "snapshots") ensureSnapshots();
  if (name === "freshness") ensureFreshness();
  if (name === "seasonality") ensureSeasonality();
  if (name === "federation") ensureFederation();
  if (name === "orchestrator") ensureOrchestrator();

  // Activations tab: start polling when visible, stop when hidden
  if (name === "activations") startActivationsPolling();
  else stopActivationsPolling();

  // Tool Log tab: 5s poll while visible
  if (name === "toollog") startToolLogPolling();
  else stopToolLogPolling();
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
// §1 Discover — two modes: Brief (get_signals) and NL Query (query_signals_nl)
//────────────────────────────────────────────────────────────────────────
const briefEl = document.getElementById("brief");
let _discoverMode = "brief"; // "brief" | "nl"

const BRIEF_HINTS = [
  { text: "luxury automotive intenders 45+ in top DMAs", label: "luxury auto intenders" },
  { text: "new parents in the last 12 months", label: "new parents 0-12mo" },
  { text: "cord-cutters 25-44 with high streaming affinity", label: "cord-cutters 25-44" },
  { text: "B2B IT decision makers at mid-market companies", label: "IT decision makers" },
  { text: "health conscious affluent millennials in urban metros", label: "health-conscious urban" },
];
const NL_HINTS = [
  { text: "soccer moms 35+ who stream heavily", label: "soccer moms 35+" },
  { text: "urban professionals without children who watch sci-fi", label: "sci-fi urban pros" },
  { text: "affluent families 35-44 in top DMAs", label: "affluent families" },
  { text: "college-educated adults 25-34 with high streaming", label: "educated streamers" },
  { text: "seniors interested in documentary content", label: "docu seniors" },
];

function renderBriefHints() {
  const hints = _discoverMode === "nl" ? NL_HINTS : BRIEF_HINTS;
  const host = document.getElementById("brief-hints");
  host.innerHTML = '<span class="hint-label">Try</span>' +
    hints.map((h) => '<button class="hint" data-brief="' + escapeHtml(h.text) + '">' + escapeHtml(h.label) + '</button>').join("");
  host.querySelectorAll(".hint").forEach((b) => {
    b.addEventListener("click", () => { briefEl.value = b.dataset.brief; briefEl.focus(); });
  });
}
renderBriefHints();

// Mode toggle wiring
document.querySelectorAll("#discover-mode-toggle .mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    _discoverMode = btn.dataset.mode;
    document.querySelectorAll("#discover-mode-toggle .mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === _discoverMode));
    // Update header copy + placeholder + button label + hints per mode
    if (_discoverMode === "nl") {
      document.getElementById("discover-mode-subtitle").textContent = "NL Query mode";
      document.getElementById("discover-mode-desc").innerHTML = "boolean-AST decomposition via <code>query_signals_nl</code>. Resolves each dimension against the catalog with hybrid rule + embedding + lexical matching. Returns matched signals with per-match method and a compositional audience-size estimate.";
      briefEl.placeholder = "e.g. soccer moms 35+ who stream heavily";
      document.getElementById("discover-btn-label").textContent = "Run NL query";
    } else {
      document.getElementById("discover-mode-subtitle").textContent = "Brief mode";
      document.getElementById("discover-mode-desc").innerHTML = "semantic similarity via the UCP embedding engine. Returns catalog matches + AI-generated custom proposals alongside each other.";
      briefEl.placeholder = "e.g. affluent families 35-44 in top-10 DMAs interested in luxury travel";
      document.getElementById("discover-btn-label").textContent = "Find signals";
    }
    renderBriefHints();
    // Clear any prior results so the mode switch is obvious
    document.getElementById("discover-results").innerHTML = '<div class="empty-state"><svg class="empty-icon"><use href="#icon-' + (_discoverMode === "nl" ? "network" : "radar") + '"/></svg><div class="empty-title">Run a ' + (_discoverMode === "nl" ? "query" : "brief") + ' to see matches</div><div class="empty-desc">' + (_discoverMode === "nl" ? "Boolean decomposition shows the AST, matched signals with per-match method, and a composite audience size." : "Catalog signals rank by semantic match. AI-generated proposals appear beside them for briefs that don\\'t map cleanly.") + '</div></div>';
    document.getElementById("discover-status").textContent = "";
  });
});

document.getElementById("discover-btn").addEventListener("click", runDiscoverDispatch);
briefEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runDiscoverDispatch();
});

function runDiscoverDispatch() {
  if (_discoverMode === "nl") return runNlQuery();
  return runDiscover();
}

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
    // Cache signals + proposals so card-click handlers can resolve the
    // signal for the detail panel. Proposals aren't in state.catalog.all
    // (they're ephemeral, not persisted until activation), so without
    // this cache the Discover-tab card click would silently no-op.
    _lastDiscoverSignals = [...catalog, ...proposals];
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

// NL Query mode — calls query_signals_nl, renders the boolean AST +
// matched signals with per-match method + composite audience size.
// Different shape from get_signals so gets its own renderer.
async function runNlQuery() {
  const q = briefEl.value.trim();
  if (!q) { showToast("Enter a query first", true); return; }
  const btn = document.getElementById("discover-btn");
  const status = document.getElementById("discover-status");
  const results = document.getElementById("discover-results");
  btn.disabled = true;
  status.innerHTML = '<span class="spinner"></span>decomposing query + resolving dimensions…';
  results.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Running NL query…</div></div>';

  try {
    const t0 = performance.now();
    const data = await callTool("query_signals_nl", { query: q, limit: 8 });
    const elapsed = Math.round(performance.now() - t0);
    // query_signals_nl response lives under data.result (handler wraps
    // the tool output in {success,result}). Unwrap carefully.
    const payload = data?.result ?? data;
    const matches = payload?.matched_signals || [];
    const estSize = payload?.estimated_size;
    const confTier = payload?.confidence_tier;
    const confScalar = payload?.confidence;
    const ast = payload?.resolved_ast;

    status.textContent = matches.length + " matched signal" + (matches.length === 1 ? "" : "s") + " · " +
      (estSize != null ? fmtNumber(estSize) + " composite" : "no composite") + " · " + elapsed + "ms";
    _lastDiscoverSignals = matches.slice();

    results.innerHTML = renderNlResult({ payload, matches, estSize, confTier, confScalar, ast });
    wireNlCardClicks();
  } catch (e) {
    showToast("NL query failed: " + e.message, true);
    status.textContent = "error";
    results.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  } finally {
    btn.disabled = false;
  }
}

function renderNlResult({ matches, estSize, confTier, confScalar, ast }) {
  const confStr = confTier
    ? confTier + (typeof confScalar === "number" ? " (" + (confScalar * 100).toFixed(0) + "%)" : "")
    : (typeof confScalar === "number" ? (confScalar * 100).toFixed(0) + "%" : "—");
  const hero = '' +
    '<div class="nl-result-hero">' +
      '<div>' +
        '<div class="nl-size-label">Composite audience</div>' +
        '<div class="nl-size">' + (estSize != null ? fmtNumber(estSize) : "—") + '</div>' +
      '</div>' +
      '<div class="nl-conf">' +
        '<span class="nl-size-label">Confidence</span>' +
        '<span class="nl-conf-value">' + escapeHtml(confStr) + '</span>' +
      '</div>' +
      '<div>' +
        '<div class="nl-size-label">Matches</div>' +
        '<div class="nl-size" style="font-size:20px">' + matches.length + '</div>' +
      '</div>' +
    '</div>';

  const astBlock = ast
    ? '<details class="nl-ast-block" open>' +
        '<summary><span class="label">Resolved boolean AST</span></summary>' +
        '<div class="nl-ast-tree">' + renderAst(ast, 0) + '</div>' +
      '</details>'
    : "";

  const matchList = matches.length
    ? '<div class="result-col-header" style="margin-top:18px"><span class="result-col-title">Matched signals</span><span class="result-col-count">' + matches.length + '</span></div>' +
      matches.map(renderNlMatchCard).join("")
    : '<div class="empty-state" style="margin-top:18px"><div class="empty-desc">No signals matched this NL query. Try a broader phrasing.</div></div>';

  return '<div class="nl-result-shell">' + hero + astBlock + matchList + '</div>';
}

function renderAst(node, depth) {
  if (!node || typeof node !== "object") return "";
  const cls = "depth-" + Math.min(depth, 3);
  if (node.op && Array.isArray(node.children)) {
    const kids = node.children.map((c) => renderAst(c, depth + 1)).join("");
    return '<div class="' + cls + '"><span class="op">' + escapeHtml(String(node.op).toUpperCase()) + '</span></div>' + kids;
  }
  // Leaf
  const label = node.label || node.dimension || node.concept_id || "";
  const value = node.value != null ? " = " + (Array.isArray(node.value) ? node.value.join(" / ") : node.value) : "";
  return '<div class="' + cls + '"><span class="leaf">' + escapeHtml(String(label)) + escapeHtml(String(value)) + '</span></div>';
}

function renderNlMatchCard(m) {
  const sid = m.signal_agent_segment_id || m.signal_id?.id || "";
  const method = m.match_method || "embedding";
  const score = typeof m.match_score === "number" ? m.match_score.toFixed(2) : "—";
  const audience = m.estimated_audience_size != null ? fmtNumber(m.estimated_audience_size) : "—";
  // Sec-38 B7 (C2): explain-this-match. Builds a short human-readable
  // reason string from match_method + any matched tokens/rules the
  // resolver echoed back. Shown as a tooltip-style sub-line so the
  // planner understands *why* this signal scored.
  const reason = explainMatch(m);
  return '' +
    '<div class="nl-match-card" data-sid="' + escapeHtml(sid) + '">' +
      '<div>' +
        '<div class="nl-m-name">' + escapeHtml(m.name || "(unnamed)") + dtsPill(m) + freshnessPill(m) + sensitivePill(m) + '</div>' +
        '<div class="nl-m-sub">' + escapeHtml(sid) + ' · ' + audience + ' audience</div>' +
        (reason ? '<div class="nl-m-reason"><svg class="ico"><use href="#icon-info"/></svg><span>' + escapeHtml(reason) + '</span></div>' : "") +
      '</div>' +
      '<span class="nl-m-method ' + escapeHtml(method) + '">' + escapeHtml(method.replace(/_/g, " ")) + '</span>' +
      '<span class="nl-m-score">' + score + '</span>' +
    '</div>';
}

// Sec-38 B7 (C2): synthesize a human-readable explanation for why the
// resolver matched this signal. Uses whatever breadcrumbs the resolver
// emits (match_method + match_dimensions / matched_rules / matched_terms
// / score_breakdown) and falls back to a method-class description.
function explainMatch(m) {
  const method = m.match_method || "embedding";
  const parts = [];
  if (Array.isArray(m.matched_dimensions) && m.matched_dimensions.length) {
    parts.push("matched " + m.matched_dimensions.slice(0, 3).join(", "));
  }
  if (Array.isArray(m.matched_terms) && m.matched_terms.length) {
    parts.push("lexical overlap: " + m.matched_terms.slice(0, 3).join(", "));
  }
  if (Array.isArray(m.matched_rules) && m.matched_rules.length) {
    parts.push(m.matched_rules.length + " rules matched");
  }
  if (typeof m.match_score === "number") {
    if (method === "embedding" || method === "semantic") {
      parts.push("cos=" + m.match_score.toFixed(2));
    } else if (method === "exact_rule" || method === "rule") {
      parts.push("rule-exact");
    } else if (method === "lexical") {
      parts.push("token match");
    }
  }
  if (parts.length === 0) {
    // Method-class fallback
    if (method === "embedding" || method === "semantic") return "Ranked by semantic similarity in the UCP embedding space.";
    if (method === "exact_rule" || method === "rule") return "Matched directly on declared targeting rules.";
    if (method === "lexical") return "Token-level overlap with the query.";
    return "";
  }
  return parts.join(" · ");
}

function wireNlCardClicks() {
  document.querySelectorAll(".nl-match-card").forEach((card) => {
    card.addEventListener("click", () => {
      const sid = card.dataset.sid;
      const partial = _lastDiscoverSignals.find((x) => (x.signal_agent_segment_id || x.signal_id?.id) === sid);
      openDetailHydrated(sid, partial);
    });
  });
}

// Some panels open with only an abridged signal object — query_signals_nl
// returns {name, signal_agent_segment_id, match_score, match_method,
// estimated_audience_size, coverage_percentage} and nothing else. The
// detail panel renders "—" for category / deployments / DTS when given
// this shape. Hydrate via get_signals {signal_ids: [sid]} first so the
// panel shows the full picture.
async function openDetailHydrated(sid, fallback) {
  // Fast path: full record already in catalog cache
  const fromCatalog = state.catalog.all.find((x) => (x.signal_agent_segment_id || x.signal_id?.id) === sid);
  if (fromCatalog && Array.isArray(fromCatalog.deployments)) {
    openDetail(fromCatalog);
    return;
  }
  // Open with the skinny record immediately so the panel feels
  // responsive, then upgrade in place once the full record arrives.
  if (fallback) openDetail(fallback);
  try {
    const data = await callTool("get_signals", {
      signal_ids: [sid],
      deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
      max_results: 1,
    });
    const full = (data?.signals || []).find((s) => (s.signal_agent_segment_id || s.signal_id?.id) === sid);
    if (full && state.detail && (state.detail.signal_agent_segment_id || state.detail.signal_id?.id) === sid) {
      openDetail(full);
    }
  } catch { /* leave the skinny panel in place */ }
}

function renderDiscoverCard(s) {
  const type = s.signal_type || "marketplace";
  const sid = s.signal_agent_segment_id || s.signal_id?.id || "";
  const price = fmtCPM(s);
  return '' +
    '<div class="signal-card" data-sid="' + escapeHtml(sid) + '">' +
      '<div class="sc-row-1">' +
        '<div class="sc-name">' + escapeHtml(s.name || "(unnamed)") + dtsPill(s) + freshnessPill(s) + sensitivePill(s) + '</div>' +
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
  tbody.innerHTML = skeletonRows(6, 7);

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
  // Distinct vertical count (live, from the real ID prefix)
  const verticals = new Set(all.map(verticalOf));
  document.getElementById("kpi-verticals").textContent = String(verticals.size);
  // Sparkline for "total signals" — fake upward trend visualizing growth
  const spark = document.getElementById("spark-total");
  spark.innerHTML = '<svg viewBox="0 0 80 24"><path d="M2 22 L12 20 L22 19 L32 16 L42 14 L52 10 L62 8 L72 5 L78 4" fill="none" stroke="var(--accent)" stroke-width="1.4"/></svg>';
  // Subtitle count on the catalog pane
  const sub = document.getElementById("catalog-subtitle-counts");
  if (sub) sub.textContent = all.length + " signals · " + verticals.size + " verticals";
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
        '<td class="td-name"><div>' + escapeHtml(s.name || "") + dtsPill(s) + freshnessPill(s) + sensitivePill(s) + '</div><span class="signal-id">' + escapeHtml(sid) + '</span></td>' +
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
  primeUcpBanner();
  searchConcepts("high income");
}

async function primeUcpBanner() {
  try {
    const r = await fetch("/capabilities");
    const caps = await r.json();
    const ucp = caps?.ext?.ucp || {};
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set("ucp-b-space", Array.isArray(ucp.supported_spaces) && ucp.supported_spaces[0] ? ucp.supported_spaces[0] : "—");
    set("ucp-b-dims",  Array.isArray(ucp.dimensions) && ucp.dimensions[0] ? ucp.dimensions[0] + "-d" : "—");
    set("ucp-b-enc",   Array.isArray(ucp.supported_encodings) && ucp.supported_encodings[0] ? ucp.supported_encodings[0] : "—");
    setHtml("ucp-b-sim", ucp.similarity_search
      ? '<span class="pill pill-success">enabled</span>'
      : '<span class="pill pill-muted">off</span>');
    set("ucp-b-count", String(ucp.concept_registry?.concept_count ?? "—"));
  } catch { /* non-fatal */ }
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
      '<div class="concept-card" data-cid="' + escapeHtml(c.concept_id) + '" data-label="' + escapeHtml(c.label || "") + '">' +
        '<div class="cc-row">' +
          '<span class="cc-id">' + escapeHtml(c.concept_id) + '</span>' +
          '<span class="cc-cat">' + escapeHtml(c.category || "") + '</span>' +
        '</div>' +
        '<div class="cc-label">' + escapeHtml(c.label || "") + '</div>' +
        '<div class="cc-desc">' + escapeHtml(c.description || "") + '</div>' +
        '<div class="cc-cta"><span>Find matching signals</span><svg class="ico"><use href="#icon-arrow-right"/></svg></div>' +
      '</div>'
    ).join("");
    // Wire: click a concept → prefill Discover brief with the concept
    // label, switch tabs, run discovery. Concepts aren't directly
    // activatable (they're taxonomy nodes, not signals) but they map
    // to signals semantically — this is the natural concept→signal
    // bridge flow.
    host.querySelectorAll(".concept-card").forEach((card) => {
      card.addEventListener("click", () => {
        const label = card.dataset.label || "";
        if (!label) return;
        briefEl.value = label;
        switchTab("discover");
        runDiscover();
      });
    });
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
  // Sec-37 B7: tiny {} affordance next to the title opens the MCP
  // exchange drawer for this signal — agents + humans can see the
  // exact request/response on the wire.
  document.getElementById("detail-name").innerHTML =
    escapeHtml(sig.name || "(unnamed)") +
    ' <button class="mcp-inspect-btn" id="detail-mcp-inspect" title="Inspect MCP exchange">{…}</button>';

  const body = document.getElementById("detail-body");
  body.innerHTML = '' +
    // Hero stats — always span full width, not collapsible
    '<div class="detail-section span-full no-collapse" data-section="stats" data-section-title="Overview">' +
      '<div class="detail-stats">' +
        '<div class="detail-stat"><div class="detail-stat-label">Audience</div><div class="detail-stat-value">' + fmtNumber(sig.estimated_audience_size) + '</div></div>' +
        '<div class="detail-stat"><div class="detail-stat-label">Coverage</div><div class="detail-stat-value">' + (typeof sig.coverage_percentage === "number" ? sig.coverage_percentage.toFixed(1) + "%" : "—") + '</div></div>' +
        '<div class="detail-stat"><div class="detail-stat-label">CPM</div><div class="detail-stat-value">' + price.display + '</div></div>' +
        '<div class="detail-stat"><div class="detail-stat-label">Vertical</div><div class="detail-stat-value" style="font-size:14px;text-transform:capitalize">' + escapeHtml(verticalOf(sig)) + '</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="detail-section span-full" data-section="desc" data-section-title="Description">' +
      '<div class="detail-section-label">Description</div>' +
      '<div class="detail-desc">' + escapeHtml(sig.description || "No description provided.") + '</div>' +
    '</div>' +
    '<div class="detail-section" data-section="meta" data-section-title="Metadata">' +
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
    '<div class="detail-section" data-section="deployments" data-section-title="Deployments">' +
      '<div class="detail-section-label">Deployments</div>' +
      '<div class="detail-deployments">' +
        (Array.isArray(sig.deployments) && sig.deployments.length
          ? sig.deployments.map((d) => '<div class="detail-deployment"><span class="dep-platform">' + escapeHtml(d.platform || d.type) + '</span><span class="dep-live ' + (d.is_live ? "yes" : "") + '">' + (d.is_live ? "live" : "ready") + '</span></div>').join("")
          : '<div class="dep-live">No deployments declared</div>') +
      '</div>' +
    '</div>' +
    // Sec-37 B4: ID resolution matrix.
    (() => {
      const idInfo = idTypePills(sig);
      return '<div class="detail-section" data-section="id_resolution" data-section-title="ID resolution">' +
        '<div class="detail-section-label">ID resolution <span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px">' + idInfo.count + ' supported</span></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + idInfo.pills + ' ' + idInfo.cookielessPill + '</div>' +
        renderChartExplainer({
          what: "Which identifiers a buyer\\'s integration layer would accept for this audience.",
          how: "Derived from the signal\\'s DTS data_sources + audience_precision_levels (household / individual / device / browser / geography).",
          read: "More pills = broader addressability. Cookieless-ready means ≥1 non-3P-cookie ID is available (UID2 / RampID / hashed email / CTV).",
        }) +
      '</div>';
    })() +
    // Sec-37 B2: Reach & frequency forecaster.
    '<div class="detail-section" data-section="reach" data-section-title="Reach & frequency">' +
      '<div class="detail-section-label">Reach &amp; frequency <span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px">@</span> <span class="reach-budget-input" style="display:inline-flex"><span style="color:var(--text-mut)">$</span><input id="reach-budget" type="number" value="10000" min="500" max="10000000" step="500"/><span style="color:var(--text-mut)">/ 30d</span></span></div>' +
      '<div class="reach-block" id="reach-block"></div>' +
    '</div>' +
    // Sec-38 B4: Measurement & lift mock.
    '<div class="detail-section" data-section="measurement" data-section-title="Measurement & lift">' +
      '<div class="detail-section-label">Measurement &amp; lift <span class="pill pill-mut" style="margin-left:8px;font-size:10px">mock</span></div>' +
      '<div id="measurement-block" class="reach-block"></div>' +
    '</div>' +
    // Sec-38 B2: Cross-taxonomy bridge.
    (sig.x_cross_taxonomy && sig.x_cross_taxonomy.length
      ? '<div class="detail-section" data-section="cross_tax" data-section-title="Cross-taxonomy">' +
          '<div class="detail-section-label">Cross-taxonomy bridge <span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px">' + sig.x_cross_taxonomy.length + ' systems</span></div>' +
          '<div class="cross-tax-grid">' +
            sig.x_cross_taxonomy.map(function (e) {
              var stageClass = e.stage === "live" ? "pill-success" : e.stage === "modeled" ? "pill-info" : "pill-mut";
              return '<div class="cross-tax-row">' +
                '<div class="cross-tax-sys">' + escapeHtml(e.system) + '</div>' +
                '<div class="cross-tax-id"><code>' + escapeHtml(e.id) + '</code></div>' +
                '<div class="cross-tax-stage"><span class="pill ' + stageClass + '" style="font-size:10px">' + escapeHtml(e.stage) + '</span></div>' +
              '</div>';
            }).join("") +
          '</div>' +
          renderChartExplainer({
            what: "The same audience\\'s predicted ID in each major buyer-side taxonomy — so a HoldCo planner can locate it in their own stack.",
            how: "Deterministic per-signal hash. Demo-grade mapping; production would use a real bridge table driven by partner handshakes.",
            read: "Stage flag tells you confidence: live = direct match, modeled = heuristic, roadmap = not yet integrated.",
          }) +
        '</div>'
      : "") +
    // Sec-38 B8 (C4): Data lineage graph — span full so the 4-node flow has room.
    (sig.x_dts
      ? '<div class="detail-section span-full" data-section="lineage" data-section-title="Data lineage">' +
          '<div class="detail-section-label">Data lineage <span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px">provenance chain</span></div>' +
          renderLineageGraph(sig) +
          renderChartExplainer({
            what: "The provenance chain this audience flows through, from raw data sources to activation.",
            how: "Each node is pulled from the signal\\'s DTS label: data_sources → inclusion_methodology + refresh cadence → audience attributes → declared deployments.",
            read: "Read left-to-right. Wider methodology nodes (e.g. Observed/Known) mean fresher, less-modeled audiences — typically higher-lift but smaller scale.",
          }) +
        '</div>'
      : "") +
    // Sec-36: Similar signals — span full.
    '<div class="detail-section span-full" data-section="similar" data-section-title="Similar signals">' +
      '<div class="detail-section-label">Similar signals</div>' +
      '<div class="detail-similar" id="detail-similar-shell">' +
        '<button class="detail-similar-btn" id="detail-similar-btn">' +
          '<svg class="ico"><use href="#icon-network"/></svg>' +
          '<span>Find neighbors via <code style="font-size:11px">get_similar_signals</code></span>' +
        '</button>' +
      '</div>' +
    '</div>' +
    // IAB DTS v1.2 label — span full; uses <details> natively, so we bypass our collapse system.
    (sig.x_dts
      ? '<div class="detail-section span-full no-collapse" data-section="dts" data-section-title="DTS label">' +
          '<details class="dts-block">' +
            '<summary class="detail-section-label" style="cursor:pointer;user-select:none">' +
              '<span class="pill pill-success" style="margin-right:8px">DTS v' + escapeHtml(String(sig.x_dts.dts_version || "1.2")) + '</span>' +
              'IAB Data Transparency Label ' +
              '<span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0">(click to expand)</span>' +
            '</summary>' +
            renderDtsLabel(sig.x_dts) +
          '</details>' +
        '</div>'
      : "");

  document.getElementById("detail-footer").innerHTML =
    '<button class="btn-primary" id="detail-activate"><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate to mock_dsp</span></button>' +
    '<div class="activation-status" id="detail-status"></div>';
  document.getElementById("detail-activate").addEventListener("click", () => activateFromDetail(sig));

  // Wire the "find similar" button — lazy-loads only on click so the
  // panel renders instantly. Uses get_similar_signals with the panel's
  // signal as reference; scores come from cosine over the UCP embedding.
  const simBtn = document.getElementById("detail-similar-btn");
  if (simBtn) simBtn.addEventListener("click", () => loadSimilarForDetail(sig));

  // Reach forecaster — pure compute, re-renders on budget input change
  renderReachBlock(sig);
  renderMeasurementBlock(sig);
  const budgetInput = document.getElementById("reach-budget");
  if (budgetInput) {
    budgetInput.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v) && v > 0) {
        state.reach.budgetUsd = v;
        renderReachBlock(sig);
        renderMeasurementBlock(sig);
      }
    });
  }

  // MCP inspector wire
  const mcpBtn = document.getElementById("detail-mcp-inspect");
  if (mcpBtn) mcpBtn.addEventListener("click", () => openMcpInspector(sig));

  // Sec-39: detail panel UX upgrades.
  wireDetailSectionCollapse();
  renderDetailRail();
  applyDetailMode(state.ui.detailMode);
}

// Sec-39: detail panel UX — mode cycling + collapsed-section memory.
// state.ui is initialized in the main state object above.

// Cycle narrow -> wide -> full. Hitting expand on full goes back to narrow.
function cycleDetailMode() {
  var order = ["narrow", "wide", "full"];
  var cur = state.ui.detailMode || "narrow";
  var next = order[(order.indexOf(cur) + 1) % order.length];
  applyDetailMode(next);
}
function applyDetailMode(mode) {
  state.ui.detailMode = mode;
  var panel = document.getElementById("detail-panel");
  if (panel) panel.setAttribute("data-mode", mode);
  var btn = document.getElementById("detail-expand");
  if (btn) {
    btn.title = mode === "narrow" ? "Expand to wide (f)" : mode === "wide" ? "Expand to full (f)" : "Collapse to narrow (f)";
  }
}
// Each section has a clickable header (.detail-section-label) that toggles
// the .collapsed class on its parent .detail-section. Memory is per-title,
// so reopening another signal keeps the same sections expanded/collapsed.
function wireDetailSectionCollapse() {
  document.querySelectorAll("#detail-body .detail-section").forEach(function (sec) {
    if (sec.classList.contains("no-collapse")) return;
    var title = sec.dataset.sectionTitle || sec.dataset.section || "";
    if (state.ui.collapsedSections.has(title)) sec.classList.add("collapsed");
    var label = sec.querySelector(".detail-section-label");
    if (!label || label.__wired) return;
    label.__wired = true;
    label.addEventListener("click", function (ev) {
      // native <details> summary already handles its own toggle
      if (ev.target.closest("summary")) return;
      sec.classList.toggle("collapsed");
      if (sec.classList.contains("collapsed")) state.ui.collapsedSections.add(title);
      else state.ui.collapsedSections.delete(title);
    });
  });
}
// Side rail nav (visible in full mode). Lists every section with a jump link;
// uses IntersectionObserver to highlight the current section while scrolling.
function renderDetailRail() {
  var list = document.getElementById("detail-rail-list");
  if (!list) return;
  var sections = Array.from(document.querySelectorAll("#detail-body .detail-section"));
  list.innerHTML = sections.map(function (sec) {
    var id = sec.dataset.section || "";
    var title = sec.dataset.sectionTitle || id;
    return '<button class="detail-rail-item" data-target="' + escapeHtml(id) + '">' + escapeHtml(title) + '</button>';
  }).join("");
  list.querySelectorAll(".detail-rail-item").forEach(function (b) {
    b.addEventListener("click", function () {
      var target = document.querySelector("#detail-body .detail-section[data-section=\\"" + b.dataset.target + "\\"]");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  // Active-section tracking via IntersectionObserver
  if (window.__detailRailObserver) window.__detailRailObserver.disconnect();
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var sec = en.target;
      var id = sec.dataset.section;
      list.querySelectorAll(".detail-rail-item").forEach(function (b) {
        b.classList.toggle("active", b.dataset.target === id);
      });
    });
  }, { root: document.getElementById("detail-body"), rootMargin: "-20% 0px -60% 0px", threshold: 0 });
  sections.forEach(function (s) { io.observe(s); });
  window.__detailRailObserver = io;
}

// Sec-39: compact chart explainer block rendered beneath visualizations.
// Three labelled lines: what / how / read. Keeps explanations close to the
// chart they describe without cluttering the default view.
function renderChartExplainer(opts) {
  var what = opts.what || "";
  var how = opts.how || "";
  var read = opts.read || "";
  var limits = opts.limits || "";
  return '<div class="chart-explainer">' +
    '<div class="chart-explainer-head">' +
      '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7.5"/><line x1="10" y1="9" x2="10" y2="14" stroke-linecap="round"/><circle cx="10" cy="6.5" r="0.8" fill="currentColor"/></svg>' +
      '<span>How to read this</span>' +
    '</div>' +
    (what ? '<div class="chart-explainer-row"><span class="ce-k">What</span><span class="ce-v">' + escapeHtml(what) + '</span></div>' : '') +
    (how ? '<div class="chart-explainer-row"><span class="ce-k">How</span><span class="ce-v">' + escapeHtml(how) + '</span></div>' : '') +
    (read ? '<div class="chart-explainer-row"><span class="ce-k">Read</span><span class="ce-v">' + escapeHtml(read) + '</span></div>' : '') +
    (limits ? '<div class="chart-explainer-row"><span class="ce-k">Limits</span><span class="ce-v">' + escapeHtml(limits) + '</span></div>' : '') +
  '</div>';
}

// Sec-37 B2: Reach & frequency math. Inputs: audience size, CPM,
// budget. Output: reach (cap 80% of universe), avg frequency, daily
// impressions + unique-reach curve. Curve is a logistic-style
// saturation (reach grows fast early, asymptotes).
function renderReachBlock(sig) {
  const host = document.getElementById("reach-block");
  if (!host) return;
  const audience = sig.estimated_audience_size || 0;
  const cpmOpt = fmtCPM(sig);
  const cpm = cpmOpt.cpm ?? 5.0;
  const budget = state.reach.budgetUsd;
  const impressions = (budget * 1000) / cpm;
  const rawReach = audience > 0 ? Math.min(0.8, (impressions / (audience * 3))) : 0;
  const reach = Math.round(audience * rawReach);
  const freq = reach > 0 ? Math.min(8, impressions / reach) : 0;
  const daily = impressions / 30;

  // 30-day cumulative-reach curve: logistic saturation
  const curvePts = [];
  for (let day = 0; day <= 30; day++) {
    const fraction = 1 - Math.exp(-day / 7);
    curvePts.push({ x: day, y: reach * fraction });
  }
  const maxY = reach || 1;
  const path = curvePts.map((p, i) => (i === 0 ? "M" : "L") + (p.x * (300 / 30)) + "," + (50 - (p.y / maxY) * 45)).join(" ");

  host.innerHTML = '' +
    '<div class="reach-stats">' +
      '<div class="reach-stat"><div class="reach-stat-label">Unique reach</div><div class="reach-stat-value">' + fmtNumber(reach) + '</div></div>' +
      '<div class="reach-stat"><div class="reach-stat-label">Avg frequency</div><div class="reach-stat-value">' + freq.toFixed(1) + 'x</div></div>' +
      '<div class="reach-stat"><div class="reach-stat-label">Total impressions</div><div class="reach-stat-value">' + fmtNumber(Math.round(impressions)) + '</div></div>' +
      '<div class="reach-stat"><div class="reach-stat-label">Daily delivery</div><div class="reach-stat-value">' + fmtNumber(Math.round(daily)) + '</div></div>' +
    '</div>' +
    '<div style="font-size:10.5px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-top:10px;margin-bottom:4px">30-day cumulative reach</div>' +
    '<div class="reach-curve"><svg viewBox="0 0 300 50" preserveAspectRatio="none">' +
      '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="1.5"/>' +
      '<path d="' + path + ' L 300,50 L 0,50 Z" fill="var(--accent-dim)"/>' +
    '</svg></div>' +
    '<div style="font-size:10.5px;color:var(--text-mut);margin-top:8px">Methodology: CPM @ $' + cpm.toFixed(2) + ' · reach capped at 80% of addressable audience · logistic saturation τ=7 days. Mock — plug measurement partner for actuals.</div>' +
    renderChartExplainer({
      what: "Expected unique reach and frequency if you spent your budget against this signal over 30 days.",
      how: "impressions = (budget × 1000) / CPM. Unique reach = impressions / 3 (capped at 80% of audience). Frequency = impressions / reach. Curve uses 1 − e^(−day/7) saturation.",
      read: "Flatter curves = audience saturated — diminishing returns from further spend. Steeper curves = still room to reach more unique people.",
      limits: "Mock model. Real reach depends on DSP bid competition, frequency caps, and creative rotation.",
    });
}

// Sec-38 B8 (C4): Data lineage graph. Renders a horizontal 4-node flow
// summarizing the signal's provenance chain from x_dts fields the signal
// already carries. Nodes: (1) raw sources, (2) inclusion methodology,
// (3) audience expression, (4) distribution deployments. Connectors are
// simple SVG paths; no external graph library.
function renderLineageGraph(sig) {
  var dts = sig.x_dts || {};
  var sources = Array.isArray(dts.data_sources) ? dts.data_sources : ["Online Survey"];
  var methodology = dts.audience_inclusion_methodology || "Modeled";
  var refresh = dts.audience_refresh || "Static";
  var depPlatforms = (sig.deployments || []).map(function (d) { return d.platform || d.type; }).filter(Boolean);
  var categoryType = sig.category_type || "—";
  var size = sig.estimated_audience_size || 0;

  var nodes = [
    {
      label: "Raw sources",
      lines: sources.slice(0, 3),
      extra: sources.length > 3 ? "+" + (sources.length - 3) + " more" : "",
      color: "#2bd4a0",
    },
    {
      label: "Methodology",
      lines: [methodology, "Refresh: " + refresh],
      extra: "",
      color: "#4f8eff",
    },
    {
      label: "Audience",
      lines: [categoryType, fmtNumber(size) + " people"],
      extra: "",
      color: "#8b6eff",
    },
    {
      label: "Distribution",
      lines: depPlatforms.slice(0, 3),
      extra: depPlatforms.length > 3 ? "+" + (depPlatforms.length - 3) + " more" : "",
      color: "#ff7a5c",
    },
  ];

  var W = 680, H = 130;
  var nodeW = 140, nodeH = 74;
  var gap = (W - nodes.length * nodeW) / (nodes.length - 1);
  var yMid = (H - nodeH) / 2;
  var nodesSvg = nodes.map(function (n, i) {
    var x = i * (nodeW + gap);
    return '<g transform="translate(' + x + ',' + yMid + ')">' +
      '<rect x="0" y="0" width="' + nodeW + '" height="' + nodeH + '" rx="6" fill="' + n.color + '" fill-opacity="0.14" stroke="' + n.color + '" stroke-opacity="0.7" stroke-width="1.2"/>' +
      '<text x="10" y="18" fill="' + n.color + '" font-size="10.5" font-weight="700" font-family="ui-sans-serif" text-transform="uppercase">' + escapeHtml(n.label) + '</text>' +
      n.lines.map(function (ln, li) {
        return '<text x="10" y="' + (34 + li * 13) + '" fill="var(--text)" font-size="11" font-family="ui-monospace">' + escapeHtml(String(ln).slice(0, 22)) + '</text>';
      }).join("") +
      (n.extra ? '<text x="10" y="' + (34 + n.lines.length * 13) + '" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">' + escapeHtml(n.extra) + '</text>' : "") +
    '</g>';
  }).join("");

  var connectorsSvg = "";
  for (var i = 0; i < nodes.length - 1; i++) {
    var x1 = i * (nodeW + gap) + nodeW;
    var x2 = (i + 1) * (nodeW + gap);
    var y = yMid + nodeH / 2;
    connectorsSvg += '<path d="M' + x1 + ',' + y + ' C' + (x1 + gap / 2) + ',' + y + ' ' + (x1 + gap / 2) + ',' + y + ' ' + x2 + ',' + y + '" ' +
      'fill="none" stroke="var(--text-mut)" stroke-opacity="0.4" stroke-width="1.2" marker-end="url(#lineage-arrow)"/>';
  }

  return '<div class="lineage-graph">' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
      '<defs><marker id="lineage-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="var(--text-mut)" fill-opacity="0.5"/></marker></defs>' +
      connectorsSvg + nodesSvg +
    '</svg>' +
  '</div>';
}

// Sec-38 B4: Measurement & lift mock panel. Three sub-panels:
//   1) Lift forecast  — baseline vs exposed brand-awareness / purchase-intent
//                       delta modeled as a function of signal specificity.
//   2) Delivery sim   — daily pacing bars over 30 days (mock smooth delivery).
//   3) Campaign over  — overlap-with-existing-campaigns placeholder tile.
// All numbers are synthesized from (audience_size, cpm, budget) and the
// signal's specificity (category_type + has rules). Clearly mock.
function renderMeasurementBlock(sig) {
  var host = document.getElementById("measurement-block");
  if (!host) return;
  var audience = sig.estimated_audience_size || 0;
  var cpmOpt = fmtCPM(sig);
  var cpm = cpmOpt.cpm || 5.0;
  var budget = state.reach.budgetUsd;
  var impressions = (budget * 1000) / cpm;

  // Specificity score 0..1 — tightly-defined signals get higher lift.
  // Purchase-intent composites > interest > demographic > geo.
  var specScore =
    sig.category_type === "purchase_intent" ? 0.85
    : sig.category_type === "composite" ? 0.80
    : sig.category_type === "interest" ? 0.65
    : sig.category_type === "demographic" ? 0.45
    : 0.40;
  // Smaller audiences = more specific = higher lift (diminishing at extremes)
  var sizeFactor = audience > 0 ? Math.min(1, 50_000_000 / (audience + 1_000_000)) : 0.5;
  var liftPct = Math.max(2, Math.min(28, Math.round(specScore * sizeFactor * 32 * 10) / 10));
  var baselineCTR = 0.12;
  var exposedCTR = baselineCTR * (1 + liftPct / 100);

  // Delivery simulator — 30-day bars with weekend dip + small noise
  var bars = [];
  for (var d = 0; d < 30; d++) {
    var weekend = (d % 7 === 5 || d % 7 === 6) ? 0.75 : 1.0;
    var noise = 0.85 + (Math.sin(d * 0.7 + sig.signal_agent_segment_id.length) + 1) * 0.12;
    bars.push(weekend * noise);
  }
  var barMax = Math.max.apply(null, bars);
  var dailyImps = impressions / 30;

  // Campaign overlap — placeholder showing how a cleanroom match would work.
  // We draw 3 fake campaign rows with synthesized overlap % derived from
  // signal ID hash so it's stable per signal.
  function hashFrac(s, salt) {
    var h = 5381;
    var str = s + salt;
    for (var i = 0; i < str.length; i++) { h = ((h << 5) + h) ^ str.charCodeAt(i); h = h >>> 0; }
    return (h % 1000) / 1000;
  }
  var sid = sig.signal_agent_segment_id || "";
  var campaigns = [
    { name: "Q1 Awareness · Display",   overlap: Math.round(hashFrac(sid, "q1d") * 24 + 4) },
    { name: "Always-On · Retargeting",  overlap: Math.round(hashFrac(sid, "aor") * 38 + 10) },
    { name: "CTV · Brand Pulse",        overlap: Math.round(hashFrac(sid, "ctv") * 18 + 2) },
  ];

  var liftColor = liftPct >= 15 ? "var(--ok)" : liftPct >= 8 ? "var(--accent)" : "var(--warn)";

  host.innerHTML = '' +
    // Lift forecast
    '<div class="meas-row">' +
      '<div class="meas-cell">' +
        '<div class="reach-stat-label">Predicted brand-lift</div>' +
        '<div class="reach-stat-value" style="color:' + liftColor + '">+' + liftPct.toFixed(1) + '%</div>' +
        '<div style="font-size:10.5px;color:var(--text-mut);margin-top:2px">vs unexposed baseline</div>' +
      '</div>' +
      '<div class="meas-cell">' +
        '<div class="reach-stat-label">Exposed CTR (mock)</div>' +
        '<div class="reach-stat-value">' + (exposedCTR * 100).toFixed(2) + '%</div>' +
        '<div style="font-size:10.5px;color:var(--text-mut);margin-top:2px">baseline ' + (baselineCTR * 100).toFixed(2) + '%</div>' +
      '</div>' +
      '<div class="meas-cell">' +
        '<div class="reach-stat-label">Specificity score</div>' +
        '<div class="reach-stat-value">' + (specScore * 100).toFixed(0) + '</div>' +
        '<div style="font-size:10.5px;color:var(--text-mut);margin-top:2px">0-100 · drives lift</div>' +
      '</div>' +
    '</div>' +
    // Delivery simulator
    '<div style="font-size:10.5px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;margin-bottom:6px">Delivery simulator — 30-day pacing</div>' +
    '<div class="delivery-bars">' +
      bars.map(function (b, i) {
        var h = Math.max(4, Math.round((b / barMax) * 42));
        var isWknd = (i % 7 === 5 || i % 7 === 6);
        return '<div class="delivery-bar" title="Day ' + (i + 1) + ' · ~' + fmtNumber(Math.round(dailyImps * b)) + ' imps" style="height:' + h + 'px;opacity:' + (isWknd ? 0.55 : 1) + '"></div>';
      }).join("") +
    '</div>' +
    '<div style="font-size:10.5px;color:var(--text-mut);margin-top:4px">Smooth pacing · ~' + fmtNumber(Math.round(dailyImps)) + ' imps/day avg · weekends dip ~25%</div>' +
    // Campaign overlap placeholder
    '<div style="font-size:10.5px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;margin-bottom:6px">Overlap with existing campaigns <span style="text-transform:none;letter-spacing:0">(cleanroom-matched mock)</span></div>' +
    '<div class="campaign-overlap">' +
      campaigns.map(function (c) {
        return '<div class="campaign-row">' +
          '<div class="campaign-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="campaign-bar-wrap"><div class="campaign-bar" style="width:' + c.overlap + '%"></div></div>' +
          '<div class="campaign-pct">' + c.overlap + '%</div>' +
        '</div>';
      }).join("") +
    '</div>' +
    '<div style="font-size:10.5px;color:var(--text-mut);margin-top:8px">Methodology: lift modeled from signal specificity × size-coverage. Plug a measurement partner (Nielsen / IAS / DV / Kantar / Circana) for actuals. Campaign overlap would resolve via your 1P campaign IDs in a cleanroom.</div>' +
    renderChartExplainer({
      what: "Three sub-panels: predicted brand-lift, daily delivery pacing, and how much this audience overlaps with existing campaigns.",
      how: "Lift = specificity × size-factor × 32 (capped 2-28%). Specificity score leans on category (purchase_intent > composite > interest > demographic > geo). Pacing bars are synthetic daily impressions with a ~25% weekend dip. Campaign overlap % is a hashed placeholder for what a cleanroom match would return.",
      read: "Higher lift + steady pacing + low campaign overlap = best incremental reach. High overlap means you\\'d be re-buying the same people.",
      limits: "All three sub-panels are mocks clearly flagged at the capability level (ext.measurement.*.supported = \\"mock\\").",
    });
}

// Sec-37 B7: MCP inspector. Shows the get_signals{signal_ids:[sid]}
// exchange as it would appear on the wire. "Run live" replays it
// against /mcp and swaps the response with the actual result.
function openMcpInspector(sig) {
  const drawer = document.getElementById("mcp-drawer");
  const body = document.getElementById("mcp-drawer-body");
  const sid = sig.signal_agent_segment_id || sig.signal_id?.id || "";
  document.getElementById("mcp-drawer-title").textContent = "MCP exchange · " + sig.name;
  const request = {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: {
      name: "get_signals",
      arguments: {
        signal_ids: [sid],
        deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
        max_results: 1,
      },
    },
  };
  // Synthesize the expected response shape from the signal we already have
  const response = {
    jsonrpc: "2.0", id: 1,
    result: {
      content: [{ type: "text", text: "[synthesized — run live to fetch]" }],
      isError: false,
      structuredContent: {
        message: "Found 1 signal",
        context_id: "inspect_" + Date.now(),
        signals: [sig],
        count: 1,
        totalCount: 1,
        offset: 0,
        hasMore: false,
      },
    },
  };
  body.innerHTML = '' +
    '<div class="mcp-drawer-section">' +
      '<div class="mcp-drawer-label"><span>Request — POST /mcp</span><button class="copy-btn" data-copy="req">copy</button></div>' +
      '<pre class="caps-raw-json" id="mcp-req" style="max-height:280px">' + highlightJson(JSON.stringify(request, null, 2)) + '</pre>' +
    '</div>' +
    '<div class="mcp-drawer-section">' +
      '<div class="mcp-drawer-label"><span>Response (synthesized)</span><button class="copy-btn" data-copy="resp">copy</button></div>' +
      '<pre class="caps-raw-json" id="mcp-resp" style="max-height:420px">' + highlightJson(JSON.stringify(response, null, 2)) + '</pre>' +
    '</div>';
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  // Copy buttons
  body.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.copy;
      const payload = key === "req" ? request : response;
      try {
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        showToast((key === "req" ? "Request" : "Response") + " copied");
      } catch { showToast("Copy failed", true); }
    });
  });
  // Run-live replaces the synthesized response with the actual one
  document.getElementById("mcp-drawer-run").onclick = async () => {
    const respEl = document.getElementById("mcp-resp");
    respEl.innerHTML = '<span class="spinner"></span> firing /mcp…';
    try {
      const r = await fetch("/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
        body: JSON.stringify(request),
      });
      const actual = await r.json();
      respEl.innerHTML = highlightJson(JSON.stringify(actual, null, 2));
      document.querySelector("#mcp-drawer-body .mcp-drawer-section:last-child .mcp-drawer-label span").textContent = "Response — live " + r.status;
    } catch (e) {
      respEl.innerHTML = '<span style="color:var(--error)">' + escapeHtml(e.message) + '</span>';
    }
  };
}

document.getElementById("mcp-drawer-close").addEventListener("click", () => {
  document.getElementById("mcp-drawer").classList.remove("open");
});

async function loadSimilarForDetail(sig) {
  const shell = document.getElementById("detail-similar-shell");
  const sid = sig.signal_agent_segment_id || sig.signal_id?.id || "";
  shell.innerHTML = '<div style="color:var(--text-mut);font-size:12px;padding:4px 0"><span class="spinner"></span>Computing nearest neighbors…</div>';
  try {
    const data = await callTool("get_similar_signals", {
      signal_agent_segment_id: sid,
      top_k: 5,
      min_similarity: 0.3,
      deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
    });
    const results = (data?.results || []).filter((r) => {
      const rsid = r.signal_agent_segment_id || r.signal_id?.id;
      return rsid && rsid !== sid;
    });
    if (results.length === 0) {
      shell.innerHTML = '<div style="color:var(--text-mut);font-size:12px;padding:4px 0">No neighbors above the 0.3 cosine threshold. This signal is semantically isolated in the catalog.</div>';
      return;
    }
    shell.innerHTML =
      '<div style="font-size:10.5px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Top ' + results.length + ' neighbors (cosine similarity)</div>' +
      '<div class="detail-similar-list">' +
        results.map((r) => {
          const rsid = r.signal_agent_segment_id || r.signal_id?.id || "";
          const score = typeof r.cosine_similarity === "number" ? r.cosine_similarity.toFixed(3) : "—";
          return '<div class="detail-similar-item" data-sid="' + escapeHtml(rsid) + '">' +
            '<div class="ds-name">' + escapeHtml(r.name || "") + '</div>' +
            '<span class="ds-score">' + score + '</span>' +
          '</div>';
        }).join("") +
      '</div>';
    shell.querySelectorAll(".detail-similar-item").forEach((el) => {
      el.addEventListener("click", () => {
        const nsid = el.dataset.sid;
        const nsig = results.find((r) => (r.signal_agent_segment_id || r.signal_id?.id) === nsid);
        if (nsig) openDetail(nsig);
      });
    });
  } catch (e) {
    shell.innerHTML = '<div style="color:var(--error);font-size:12px;padding:4px 0">✗ ' + escapeHtml(e.message) + '</div>';
  }
}

function closeDetail() {
  document.getElementById("detail-panel").classList.remove("open");
  document.getElementById("backdrop").classList.remove("open");
  state.detail = null;
}
document.getElementById("detail-close").addEventListener("click", closeDetail);
document.getElementById("backdrop").addEventListener("click", closeDetail);
// Sec-39: expand cycles mode; collapse-all toggles all sections folded/unfolded
document.getElementById("detail-expand").addEventListener("click", cycleDetailMode);
document.getElementById("detail-collapse-all").addEventListener("click", function () {
  var secs = Array.from(document.querySelectorAll("#detail-body .detail-section:not(.no-collapse)"));
  var anyOpen = secs.some(function (s) { return !s.classList.contains("collapsed"); });
  secs.forEach(function (s) {
    var title = s.dataset.sectionTitle || s.dataset.section || "";
    s.classList.toggle("collapsed", anyOpen);
    if (anyOpen) state.ui.collapsedSections.add(title);
    else state.ui.collapsedSections.delete(title);
  });
});
// Esc + f are handled inside the main keydown listener below (Sec-39).

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

//────────────────────────────────────────────────────────────────────────
// §4 Treemap — d3-hierarchy squarify, vanilla SVG via DOM API
//────────────────────────────────────────────────────────────────────────
async function ensureTreemap() {
  if (state.treemap.rendered) return;
  if (state.catalog.all.length === 0) await loadCatalog();
  renderTreemap();
  state.treemap.rendered = true;
  var tmExpl = document.getElementById("treemap-explainer");
  if (tmExpl) tmExpl.innerHTML = renderChartExplainer({
    what: "The whole marketplace at a glance. Each cell is one audience.",
    how: "Treemap layout via d3-hierarchy squarify. Cell area \u221d estimated audience size. Cell color = category type (demographic / interest / purchase-intent / geo / composite).",
    read: "Biggest cells = broadest audiences. Clusters of same-color cells reveal where the catalog is deep (interest) vs narrow (purchase intent). Click any cell to open its detail panel.",
  });

  // Re-layout on container resize
  if (typeof ResizeObserver !== "undefined" && !state.treemap.resizeObserver) {
    const canvas = document.getElementById("treemap-canvas");
    state.treemap.resizeObserver = new ResizeObserver(() => {
      if (document.querySelector(".tab-pane[data-tab=treemap]").classList.contains("active")) {
        renderTreemap();
      }
    });
    state.treemap.resizeObserver.observe(canvas);
  }
}

// Category palette — HSL rotation with fixed S/L so all categories
// look cohesive regardless of how many we have. Skips political-hue
// reds (used for errors) and very-close hues.
function categoryHue(category, allCategories) {
  const idx = allCategories.indexOf(category);
  if (idx < 0) return 220;
  return (30 + (idx * 360) / allCategories.length) % 360;
}
function categoryColor(category, allCategories) {
  return \`hsl(\${categoryHue(category, allCategories)} 55% 55%)\`;
}

// Perceived luminance from HSL — used to pick readable label color
// per cell. Blues/purples at 55% lightness are perceptually darker
// than yellows/greens at the same L, so a flat threshold on lightness
// would flip labels inconsistently. Computing sRGB-relative luminance
// gets this right across the hue wheel.
function hslToLuminance(h, s, l) {
  const hh = h / 360, ss = s, ll = l;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n) => {
    const k = (n + hh * 12) % 12;
    return ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const r = f(0), g = f(8), b = f(4);
  const lin = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function isDarkColor(category, allCategories) {
  const h = categoryHue(category, allCategories);
  return hslToLuminance(h, 0.55, 0.55) < 0.38;
}

function renderTreemap() {
  const canvas = document.getElementById("treemap-canvas");
  if (!D3) {
    canvas.innerHTML = '<div class="empty-state"><div class="empty-title">Treemap unavailable</div><div class="empty-desc">d3-hierarchy failed to load from CDN. Browse the <a href="#" onclick="switchTab(\\'catalog\\');return false">catalog</a> instead.</div></div>';
    return;
  }
  const signals = state.catalog.all.filter((s) => s.estimated_audience_size && s.estimated_audience_size > 0);
  if (signals.length === 0) {
    canvas.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading catalog…</div></div>';
    return;
  }

  // Group by category_type (data-driven — works for 5 or 50 categories)
  const groups = new Map();
  for (const s of signals) {
    const key = s.category_type || "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const categories = [...groups.keys()].sort();
  const root = {
    name: "root",
    children: categories.map((cat) => ({
      name: cat,
      children: groups.get(cat).map((s) => ({
        name: s.name,
        value: s.estimated_audience_size,
        category: cat,
        signal: s,
      })),
    })),
  };

  const rect = canvas.getBoundingClientRect();
  const w = Math.max(400, rect.width);
  const h = Math.max(420, rect.height);

  const hier = D3.hierarchy(root).sum((d) => d.value || 0).sort((a, b) => (b.value || 0) - (a.value || 0));
  const layout = D3.treemap().size([w, h]).paddingOuter(4).paddingInner(1).round(true);
  layout(hier);

  // Build SVG with vanilla DOM (no D3 selection API per spec)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", \`0 0 \${w} \${h}\`);
  svg.setAttribute("preserveAspectRatio", "none");

  const leaves = hier.leaves();
  for (const leaf of leaves) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "treemap-cell");
    const rectEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rectEl.setAttribute("x", leaf.x0);
    rectEl.setAttribute("y", leaf.y0);
    rectEl.setAttribute("width", Math.max(0, leaf.x1 - leaf.x0));
    rectEl.setAttribute("height", Math.max(0, leaf.y1 - leaf.y0));
    rectEl.setAttribute("fill", categoryColor(leaf.data.category, categories));
    rectEl.setAttribute("stroke", "var(--bg-base)");
    rectEl.setAttribute("stroke-width", "1");
    g.appendChild(rectEl);

    const cellW = leaf.x1 - leaf.x0;
    const cellH = leaf.y1 - leaf.y0;
    // Tiered label rendering:
    //   large  (> 6000 sq px): 11px name + 10px value subtitle
    //   medium (> 2500 sq px): 10.5px name, no subtitle
    //   small  (> 1200 sq px): 9.5px name, truncated harder, thinner halo
    // Below ~1200 sq px we skip — the halo would eat the cell.
    const area = cellW * cellH;
    let tier = null;
    if (area > 6000 && cellH > 28 && cellW > 56) tier = "large";
    else if (area > 2500 && cellH > 20 && cellW > 48) tier = "medium";
    else if (area > 1200 && cellH > 16 && cellW > 40) tier = "small";

    if (tier) {
      const fontSize = tier === "large" ? 11 : tier === "medium" ? 10.5 : 9.5;
      const haloWidth = tier === "small" ? 1.6 : 2.4;
      const charW = fontSize * 0.62;
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", leaf.x0 + 5);
      label.setAttribute("y", leaf.y0 + fontSize + 3);
      label.setAttribute("class", "treemap-cell-label");
      label.setAttribute("font-size", String(fontSize));
      label.setAttribute("stroke-width", String(haloWidth));
      label.textContent = truncateToFit(leaf.data.name, Math.max(4, Math.floor((cellW - 10) / charW)));
      g.appendChild(label);

      if (tier === "large" && cellH > 48 && cellW > 80) {
        const sub = document.createElementNS("http://www.w3.org/2000/svg", "text");
        sub.setAttribute("x", leaf.x0 + 5);
        sub.setAttribute("y", leaf.y0 + fontSize + 17);
        sub.setAttribute("class", "treemap-cell-label");
        sub.setAttribute("font-size", "10");
        sub.setAttribute("stroke-width", "2");
        sub.style.opacity = "0.8";
        sub.textContent = fmtNumber(leaf.data.value);
        g.appendChild(sub);
      }
    }

    g.addEventListener("mouseenter", (e) => showTreemapTooltip(e, leaf.data.signal));
    g.addEventListener("mousemove", (e) => moveTreemapTooltip(e));
    g.addEventListener("mouseleave", hideTreemapTooltip);
    g.addEventListener("click", () => openDetail(leaf.data.signal));
    svg.appendChild(g);
  }

  canvas.innerHTML = "";
  canvas.appendChild(svg);
  renderTreemapLegend(categories);

  // Ensure tooltip element exists
  if (!document.getElementById("treemap-tooltip")) {
    const tt = document.createElement("div");
    tt.id = "treemap-tooltip";
    tt.className = "treemap-tooltip";
    document.body.appendChild(tt);
  }
}

function renderTreemapLegend(categories) {
  const legend = document.getElementById("treemap-legend");
  legend.innerHTML = categories.map((c) =>
    '<div class="lg-item"><span class="lg-swatch" style="background:' + categoryColor(c, categories) + '"></span>' + escapeHtml(c) + '</div>'
  ).join("");
}

function truncateToFit(s, maxChars) {
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(0, maxChars - 1)) + "…";
}

function showTreemapTooltip(e, sig) {
  const tt = document.getElementById("treemap-tooltip");
  if (!tt || !sig) return;
  const price = fmtCPM(sig);
  tt.innerHTML =
    '<div class="tt-name">' + escapeHtml(sig.name || "") + '</div>' +
    '<div class="tt-row"><span class="k">Audience</span><span class="v">' + fmtNumber(sig.estimated_audience_size) + '</span></div>' +
    '<div class="tt-row"><span class="k">Category</span><span class="v">' + escapeHtml(sig.category_type || "—") + '</span></div>' +
    '<div class="tt-row"><span class="k">CPM</span><span class="v">' + price.display + '</span></div>' +
    '<div class="tt-row"><span class="k">Deployments</span><span class="v">' + ((sig.deployments || []).length) + '</span></div>';
  tt.classList.add("show");
  moveTreemapTooltip(e);
}

function moveTreemapTooltip(e) {
  const tt = document.getElementById("treemap-tooltip");
  if (!tt) return;
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  // Edge-flip when near right/bottom viewport edges
  const vw = window.innerWidth, vh = window.innerHeight;
  if (x + 300 > vw) x = e.clientX - 300 - pad;
  if (y + 140 > vh) y = e.clientY - 140 - pad;
  tt.style.transform = "translate(" + x + "px," + y + "px)";
}

function hideTreemapTooltip() {
  const tt = document.getElementById("treemap-tooltip");
  if (tt) tt.classList.remove("show");
}

//────────────────────────────────────────────────────────────────────────
// §5 Builder — composable rules with live /signals/estimate
//────────────────────────────────────────────────────────────────────────
const DIMENSIONS = [
  { key: "age_band",           values: ["18-24","25-34","35-44","45-54","55-64","65+"] },
  { key: "income_band",        values: ["under_50k","50k_100k","100k_150k","150k_plus"] },
  { key: "education",          values: ["high_school","some_college","bachelors","graduate"] },
  { key: "household_type",     values: ["single","couple_no_kids","family_with_kids","senior_household"] },
  { key: "metro_tier",         values: ["top_10","top_25","top_50","other"] },
  { key: "content_genre",      values: ["action","sci_fi","drama","comedy","documentary","thriller","animation","romance"] },
  { key: "streaming_affinity", values: ["high","medium","low"] },
];
const OPERATORS = ["eq", "in", "not_eq"];
const MAX_RULES = 6;

function ensureBuilder() {
  renderBuilderRules();
  debouncedEstimate();
  ensureBuilderStack();
}

//────────────────────────────────────────────────────────────────────────
// Sec-38 B6 — Builder multi-signal audience stack
//────────────────────────────────────────────────────────────────────────
var _builderStack = { selected: [], suggestions: [] };
async function ensureBuilderStack() {
  if (state.catalog.all.length === 0) await loadCatalog();
  renderStackList();
  renderStackSuggestions("");
  var inp = document.getElementById("stack-search-input");
  if (inp && !inp.__wired) {
    inp.__wired = true;
    inp.addEventListener("input", function (e) { renderStackSuggestions(e.target.value.toLowerCase()); });
  }
}
function renderStackSuggestions(q) {
  var host = document.getElementById("stack-suggestions");
  if (!host) return;
  if (!q || q.length < 2) { host.innerHTML = ""; host.style.display = "none"; return; }
  var selectedIds = new Set(_builderStack.selected.map(function (s) { return s.signal_agent_segment_id; }));
  var hits = state.catalog.all
    .filter(function (s) { return !selectedIds.has(s.signal_agent_segment_id) && (s.name || "").toLowerCase().includes(q); })
    .slice(0, 8);
  if (!hits.length) { host.innerHTML = '<div class="stack-sugg-empty">No matches</div>'; host.style.display = "block"; return; }
  host.innerHTML = hits.map(function (s) {
    return '<div class="stack-sugg" data-sid="' + escapeHtml(s.signal_agent_segment_id) + '">' +
      '<div><div class="stack-sugg-name">' + escapeHtml(s.name) + '</div>' +
      '<div class="stack-sugg-meta">' + fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "") + '</div></div>' +
      '<button class="btn-secondary" style="padding:2px 10px;font-size:11px">+ add</button>' +
    '</div>';
  }).join("");
  host.style.display = "block";
  host.querySelectorAll(".stack-sugg").forEach(function (el) {
    el.addEventListener("click", function () {
      var sid = el.dataset.sid;
      var sig = state.catalog.all.find(function (x) { return x.signal_agent_segment_id === sid; });
      if (sig && _builderStack.selected.length < 8) {
        _builderStack.selected.push(sig);
        document.getElementById("stack-search-input").value = "";
        renderStackSuggestions("");
        renderStackList();
      }
    });
  });
}
function renderStackList() {
  var host = document.getElementById("stack-list");
  if (!host) return;
  if (_builderStack.selected.length === 0) {
    host.innerHTML = '<div class="empty-state" style="padding:14px"><div class="empty-desc">Pick 2-8 catalog signals to model a stacked audience. Useful when one rule-set can\\'t cleanly capture the target.</div></div>';
    document.getElementById("stack-summary").style.display = "none";
    document.getElementById("stack-bar-wrap").innerHTML = "";
    return;
  }
  host.innerHTML = _builderStack.selected.map(function (s, i) {
    return '<div class="stack-chip">' +
      '<div><div class="stack-chip-name">' + escapeHtml(s.name) + '</div>' +
      '<div class="stack-chip-meta">' + fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "") + '</div></div>' +
      '<button class="stack-remove" data-idx="' + i + '"><svg class="ico"><use href="#icon-close"/></svg></button>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".stack-remove").forEach(function (b) {
    b.addEventListener("click", function () {
      _builderStack.selected.splice(parseInt(b.dataset.idx, 10), 1);
      renderStackList();
    });
  });
  computeStackSummary();
}
function computeStackSummary() {
  var sigs = _builderStack.selected;
  if (sigs.length < 2) {
    document.getElementById("stack-summary").style.display = "none";
    document.getElementById("stack-bar-wrap").innerHTML = "";
    return;
  }
  var sum = 0, costWeighted = 0;
  sigs.forEach(function (s) {
    var sz = s.estimated_audience_size || 0;
    var cpm = fmtCPM(s).cpm || 5;
    sum += sz;
    costWeighted += sz * cpm;
  });
  // Heuristic pairwise overlap via category affinity (same as overlap.ts)
  function affinity(a, b) {
    if (a.category_type === b.category_type) return 0.55;
    return 0.20;
  }
  var overlap = 0;
  for (var i = 0; i < sigs.length; i++) {
    for (var j = i + 1; j < sigs.length; j++) {
      var a = sigs[i], b = sigs[j];
      var aff = affinity(a, b);
      var minSz = Math.min(a.estimated_audience_size || 0, b.estimated_audience_size || 0);
      overlap += aff * minSz * 0.6; // 0.6 dampener for higher-order dedupe
    }
  }
  var uniqueReach = Math.max(0, sum - overlap);
  var blendedCpm = sum > 0 ? costWeighted / sum : 0;

  document.getElementById("stack-summary").style.display = "grid";
  document.getElementById("stack-unique").textContent = fmtNumber(Math.round(uniqueReach));
  document.getElementById("stack-sum").textContent = fmtNumber(Math.round(sum));
  document.getElementById("stack-overlap").textContent = fmtNumber(Math.round(overlap)) + " (" + ((overlap / sum) * 100).toFixed(1) + "%)";
  document.getElementById("stack-cpm").textContent = "$" + blendedCpm.toFixed(2);

  // Stacked bar visualization — per signal contribution, overlap striped
  var W = 520, H = 32;
  var stackSvg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:40px">';
  var xPos = 0;
  sigs.forEach(function (s, i) {
    var sz = s.estimated_audience_size || 0;
    var w = (sz / sum) * W;
    var hue = (i * 47) % 360;
    stackSvg += '<rect x="' + xPos + '" y="0" width="' + w.toFixed(1) + '" height="' + H + '" fill="hsl(' + hue + ' 60% 55%)" fill-opacity="0.85"><title>' + escapeHtml(s.name) + ': ' + fmtNumber(sz) + '</title></rect>';
    xPos += w;
  });
  // Overlap stripe overlay
  var overlapFrac = sum > 0 ? overlap / sum : 0;
  stackSvg += '<pattern id="ov-stripe" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0,0,0,0.5)" stroke-width="3"/></pattern>';
  stackSvg += '<rect x="' + ((1 - overlapFrac) * W).toFixed(1) + '" y="0" width="' + (overlapFrac * W).toFixed(1) + '" height="' + H + '" fill="url(#ov-stripe)"/>';
  stackSvg += '</svg>';
  document.getElementById("stack-bar-wrap").innerHTML =
    stackSvg +
    '<div style="font-size:10.5px;color:var(--text-mut);margin-top:6px">Each block ∝ signal size · striped area ∝ estimated overlap · unique reach = sum − overlap</div>';
}

function renderBuilderRules() {
  const host = document.getElementById("builder-rules");
  if (state.builder.rules.length === 0) {
    host.innerHTML = '<div class="empty-state" style="padding:18px"><div class="empty-desc">Click <strong>Add rule</strong> to compose a segment. Estimated audience size updates as you go.</div></div>';
  } else {
    host.innerHTML = state.builder.rules.map((r, i) => renderBuilderRule(r, i)).join("");
    host.querySelectorAll(".builder-rule").forEach((row, i) => wireRuleRow(row, i));
  }
  const addBtn = document.getElementById("add-rule-btn");
  if (addBtn) {
    addBtn.disabled = state.builder.rules.length >= MAX_RULES;
    addBtn.title = state.builder.rules.length >= MAX_RULES ? "Maximum of 6 rules" : "";
  }
  const resetBtn = document.getElementById("reset-rules-btn");
  if (resetBtn) {
    const nameVal = document.getElementById("builder-name")?.value || "";
    resetBtn.disabled = state.builder.rules.length === 0 && nameVal.length === 0;
  }
}

function renderBuilderRule(rule, idx) {
  const dim = DIMENSIONS.find((d) => d.key === rule.dimension) || DIMENSIONS[0];
  return '' +
    '<div class="builder-rule" data-idx="' + idx + '">' +
      '<select data-role="dim">' +
        DIMENSIONS.map((d) => '<option value="' + d.key + '"' + (d.key === rule.dimension ? ' selected' : '') + '>' + d.key.replace(/_/g, " ") + '</option>').join("") +
      '</select>' +
      '<select data-role="op">' +
        OPERATORS.map((o) => '<option value="' + o + '"' + (o === rule.operator ? ' selected' : '') + '>' + o + '</option>').join("") +
      '</select>' +
      '<select data-role="val">' +
        dim.values.map((v) => '<option value="' + v + '"' + (v === rule.value ? ' selected' : '') + '>' + v + '</option>').join("") +
      '</select>' +
      '<button class="remove-btn" data-role="remove" aria-label="Remove rule"><svg class="ico"><use href="#icon-minus"/></svg></button>' +
    '</div>';
}

function wireRuleRow(row, idx) {
  const rule = state.builder.rules[idx];
  row.querySelector("[data-role=dim]").addEventListener("change", (e) => {
    rule.dimension = e.target.value;
    // Reset value to first valid for new dimension
    const dim = DIMENSIONS.find((d) => d.key === rule.dimension);
    if (dim && !dim.values.includes(rule.value)) rule.value = dim.values[0];
    renderBuilderRules();
    debouncedEstimate();
  });
  row.querySelector("[data-role=op]").addEventListener("change", (e) => {
    rule.operator = e.target.value;
    debouncedEstimate();
  });
  row.querySelector("[data-role=val]").addEventListener("change", (e) => {
    rule.value = e.target.value;
    debouncedEstimate();
  });
  row.querySelector("[data-role=remove]").addEventListener("click", () => {
    state.builder.rules.splice(idx, 1);
    renderBuilderRules();
    debouncedEstimate();
  });
}

document.getElementById("add-rule-btn").addEventListener("click", () => {
  if (state.builder.rules.length >= MAX_RULES) return;
  const used = new Set(state.builder.rules.map((r) => r.dimension));
  const nextDim = DIMENSIONS.find((d) => !used.has(d.key)) || DIMENSIONS[0];
  state.builder.rules.push({ dimension: nextDim.key, operator: "eq", value: nextDim.values[0] });
  renderBuilderRules();
  debouncedEstimate();
});

// Sec-34: real similarity check on each rule change. Uses the agent's
// own semantic-ranking tool (get_signals with the composed NL brief as
// signal_spec) instead of a hand-rolled algorithm — the answer comes
// from the same embedding engine that services every buyer-agent query,
// so what's shown here is what the agent would match in production.
//
// Why not get_similar_signals? That tool takes a reference
// signal_agent_segment_id — but the builder draft isn't persisted yet
// (and persisting JUST to run the similarity check creates the
// duplicate we're trying to prevent). Instead we compose a textual
// description from the rules and let the brief-driven search surface
// catalog neighbors.
let _similarSeq = 0;
async function runSimilarCheck() {
  const rules = state.builder.rules;
  const host = document.getElementById("similar-signals");
  const subtitle = document.getElementById("similar-subtitle");
  if (rules.length === 0) {
    host.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-desc">Compose a rule and the agent\\'s semantic ranker will surface existing catalog signals that overlap — use one before creating a duplicate.</div></div>';
    subtitle.textContent = "—";
    return;
  }
  const seq = ++_similarSeq;
  const brief = buildSimilarityBrief(rules);
  subtitle.innerHTML = '<span class="spinner"></span>scanning catalog…';
  try {
    const res = await fetch("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
      body: JSON.stringify({
        jsonrpc: "2.0", id: rpcId++, method: "tools/call",
        params: { name: "get_signals", arguments: {
          signal_spec: brief,
          deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
          max_results: 5,
        } },
      }),
    });
    if (seq !== _similarSeq) return;
    const body = await res.json();
    const sc = body.result?.structuredContent;
    const matches = (sc?.signals || []).filter((s) => s.signal_type !== "custom").slice(0, 3);

    if (matches.length === 0) {
      host.innerHTML = '<div class="empty-state" style="padding:16px"><div class="empty-desc">No close catalog matches — this composition looks genuinely novel. Generating it would add value.</div></div>';
      subtitle.textContent = "0 matches";
      return;
    }

    // The top match is the potential duplicate. Rank by ordinal position
    // (agent's semantic ranker already sorted these); assign coarse high/
    // medium/low tiers by ordinal since scores aren't exposed on the wire.
    const tiers = ["high", "medium", "low"];
    const warning = matches.length > 0 && rules.length >= 2
      ? '<div class="similar-warning">' +
          '<svg class="ico"><use href="#icon-info"/></svg>' +
          '<span>Your composition semantically overlaps with <strong>' + escapeHtml(matches[0].name) + '</strong> — consider using it before generating a near-duplicate.</span>' +
        '</div>'
      : "";
    host.innerHTML = warning + matches.map((s, i) => renderSimilarCard(s, tiers[i] || "low")).join("");
    subtitle.textContent = matches.length + " candidate" + (matches.length === 1 ? "" : "s");
    // Wire clicks — jump into the detail panel for the matched signal
    host.querySelectorAll(".similar-card").forEach((card) => {
      card.addEventListener("click", () => {
        const sid = card.dataset.sid;
        const sig = state.catalog.all.find((x) => (x.signal_agent_segment_id || x.signal_id?.id) === sid)
                 || matches.find((m) => (m.signal_agent_segment_id || m.signal_id?.id) === sid);
        if (sig) openDetail(sig);
      });
    });
  } catch (e) {
    if (seq === _similarSeq) {
      host.innerHTML = '<div class="empty-state" style="padding:16px;color:var(--text-mut)"><div class="empty-desc">Similarity check unavailable: ' + escapeHtml(e.message) + '</div></div>';
      subtitle.textContent = "error";
    }
  }
}

// Compose a natural-language brief from rules for the similarity probe.
// Denser / more keyword-heavy than buildExplainSentence because the
// embedding engine benefits from repeated dimensional terms.
function buildSimilarityBrief(rules) {
  const parts = [];
  for (const r of rules) {
    const val = Array.isArray(r.value) ? r.value[0] : r.value;
    const strVal = String(val).replace(/_/g, " ");
    parts.push(r.dimension.replace(/_/g, " ") + " " + strVal);
  }
  return "Audience with " + parts.join(", ");
}

function renderSimilarCard(sig, tier) {
  const sid = sig.signal_agent_segment_id || sig.signal_id?.id || "";
  const price = fmtCPM(sig);
  const rankLabel = tier === "high" ? "top match" : tier === "medium" ? "similar" : "related";
  return '' +
    '<div class="similar-card" data-sid="' + escapeHtml(sid) + '">' +
      '<div class="sc-main">' +
        '<div class="sc-nm">' + escapeHtml(sig.name || "") + '</div>' +
        '<div class="sc-sub">' + fmtNumber(sig.estimated_audience_size) + ' audience · ' + price.display + ' cpm · ' + escapeHtml(sig.category_type || "—") + '</div>' +
      '</div>' +
      '<span class="sc-rank ' + tier + '">' + rankLabel + '</span>' +
    '</div>';
}

// Sec-33: starter templates — seed rule sets for common DSP audiences.
// Clicking a template replaces the current rules and re-runs estimate.
const BUILDER_TEMPLATES = {
  affluent_streamers: {
    label: "Affluent Streamers 25-44",
    defaultName: "Affluent Streamers 25-44",
    rules: [
      { dimension: "age_band", operator: "in", value: ["25-34", "35-44"] },
      { dimension: "income_band", operator: "eq", value: "150k_plus" },
      { dimension: "streaming_affinity", operator: "eq", value: "high" },
    ],
  },
  cord_cutter_parents: {
    label: "Cord-Cutter Parents",
    defaultName: "Cord-Cutter Parents",
    rules: [
      { dimension: "age_band", operator: "in", value: ["35-44", "45-54"] },
      { dimension: "household_type", operator: "eq", value: "family_with_kids" },
      { dimension: "streaming_affinity", operator: "eq", value: "high" },
    ],
  },
  urban_millennials: {
    label: "Urban Millennials",
    defaultName: "Urban Millennials",
    rules: [
      { dimension: "age_band", operator: "eq", value: "25-34" },
      { dimension: "metro_tier", operator: "eq", value: "top_10" },
      { dimension: "education", operator: "in", value: ["bachelors", "graduate"] },
    ],
  },
  seniors_documentary: {
    label: "Seniors · Documentary",
    defaultName: "Seniors · Documentary",
    rules: [
      { dimension: "age_band", operator: "eq", value: "65+" },
      { dimension: "content_genre", operator: "eq", value: "documentary" },
    ],
  },
  b2b_exec_profile: {
    label: "B2B Exec Profile",
    defaultName: "B2B Exec Profile",
    rules: [
      { dimension: "age_band", operator: "in", value: ["35-44", "45-54"] },
      { dimension: "education", operator: "eq", value: "graduate" },
      { dimension: "income_band", operator: "eq", value: "150k_plus" },
    ],
  },
};

let _pendingTemplate = null;

document.getElementById("builder-template").addEventListener("change", (e) => {
  const key = e.target.value;
  if (!key) return;
  const tpl = BUILDER_TEMPLATES[key];
  if (!tpl) { e.target.value = ""; return; }
  // Sec-35: inline confirm when replacing non-empty rules instead of
  // silently clobbering. Browser confirm() is ugly + doesn't match the
  // aesthetic. Apply directly when the rule list is empty.
  if (state.builder.rules.length > 0) {
    _pendingTemplate = key;
    document.getElementById("template-confirm-msg").innerHTML =
      'Replace <strong>' + state.builder.rules.length + ' current rule' + (state.builder.rules.length === 1 ? "" : "s") +
      '</strong> with <strong>' + escapeHtml(tpl.label) + '</strong>?';
    document.getElementById("template-confirm").style.display = "flex";
  } else {
    applyBuilderTemplate(key);
  }
  e.target.value = ""; // reset selector so the same template re-triggers
});

document.getElementById("template-confirm-apply").addEventListener("click", () => {
  if (_pendingTemplate) applyBuilderTemplate(_pendingTemplate);
  document.getElementById("template-confirm").style.display = "none";
  _pendingTemplate = null;
});
document.getElementById("template-confirm-cancel").addEventListener("click", () => {
  document.getElementById("template-confirm").style.display = "none";
  _pendingTemplate = null;
});

function applyBuilderTemplate(key) {
  const tpl = BUILDER_TEMPLATES[key];
  if (!tpl) return;
  state.builder.rules = tpl.rules.map((r) => ({
    dimension: r.dimension,
    operator: Array.isArray(r.value) ? "eq" : r.operator,
    value: Array.isArray(r.value) ? r.value[0] : r.value,
  }));
  // Prefill segment name when empty. Don't overwrite if the user already
  // typed something — respect their intent.
  const nameInput = document.getElementById("builder-name");
  if (nameInput && !nameInput.value.trim()) nameInput.value = tpl.defaultName;
  renderBuilderRules();
  runEstimate();
}

// Reset — clear all rules, segment name, and any "generated" banner so
// the builder is back to the initial empty state. Preview returns to the
// 240M baseline via runEstimate on empty rules.
document.getElementById("reset-rules-btn").addEventListener("click", () => {
  if (state.builder.rules.length === 0 && !document.getElementById("builder-name").value) return;
  state.builder.rules = [];
  document.getElementById("builder-name").value = "";
  const note = document.getElementById("generate-note");
  note.className = "builder-note";
  note.textContent = "";
  state.builder.generatedSegment = null;
  renderBuilderRules();
  runEstimate();
});

function debouncedEstimate() {
  clearTimeout(state.builder.debounceTimer);
  state.builder.debounceTimer = setTimeout(runEstimate, 250);
}

async function runEstimate() {
  const seq = ++state.builder.estimateSeq;
  const heroEl = document.getElementById("preview-audience");
  heroEl.classList.add("loading");
  try {
    const res = await fetch("/signals/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: state.builder.rules }),
    });
    // Newer request superseded us — drop the result
    if (seq !== state.builder.estimateSeq) return;
    const data = await res.json();
    if (data.error) {
      heroEl.textContent = "—";
      document.getElementById("preview-sub").textContent = "validation error";
      document.getElementById("preview-meta").textContent = (data.details?.validation_errors || []).join("; ");
      document.getElementById("coverage-fill").style.width = "0%";
      renderFunnel([]);
      return;
    }
    heroEl.classList.remove("loading");
    heroEl.textContent = fmtNumber(data.estimated_audience_size);
    // Sec-37 A3: render a ± range derived from the confidence tier so
    // a tier-1 reviewer sees honest uncertainty on every estimate.
    const range = confidenceRange(data.estimated_audience_size, data.confidence);
    const rangeText = range
      ? data.estimated_audience_size.toLocaleString() + " adults · ±" + range.pct + "% range: " + fmtNumber(range.lo) + "–" + fmtNumber(range.hi)
      : data.estimated_audience_size.toLocaleString() + " adults";
    document.getElementById("preview-sub").textContent = rangeText;
    document.getElementById("coverage-fill").style.width = Math.min(100, data.coverage_percentage) + "%";
    document.getElementById("preview-meta").textContent = data.rule_count + " rule" + (data.rule_count === 1 ? "" : "s") + " · " + data.coverage_percentage + "% of US adults · dimensions: " + (data.dimensions_used.join(", ") || "(none)");
    // Sec-33: confidence pill, floor warning, NL explain
    const confEl = document.getElementById("preview-confidence");
    if (confEl && data.confidence) {
      confEl.textContent = data.confidence;
      confEl.className = "preview-confidence-pill " + data.confidence;
    } else if (confEl) { confEl.textContent = ""; confEl.className = "preview-confidence-pill"; }
    const floorEl = document.getElementById("preview-floor-warning");
    if (floorEl) floorEl.style.display = data.estimated_audience_size <= 50_000 && data.rule_count > 0 ? "flex" : "none";
    const explainEl = document.getElementById("preview-explain");
    if (explainEl) explainEl.textContent = buildExplainSentence(state.builder.rules, data);
    await renderFunnelCumulative();
    // Fire-and-forget similar-signals check — uses the composed NL
    // sentence as a semantic brief against get_signals. Intentionally
    // awaited AFTER the funnel so it doesn't block the headline number.
    runSimilarCheck();
  } catch (e) {
    if (seq === state.builder.estimateSeq) {
      heroEl.classList.remove("loading");
      showToast("Estimate failed: " + e.message, true);
    }
  }
}

// Sec-33: human-readable one-sentence description of the composed segment.
// Makes the audience-estimate legible for non-technical stakeholders and
// turns the builder output into a pitch line rather than a JSON prop.
const DIM_PHRASES = {
  age_band: { prefix: "Adults", render: (v) => v + (String(v).endsWith("+") ? "" : "") },
  income_band: {
    prefix: "earning",
    render: (v) => ({
      "under_50k": "under $50K", "50k_100k": "$50K–$100K",
      "100k_150k": "$100K–$150K", "150k_plus": "$150K+",
    }[String(v)] || String(v)),
  },
  education: {
    prefix: "with",
    render: (v) => ({
      "high_school": "HS education", "some_college": "some college",
      "bachelors": "bachelors or above", "graduate": "graduate education",
    }[String(v)] || String(v)),
  },
  household_type: {
    prefix: "in",
    render: (v) => ({
      "single": "single-adult households", "couple_no_kids": "child-free couples",
      "family_with_kids": "households with children", "senior_household": "senior households",
    }[String(v)] || String(v)),
  },
  metro_tier: {
    prefix: "in",
    render: (v) => ({
      "top_10": "the top-10 US metros", "top_25": "the top-25 US metros",
      "top_50": "the top-50 US metros", "other": "smaller markets",
    }[String(v)] || String(v)),
  },
  content_genre: { prefix: "with affinity for", render: (v) => String(v).replace(/_/g, "-") + " content" },
  streaming_affinity: { prefix: "with", render: (v) => String(v) + " streaming engagement" },
};

function buildExplainSentence(rules, data) {
  if (!rules || rules.length === 0) return "";
  const parts = [];
  for (const r of rules) {
    const phr = DIM_PHRASES[r.dimension];
    if (!phr) { parts.push(r.dimension + " " + r.operator + " " + r.value); continue; }
    parts.push(phr.prefix + " " + phr.render(Array.isArray(r.value) ? r.value[0] : r.value));
  }
  const size = (data.estimated_audience_size || 0).toLocaleString();
  const coverage = (data.coverage_percentage || 0).toFixed(data.coverage_percentage < 1 ? 2 : 1);
  return parts.join(", ") + " — about " + size + " adults (" + coverage + "% of US adult baseline).";
}

async function renderFunnelCumulative() {
  const host = document.getElementById("funnel-chart");
  const rules = state.builder.rules;
  if (rules.length === 0) {
    host.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-desc">Add a rule to see the funnel.</div></div>';
    return;
  }

  // Call /signals/estimate cumulatively for each prefix of rules so we
  // can show size-after-rule-N. Sequential to keep things simple — at
  // ≤6 rules this is 6 network calls, bounded and fast.
  const steps = [];
  for (let i = 1; i <= rules.length; i++) {
    try {
      const res = await fetch("/signals/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: rules.slice(0, i) }),
      });
      const data = await res.json();
      if (!data.error) steps.push({ rule: rules[i - 1], size: data.estimated_audience_size });
      else return; // Bail on validation error — runEstimate already displayed it
    } catch { return; }
  }
  renderFunnel(steps);
}

function renderFunnel(steps) {
  const host = document.getElementById("funnel-chart");
  if (steps.length === 0) {
    host.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-desc">Add a rule to see the funnel.</div></div>';
    return;
  }
  const maxSize = steps[0].size;
  host.innerHTML = steps.map((step, i) => {
    const pct = (step.size / maxSize) * 100;
    const retained = i === 0 ? 100 : (step.size / steps[i - 1].size) * 100;
    const label = step.rule.dimension + " " + step.rule.operator + " " + step.rule.value;
    return '' +
      '<div class="funnel-step">' +
        '<div>' +
          '<div class="funnel-step-label">' + escapeHtml(label) + '</div>' +
          '<div class="funnel-step-bar"><div class="funnel-step-fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
        '</div>' +
        '<div class="funnel-step-meta">' + fmtNumber(step.size) + '<br/><span style="opacity:0.6">' + retained.toFixed(0) + '% of prior</span></div>' +
      '</div>';
  }).join("");
}

document.getElementById("generate-btn").addEventListener("click", generateSegment);

async function generateSegment() {
  const btn = document.getElementById("generate-btn");
  const note = document.getElementById("generate-note");
  if (state.builder.rules.length === 0) {
    note.className = "builder-note error";
    note.textContent = "Add at least one rule before generating.";
    return;
  }
  btn.disabled = true;
  note.className = "builder-note";
  note.innerHTML = '<span class="spinner"></span>generating segment…';

  try {
    const name = document.getElementById("builder-name").value.trim();
    const res = await fetch("/signals/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + DEMO_KEY,
      },
      body: JSON.stringify({ rules: state.builder.rules, ...(name ? { name } : {}) }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || ("HTTP " + res.status));
    }
    note.className = "builder-note success";
    const sid = data.signal_agent_segment_id || data.signalId || "";
    note.innerHTML = '✓ Segment created · <span class="mono">' + escapeHtml(sid) + '</span>';
    state.builder.generatedSegment = data;
    // Refresh catalog in the background so the new segment shows up
    state.catalog.all = []; state.treemap.rendered = false;
    showToast("Segment generated. Switch to Catalog to see it.");
  } catch (e) {
    note.className = "builder-note error";
    note.textContent = "Generation failed: " + e.message;
  } finally {
    btn.disabled = false;
  }
}

//────────────────────────────────────────────────────────────────────────
// §5b Overlap — pick 2-6 signals, compute Jaccard via /signals/overlap
//────────────────────────────────────────────────────────────────────────
async function ensureOverlap() {
  if (state.catalog.all.length === 0) await loadCatalog();
  renderOverlapChips();
  renderOverlapSuggestions("");
}

//────────────────────────────────────────────────────────────────────────
// Sec-38 B5 — Embedding tab: 2D scatter + similarity heatmap + cross-tax Sankey
//────────────────────────────────────────────────────────────────────────
var _embeddingLoaded = false;
async function ensureEmbedding() {
  if (_embeddingLoaded) return;
  _embeddingLoaded = true;
  renderEmbeddingScatter();
  renderEmbeddingHeatmap();
  renderEmbeddingSankey();
}
document.getElementById("emb-refresh").addEventListener("click", function () {
  _embeddingLoaded = false;
  ensureEmbedding();
});

async function renderEmbeddingScatter() {
  var host = document.getElementById("emb-scatter");
  var legend = document.getElementById("emb-legend");
  try {
    var r = await fetch("/ucp/projection");
    var data = await r.json();
    var points = data.points || [];
    if (!points.length) { host.innerHTML = '<div class="empty-state"><div class="empty-title">No embeddings</div></div>'; return; }
    var xs = points.map(function (p) { return p.x; });
    var ys = points.map(function (p) { return p.y; });
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    var yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
    var pad = 0.1;
    var W = 640, H = 380;
    function sx(x) { return 40 + ((x - xMin) / (xMax - xMin + 1e-9)) * (W - 80); }
    function sy(y) { return H - 30 - ((y - yMin) / (yMax - yMin + 1e-9)) * (H - 60); }
    var colorMap = {
      demographic:     "#4f8eff",
      interest:        "#8b6eff",
      purchase_intent: "#ff7a5c",
      geo:             "#2bd4a0",
      composite:       "#ffcb5c",
    };
    var svgDots = points.map(function (p) {
      var color = colorMap[p.category] || "#8892a6";
      return '<circle cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="5" ' +
        'fill="' + color + '" fill-opacity="0.85" stroke="rgba(255,255,255,0.2)" stroke-width="0.8">' +
        '<title>' + escapeHtml(p.name) + ' (' + escapeHtml(p.category) + ')&#10;' + escapeHtml(p.description) + '</title>' +
      '</circle>';
    }).join("");
    var svgLabels = points.map(function (p) {
      var shortName = p.name.length > 22 ? p.name.slice(0, 20) + "…" : p.name;
      return '<text x="' + (sx(p.x) + 8).toFixed(1) + '" y="' + (sy(p.y) + 4).toFixed(1) + '" ' +
        'fill="var(--text-mut)" font-size="10" font-family="ui-sans-serif" paint-order="stroke fill" ' +
        'stroke="var(--bg-surface)" stroke-width="2.5">' + escapeHtml(shortName) + '</text>';
    }).join("");
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
      '<line x1="40" y1="' + (H - 30) + '" x2="' + (W - 40) + '" y2="' + (H - 30) + '" stroke="var(--border)" stroke-width="1"/>' +
      '<line x1="40" y1="20" x2="40" y2="' + (H - 30) + '" stroke="var(--border)" stroke-width="1"/>' +
      '<text x="' + (W - 40) + '" y="' + (H - 10) + '" text-anchor="end" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">UCP₁ (random projection)</text>' +
      '<text x="8" y="18" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">UCP₂</text>' +
      svgDots + svgLabels +
    '</svg>';
    var cats = Object.keys(colorMap);
    legend.innerHTML = cats.map(function (c) {
      return '<span class="emb-legend-item"><span class="emb-legend-dot" style="background:' + colorMap[c] + '"></span>' + escapeHtml(c) + '</span>';
    }).join("");
    var expl = document.getElementById("emb-scatter-explainer");
    if (expl) expl.innerHTML = renderChartExplainer({
      what: "A 2D map of the UCP semantic space. Each dot is one audience in this agent; distance roughly means semantic similarity.",
      how: "Every audience is a 512-dim vector from OpenAI text-embedding-3-small. We project to 2D with Johnson\u2013Lindenstrauss random projection \u2014 fast, fully deterministic, preserves relative distances approximately (not as tight as PCA but needs no SVD).",
      read: "Dots close together = semantically similar audiences. Dots in the same color cluster = same category type. Hover any dot for its full description.",
      limits: "JL axes are not interpretable on their own \u2014 UCP\u2081 / UCP\u2082 are arbitrary projection axes, not principal components.",
    });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">Could not load projection</div><div class="empty-desc">' + escapeHtml(String(e)) + '</div></div>';
  }
}

async function renderEmbeddingHeatmap() {
  var host = document.getElementById("emb-heatmap");
  try {
    var r = await fetch("/ucp/similarity?n=20");
    var data = await r.json();
    var n = data.n;
    var matrix = data.matrix || [];
    var names = data.signal_names || [];
    var cell = 18;
    var margin = 140;
    var W = margin + n * cell + 20;
    var H = margin + n * cell + 20;
    function colorFor(v) {
      // v in [-1, 1]. Diagonal = 1 (self). Map to a cool-warm scale.
      var t = (v + 1) / 2; // 0..1
      // lerp between dark blue and warm orange through white
      if (t > 0.5) {
        var f = (t - 0.5) * 2;
        var rr = Math.round(255 * f + 60 * (1 - f));
        var gg = Math.round(128 * f + 100 * (1 - f));
        var bb = Math.round(90 * f + 200 * (1 - f));
        return "rgb(" + rr + "," + gg + "," + bb + ")";
      } else {
        var f2 = t * 2;
        var rr2 = Math.round(60 * f2 + 22 * (1 - f2));
        var gg2 = Math.round(100 * f2 + 52 * (1 - f2));
        var bb2 = Math.round(200 * f2 + 120 * (1 - f2));
        return "rgb(" + rr2 + "," + gg2 + "," + bb2 + ")";
      }
    }
    var svgCells = "";
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var v = matrix[i * n + j];
        svgCells += '<rect x="' + (margin + j * cell) + '" y="' + (margin + i * cell) + '" width="' + cell + '" height="' + cell + '" ' +
          'fill="' + colorFor(v) + '" stroke="var(--bg-surface)" stroke-width="0.4">' +
          '<title>' + escapeHtml(names[i] || "") + ' × ' + escapeHtml(names[j] || "") + ': cos=' + v.toFixed(3) + '</title>' +
        '</rect>';
      }
    }
    var svgRowLabels = names.map(function (nm, i) {
      var shortName = nm.length > 22 ? nm.slice(0, 20) + "…" : nm;
      return '<text x="' + (margin - 6) + '" y="' + (margin + i * cell + cell / 2 + 3) + '" text-anchor="end" fill="var(--text-mut)" font-size="9.5" font-family="ui-monospace">' + escapeHtml(shortName) + '</text>';
    }).join("");
    var svgColLabels = names.map(function (nm, j) {
      var shortName = nm.length > 22 ? nm.slice(0, 20) + "…" : nm;
      return '<text transform="rotate(-55 ' + (margin + j * cell + cell / 2) + ' ' + (margin - 6) + ')" x="' + (margin + j * cell + cell / 2) + '" y="' + (margin - 6) + '" text-anchor="start" fill="var(--text-mut)" font-size="9.5" font-family="ui-monospace">' + escapeHtml(shortName) + '</text>';
    }).join("");
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMinYMin meet">' +
      svgCells + svgRowLabels + svgColLabels +
    '</svg>' +
    // Visible color scale with labeled endpoints
    '<div class="emb-heatmap-scale">' +
      '<span class="ehs-label">cos = \u22121<br><span class="ehs-sub">opposite meaning</span></span>' +
      '<div class="ehs-gradient"></div>' +
      '<span class="ehs-label" style="text-align:center">0<br><span class="ehs-sub">unrelated</span></span>' +
      '<div class="ehs-gradient ehs-gradient-r"></div>' +
      '<span class="ehs-label" style="text-align:right">+1<br><span class="ehs-sub">identical</span></span>' +
    '</div>';
    var expl2 = document.getElementById("emb-heatmap-explainer");
    if (expl2) expl2.innerHTML = renderChartExplainer({
      what: "How semantically close every audience is to every other one, shown as a 20\u00d720 grid of cosine similarity scores.",
      how: "Cosine similarity between each pair of 512-d embedding vectors. Bright orange = very similar, deep blue = very different. The diagonal is always +1 (every audience matches itself).",
      read: "Bright blocks along the diagonal = clusters of similar audiences. A bright off-diagonal cell means you might be duplicating reach if you activate both.",
      limits: "Shows only the first 20 embedded signals for readability. Use /ucp/similarity?n=N for larger matrices.",
    });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">Could not load heatmap</div></div>';
  }
}

async function renderEmbeddingSankey() {
  // Uses x_cross_taxonomy from the live catalog. Visualizes the bridge
  // IAB 1.1 → IAB 3.0 → {LR, TTD, MC, Nielsen} as left-to-right flows
  // aggregated by unique iab_3_0 topic. No external libs — pure SVG.
  var host = document.getElementById("emb-sankey");
  try {
    if (state.catalog.all.length === 0) await loadCatalog();
    var signals = state.catalog.all.slice(0, 50); // limit for readability
    // Build flows: left=categoryType, mid=iab_content_3_0 label, right=system
    var midCounts = {};    // iab30 label -> count
    var rightFromMid = {}; // mid -> { system -> count }
    signals.forEach(function (s) {
      var tx = s.x_cross_taxonomy || [];
      var iab30 = tx.find(function (e) { return e.system === "iab_content_3_0"; });
      if (!iab30) return;
      var midLabel = iab30.label;
      midCounts[midLabel] = (midCounts[midLabel] || 0) + 1;
      if (!rightFromMid[midLabel]) rightFromMid[midLabel] = {};
      tx.forEach(function (e) {
        if (e.system === "iab_content_3_0" || e.system === "iab_audience_1_1") return;
        rightFromMid[midLabel][e.system] = (rightFromMid[midLabel][e.system] || 0) + 1;
      });
    });
    var mids = Object.keys(midCounts).sort(function (a, b) { return midCounts[b] - midCounts[a]; }).slice(0, 8);
    var rightSystems = ["liveramp_abilitec", "ttd_dmp", "nielsen_category", "mastercard_spendingpulse"];
    var W = 960, H = 420;
    var leftX = 40, midX = 360, rightX = 760;
    var nodeW = 18;
    var midSpace = (H - 40) / (mids.length || 1);
    var rightSpace = (H - 40) / rightSystems.length;
    // Nodes
    var nodes = "";
    mids.forEach(function (m, i) {
      var y = 20 + i * midSpace;
      var size = Math.max(16, Math.min(midSpace - 8, midCounts[m] * 6));
      nodes += '<rect x="' + midX + '" y="' + y + '" width="' + nodeW + '" height="' + size + '" fill="var(--accent)" fill-opacity="0.7"/>' +
        '<text x="' + (midX + nodeW + 8) + '" y="' + (y + size / 2 + 4) + '" fill="var(--text)" font-size="11" font-family="ui-sans-serif">' + escapeHtml(m) + ' · ' + midCounts[m] + '</text>';
    });
    rightSystems.forEach(function (sys, i) {
      var y = 20 + i * rightSpace;
      var size = Math.max(20, rightSpace - 20);
      var totalForSys = 0;
      mids.forEach(function (m) { totalForSys += (rightFromMid[m] && rightFromMid[m][sys]) || 0; });
      nodes += '<rect x="' + rightX + '" y="' + y + '" width="' + nodeW + '" height="' + size + '" fill="#8b6eff" fill-opacity="0.7"/>' +
        '<text x="' + (rightX + nodeW + 8) + '" y="' + (y + size / 2 + 4) + '" fill="var(--text)" font-size="11" font-family="ui-sans-serif">' + escapeHtml(sys) + ' · ' + totalForSys + '</text>';
    });
    // Left-column anchor
    nodes += '<rect x="' + leftX + '" y="20" width="' + nodeW + '" height="' + (H - 40) + '" fill="#2bd4a0" fill-opacity="0.5"/>' +
      '<text x="' + (leftX + nodeW + 8) + '" y="40" fill="var(--text)" font-size="11" font-family="ui-sans-serif">IAB Audience 1.1</text>' +
      '<text x="' + (leftX + nodeW + 8) + '" y="56" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">' + signals.length + ' signals</text>';
    // Flows: left → mid (all one color), mid → right (colored per mid)
    var flows = "";
    mids.forEach(function (m, mi) {
      var yMid = 20 + mi * midSpace + Math.min(midSpace - 8, midCounts[m] * 6) / 2;
      // left→mid
      var yLeft = 20 + (H - 40) / 2 + (mi - mids.length / 2) * 10;
      var cx1 = leftX + nodeW + (midX - leftX - nodeW) / 2;
      flows += '<path d="M' + (leftX + nodeW) + ',' + yLeft + ' C' + cx1 + ',' + yLeft + ' ' + cx1 + ',' + yMid + ' ' + midX + ',' + yMid + '" ' +
        'fill="none" stroke="#2bd4a0" stroke-opacity="0.3" stroke-width="' + Math.max(1, midCounts[m] * 1.5) + '"/>';
      // mid→right(s)
      var rfm = rightFromMid[m] || {};
      rightSystems.forEach(function (sys, ri) {
        var count = rfm[sys] || 0;
        if (!count) return;
        var yRight = 20 + ri * rightSpace + rightSpace / 2;
        var cx2 = midX + nodeW + (rightX - midX - nodeW) / 2;
        flows += '<path d="M' + (midX + nodeW) + ',' + yMid + ' C' + cx2 + ',' + yMid + ' ' + cx2 + ',' + yRight + ' ' + rightX + ',' + yRight + '" ' +
          'fill="none" stroke="#8b6eff" stroke-opacity="0.25" stroke-width="' + Math.max(1, count * 1.2) + '"/>';
      });
    });
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
      flows + nodes +
    '</svg>' +
    '<div style="font-size:10.5px;color:var(--text-mut);margin-top:8px">Left column: native IAB Audience 1.1 catalog. Middle: mapped IAB Content 3.0 topics. Right: buyer-side DMP / onboarder / measurement systems. Widths \u221d signal count. Stage flags (live/modeled/roadmap) surfaced in signal detail panel.</div>';
    var expl3 = document.getElementById("emb-sankey-explainer");
    if (expl3) expl3.innerHTML = renderChartExplainer({
      what: "How this agent\u2019s audiences map into the buyer-side taxonomies a HoldCo planner already uses.",
      how: "Three columns: our native IAB Audience 1.1 catalog (green) \u2192 derived IAB Content 3.0 topics (blue) \u2192 buyer systems (purple: LiveRamp, TTD, Nielsen, Mastercard). Ribbon width \u221d number of signals that flow through that path.",
      read: "Thick ribbons hitting a buyer system = that system already has direct coverage of this audience class. Thin / missing ribbons = integration gaps to prioritize.",
      limits: "Stage flags (live/modeled/roadmap) live on individual signal cards \u2014 this view shows volume, not confidence.",
    });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">Could not load bridge</div></div>';
  }
}

document.getElementById("overlap-search-input").addEventListener("input", (e) => {
  state.overlap.searchQ = e.target.value.toLowerCase();
  renderOverlapSuggestions(state.overlap.searchQ);
});
document.getElementById("overlap-run").addEventListener("click", runOverlap);

function renderOverlapChips() {
  const host = document.getElementById("overlap-chips");
  const count = state.overlap.selected.length;
  document.getElementById("overlap-count").textContent = count + " / 6";
  document.getElementById("overlap-run").disabled = count < 2;
  if (count === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11.5px;padding:8px 0;font-style:italic">No signals selected yet.</div>';
    return;
  }
  host.innerHTML = state.overlap.selected.map((s, i) => {
    const sid = s.signal_agent_segment_id || s.signal_id?.id || "";
    return '<div class="overlap-chip" data-sid="' + escapeHtml(sid) + '">' +
      '<div><div class="oc-name">' + escapeHtml(s.name) + '</div><div style="font-size:10.5px;color:var(--text-mut);font-family:var(--font-mono)">' + fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "—") + '</div></div>' +
      '<button class="oc-remove" data-idx="' + i + '"><svg class="ico"><use href="#icon-close"/></svg></button>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".oc-remove").forEach((b) => {
    b.addEventListener("click", () => {
      state.overlap.selected.splice(Number(b.dataset.idx), 1);
      renderOverlapChips();
      renderOverlapSuggestions(state.overlap.searchQ);
    });
  });
}

function renderOverlapSuggestions(q) {
  const host = document.getElementById("overlap-suggestions");
  if (state.overlap.selected.length >= 6) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:6px 0">Max 6 signals. Remove one to add another.</div>';
    return;
  }
  const selectedIds = new Set(state.overlap.selected.map((s) => s.signal_agent_segment_id || s.signal_id?.id));
  let rows = state.catalog.all;
  if (q) rows = rows.filter((s) => (s.name || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q));
  rows = rows.filter((s) => !selectedIds.has(s.signal_agent_segment_id || s.signal_id?.id)).slice(0, 12);
  if (rows.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11.5px;padding:6px 0">No catalog matches.</div>';
    return;
  }
  host.innerHTML = rows.map((s) => {
    const sid = s.signal_agent_segment_id || s.signal_id?.id || "";
    return '<div class="overlap-suggestion" data-sid="' + escapeHtml(sid) + '">' +
      '<div>' + escapeHtml(s.name) + '</div>' +
      '<div class="sub">' + fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "—") + ' · ' + escapeHtml(verticalOf(s)) + '</div>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".overlap-suggestion").forEach((el) => {
    el.addEventListener("click", () => {
      const sid = el.dataset.sid;
      const sig = state.catalog.all.find((x) => (x.signal_agent_segment_id || x.signal_id?.id) === sid);
      if (sig && state.overlap.selected.length < 6) {
        state.overlap.selected.push(sig);
        renderOverlapChips();
        renderOverlapSuggestions(state.overlap.searchQ);
      }
    });
  });
}

async function runOverlap() {
  const host = document.getElementById("overlap-results");
  if (state.overlap.selected.length < 2) return;
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Computing pairwise + subset overlaps…</div></div>';
  const ids = state.overlap.selected.map((s) => s.signal_agent_segment_id || s.signal_id?.id);
  try {
    const res = await fetch("/signals/overlap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal_ids: ids }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "HTTP " + res.status);
    state.overlap.lastResult = data;
    host.innerHTML = renderOverlapResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function renderOverlapResult(data) {
  const sigs = data.signals || [];
  const pairs = data.pairwise || [];
  const upset = (data.upset || []).filter((u) => u.sets.length >= 2).sort((a, b) => b.estimate - a.estimate).slice(0, 20);

  // Build index by id for matrix rendering
  const byId = new Map();
  for (const s of sigs) byId.set(s.signal_agent_segment_id, s);

  // Heat-matrix
  let matrix = '<div style="font-size:11px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Pairwise Jaccard (approximated)</div>';
  matrix += '<div style="overflow:auto;margin-bottom:24px"><table class="overlap-matrix"><thead><tr><th></th>';
  for (const s of sigs) matrix += '<th title="' + escapeHtml(s.name) + '">' + escapeHtml(truncate(s.name, 18)) + '</th>';
  matrix += '</tr></thead><tbody>';
  for (const a of sigs) {
    matrix += '<tr><th>' + escapeHtml(truncate(a.name, 20)) + '</th>';
    for (const b of sigs) {
      if (a.signal_agent_segment_id === b.signal_agent_segment_id) {
        matrix += '<td style="color:var(--text-mut)">1.000</td>';
      } else {
        const p = pairs.find((x) =>
          (x.a_id === a.signal_agent_segment_id && x.b_id === b.signal_agent_segment_id) ||
          (x.b_id === a.signal_agent_segment_id && x.a_id === b.signal_agent_segment_id)
        );
        const j = p ? p.jaccard : 0;
        const hue = 220 - (j * 160); // high Jaccard = red-ish, low = blue-ish
        const bg = "hsl(" + hue + " 60% " + (40 + j * 30) + "%)";
        matrix += '<td class="jcell" style="background:' + bg + '" title="J=' + j.toFixed(3) + ' · intersection=' + fmtNumber(p?.intersection || 0) + '">' + j.toFixed(3) + '</td>';
      }
    }
    matrix += '</tr>';
  }
  matrix += '</tbody></table></div>';

  // Pair list with affinity reasons
  let pairList = '<div style="font-size:11px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Pair breakdown</div>';
  pairList += pairs.map((p) => {
    const pct = (p.jaccard * 100).toFixed(1);
    return '<div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 12px;margin-bottom:6px">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:4px">' +
        '<div style="font-size:12.5px"><strong>' + escapeHtml(p.a_name) + '</strong> ∩ <strong>' + escapeHtml(p.b_name) + '</strong></div>' +
        '<div style="font-family:var(--font-mono);font-weight:600;color:var(--accent-hot)">J ' + p.jaccard.toFixed(3) + '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-mut);font-family:var(--font-mono)">' +
        'intersection ~' + fmtNumber(p.intersection) + ' · union ~' + fmtNumber(p.union) + ' · affinity ' + p.category_affinity.toFixed(2) + ' (' + escapeHtml(p.affinity_reason) + ')' +
      '</div>' +
    '</div>';
  }).join("");

  // UpSet-style bar rows (for 3+)
  let upsetBlock = "";
  if (upset.length > 0 && sigs.length >= 3) {
    const maxEst = Math.max(...upset.map((u) => u.estimate));
    upsetBlock = '<div style="font-size:11px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin:24px 0 10px">UpSet — subset estimates (top ' + upset.length + ')</div>';
    upsetBlock += upset.map((u) => {
      const pct = maxEst > 0 ? (u.estimate / maxEst) * 100 : 0;
      return '<div class="upset-row">' +
        '<div class="upset-sets">' + u.names.map((n) => '<span>' + escapeHtml(truncate(n, 28)) + "</span>").join(" <span style='color:var(--text-mut)'>&cap;</span> ") + "</div>" +
        '<div class="upset-bar"><div class="upset-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="upset-val">' + fmtNumber(u.estimate) + '</div>' +
      '</div>';
    }).join("");
  }

  const methodologyNote = '<div style="margin-top:24px;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:11px;color:var(--text-mut);font-family:var(--font-mono)">' +
    '<strong style="color:var(--text-dim)">Methodology</strong> · ' + escapeHtml(data.note || "") +
    '</div>';

  const explainer = renderChartExplainer({
    what: "How much two audiences overlap \u2014 as a heat matrix (pairwise) and as UpSet bars (subset sizes when you pick 3+).",
    how: "Jaccard similarity \u2248 category-affinity \u00d7 min(size)/max(size). Same category + same vertical = 0.85, same category = 0.55, same vertical = 0.35, unrelated = 0.12. The real number needs cleanroom match-rates.",
    read: "Bright red cells = strong overlap (you\u2019d be re-buying the same people). Blue cells = distinct audiences safe to stack. UpSet bars rank the biggest shared slices across your whole selection.",
    limits: "Heuristic \u2014 not a true 1P overlap. For accurate numbers, push all selected signals into a cleanroom and compute member-level intersection.",
  });

  return matrix + pairList + upsetBlock + methodologyNote + explainer;
}

function truncate(s, n) {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

//────────────────────────────────────────────────────────────────────────
// §6a Capabilities — structured HTML + pretty-printed JSON
//────────────────────────────────────────────────────────────────────────
let _capsJsonCache = null;

async function loadCapabilities() {
  const host = document.getElementById("caps-html");
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Fetching /capabilities…</div></div>';
  try {
    const res = await fetch("/capabilities");
    const caps = await res.json();
    _capsJsonCache = caps;
    host.innerHTML = renderCapabilitiesHtml(caps);
    // Second async fetch — tools/list. Public (no auth). Mounts into the
    // placeholder left by renderCapabilitiesHtml so the main /capabilities
    // payload renders first and tool cards fill in.
    mountToolCatalog();
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

document.getElementById("caps-refresh").addEventListener("click", loadCapabilities);
document.getElementById("caps-copy").addEventListener("click", async () => {
  if (!_capsJsonCache) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(_capsJsonCache, null, 2));
    showToast("Capabilities JSON copied");
  } catch {
    showToast("Copy failed — select the JSON text manually", true);
  }
});

function renderCapabilitiesHtml(caps) {
  const adcp = caps.adcp || {};
  const sig = caps.signals || {};
  const ucp = caps.ext?.ucp || {};
  const dts = caps.ext?.dts || {};
  const dests = Array.isArray(sig.destinations) ? sig.destinations : [];
  const limits = sig.limits || {};
  const protos = Array.isArray(caps.supported_protocols) ? caps.supported_protocols : [];
  const categories = Array.isArray(sig.signal_categories) ? sig.signal_categories : [];

  return '' +
    // ─── Protocol header ───
    '<div class="caps-section">' +
      '<div class="caps-section-title">AdCP Protocol</div>' +
      '<div class="caps-grid">' +
        card("Major versions", (adcp.major_versions || []).join(", ") || "—") +
        card("Supported protocols", protos.map((p) => '<span class="pill pill-accent">' + escapeHtml(p) + '</span>').join(" "), true) +
        card("Idempotency", adcp.idempotency?.supported
          ? '<span class="pill pill-success">enabled</span> <span class="mono" style="color:var(--text-mut);font-size:12px">replay ' + (adcp.idempotency.replay_ttl_seconds || 0) + 's</span>'
          : '<span class="pill pill-warning">off</span>', true) +
        card("Provider", escapeHtml(sig.provider || "—"), true) +
      '</div>' +
    '</div>' +

    // ─── Signals block ───
    '<div class="caps-section">' +
      '<div class="caps-section-title">Signals</div>' +
      '<div class="caps-grid">' +
        card("Activation mode", '<span class="pill pill-accent">' + escapeHtml(sig.activation_mode || "—") + '</span>', true) +
        card("Dynamic segment generation", sig.dynamic_segment_generation
          ? '<span class="pill pill-success">supported</span>'
          : '<span class="pill pill-muted">off</span>', true) +
        card("Max signals / request", String(limits.max_signals_per_request ?? "—")) +
        card("Default max_results", String(limits.default_max_results ?? "—")) +
        card("Max rules / segment", String(limits.max_rules_per_segment ?? "—")) +
        card("Signal categories",
          categories.map((c) => '<span class="pill pill-muted mono">' + escapeHtml(c) + '</span>').join(" "),
          true) +
      '</div>' +
    '</div>' +

    // ─── Destinations ───
    (dests.length
      ? '<div class="caps-section">' +
          '<div class="caps-section-title">Activation destinations (' + dests.length + ')</div>' +
          '<div class="caps-dest-list">' +
            dests.map((d) => '' +
              '<div class="caps-dest">' +
                '<div class="caps-dest-meta">' +
                  '<div class="caps-dest-name">' + escapeHtml(d.name || d.id) + '</div>' +
                  '<div class="caps-dest-id">' + escapeHtml(d.id || "") + ' · ' + escapeHtml(d.type || "—") + '</div>' +
                '</div>' +
                (d.activation_supported
                  ? '<span class="pill pill-success">active</span>'
                  : '<span class="pill pill-muted">inactive</span>') +
              '</div>'
            ).join("") +
          '</div>' +
        '</div>'
      : "") +

    // ─── UCP extension ───
    // The Universal Context Protocol block is genuinely the most
    // technically interesting part of the capabilities response — vector
    // embedding space, dimensions, encoding, similarity-search endpoint
    // template, concept registry. Surface all of it prominently rather
    // than hiding under a "phase" placeholder.
    (Object.keys(ucp).length
      ? '<div class="caps-section">' +
          '<div class="caps-section-title">UCP extension (ext.ucp) — semantic / NLP discovery layer</div>' +
          '<div class="caps-grid">' +
            (Array.isArray(ucp.supported_spaces) && ucp.supported_spaces.length
              ? card("Embedding space", '<span class="mono" style="font-size:12px">' + escapeHtml(ucp.supported_spaces[0]) + '</span>', true)
              : "") +
            (Array.isArray(ucp.dimensions) && ucp.dimensions.length
              ? card("Dimensions", '<span class="mono">' + ucp.dimensions[0] + '</span>', true)
              : "") +
            (Array.isArray(ucp.supported_encodings) && ucp.supported_encodings.length
              ? card("Encoding", '<span class="mono">' + escapeHtml(ucp.supported_encodings.join(", ")) + '</span>', true)
              : "") +
            (typeof ucp.similarity_search === "boolean"
              ? card("Similarity search",
                  ucp.similarity_search
                    ? '<span class="pill pill-success">enabled</span>'
                    : '<span class="pill pill-muted">off</span>', true)
              : "") +
            (ucp.phase
              ? card("Phase", '<span class="mono" style="font-size:12px">' + escapeHtml(ucp.phase) + '</span>', true)
              : "") +
            (ucp.gts_version
              ? card("GTS version", '<span class="mono" style="font-size:12px">' + escapeHtml(ucp.gts_version) + '</span>', true)
              : "") +
            (ucp.embedding_endpoint_template
              ? card("Embedding endpoint",
                  '<span class="mono" style="font-size:12px;color:var(--accent-hot)">' + escapeHtml(ucp.embedding_endpoint_template) + '</span>', true)
              : "") +
            (ucp.gts?.supported
              ? card("GTS",
                  '<span class="pill pill-success">supported</span>' +
                  (ucp.gts.endpoint ? ' <span class="mono" style="color:var(--text-mut);font-size:12px;margin-left:6px">' + escapeHtml(ucp.gts.endpoint) + '</span>' : ""),
                  true)
              : "") +
            (ucp.concept_registry?.supported
              ? card("Concept registry",
                  '<span class="pill pill-success">' + (ucp.concept_registry.concept_count ?? 0) + ' concepts</span>' +
                  (ucp.concept_registry.endpoint ? ' <span class="mono" style="color:var(--text-mut);font-size:12px;margin-left:6px">' + escapeHtml(ucp.concept_registry.endpoint) + '</span>' : ""),
                  true)
              : "") +
            (ucp.handshake_simulator?.supported
              ? card("Handshake simulator",
                  '<span class="pill pill-success">supported</span>' +
                  (ucp.handshake_simulator.endpoint ? ' <span class="mono" style="color:var(--text-mut);font-size:12px;margin-left:6px">' + escapeHtml(ucp.handshake_simulator.endpoint) + '</span>' : ""),
                  true)
              : "") +
            (ucp.projector?.supported
              ? card("Projector",
                  '<span class="pill pill-success">supported</span>' +
                  (ucp.projector.endpoint ? ' <span class="mono" style="color:var(--text-mut);font-size:12px;margin-left:6px">' + escapeHtml(ucp.projector.endpoint) + '</span>' : ""),
                  true)
              : "") +
          '</div>' +
        '</div>'
      : "") +

    // ─── DTS extension (IAB Data Transparency Standard v1.2) ───
    // Signal-level compliance: every row in the catalog carries a full
    // x_dts label. Capabilities-level declaration tells buyer agents
    // up-front whether to expect those fields + which privacy
    // mechanisms this agent emits.
    (Object.keys(dts).length
      ? '<div class="caps-section">' +
          '<div class="caps-section-title">DTS extension (ext.dts) — IAB Data Transparency Standard</div>' +
          '<div class="caps-grid">' +
            card("DTS version", '<span class="mono">v' + escapeHtml(String(dts.version || "—")) + '</span>', true) +
            card("Support",
              dts.supported
                ? '<span class="pill pill-success">enabled</span>'
                : '<span class="pill pill-muted">off</span>', true) +
            card("IAB Tech Lab compliant",
              dts.iab_techlab_compliant
                ? '<span class="pill pill-success">yes</span>'
                : '<span class="pill pill-muted">no</span>', true) +
            card("Label field", '<span class="mono" style="color:var(--accent-hot)">' + escapeHtml(dts.label_field || "x_dts") + '</span>', true) +
            card("Offline sources",
              dts.offline_sources_supported
                ? '<span class="pill pill-success">supported</span>'
                : '<span class="pill pill-muted">online only</span>', true) +
            (Array.isArray(dts.privacy_compliance_mechanisms) && dts.privacy_compliance_mechanisms.length
              ? card("Privacy mechanisms",
                  dts.privacy_compliance_mechanisms.map((m) => '<span class="pill pill-muted mono">' + escapeHtml(m) + '</span>').join(" "),
                  true)
              : "") +
            (Array.isArray(dts.supported_precision_levels) && dts.supported_precision_levels.length
              ? card("Precision levels",
                  dts.supported_precision_levels.map((p) => '<span class="pill pill-muted mono">' + escapeHtml(p) + '</span>').join(" "),
                  true)
              : "") +
            (dts.provider_privacy_policy_url
              ? card("Privacy policy",
                  '<a href="' + escapeHtml(dts.provider_privacy_policy_url) + '" target="_blank" rel="noopener" class="mono" style="font-size:11.5px;word-break:break-all">' + escapeHtml(dts.provider_privacy_policy_url) + '</a>',
                  true)
              : "") +
          '</div>' +
        '</div>'
      : "") +

    // ─── MCP tool catalog (discovery) ───
    // Tools list is populated async via mountToolCatalog() after this
    // template renders. The pane is public — tools/list is unauth
    // per AdCP convention.
    '<div class="caps-section">' +
      '<div class="caps-section-title">MCP tools (tools/list) <span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px">— discovery is public</span></div>' +
      '<div id="caps-tool-catalog"><div style="padding:8px 4px;color:var(--text-mut);font-size:12px"><span class="spinner"></span>Loading tools/list…</div></div>' +
    '</div>' +

    // ─── REST endpoint reference ───
    '<div class="caps-section">' +
      '<div class="caps-section-title">REST endpoints</div>' +
      renderRestEndpointsTable() +
    '</div>' +

    // ─── Raw JSON (collapsible) ───
    '<div class="caps-section">' +
      '<div class="caps-section-title">Raw JSON</div>' +
      '<div class="caps-raw-json">' + highlightJson(JSON.stringify(caps, null, 2)) + '</div>' +
    '</div>';
}

// Static REST endpoint reference. Kept in the UI code (not fetched) so
// this surface stays predictable — the moment an endpoint lands it
// should be added here alongside its route handler file.
function renderRestEndpointsTable() {
  const rows = [
    { m: "GET",  path: "/capabilities",        auth: "public", note: "Agent handshake — protocols, signals block, ext.ucp, ext.dts" },
    { m: "POST", path: "/mcp",                 auth: "mixed",  note: "JSON-RPC 2.0 — discovery public, tools/call auth-gated" },
    { m: "GET",  path: "/mcp/recent",          auth: "public", note: "Ring buffer of recent tools/call (last 50, isolate-scoped)" },
    { m: "POST", path: "/signals/search",      auth: "public", note: "REST equivalent of tools/call get_signals" },
    { m: "POST", path: "/signals/activate",    auth: "bearer", note: "REST equivalent of tools/call activate_signal" },
    { m: "POST", path: "/signals/estimate",    auth: "public", note: "Dry-run sizer for builder UIs (no persist)" },
    { m: "POST", path: "/signals/generate",    auth: "bearer", note: "Persist a composite from rules" },
    { m: "GET",  path: "/operations/:id",      auth: "bearer", note: "Single activation status" },
    { m: "GET",  path: "/operations",          auth: "bearer", note: "Paginated activation list, newest first" },
    { m: "POST", path: "/admin/reseed",        auth: "bearer", note: "Drop + re-seed signals table (operator only)" },
    { m: "GET",  path: "/signals/:id/embedding", auth: "bearer", note: "Raw UCP embedding vector for a signal" },
    { m: "POST", path: "/signals/query",       auth: "bearer", note: "NL audience query → AST → ranked matches" },
    { m: "GET",  path: "/ucp/concepts",        auth: "public", note: "UCP concept registry" },
    { m: "GET",  path: "/ucp/gts",             auth: "public", note: "UCP Global Trust Score endpoint" },
    { m: "GET",  path: "/.well-known/oauth-protected-resource", auth: "public", note: "RFC 9728 OAuth metadata" },
    { m: "GET",  path: "/.well-known/oauth-authorization-server", auth: "public", note: "RFC 8414 AS metadata" },
    { m: "GET",  path: "/privacy",             auth: "public", note: "DTS-referenced privacy page" },
    { m: "GET",  path: "/health",              auth: "public", note: "Liveness" },
  ];
  return '' +
    '<div class="rest-table-shell">' +
      '<table class="rest-table"><thead><tr><th>Method</th><th>Path</th><th>Auth</th><th>Purpose</th></tr></thead><tbody>' +
        rows.map((r) => '<tr>' +
          '<td><span class="rest-method m-' + r.m.toLowerCase() + '">' + r.m + '</span></td>' +
          '<td class="rest-path">' + escapeHtml(r.path) + '</td>' +
          '<td>' + renderAuthPill(r.auth) + '</td>' +
          '<td class="rest-note">' + escapeHtml(r.note) + '</td>' +
        '</tr>').join("") +
      '</tbody></table>' +
    '</div>';
}
function renderAuthPill(a) {
  if (a === "public") return '<span class="pill pill-muted">public</span>';
  if (a === "bearer") return '<span class="pill pill-accent">bearer</span>';
  if (a === "mixed")  return '<span class="pill pill-warning">mixed</span>';
  return '<span class="pill pill-muted">' + escapeHtml(a) + '</span>';
}

// Fetch tools/list via the MCP JSON-RPC endpoint (no auth required —
// discovery is public) and render each tool as a collapsible card.
// Called by loadCapabilities() after renderCapabilitiesHtml injects the
// placeholder. A failure leaves the placeholder in a muted error state
// but doesn't block the rest of the tab.
async function mountToolCatalog() {
  const host = document.getElementById("caps-tool-catalog");
  if (!host) return;
  try {
    const res = await fetch("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method: "tools/list", params: {} }),
    });
    const body = await res.json();
    const tools = body.result?.tools || [];
    if (tools.length === 0) {
      host.innerHTML = '<div style="padding:8px 4px;color:var(--text-mut);font-size:12px">tools/list returned 0 tools (unexpected).</div>';
      return;
    }
    host.innerHTML = tools.map((t) => renderToolCard(t)).join("");
  } catch (e) {
    host.innerHTML = '<div style="padding:8px 4px;color:var(--error);font-size:12px">Failed to load tools/list: ' + escapeHtml(e.message) + '</div>';
  }
}

function renderToolCard(tool) {
  const required = tool.inputSchema?.required || [];
  const props = tool.inputSchema?.properties || {};
  const propKeys = Object.keys(props);
  // Auth is a function of the method, not the tool — all tools/call go
  // through the bearer gate, tools/list doesn't. Reflect that honestly.
  return '' +
    '<details class="tool-card">' +
      '<summary class="tool-card-head">' +
        '<div class="tool-card-main">' +
          '<span class="tool-card-name">' + escapeHtml(tool.name) + '</span>' +
          '<span class="pill pill-accent">bearer (tools/call)</span>' +
          (required.length ? '<span class="pill pill-muted mono">' + required.length + ' required</span>' : '') +
        '</div>' +
        '<div class="tool-card-desc">' + escapeHtml(tool.description || "") + '</div>' +
      '</summary>' +
      '<div class="tool-card-body">' +
        (propKeys.length
          ? '<div class="tool-card-props-label">Parameters</div>' +
            '<div class="tool-card-props">' +
              propKeys.map((k) => {
                const p = props[k] || {};
                const isReq = required.includes(k);
                return '<div class="tool-prop">' +
                  '<div class="tool-prop-key"><span class="mono">' + escapeHtml(k) + '</span>' +
                    (isReq ? ' <span class="pill" style="background:rgba(239,68,68,0.12);color:var(--error);font-size:9.5px">required</span>' : '') +
                    ' <span class="tool-prop-type mono">' + escapeHtml(p.type || "any") + (p.enum ? " (enum)" : "") + '</span></div>' +
                  (p.description ? '<div class="tool-prop-desc">' + escapeHtml(p.description) + '</div>' : "") +
                  (Array.isArray(p.enum) ? '<div class="tool-prop-enum mono">' + p.enum.map((v) => '<span>' + escapeHtml(String(v)) + '</span>').join("") + '</div>' : "") +
                '</div>';
              }).join("") +
            '</div>'
          : '<div style="color:var(--text-mut);font-size:12px;padding:4px 2px">No parameters.</div>') +
        '<div class="tool-card-curl-label">Example curl</div>' +
        '<pre class="tool-card-curl">' + escapeHtml(buildExampleCurl(tool)) + '</pre>' +
      '</div>' +
    '</details>';
}

function buildExampleCurl(tool) {
  // Plausible argument values per tool — matches what Discover / Builder
  // pass so operators can replay a real request.
  const exampleArgs = {
    get_adcp_capabilities: {},
    get_signals: { signal_spec: "affluent streamers 25-44", deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] }, max_results: 5 },
    activate_signal: { signal_agent_segment_id: "sig_auto_in_market_new_suv", deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] } },
    get_operation_status: { task_id: "op_1700000000000_abcdef" },
    get_similar_signals: { signal_agent_segment_id: "sig_auto_in_market_new_suv", top_k: 5, deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] } },
    query_signals_nl: { query: "soccer moms 35+ who stream heavily", limit: 5 },
    get_concept: { concept_id: "SOCCER_MOM_US" },
    search_concepts: { q: "high income", limit: 5 },
  };
  const args = exampleArgs[tool.name] ?? {};
  const payload = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool.name, arguments: args } };
  // Line continuations require literal backslashes in the rendered JS
  // string. Because this whole SCRIPT_TAG body lives inside the outer
  // TypeScript template literal, each literal backslash needs four here
  // (TS-literal → JS-source → in-JS string-literal).
  const BS = "\\\\";
  return 'curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp ' + BS + '\\n' +
    '  -H "Authorization: Bearer demo-key-adcp-signals-v1" ' + BS + '\\n' +
    '  -H "Content-Type: application/json" ' + BS + '\\n' +
    "  -d '" + JSON.stringify(payload) + "'";
}

// Render a DTS v1.2 label as a grouped KV list. Fields are ordered by the
// IAB spec sections: Core, Audience, Data Sources, Onboarder. Long lists
// (data_sources, privacy mechanisms) render as pill chips.
function renderDtsLabel(dts) {
  if (!dts) return "";
  const groups = [
    {
      title: "Provider & audience",
      rows: [
        ["Provider", dts.provider_name],
        ["Domain", dts.provider_domain],
        ["Email", dts.provider_email],
        ["Audience name", dts.audience_name],
        ["Audience ID", dts.audience_id],
        ["Audience size", dts.audience_size != null ? dts.audience_size.toLocaleString() : null],
        ["Taxonomy IDs", dts.taxonomy_id_list],
        ["Originating domain", dts.originating_domain],
      ],
    },
    {
      title: "Audience details",
      rows: [
        ["Criteria", dts.audience_criteria],
        ["Scope", dts.audience_scope],
        ["Inclusion methodology", dts.audience_inclusion_methodology],
        ["Precision levels", Array.isArray(dts.audience_precision_levels) ? dts.audience_precision_levels.join(", ") : null],
        ["ID types", Array.isArray(dts.id_types) ? dts.id_types.join(", ") : null],
        ["Data sources", Array.isArray(dts.data_sources) ? dts.data_sources.join(", ") : null],
        ["Audience expansion", dts.audience_expansion],
        ["Device expansion", dts.device_expansion],
        ["Audience refresh", dts.audience_refresh],
        ["Lookback window", dts.lookback_window],
        ["Geocode list", dts.geocode_list],
      ],
    },
    {
      title: "Privacy & compliance",
      rows: [
        ["Privacy mechanisms", Array.isArray(dts.privacy_compliance_mechanisms) ? dts.privacy_compliance_mechanisms.join(", ") : null],
        ["Privacy policy", dts.privacy_policy_url ? '<a href="' + escapeHtml(dts.privacy_policy_url) + '" target="_blank" rel="noopener">' + escapeHtml(dts.privacy_policy_url) + "</a>" : null],
        ["IAB Tech Lab compliant", dts.iab_techlab_compliant],
      ],
    },
    {
      title: "Onboarder (offline sources)",
      rows: [
        ["Match keys", dts.onboarder_match_keys],
        ["Audience expansion", dts.onboarder_audience_expansion],
        ["Device expansion", dts.onboarder_device_expansion],
        ["Precision level", dts.onboarder_audience_precision_level],
      ],
    },
  ];

  return '<div class="dts-groups">' +
    groups.map((g) => {
      const rows = g.rows.filter(([, v]) => v != null && v !== "");
      if (rows.length === 0) return "";
      return '' +
        '<div class="dts-group">' +
          '<div class="dts-group-title">' + escapeHtml(g.title) + '</div>' +
          '<div class="dts-kv-list">' +
            rows.map(([k, v]) => {
              const val = typeof v === "string" && v.startsWith("<a ") ? v : escapeHtml(String(v));
              return '<div class="dts-kv"><span class="dts-k">' + escapeHtml(k) + '</span><span class="dts-v">' + val + '</span></div>';
            }).join("") +
          '</div>' +
        '</div>';
    }).join("") +
    '</div>';
}

function card(label, value, isHtml) {
  return '' +
    '<div class="caps-card">' +
      '<div class="caps-card-label">' + escapeHtml(label) + '</div>' +
      '<div class="caps-card-value ' + (isHtml ? 'small' : '') + '">' + (isHtml ? value : escapeHtml(value)) + '</div>' +
    '</div>';
}

// Minimal JSON syntax highlighter. Tokenizes on a regex that captures
// keys / strings / numbers / booleans / null / punctuation separately.
// Escaping done up-front so nothing injected can break out of a span.
function highlightJson(jsonText) {
  const escaped = escapeHtml(jsonText);
  return escaped.replace(
    /(&quot;(?:\\\\.|[^&])*?&quot;(?=\\s*:))|(&quot;(?:\\\\.|[^&])*?&quot;)|\\b(true|false)\\b|\\bnull\\b|(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|([{}\\[\\],])/g,
    (match, key, str, bool, num, punct) => {
      if (key)   return '<span class="json-key">' + key + '</span>';
      if (str)   return '<span class="json-str">' + str + '</span>';
      if (bool)  return '<span class="json-bool">' + bool + '</span>';
      if (match === "null") return '<span class="json-null">null</span>';
      if (num !== undefined) return '<span class="json-num">' + num + '</span>';
      if (punct) return '<span class="json-punct">' + punct + '</span>';
      return match;
    },
  );
}

//────────────────────────────────────────────────────────────────────────
// §6 Activations — poll GET /operations every 10s while visible
//────────────────────────────────────────────────────────────────────────
document.getElementById("refresh-activations").addEventListener("click", loadActivations);

function startActivationsPolling() {
  loadActivations();
  if (state.activations.pollTimer) return;
  state.activations.pollTimer = setInterval(loadActivations, 10_000);
}
function stopActivationsPolling() {
  if (state.activations.pollTimer) {
    clearInterval(state.activations.pollTimer);
    state.activations.pollTimer = null;
  }
}

async function loadActivations() {
  const tbody = document.getElementById("activations-tbody");
  try {
    const res = await fetch("/operations?limit=100", {
      headers: { "Authorization": "Bearer " + DEMO_KEY },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
    state.activations.data = data.operations || [];
    document.getElementById("nav-activations-count").textContent = String(data.count || 0);
    if (state.activations.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No activations yet. Activate a signal from any tab to see it here.</td></tr>';
      return;
    }
    tbody.innerHTML = state.activations.data.map(renderActivationRow).join("");
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty" style="color:var(--error)">' + escapeHtml(e.message) + '</td></tr>';
  }
}

function renderActivationRow(op) {
  const submittedAt = fmtTime(op.submittedAt);
  const completedAt = op.completedAt ? fmtTime(op.completedAt) : "—";
  const statusClass = (op.status || "submitted").toLowerCase();
  return '' +
    '<tr>' +
      '<td class="td-name">' +
        '<div>' + escapeHtml(op.signalName || "(unknown signal)") + '</div>' +
        '<span class="signal-id">' + escapeHtml(op.signalId || "") + '</span>' +
      '</td>' +
      '<td class="td-vertical">' + escapeHtml(op.destination || "—") + '</td>' +
      '<td><span class="status-dot ' + statusClass + '"></span><span style="font-size:12.5px;text-transform:capitalize">' + escapeHtml(op.status || "") + '</span></td>' +
      '<td class="td-time">' + escapeHtml(submittedAt) + '</td>' +
      '<td class="td-time">' + escapeHtml(completedAt) + '</td>' +
      '<td class="td-time">' + (op.webhookFired ? '<span style="color:var(--success)">fired</span>' : (op.webhookUrl ? 'queued' : '—')) + '</td>' +
      '<td class="td-time" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml((op.operationId || "").slice(0, 24)) + '</td>' +
    '</tr>';
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + "h ago";
    return d.toISOString().slice(0, 16).replace("T", " ");
  } catch { return iso; }
}

//────────────────────────────────────────────────────────────────────────
// §7 MCP Tool Log — poll GET /mcp/recent every 5s while tab visible
//────────────────────────────────────────────────────────────────────────
document.getElementById("toollog-refresh").addEventListener("click", loadToolLog);
document.getElementById("toollog-filter").addEventListener("change", (e) => {
  state.toolLog.filter = e.target.value || "";
  state.toolLog.expanded.clear();
  loadToolLog();
});
document.getElementById("toollog-pause").addEventListener("click", () => {
  state.toolLog.paused = !state.toolLog.paused;
  document.getElementById("toollog-pause-label").textContent = state.toolLog.paused ? "Resume" : "Pause";
  if (state.toolLog.paused) stopToolLogPolling();
  else startToolLogPolling();
});

function startToolLogPolling() {
  if (state.toolLog.paused) return;
  loadToolLog();
  if (state.toolLog.pollTimer) return;
  state.toolLog.pollTimer = setInterval(loadToolLog, 5_000);
}
function stopToolLogPolling() {
  if (state.toolLog.pollTimer) {
    clearInterval(state.toolLog.pollTimer);
    state.toolLog.pollTimer = null;
  }
}

async function loadToolLog() {
  const tbody = document.getElementById("toollog-tbody");
  try {
    const qs = "?limit=50" + (state.toolLog.filter ? "&tool=" + encodeURIComponent(state.toolLog.filter) : "");
    const res = await fetch("/mcp/recent" + qs);
    const data = await res.json();
    state.toolLog.data = data.entries || [];
    document.getElementById("nav-toollog-count").textContent = String(state.toolLog.data.length);
    const noteEl = document.getElementById("toollog-note");
    const scopeBadge = data.scope === "d1"
      ? '<span class="pill pill-success" style="font-size:10px;margin-right:6px">d1</span>'
      : '<span class="pill pill-warning" style="font-size:10px;margin-right:6px">isolate</span>';
    noteEl.innerHTML = scopeBadge + "ℹ " + escapeHtml(data.note || "");
    if (state.toolLog.data.length === 0) {
      const msg = state.toolLog.filter
        ? 'No <code>' + escapeHtml(state.toolLog.filter) + '</code> calls in the window.'
        : 'No tool calls recorded yet. Trigger one from Discover or via <code>curl /mcp</code>.';
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">' + msg + '</td></tr>';
      return;
    }
    tbody.innerHTML = state.toolLog.data.flatMap((entry, i) => renderToolLogRow(entry, i)).join("");
    wireToolLogExpanders();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty" style="color:var(--error)">' + escapeHtml(e.message) + '</td></tr>';
  }
}

function renderToolLogRow(entry, idx) {
  const when = fmtTime(entry.ts);
  // Argument chips — prefer the arg KEYS from the in-memory record, fall
  // back to parsing the D1 arguments_json when the D1 backend supplies
  // the full payload. Either way the display stays tight.
  let argChips;
  if (Array.isArray(entry.argKeys) && entry.argKeys.length) {
    argChips = entry.argKeys;
  } else if (typeof entry.argumentsJson === "string") {
    try {
      const parsed = JSON.parse(entry.argumentsJson);
      argChips = parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 6) : [];
    } catch { argChips = []; }
  } else { argChips = []; }
  const argPill = argChips.length
    ? argChips.map((k) => '<span class="pill pill-muted mono" style="font-size:10.5px">' + escapeHtml(k) + '</span>').join(" ")
    : '<span style="color:var(--text-mut);font-size:11.5px">—</span>';
  const latencyClass = entry.latencyMs > 1500 ? "color:var(--error)" : entry.latencyMs > 500 ? "color:var(--warning)" : "";
  const bytes = entry.responseBytes != null ? fmtNumber(entry.responseBytes) + "B" : "—";
  const callerPill = entry.caller === "authed"
    ? '<span class="pill pill-accent">authed</span>'
    : '<span class="pill pill-muted">unauth</span>';
  const statusPill = entry.ok
    ? '<span class="pill pill-success">ok</span>'
    : '<span class="pill" style="background:var(--error-dim);color:var(--error)">' + escapeHtml((entry.errorKind || "error").split(":")[0]) + '</span>';
  const rowKey = entry.id || String(idx);
  const expanded = state.toolLog.expanded.has(rowKey);
  const rows = [
    '<tr class="toollog-row" data-key="' + escapeHtml(rowKey) + '" style="cursor:pointer">' +
      '<td class="td-time">' + escapeHtml(when) + '</td>' +
      '<td class="td-name" style="font-family:var(--font-mono);font-size:12.5px">' + escapeHtml(entry.tool || "") + '</td>' +
      '<td style="font-size:11px">' + argPill + '</td>' +
      '<td class="td-numeric" style="' + latencyClass + '">' + (entry.latencyMs ?? "—") + ' ms</td>' +
      '<td class="td-numeric">' + bytes + '</td>' +
      '<td>' + callerPill + '</td>' +
      '<td>' + statusPill + '</td>' +
    '</tr>',
  ];
  if (expanded) {
    const argsJson = entry.argumentsJson || JSON.stringify(entry.argKeys ? { keys: entry.argKeys } : {}, null, 2);
    let pretty;
    try { pretty = JSON.stringify(JSON.parse(argsJson), null, 2); }
    catch { pretty = argsJson; }
    const errorBlock = !entry.ok && entry.errorKind
      ? '<div style="color:var(--error);margin-bottom:8px;font-family:var(--font-mono);font-size:11.5px">✗ ' + escapeHtml(entry.errorKind) + '</div>'
      : "";
    rows.push(
      '<tr class="toollog-expanded"><td colspan="7" style="background:var(--bg-raised);padding:14px 18px">' +
        errorBlock +
        '<div style="font-size:10.5px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Arguments</div>' +
        '<pre class="caps-raw-json" style="max-height:320px;margin:0">' + highlightJson(pretty) + '</pre>' +
      '</td></tr>',
    );
  }
  return rows;
}

function wireToolLogExpanders() {
  document.querySelectorAll(".toollog-row").forEach((row) => {
    row.addEventListener("click", () => {
      const key = row.dataset.key;
      if (state.toolLog.expanded.has(key)) state.toolLog.expanded.delete(key);
      else state.toolLog.expanded.add(key);
      // Re-render without refetching — just rebuild the body from cached data
      const tbody = document.getElementById("toollog-tbody");
      tbody.innerHTML = state.toolLog.data.flatMap((e, i) => renderToolLogRow(e, i)).join("");
      wireToolLogExpanders();
    });
  });
}

// Sec-38 B7 — Dev kit tab (C5 sandbox keys + C7 SDK snippets)
var _devkitLang = "typescript";
var _devkitKeyShown = false;
function ensureDevkit() {
  renderDevkitCode();
  updateDevkitKeyDisplay();
}
function updateDevkitKeyDisplay() {
  var el = document.getElementById("devkit-key");
  if (!el) return;
  el.textContent = _devkitKeyShown ? DEMO_KEY : DEMO_KEY.slice(0, 8) + "••••••••••••••";
  document.getElementById("devkit-key-reveal").textContent = _devkitKeyShown ? "Hide" : "Reveal";
}
(function wireDevkit() {
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("#devkit-key-reveal")) {
      _devkitKeyShown = !_devkitKeyShown; updateDevkitKeyDisplay(); return;
    }
    if (t.closest("#devkit-key-copy")) {
      navigator.clipboard.writeText(DEMO_KEY).then(function () { showToast("Key copied"); }).catch(function () { showToast("Copy failed", true); });
      return;
    }
    if (t.closest("#devkit-copy-code")) {
      var code = document.getElementById("devkit-code")?.textContent || "";
      navigator.clipboard.writeText(code).then(function () { showToast("Snippet copied"); }).catch(function () { showToast("Copy failed", true); });
      return;
    }
    var tab = t.closest(".devkit-tab");
    if (tab) {
      _devkitLang = tab.dataset.lang;
      document.querySelectorAll(".devkit-tab").forEach(function (b) { b.classList.toggle("active", b === tab); });
      renderDevkitCode();
    }
  });
})();
function renderDevkitCode() {
  var pre = document.getElementById("devkit-code");
  if (!pre) return;
  var origin = location.origin;
  var snippets = {
    typescript:
      "// npm install @adcp/client\\n" +
      "import { AdcpClient } from \\"@adcp/client\\";\\n" +
      "\\n" +
      "const client = new AdcpClient({\\n" +
      "  endpoint: \\"" + origin + "/mcp\\",\\n" +
      "  apiKey: process.env.ADCP_KEY!,  // bearer token\\n" +
      "});\\n" +
      "\\n" +
      "const res = await client.getSignals({\\n" +
      "  brief: \\"affluent families 35-44 interested in luxury travel\\",\\n" +
      "  deliver_to: { deployments: [{ type: \\"platform\\", platform: \\"mock_dsp\\" }], countries: [\\"US\\"] },\\n" +
      "  max_results: 10,\\n" +
      "});\\n" +
      "console.log(res.signals.length, \\"matches\\");\\n" +
      "console.log(res.signals[0].x_cross_taxonomy);  // Sec-38 bridge IDs",
    python:
      "# pip install requests\\n" +
      "import os, requests\\n" +
      "\\n" +
      "resp = requests.post(\\n" +
      "    \\"" + origin + "/mcp\\",\\n" +
      "    headers={\\"Authorization\\": f\\"Bearer {os.environ['ADCP_KEY']}\\"},\\n" +
      "    json={\\n" +
      "        \\"jsonrpc\\": \\"2.0\\", \\"id\\": 1, \\"method\\": \\"tools/call\\",\\n" +
      "        \\"params\\": {\\n" +
      "            \\"name\\": \\"get_signals\\",\\n" +
      "            \\"arguments\\": {\\n" +
      "                \\"brief\\": \\"affluent families 35-44 interested in luxury travel\\",\\n" +
      "                \\"deliver_to\\": {\\"deployments\\": [{\\"type\\": \\"platform\\", \\"platform\\": \\"mock_dsp\\"}], \\"countries\\": [\\"US\\"]},\\n" +
      "                \\"max_results\\": 10,\\n" +
      "            },\\n" +
      "        },\\n" +
      "    },\\n" +
      "    timeout=30,\\n" +
      ")\\n" +
      "print(resp.json()[\\"result\\"][\\"structuredContent\\"][\\"count\\"])",
    go:
      "package main\\n" +
      "\\n" +
      "import (\\n" +
      "    \\"bytes\\"\\n" +
      "    \\"encoding/json\\"\\n" +
      "    \\"fmt\\"\\n" +
      "    \\"net/http\\"\\n" +
      "    \\"os\\"\\n" +
      ")\\n" +
      "\\n" +
      "func main() {\\n" +
      "    body, _ := json.Marshal(map[string]any{\\n" +
      "        \\"jsonrpc\\": \\"2.0\\", \\"id\\": 1, \\"method\\": \\"tools/call\\",\\n" +
      "        \\"params\\": map[string]any{\\n" +
      "            \\"name\\": \\"get_signals\\",\\n" +
      "            \\"arguments\\": map[string]any{\\n" +
      "                \\"brief\\": \\"affluent families 35-44 interested in luxury travel\\",\\n" +
      "                \\"deliver_to\\": map[string]any{\\"deployments\\": []any{map[string]any{\\"type\\": \\"platform\\", \\"platform\\": \\"mock_dsp\\"}}, \\"countries\\": []string{\\"US\\"}},\\n" +
      "                \\"max_results\\": 10,\\n" +
      "            },\\n" +
      "        },\\n" +
      "    })\\n" +
      "    req, _ := http.NewRequest(\\"POST\\", \\"" + origin + "/mcp\\", bytes.NewReader(body))\\n" +
      "    req.Header.Set(\\"Authorization\\", \\"Bearer \\"+os.Getenv(\\"ADCP_KEY\\"))\\n" +
      "    req.Header.Set(\\"Content-Type\\", \\"application/json\\")\\n" +
      "    resp, err := http.DefaultClient.Do(req)\\n" +
      "    if err != nil { panic(err) }\\n" +
      "    defer resp.Body.Close()\\n" +
      "    var out map[string]any\\n" +
      "    json.NewDecoder(resp.Body).Decode(&out)\\n" +
      "    fmt.Println(out[\\"result\\"])\\n" +
      "}",
    curl:
      "curl -s -X POST " + origin + "/mcp \\\\\\n" +
      "  -H \\"Authorization: Bearer $ADCP_KEY\\" \\\\\\n" +
      "  -H \\"Content-Type: application/json\\" \\\\\\n" +
      "  -d '{\\n" +
      "    \\"jsonrpc\\": \\"2.0\\", \\"id\\": 1, \\"method\\": \\"tools/call\\",\\n" +
      "    \\"params\\": {\\n" +
      "      \\"name\\": \\"get_signals\\",\\n" +
      "      \\"arguments\\": {\\n" +
      "        \\"brief\\": \\"affluent families 35-44 interested in luxury travel\\",\\n" +
      "        \\"deliver_to\\": {\\"deployments\\":[{\\"type\\":\\"platform\\",\\"platform\\":\\"mock_dsp\\"}],\\"countries\\":[\\"US\\"]},\\n" +
      "        \\"max_results\\": 10\\n" +
      "      }\\n" +
      "    }\\n" +
      "  }'",
  };
  pre.textContent = snippets[_devkitLang] || "";
}

// Sec-39: Destinations tab — rich per-destination card grid sourced from
// /capabilities. No separate endpoint; we re-use the capabilities JSON
// and render a deeper view per destination.
var _destLoaded = false;
async function ensureDestinations() {
  if (_destLoaded) return;
  _destLoaded = true;
  await renderDestinationsTab();
}
document.addEventListener("click", function (ev) {
  var t = ev.target;
  if (t instanceof Element && t.closest("#dest-refresh")) {
    _destLoaded = false; ensureDestinations();
  }
});
async function renderDestinationsTab() {
  var grid = document.getElementById("dest-grid");
  var summary = document.getElementById("dest-summary");
  try {
    var r = await fetch("/capabilities");
    var caps = await r.json();
    var dests = (caps.signals && caps.signals.destinations) || [];
    document.getElementById("nav-destinations-count").textContent = String(dests.length);

    var live = dests.filter(function (d) { return d.stage === "live"; }).length;
    var sandbox = dests.filter(function (d) { return d.stage === "sandbox"; }).length;
    var roadmap = dests.filter(function (d) { return d.stage === "roadmap"; }).length;
    var act = dests.filter(function (d) { return d.activation_supported; }).length;
    summary.innerHTML =
      '<div class="dest-summary-card"><div class="dss-v">' + dests.length + '</div><div class="dss-l">Total</div></div>' +
      '<div class="dest-summary-card"><div class="dss-v" style="color:var(--ok)">' + live + '</div><div class="dss-l">Live</div></div>' +
      '<div class="dest-summary-card"><div class="dss-v" style="color:var(--accent)">' + sandbox + '</div><div class="dss-l">Sandbox</div></div>' +
      '<div class="dest-summary-card"><div class="dss-v" style="color:var(--text-mut)">' + roadmap + '</div><div class="dss-l">Roadmap</div></div>' +
      '<div class="dest-summary-card"><div class="dss-v">' + act + ' / ' + dests.length + '</div><div class="dss-l">Activation-ready</div></div>';

    if (!dests.length) { grid.innerHTML = '<div class="empty-state"><div class="empty-title">No destinations declared</div></div>'; return; }

    var typeIcon = { dsp: "bolt", cleanroom: "network", cdp: "grid", measurement: "chart" };
    grid.innerHTML = dests.map(function (d) {
      var stage = d.stage || (d.activation_supported ? "live" : "roadmap");
      var stageClass = stage === "live" ? "pill-success" : stage === "sandbox" ? "pill-info" : "pill-mut";
      var actClass = d.activation_supported ? "pill-success" : "pill-mut";
      var icon = typeIcon[d.type] || "info";
      var ids = Array.isArray(d.id_types_accepted) ? d.id_types_accepted : [];
      var uses = Array.isArray(d.use_cases) ? d.use_cases : [];
      var latency = (d.latency_p50_ms != null && d.latency_p99_ms != null)
        ? 'p50 ' + d.latency_p50_ms + 'ms · p99 ' + d.latency_p99_ms + 'ms'
        : (d.latency_p50_ms != null ? 'p50 ' + d.latency_p50_ms + 'ms' : '—');
      return '<div class="dest-card">' +
        '<div class="dest-card-head">' +
          '<div class="dest-card-icon"><svg class="ico"><use href="#icon-' + icon + '"/></svg></div>' +
          '<div class="dest-card-title-wrap">' +
            '<div class="dest-card-title">' + escapeHtml(d.name) + '</div>' +
            '<div class="dest-card-sub"><code>' + escapeHtml(d.id) + '</code> · ' + escapeHtml(d.type) + (d.vendor ? ' · ' + escapeHtml(d.vendor) : '') + '</div>' +
          '</div>' +
          '<div class="dest-card-pills">' +
            '<span class="pill ' + stageClass + '">' + escapeHtml(stage) + '</span>' +
            '<span class="pill ' + actClass + '">' + (d.activation_supported ? 'activation-ready' : 'read-only') + '</span>' +
          '</div>' +
        '</div>' +
        (d.notes ? '<div class="dest-notes">' + escapeHtml(d.notes) + '</div>' : '') +
        '<div class="dest-field-grid">' +
          renderDestField("Activation pattern", d.activation_pattern) +
          renderDestField("Auth", d.auth_mechanism) +
          renderDestField("Data format", d.data_format) +
          renderDestField("Refresh SLA", d.segment_refresh_sla) +
          renderDestField("Latency", latency) +
          renderDestField("Onboarding", d.onboarding) +
        '</div>' +
        (ids.length ? '<div class="dest-block-label">ID types accepted</div><div class="dest-pills">' + ids.map(function (id) { return '<span class="pill pill-muted mono">' + escapeHtml(id) + '</span>'; }).join('') + '</div>' : '') +
        (uses.length ? '<div class="dest-block-label">Use cases</div><div class="dest-pills">' + uses.map(function (u) { return '<span class="pill pill-info">' + escapeHtml(u) + '</span>'; }).join('') + '</div>' : '') +
        (d.activation_flow ? '<div class="dest-block-label">Activation flow</div><pre class="dest-flow">' + escapeHtml(d.activation_flow) + '</pre>' : '') +
        (d.docs_url ? '<div class="dest-links"><a href="' + escapeHtml(d.docs_url) + '" target="_blank" rel="noopener" class="btn-secondary" style="font-size:11px;padding:4px 10px"><svg class="ico"><use href="#icon-book"/></svg><span>Docs</span></a></div>' : '') +
      '</div>';
    }).join("");
  } catch (e) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-title">Could not load destinations</div><div class="empty-desc">' + escapeHtml(String(e)) + '</div></div>';
  }
}
function renderDestField(label, value) {
  if (!value) value = "—";
  return '<div class="dest-field"><div class="dest-field-label">' + escapeHtml(label) + '</div><div class="dest-field-val">' + escapeHtml(String(value)) + '</div></div>';
}

//────────────────────────────────────────────────────────────────────────
// Sec-41 Part 2 — Embedding Lab + Portfolio + Seasonality + Federation
//────────────────────────────────────────────────────────────────────────

// 26 embedded signals (from /ucp/projection). Loaded once per session.
var _embSignals = null;
async function loadEmbSignals() {
  if (_embSignals) return _embSignals;
  try {
    var r = await fetch("/ucp/projection");
    var data = await r.json();
    _embSignals = (data.points || []).map(function (p) { return { id: p.signal_id, name: p.name, category: p.category, description: p.description }; });
  } catch {
    _embSignals = [];
  }
  return _embSignals;
}

// Delegated close handler for data-dstl-close="1" buttons. Avoids inline
// onclicks that break when the outer template literal re-escapes single
// quotes.
document.addEventListener("click", function (ev) {
  var t = ev.target;
  if (!(t instanceof Element)) return;
  var btn = t.closest('[data-dstl-close]');
  if (btn) {
    var host = document.getElementById("fed-compare-host");
    if (host) host.innerHTML = "";
  }
});

// Global cross-tab shortlist. Persists across Playground / Arithmetic /
// Analogy / Neighborhood / Brief-Portfolio / Seasonality. Action bar at
// top of every ranked list exposes bulk actions. Sec-41 "actionable
// insights" pass.
var _shortlist = [];
function shortlistHas(sid) { return _shortlist.some(function (s) { return s.sid === sid; }); }
function shortlistToggle(sid, name, category) {
  var idx = _shortlist.findIndex(function (s) { return s.sid === sid; });
  if (idx >= 0) _shortlist.splice(idx, 1);
  else _shortlist.push({ sid: sid, name: name, category: category });
}

// Resolve a humanized id back to the real catalog name when possible.
// Falls back to the provided label. Used by the arithmetic/analogy/
// neighborhood selects so "sig_age_25_34" renders as "Core Millennials,
// 25-34" (from catalog) instead of the mangled "Age 25 34".
function prettyNameFor(sid, fallback) {
  if (state.catalog && state.catalog.all) {
    var hit = state.catalog.all.find(function (s) { return s.signal_agent_segment_id === sid; });
    if (hit && hit.name) return hit.name;
  }
  return fallback || sid;
}

// Render a result list from query-vector / arithmetic / analogy /
// neighborhood / brief-portfolio. Each row now has:
//   1) cosine bar
//   2) add-to-shortlist checkbox
//   3) activate-now icon button
//   4) click row background to open detail panel
// The surrounding action bar is rendered separately by renderActionBar().
function renderEmbResultList(results, cosineKey, contextId) {
  cosineKey = cosineKey || "cosine";
  contextId = contextId || "default";
  if (!results || !results.length) {
    return '<div class="empty-state" style="padding:14px"><div class="empty-desc">No matches. Try a different query.</div></div>';
  }
  return '<div class="emb-result-list" data-ctx="' + escapeHtml(contextId) + '">' + results.map(function (r, i) {
    var cos = r[cosineKey] !== undefined ? r[cosineKey] : r.cosine_or_score;
    var cosPct = Math.max(0, cos) * 100;
    var sid = r.signal_agent_segment_id || r.signal_id || "";
    var name = prettyNameFor(sid, r.name);
    var category = r.category_type || r.category || "";
    var inShortlist = shortlistHas(sid);
    return '<div class="emb-result-row" data-sid="' + escapeHtml(sid) + '" data-name="' + escapeHtml(name) + '" data-category="' + escapeHtml(category) + '">' +
      '<label class="err-check" title="Add to shortlist"><input type="checkbox" data-sl-sid="' + escapeHtml(sid) + '"' + (inShortlist ? ' checked' : '') + '/></label>' +
      '<div class="err-rank">' + (i + 1) + '</div>' +
      '<div class="err-main">' +
        '<div class="err-name">' + escapeHtml(name) + '</div>' +
        '<div class="err-sid mono">' + escapeHtml(sid) + (category ? ' \u00b7 ' + escapeHtml(category) : '') + '</div>' +
      '</div>' +
      '<div class="err-cos">' +
        '<div class="err-cos-val mono">' + (typeof cos === "number" ? cos.toFixed(3) : "—") + '</div>' +
        '<div class="err-cos-bar"><div class="err-cos-fill" style="width:' + cosPct.toFixed(1) + '%"></div></div>' +
      '</div>' +
      '<button class="err-activate" data-activate-sid="' + escapeHtml(sid) + '" title="Activate to mock_dsp">' +
        '<svg class="ico"><use href="#icon-bolt"/></svg>' +
      '</button>' +
    '</div>';
  }).join("") + '</div>';
}

// Render the universal action bar — placed above every ranked result list.
// Shows shortlist count + bulk actions. Action identifiers (e.g. "lab-pg")
// are scoped so each tab's buttons don't collide.
function renderActionBar(contextId) {
  var count = _shortlist.length;
  return '<div class="result-actionbar">' +
    '<div class="result-actionbar-info">' +
      (count > 0
        ? '<strong>' + count + '</strong> in shortlist across tabs'
        : 'Shortlist is empty \u2014 check rows below')
    + '</div>' +
    '<button class="btn-secondary" data-result-action="clear-shortlist" data-ctx="' + escapeHtml(contextId) + '" style="padding:4px 12px;font-size:11.5px"' + (count === 0 ? ' disabled' : '') + '>Clear</button>' +
    '<button class="btn-secondary" data-result-action="export-csv" data-ctx="' + escapeHtml(contextId) + '" style="padding:4px 12px;font-size:11.5px"' + (count === 0 ? ' disabled' : '') + '><svg class="ico"><use href="#icon-book"/></svg><span>Export CSV</span></button>' +
    '<button class="btn-secondary" data-result-action="send-builder" data-ctx="' + escapeHtml(contextId) + '" style="padding:4px 12px;font-size:11.5px"' + (count === 0 ? ' disabled' : '') + '><svg class="ico"><use href="#icon-builder"/></svg><span>Open in Builder</span></button>' +
    '<button class="btn-primary" data-result-action="activate-selected" data-ctx="' + escapeHtml(contextId) + '" style="padding:4px 12px;font-size:11.5px"' + (count === 0 ? ' disabled' : '') + '><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate selected</span></button>' +
  '</div>';
}

// Wire per-row + action-bar handlers for a results container. Called
// after rendering into a host. onRerender is a closure that re-renders
// the list with updated shortlist state so checkbox ticks remain consistent.
function wireResultList(host, onRerender) {
  if (!host) return;
  // Checkbox → toggle shortlist
  host.querySelectorAll('[data-sl-sid]').forEach(function (cb) {
    cb.addEventListener('change', function (e) {
      e.stopPropagation();
      var row = cb.closest('.emb-result-row');
      var sid = cb.dataset.slSid;
      var name = row ? row.dataset.name : sid;
      var category = row ? row.dataset.category : "";
      shortlistToggle(sid, name, category);
      if (onRerender) onRerender();
    });
  });
  // Activate button → fire single activation
  host.querySelectorAll('[data-activate-sid]').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      e.stopPropagation();
      var sid = btn.dataset.activateSid;
      btn.disabled = true;
      btn.classList.add("err-activating");
      try {
        var data = await callTool("activate_signal", { signal_agent_segment_id: sid, destination_platform: "mock_dsp" });
        showToast("\u2713 Activated " + sid + (data.operation_id ? " \u00b7 " + data.operation_id : ""));
        btn.classList.remove("err-activating");
        btn.classList.add("err-activated");
      } catch (err) {
        showToast("Activation failed: " + err.message, true);
        btn.classList.remove("err-activating");
        btn.disabled = false;
      }
    });
  });
  // Row click → open detail panel
  host.querySelectorAll('.emb-result-row').forEach(function (row) {
    row.addEventListener('click', function (e) {
      if (e.target.closest('input, button, label')) return;
      openDetailHydrated(row.dataset.sid);
    });
  });
  // Action bar buttons
  host.querySelectorAll('[data-result-action]').forEach(function (btn) {
    btn.addEventListener('click', function () { handleResultAction(btn.dataset.resultAction, onRerender); });
  });
}

async function handleResultAction(action, onRerender) {
  if (action === "clear-shortlist") {
    _shortlist = [];
    if (onRerender) onRerender();
  } else if (action === "export-csv") {
    if (_shortlist.length === 0) return;
    function esc(v) { var s = v == null ? "" : String(v); return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    var rows = _shortlist.map(function (s, i) { return [i + 1, s.sid, s.name, s.category].map(esc).join(","); });
    var csv = "rank,signal_id,name,category\\n" + rows.join("\\n");
    var blob = new Blob([csv], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "shortlist-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast("CSV downloaded (" + _shortlist.length + " signals)");
  } else if (action === "send-builder") {
    if (_shortlist.length === 0) return;
    // Pre-populate builder stack with shortlist
    if (!state.catalog.all.length) await loadCatalog();
    _builderStack.selected = _shortlist.map(function (s) {
      return state.catalog.all.find(function (c) { return c.signal_agent_segment_id === s.sid; });
    }).filter(Boolean);
    switchTab("builder");
    showToast("Opened Builder with " + _builderStack.selected.length + " shortlisted signals");
  } else if (action === "activate-selected") {
    if (_shortlist.length === 0) return;
    showToast("Activating " + _shortlist.length + " signals\u2026");
    var results = await Promise.allSettled(_shortlist.map(function (s) {
      return callTool("activate_signal", { signal_agent_segment_id: s.sid, destination_platform: "mock_dsp" });
    }));
    var ok = results.filter(function (r) { return r.status === "fulfilled"; }).length;
    showToast("\u2713 Activated " + ok + "/" + _shortlist.length + ". See Activations tab for status.");
  }
}

// ─── Embedding Lab ───────────────────────────────────────────────────────
var _labLoaded = false;
async function ensureLab() {
  if (_labLoaded) return;
  _labLoaded = true;
  // Load embeddings AND catalog so select dropdowns show real signal names
  // (e.g. "Age 25-34" not the mangled "Age 25 34" from the humanizer).
  await Promise.all([loadEmbSignals(), state.catalog.all.length === 0 ? loadCatalog() : Promise.resolve()]);
  // Upgrade _embSignals names with real catalog names where available
  if (_embSignals && state.catalog.all && state.catalog.all.length) {
    _embSignals = _embSignals.map(function (s) {
      var real = state.catalog.all.find(function (c) { return c.signal_agent_segment_id === s.id; });
      return real ? Object.assign({}, s, { name: real.name }) : s;
    });
  }
  wireLabSubtabs();
  wireLabPlayground();
  wireLabArithmetic();
  wireLabAnalogy();
  wireLabNeighborhood();
}

function wireLabSubtabs() {
  document.querySelectorAll(".lab-subtab[data-lab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.dataset.lab;
      document.querySelectorAll(".lab-subtab[data-lab]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      document.querySelectorAll(".lab-subpanel[data-lab-panel]").forEach(function (p) {
        p.style.display = p.dataset.labPanel === target ? "" : "none";
      });
      if (target === "coverage") renderCoverageGaps();
    });
  });
}

// Playground — /ucp/query-vector
function wireLabPlayground() {
  var mode = "text";
  document.querySelectorAll("[data-pg-mode]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      mode = btn.dataset.pgMode;
      document.querySelectorAll("[data-pg-mode]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      document.getElementById("pg-text-shell").style.display = mode === "text" ? "" : "none";
      document.getElementById("pg-vector-shell").style.display = mode === "vector" ? "" : "none";
    });
  });
  document.querySelectorAll("#pg-sample-briefs .lab-chip").forEach(function (c) {
    c.addEventListener("click", function () { document.getElementById("pg-text").value = c.dataset.brief; });
  });
  document.getElementById("pg-run").addEventListener("click", async function () {
    var host = document.getElementById("pg-results");
    host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Computing cosines\u2026</div></div>';
    var body = { mode: mode, k: parseInt(document.getElementById("pg-k").value, 10) || 10 };
    if (mode === "text") body.text = document.getElementById("pg-text").value;
    else {
      var raw = document.getElementById("pg-vector").value.split(/[,\s]+/).map(function (s) { return parseFloat(s); }).filter(function (v) { return !isNaN(v); });
      body.vector = raw;
    }
    try {
      var r = await fetch("/ucp/query-vector", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      var data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || ("HTTP " + r.status));
      var rerenderPg = function () {
        host.innerHTML = renderActionBar("pg") + renderEmbResultList(data.results, "cosine", "pg");
        wireResultList(host, rerenderPg);
      };
      rerenderPg();
      document.getElementById("pg-explainer").innerHTML = renderChartExplainer({
        what: "Top-" + data.k + " catalog audiences most semantically similar to your query.",
        how: data.method + " (" + data.query_vector_source + "). Each result\u2019s cosine is the dot product of L2-normalized vectors. Use the bolt icon to activate any row directly, or check the boxes to bulk-activate.",
        read: "Higher cosine = stronger semantic match. Cosines above 0.5 are usually solid; below 0.2 are tenuous. Click a row to open its detail panel; check rows to add to the cross-tab shortlist.",
        limits: mode === "text" ? "Text mode uses a deterministic pseudo-hash vector \u2014 useful for demo but not as semantically rich as a real LLM embedding. POST mode=vector with your own vector for production quality." : "Vector mode: caller-provided vector. Ensure your vector is from the same space_id (" + data.space_id + ").",
      });
    } catch (e) {
      host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    }
  });
}

// Arithmetic — /ucp/arithmetic
var _arithTerms = [{ sign: "base", id: "", weight: 1 }, { sign: "plus", id: "", weight: 1 }];
function renderArithTerms() {
  var host = document.getElementById("arith-terms");
  if (!host) return;
  host.innerHTML = _arithTerms.map(function (t, i) {
    var options = (_embSignals || []).map(function (s) {
      return '<option value="' + escapeHtml(s.id) + '"' + (t.id === s.id ? ' selected' : '') + '>' + escapeHtml(s.name) + '</option>';
    }).join("");
    var signHtml = i === 0
      ? '<span class="arith-sign mono" style="min-width:40px">base</span>'
      : '<select class="arith-sign" data-idx="' + i + '"><option value="plus"' + (t.sign === "plus" ? ' selected' : '') + '>+</option><option value="minus"' + (t.sign === "minus" ? ' selected' : '') + '>\u2212</option></select>';
    return '<div class="arith-term">' +
      signHtml +
      '<input type="number" min="0" max="2" step="0.1" value="' + t.weight + '" class="arith-weight" data-idx="' + i + '"/>' +
      '<span>\u00d7</span>' +
      '<select class="arith-id" data-idx="' + i + '"><option value="">\u2014 pick signal \u2014</option>' + options + '</select>' +
      (i >= 1 ? '<button class="arith-remove" data-idx="' + i + '"><svg class="ico"><use href="#icon-close"/></svg></button>' : '') +
    '</div>';
  }).join("");
  host.querySelectorAll(".arith-sign").forEach(function (el) { el.addEventListener("change", function () { _arithTerms[parseInt(el.dataset.idx, 10)].sign = el.value; }); });
  host.querySelectorAll(".arith-weight").forEach(function (el) { el.addEventListener("input", function () { _arithTerms[parseInt(el.dataset.idx, 10)].weight = parseFloat(el.value) || 1; }); });
  host.querySelectorAll(".arith-id").forEach(function (el) { el.addEventListener("change", function () { _arithTerms[parseInt(el.dataset.idx, 10)].id = el.value; }); });
  host.querySelectorAll(".arith-remove").forEach(function (el) { el.addEventListener("click", function () { _arithTerms.splice(parseInt(el.dataset.idx, 10), 1); renderArithTerms(); }); });
}
function wireLabArithmetic() {
  renderArithTerms();
  document.getElementById("arith-add-term").addEventListener("click", function () {
    if (_arithTerms.length >= 6) { showToast("Max 6 terms", true); return; }
    _arithTerms.push({ sign: "plus", id: "", weight: 1 });
    renderArithTerms();
  });
  document.querySelectorAll(".lab-chip[data-preset]").forEach(function (c) {
    c.addEventListener("click", function () {
      var preset = c.dataset.preset;
      if (preset === "luxury_millennial") {
        _arithTerms = [{ sign: "base", id: "sig_high_income_households", weight: 1 }, { sign: "plus", id: "sig_age_25_34", weight: 1 }];
      } else if (preset === "cord_cutter_parents") {
        _arithTerms = [{ sign: "base", id: "sig_streaming_enthusiasts", weight: 1 }, { sign: "plus", id: "sig_age_35_44", weight: 1 }];
      } else if (preset === "affluent_minus_urban") {
        _arithTerms = [{ sign: "base", id: "sig_high_income_households", weight: 1 }, { sign: "minus", id: "sig_age_18_24", weight: 0.5 }];
      }
      renderArithTerms();
    });
  });
  document.getElementById("arith-run").addEventListener("click", async function () {
    var host = document.getElementById("arith-results");
    var expr = document.getElementById("arith-expression");
    host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Composing vectors\u2026</div></div>';
    var terms = _arithTerms.filter(function (t) { return t.id; });
    if (terms.length < 1) { host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Pick at least one signal</div></div>'; return; }
    var body = { plus: [], minus: [], weights: {}, k: parseInt(document.getElementById("arith-k").value, 10) || 10 };
    terms.forEach(function (t) {
      if (t.sign === "base") body.base = t.id;
      else if (t.sign === "plus") body.plus.push(t.id);
      else if (t.sign === "minus") body.minus.push(t.id);
      body.weights[t.id] = t.weight;
    });
    try {
      var r = await fetch("/ucp/arithmetic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      var data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || ("HTTP " + r.status));
      expr.innerHTML = '<div class="lab-expr-inner">' + escapeHtml(data.expression) + ' <span class="mono" style="color:var(--text-mut);margin-left:8px">pre-norm norm: ' + data.composed_vector_norm_before_normalize + '</span></div>';
      var rerenderAr = function () {
        host.innerHTML = renderActionBar("arith") + renderEmbResultList(data.results, "cosine", "arith");
        wireResultList(host, rerenderAr);
      };
      rerenderAr();
      document.getElementById("arith-explainer").innerHTML = renderChartExplainer({
        what: "Top audiences closest to the composed vector you built. Bolt icon on each row activates immediately; check rows to bulk-activate or send to Builder.",
        how: "Weighted sum of input vectors: base + \u03a3 (plus) \u2212 \u03a3 (minus), then L2-normalized. Results rank by cosine to the composed vector. Input signals excluded to prevent self-match.",
        read: "High-cosine results reflect the meaning combination you built. E.g., luxury + millennial \u2192 upscale young-adult audiences.",
        limits: "Works best with signals whose vectors are semantically coherent. Out-of-distribution combinations may produce low-confidence matches.",
      });
    } catch (e) {
      host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    }
  });
}

// Analogy — /ucp/analogy
function wireLabAnalogy() {
  var options = (_embSignals || []).map(function (s) { return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name) + '</option>'; }).join("");
  ["ana-a", "ana-b", "ana-c"].forEach(function (id) { var el = document.getElementById(id); if (el) el.innerHTML = '<option value="">\u2014 pick \u2014</option>' + options; });
  var algorithm = "3cos_add";
  document.querySelectorAll("[data-ana-algo]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      algorithm = btn.dataset.anaAlgo;
      document.querySelectorAll("[data-ana-algo]").forEach(function (b) { b.classList.toggle("active", b === btn); });
    });
  });
  document.getElementById("ana-run").addEventListener("click", async function () {
    var host = document.getElementById("ana-results");
    var a = document.getElementById("ana-a").value, b = document.getElementById("ana-b").value, c = document.getElementById("ana-c").value;
    if (!a || !b || !c) { host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Pick A, B, and C</div></div>'; return; }
    host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Solving for D\u2026</div></div>';
    try {
      var r = await fetch("/ucp/analogy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: a, b: b, c: c, algorithm: algorithm, k: 10 }) });
      var data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || ("HTTP " + r.status));
      var analogyHeader = '<div class="lab-expr-inner" style="margin-bottom:10px">' + escapeHtml(data.analogy) + ' <span class="mono" style="color:var(--text-mut);margin-left:8px">algorithm: ' + data.algorithm + '</span></div>';
      var rerenderAna = function () {
        host.innerHTML = analogyHeader + renderActionBar("analogy") + renderEmbResultList(data.results, "cosine_or_score", "analogy");
        wireResultList(host, rerenderAna);
      };
      rerenderAna();
      document.getElementById("ana-explainer").innerHTML = renderChartExplainer({
        what: "Top candidate signals filling the analogy A:B::C:? \u2014 click the bolt on any row to activate, or check rows to bulk-activate.",
        how: data.algorithm === "3cos_add" ? "3CosAdd: D = L2-normalize(B \u2212 A + C), then rank by cosine. The rotation direction from A to B is applied to C." : "3CosMul (Levy & Goldberg 2014): rank by (cos(x,B)+1) \u00d7 (cos(x,C)+1) / (cos(x,A)+\u03b5+1). More robust to degenerate analogies.",
        read: "Top result is the best vector-space analogy. High scores = parallel direction between (A\u2192B) and (C\u2192result).",
        limits: "Works best when the A\u2192B relation is simple (tier upgrade, demographic shift). Complex relations may not generalize.",
      });
    } catch (e) {
      host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    }
  });
}

// Neighborhood — /ucp/neighborhood
function wireLabNeighborhood() {
  var options = (_embSignals || []).map(function (s) { return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name) + '</option>'; }).join("");
  var sel = document.getElementById("nbh-seed");
  if (sel) sel.innerHTML = '<option value="">\u2014 pick \u2014</option>' + options;
  document.getElementById("nbh-run").addEventListener("click", async function () {
    var host = document.getElementById("nbh-results");
    var seed = document.getElementById("nbh-seed").value;
    if (!seed) { host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Pick a seed signal</div></div>'; return; }
    host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Exploring neighborhood\u2026</div></div>';
    try {
      var r = await fetch("/ucp/neighborhood", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signal_id: seed, k: parseInt(document.getElementById("nbh-k").value, 10) || 10 }) });
      var data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || ("HTTP " + r.status));
      var statsHtml = '<div class="nbh-stats">' +
        '<div class="nbh-stat"><div class="nbh-stat-label">Local density</div><div class="nbh-stat-val">' + data.local_density + '</div></div>' +
        '<div class="nbh-stat"><div class="nbh-stat-label">Distance to centroid</div><div class="nbh-stat-val">' + data.catalog_centroid_distance + '</div></div>' +
        '<div class="nbh-stat"><div class="nbh-stat-label">Role</div><div class="nbh-stat-val">' + (data.is_prototypical ? "prototypical" : "edge case") + '</div></div>' +
      '</div>';
      var rerenderNbh = function () {
        host.innerHTML = statsHtml + renderActionBar("nbh") + renderEmbResultList(data.neighbors, "cosine", "nbh");
        wireResultList(host, rerenderNbh);
      };
      rerenderNbh();
      document.getElementById("nbh-explainer").innerHTML = renderChartExplainer({
        what: "The k nearest neighbors of your seed signal, plus local density stats. Row bolt activates immediately; checkboxes add to cross-tab shortlist.",
        how: "Cosine-rank across the 26-vector embedding store. Local density = mean cosine to top-k neighbors (0..1). Centroid distance = 1 \u2212 cos(signal, catalog_centroid).",
        read: "High local density = tight cluster (alternatives). Low centroid distance = \u201cprototypical\u201d of the catalog; high = specialty/edge audience.",
        limits: "Computed over the 26 embedded signals only. Future: extend to full 520-signal catalog via incremental embedding.",
      });
      host.querySelectorAll(".emb-result-row").forEach(function (row) {
        row.addEventListener("click", function () { openDetailHydrated(row.dataset.sid); });
      });
    } catch (e) {
      host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    }
  });
}

// Coverage gaps — /analytics/coverage-gaps
async function renderCoverageGaps() {
  var host = document.getElementById("cov-viz");
  if (!host || host.dataset.loaded) return;
  host.dataset.loaded = "1";
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Computing gap heatmap\u2026</div></div>';
  try {
    var r = await fetch("/analytics/coverage-gaps");
    var data = await r.json();
    var W = 600, H = 500;
    var cellW = W / data.grid_w, cellH = H / data.grid_h;
    var cellMap = {};
    (data.cells_with_points || []).forEach(function (c) { cellMap[c.row + "_" + c.col] = c; });
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';
    for (var r2 = 0; r2 < data.grid_h; r2++) {
      for (var c2 = 0; c2 < data.grid_w; c2++) {
        var key = r2 + "_" + c2;
        var cell = cellMap[key];
        var count = cell ? cell.count : 0;
        var density = cell ? cell.density : 0;
        var fill;
        if (count === 0) {
          fill = "rgba(255, 122, 92, 0.15)";  // warm gap
        } else {
          var intensity = 0.3 + density * 0.7;
          fill = "rgba(79, 142, 255, " + intensity.toFixed(3) + ")";
        }
        svg += '<rect x="' + (c2 * cellW) + '" y="' + (r2 * cellH) + '" width="' + cellW + '" height="' + cellH + '" fill="' + fill + '" stroke="var(--bg-surface)" stroke-width="0.5">' +
          '<title>cell (' + r2 + ',' + c2 + '): ' + count + ' signals, density=' + density.toFixed(2) + '</title>' +
        '</rect>';
      }
    }
    // Highlight top-3 gap cells
    (data.gap_cells || []).slice(0, 3).forEach(function (g) {
      var cx = (g.col + 0.5) * cellW, cy = (g.row + 0.5) * cellH;
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (Math.min(cellW, cellH) * 0.35) + '" fill="none" stroke="var(--warn)" stroke-width="2" stroke-dasharray="4,2"/>';
      svg += '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" font-size="10" fill="var(--warn)" font-weight="600">gap</text>';
    });
    svg += '</svg>';
    host.innerHTML = svg +
      '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Coverage score</div><div class="lab-stat-val">' + Math.round(data.summary.coverage_score * 100) + '%</div></div>' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Empty cells</div><div class="lab-stat-val">' + data.summary.empty_cells + ' / ' + data.summary.total_cells + '</div></div>' +
      '</div>';
    document.getElementById("cov-explainer").innerHTML = renderChartExplainer({
      what: "A 12\u00d712 grid overlay on the 2D embedding projection. Each cell is colored by how many audiences occupy it.",
      how: "Projects 26 embedded vectors to 2D via JL random projection, bins them into a 12\u00d712 grid. Warm/orange cells = gaps (below-median density). Top-3 gaps are circled and labeled.",
      read: "Blue dense cells = catalog is saturated here. Orange gaps = \u201cmarketplace opportunities\u201d \u2014 concept regions we could expand into via new signals or partners.",
      limits: "Operates on 26 embedded reference signals, not the full 520-signal catalog. Gaps are approximate.",
    });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    host.dataset.loaded = "";
  }
}

// ─── Portfolio ───────────────────────────────────────────────────────────
var _portLoaded = false;
async function ensurePortfolio() {
  if (_portLoaded) return;
  _portLoaded = true;
  wirePortSubtabs();
  wirePortOptimizer();
  wirePortFromBrief();
  renderPortPareto();
  renderPortLorenz();
}
function wirePortSubtabs() {
  document.querySelectorAll(".lab-subtab[data-port]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.dataset.port;
      document.querySelectorAll(".lab-subtab[data-port]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      document.querySelectorAll(".lab-subpanel[data-port-panel]").forEach(function (p) {
        p.style.display = p.dataset.portPanel === target ? "" : "none";
      });
    });
  });
}
async function renderPortPareto() {
  var host = document.getElementById("port-pareto-viz");
  try {
    // Pull both the Pareto frontier AND the full catalog so we can show
    // dominated points as context behind the highlighted frontier.
    if (state.catalog.all.length === 0) await loadCatalog();
    var r = await fetch("/portfolio/pareto");
    var data = await r.json();
    var frontier = data.frontier || [];
    if (!frontier.length) { host.innerHTML = '<div class="empty-state"><div class="empty-title">No frontier points</div></div>'; return; }
    var frontierIds = new Set(frontier.map(function (p) { return p.signal_id; }));
    // Build all-points list from catalog (dominated + frontier)
    var allPoints = state.catalog.all
      .filter(function (s) { return (s.estimated_audience_size || 0) > 0 && fmtCPM(s).cpm > 0; })
      .map(function (s) {
        var cpm = fmtCPM(s).cpm;
        var specificity = s.category_type === "purchase_intent" ? 0.85
          : s.category_type === "composite" ? 0.80
          : s.category_type === "interest" ? 0.65
          : s.category_type === "demographic" ? 0.45 : 0.40;
        return {
          signal_id: s.signal_agent_segment_id,
          name: s.name,
          reach: s.estimated_audience_size,
          cpm: cpm,
          specificity: specificity,
          category: s.category_type,
          on_frontier: frontierIds.has(s.signal_agent_segment_id),
        };
      });
    if (!allPoints.length) allPoints = frontier.map(function (p) { return Object.assign({}, p, { on_frontier: true }); });

    var reaches = allPoints.map(function (p) { return p.reach; });
    var cpms = allPoints.map(function (p) { return p.cpm; });
    var rMinLog = Math.log10(Math.max(1, Math.min.apply(null, reaches)) + 1);
    var rMaxLog = Math.log10(Math.max.apply(null, reaches) + 1);
    var cMin = 0;
    var cMax = Math.max.apply(null, cpms);
    cMax = Math.ceil(cMax * 1.1);
    // Expand a bit so dots at extremes aren't clipped
    var xPad = (rMaxLog - rMinLog) * 0.05 || 0.5;
    rMinLog = Math.max(0, rMinLog - xPad);
    rMaxLog = rMaxLog + xPad;

    var W = 760, H = 460, padL = 60, padR = 28, padT = 24, padB = 52;
    var colorMap = { demographic: "#4f8eff", interest: "#8b6eff", purchase_intent: "#ff7a5c", geo: "#2bd4a0", composite: "#ffcb5c" };
    function sx(reach) { return padL + (Math.log10(reach + 1) - rMinLog) / (rMaxLog - rMinLog + 1e-9) * (W - padL - padR); }
    function sy(cpm)   { return H - padB - (cpm - cMin) / (cMax - cMin + 1e-9) * (H - padT - padB); }

    // X tick marks: log scale, so use round powers of 10 between min and max reach
    var xTicks = [];
    var decStart = Math.floor(rMinLog);
    var decEnd = Math.ceil(rMaxLog);
    for (var d = decStart; d <= decEnd; d++) {
      var v = Math.pow(10, d);
      if (Math.log10(v + 1) >= rMinLog - 0.01 && Math.log10(v + 1) <= rMaxLog + 0.01) {
        xTicks.push({ v: v, label: v >= 1e9 ? (v / 1e9) + "B" : v >= 1e6 ? (v / 1e6) + "M" : v >= 1e3 ? (v / 1e3) + "K" : String(v) });
      }
    }
    // Y tick marks: 5 evenly-spaced round dollar values
    var yTicks = [];
    for (var i = 0; i <= 5; i++) {
      var yv = cMin + (cMax - cMin) * i / 5;
      yTicks.push({ v: yv, label: "$" + yv.toFixed(yv >= 10 ? 0 : 1) });
    }

    var gridlines = '';
    xTicks.forEach(function (t) {
      var x = sx(t.v);
      gridlines += '<line x1="' + x + '" y1="' + padT + '" x2="' + x + '" y2="' + (H - padB) + '" stroke="var(--border)" stroke-opacity="0.35" stroke-dasharray="2,3"/>';
      gridlines += '<text x="' + x + '" y="' + (H - padB + 16) + '" text-anchor="middle" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">' + t.label + '</text>';
    });
    yTicks.forEach(function (t) {
      var y = sy(t.v);
      gridlines += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="var(--border)" stroke-opacity="0.35" stroke-dasharray="2,3"/>';
      gridlines += '<text x="' + (padL - 8) + '" y="' + (y + 3) + '" text-anchor="end" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">' + t.label + '</text>';
    });

    // Draw dominated first (behind), then frontier (in front, gold halo)
    function dot(p, isFrontier) {
      var radius = isFrontier ? (4.5 + (p.specificity || 0) * 5) : 3;
      var color = colorMap[p.category] || "#8892a6";
      var stroke = isFrontier ? 'stroke="gold" stroke-width="1.3"' : 'stroke="rgba(255,255,255,0.1)" stroke-width="0.5"';
      var op = isFrontier ? 0.9 : 0.35;
      return '<circle cx="' + sx(p.reach).toFixed(1) + '" cy="' + sy(p.cpm).toFixed(1) + '" r="' + radius.toFixed(1) + '" fill="' + color + '" fill-opacity="' + op + '" ' + stroke + ' data-sid="' + escapeHtml(p.signal_id) + '" class="' + (isFrontier ? 'pareto-front' : 'pareto-dom') + '">' +
        '<title>' + escapeHtml(p.name) + ' · reach=' + (p.reach / 1e6).toFixed(1) + 'M · CPM=$' + p.cpm.toFixed(2) + ' · spec=' + (p.specificity || 0).toFixed(2) + (isFrontier ? ' · PARETO-OPTIMAL' : '') + '</title>' +
      '</circle>';
    }
    var dominated = allPoints.filter(function (p) { return !p.on_frontier; }).map(function (p) { return dot(p, false); }).join("");
    var front = allPoints.filter(function (p) { return p.on_frontier; }).map(function (p) { return dot(p, true); }).join("");

    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" class="pareto-svg">' +
      gridlines +
      // Axes
      '<line x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '" stroke="var(--border)" stroke-width="1"/>' +
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (H - padB) + '" stroke="var(--border)" stroke-width="1"/>' +
      // Axis titles
      '<text x="' + ((padL + W - padR) / 2) + '" y="' + (H - 8) + '" text-anchor="middle" fill="var(--text)" font-size="11" font-weight="600">Reach (log scale, unique audience)</text>' +
      '<text x="16" y="' + ((padT + H - padB) / 2) + '" text-anchor="middle" fill="var(--text)" font-size="11" font-weight="600" transform="rotate(-90, 16, ' + ((padT + H - padB) / 2) + ')">CPM ($)</text>' +
      dominated + front +
    '</svg>' +
    // Summary cards
    '<div class="pareto-stats">' +
      '<div class="lab-stat-card"><div class="lab-stat-label">Total signals</div><div class="lab-stat-val">' + allPoints.length + '</div></div>' +
      '<div class="lab-stat-card"><div class="lab-stat-label">On frontier</div><div class="lab-stat-val" style="color:gold">' + frontier.length + '</div></div>' +
      '<div class="lab-stat-card"><div class="lab-stat-label">Most reach</div><div class="lab-stat-val" style="font-size:13px">' + escapeHtml(data.summary.most_reach || "—") + '</div></div>' +
      '<div class="lab-stat-card"><div class="lab-stat-label">Lowest CPM</div><div class="lab-stat-val" style="font-size:13px">' + escapeHtml(data.summary.lowest_cost || "—") + '</div></div>' +
    '</div>' +
    '<div class="pareto-legend">' +
      Object.keys(colorMap).map(function (k) { return '<span class="pl-item"><span class="pl-dot" style="background:' + colorMap[k] + '"></span>' + k.replace("_", " ") + '</span>'; }).join('') +
      '<span class="pl-item" style="margin-left:auto"><span class="pl-dot" style="background:transparent;border:1.5px solid gold"></span>Pareto-optimal</span>' +
      '<span class="pl-item"><span class="pl-dot" style="background:#8892a6;opacity:0.45"></span>dominated</span>' +
    '</div>';
    document.getElementById("port-pareto-explainer").innerHTML = renderChartExplainer({
      what: "Every signal in the catalog plotted as reach (log-scale X) vs CPM (Y). Gold-outlined dots are Pareto-efficient — no other signal beats them on all three of {more reach, less CPM, more specificity}.",
      how: "A signal is Pareto-efficient if no other signal has \u2265 reach AND \u2264 CPM AND \u2265 specificity (with at least one strict inequality). Dot radius \u221d specificity score; color = category type. Frontier: " + frontier.length + " of " + allPoints.length + " candidates.",
      read: "Upper-left = premium-CPM niche audiences. Lower-right = cheap broad reach. Gold dots are the only rational picks — dominated dots are strictly worse than at least one gold dot. Click any dot to open its detail panel.",
      limits: "Static snapshot. Ignores temporal availability and deployment-platform compatibility. Specificity is heuristic (category-derived).",
    });
    host.querySelectorAll("circle").forEach(function (el) { if (el.dataset.sid) el.addEventListener("click", function () { openDetailHydrated(el.dataset.sid); }); });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Could not load frontier: ' + escapeHtml(String(e.message || e)) + '</div></div>';
  }
}
function wirePortOptimizer() {
  document.getElementById("opt-run").addEventListener("click", async function () {
    var host = document.getElementById("opt-results");
    host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Running greedy solver\u2026</div></div>';
    var body = {
      budget: parseFloat(document.getElementById("opt-budget").value) || 250000,
      max_signals: parseInt(document.getElementById("opt-max-sig").value, 10) || 6,
    };
    var target = parseFloat(document.getElementById("opt-target").value);
    if (target > 0) body.target_reach = target;
    try {
      var r = await fetch("/portfolio/optimize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      var data = await r.json();
      if (data.picked.length === 0) { host.innerHTML = '<div class="empty-state"><div class="empty-title">No signals fit budget</div></div>'; return; }
      // Waterfall with per-row activate + bulk action bar
      var maxMarg = Math.max.apply(null, data.picked.map(function (p) { return p.marginal_reach; }));
      var wf = '<div class="opt-waterfall">' + data.picked.map(function (p, i) {
        var pct = maxMarg > 0 ? (p.marginal_reach / maxMarg) * 100 : 0;
        return '<div class="opt-row" data-sid="' + escapeHtml(p.signal_id) + '">' +
          '<div class="opt-rank">' + (i + 1) + '</div>' +
          '<div class="opt-name">' + escapeHtml(p.name) + '<br><span class="mono" style="font-size:10.5px;color:var(--text-mut)">$' + p.cost.toFixed(0) + ' \u00b7 CPM $' + p.cpm.toFixed(2) + '</span></div>' +
          '<div class="opt-bar"><div class="opt-bar-fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
          '<div class="opt-margin mono">+' + (p.marginal_reach / 1e6).toFixed(2) + 'M</div>' +
          '<button class="err-activate" data-opt-activate="' + escapeHtml(p.signal_id) + '" title="Activate to mock_dsp"><svg class="ico"><use href="#icon-bolt"/></svg></button>' +
        '</div>';
      }).join("") + '</div>';
      var summary = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Total cost</div><div class="lab-stat-val">$' + data.total_cost.toLocaleString() + '</div></div>' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Unique reach</div><div class="lab-stat-val">' + (data.total_unique_reach / 1e6).toFixed(1) + 'M</div></div>' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Efficiency</div><div class="lab-stat-val">' + data.efficiency.toLocaleString() + '/k$</div></div>' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Overlap waste</div><div class="lab-stat-val">' + (data.overlap_waste / 1e6).toFixed(1) + 'M</div></div>' +
      '</div>';
      var actionBar = '<div class="campaign-cta">' +
        '<div class="campaign-cta-info"><strong>' + data.picked.length + '-signal portfolio</strong> \u2014 budget $' + data.total_cost.toLocaleString() + ', reach ' + (data.total_unique_reach / 1e6).toFixed(1) + 'M</div>' +
        '<button class="btn-secondary" data-opt-action="export" style="padding:6px 14px">Export plan</button>' +
        '<button class="btn-secondary" data-opt-action="builder" style="padding:6px 14px">Open in Builder</button>' +
        '<button class="btn-primary" data-opt-action="activate-all" style="padding:6px 14px"><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate portfolio</span></button>' +
      '</div>';
      host.innerHTML = summary + actionBar + wf;
      // Wire
      host.querySelectorAll('[data-opt-activate]').forEach(function (b) {
        b.addEventListener('click', async function (e) {
          e.stopPropagation();
          var sid = b.dataset.optActivate;
          b.disabled = true;
          try { await callTool("activate_signal", { signal_agent_segment_id: sid, destination_platform: "mock_dsp" }); showToast("\u2713 Activated"); b.classList.add("err-activated"); }
          catch (err) { showToast("Failed: " + err.message, true); b.disabled = false; }
        });
      });
      host.querySelectorAll('[data-opt-action]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var act = btn.dataset.optAction;
          if (act === "activate-all") {
            showToast("Activating portfolio (" + data.picked.length + " signals)\u2026");
            var res = await Promise.allSettled(data.picked.map(function (p) { return callTool("activate_signal", { signal_agent_segment_id: p.signal_id, destination_platform: "mock_dsp" }); }));
            var ok = res.filter(function (x) { return x.status === "fulfilled"; }).length;
            showToast("\u2713 Portfolio activated: " + ok + "/" + data.picked.length);
          } else if (act === "export") {
            function esc(v) { var s = v == null ? "" : String(v); return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
            var hdr = "rank,signal_id,name,cost,cpm,marginal_reach,cumulative_reach";
            var rws = data.picked.map(function (p, i) { return [i + 1, p.signal_id, p.name, p.cost, p.cpm, p.marginal_reach, p.cumulative_reach].map(esc).join(","); });
            var blob = new Blob([hdr + "\\n" + rws.join("\\n")], { type: "text/csv" });
            var url = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = url; a.download = "portfolio-optimized.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            showToast("Portfolio exported");
          } else if (act === "builder") {
            if (!state.catalog.all.length) await loadCatalog();
            _builderStack.selected = data.picked.map(function (p) {
              return state.catalog.all.find(function (s) { return s.signal_agent_segment_id === p.signal_id; });
            }).filter(Boolean);
            switchTab("builder");
            showToast("Opened in Builder");
          }
        });
      });
      host.querySelectorAll('.opt-row').forEach(function (row) {
        row.addEventListener('click', function (e) { if (e.target.closest('button')) return; if (row.dataset.sid) openDetailHydrated(row.dataset.sid); });
      });
      document.getElementById("opt-explainer").innerHTML = renderChartExplainer({
        what: "Greedy portfolio: signals picked one at a time, each iteration the one adding the most unique reach. <strong>Activate portfolio</strong> fires them all in parallel.",
        how: "At each step: for each candidate not yet picked, compute marginal reach = reach \u2212 \u03a3 (jaccard\u00d7min_reach) across already-picked. Pick the one maximizing marginal reach, subject to budget. Cost = reach \u00d7 CPM / 1000.",
        read: "Earlier tall bars = high-value standalones. Later shorter bars = saturating \u2014 overlap with existing picks eats into gains. Click any row's bolt icon to activate just that one; \u201cActivate portfolio\u201d fires everything.",
        limits: "Heuristic Jaccard for overlap; real deduplication needs cleanroom-matched actual audience membership.",
      });
    } catch (e) {
      host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    }
  });
}
async function renderPortLorenz() {
  var host = document.getElementById("port-lorenz-viz");
  try {
    var r = await fetch("/analytics/lorenz?group=vertical");
    var data = await r.json();
    // Render small multiples: one mini chart per top-6 slice + overall
    var picks = (data.slices || []).slice(0, 6);
    var cards = picks.map(function (s) { return renderLorenzCard(s); }).join("");
    var overall = renderLorenzCard({ group: "OVERALL", signal_count: data.overall.signal_count, lorenz: data.overall.lorenz, gini: data.overall.gini, interpretation: data.overall.interpretation });
    host.innerHTML = '<div class="lorenz-grid">' + overall + cards + '</div>';
    document.getElementById("port-lorenz-explainer").innerHTML = renderChartExplainer({
      what: "Catalog concentration per vertical. How evenly audience reach is distributed across signals in each group.",
      how: "Lorenz curve: cumulative signal share (x) vs cumulative audience share (y). Gini = 2 \u00d7 area between the curve and y=x. 0 = perfect equality, 1 = one signal owns everything.",
      read: "Gini < 0.2 = balanced \u2014 many comparable signals. Gini > 0.5 = top-heavy \u2014 consolidate or add niche coverage.",
      limits: "Based on declared estimated_audience_size; does not capture true measured reach.",
    });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
  }
}
function renderLorenzCard(s) {
  var W = 200, H = 140, pad = 20;
  var pts = (s.lorenz || []).map(function (p) { return pad + p.x * (W - 2 * pad) + "," + (H - pad - p.y * (H - 2 * pad)); }).join(" ");
  return '<div class="lorenz-card">' +
    '<div class="lorenz-title">' + escapeHtml(s.group) + ' <span class="lorenz-gini">Gini ' + s.gini.toFixed(2) + '</span></div>' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '">' +
      '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + pad + '" stroke="var(--text-mut)" stroke-dasharray="3,2" stroke-width="1"/>' +
      '<polyline fill="none" stroke="var(--accent)" stroke-width="1.5" points="' + pts + '"/>' +
    '</svg>' +
    '<div class="lorenz-count mono">' + s.signal_count + ' signals</div>' +
  '</div>';
}
function wirePortFromBrief() {
  document.getElementById("brief-run").addEventListener("click", async function () {
    var host = document.getElementById("brief-results");
    var brief = document.getElementById("brief-text").value.trim();
    if (!brief) { host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Paste a brief first</div></div>'; return; }
    host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Composing portfolio\u2026</div></div>';
    try {
      var r = await fetch("/portfolio/from-brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: brief, budget: parseFloat(document.getElementById("brief-budget").value) || 250000 }) });
      var data = await r.json();
      var rows = data.portfolio.map(function (p) {
        return '<div class="brief-row" data-sid="' + escapeHtml(p.signal_id) + '">' +
          '<label class="err-check" title="Add to shortlist"><input type="checkbox" data-brief-sl="' + escapeHtml(p.signal_id) + '"' + (shortlistHas(p.signal_id) ? ' checked' : '') + '/></label>' +
          '<div class="brief-rank">' + p.rank + '</div>' +
          '<div class="brief-main"><div class="brief-name">' + escapeHtml(p.name) + '</div><div class="brief-reason mono">' + escapeHtml(p.reasoning) + '</div></div>' +
          '<div class="brief-alloc mono">' + p.allocation_pct + '%</div>' +
          '<button class="err-activate" data-brief-activate="' + escapeHtml(p.signal_id) + '" title="Activate to mock_dsp"><svg class="ico"><use href="#icon-bolt"/></svg></button>' +
        '</div>';
      }).join("");
      // Primary CTA: Activate entire campaign — the "what do I do now" answer
      var campaignBar =
        '<div class="campaign-cta">' +
          '<div class="campaign-cta-info"><strong>' + data.portfolio.length + '-signal campaign</strong> composed from your brief. Total reach ' + (data.total_unique_reach / 1e6).toFixed(1) + 'M at $' + data.total_cost.toLocaleString() + '.</div>' +
          '<button class="btn-secondary" data-brief-action="export" style="padding:6px 14px">Export plan</button>' +
          '<button class="btn-secondary" data-brief-action="builder" style="padding:6px 14px">Open in Builder</button>' +
          '<button class="btn-primary" data-brief-action="activate-all" style="padding:6px 14px"><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate campaign</span></button>' +
        '</div>';
      host.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Total cost</div><div class="lab-stat-val">$' + data.total_cost.toLocaleString() + '</div></div>' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Unique reach</div><div class="lab-stat-val">' + (data.total_unique_reach / 1e6).toFixed(1) + 'M</div></div>' +
        '<div class="lab-stat-card"><div class="lab-stat-label">Candidates</div><div class="lab-stat-val">' + data.candidates_from_embedding + '</div></div>' +
      '</div>' + campaignBar + rows;
      // Wire brief-level actions
      host.querySelectorAll('[data-brief-activate]').forEach(function (b) {
        b.addEventListener('click', async function (e) {
          e.stopPropagation();
          var sid = b.dataset.briefActivate;
          b.disabled = true;
          try { await callTool("activate_signal", { signal_agent_segment_id: sid, destination_platform: "mock_dsp" }); showToast("\u2713 Activated " + sid); b.classList.add("err-activated"); }
          catch (err) { showToast("Failed: " + err.message, true); b.disabled = false; }
        });
      });
      host.querySelectorAll('[data-brief-sl]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var sid = cb.dataset.briefSl;
          var row = cb.closest('.brief-row');
          var item = data.portfolio.find(function (p) { return p.signal_id === sid; });
          shortlistToggle(sid, item ? item.name : sid, "");
          showToast(shortlistHas(sid) ? "Added to shortlist" : "Removed from shortlist");
        });
      });
      host.querySelectorAll('[data-brief-action]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var act = btn.dataset.briefAction;
          if (act === "activate-all") {
            showToast("Activating " + data.portfolio.length + " signals\u2026");
            var res = await Promise.allSettled(data.portfolio.map(function (p) {
              return callTool("activate_signal", { signal_agent_segment_id: p.signal_id, destination_platform: "mock_dsp" });
            }));
            var ok = res.filter(function (x) { return x.status === "fulfilled"; }).length;
            showToast("\u2713 Campaign activated: " + ok + "/" + data.portfolio.length + ". Check Activations tab.");
          } else if (act === "export") {
            function esc(v) { var s = v == null ? "" : String(v); return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
            var hdr = "rank,signal_id,name,allocation_pct,cost,marginal_reach";
            var rws = data.portfolio.map(function (p) { return [p.rank, p.signal_id, p.name, p.allocation_pct, p.cost, p.marginal_reach].map(esc).join(","); });
            var blob = new Blob([hdr + "\\n" + rws.join("\\n")], { type: "text/csv" });
            var url = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = url; a.download = "campaign-plan.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            showToast("Plan exported as CSV");
          } else if (act === "builder") {
            if (!state.catalog.all.length) await loadCatalog();
            _builderStack.selected = data.portfolio.map(function (p) {
              return state.catalog.all.find(function (s) { return s.signal_agent_segment_id === p.signal_id; });
            }).filter(Boolean);
            switchTab("builder");
            showToast("Opened Builder with " + _builderStack.selected.length + " signals");
          }
        });
      });
      document.getElementById("brief-explainer").innerHTML = renderChartExplainer({
        what: "A complete signal portfolio generated from your campaign brief \u2014 ready to activate.",
        how: "1. Brief text \u2192 pseudo-vector via djb2 hash. 2. Top-30 catalog matches by cosine. 3. Greedy marginal-reach selection within budget. 4. Allocation % = pick cost / total cost.",
        read: "<strong>Activate campaign</strong> fires all signals to mock_dsp in parallel. <strong>Open in Builder</strong> loads the set into the rule-based builder for tweaking. <strong>Export plan</strong> gives a CSV for sharing.",
        limits: "Demo pseudo-vectorization \u2014 a real production pipeline would embed via OpenAI / Cohere / Anthropic for higher-fidelity matches.",
      });
    } catch (e) {
      host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
    }
  });
}

// ─── Seasonality ─────────────────────────────────────────────────────────
var _seaLoaded = false;
async function ensureSeasonality() {
  if (_seaLoaded) return;
  _seaLoaded = true;
  document.getElementById("sea-run").addEventListener("click", renderSeaRanking);
  renderSeaHeatmap();
}
async function renderSeaRanking() {
  var host = document.getElementById("sea-results");
  var w = document.getElementById("sea-window").value;
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Ranking\u2026</div></div>';
  try {
    var r = await fetch("/analytics/best-for?window=" + encodeURIComponent(w));
    var data = await r.json();
    var topSignals = (data.top || []).slice(0, 15);
    var rerenderSea = function () {
      var rows = topSignals.map(function (s, i) {
        return '<div class="sea-row" data-sid="' + escapeHtml(s.signal_id) + '">' +
          '<label class="err-check" title="Add to shortlist"><input type="checkbox" data-sea-sl="' + escapeHtml(s.signal_id) + '"' + (shortlistHas(s.signal_id) ? ' checked' : '') + '/></label>' +
          '<div class="sea-rank">' + (i + 1) + '</div>' +
          '<div class="sea-name">' + escapeHtml(s.name) + '<br><span class="mono" style="font-size:10.5px;color:var(--text-mut)">reach ' + (s.reach / 1e6).toFixed(1) + 'M \u00b7 spec ' + s.specificity + '</span></div>' +
          '<div class="sea-mult mono">\u00d7' + s.window_multiplier + '</div>' +
          '<button class="err-activate" data-sea-activate="' + escapeHtml(s.signal_id) + '" title="Activate to mock_dsp"><svg class="ico"><use href="#icon-bolt"/></svg></button>' +
        '</div>';
      }).join("");
      var topBar = '<div class="campaign-cta" style="margin-bottom:10px">' +
        '<div class="campaign-cta-info">Top ' + topSignals.length + ' signals for ' + escapeHtml(data.window) + '. Click bolt to activate any row.</div>' +
        '<button class="btn-primary" data-sea-action="activate-top5" style="padding:5px 12px;font-size:11.5px"><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate top 5</span></button>' +
      '</div>';
      host.innerHTML = topBar + rows;
      host.querySelectorAll('[data-sea-sl]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var sid = cb.dataset.seaSl;
          var item = topSignals.find(function (s) { return s.signal_id === sid; });
          shortlistToggle(sid, item ? item.name : sid, "");
        });
      });
      host.querySelectorAll('[data-sea-activate]').forEach(function (b) {
        b.addEventListener('click', async function (e) {
          e.stopPropagation();
          var sid = b.dataset.seaActivate;
          b.disabled = true;
          try { await callTool("activate_signal", { signal_agent_segment_id: sid, destination_platform: "mock_dsp" }); showToast("\u2713 Activated"); b.classList.add("err-activated"); }
          catch (err) { showToast("Failed: " + err.message, true); b.disabled = false; }
        });
      });
      host.querySelectorAll('[data-sea-action="activate-top5"]').forEach(function (b) {
        b.addEventListener('click', async function () {
          var picks = topSignals.slice(0, 5);
          showToast("Activating top 5 for " + data.window + "\u2026");
          await Promise.allSettled(picks.map(function (s) { return callTool("activate_signal", { signal_agent_segment_id: s.signal_id, destination_platform: "mock_dsp" }); }));
          showToast("\u2713 Top 5 activated to mock_dsp");
        });
      });
      host.querySelectorAll('.sea-row').forEach(function (row) {
        row.addEventListener('click', function (e) { if (e.target.closest('input, button, label')) return; openDetailHydrated(row.dataset.sid); });
      });
    };
    rerenderSea();
    document.getElementById("sea-explainer").innerHTML = renderChartExplainer({
      what: "Signals ranked for the selected time window, with one-click activate per row + bulk top-5 activate.",
      how: "score = window_avg_seasonality \u00d7 specificity \u00d7 log_reach. Seasonality multiplier averages the monthly values across the chosen months.",
      read: "Top rows peak in the selected window. Use as a forward-looking plan ranker.",
      limits: "Seasonality synthesized from signal name/category hints (deterministic).",
    });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div></div>';
  }
}
async function renderSeaHeatmap() {
  var host = document.getElementById("sea-heatmap");
  try {
    var r = await fetch("/analytics/seasonality");
    var data = await r.json();
    var rows = (data.profiles || []).slice(0, 30);
    var months = ["J","F","M","A","M","J","J","A","S","O","N","D"];
    var cellW = 24, rowH = 20, nameCol = 220;
    var W = nameCol + 12 * cellW + 20;
    var H = rows.length * rowH + 30;
    var html = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMinYMin meet">';
    months.forEach(function (m, i) {
      html += '<text x="' + (nameCol + i * cellW + cellW / 2) + '" y="14" text-anchor="middle" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">' + m + '</text>';
    });
    rows.forEach(function (r2, idx) {
      var y = 24 + idx * rowH;
      html += '<text x="' + (nameCol - 8) + '" y="' + (y + rowH / 2 + 3) + '" text-anchor="end" fill="var(--text)" font-size="10.5">' + escapeHtml(r2.name.slice(0, 30)) + '</text>';
      (r2.monthly || []).forEach(function (m, i) {
        var intensity = Math.min(1, Math.max(0, (m - 0.5) / 1.5));
        var fill = "rgba(79, 142, 255, " + (0.15 + intensity * 0.75).toFixed(3) + ")";
        if (m >= 1.3) fill = "rgba(255, 122, 92, " + ((m - 1) * 0.6).toFixed(3) + ")";
        html += '<rect x="' + (nameCol + i * cellW) + '" y="' + y + '" width="' + cellW + '" height="' + rowH + '" fill="' + fill + '" stroke="var(--bg-surface)" stroke-width="0.5">' +
          '<title>' + escapeHtml(r2.name) + ' \u00b7 month ' + (i + 1) + ' \u00d7' + m.toFixed(2) + '</title>' +
        '</rect>';
      });
    });
    html += '</svg>';
    host.innerHTML = html;
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Could not load heatmap</div></div>';
  }
}

// ─── Composer (Sec-43) ─────────────────────────────────────────────────
// Unified tab talking to POST /audience/{compose,saturation,affinity-audit}.
// Five pickers share one generic wiring helper (wireCompPicker) — each
// backed by state.composer[key]. All 5 pull from the already-loaded
// state.catalog.all so the UI stays responsive.
var _compLoaded = false;

// max = max signals per pool; buttons = ids of buttons to enable once picker has ≥1 selection.
function wireCompPicker(key, chipsId, searchId, suggId, countId, max, buttons) {
  var searchEl = document.getElementById(searchId);
  if (!searchEl) return;
  // Debounced search
  searchEl.addEventListener("input", function () {
    compRenderSugg(key, searchEl.value.trim().toLowerCase(), suggId, max);
  });
  searchEl.addEventListener("focus", function () {
    compRenderSugg(key, searchEl.value.trim().toLowerCase(), suggId, max);
  });
  // Initial render
  compRenderChips(key, chipsId, countId, max, suggId, buttons);
  compRenderSugg(key, "", suggId, max);
}

function compRenderChips(key, chipsId, countId, max, suggId, buttons) {
  var host = document.getElementById(chipsId);
  var countEl = document.getElementById(countId);
  var list = state.composer[key] || [];
  if (countEl) countEl.textContent = list.length + " / " + max;
  // Toggle associated buttons
  (buttons || []).forEach(function (bid) {
    var b = document.getElementById(bid);
    if (b) b.disabled = list.length < 1;
  });
  if (!host) return;
  if (list.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11.5px;padding:8px 0;font-style:italic">None.</div>';
    return;
  }
  host.innerHTML = list.map(function (s, i) {
    var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
    return '<div class="overlap-chip" data-sid="' + escapeHtml(sid) + '">' +
      '<div><div class="oc-name">' + escapeHtml(s.name) + '</div>' +
      '<div style="font-size:10.5px;color:var(--text-mut);font-family:var(--font-mono)">' +
        fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "—") +
      '</div></div>' +
      '<button class="oc-remove" data-idx="' + i + '"><svg class="ico"><use href="#icon-close"/></svg></button>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".oc-remove").forEach(function (b) {
    b.addEventListener("click", function () {
      state.composer[key].splice(Number(b.dataset.idx), 1);
      compRenderChips(key, chipsId, countId, max, suggId, buttons);
      compRenderSugg(key, "", suggId, max);
    });
  });
}

function compRenderSugg(key, q, suggId, max) {
  var host = document.getElementById(suggId);
  if (!host) return;
  var list = state.composer[key] || [];
  if (list.length >= max) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:6px 0">Max ' + max + '. Remove one to add another.</div>';
    return;
  }
  var selectedIds = new Set(list.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }));
  var rows = state.catalog.all || [];
  if (q) rows = rows.filter(function (s) {
    return (s.name || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
  });
  rows = rows.filter(function (s) {
    return !selectedIds.has(s.signal_agent_segment_id || (s.signal_id && s.signal_id.id));
  }).slice(0, 10);
  if (rows.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11.5px;padding:6px 0">No catalog matches.</div>';
    return;
  }
  host.innerHTML = rows.map(function (s) {
    var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
    return '<div class="overlap-suggestion" data-sid="' + escapeHtml(sid) + '">' +
      '<div>' + escapeHtml(s.name) + '</div>' +
      '<div class="sub">' + fmtNumber(s.estimated_audience_size) + ' · ' +
      escapeHtml(s.category_type || "—") + ' · ' + escapeHtml(verticalOf(s)) + '</div>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".overlap-suggestion").forEach(function (el) {
    el.addEventListener("click", function () {
      var sid = el.dataset.sid;
      var sig = state.catalog.all.find(function (x) {
        return (x.signal_agent_segment_id || (x.signal_id && x.signal_id.id)) === sid;
      });
      if (!sig) return;
      // Per-picker wiring table tells us chipsId/countId/buttons/max.
      var meta = _compPickerMeta[key];
      if (!meta) return;
      if (state.composer[key].length >= meta.max) return;
      state.composer[key].push(sig);
      compRenderChips(key, meta.chipsId, meta.countId, meta.max, suggId, meta.buttons);
      compRenderSugg(key, "", suggId, meta.max);
    });
  });
}

// Picker metadata so suggestion clicks know how to re-render.
var _compPickerMeta = {};

async function ensureComposer() {
  if (_compLoaded) return;
  _compLoaded = true;
  if (state.catalog.all.length === 0) await loadCatalog();

  // Build picker metadata + wire each.
  _compPickerMeta = {
    inc: { chipsId: "comp-inc-chips", countId: "comp-inc-count", buttons: ["comp-run"],     max: 8 },
    itx: { chipsId: "comp-itx-chips", countId: "comp-itx-count", buttons: [],               max: 4 },
    exc: { chipsId: "comp-exc-chips", countId: "comp-exc-count", buttons: [],               max: 4 },
    sat: { chipsId: "comp-sat-chips", countId: "comp-sat-count", buttons: ["comp-sat-run"], max: 10 },
    aff: { chipsId: "comp-aff-chips", countId: "comp-aff-count", buttons: ["comp-aff-run"], max: 15 },
  };
  wireCompPicker("inc", "comp-inc-chips", "comp-inc-search", "comp-inc-sugg", "comp-inc-count", 8,  ["comp-run"]);
  wireCompPicker("itx", "comp-itx-chips", "comp-itx-search", "comp-itx-sugg", "comp-itx-count", 4,  []);
  wireCompPicker("exc", "comp-exc-chips", "comp-exc-search", "comp-exc-sugg", "comp-exc-count", 4,  []);
  wireCompPicker("sat", "comp-sat-chips", "comp-sat-search", "comp-sat-sugg", "comp-sat-count", 10, ["comp-sat-run"]);
  wireCompPicker("aff", "comp-aff-chips", "comp-aff-search", "comp-aff-sugg", "comp-aff-count", 15, ["comp-aff-run"]);

  // Subtabs
  document.querySelectorAll(".lab-subtab[data-composer]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.dataset.composer;
      document.querySelectorAll(".lab-subtab[data-composer]").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      document.querySelectorAll(".lab-subpanel[data-composer-panel]").forEach(function (p) {
        p.style.display = p.dataset.composerPanel === target ? "" : "none";
      });
    });
  });

  // Lookalike seed dropdown — only signals whose id appears in the
  // embedding store can be seeded (the backend returns SEED_NOT_EMBEDDED
  // otherwise). We probe /ucp/projection for the canonical embedded set.
  try {
    var projRes = await fetch("/ucp/projection");
    var projData = await projRes.json();
    var embIds = new Set((projData.points || []).map(function (p) { return p.signal_id; }));
    var seedSel = document.getElementById("comp-lal-seed");
    if (seedSel) {
      var opts = ['<option value="">— none —</option>'];
      state.catalog.all.forEach(function (s) {
        var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id);
        if (!sid || !embIds.has(sid)) return;
        opts.push('<option value="' + escapeHtml(sid) + '">' + escapeHtml(s.name) + '</option>');
      });
      seedSel.innerHTML = opts.join("");
    }
  } catch (e) { /* dropdown stays minimal on fetch failure */ }

  document.getElementById("comp-run").addEventListener("click", runCompose);
  document.getElementById("comp-sat-run").addEventListener("click", runSaturation);
  document.getElementById("comp-aff-run").addEventListener("click", runAffinity);
}

// ── Set Builder run ─────────────────────────────────────────────────────
function _ids(list) {
  return (list || []).map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean);
}

async function runCompose() {
  var host = document.getElementById("comp-results");
  var include = _ids(state.composer.inc);
  var intersect = _ids(state.composer.itx);
  var exclude = _ids(state.composer.exc);
  var seedEl = document.getElementById("comp-lal-seed");
  var kEl = document.getElementById("comp-lal-k");
  var minEl = document.getElementById("comp-lal-min");
  var seed = seedEl ? seedEl.value : "";
  var body = { include: include, intersect: intersect, exclude: exclude };
  if (seed) body.lookalike = { seed_signal_id: seed, k: Number(kEl.value) || 8, min_cosine: Number(minEl.value) || 0 };
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Computing composition…</div></div>';
  try {
    var r = await fetch("/audience/compose", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.composer.lastCompose = data;
    renderComposeResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function renderComposeResult(data) {
  var host = document.getElementById("comp-results");
  var r = data.reach || {};
  var cards =
    '<div class="composer-reach-cards">' +
      '<div class="composer-reach-card"><div class="label">Union (∪)</div><div class="value">' + fmtNumber(r.union_only || 0) + '</div><div class="sub">include-only reach</div></div>' +
      '<div class="composer-reach-card"><div class="label">After intersect (∩)</div><div class="value">' + fmtNumber(r.after_intersect || 0) + '</div><div class="sub">narrowed by must-match</div></div>' +
      '<div class="composer-reach-card final"><div class="label">Final</div><div class="value">' + fmtNumber(r.final || 0) + '</div><div class="sub">after exclude (−)</div></div>' +
    '</div>';
  var confColor = data.confidence === "high" ? "var(--success)" : data.confidence === "medium" ? "var(--warning)" : "var(--text-mut)";
  var meta =
    '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--text-mut);margin-bottom:14px">' +
      '<div>CPM: <span class="mono" style="color:var(--text)">$' + (data.estimated_cpm || 0).toFixed(2) + '</span></div>' +
      '<div>Est. cost: <span class="mono" style="color:var(--text)">$' + fmtNumber(data.estimated_cost_usd || 0) + '</span></div>' +
      '<div>Confidence: <span class="mono" style="color:' + confColor + '">' + escapeHtml(data.confidence || "—") + '</span></div>' +
    '</div>';
  var lal = "";
  if (data.lookalike && data.lookalike.candidates && data.lookalike.candidates.length > 0) {
    lal =
      '<div class="lab-panel-title" style="margin-top:14px">Lookalike candidates (seed: ' + escapeHtml(data.lookalike.seed) + ')</div>' +
      '<div class="composer-lal-list">' +
        data.lookalike.candidates.map(function (c) {
          return '<div class="composer-lal-item">' +
            '<div><div>' + escapeHtml(c.name) + '</div>' +
            '<div style="font-size:10.5px;color:var(--text-mut);font-family:var(--font-mono)">' +
              fmtNumber(c.estimated_audience_size) +
            '</div></div>' +
            '<div style="display:flex;align-items:center;gap:10px">' +
              '<span class="cos">' + c.cosine.toFixed(3) + '</span>' +
              '<button class="add-btn" data-sid="' + escapeHtml(c.signal_agent_segment_id) + '">+ include</button>' +
            '</div>' +
          '</div>';
        }).join("") +
      '</div>';
  }
  host.innerHTML = cards + meta + lal;
  host.querySelectorAll(".add-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      var sid = b.dataset.sid;
      var sig = state.catalog.all.find(function (x) {
        return (x.signal_agent_segment_id || (x.signal_id && x.signal_id.id)) === sid;
      });
      if (!sig) return;
      if (state.composer.inc.length >= 8) { showToast("Include pool is full (max 8).", true); return; }
      if (_ids(state.composer.inc).indexOf(sid) >= 0) return;
      state.composer.inc.push(sig);
      compRenderChips("inc", "comp-inc-chips", "comp-inc-count", 8, "comp-inc-sugg", ["comp-run"]);
      compRenderSugg("inc", "", "comp-inc-sugg", 8);
      showToast("Added to Include pool.", false);
    });
  });
  document.getElementById("comp-explainer").innerHTML = renderChartExplainer({
    what: "Set-ops composition with embedding-based lookalike proposals.",
    how: "Union uses pairwise inclusion-exclusion against a category-affinity Jaccard heuristic (0.55 within category, 0.20 across). Intersect decays the base by the pairwise overlap rate; exclude subtracts suppressed overlap. Lookalikes are embedding k-NN against the seed.",
    read: "<strong>Union</strong> ≥ largest single signal, ≤ sum of reaches. <strong>Final</strong> = after the whole set-op chain. Lookalike candidates are proposals — they do NOT auto-add to the reach math, so numbers stay auditable.",
    limits: "Catalog signals only expose estimated reach (not user-level membership); overlap is heuristic. For production deployments wire this to a clean-room with real membership data.",
  });
  // Sec-44: fire privacy + holdout checks against the composed reach.
  runPrivacyGate(r.final || 0, _ids(state.composer.inc).concat(_ids(state.composer.itx)));
  runHoldoutForComposer(r.final || 0);
}

// Sec-44: Privacy gate — POST /audience/privacy-check with composed signals.
async function runPrivacyGate(cohortSize, signalIds) {
  var host = document.getElementById("comp-privacy");
  if (!host) return;
  if (cohortSize <= 0) { host.innerHTML = ""; return; }
  try {
    var r = await fetch("/audience/privacy-check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal_ids: signalIds, cohort_size: cohortSize }),
    });
    var data = await r.json();
    if (!r.ok || data.error) { host.innerHTML = ""; return; }
    var statusColor = data.status === "ok" ? "var(--success)" : data.status === "warn" ? "var(--warning)" : "var(--error)";
    var statusLabel = data.status === "ok" ? "Ok to activate" : data.status === "warn" ? "Warning" : "Blocked";
    var reasons = (data.reasons || []).map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join("");
    host.innerHTML =
      '<div class="privacy-gate" style="border-left:3px solid ' + statusColor + '">' +
        '<div class="privacy-title">' +
          '<strong>Privacy gate: ' + statusLabel + '</strong>' +
          '<span class="mono" style="color:var(--text-mut);margin-left:10px">k-anon floor ' + data.min_k + ' · cohort ' + fmtNumber(data.cohort_size) + '</span>' +
        '</div>' +
        (reasons ? '<ul class="privacy-reasons">' + reasons + '</ul>' : '<div style="color:var(--text-mut);font-size:11.5px">No privacy concerns flagged.</div>') +
      '</div>';
  } catch (e) { host.innerHTML = ""; }
}

// Sec-44: Holdout plan — POST /audience/holdout.
async function runHoldoutForComposer(reach) {
  var host = document.getElementById("comp-holdout");
  if (!host) return;
  if (reach <= 0) { host.innerHTML = ""; return; }
  try {
    var r = await fetch("/audience/holdout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reach: reach, holdout_pct: 0.10, baseline_conversion_rate: 0.02 }),
    });
    var data = await r.json();
    if (!r.ok || data.error) { host.innerHTML = ""; return; }
    host.innerHTML =
      '<div class="holdout-block">' +
        '<div class="holdout-title">Incrementality plan <span class="mono" style="color:var(--text-mut);font-weight:400;margin-left:8px">(10% holdout · 2% baseline CR · α=0.05 · 80% power)</span></div>' +
        '<div class="holdout-stats">' +
          '<div><div class="k">Exposed</div><div class="v">' + fmtNumber(data.exposed_size) + '</div></div>' +
          '<div><div class="k">Control</div><div class="v">' + fmtNumber(data.control_size) + '</div></div>' +
          '<div><div class="k">MDE (abs)</div><div class="v mono">' + (data.mde_absolute * 100).toFixed(2) + '%</div></div>' +
          '<div><div class="k">MDE (rel)</div><div class="v mono">' + (data.mde_relative * 100).toFixed(1) + '%</div></div>' +
        '</div>' +
      '</div>';
  } catch (e) { host.innerHTML = ""; }
}

// ── Saturation run ──────────────────────────────────────────────────────
async function runSaturation() {
  var host = document.getElementById("comp-sat-results");
  var ids = _ids(state.composer.sat);
  var body = { signal_ids: ids };
  var budget = Number(document.getElementById("comp-sat-budget").value) || 0;
  var reachOverride = Number(document.getElementById("comp-sat-reach").value) || 0;
  if (budget > 0) body.budget_usd = budget;
  if (reachOverride > 0) body.reach = reachOverride;
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Computing saturation…</div></div>';
  try {
    var r = await fetch("/audience/saturation", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.composer.lastSat = data;
    renderSaturationResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function renderSaturationResult(data) {
  var host = document.getElementById("comp-sat-results");
  var curve = data.curve || [];
  if (curve.length === 0) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">Empty curve</div></div>';
    return;
  }
  // SVG line chart — two series: unique_reach (filled area) + marginal_reach (dots).
  var W = 640, H = 260, P = 40;
  var maxR = 0, maxMarg = 0;
  curve.forEach(function (c) {
    if (c.unique_reach > maxR) maxR = c.unique_reach;
    if (c.marginal_reach > maxMarg) maxMarg = c.marginal_reach;
  });
  var xScale = function (i) { return P + i * ((W - 2 * P) / Math.max(1, curve.length - 1)); };
  var yScale = function (v) { return H - P - v / Math.max(1, maxR) * (H - 2 * P); };
  var yScaleMarg = function (v) { return H - P - v / Math.max(1, maxMarg) * (H - 2 * P); };

  var areaPts = "M " + P + " " + (H - P) + " ";
  curve.forEach(function (c, i) { areaPts += "L " + xScale(i) + " " + yScale(c.unique_reach) + " "; });
  areaPts += "L " + xScale(curve.length - 1) + " " + (H - P) + " Z";

  var kneeIdx = data.knee_frequency != null
    ? curve.findIndex(function (c) { return c.frequency === data.knee_frequency; })
    : -1;

  var svg = '<svg class="comp-sat-curve" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
    '<path d="' + areaPts + '" fill="rgba(79,142,255,0.18)" stroke="none"/>' +
    '<path d="' + curve.map(function (c, i) { return (i === 0 ? "M " : "L ") + xScale(i) + " " + yScale(c.unique_reach); }).join(" ") +
      '" fill="none" stroke="var(--accent)" stroke-width="1.8"/>';
  curve.forEach(function (c, i) {
    svg += '<circle cx="' + xScale(i) + '" cy="' + yScaleMarg(c.marginal_reach) + '" r="2.5" fill="var(--accent-hot)" opacity="0.7"/>';
  });
  if (kneeIdx >= 0) {
    svg += '<line x1="' + xScale(kneeIdx) + '" y1="' + P + '" x2="' + xScale(kneeIdx) + '" y2="' + (H - P) + '" stroke="var(--warning)" stroke-width="1" stroke-dasharray="4,3"/>';
    svg += '<text x="' + xScale(kneeIdx) + '" y="' + (P - 6) + '" text-anchor="middle" font-size="10" fill="var(--warning)">knee · F=' + data.knee_frequency + '</text>';
  }
  // Axis labels
  curve.forEach(function (c, i) {
    svg += '<text x="' + xScale(i) + '" y="' + (H - P + 14) + '" text-anchor="middle" font-size="9" fill="var(--text-mut)">' + c.frequency + '</text>';
  });
  svg += '<text x="' + (W / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="var(--text-mut)">Frequency (avg exposures per user)</text>';
  svg += '<text x="10" y="' + P + '" font-size="9" fill="var(--accent)">' + fmtNumber(maxR) + ' reach</text>';
  svg += '<text x="10" y="' + (H - P) + '" font-size="9" fill="var(--text-mut)">0</text>';
  svg += '</svg>';

  var rows = curve.map(function (c) {
    var cls = (data.knee_frequency === c.frequency) ? "knee" : "";
    return '<tr class="' + cls + '">' +
      '<td>' + c.frequency + '</td>' +
      '<td>' + fmtNumber(c.unique_reach) + '</td>' +
      '<td>' + (c.reach_fraction * 100).toFixed(1) + '%</td>' +
      '<td>' + fmtNumber(c.marginal_reach) + '</td>' +
      '<td>' + fmtNumber(c.impressions) + '</td>' +
      '<td>$' + fmtNumber(c.cost_usd) + '</td>' +
      '<td>$' + (c.cost_per_unique_reach_usd || 0).toFixed(4) + '</td>' +
    '</tr>';
  }).join("");
  var table =
    '<table class="comp-sat-table">' +
      '<thead><tr><th>F</th><th>Unique reach</th><th>% pop</th><th>Marginal</th><th>Impressions</th><th>Cost</th><th>CP unique</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  var meta =
    '<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:var(--text-mut);margin-bottom:10px">' +
      '<div>Population: <span class="mono" style="color:var(--text)">' + fmtNumber(data.reach_population || 0) + '</span></div>' +
      '<div>CPM: <span class="mono" style="color:var(--text)">$' + (data.cpm || 0).toFixed(2) + '</span></div>' +
      (data.knee_frequency != null ? '<div>Knee: <span class="mono" style="color:var(--warning)">F=' + data.knee_frequency + '</span></div>' : '') +
      (data.affordable_frequency != null ? '<div>Affordable under budget: <span class="mono" style="color:var(--success)">F=' + data.affordable_frequency + '</span></div>' : '') +
    '</div>';

  // Budget-shortfall warning: surface clearly when the user set a budget
  // but it cannot afford even F=1. Without this the curve renders as if
  // budget weren't a constraint, hiding the gap between intent and reality.
  var shortfallBanner = '';
  if (data.budget_usd != null && data.budget_usd > 0 && data.affordable_frequency == null && curve.length > 0) {
    var f1Cost = curve[0].cost_usd;
    var f1Reach = curve[0].unique_reach;
    var deficit = f1Cost - data.budget_usd;
    var coveragePct = (data.budget_usd / f1Cost) * 100;
    shortfallBanner =
      '<div class="comp-sat-shortfall">' +
        '<div class="comp-sat-shortfall-icon">!</div>' +
        '<div class="comp-sat-shortfall-body">' +
          '<div class="comp-sat-shortfall-title">Budget too low for even F=1.</div>' +
          '<div class="comp-sat-shortfall-detail">' +
            '$<strong>' + fmtNumber(data.budget_usd) + '</strong> covers ' +
            '<strong>' + coveragePct.toFixed(1) + '%</strong> of the F=1 cost ' +
            '($' + fmtNumber(Math.round(f1Cost)) + ' for ' + fmtNumber(f1Reach) + ' unique reach). ' +
            'Need <strong>+$' + fmtNumber(Math.round(deficit)) + '</strong> more to hit F=1, or trim the audience to ' +
            fmtNumber(Math.round(data.budget_usd * 1000 / (data.cpm || 1))) + ' impressions worth.' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  host.innerHTML = meta + shortfallBanner + svg + table;
  document.getElementById("comp-sat-explainer").innerHTML = renderChartExplainer({
    what: "Frequency saturation curve under a Poisson exposure model.",
    how: "<code>P(seen ≥ 1 | F) = 1 − exp(−F)</code>. At each sampled F, we compute unique reach, impressions, cost (impressions × CPM / 1000), and marginal reach vs the previous step. The knee is the first F where each +1 buys less than half the F=1 baseline gain.",
    read: "<strong>Before the knee</strong> spend mostly buys new reach. <strong>After the knee</strong> spend mostly buys repeat exposures of users you've already hit. Use the affordable-F line to pick your cap.",
    limits: "Assumes random-impression delivery. Real DSPs with frequency-cap optimizers reach the knee faster; this is an upper bound on diminishing returns.",
  });
}

// ── Affinity audit run ──────────────────────────────────────────────────
async function runAffinity() {
  var host = document.getElementById("comp-aff-results");
  var ids = _ids(state.composer.aff);
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Auditing affinity…</div></div>';
  try {
    var r = await fetch("/audience/affinity-audit", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signal_ids: ids }),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.composer.lastAff = data;
    renderAffinityResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function renderAffinityResult(data) {
  var host = document.getElementById("comp-aff-results");
  var summary = data.summary || {};
  var facets = data.facets || [];

  // Bars: centered at 100 (parity). Width proportional to |index − 100| / 500
  // clamped to the half of the track (so index=200 fills 20%; index=600 caps).
  function bar(row) {
    var idx = row.index;
    var isZero = idx === 0;
    var isOver = idx > 100;
    var delta = Math.min(500, Math.abs(idx - 100));
    var widthPct = (delta / 500) * 50; // 0..50% of track width
    var cls = isZero ? "absent" : idx >= 150 ? "heavy" : isOver ? "over" : "under";
    var style = isZero
      ? 'left:50%;width:0%;'
      : isOver
        ? 'left:50%;width:' + widthPct + '%;'
        : 'right:50%;width:' + widthPct + '%;';
    var indexLabel = isZero ? "absent" : String(idx);
    var indexColor = isZero ? "var(--text-mut)" : isOver ? "var(--accent)" : "var(--warn,var(--text-dim))";
    return '<div class="comp-aff-row' + (isZero ? ' comp-aff-row-zero' : '') + '">' +
      '<div class="comp-aff-key">' + escapeHtml(row.key) + '</div>' +
      '<div class="comp-aff-bar-track">' +
        '<div class="comp-aff-bar-fill ' + cls + '" style="' + style + '"></div>' +
        // 100-parity tick mark always rendered as a vertical line
        '<div class="comp-aff-bar-tick"></div>' +
      '</div>' +
      '<div class="comp-aff-index" style="color:' + indexColor + '">' + indexLabel + '</div>' +
    '</div>';
  }

  var facetsHtml = facets.map(function (f, fi) {
    var allRows = (f.rows || []);
    var liveRows = allRows.filter(function (r) { return r.selection_share > 0; });
    var zeroRows = allRows.filter(function (r) { return r.selection_share === 0 && r.share > 0.001; });
    var hiddenCount = zeroRows.length;
    var liveBars = liveRows.slice(0, 10).map(bar).join("");
    var zeroToggle = hiddenCount > 0
      ? '<div class="comp-aff-zero-toggle"><button type="button" class="comp-aff-show-zeros" data-facet-idx="' + fi + '">+ show ' + hiddenCount + ' absent bucket' + (hiddenCount === 1 ? "" : "s") + '</button></div>'
      : '';
    var zeroBars = zeroRows.map(bar).join("");
    return '<div class="comp-aff-facet" data-facet-idx="' + fi + '">' +
      '<div class="comp-aff-facet-title">' + escapeHtml(f.facet) +
        ' <span class="comp-aff-facet-meta">skew ' + (summary.skew_scores ? summary.skew_scores[f.facet] : "—") +
        ' \u00b7 concentration ' + (summary.concentration ? summary.concentration[f.facet] : "—") + '</span>' +
      '</div>' +
      liveBars +
      zeroToggle +
      '<div class="comp-aff-zero-rows" data-facet-idx="' + fi + '" style="display:none">' + zeroBars + '</div>' +
    '</div>';
  }).join("");

  var top =
    '<div class="comp-aff-summary">' +
      '<div class="comp-aff-summary-meta">' +
        '<div>Selection: <span class="mono" style="color:var(--text)">' + (summary.selection_count || 0) + '</span> signals</div>' +
        '<div>Catalog: <span class="mono" style="color:var(--text)">' + (summary.catalog_count || 0) + '</span> signals</div>' +
        '<div>Facets: <span class="mono" style="color:var(--text)">' + facets.length + '</span></div>' +
      '</div>' +
      '<div class="comp-aff-legend">' +
        '<span><span class="comp-aff-legend-dot under"></span>under-indexed (&lt;100)</span>' +
        '<span><span class="comp-aff-legend-dot tick"></span>parity = 100</span>' +
        '<span><span class="comp-aff-legend-dot over"></span>over-indexed (&gt;100)</span>' +
        '<span><span class="comp-aff-legend-dot heavy"></span>\u22652\u00d7 catalog</span>' +
        '<span><span class="comp-aff-legend-dot absent"></span>absent (0)</span>' +
      '</div>' +
    '</div>';
  host.innerHTML = top + facetsHtml;
  // Wire the "show absent buckets" toggles
  host.querySelectorAll('.comp-aff-show-zeros').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var idx = btn.dataset.facetIdx;
      var rows = host.querySelector('.comp-aff-zero-rows[data-facet-idx="' + idx + '"]');
      if (!rows) return;
      var visible = rows.style.display !== 'none';
      rows.style.display = visible ? 'none' : '';
      btn.textContent = visible
        ? btn.textContent.replace('hide', '+ show')
        : btn.textContent.replace('+ show', 'hide');
    });
  });
  document.getElementById("comp-aff-explainer").innerHTML = renderChartExplainer({
    what: "Reach-weighted affinity index vs the catalog baseline.",
    how: "For each facet (category / vertical / geo band / data provider), share = sum(reach) in each bucket / sum(reach) overall. Index = 100 × (selection_share / baseline_share), capped at 600.",
    read: "Bars extend RIGHT of the center line for <strong>over-indexed</strong> buckets (your selection is heavier there than the catalog is) and LEFT for under-indexed. Skew = mean |index − 100| across live rows; concentration = buckets needed to cover 80% of selection share.",
    limits: "This is a meta-audit of your signal picks, not of the users those signals enroll. It tells you whether your portfolio is biased toward a vertical or provider — not whether the underlying users are.",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Sec-45: Journey Builder — sequential segmentation + funnel viz.
// Each stage has its own include/intersect/exclude pools; the backend
// reach-sizes every stage via /audience/compose then returns a funnel
// with per-stage conversion vs prior, cumulative vs top-of-funnel, and
// drop-off. Stages are clamped monotonically (a later stage's reach can
// never exceed the prior stage).
// ─────────────────────────────────────────────────────────────────────────
var _journeyLoaded = false;

function ensureJourney() {
  if (_journeyLoaded) return;
  _journeyLoaded = true;
  if (state.journey.stages.length === 0) {
    state.journey.stages.push(_journeyBlankStage("Awareness"));
    state.journey.stages.push(_journeyBlankStage("Intent"));
  }
  _journeyRenderStages();
  document.getElementById("journey-add").addEventListener("click", function () {
    if (state.journey.stages.length >= 6) { showToast("Max 6 stages.", true); return; }
    var names = ["Awareness", "Consideration", "Intent", "Evaluation", "Conversion", "Retention"];
    var name = names[state.journey.stages.length] || ("Stage " + (state.journey.stages.length + 1));
    state.journey.stages.push(_journeyBlankStage(name));
    _journeyRenderStages();
    _journeyRefreshRunBtn();
  });
  // Sec-46: mode toggle (cumulative vs independent)
  document.querySelectorAll(".journey-mode-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mode = btn.dataset.mode;
      state.journey.cumulative = mode === "cumulative";
      document.querySelectorAll(".journey-mode-btn").forEach(function (b) {
        var active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      var hint = document.getElementById("journey-mode-hint");
      if (hint) hint.textContent = state.journey.cumulative
        ? "Each stage is a subset of the prior — upstream signals fold in as implicit intersects."
        : "Each stage is sized independently, then clamped monotonically. Use when stages come from separate data sources.";
    });
  });
  document.getElementById("journey-run").addEventListener("click", runJourney);
  _journeyRefreshRunBtn();
}

function _journeyBlankStage(name) {
  return { name: name, inc: [], itx: [], exc: [] };
}

function _journeyRenderStages() {
  var host = document.getElementById("journey-stages");
  if (!host) return;
  host.innerHTML = state.journey.stages.map(function (_st, i) {
    return _journeyStageCardHtml(i);
  }).join("");
  state.journey.stages.forEach(function (_st, i) { _journeyWireStage(i); });
}

function _journeyStageCardHtml(i) {
  var st = state.journey.stages[i];
  var canRemove = state.journey.stages.length > 2;
  return '<div class="journey-stage" data-i="' + i + '">' +
    '<div class="journey-stage-head">' +
      '<div class="journey-stage-idx">' + (i + 1) + '</div>' +
      '<input class="journey-stage-name" id="journey-name-' + i + '" value="' + escapeHtml(st.name) + '"/>' +
      (canRemove ? '<button class="journey-stage-remove" id="journey-remove-' + i + '" title="Remove stage"><svg class="ico"><use href="#icon-close"/></svg></button>' : '') +
    '</div>' +
    '<div class="journey-stage-pools">' +
      _journeyPoolHtml(i, "inc", "Include", 4) +
      _journeyPoolHtml(i, "itx", "Intersect", 3) +
      _journeyPoolHtml(i, "exc", "Exclude", 3) +
    '</div>' +
  '</div>';
}

function _journeyPoolHtml(i, pool, label, max) {
  var st = state.journey.stages[i];
  return '<div class="journey-pool">' +
    '<div class="builder-section-label">' + label + ' <span style="color:var(--text-mut);font-weight:400;font-family:var(--font-mono)" id="journey-count-' + i + '-' + pool + '">' + st[pool].length + ' / ' + max + '</span></div>' +
    '<div class="overlap-chips" id="journey-chips-' + i + '-' + pool + '"></div>' +
    '<div class="overlap-search">' +
      '<svg class="ico"><use href="#icon-search"/></svg>' +
      '<input id="journey-search-' + i + '-' + pool + '" placeholder="Search catalog…" autocomplete="off"/>' +
    '</div>' +
    '<div class="overlap-suggestions" id="journey-sugg-' + i + '-' + pool + '"></div>' +
  '</div>';
}

function _journeyWireStage(i) {
  var st = state.journey.stages[i];
  var nameEl = document.getElementById("journey-name-" + i);
  if (nameEl) nameEl.addEventListener("input", function () {
    state.journey.stages[i].name = nameEl.value.slice(0, 40);
  });
  var rm = document.getElementById("journey-remove-" + i);
  if (rm) rm.addEventListener("click", function () {
    if (state.journey.stages.length <= 2) { showToast("Need at least 2 stages.", true); return; }
    state.journey.stages.splice(i, 1);
    _journeyRenderStages();
    _journeyRefreshRunBtn();
  });
  ["inc", "itx", "exc"].forEach(function (pool) {
    var max = pool === "inc" ? 4 : 3;
    _journeyRenderChips(i, pool, max);
    _journeyRenderSugg(i, pool, "", max);
    var searchEl = document.getElementById("journey-search-" + i + "-" + pool);
    if (searchEl) {
      searchEl.addEventListener("input", function () {
        _journeyRenderSugg(i, pool, searchEl.value.trim().toLowerCase(), max);
      });
      searchEl.addEventListener("focus", function () {
        _journeyRenderSugg(i, pool, searchEl.value.trim().toLowerCase(), max);
      });
    }
    void st;
  });
}

function _journeyRenderChips(i, pool, max) {
  var st = state.journey.stages[i];
  var list = st[pool] || [];
  var host = document.getElementById("journey-chips-" + i + "-" + pool);
  var countEl = document.getElementById("journey-count-" + i + "-" + pool);
  if (countEl) countEl.textContent = list.length + " / " + max;
  if (!host) return;
  if (list.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0;font-style:italic">None.</div>';
  } else {
    host.innerHTML = list.map(function (s, idx) {
      var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
      return '<div class="overlap-chip" data-sid="' + escapeHtml(sid) + '">' +
        '<div><div class="oc-name">' + escapeHtml(s.name) + '</div>' +
        '<div style="font-size:10.5px;color:var(--text-mut);font-family:var(--font-mono)">' + fmtNumber(s.estimated_audience_size) + '</div></div>' +
        '<button class="oc-remove" data-idx="' + idx + '"><svg class="ico"><use href="#icon-close"/></svg></button>' +
      '</div>';
    }).join("");
    host.querySelectorAll(".oc-remove").forEach(function (b) {
      b.addEventListener("click", function () {
        state.journey.stages[i][pool].splice(Number(b.dataset.idx), 1);
        _journeyRenderChips(i, pool, max);
        _journeyRenderSugg(i, pool, "", max);
        _journeyRefreshRunBtn();
      });
    });
  }
  _journeyRefreshRunBtn();
}

function _journeyRenderSugg(i, pool, q, max) {
  var st = state.journey.stages[i];
  var host = document.getElementById("journey-sugg-" + i + "-" + pool);
  if (!host) return;
  var list = st[pool] || [];
  if (list.length >= max) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0">Max ' + max + '.</div>';
    return;
  }
  var selected = new Set(list.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }));
  var rows = state.catalog.all || [];
  if (q) rows = rows.filter(function (s) {
    return (s.name || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
  });
  rows = rows.filter(function (s) {
    return !selected.has(s.signal_agent_segment_id || (s.signal_id && s.signal_id.id));
  }).slice(0, 6);
  if (rows.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0">No matches.</div>';
    return;
  }
  host.innerHTML = rows.map(function (s) {
    var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
    return '<div class="overlap-suggestion" data-sid="' + escapeHtml(sid) + '">' +
      '<div>' + escapeHtml(s.name) + '</div>' +
      '<div class="sub">' + fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "—") + '</div>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".overlap-suggestion").forEach(function (el) {
    el.addEventListener("click", function () {
      var sid = el.dataset.sid;
      var sig = state.catalog.all.find(function (x) {
        return (x.signal_agent_segment_id || (x.signal_id && x.signal_id.id)) === sid;
      });
      if (!sig) return;
      if (state.journey.stages[i][pool].length >= max) return;
      state.journey.stages[i][pool].push(sig);
      _journeyRenderChips(i, pool, max);
      _journeyRenderSugg(i, pool, "", max);
    });
  });
}

function _journeyRefreshRunBtn() {
  var btn = document.getElementById("journey-run");
  if (!btn) return;
  var ok = state.journey.stages.length >= 2 && state.journey.stages.every(function (st) {
    return (st.inc.length + st.itx.length) >= 1;
  });
  btn.disabled = !ok;
}

async function runJourney() {
  var host = document.getElementById("journey-result");
  var stages = state.journey.stages.map(function (st) {
    return {
      name: st.name || "stage",
      include: st.inc.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean),
      intersect: st.itx.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean),
      exclude: st.exc.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean),
    };
  });
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Computing funnel…</div></div>';
  try {
    var r = await fetch("/audience/journey", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stages: stages, cumulative: !!state.journey.cumulative }),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.journey.lastResult = data;
    _renderJourneyResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function _renderJourneyResult(data) {
  var host = document.getElementById("journey-result");
  var stages = data.stages || [];
  if (stages.length === 0) { host.innerHTML = '<div class="empty-state"><div class="empty-title">Empty funnel</div></div>'; return; }
  var top = stages[0].reach || 0;
  var mode = data.mode || "independent";
  var rows = stages.map(function (s, i) {
    var pct = top > 0 ? (s.reach / top) * 100 : 0;
    var convPrior = i === 0 ? null : (s.conversion_rate != null ? s.conversion_rate : null);
    var cumPct = (s.cumulative_rate != null ? s.cumulative_rate * 100 : pct);
    var clampedMark = s.clamped ? ' <span class="pill pill-error mono" style="font-size:10px" title="Stage broader than its parent — clamped down. In cumulative mode this should never happen; in independent mode it means your stages aren\\'t a valid funnel.">clamped</span>' : '';
    // Sec-46: when clamp happened, show both the pre-clamp (natively computed) reach and the clamped value.
    var preClampLine = (s.clamped && s.pre_clamp_reach != null && s.pre_clamp_reach > s.reach)
      ? '<span class="journey-row-preclamp">natively ' + fmtNumber(s.pre_clamp_reach) + ' · clamped to ' + fmtNumber(s.reach) + '</span>'
      : '';
    return '<div class="journey-row' + (s.clamped ? ' journey-row-clamped' : '') + '">' +
      '<div class="journey-row-head">' +
        '<span class="journey-row-name">' + escapeHtml(s.name || ("Stage " + (i + 1))) + clampedMark + '</span>' +
        '<span class="journey-row-reach mono">' + fmtNumber(s.reach || 0) + '</span>' +
      '</div>' +
      '<div class="journey-bar-outer"><div class="journey-bar-inner" style="width:' + pct.toFixed(1) + '%"></div></div>' +
      '<div class="journey-row-meta">' +
        '<span>' + cumPct.toFixed(1) + '% of top-of-funnel</span>' +
        (convPrior != null ? '<span>· ' + (convPrior * 100).toFixed(1) + '% vs prior</span>' : '<span>· top</span>') +
        (s.dropped_off != null && i > 0 ? '<span>· dropped ' + fmtNumber(s.dropped_off) + '</span>' : '') +
        (preClampLine ? '<span class="journey-row-preclamp-wrap">· ' + preClampLine + '</span>' : '') +
      '</div>' +
    '</div>';
  }).join("");
  var overall = data.overall || {};
  var modePill = '<span class="pill ' + (mode === "cumulative" ? "pill-success" : "pill-muted") + ' mono" style="font-size:10px;margin-left:8px">' + escapeHtml(mode) + '</span>';
  var summary =
    '<div class="journey-summary">' +
      '<div><div class="k">Mode</div><div class="v">' + escapeHtml(mode) + '</div></div>' +
      '<div><div class="k">Top</div><div class="v mono">' + fmtNumber(overall.top_of_funnel || 0) + '</div></div>' +
      '<div><div class="k">Bottom</div><div class="v mono">' + fmtNumber(overall.bottom_of_funnel || 0) + '</div></div>' +
      '<div><div class="k">End-to-end</div><div class="v mono">' + ((overall.end_to_end_conversion || 0) * 100).toFixed(1) + '%</div></div>' +
      (overall.biggest_dropoff_stage ? '<div><div class="k">Biggest drop</div><div class="v">' + escapeHtml(overall.biggest_dropoff_stage) + '</div></div>' : '') +
    '</div>';
  // Sec-46: surface a clear warning banner when ANY stage was clamped. In cumulative
  // mode this is rare and points to a heuristic edge case; in independent mode it
  // means the stages aren't actually a funnel (a later stage was broader than its
  // parent) and the user should fix their composition, not trust the conversion
  // numbers below (which read as 100% + 0 dropped after clamp — misleading).
  var clampedStages = stages.filter(function (s) { return s.clamped; }).map(function (s) { return s.name; });
  var warningBanner = "";
  if (clampedStages.length > 0) {
    warningBanner =
      '<div class="journey-warning-banner">' +
        '<div class="journey-warning-icon">!</div>' +
        '<div class="journey-warning-body">' +
          '<div class="journey-warning-title">' + clampedStages.length + ' stage' + (clampedStages.length === 1 ? '' : 's') + ' clamped: ' + escapeHtml(clampedStages.join(", ")) + '</div>' +
          '<div class="journey-warning-detail">' +
            (mode === "cumulative"
              ? 'Cumulative mode should normally prevent this; heuristic edge case. Conversion + drop-off metrics on clamped stages read as 100% / 0 — ignore them.'
              : 'Each clamped stage was <strong>broader than its parent</strong>, so it was capped. Conversion + drop-off metrics on clamped stages read as 100% / 0 — ignore them. Either fix the composition (later stages should narrow, not broaden) or switch to <strong>Cumulative</strong> mode to make subset-of-parent an enforced invariant.') +
          '</div>' +
        '</div>' +
      '</div>';
  }
  host.innerHTML = warningBanner + summary + '<div class="journey-funnel">' + rows + '</div>';
  document.getElementById("journey-explainer").innerHTML = renderChartExplainer({
    what: "Stacked per-stage segmentation with a monotone reach funnel.",
    how: "<strong>Cumulative mode (default):</strong> each stage's signals are intersected with the union of upstream-stage signals, so stage <code>i</code> is automatically a subset of stage <code>i−1</code>. <strong>Independent mode:</strong> each stage is sized on its own via <code>/audience/compose</code>, then reaches are clamped to be monotonically non-increasing after the fact. Reach math: inclusion-exclusion for union, Jaccard-decayed intersect, subtracted overlap for exclude.",
    read: "Bars show each stage's reach as a share of top-of-funnel. % vs prior is the conversion rate between consecutive stages; cumulative % is vs stage 1. A red <code>clamped</code> pill marks stages whose native reach exceeded the parent's — in independent mode that's almost always a configuration error.",
    limits: "Reach math is estimated (catalog-level, not user-level); treat the funnel as a planning sketch, not a production attribution chain. Clamped stages' conversion and drop-off metrics are meaningless after clamp — look at pre-clamp reach to understand what the stage actually described.",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Sec-45: Scenario Planner — wraps /portfolio/what-if.
// Three pools: current portfolio, adds, removes. Remove picks are chosen
// from the current pool (you can't remove something you don't own).
// ─────────────────────────────────────────────────────────────────────────
var _plannerLoaded = false;

async function ensurePlanner() {
  if (_plannerLoaded) return;
  _plannerLoaded = true;
  if (state.catalog.all.length === 0) await loadCatalog();
  _plannerWirePool("cur", "plan-cur-chips", "plan-cur-search", "plan-cur-sugg", "plan-cur-count", 12, true);
  _plannerWirePool("add", "plan-add-chips", "plan-add-search", "plan-add-sugg", "plan-add-count", 6, true);
  _plannerWirePool("rem", "plan-rem-chips", null, null, "plan-rem-count", 6, false);
  _plannerRenderRemCandidates();
  document.getElementById("plan-run").addEventListener("click", runPlanner);
  _plannerRefreshRunBtn();
}

function _plannerWirePool(key, chipsId, searchId, suggId, countId, max, fromCatalog) {
  _plannerRenderChips(key, chipsId, countId, max, fromCatalog);
  if (!searchId || !suggId) return;
  _plannerRenderSugg(key, "", suggId, max, chipsId, countId);
  var searchEl = document.getElementById(searchId);
  if (!searchEl) return;
  searchEl.addEventListener("input", function () {
    _plannerRenderSugg(key, searchEl.value.trim().toLowerCase(), suggId, max, chipsId, countId);
  });
  searchEl.addEventListener("focus", function () {
    _plannerRenderSugg(key, searchEl.value.trim().toLowerCase(), suggId, max, chipsId, countId);
  });
}

function _plannerRenderChips(key, chipsId, countId, max, _fromCatalog) {
  var host = document.getElementById(chipsId);
  var countEl = document.getElementById(countId);
  var list = state.planner[key] || [];
  if (countEl) countEl.textContent = list.length + " / " + max;
  if (!host) return;
  if (list.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0;font-style:italic">None.</div>';
  } else {
    host.innerHTML = list.map(function (s, i) {
      var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
      return '<div class="overlap-chip" data-sid="' + escapeHtml(sid) + '">' +
        '<div><div class="oc-name">' + escapeHtml(s.name) + '</div>' +
        '<div style="font-size:10.5px;color:var(--text-mut);font-family:var(--font-mono)">' + fmtNumber(s.estimated_audience_size) + '</div></div>' +
        '<button class="oc-remove" data-idx="' + i + '"><svg class="ico"><use href="#icon-close"/></svg></button>' +
      '</div>';
    }).join("");
    host.querySelectorAll(".oc-remove").forEach(function (b) {
      b.addEventListener("click", function () {
        state.planner[key].splice(Number(b.dataset.idx), 1);
        _plannerRenderChips(key, chipsId, countId, max, _fromCatalog);
        if (key === "cur") { _plannerRenderRemCandidates(); }
        _plannerRefreshRunBtn();
      });
    });
  }
  _plannerRefreshRunBtn();
}

function _plannerRenderSugg(key, q, suggId, max, chipsId, countId) {
  var host = document.getElementById(suggId);
  if (!host) return;
  var list = state.planner[key] || [];
  if (list.length >= max) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0">Max ' + max + '.</div>';
    return;
  }
  var selectedIds = new Set(list.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }));
  // For Add pool, also filter out anything already in current.
  if (key === "add") {
    state.planner.cur.forEach(function (s) { selectedIds.add(s.signal_agent_segment_id || (s.signal_id && s.signal_id.id)); });
  }
  var rows = state.catalog.all || [];
  if (q) rows = rows.filter(function (s) {
    return (s.name || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
  });
  rows = rows.filter(function (s) {
    return !selectedIds.has(s.signal_agent_segment_id || (s.signal_id && s.signal_id.id));
  }).slice(0, 8);
  if (rows.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0">No catalog matches.</div>';
    return;
  }
  host.innerHTML = rows.map(function (s) {
    var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
    return '<div class="overlap-suggestion" data-sid="' + escapeHtml(sid) + '">' +
      '<div>' + escapeHtml(s.name) + '</div>' +
      '<div class="sub">' + fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "—") + '</div>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".overlap-suggestion").forEach(function (el) {
    el.addEventListener("click", function () {
      var sid = el.dataset.sid;
      var sig = state.catalog.all.find(function (x) {
        return (x.signal_agent_segment_id || (x.signal_id && x.signal_id.id)) === sid;
      });
      if (!sig) return;
      if (state.planner[key].length >= max) return;
      state.planner[key].push(sig);
      _plannerRenderChips(key, chipsId, countId, max, true);
      _plannerRenderSugg(key, "", suggId, max, chipsId, countId);
      if (key === "cur") {
        _plannerRenderRemCandidates();
        // Adds pool may now need to refilter.
        _plannerRenderSugg("add", "", "plan-add-sugg", 6, "plan-add-chips", "plan-add-count");
      }
    });
  });
}

function _plannerRenderRemCandidates() {
  var host = document.getElementById("plan-rem-candidates");
  if (!host) return;
  if (state.planner.cur.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0">Remove picks come from your current portfolio. Add some first.</div>';
    return;
  }
  var candidates = state.planner.cur.filter(function (s) {
    var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id);
    return !state.planner.rem.some(function (r) {
      return (r.signal_agent_segment_id || (r.signal_id && r.signal_id.id)) === sid;
    });
  });
  if (candidates.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:4px 0">All current signals marked for removal.</div>';
    return;
  }
  host.innerHTML = '<div style="font-size:10.5px;color:var(--text-mut);padding:4px 0 6px">Click to mark for removal:</div>' +
    candidates.map(function (s) {
      var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
      return '<div class="overlap-suggestion" data-sid="' + escapeHtml(sid) + '" style="padding:6px 8px">' +
        '<div style="font-size:11.5px">' + escapeHtml(s.name) + '</div>' +
      '</div>';
    }).join("");
  host.querySelectorAll(".overlap-suggestion").forEach(function (el) {
    el.addEventListener("click", function () {
      if (state.planner.rem.length >= 6) { showToast("Remove pool full (max 6).", true); return; }
      var sid = el.dataset.sid;
      var sig = state.planner.cur.find(function (x) {
        return (x.signal_agent_segment_id || (x.signal_id && x.signal_id.id)) === sid;
      });
      if (!sig) return;
      state.planner.rem.push(sig);
      _plannerRenderChips("rem", "plan-rem-chips", "plan-rem-count", 6, false);
      _plannerRenderRemCandidates();
    });
  });
}

function _plannerRefreshRunBtn() {
  var btn = document.getElementById("plan-run");
  if (!btn) return;
  var hasCurrent = state.planner.cur.length > 0;
  var hasChange = state.planner.add.length > 0 || state.planner.rem.length > 0;
  btn.disabled = !(hasCurrent && hasChange);
}

async function runPlanner() {
  var host = document.getElementById("plan-result");
  var curIds = state.planner.cur.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean);
  var addIds = state.planner.add.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean);
  var remIds = state.planner.rem.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean);
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Evaluating scenario…</div></div>';
  try {
    var r = await fetch("/portfolio/what-if", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: curIds, add: addIds, remove: remIds }),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.planner.lastResult = data;
    _renderPlannerResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function _renderPlannerResult(data) {
  var host = document.getElementById("plan-result");
  var before = data.before || {};
  var after = data.after || {};
  var recColor = data.recommendation === "operation_accepted" ? "var(--success)" :
                 data.recommendation === "operation_marginal" ? "var(--warning)" : "var(--error)";
  var recLabel = data.recommendation === "operation_accepted" ? "Keep" :
                 data.recommendation === "operation_marginal" ? "Marginal" : "Reject";
  var deltaReach = data.delta_reach || 0;
  var deltaCost = data.delta_cost || 0;
  var cards =
    '<div class="plan-cards">' +
      '<div class="plan-card"><div class="label">Before</div><div class="value mono">' + fmtNumber(before.reach || 0) + '</div><div class="sub">$' + fmtNumber(Math.round(before.cost || 0)) + ' · ' + (before.signal_count || 0) + ' signals</div></div>' +
      '<div class="plan-card"><div class="label">After</div><div class="value mono">' + fmtNumber(after.reach || 0) + '</div><div class="sub">$' + fmtNumber(Math.round(after.cost || 0)) + ' · ' + (after.signal_count || 0) + ' signals</div></div>' +
      '<div class="plan-card plan-delta"><div class="label">Δ Reach</div><div class="value mono" style="color:' + (deltaReach >= 0 ? 'var(--success)' : 'var(--error)') + '">' + (deltaReach >= 0 ? '+' : '') + fmtNumber(deltaReach) + '</div><div class="sub">' + (deltaCost >= 0 ? '+' : '') + '$' + fmtNumber(Math.round(deltaCost)) + '</div></div>' +
      '<div class="plan-card"><div class="label">Reach / $</div><div class="value mono">' + (data.delta_reach_per_dollar != null ? fmtNumber(data.delta_reach_per_dollar) : '—') + '</div><div class="sub">efficiency</div></div>' +
      '<div class="plan-card" style="border-left:3px solid ' + recColor + '"><div class="label">Recommendation</div><div class="value" style="color:' + recColor + '">' + recLabel + '</div><div class="sub">' + escapeHtml((data.reasoning || "").slice(0, 80)) + (data.reasoning && data.reasoning.length > 80 ? '…' : '') + '</div></div>' +
    '</div>';
  host.innerHTML = cards;
  document.getElementById("plan-explainer").innerHTML = renderChartExplainer({
    what: "Portfolio what-if: compare the current set against the current + adds − removes.",
    how: "Both sets are scored by the same greedy-marginal-reach engine the optimizer uses (<code>/portfolio/optimize</code>). Delta reach and delta cost come from the difference of the two scores; recommendation is keep / marginal / reject based on reach-per-dollar thresholds.",
    read: "Positive Δ reach at low Δ cost is a <strong>keep</strong>. Positive reach but expensive is <strong>marginal</strong> — verify creative alignment first. Flat or negative reach is a <strong>reject</strong>.",
    limits: "Reach is estimated at the signal level; dedup uses Jaccard affinity, not real ID intersection. Verify winning scenarios in a clean-room before committing spend.",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Sec-45: Audience Snapshots — save/list/diff current composition.
// Snapshots are auth-gated + operator-scoped in KV. This UI uses the
// Composer's current Set-Builder pools as the source of truth for "save".
// ─────────────────────────────────────────────────────────────────────────
var _snapshotsLoaded = false;

async function ensureSnapshots() {
  if (_snapshotsLoaded) return;
  _snapshotsLoaded = true;
  document.getElementById("snap-save").addEventListener("click", saveSnapshot);
  document.getElementById("snap-refresh").addEventListener("click", loadSnapshots);
  await loadSnapshots();
}

async function loadSnapshots() {
  var host = document.getElementById("snap-list");
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading snapshots…</div></div>';
  try {
    var r = await fetch("/snapshots", {
      headers: { "Authorization": "Bearer " + DEMO_KEY },
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.snapshots.list = data.snapshots || [];
    var countEl = document.getElementById("snap-count");
    if (countEl) countEl.textContent = state.snapshots.list.length;
    _renderSnapList();
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function _renderSnapList() {
  var host = document.getElementById("snap-list");
  if (!host) return;
  if (state.snapshots.list.length === 0) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">No snapshots yet</div><div class="empty-desc">Compose a set in the <strong>Composer</strong> tab, come back here, and hit <strong>Save snapshot</strong>.</div></div>';
    return;
  }
  var selected = new Set(state.snapshots.diffPair);
  host.innerHTML = '<div class="snap-rows">' + state.snapshots.list.map(function (e) {
    var picked = selected.has(e.id);
    var tags = (e.tags || []).map(function (t) { return '<span class="pill pill-muted mono" style="font-size:10px;margin-right:3px">' + escapeHtml(t) + '</span>'; }).join("");
    var when = new Date(e.saved_at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return '<div class="snap-row' + (picked ? ' snap-row-picked' : '') + '" data-id="' + escapeHtml(e.id) + '">' +
      '<div class="snap-row-main">' +
        '<div class="snap-row-name">' + escapeHtml(e.name) + '</div>' +
        '<div class="snap-row-meta mono">' + escapeHtml(when) + ' · reach ' + fmtNumber(e.reach_at_save || 0) + '</div>' +
        (tags ? '<div style="margin-top:4px">' + tags + '</div>' : '') +
      '</div>' +
      '<div class="snap-row-actions">' +
        '<button class="btn-secondary snap-diff-btn" data-id="' + escapeHtml(e.id) + '">' + (picked ? '✓ for diff' : 'mark diff') + '</button>' +
        '<button class="btn-secondary snap-del-btn" data-id="' + escapeHtml(e.id) + '" title="Delete"><svg class="ico"><use href="#icon-close"/></svg></button>' +
      '</div>' +
    '</div>';
  }).join("") + '</div>';
  host.querySelectorAll(".snap-diff-btn").forEach(function (b) {
    b.addEventListener("click", function () { toggleSnapDiff(b.dataset.id); });
  });
  host.querySelectorAll(".snap-del-btn").forEach(function (b) {
    b.addEventListener("click", function () { deleteSnapshot(b.dataset.id); });
  });
}

async function saveSnapshot() {
  var nameEl = document.getElementById("snap-name");
  var noteEl = document.getElementById("snap-note");
  var tagsEl = document.getElementById("snap-tags");
  var name = (nameEl.value || "").trim();
  if (!name) { showToast("Name required.", true); return; }
  if (state.composer.inc.length === 0 && state.composer.itx.length === 0) {
    showToast("Compose an audience first (at least one include or intersect signal).", true);
    return;
  }
  var composition = {
    include:   state.composer.inc.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean),
    intersect: state.composer.itx.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean),
    exclude:   state.composer.exc.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean),
  };
  var seedEl = document.getElementById("comp-lal-seed");
  var kEl = document.getElementById("comp-lal-k");
  var minEl = document.getElementById("comp-lal-min");
  if (seedEl && seedEl.value) {
    composition.lookalike = { seed_signal_id: seedEl.value, k: Number(kEl && kEl.value) || 8, min_cosine: Number(minEl && minEl.value) || 0 };
  }
  var reachAtSave = state.composer.lastCompose && state.composer.lastCompose.reach && state.composer.lastCompose.reach.final || 0;
  var tags = (tagsEl.value || "").split(",").map(function (t) { return t.trim(); }).filter(Boolean);
  var body = { name: name, note: noteEl.value || "", tags: tags, composition: composition, reach_at_save: reachAtSave };
  try {
    var r = await fetch("/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
      body: JSON.stringify(body),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    showToast("Saved snapshot “" + name + "”");
    nameEl.value = ""; noteEl.value = ""; tagsEl.value = "";
    await loadSnapshots();
  } catch (e) {
    showToast(e.message, true);
  }
}

async function deleteSnapshot(id) {
  try {
    var r = await fetch("/snapshots/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: { "Authorization": "Bearer " + DEMO_KEY },
    });
    if (!r.ok) { var data = await r.json(); throw new Error(data.error || "HTTP " + r.status); }
    state.snapshots.diffPair = state.snapshots.diffPair.filter(function (x) { return x !== id; });
    await loadSnapshots();
  } catch (e) {
    showToast(e.message, true);
  }
}

function toggleSnapDiff(id) {
  var pair = state.snapshots.diffPair.slice();
  var idx = pair.indexOf(id);
  if (idx >= 0) pair.splice(idx, 1);
  else {
    if (pair.length >= 2) pair.shift();
    pair.push(id);
  }
  state.snapshots.diffPair = pair;
  _renderSnapList();
  if (pair.length === 2) runSnapDiff();
}

async function runSnapDiff() {
  var host = document.getElementById("snap-diff");
  var pair = state.snapshots.diffPair;
  if (pair.length !== 2) return;
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Diffing…</div></div>';
  try {
    var r = await fetch("/snapshots/diff", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
      body: JSON.stringify({ a: pair[0], b: pair[1] }),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    _renderSnapDiff(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function _renderSnapDiff(data) {
  var host = document.getElementById("snap-diff");
  function facetBlock(label, d) {
    var add = (d.added || []).length, rem = (d.removed || []).length, kept = (d.kept || []).length;
    return '<div class="snap-diff-facet">' +
      '<div class="snap-diff-facet-head">' + escapeHtml(label) +
        ' <span class="mono" style="color:var(--text-mut);font-weight:400;margin-left:6px">+' + add + ' · −' + rem + ' · =' + kept + '</span>' +
      '</div>' +
      (add > 0 ? '<div class="snap-diff-line snap-add">+ ' + d.added.map(escapeHtml).join(", ") + '</div>' : '') +
      (rem > 0 ? '<div class="snap-diff-line snap-rem">− ' + d.removed.map(escapeHtml).join(", ") + '</div>' : '') +
    '</div>';
  }
  var dr = data.delta_reach || 0;
  var header =
    '<div class="snap-diff-header">' +
      '<div><div class="k">A</div><div class="v">' + escapeHtml(data.a.name) + '</div><div class="sub mono">' + fmtNumber(data.a.reach_at_save) + '</div></div>' +
      '<div><div class="k">B</div><div class="v">' + escapeHtml(data.b.name) + '</div><div class="sub mono">' + fmtNumber(data.b.reach_at_save) + '</div></div>' +
      '<div><div class="k">Δ reach</div><div class="v mono" style="color:' + (dr >= 0 ? 'var(--success)' : 'var(--error)') + '">' + (dr >= 0 ? '+' : '') + fmtNumber(dr) + '</div></div>' +
      (data.lookalike_changed ? '<div><div class="k">Lookalike</div><div class="v pill pill-warning">changed</div></div>' : '') +
    '</div>';
  host.innerHTML = header +
    facetBlock("Include", data.include || {}) +
    facetBlock("Intersect", data.intersect || {}) +
    facetBlock("Exclude", data.exclude || {});
}

// ─────────────────────────────────────────────────────────────────────────
// Sec-45: Signal Freshness — per-signal x_analytics facets (half-life,
// volatility, authority, stability). All data comes from the already-
// loaded catalog — no new endpoint needed.
// ─────────────────────────────────────────────────────────────────────────
var _freshnessLoaded = false;

async function ensureFreshness() {
  if (_freshnessLoaded) return;
  _freshnessLoaded = true;
  if (state.catalog.all.length === 0) await loadCatalog();
  state.freshness.rows = _freshnessExtractRows();
  document.querySelectorAll("#fresh-table th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var col = th.dataset.sort;
      if (state.freshness.sortCol === col) {
        state.freshness.sortDir = state.freshness.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.freshness.sortCol = col;
        state.freshness.sortDir = (col === "name" || col === "vertical" || col === "stability") ? "asc" : "desc";
      }
      _freshnessRender();
    });
  });
  _freshnessRender();
}

function _freshnessExtractRows() {
  return (state.catalog.all || []).map(function (s) {
    var xa = s.x_analytics || {};
    return {
      id: s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "",
      name: s.name || "(unnamed)",
      vertical: verticalOf(s),
      halflife: Number(xa.decayHalfLifeDays) || 0,
      volatility: Number(xa.volatilityIndex) || 0,
      authority: Number(xa.authorityScore) || 0,
      stability: xa.idStabilityClass || "unknown",
      reach: Number(s.estimated_audience_size) || 0,
    };
  });
}

function _freshnessRender() {
  var rows = (state.freshness.rows || []).slice();
  var col = state.freshness.sortCol;
  var dir = state.freshness.sortDir;
  var stabOrder = { stable: 0, "semi-stable": 1, "semi_stable": 1, volatile: 2, unknown: 3 };
  rows.sort(function (a, b) {
    var av = a[col], bv = b[col];
    if (col === "stability") { av = stabOrder[av] != null ? stabOrder[av] : 99; bv = stabOrder[bv] != null ? stabOrder[bv] : 99; }
    if (typeof av === "string") { var cmp = av.localeCompare(bv); return dir === "asc" ? cmp : -cmp; }
    return dir === "asc" ? av - bv : bv - av;
  });
  // Update th arrows
  document.querySelectorAll("#fresh-table th[data-sort]").forEach(function (th) {
    th.classList.remove("fresh-sort-asc", "fresh-sort-desc");
    if (th.dataset.sort === col) th.classList.add(dir === "asc" ? "fresh-sort-asc" : "fresh-sort-desc");
  });
  var tbody = document.querySelector("#fresh-table tbody");
  if (!tbody) return;
  tbody.innerHTML = rows.map(function (r) {
    var hlCls = r.halflife < 7 ? "fresh-warn" : r.halflife < 30 ? "fresh-warm" : "";
    var stabCls = "fresh-stab-" + (r.stability || "unknown").replace("_", "-");
    var volCls = r.volatility > 60 ? "fresh-warn" : r.volatility > 30 ? "fresh-warm" : "";
    var authCls = r.authority >= 80 ? "fresh-good" : r.authority < 40 ? "fresh-warn" : "";
    return '<tr>' +
      '<td class="fresh-name"><div>' + escapeHtml(r.name) + '</div><div class="signal-id">' + escapeHtml(r.id) + '</div></td>' +
      '<td>' + escapeHtml(r.vertical) + '</td>' +
      '<td class="mono ' + hlCls + '">' + r.halflife.toFixed(1) + '</td>' +
      '<td class="mono ' + volCls + '">' + r.volatility.toFixed(0) + '</td>' +
      '<td class="mono ' + authCls + '">' + r.authority.toFixed(0) + '</td>' +
      '<td><span class="pill ' + stabCls + '">' + escapeHtml(r.stability) + '</span></td>' +
      '<td class="mono">' + fmtNumber(r.reach) + '</td>' +
    '</tr>';
  }).join("");
  // Warnings list: signals with halflife < 7
  var warnHost = document.getElementById("fresh-warnings");
  if (warnHost) {
    var warn = rows.filter(function (r) { return r.halflife > 0 && r.halflife < 7; });
    if (warn.length === 0) {
      warnHost.innerHTML = '';
    } else {
      warnHost.innerHTML =
        '<div class="fresh-warning-block">' +
          '<div class="fresh-warning-head">' + warn.length + ' signal' + (warn.length === 1 ? '' : 's') + ' with half-life &lt; 7 days — refresh required before each flight</div>' +
          '<div class="fresh-warning-body">' + warn.slice(0, 10).map(function (r) {
            return '<span class="pill pill-warning" style="font-size:10.5px;margin:3px">' + escapeHtml(r.name) + ' · ' + r.halflife.toFixed(1) + 'd</span>';
          }).join("") + (warn.length > 10 ? '<span style="color:var(--text-mut);font-size:11px;margin-left:6px">+' + (warn.length - 10) + ' more</span>' : '') + '</div>' +
        '</div>';
    }
  }
  var explHost = document.getElementById("fresh-explainer");
  if (explHost && !explHost.innerHTML) {
    explHost.innerHTML = renderChartExplainer({
      what: "Per-signal data-quality facets derived at mapper time from the Sec-41 x_analytics block.",
      how: "Half-life = exponential-decay parameter estimated from observed refresh cadence + category norms. Volatility = coefficient-of-variation over the monthly seasonality profile, 0–100 scaled. Authority = DTS methodology score (provenance + scale + freshness + licensing). Stability class = stable if IDs persist across flights, semi-stable if partial churn, volatile if large churn window-to-window.",
      read: "For planning-heavy buys (upper-funnel, long flights) prioritize <strong>stable + low-volatility + high-authority</strong>. For time-sensitive campaigns (event-based, retail triggers) a short half-life is a feature, not a bug — just refresh before each flight.",
      limits: "All four facets are deterministic derivations from catalog metadata. They don't replace a clean-room validation; for regulated verticals treat them as planning signals, not audit evidence.",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sec-47: Expression Tree Builder — visual boolean AST over catalog signals.
// Tree nodes: { type:"signal", id, signal_id? } | { type:"op", id, op, children }.
// Invariants (enforced client + server): depth ≤ 5, nodes ≤ 30, NOT only
// under AND. Drag-and-drop reparents any node to any group, blocking drops
// into own descendants.
// ─────────────────────────────────────────────────────────────────────────
var _exprLoaded = false;
var EXPR_MAX_DEPTH = 5;
var EXPR_MAX_NODES = 30;

async function ensureExpression() {
  if (_exprLoaded) return;
  _exprLoaded = true;
  if (state.catalog.all.length === 0) await loadCatalog();
  if (!state.expression.tree) {
    state.expression.tree = _exprNewGroup("OR", [_exprNewLeaf(), _exprNewLeaf()]);
  }
  _exprRender();
  document.getElementById("expr-reset").addEventListener("click", function () {
    if (!window.confirm("Reset the tree? All current nodes will be cleared.")) return;
    state.expression.tree = _exprNewGroup("OR", [_exprNewLeaf(), _exprNewLeaf()]);
    state.expression.lastResult = null;
    _exprRender();
  });
  document.getElementById("expr-run").addEventListener("click", runExpression);
  document.getElementById("expr-save-btn").addEventListener("click", saveExpressionSnapshot);
}

function _exprNextId() {
  var n = state.expression.nextId || 1;
  state.expression.nextId = n + 1;
  return "n" + n;
}
function _exprNewLeaf() {
  return { type: "signal", id: _exprNextId(), signal_id: "" };
}
function _exprNewGroup(op, children) {
  return { type: "op", id: _exprNextId(), op: op, children: (children || []).slice() };
}

// Walk the tree. cb(node, parent, indexInParent, depth). depth starts at 1 for root.
function _exprWalk(node, cb, parent, idx, depth) {
  parent = parent || null; idx = idx || 0; depth = depth || 1;
  cb(node, parent, idx, depth);
  if (node.type === "op") {
    for (var i = 0; i < node.children.length; i++) {
      _exprWalk(node.children[i], cb, node, i, depth + 1);
    }
  }
}

function _exprCountNodesAndDepth() {
  var root = state.expression.tree;
  if (!root) return { nodes: 0, depth: 0 };
  var n = 0, d = 0;
  _exprWalk(root, function (_node, _p, _i, depth) {
    n++;
    if (depth > d) d = depth;
  });
  return { nodes: n, depth: d };
}

function _exprFindNode(id) {
  var found = null, foundParent = null, foundIdx = -1;
  _exprWalk(state.expression.tree, function (node, parent, idx) {
    if (node.id === id) { found = node; foundParent = parent; foundIdx = idx; }
  });
  return { node: found, parent: foundParent, idx: foundIdx };
}

function _exprIsDescendant(ancestor, descendantId) {
  if (ancestor.id === descendantId) return true;
  if (ancestor.type !== "op") return false;
  for (var i = 0; i < ancestor.children.length; i++) {
    if (_exprIsDescendant(ancestor.children[i], descendantId)) return true;
  }
  return false;
}

function _exprDetach(id) {
  var loc = _exprFindNode(id);
  if (!loc.node || !loc.parent) return null;
  loc.parent.children.splice(loc.idx, 1);
  return loc.node;
}

function _exprRender() {
  var canvas = document.getElementById("expr-canvas");
  if (!canvas) return;
  canvas.innerHTML = _exprRenderNode(state.expression.tree, null, 1);
  _exprWireNode(state.expression.tree);
  _exprUpdateCounters();
  _exprUpdateRunBtn();
}

function _exprRenderNode(node, parentOp, depth) {
  if (node.type === "signal") return _exprRenderLeaf(node, parentOp);
  return _exprRenderGroup(node, parentOp, depth);
}

function _exprRenderLeaf(node, parentOp) {
  var sig = node.signal_id ? state.catalog.all.find(function (s) {
    return (s.signal_agent_segment_id || (s.signal_id && s.signal_id.id)) === node.signal_id;
  }) : null;
  var reachTxt = "";
  var lastResult = state.expression.lastResult;
  if (lastResult) {
    var match = _exprFindResultNode(lastResult.root, node.id);
    if (match) reachTxt = '<span class="expr-node-reach mono">' + fmtNumber(match.reach) + '</span>';
  }
  var body = sig
    ? '<div class="expr-leaf-body"><div class="expr-leaf-name">' + escapeHtml(sig.name) + '</div>' +
      '<div class="expr-leaf-meta mono">' + fmtNumber(sig.estimated_audience_size) + ' · ' + escapeHtml(sig.category_type || "—") + '</div></div>'
    : '<div class="expr-leaf-body expr-leaf-empty"><span>Click to pick a signal</span></div>';
  var canNegate = parentOp === "AND";
  return '<div class="expr-node expr-leaf' + (sig ? '' : ' expr-leaf-unfilled') + '" data-id="' + escapeHtml(node.id) + '" draggable="true">' +
    '<span class="expr-drag-handle" title="Drag to reparent">⋮⋮</span>' +
    body +
    reachTxt +
    '<div class="expr-leaf-actions">' +
      (canNegate ? '<button class="expr-btn-ghost" data-expr-action="wrap-not" data-id="' + escapeHtml(node.id) + '" title="Wrap in NOT (exclude)">NOT</button>' : '') +
      '<button class="expr-btn-ghost" data-expr-action="pick" data-id="' + escapeHtml(node.id) + '" title="Pick signal">' + (sig ? '↻' : '+') + '</button>' +
      '<button class="expr-btn-ghost expr-btn-danger" data-expr-action="delete" data-id="' + escapeHtml(node.id) + '" title="Delete node">×</button>' +
    '</div>' +
    (state.expression.pickingLeafId === node.id ? _exprRenderLeafPicker(node.id) : '') +
  '</div>';
}

function _exprRenderLeafPicker(leafId) {
  return '<div class="expr-leaf-picker" data-leaf-id="' + escapeHtml(leafId) + '">' +
    '<input class="expr-leaf-picker-input" placeholder="Search catalog\u2026" autocomplete="off"/>' +
    '<div class="expr-leaf-picker-list" id="expr-picker-list-' + escapeHtml(leafId) + '"></div>' +
  '</div>';
}

function _exprRenderGroup(node, parentOp, depth) {
  var isRoot = depth === 1;
  var lastResult = state.expression.lastResult;
  var reachTxt = "";
  if (lastResult) {
    var match = _exprFindResultNode(lastResult.root, node.id);
    if (match) reachTxt = '<span class="expr-node-reach mono">' + fmtNumber(match.reach) + '</span>';
  }
  var opLabel = node.op === "OR" ? "Any (OR)" : node.op === "AND" ? "All (AND)" : "NOT";
  var opClass = "expr-op-" + node.op.toLowerCase();
  var isNot = node.op === "NOT";
  var childrenHtml = node.children.map(function (c) { return _exprRenderNode(c, node.op, depth + 1); }).join("");
  var addMenu = isNot ? "" :
    '<div class="expr-add-menu">' +
      '<button class="expr-btn-ghost" data-expr-action="add-signal" data-id="' + escapeHtml(node.id) + '">+ Signal</button>' +
      '<button class="expr-btn-ghost" data-expr-action="add-or" data-id="' + escapeHtml(node.id) + '">+ OR group</button>' +
      '<button class="expr-btn-ghost" data-expr-action="add-and" data-id="' + escapeHtml(node.id) + '">+ AND group</button>' +
      (node.op === "AND" ? '<button class="expr-btn-ghost" data-expr-action="add-not" data-id="' + escapeHtml(node.id) + '">+ NOT</button>' : '') +
    '</div>';
  var opSelector = isNot ? '<span class="expr-op-chip ' + opClass + '">NOT</span>' :
    '<span class="expr-op-chip ' + opClass + '" data-expr-action="toggle-op" data-id="' + escapeHtml(node.id) + '" title="Click to toggle OR/AND">' + escapeHtml(opLabel) + '</span>';
  return '<div class="expr-node expr-group ' + opClass + (isRoot ? ' expr-root' : '') + '" data-id="' + escapeHtml(node.id) + '"' + (isRoot ? '' : ' draggable="true"') + '>' +
    '<div class="expr-group-head">' +
      (isRoot ? '' : '<span class="expr-drag-handle" title="Drag to reparent">⋮⋮</span>') +
      opSelector +
      reachTxt +
      '<div class="expr-group-actions">' +
        (isRoot ? '' : '<button class="expr-btn-ghost expr-btn-danger" data-expr-action="delete" data-id="' + escapeHtml(node.id) + '" title="Delete group">×</button>') +
      '</div>' +
    '</div>' +
    '<div class="expr-group-body">' +
      (node.children.length === 0
        ? '<div class="expr-empty-group">Empty group — add a child below</div>'
        : childrenHtml) +
    '</div>' +
    addMenu +
  '</div>';
}

function _exprFindResultNode(root, id) {
  if (!root) return null;
  if (root.node_id === id) return root;
  if (root.children) {
    for (var i = 0; i < root.children.length; i++) {
      var hit = _exprFindResultNode(root.children[i], id);
      if (hit) return hit;
    }
  }
  return null;
}

function _exprWireNode(root) {
  var canvas = document.getElementById("expr-canvas");
  if (!canvas) return;
  // Action buttons (bubbling listener).
  canvas.onclick = function (ev) {
    var t = ev.target;
    while (t && t !== canvas && !(t.dataset && t.dataset.exprAction)) t = t.parentNode;
    if (!t || t === canvas) return;
    var action = t.dataset.exprAction;
    var id = t.dataset.id;
    _exprHandleAction(action, id);
    ev.stopPropagation();
  };
  _exprWireDragAndDrop(canvas);
  // If a leaf picker is open, wire it.
  if (state.expression.pickingLeafId) {
    _exprWireLeafPicker(state.expression.pickingLeafId);
  }
  void root;
}

function _exprHandleAction(action, id) {
  var loc = _exprFindNode(id);
  if (!loc.node && action !== "reset") return;
  var counters = _exprCountNodesAndDepth();
  switch (action) {
    case "pick":
      state.expression.pickingLeafId = state.expression.pickingLeafId === id ? null : id;
      _exprRender();
      break;
    case "wrap-not":
      // Replace the leaf with NOT(leaf).
      if (!loc.parent) return;
      if (loc.parent.op !== "AND") { showToast("NOT is only legal under AND.", true); return; }
      if (counters.nodes + 1 > EXPR_MAX_NODES) { showToast("Node cap reached.", true); return; }
      if (counters.depth + 1 > EXPR_MAX_DEPTH) { showToast("Depth cap reached.", true); return; }
      var wrapped = _exprNewGroup("NOT", [loc.node]);
      loc.parent.children[loc.idx] = wrapped;
      _exprRender();
      break;
    case "delete":
      if (!loc.parent) return;  // root can't be deleted here
      loc.parent.children.splice(loc.idx, 1);
      // If the parent is now empty (and it's an op), leave it — user can add children back or delete it.
      if (state.expression.pickingLeafId === id) state.expression.pickingLeafId = null;
      _exprRender();
      break;
    case "toggle-op":
      if (loc.node.type !== "op") return;
      if (loc.node.op === "OR") loc.node.op = "AND";
      else if (loc.node.op === "AND") loc.node.op = "OR";
      // Don't toggle NOT here
      _exprRender();
      break;
    case "add-signal":
    case "add-or":
    case "add-and":
    case "add-not":
      if (loc.node.type !== "op") return;
      if (counters.nodes + 1 > EXPR_MAX_NODES) { showToast("Node cap reached (" + EXPR_MAX_NODES + ").", true); return; }
      var newDepth = _exprDepthOf(id) + 1;
      if (newDepth > EXPR_MAX_DEPTH) { showToast("Depth cap reached (" + EXPR_MAX_DEPTH + ").", true); return; }
      var child = null;
      if (action === "add-signal") child = _exprNewLeaf();
      else if (action === "add-or") child = _exprNewGroup("OR", [_exprNewLeaf(), _exprNewLeaf()]);
      else if (action === "add-and") child = _exprNewGroup("AND", [_exprNewLeaf(), _exprNewLeaf()]);
      else if (action === "add-not") {
        if (loc.node.op !== "AND") { showToast("NOT only legal under AND.", true); return; }
        child = _exprNewGroup("NOT", [_exprNewLeaf()]);
      }
      if (child) loc.node.children.push(child);
      _exprRender();
      break;
  }
}

function _exprDepthOf(id) {
  var d = 0;
  _exprWalk(state.expression.tree, function (node, _p, _i, depth) {
    if (node.id === id) d = depth;
  });
  return d;
}

function _exprWireDragAndDrop(canvas) {
  // dragstart on any node, dragover/drop on any group body.
  canvas.ondragstart = function (ev) {
    var t = ev.target;
    while (t && t !== canvas && !(t.dataset && t.dataset.id && t.draggable)) t = t.parentNode;
    if (!t || t === canvas) return;
    state.expression.draggedNodeId = t.dataset.id;
    try { ev.dataTransfer.setData("text/plain", t.dataset.id); ev.dataTransfer.effectAllowed = "move"; } catch (_e) {}
    t.classList.add("expr-dragging");
  };
  canvas.ondragend = function () {
    state.expression.draggedNodeId = null;
    Array.prototype.forEach.call(canvas.querySelectorAll(".expr-dragging,.expr-drop-target"), function (el) {
      el.classList.remove("expr-dragging", "expr-drop-target");
    });
  };
  canvas.ondragover = function (ev) {
    var group = _exprFindGroupDropTarget(ev.target);
    if (!group) return;
    var draggedId = state.expression.draggedNodeId;
    if (!draggedId) return;
    var targetId = group.dataset.id;
    if (targetId === draggedId) return;
    var targetNode = _exprFindNode(targetId).node;
    var draggedNode = _exprFindNode(draggedId).node;
    if (!targetNode || !draggedNode) return;
    // Descendant-guard: can't drop a node into its own subtree.
    if (_exprIsDescendant(draggedNode, targetId)) return;
    // NOT groups are unary — refuse drops if already has a child.
    if (targetNode.op === "NOT" && targetNode.children.length >= 1) return;
    ev.preventDefault();
    group.classList.add("expr-drop-target");
  };
  canvas.ondragleave = function (ev) {
    var group = _exprFindGroupDropTarget(ev.target);
    if (group) group.classList.remove("expr-drop-target");
  };
  canvas.ondrop = function (ev) {
    var group = _exprFindGroupDropTarget(ev.target);
    if (!group) return;
    var draggedId = state.expression.draggedNodeId;
    if (!draggedId) return;
    var targetId = group.dataset.id;
    if (targetId === draggedId) return;
    ev.preventDefault();
    var draggedNode = _exprFindNode(draggedId).node;
    if (!draggedNode) return;
    if (_exprIsDescendant(draggedNode, targetId)) return;
    var targetNode = _exprFindNode(targetId).node;
    if (!targetNode || targetNode.type !== "op") return;
    if (targetNode.op === "NOT" && targetNode.children.length >= 1) return;
    // NOT-only-under-AND invariant: if the dragged node is a NOT group, only
    // accept it under AND parents.
    if (draggedNode.type === "op" && draggedNode.op === "NOT" && targetNode.op !== "AND") {
      showToast("NOT is only legal under AND.", true); return;
    }
    // Detach, then append to target.
    var detached = _exprDetach(draggedId);
    if (!detached) return;
    targetNode.children.push(detached);
    state.expression.draggedNodeId = null;
    _exprRender();
  };
}

function _exprFindGroupDropTarget(node) {
  // Walk up to the nearest expr-group element.
  while (node && node.classList) {
    if (node.classList.contains("expr-group")) return node;
    node = node.parentNode;
  }
  return null;
}

function _exprWireLeafPicker(leafId) {
  var input = document.querySelector('.expr-leaf-picker[data-leaf-id="' + leafId + '"] .expr-leaf-picker-input');
  if (!input) return;
  setTimeout(function () { try { input.focus(); } catch (_e) {} }, 10);
  var render = function (q) {
    var host = document.getElementById("expr-picker-list-" + leafId);
    if (!host) return;
    var rows = (state.catalog.all || []).slice();
    if (q) rows = rows.filter(function (s) {
      return (s.name || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
    });
    rows = rows.slice(0, 12);
    if (rows.length === 0) {
      host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:6px 0">No matches.</div>';
      return;
    }
    host.innerHTML = rows.map(function (s) {
      var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
      return '<div class="expr-leaf-picker-row" data-sid="' + escapeHtml(sid) + '">' +
        '<div class="expr-leaf-picker-name">' + escapeHtml(s.name) + '</div>' +
        '<div class="expr-leaf-picker-meta mono">' + fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "—") + '</div>' +
      '</div>';
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".expr-leaf-picker-row"), function (el) {
      el.addEventListener("click", function () {
        var sid = el.dataset.sid;
        var loc = _exprFindNode(leafId);
        if (!loc.node) return;
        loc.node.signal_id = sid;
        state.expression.pickingLeafId = null;
        _exprRender();
      });
    });
  };
  render("");
  input.addEventListener("input", function () { render(input.value.trim().toLowerCase()); });
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") { state.expression.pickingLeafId = null; _exprRender(); }
  });
}

function _exprUpdateCounters() {
  var counters = _exprCountNodesAndDepth();
  var n = document.getElementById("expr-count-nodes");
  var d = document.getElementById("expr-count-depth");
  if (n) n.textContent = counters.nodes;
  if (d) d.textContent = counters.depth;
  var wrap = document.getElementById("expr-counters");
  if (wrap) {
    wrap.classList.toggle("expr-counters-warn", counters.nodes >= EXPR_MAX_NODES * 0.8 || counters.depth >= EXPR_MAX_DEPTH);
  }
}

function _exprUpdateRunBtn() {
  var btn = document.getElementById("expr-run");
  if (!btn) return;
  // Tree is runnable if every leaf has a signal_id and every group is valid.
  var ok = true;
  _exprWalk(state.expression.tree, function (node) {
    if (node.type === "signal" && !node.signal_id) ok = false;
    if (node.type === "op") {
      if (node.op === "NOT" && node.children.length !== 1) ok = false;
      if ((node.op === "OR" || node.op === "AND") && node.children.length < 2) ok = false;
    }
  });
  btn.disabled = !ok;
}

// Strip client-only runtime fields before sending to server.
function _exprSerialize(node) {
  if (node.type === "signal") return { type: "signal", id: node.id, signal_id: node.signal_id };
  return { type: "op", id: node.id, op: node.op, children: node.children.map(_exprSerialize) };
}

async function runExpression() {
  var host = document.getElementById("expr-result");
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Evaluating expression\u2026</div></div>';
  try {
    var r = await fetch("/audience/compose-ast", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ast: _exprSerialize(state.expression.tree) }),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.expression.lastResult = data;
    _renderExprResult(data);
    _exprRender();  // re-render tree so per-node reach pills show up
    document.getElementById("expr-save-panel").hidden = false;
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function _renderExprResult(data) {
  var host = document.getElementById("expr-result");
  var reach = data.reach || 0;
  var sigCount = (data.resolved_signal_ids || []).length;
  host.innerHTML =
    '<div class="expr-result-cards">' +
      '<div class="expr-result-card expr-result-primary">' +
        '<div class="k">Total reach</div>' +
        '<div class="v mono">' + fmtNumber(reach) + '</div>' +
      '</div>' +
      '<div class="expr-result-card">' +
        '<div class="k">Signals resolved</div>' +
        '<div class="v mono">' + sigCount + '</div>' +
      '</div>' +
      '<div class="expr-result-card">' +
        '<div class="k">Tree shape</div>' +
        '<div class="v mono">' + escapeHtml(_exprShapeSummary(data.root)) + '</div>' +
      '</div>' +
    '</div>';
  runExprPrivacyGate(reach, data.resolved_signal_ids || []);
  runExprHoldout(reach);
  var expl = document.getElementById("expr-explainer");
  if (expl) {
    expl.innerHTML = renderChartExplainer({
      what: "Arbitrary boolean expression over catalog signals, evaluated bottom-up into a single reach estimate.",
      how: "Every leaf returns its signal's reach. OR over leaves uses inclusion-exclusion with pairwise Jaccard. AND folds positives via intersect-decay and subtracts NOT-wrapped children via exclude-overlap. Between subtrees we synthesize a virtual composite signal carrying the subtree's reach and its dominant category, so the same heuristics compose recursively at any depth.",
      read: "Each node shows its subtree's reach in the tree above after you Compute. The total at the root is the whole expression's reach. <strong>Privacy</strong> + <strong>Incrementality</strong> blocks below run automatically — same math as the Composer.",
      limits: "Reach is estimated, not user-level. Subtree composition loses some pairwise detail vs flat lists; treat as a planning sketch, verify winning expressions in a clean-room before committing spend. Max depth 5, max 30 nodes.",
    });
  }
}

function _exprShapeSummary(root) {
  if (!root) return "—";
  var opCounts = { OR: 0, AND: 0, NOT: 0, leaf: 0 };
  (function walk(n) {
    if (n.type === "signal") { opCounts.leaf++; return; }
    if (n.op === "OR") opCounts.OR++;
    else if (n.op === "AND") opCounts.AND++;
    else if (n.op === "NOT") opCounts.NOT++;
    (n.children || []).forEach(walk);
  })(root);
  var parts = [];
  if (opCounts.AND) parts.push(opCounts.AND + " AND");
  if (opCounts.OR) parts.push(opCounts.OR + " OR");
  if (opCounts.NOT) parts.push(opCounts.NOT + " NOT");
  parts.push(opCounts.leaf + " signals");
  return parts.join(" · ");
}

async function runExprPrivacyGate(cohortSize, signalIds) {
  var host = document.getElementById("expr-privacy");
  if (!host) return;
  if (cohortSize <= 0 || signalIds.length === 0) { host.innerHTML = ""; return; }
  try {
    var r = await fetch("/audience/privacy-check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal_ids: signalIds.slice(0, 20), cohort_size: cohortSize }),
    });
    var data = await r.json();
    if (!r.ok || data.error) { host.innerHTML = ""; return; }
    var statusColor = data.status === "ok" ? "var(--success)" : data.status === "warn" ? "var(--warning)" : "var(--error)";
    var statusLabel = data.status === "ok" ? "Ok to activate" : data.status === "warn" ? "Warning" : "Blocked";
    var reasons = (data.reasons || []).map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join("");
    host.innerHTML =
      '<div class="privacy-gate" style="border-left:3px solid ' + statusColor + '">' +
        '<div class="privacy-title"><strong>Privacy gate: ' + statusLabel + '</strong>' +
          '<span class="mono" style="color:var(--text-mut);margin-left:10px">k-anon floor ' + data.min_k + ' · cohort ' + fmtNumber(data.cohort_size) + '</span></div>' +
        (reasons ? '<ul class="privacy-reasons">' + reasons + '</ul>' : '<div style="color:var(--text-mut);font-size:11.5px">No privacy concerns flagged.</div>') +
      '</div>';
  } catch (_e) { host.innerHTML = ""; }
}

async function runExprHoldout(reach) {
  var host = document.getElementById("expr-holdout");
  if (!host) return;
  if (reach <= 0) { host.innerHTML = ""; return; }
  try {
    var r = await fetch("/audience/holdout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reach: reach, holdout_pct: 0.10, baseline_conversion_rate: 0.02 }),
    });
    var data = await r.json();
    if (!r.ok || data.error) { host.innerHTML = ""; return; }
    host.innerHTML =
      '<div class="holdout-block">' +
        '<div class="holdout-title">Incrementality plan <span class="mono" style="color:var(--text-mut);font-weight:400;margin-left:8px">(10% holdout · 2% baseline CR · \u03b1=0.05 · 80% power)</span></div>' +
        '<div class="holdout-stats">' +
          '<div><div class="k">Exposed</div><div class="v">' + fmtNumber(data.exposed_size) + '</div></div>' +
          '<div><div class="k">Control</div><div class="v">' + fmtNumber(data.control_size) + '</div></div>' +
          '<div><div class="k">MDE (abs)</div><div class="v mono">' + (data.mde_absolute * 100).toFixed(2) + '%</div></div>' +
          '<div><div class="k">MDE (rel)</div><div class="v mono">' + (data.mde_relative * 100).toFixed(1) + '%</div></div>' +
        '</div>' +
      '</div>';
  } catch (_e) { host.innerHTML = ""; }
}

async function saveExpressionSnapshot() {
  var nameEl = document.getElementById("expr-save-name");
  var tagsEl = document.getElementById("expr-save-tags");
  var name = (nameEl.value || "").trim();
  if (!name) { showToast("Snapshot name required.", true); return; }
  var lastResult = state.expression.lastResult;
  if (!lastResult) { showToast("Compute the expression first.", true); return; }
  var ast = _exprSerialize(state.expression.tree);
  var tags = (tagsEl.value || "").split(",").map(function (t) { return t.trim(); }).filter(Boolean);
  // Snapshot composition carries the AST in a new optional field; we also
  // project the resolved signals as an include list so older diff code
  // (which only understands include/intersect/exclude) can still produce
  // a useful view.
  var composition = {
    include: (lastResult.resolved_signal_ids || []).slice(),
    intersect: [],
    exclude: [],
    expression_ast: ast,
  };
  var body = {
    name: name,
    note: "Saved from Expression tab · " + _exprShapeSummary(lastResult.root),
    tags: tags,
    composition: composition,
    reach_at_save: lastResult.reach || 0,
  };
  try {
    var r = await fetch("/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
      body: JSON.stringify(body),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    showToast('Saved snapshot "' + name + '"');
    nameEl.value = ""; tagsEl.value = "";
  } catch (e) {
    showToast(e.message, true);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sec-48: Multi-Agent Orchestrator — live view + fan-out + capability matrix
// across every AdCP agent in our curated directory.
// ─────────────────────────────────────────────────────────────────────────
var _orchLoaded = false;

async function ensureOrchestrator() {
  if (_orchLoaded) return;
  _orchLoaded = true;
  document.getElementById("orch-refresh").addEventListener("click", runOrchProbeAll);
  document.getElementById("orch-run").addEventListener("click", runOrchFanout);
  document.getElementById("orch-matrix-run").addEventListener("click", runOrchMatrix);
  // Load static directory first, then kick off probe in parallel.
  await loadOrchDirectory();
  runOrchProbeAll();
}

async function loadOrchDirectory() {
  var host = document.getElementById("orch-agents");
  try {
    var r = await fetch("/agents/directory");
    var data = await r.json();
    state.orchestrator.directory = data.agents || [];
    var countEl = document.getElementById("orch-agents-count");
    if (countEl) countEl.textContent = data.count;
    _orchRenderAgentGrid();
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

async function runOrchProbeAll() {
  if (state.orchestrator.probing) return;
  state.orchestrator.probing = true;
  var btn = document.getElementById("orch-refresh");
  var label = btn ? btn.querySelector("span") : null;
  var origText = label ? label.textContent : "";
  if (label) label.textContent = "Probing\u2026";
  if (btn) btn.disabled = true;
  try {
    var r = await fetch("/agents/probe-all?timeout_ms=10000");
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.orchestrator.probe = data;
    _orchRenderAgentGrid();
    _orchRenderSummary();
  } catch (e) {
    showToast("Probe failed: " + e.message, true);
  } finally {
    state.orchestrator.probing = false;
    if (label) label.textContent = origText;
    if (btn) btn.disabled = false;
  }
}

function _orchRenderSummary() {
  var host = document.getElementById("orch-summary");
  if (!host) return;
  var probe = state.orchestrator.probe;
  if (!probe) { host.innerHTML = ""; return; }
  host.innerHTML =
    '<div class="orch-summary-cards">' +
      '<div class="orch-summary-card"><div class="k">Probed</div><div class="v mono">' + probe.count + '</div></div>' +
      '<div class="orch-summary-card orch-summary-ok"><div class="k">Alive</div><div class="v mono">' + probe.alive_count + '</div></div>' +
      '<div class="orch-summary-card"><div class="k">Down</div><div class="v mono">' + (probe.count - probe.alive_count) + '</div></div>' +
      '<div class="orch-summary-card"><div class="k">Avg latency</div><div class="v mono">' + probe.avg_latency_ms + ' ms</div></div>' +
      '<div class="orch-summary-card"><div class="k">Probed at</div><div class="v mono" style="font-size:11px">' + escapeHtml(probe.probed_at) + '</div></div>' +
    '</div>';
}

function _orchRenderAgentGrid() {
  var host = document.getElementById("orch-agents");
  if (!host) return;
  var agents = state.orchestrator.directory || [];
  if (agents.length === 0) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">No agents in directory</div></div>';
    return;
  }
  // Build per-agent probe lookup.
  var probeByUrl = {};
  if (state.orchestrator.probe) {
    (state.orchestrator.probe.results || []).forEach(function (r) { probeByUrl[r.mcp_url] = r; });
  }
  // Group by role + stage for grid layout.
  var groups = { signals: [], buying: [], creative: [], unclassified: [] };
  var byStage = { live: [], known_issue: [], roadmap: [] };
  agents.forEach(function (a) {
    byStage[a.stage] = byStage[a.stage] || [];
    byStage[a.stage].push(a);
  });
  function renderAgent(a) {
    var probe = a.mcp_url ? probeByUrl[a.mcp_url] : null;
    var probeInfo = probe ? probe.probe : null;
    var alive = probeInfo && probeInfo.alive;
    var status = a.stage === "roadmap" ? "roadmap" :
                 a.stage === "known_issue" ? "issue" :
                 !probeInfo ? "unknown" :
                 alive ? "alive" : "down";
    var statusClass = "orch-agent-" + status;
    var pillClass = status === "alive" ? "pill-success" :
                    status === "down" ? "pill-error" :
                    status === "issue" ? "pill-warning" :
                    status === "roadmap" ? "pill-muted" : "pill-muted";
    var pillLabel = status === "alive" ? "alive" : status === "down" ? "down" :
                    status === "issue" ? "issues" : status === "roadmap" ? "roadmap" : "unknown";
    var toolCount = probeInfo && probeInfo.tools ? probeInfo.tools.length : (a.directory_tool_count != null ? a.directory_tool_count : "—");
    var toolSource = probeInfo && probeInfo.tools ? "live" : "dir";
    var latency = probeInfo ? probeInfo.latency_ms + " ms" : "—";
    var serverInfo = probeInfo && probeInfo.server_info ? (probeInfo.server_info.name || "") + (probeInfo.server_info.version ? " " + probeInfo.server_info.version : "") : "";
    var roleBadge = '<span class="orch-role-badge orch-role-' + a.role + '">' + escapeHtml(a.role) + '</span>';
    // Double-escape the slashes: the SCRIPT_TAG body is a TS template
    // literal, so single-backslash-slash collapses to a plain slash at
    // emission and the regex becomes /^https?:/// which JS reads as a
    // regex followed by a line comment — missing ) after argument list.
    // Using \\/\\/ here so the served JS sees \/\/.
    var urlShort = a.mcp_url ? a.mcp_url.replace(/^https?:\\/\\//, "").slice(0, 50) : "no endpoint";
    var errorLine = probeInfo && probeInfo.error && !alive
      ? '<div class="orch-agent-error mono">' + escapeHtml(String(probeInfo.error).slice(0, 80)) + '</div>'
      : '';
    var firstTools = probeInfo && probeInfo.tools ? probeInfo.tools.slice(0, 3).map(function (t) { return t.name; }).join(", ") : "";
    return '<div class="orch-agent-card ' + statusClass + '">' +
      '<div class="orch-agent-head">' +
        '<div class="orch-agent-name">' + escapeHtml(a.name) + '</div>' +
        '<span class="pill ' + pillClass + ' mono" style="font-size:10px">' + pillLabel + '</span>' +
      '</div>' +
      '<div class="orch-agent-meta">' + roleBadge +
        '<span class="mono" style="color:var(--text-mut);font-size:10.5px">' + escapeHtml(a.vendor) + '</span>' +
      '</div>' +
      '<div class="orch-agent-url mono" title="' + escapeHtml(a.mcp_url || "") + '">' + escapeHtml(urlShort) + '</div>' +
      '<div class="orch-agent-stats">' +
        '<div><div class="k">Tools</div><div class="v">' + toolCount + ' <span class="orch-small mono">(' + toolSource + ')</span></div></div>' +
        '<div><div class="k">Latency</div><div class="v">' + latency + '</div></div>' +
      '</div>' +
      (serverInfo ? '<div class="orch-agent-server mono">' + escapeHtml(serverInfo) + '</div>' : '') +
      (firstTools ? '<div class="orch-agent-tools mono">' + escapeHtml(firstTools) + (probeInfo.tools.length > 3 ? " +" + (probeInfo.tools.length - 3) : "") + '</div>' : '') +
      errorLine +
    '</div>';
  }
  var html = "";
  ["live", "known_issue", "roadmap"].forEach(function (stage) {
    var list = byStage[stage] || [];
    if (list.length === 0) return;
    var stageLabel = stage === "live" ? "Live" : stage === "known_issue" ? "Known Issues" : "Roadmap";
    html +=
      '<div class="orch-stage-section">' +
        '<div class="orch-stage-label">' + stageLabel + ' <span class="mono" style="color:var(--text-mut);font-weight:400;margin-left:6px">' + list.length + '</span></div>' +
        '<div class="orch-agent-grid">' + list.map(renderAgent).join("") + '</div>' +
      '</div>';
  });
  host.innerHTML = html;
  void groups;
}

async function runOrchFanout() {
  if (state.orchestrator.orchestrating) return;
  var briefEl = document.getElementById("orch-brief");
  var maxEl = document.getElementById("orch-max");
  var brief = (briefEl.value || "").trim();
  if (!brief) { showToast("Brief required.", true); return; }
  var maxResults = Number(maxEl.value) || 10;
  state.orchestrator.orchestrating = true;
  var host = document.getElementById("orch-results");
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Fanning out\u2026</div></div>';
  try {
    var r = await fetch("/agents/orchestrate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: brief, max_results_per_agent: maxResults, timeout_ms: 15000 }),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.orchestrator.orchestrate = data;
    _orchRenderFanoutResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  } finally {
    state.orchestrator.orchestrating = false;
  }
}

function _orchRenderFanoutResult(data) {
  var host = document.getElementById("orch-results");
  var summaryCards = (data.per_agent || []).map(function (p) {
    var cls = p.ok ? "orch-fanout-ok" : "orch-fanout-err";
    return '<div class="orch-fanout-card ' + cls + '">' +
      '<div class="orch-fanout-name">' + escapeHtml(p.name) + ' <span class="mono" style="color:var(--text-mut);font-size:10px">· ' + escapeHtml(p.vendor) + '</span></div>' +
      '<div class="orch-fanout-stats">' +
        '<span class="mono">' + (p.ok ? p.signal_count + " signals" : "failed") + '</span>' +
        '<span class="mono">' + p.latency_ms + ' ms</span>' +
      '</div>' +
      (p.error ? '<div class="orch-fanout-err-msg mono">' + escapeHtml(String(p.error).slice(0, 80)) + '</div>' : '') +
    '</div>';
  }).join("");
  var signals = data.signals || [];
  var signalRows = signals.slice(0, 50).map(function (s) {
    var sourceAgent = s.source_agent || "?";
    var badgeCls = sourceAgent === "evgeny_signals" ? "pill-success" : sourceAgent === "dstillery" ? "pill-info" : "pill-muted";
    return '<tr>' +
      '<td><span class="pill ' + badgeCls + ' mono" style="font-size:10px">' + escapeHtml(sourceAgent) + '</span></td>' +
      '<td>' + escapeHtml(s.name || "(unnamed)") + '</td>' +
      '<td class="mono">' + escapeHtml(s.signal_agent_segment_id || "") + '</td>' +
      '<td class="mono">' + (s.coverage_percentage != null ? (s.coverage_percentage * 100).toFixed(1) + "%" : "—") + '</td>' +
      '<td class="mono">' + (s.pricing && s.pricing.cpm != null ? "$" + s.pricing.cpm : "—") + '</td>' +
    '</tr>';
  }).join("");
  host.innerHTML =
    '<div class="orch-fanout-summary">' + summaryCards + '</div>' +
    '<div class="orch-fanout-totals mono">' +
      'Total: <strong>' + signals.length + '</strong> signals across <strong>' + data.agents_succeeded.length + '/' + data.agents_queried.length + '</strong> agents' +
    '</div>' +
    (signals.length > 0
      ? '<div style="overflow:auto;margin-top:10px"><table class="orch-signals-table"><thead><tr><th>Source</th><th>Name</th><th>Segment ID</th><th>Coverage</th><th>CPM</th></tr></thead><tbody>' + signalRows + '</tbody></table>' + (signals.length > 50 ? '<div style="color:var(--text-mut);font-size:11px;padding:6px 0">Showing first 50 of ' + signals.length + '.</div>' : '') + '</div>'
      : '<div class="empty-state" style="margin-top:10px"><div class="empty-desc">No signals returned from any agent. Check the per-agent summary above for per-agent errors.</div></div>');
}

async function runOrchMatrix() {
  if (state.orchestrator.matrixing) return;
  state.orchestrator.matrixing = true;
  var host = document.getElementById("orch-matrix");
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Building capability matrix\u2026</div></div>';
  try {
    var r = await fetch("/agents/capability-matrix?timeout_ms=10000");
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.orchestrator.matrix = data;
    _orchRenderMatrix(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  } finally {
    state.orchestrator.matrixing = false;
  }
}

function _orchRenderMatrix(data) {
  var host = document.getElementById("orch-matrix");
  var agents = data.agents || [];
  var tools = data.tools || [];
  if (agents.length === 0 || tools.length === 0) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">No tools discovered</div><div class="empty-desc">All agents either failed to probe or exposed no tools/list.</div></div>';
    return;
  }
  var headerCells = agents.map(function (a) {
    var title = escapeHtml(a.name) + " — " + (a.alive ? "alive" : "down");
    return '<th class="orch-matrix-agent" title="' + title + '"><div class="orch-matrix-agent-name">' + escapeHtml(a.id) + '</div><div class="orch-matrix-agent-meta mono">' + a.tool_count + ' tools</div></th>';
  }).join("");
  var rows = tools.map(function (t) {
    var cells = agents.map(function (a) {
      var supported = t.supported_by.indexOf(a.id) >= 0;
      return '<td class="' + (supported ? "orch-matrix-yes" : "orch-matrix-no") + '">' + (supported ? "●" : "") + '</td>';
    }).join("");
    return '<tr><td class="orch-matrix-tool mono">' + escapeHtml(t.tool) + '</td>' + cells + '</tr>';
  }).join("");
  var uniqueSummary = agents.filter(function (a) { return a.unique_tools && a.unique_tools.length > 0; }).map(function (a) {
    return '<div class="orch-matrix-unique-row"><span class="pill pill-accent mono" style="font-size:10px">' + escapeHtml(a.id) + '</span> <span class="mono" style="font-size:11px">' + escapeHtml(a.unique_tools.join(", ").slice(0, 100)) + '</span></div>';
  }).join("");
  host.innerHTML =
    '<div style="overflow:auto"><table class="orch-matrix-table"><thead><tr><th class="orch-matrix-tool-header">Tool</th>' + headerCells + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (uniqueSummary ? '<div style="margin-top:10px"><div class="lab-label">Unique tools per agent</div>' + uniqueSummary + '</div>' : '') +
    '<div style="font-size:11px;color:var(--text-mut);margin-top:8px">' + tools.length + ' tools across ' + agents.length + ' agents.</div>';
}

// ─── Federation (partial — more in Part 3) ───────────────────────────────
var _fedLoaded = false;
async function ensureFederation() {
  if (_fedLoaded) return;
  _fedLoaded = true;
  document.getElementById("fed-run").addEventListener("click", runFederatedSearch);
  renderAgentRegistry();
}
async function renderAgentRegistry() {
  var host = document.getElementById("fed-registry");
  try {
    var r = await fetch("/agents/registry");
    var data = await r.json();
    var cards = (data.agents || []).map(function (a) {
      var stageClass = a.stage === "live" ? "pill-success" : a.stage === "sandbox" ? "pill-info" : "pill-mut";
      var specs = (a.specialties || []).map(function (s) { return '<span class="pill pill-muted mono" style="margin-right:4px">' + escapeHtml(s) + '</span>'; }).join('');
      return '<div class="fed-card">' +
        '<div class="fed-card-head"><div class="fed-card-name">' + escapeHtml(a.name || a.id) + '</div><span class="pill ' + stageClass + '">' + escapeHtml(a.stage || 'unknown') + '</span></div>' +
        (a.mcp_url ? '<div class="fed-url mono">' + escapeHtml(a.mcp_url) + '</div>' : '') +
        (a.vendor ? '<div class="fed-vendor">' + escapeHtml(a.vendor) + '</div>' : '') +
        '<div class="fed-specs">' + specs + '</div>' +
      '</div>';
    }).join("");
    host.innerHTML = '<div class="fed-grid">' + cards + '</div>';
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Registry not yet deployed</div><div class="empty-desc">Part 3 of Sec-41 wires live Dstillery federation.</div></div>';
  }
}
// Federation shortlist — cross-agent selection that persists while the
// user tries different briefs. Each entry: { agent, signal }. Used by
// the bulk action bar (activate evgeny rows / copy TTD ids / export CSV /
// send to portfolio builder).
var _fedShortlist = [];
var _fedLastResults = [];

function fedSigKey(m) { return (m.source_agent || "?") + "::" + ((m.signal || {}).signal_agent_segment_id || ""); }

async function runFederatedSearch() {
  var host = document.getElementById("fed-results");
  var brief = document.getElementById("fed-brief").value.trim();
  if (!brief) { host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Enter a brief</div></div>'; return; }
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Fanning out to agents\u2026</div></div>';
  try {
    var r = await fetch("/agents/federated-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: brief, max_results_per_agent: parseInt(document.getElementById("fed-max").value, 10) || 5 }) });
    var data = await r.json();
    _fedLastResults = data.merged || [];
    renderFederatedResults(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">' + escapeHtml(String(e.message || e)) + '</div><div class="empty-desc">Federation endpoints may not be deployed yet.</div></div>';
  }
}

function renderFederatedResults(data) {
  var host = document.getElementById("fed-results");
  var merged = data.merged || [];
  var shortlistKeys = new Set(_fedShortlist.map(fedSigKey));

  // Summary: per-agent count + total time + CUMULATIVE reach + blended CPM
  var totalReach = 0, totalCostWeighted = 0;
  merged.forEach(function (m) {
    var s = m.signal || {};
    var sz = s.estimated_audience_size || 0;
    var cpm = (s.pricing_options && s.pricing_options[0] && s.pricing_options[0].cpm) || (s.pricing && s.pricing.cpm) || 0;
    totalReach += sz;
    totalCostWeighted += sz * cpm;
  });
  var blendedCpm = totalReach > 0 ? totalCostWeighted / totalReach : 0;

  var agentStats = Object.entries(data.per_agent_count || {}).map(function (kv) {
    var badge = kv[0] === "evgeny_signals" ? "pill-success" : kv[0] === "dstillery" ? "pill-info" : "pill-mut";
    return '<div class="lab-stat-card"><div class="lab-stat-label"><span class="pill ' + badge + '" style="font-size:10px">' + escapeHtml(kv[0]) + '</span></div><div class="lab-stat-val">' + kv[1] + '</div></div>';
  }).join('');
  var summary = '<div class="fed-summary-grid">' + agentStats +
    '<div class="lab-stat-card"><div class="lab-stat-label">Total potential reach</div><div class="lab-stat-val">' + (totalReach > 0 ? (totalReach / 1e6).toFixed(1) + 'M' : '\u2014') + '</div></div>' +
    '<div class="lab-stat-card"><div class="lab-stat-label">Blended CPM</div><div class="lab-stat-val">' + (blendedCpm > 0 ? '$' + blendedCpm.toFixed(2) : '\u2014') + '</div></div>' +
    '<div class="lab-stat-card"><div class="lab-stat-label">Round-trip</div><div class="lab-stat-val">' + (data.total_time_ms || 0) + 'ms</div></div>' +
    '</div>';

  // Rows
  var rowsHtml = merged.map(function (m, i) {
    var agent = m.source_agent;
    var sig = m.signal || {};
    var key = fedSigKey(m);
    var selected = shortlistKeys.has(key);
    var sid = sig.signal_agent_segment_id || "";
    var agentClass = agent === "evgeny_signals" ? "fed-row-evgeny" : agent === "dstillery" ? "fed-row-dstillery" : "";
    var agentPill = agent === "evgeny_signals" ? "pill-success" : agent === "dstillery" ? "pill-info" : "pill-mut";
    // Enriched fields
    var desc = sig.description ? escapeHtml(sig.description.slice(0, 120) + (sig.description.length > 120 ? "\u2026" : "")) : "";
    var cpm = 0;
    if (sig.pricing_options && sig.pricing_options[0]) cpm = sig.pricing_options[0].cpm;
    else if (sig.pricing && sig.pricing.cpm) cpm = sig.pricing.cpm;
    var reach = sig.estimated_audience_size;
    var coverage = sig.coverage_percentage;
    // Deployment target
    var deployment = "";
    if (Array.isArray(sig.deployments) && sig.deployments.length) {
      var d0 = sig.deployments[0];
      var platform = d0.platform || d0.type;
      var platformId = d0.decisioning_platform_segment_id || (d0.activation_key && d0.activation_key.segment_id);
      if (platform) deployment = platform + (platformId ? " \u00b7 id " + platformId : "");
    }
    // Action button — agent-specific
    var actionBtn;
    if (agent === "evgeny_signals") {
      actionBtn = '<button class="fed-action-btn primary" data-action="activate" data-sid="' + escapeHtml(sid) + '" title="Activate to mock_dsp"><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate</span></button>';
    } else if (agent === "dstillery") {
      var ttdId = deployment.match(/id (\d+)/) ? deployment.match(/id (\d+)/)[1] : (sig.deployments && sig.deployments[0] && sig.deployments[0].decisioning_platform_segment_id) || sid;
      actionBtn = '<button class="fed-action-btn" data-action="copy-ttd" data-ttd-id="' + escapeHtml(ttdId) + '" title="Copy TTD segment ID"><svg class="ico"><use href="#icon-check"/></svg><span>Copy TTD ID</span></button>';
    } else {
      actionBtn = '<button class="fed-action-btn" disabled>n/a</button>';
    }
    // Metric pills
    var metrics = [];
    if (reach) metrics.push('<span class="fed-metric">reach <strong>' + fmtNumber(reach) + '</strong></span>');
    if (coverage !== undefined && coverage !== null) metrics.push('<span class="fed-metric">coverage <strong>' + coverage.toFixed(2) + '%</strong></span>');
    if (cpm) metrics.push('<span class="fed-metric">CPM <strong>$' + cpm.toFixed(2) + '</strong></span>');
    if (deployment) metrics.push('<span class="fed-metric mono" style="font-size:10.5px">\u2192 ' + escapeHtml(deployment) + '</span>');

    return '<div class="fed-result-row ' + agentClass + (selected ? ' fed-row-selected' : '') + '" data-key="' + escapeHtml(key) + '" data-idx="' + i + '">' +
      '<label class="fed-check"><input type="checkbox" data-fed-check="' + escapeHtml(key) + '"' + (selected ? ' checked' : '') + '/></label>' +
      '<div class="err-rank">' + (i + 1) + '</div>' +
      '<div class="err-main">' +
        '<div class="err-name">' + escapeHtml(sig.name || sid || "(unnamed)") + '</div>' +
        (desc ? '<div class="fed-desc">' + desc + '</div>' : '') +
        (metrics.length ? '<div class="fed-metrics">' + metrics.join("") + '</div>' : '') +
        '<div class="err-sid mono">' + escapeHtml(sid) + '</div>' +
      '</div>' +
      '<div class="fed-row-actions">' +
        '<span class="pill ' + agentPill + '" style="font-size:10px">' + escapeHtml(agent) + '</span>' +
        actionBtn +
      '</div>' +
    '</div>';
  }).join("");

  // Sticky action bar
  var selectedCount = _fedShortlist.length;
  var actionBar =
    '<div class="fed-actionbar' + (selectedCount > 0 ? ' fed-actionbar-active' : '') + '">' +
      '<div class="fed-actionbar-info">' +
        (selectedCount > 0
          ? '<strong>' + selectedCount + '</strong> selected across agents'
          : 'Select rows to enable bulk actions') +
      '</div>' +
      '<button class="btn-secondary" id="fed-select-all" style="padding:4px 12px;font-size:11.5px">Select all</button>' +
      '<button class="btn-secondary" id="fed-clear" style="padding:4px 12px;font-size:11.5px">Clear</button>' +
      '<button class="btn-secondary" id="fed-export-csv" style="padding:4px 12px;font-size:11.5px"' + (selectedCount === 0 ? ' disabled' : '') + '><svg class="ico"><use href="#icon-book"/></svg><span>Export CSV</span></button>' +
      '<button class="btn-secondary" id="fed-compare" style="padding:4px 12px;font-size:11.5px"' + (selectedCount < 2 ? ' disabled' : '') + '><svg class="ico"><use href="#icon-grid"/></svg><span>Compare</span></button>' +
      '<button class="btn-primary" id="fed-activate-selected" style="padding:4px 12px;font-size:11.5px"' + (selectedCount === 0 ? ' disabled' : '') + '><svg class="ico"><use href="#icon-bolt"/></svg><span>Activate selected</span></button>' +
    '</div>';

  host.innerHTML = summary + actionBar +
    '<div class="fed-rows">' + (rowsHtml || '<div class="empty-state"><div class="empty-desc">No results from any agent.</div></div>') + '</div>' +
    '<div id="fed-compare-host"></div>';

  // Wire row clicks
  host.querySelectorAll('[data-fed-check]').forEach(function (cb) {
    cb.addEventListener('change', function (e) {
      e.stopPropagation();
      toggleFedShortlist(cb.dataset.fedCheck);
      renderFederatedResults({ merged: _fedLastResults, per_agent_count: data.per_agent_count, total_time_ms: data.total_time_ms });
    });
  });
  host.querySelectorAll('.fed-result-row').forEach(function (row) {
    row.addEventListener('click', function (e) {
      if (e.target.closest('input, button, label')) return;
      var idx = parseInt(row.dataset.idx, 10);
      var m = _fedLastResults[idx];
      if (!m) return;
      if (m.source_agent === "evgeny_signals") {
        openDetailHydrated(m.signal.signal_agent_segment_id, m.signal);
      } else if (m.source_agent === "dstillery") {
        openDstilleryDetail(m.signal);
      }
    });
  });
  host.querySelectorAll('[data-action="activate"]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      fedActivateSignal(btn.dataset.sid);
    });
  });
  host.querySelectorAll('[data-action="copy-ttd"]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var id = btn.dataset.ttdId;
      navigator.clipboard.writeText(id).then(function () { showToast("TTD segment id " + id + " copied"); }).catch(function () { showToast("Copy failed", true); });
    });
  });
  var selAll = document.getElementById("fed-select-all");
  if (selAll) selAll.onclick = function () { _fedShortlist = _fedLastResults.slice(); renderFederatedResults(data); };
  var clr = document.getElementById("fed-clear");
  if (clr) clr.onclick = function () { _fedShortlist = []; renderFederatedResults(data); };
  var exp = document.getElementById("fed-export-csv");
  if (exp) exp.onclick = function () { fedExportCsv(); };
  var cmp = document.getElementById("fed-compare");
  if (cmp) cmp.onclick = function () { fedCompareSelected(); };
  var act = document.getElementById("fed-activate-selected");
  if (act) act.onclick = function () { fedActivateSelected(); };

  document.getElementById("fed-explainer").innerHTML = renderChartExplainer({
    what: "Results from every AdCP Signals agent queried in parallel, merged with provenance badges. Each row is directly actionable.",
    how: "Parallel fan-out via MCP tools/call. Evgeny results come from our local catalog (with full deployment metadata). Dstillery results are native TTD segments — the 'Copy TTD ID' button gives you the exact segment_id for use inside TTD's UI.",
    read: "Check rows to shortlist across agents, then use the action bar: <strong>Activate selected</strong> fires evgeny signals to mock_dsp and copies Dstillery TTD IDs. <strong>Compare</strong> shows attributes side-by-side. <strong>Export CSV</strong> gives your planner a shareable shortlist.",
    limits: "Dstillery signals are activated via TTD, not our agent — we surface the segment_id they need. Future: direct TTD OAuth flow.",
  });
}

function toggleFedShortlist(key) {
  var idx = _fedShortlist.findIndex(function (m) { return fedSigKey(m) === key; });
  if (idx >= 0) { _fedShortlist.splice(idx, 1); return; }
  var hit = _fedLastResults.find(function (m) { return fedSigKey(m) === key; });
  if (hit) _fedShortlist.push(hit);
}

// Open an inline detail card for a Dstillery signal (not in our catalog,
// so the signal-detail panel can't hydrate).
function openDstilleryDetail(sig) {
  var host = document.getElementById("fed-compare-host");
  var deployments = (sig.deployments || []).map(function (d) {
    return '<div class="dstl-deploy"><strong>' + escapeHtml(d.platform || d.type || '') + '</strong> · <span class="mono">id ' + escapeHtml(String(d.decisioning_platform_segment_id || '')) + '</span>' + (d.is_live ? ' · <span class="pill pill-success" style="font-size:10px">live</span>' : '') + '</div>';
  }).join("");
  host.innerHTML = '<div class="dstl-detail">' +
    '<div class="dstl-head"><div class="dstl-title">' + escapeHtml(sig.name || '') + ' <span class="pill pill-info" style="margin-left:8px">dstillery</span></div>' +
      '<button class="detail-icon-btn" data-dstl-close="1" aria-label="Close"><svg class="ico"><use href="#icon-close"/></svg></button>' +
    '</div>' +
    (sig.description ? '<div class="dstl-desc">' + escapeHtml(sig.description) + '</div>' : '') +
    '<div class="dstl-grid">' +
      '<div class="lab-stat-card"><div class="lab-stat-label">Segment ID (ours)</div><div class="lab-stat-val mono" style="font-size:13px">' + escapeHtml(sig.signal_agent_segment_id || '') + '</div></div>' +
      '<div class="lab-stat-card"><div class="lab-stat-label">Coverage</div><div class="lab-stat-val">' + (sig.coverage_percentage !== undefined ? sig.coverage_percentage.toFixed(2) + '%' : '\u2014') + '</div></div>' +
      '<div class="lab-stat-card"><div class="lab-stat-label">CPM</div><div class="lab-stat-val">' + (sig.pricing && sig.pricing.cpm ? '$' + sig.pricing.cpm.toFixed(2) : '\u2014') + '</div></div>' +
      '<div class="lab-stat-card"><div class="lab-stat-label">Data provider</div><div class="lab-stat-val" style="font-size:13px">' + escapeHtml(sig.data_provider || 'Dstillery') + '</div></div>' +
    '</div>' +
    (deployments ? '<div class="dstl-section-label">Deployments (active on TTD)</div>' + deployments : '') +
    '<div class="dstl-hint">Dstillery signals activate via their Trade Desk partnership. Use the <strong>decisioning_platform_segment_id</strong> above inside TTD\u2019s UI to add this audience to your campaign. Future: direct TTD OAuth activation from this panel.</div>' +
  '</div>';
  host.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function fedActivateSignal(sid) {
  showToast("Activating " + sid + " to mock_dsp\u2026");
  try {
    var data = await callTool("activate_signal", { signal_agent_segment_id: sid, destination_platform: "mock_dsp" });
    showToast("\u2713 Activation submitted: " + (data.operation_id || "op pending"));
  } catch (e) {
    showToast("Activation failed: " + e.message, true);
  }
}

async function fedActivateSelected() {
  if (_fedShortlist.length === 0) return;
  var evg = _fedShortlist.filter(function (m) { return m.source_agent === "evgeny_signals"; });
  var dstill = _fedShortlist.filter(function (m) { return m.source_agent === "dstillery"; });
  var messages = [];
  // Activate evgeny signals in parallel
  if (evg.length) {
    showToast("Activating " + evg.length + " Evgeny signals\u2026");
    var results = await Promise.allSettled(evg.map(function (m) {
      return callTool("activate_signal", { signal_agent_segment_id: m.signal.signal_agent_segment_id, destination_platform: "mock_dsp" });
    }));
    var ok = results.filter(function (r) { return r.status === "fulfilled"; }).length;
    messages.push(ok + "/" + evg.length + " Evgeny activated");
  }
  // Copy all TTD IDs to clipboard
  if (dstill.length) {
    var ttdIds = dstill.map(function (m) {
      var d0 = (m.signal.deployments || [])[0];
      return (d0 && d0.decisioning_platform_segment_id) || m.signal.signal_agent_segment_id;
    }).filter(Boolean);
    try {
      await navigator.clipboard.writeText(ttdIds.join("\\n"));
      messages.push(dstill.length + " Dstillery TTD IDs copied");
    } catch { messages.push(dstill.length + " Dstillery IDs — copy failed"); }
  }
  showToast(messages.join(" \u00b7 "));
}

function fedExportCsv() {
  if (_fedShortlist.length === 0) return;
  var header = ["rank", "agent", "signal_id", "name", "reach", "cpm", "coverage_pct", "deployment_platform", "deployment_id"];
  function esc(v) { var s = v === null || v === undefined ? "" : String(v); return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  var rows = _fedShortlist.map(function (m, i) {
    var s = m.signal || {};
    var cpm = (s.pricing_options && s.pricing_options[0] && s.pricing_options[0].cpm) || (s.pricing && s.pricing.cpm) || "";
    var d0 = (s.deployments || [])[0] || {};
    return [i + 1, m.source_agent, s.signal_agent_segment_id, s.name, s.estimated_audience_size || "", cpm, s.coverage_percentage !== undefined ? s.coverage_percentage : "", d0.platform || d0.type || "", d0.decisioning_platform_segment_id || ""].map(esc).join(",");
  });
  var csv = header.join(",") + "\\n" + rows.join("\\n");
  var blob = new Blob([csv], { type: "text/csv" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = "federated-shortlist-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  showToast("CSV downloaded (" + _fedShortlist.length + " rows)");
}

function fedCompareSelected() {
  if (_fedShortlist.length < 2) return;
  var host = document.getElementById("fed-compare-host");
  var cols = _fedShortlist.map(function (m) {
    var s = m.signal || {};
    var cpm = (s.pricing_options && s.pricing_options[0] && s.pricing_options[0].cpm) || (s.pricing && s.pricing.cpm) || 0;
    return {
      agent: m.source_agent,
      name: s.name || s.signal_agent_segment_id,
      sid: s.signal_agent_segment_id,
      reach: s.estimated_audience_size,
      cpm: cpm,
      coverage: s.coverage_percentage,
      category: s.category_type,
      provider: s.data_provider,
      deployment: ((s.deployments || [])[0] || {}).platform || ((s.deployments || [])[0] || {}).type || "",
    };
  });
  var rows = [
    ["Agent", cols.map(function (c) { var p = c.agent === "evgeny_signals" ? "pill-success" : "pill-info"; return '<span class="pill ' + p + '" style="font-size:10px">' + escapeHtml(c.agent) + '</span>'; })],
    ["Signal ID", cols.map(function (c) { return '<span class="mono" style="font-size:11px">' + escapeHtml(c.sid || '') + '</span>'; })],
    ["Reach", cols.map(function (c) { return c.reach ? fmtNumber(c.reach) : '\u2014'; })],
    ["CPM", cols.map(function (c) { return c.cpm ? '$' + c.cpm.toFixed(2) : '\u2014'; })],
    ["Coverage", cols.map(function (c) { return c.coverage !== undefined && c.coverage !== null ? c.coverage.toFixed(2) + '%' : '\u2014'; })],
    ["Category", cols.map(function (c) { return escapeHtml(c.category || '\u2014'); })],
    ["Provider", cols.map(function (c) { return escapeHtml(c.provider || '\u2014'); })],
    ["Deployment", cols.map(function (c) { return escapeHtml(c.deployment || '\u2014'); })],
  ];
  var tbl = '<table class="fed-compare-tbl">' +
    '<thead><tr><th></th>' + cols.map(function (c) { return '<th>' + escapeHtml(c.name || '') + '</th>'; }).join("") + '</tr></thead>' +
    '<tbody>' + rows.map(function (r2) {
      return '<tr><th>' + escapeHtml(r2[0]) + '</th>' + r2[1].map(function (v) { return '<td>' + v + '</td>'; }).join("") + '</tr>';
    }).join("") + '</tbody>' +
  '</table>';
  host.innerHTML = '<div class="dstl-detail">' +
    '<div class="dstl-head"><div class="dstl-title">Compare \u2014 ' + cols.length + ' signals</div>' +
      '<button class="detail-icon-btn" data-dstl-close="1" aria-label="Close"><svg class="ico"><use href="#icon-close"/></svg></button>' +
    '</div>' + tbl + '</div>';
  host.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Sec-38 A7: keyboard shortcuts. Two-key "go to" prefix (g+x). Single
// keys: ? toggles the cheat sheet, Esc closes overlays + detail panel.
// Ignore shortcuts while typing in an input/textarea.
var _kbdPrefix = null, _kbdPrefixTimer = null;
function _isEditable(el) {
  if (!el) return false;
  var t = el.tagName;
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || el.isContentEditable;
}
document.addEventListener("keydown", function (ev) {
  if (_isEditable(document.activeElement)) return;
  var overlay = document.getElementById("kbd-overlay");
  if (ev.key === "?" && !ev.ctrlKey && !ev.metaKey) {
    overlay.classList.toggle("open");
    ev.preventDefault();
    return;
  }
  if (ev.key === "Escape") {
    if (overlay.classList.contains("open")) { overlay.classList.remove("open"); return; }
    var panel = document.getElementById("detail-panel");
    if (panel && panel.classList.contains("open")) {
      // Sec-39: step narrower before closing. Full -> Wide -> Narrow -> Close.
      var m = state.ui && state.ui.detailMode;
      if (m === "full") { applyDetailMode("wide"); return; }
      if (m === "wide") { applyDetailMode("narrow"); return; }
      closeDetail();
      return;
    }
    var drawer = document.getElementById("mcp-drawer");
    if (drawer && drawer.classList.contains("open")) { drawer.classList.remove("open"); return; }
    return;
  }
  // Sec-39: the f key toggles the detail panel sizing mode when it is open
  if (ev.key === "f" && !ev.ctrlKey && !ev.metaKey) {
    var panelForF = document.getElementById("detail-panel");
    if (panelForF && panelForF.classList.contains("open")) {
      cycleDetailMode(); ev.preventDefault(); return;
    }
  }
  if (_kbdPrefix === "g") {
    var map = {
      d: "discover", c: "catalog", b: "builder", t: "treemap", o: "overlap",
      e: "embedding", k: "capabilities", v: "devkit", n: "destinations",
      l: "toollog", a: "activations",
      // Sec-41 new tabs. Bare f is reserved for detail-panel expand; the
      // g f prefix disambiguates.
      x: "lab", p: "portfolio", s: "seasonality", f: "federation",
    };
    var tab = map[ev.key.toLowerCase()];
    if (tab) { switchTab(tab); _kbdPrefix = null; if (_kbdPrefixTimer) clearTimeout(_kbdPrefixTimer); return; }
    _kbdPrefix = null;
  }
  if (ev.key === "g" && !ev.ctrlKey && !ev.metaKey) {
    _kbdPrefix = "g";
    if (_kbdPrefixTimer) clearTimeout(_kbdPrefixTimer);
    _kbdPrefixTimer = setTimeout(function () { _kbdPrefix = null; }, 1200);
  }
});
document.getElementById("kbd-overlay").addEventListener("click", function (ev) {
  if (ev.target.id === "kbd-overlay") ev.currentTarget.classList.remove("open");
});
document.getElementById("kbd-hint-btn").addEventListener("click", function () {
  document.getElementById("kbd-overlay").classList.toggle("open");
});

// Prime tool-log count in nav on first render
(async () => {
  try {
    const r = await fetch("/mcp/recent?limit=50");
    if (r.ok) {
      const d = await r.json();
      document.getElementById("nav-toollog-count").textContent = String((d.entries || []).length);
    }
  } catch {}
})();

// Sec-38 B7: Tool Log CSV export. Downloads the currently-loaded entries
// as CSV with the same field set rendered in the table (no PII, args
// stripped to top-level keys by the server).
document.getElementById("toollog-export").addEventListener("click", () => {
  const rows = state.toolLog?.data || [];
  if (!rows.length) { showToast("No entries to export"); return; }
  const header = ["timestamp", "tool", "latency_ms", "resp_bytes", "caller", "status", "arg_keys"];
  function csvEscape(v) {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  const body = rows.map((e) => [
    e.timestamp || e.ts || "",
    e.tool || "",
    e.latency_ms || "",
    e.response_bytes || "",
    e.caller || "",
    e.status || (e.error ? "error" : "ok"),
    Array.isArray(e.arg_keys) ? e.arg_keys.join("|") : (e.args_redacted || ""),
  ].map(csvEscape).join(","));
  const csv = header.join(",") + "\\n" + body.join("\\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mcp-tool-log-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("CSV downloaded");
});

// Initial load hook: prime activations count in nav on first render so
// operators see the real number without having to visit the tab.
(async () => {
  try {
    const res = await fetch("/operations?limit=200", {
      headers: { "Authorization": "Bearer " + DEMO_KEY },
    });
    if (res.ok) {
      const data = await res.json();
      document.getElementById("nav-activations-count").textContent = String(data.count || 0);
    }
  } catch {}
})();
</script>`;
}
