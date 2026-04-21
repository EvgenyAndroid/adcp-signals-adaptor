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
      <button class="nav-item" data-tab="activations">
        <svg class="ico"><use href="#icon-activations"/></svg><span>Activations</span>
        <span class="nav-count" id="nav-activations-count">—</span>
      </button>

      <div class="nav-group-label">Reference</div>
      <button class="nav-item" data-tab="capabilities">
        <svg class="ico"><use href="#icon-info"/></svg><span>Capabilities</span>
      </button>
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
            <div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading treemap…</div></div>
          </div>
        </div>
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
            <div class="builder-section-label">Rules <span style="color:var(--text-mut);font-weight:400;font-family:var(--font-mono)">(max 6)</span></div>
            <div class="builder-rules" id="builder-rules"></div>
            <button class="btn-secondary" id="add-rule-btn">
              <svg class="ico"><use href="#icon-plus"/></svg>
              <span>Add rule</span>
            </button>

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
              <div class="preview-hero-label">Estimated audience</div>
              <div class="preview-hero-value" id="preview-audience">—</div>
              <div class="preview-hero-sub" id="preview-sub">—</div>
              <div class="coverage-bar"><div class="coverage-bar-fill" id="coverage-fill"></div></div>
              <div class="preview-meta" id="preview-meta"></div>
            </div>

            <div class="builder-section-label" style="margin-top:20px">Funnel — size after each rule</div>
            <div class="funnel-chart" id="funnel-chart">
              <div class="empty-state" style="padding:24px"><div class="empty-desc">Add a rule to see the funnel.</div></div>
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
          </div>
        </div>

        <div id="caps-html">
          <div class="empty-state"><span class="spinner"></span><div class="empty-title">Loading capabilities…</div></div>
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
.treemap-cell-label {
  fill: #0b1017; font-size: 11px; font-weight: 600;
  pointer-events: none; user-select: none;
}
.treemap-cell-label.light { fill: #e6edf3; }
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
}
.caps-raw-json .json-key     { color: var(--accent-hot); }
.caps-raw-json .json-str     { color: var(--success); }
.caps-raw-json .json-num     { color: var(--warning); }
.caps-raw-json .json-bool    { color: var(--violet); }
.caps-raw-json .json-null    { color: var(--text-mut); }
.caps-raw-json .json-punct   { color: var(--text-mut); }
.caps-raw-json details summary { cursor: pointer; color: var(--text-dim); outline: none; list-style: none; }
.caps-raw-json details summary::-webkit-details-marker { display: none; }

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
    capabilities: "Capabilities",
  };
  document.getElementById("crumb-current").textContent = crumbMap[name] || name;

  // Lazy-load per-tab data
  if (name === "catalog" && state.catalog.all.length === 0) loadCatalog();
  if (name === "concepts" && !state.concepts) primeConcepts();
  if (name === "treemap") ensureTreemap();
  if (name === "builder") ensureBuilder();
  if (name === "capabilities") loadCapabilities();

  // Activations tab: start polling when visible, stop when hidden
  if (name === "activations") startActivationsPolling();
  else stopActivationsPolling();
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

//────────────────────────────────────────────────────────────────────────
// §4 Treemap — d3-hierarchy squarify, vanilla SVG via DOM API
//────────────────────────────────────────────────────────────────────────
async function ensureTreemap() {
  if (state.treemap.rendered) return;
  if (state.catalog.all.length === 0) await loadCatalog();
  renderTreemap();
  state.treemap.rendered = true;

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
    // Label only if cell > 6000 sq px AND has enough height for ~2 lines
    if (cellW * cellH > 6000 && cellH > 32 && cellW > 60) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", leaf.x0 + 6);
      label.setAttribute("y", leaf.y0 + 16);
      label.setAttribute("class", "treemap-cell-label" + (isDarkColor(leaf.data.category, categories) ? " light" : ""));
      label.textContent = truncateToFit(leaf.data.name, Math.floor(cellW / 7));
      g.appendChild(label);
      if (cellH > 50 && cellW > 80) {
        const sub = document.createElementNS("http://www.w3.org/2000/svg", "text");
        sub.setAttribute("x", leaf.x0 + 6);
        sub.setAttribute("y", leaf.y0 + 30);
        sub.setAttribute("class", "treemap-cell-label" + (isDarkColor(leaf.data.category, categories) ? " light" : ""));
        sub.style.fontSize = "10px";
        sub.style.fontWeight = "500";
        sub.style.opacity = "0.7";
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
    document.getElementById("preview-sub").textContent = data.estimated_audience_size.toLocaleString() + " adults · " + data.confidence + " confidence";
    document.getElementById("coverage-fill").style.width = Math.min(100, data.coverage_percentage) + "%";
    document.getElementById("preview-meta").textContent = data.rule_count + " rule" + (data.rule_count === 1 ? "" : "s") + " · " + data.coverage_percentage + "% of US adults · dimensions: " + (data.dimensions_used.join(", ") || "(none)");
    await renderFunnelCumulative();
  } catch (e) {
    if (seq === state.builder.estimateSeq) {
      heroEl.classList.remove("loading");
      showToast("Estimate failed: " + e.message, true);
    }
  }
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
    (Object.keys(ucp).length
      ? '<div class="caps-section">' +
          '<div class="caps-section-title">UCP extension (ext.ucp)</div>' +
          '<div class="caps-grid">' +
            (ucp.space_id ? card("Embedding space", '<span class="mono" style="font-size:12px">' + escapeHtml(ucp.space_id) + '</span>', true) : "") +
            (ucp.phase ? card("Phase", '<span class="mono" style="font-size:12px">' + escapeHtml(ucp.phase) + '</span>', true) : "") +
            (ucp.gts?.supported ? card("GTS", '<span class="pill pill-success">supported</span>' + (ucp.gts.endpoint ? ' <span class="mono" style="color:var(--text-mut);font-size:12px">' + escapeHtml(ucp.gts.endpoint) + '</span>' : ""), true) : "") +
            (ucp.concept_registry?.supported ? card("Concept registry", '<span class="pill pill-success">' + (ucp.concept_registry.concept_count ?? 0) + ' concepts</span>', true) : "") +
          '</div>' +
        '</div>'
      : "") +

    // ─── Raw JSON (collapsible) ───
    '<div class="caps-section">' +
      '<div class="caps-section-title">Raw JSON</div>' +
      '<div class="caps-raw-json">' + highlightJson(JSON.stringify(caps, null, 2)) + '</div>' +
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
