// src/routes/demo.ts
// Sec-29: interactive demo UI served at `/`.
//
// Single scrollable page — no build step, no external deps, everything in
// one template literal. Calls the Worker's own /mcp endpoint via fetch
// (same origin, no CORS concern). Auth uses the DEMO_API_KEY which is
// intentionally public — README ships it, test:live uses it, the agent is
// a demo by design.
//
// Three narratives, brief→activation is the hero:
//   §1  Brief-driven discovery + activation (main)
//   §2  Catalog browser (pagination + filters)
//   §3  UCP concepts (semantic search)

// The demo key is read from env at request time so we don't drift if it
// rotates. Passed to the page as a JS constant inside the HTML template.
export function handleDemo(env: { DEMO_API_KEY: string }): Response {
  const html = renderHtml(env.DEMO_API_KEY);
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Short cache — operator changes to the page ship within minutes.
      "Cache-Control": "public, max-age=300",
      // Loosened CSP: page is fully self-contained (no CDN / inline-script
      // injection surface), but spelling it out documents the intent.
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "script-src 'self' 'unsafe-inline'; img-src 'self' data:;",
    },
  });
}

function renderHtml(demoKey: string): string {
  // Escape the demo key for safe embedding in a JS string literal. The key
  // is operator-controlled so a hostile value isn't a real concern, but a
  // backslash or quote would break the JS parse — cheap defense.
  const safeKey = JSON.stringify(demoKey);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AdCP Signals Adaptor — Demo</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ctext y='14' font-size='14'%3E%F0%9F%93%A1%3C/text%3E%3C/svg%3E"/>
<style>
:root {
  --bg: #0a0e14;
  --bg-raised: #111821;
  --bg-card: #151e2a;
  --border: #1f2b3d;
  --border-strong: #2a3b55;
  --text: #d8dee9;
  --text-dim: #8896a8;
  --text-faint: #556273;
  --accent: #5fb3d1;
  --accent-hot: #7dd3e9;
  --success: #6fcf8e;
  --warn: #e3b341;
  --error: #f47174;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --font-sans: system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.55;
}
a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-hot); text-decoration: underline; }
code, pre, .mono { font-family: var(--font-mono); font-size: 13px; }

header.bar {
  position: sticky; top: 0; z-index: 10;
  background: rgba(10, 14, 20, 0.85);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
  padding: 14px 32px;
  display: flex; justify-content: space-between; align-items: center;
}
header.bar .brand { font-weight: 600; letter-spacing: 0.2px; }
header.bar .brand .dot { color: var(--accent); }
header.bar nav { display: flex; gap: 24px; font-size: 14px; }
header.bar nav a { color: var(--text-dim); }
header.bar nav a:hover { color: var(--text); text-decoration: none; }

main { max-width: 1080px; margin: 0 auto; padding: 0 32px; }

section.hero { padding: 72px 0 56px; }
section.hero h1 {
  font-size: 44px; line-height: 1.1; margin: 0 0 16px;
  letter-spacing: -0.02em; font-weight: 650;
}
section.hero .tagline {
  font-size: 20px; color: var(--text-dim); max-width: 680px;
  margin: 0 0 32px;
}
.badges { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 36px; }
.badge {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 5px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  color: var(--text-dim);
  background: var(--bg-raised);
}
.badge.live { border-color: var(--success); color: var(--success); }
.badge.live::before {
  content: "●"; margin-right: 6px; color: var(--success);
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.cta {
  display: inline-block; padding: 12px 22px; font-size: 15px; font-weight: 500;
  background: var(--accent); color: var(--bg); border: none; border-radius: 6px;
  cursor: pointer; text-decoration: none; transition: background 0.12s;
}
.cta:hover { background: var(--accent-hot); text-decoration: none; }
.cta.secondary { background: var(--bg-raised); color: var(--text); border: 1px solid var(--border-strong); }
.cta.secondary:hover { background: var(--bg-card); }
.cta:disabled { opacity: 0.5; cursor: not-allowed; }

section.panel { padding: 56px 0; border-top: 1px solid var(--border); }
section.panel h2 {
  font-size: 28px; margin: 0 0 8px; letter-spacing: -0.01em; font-weight: 600;
}
section.panel h2 .section-num {
  font-family: var(--font-mono); font-size: 14px;
  color: var(--accent); margin-right: 14px; font-weight: 500;
}
section.panel .subtitle { color: var(--text-dim); margin: 0 0 32px; font-size: 16px; }

/* §1 Discover */
.discover-input {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; padding: 20px; margin-bottom: 16px;
}
.discover-input textarea {
  width: 100%; min-height: 80px; background: transparent; border: none;
  color: var(--text); font-family: var(--font-sans); font-size: 16px;
  resize: vertical; outline: none; padding: 0;
}
.discover-input textarea::placeholder { color: var(--text-faint); }
.discover-examples {
  display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;
  padding-top: 12px; border-top: 1px solid var(--border);
}
.discover-examples span { font-size: 12px; color: var(--text-faint); margin-right: 4px; }
.discover-examples button {
  background: transparent; border: 1px solid var(--border);
  color: var(--text-dim); font-size: 12px; padding: 4px 10px;
  border-radius: 12px; cursor: pointer; font-family: inherit;
}
.discover-examples button:hover { border-color: var(--accent); color: var(--accent); }

.results-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px;
}
@media (max-width: 760px) { .results-grid { grid-template-columns: 1fr; } }
.results-col h3 {
  font-size: 14px; color: var(--text-dim); margin: 0 0 12px;
  text-transform: uppercase; letter-spacing: 0.1em;
}
.signal-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; padding: 18px; margin-bottom: 12px;
  transition: border-color 0.12s;
}
.signal-card:hover { border-color: var(--border-strong); }
.signal-card .sc-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.signal-card .sc-name { font-weight: 600; font-size: 15px; line-height: 1.3; }
.signal-card .sc-type {
  font-family: var(--font-mono); font-size: 10px; padding: 2px 8px;
  border-radius: 10px; letter-spacing: 0.05em; text-transform: uppercase;
  white-space: nowrap; flex-shrink: 0;
}
.sc-type.marketplace { background: rgba(95, 179, 209, 0.15); color: var(--accent); }
.sc-type.custom { background: rgba(227, 179, 65, 0.15); color: var(--warn); }
.sc-type.owned { background: rgba(111, 207, 142, 0.15); color: var(--success); }
.signal-card .sc-desc {
  color: var(--text-dim); font-size: 13px; margin: 4px 0 12px; line-height: 1.5;
}
.signal-card .sc-meta {
  display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px;
  color: var(--text-faint); margin-bottom: 14px;
}
.signal-card .sc-meta .kv strong { color: var(--text-dim); font-weight: 500; }
.signal-card .sc-actions { display: flex; gap: 8px; align-items: center; }
.signal-card .sc-actions .activate-btn {
  background: var(--accent); color: var(--bg); border: none;
  padding: 7px 14px; border-radius: 5px; cursor: pointer;
  font-size: 13px; font-weight: 500; font-family: inherit;
}
.signal-card .sc-actions .activate-btn:hover { background: var(--accent-hot); }
.signal-card .sc-actions .activate-btn:disabled { background: var(--bg-raised); color: var(--text-faint); cursor: not-allowed; }
.signal-card .sc-actions .status {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);
}

.empty {
  padding: 32px; text-align: center; color: var(--text-faint); font-size: 14px;
  background: var(--bg-card); border: 1px dashed var(--border); border-radius: 8px;
}
.spinner {
  display: inline-block; width: 13px; height: 13px; vertical-align: -2px;
  margin-right: 8px; border: 2px solid var(--border-strong);
  border-top-color: var(--accent); border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.activation-details {
  margin-top: 10px; padding: 10px 12px;
  background: rgba(111, 207, 142, 0.08);
  border: 1px solid rgba(111, 207, 142, 0.3);
  border-radius: 6px; font-family: var(--font-mono); font-size: 12px;
}
.activation-details .akey { color: var(--success); }
.activation-details .dim { color: var(--text-faint); }

/* §2 Catalog */
.catalog-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
.catalog-filters button {
  background: var(--bg-raised); color: var(--text-dim);
  border: 1px solid var(--border); padding: 6px 14px;
  border-radius: 16px; cursor: pointer; font-size: 13px;
  font-family: inherit;
}
.catalog-filters button.active {
  background: var(--accent); color: var(--bg); border-color: var(--accent);
}
.catalog-filters button:not(.active):hover { border-color: var(--border-strong); color: var(--text); }

.catalog-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
}
@media (max-width: 760px) { .catalog-grid { grid-template-columns: 1fr; } }
.catalog-footer { margin-top: 20px; text-align: center; color: var(--text-dim); font-size: 13px; }
.catalog-footer button { margin-top: 10px; }

/* §3 UCP */
.concept-input {
  display: flex; gap: 8px; margin-bottom: 24px;
}
.concept-input input {
  flex: 1; background: var(--bg-card); border: 1px solid var(--border);
  color: var(--text); padding: 12px 16px; border-radius: 6px;
  font-family: inherit; font-size: 14px; outline: none;
}
.concept-input input:focus { border-color: var(--accent); }
.concept-list { display: flex; flex-direction: column; gap: 10px; }
.concept-card {
  background: var(--bg-card); border: 1px solid var(--border);
  padding: 14px 16px; border-radius: 6px;
}
.concept-card .cc-head {
  display: flex; justify-content: space-between; margin-bottom: 6px;
  font-family: var(--font-mono); font-size: 12px; color: var(--accent);
}
.concept-card .cc-cat {
  font-size: 11px; padding: 2px 8px; border-radius: 10px;
  background: var(--bg-raised); color: var(--text-dim);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.concept-card .cc-label { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
.concept-card .cc-desc { color: var(--text-dim); font-size: 13px; }

footer.page-footer {
  margin-top: 80px; padding: 40px 0;
  border-top: 1px solid var(--border);
  color: var(--text-faint); font-size: 13px;
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px;
}
footer.page-footer a { color: var(--text-dim); }
footer.page-footer .links { display: flex; gap: 18px; }

.toast {
  position: fixed; bottom: 24px; right: 24px;
  background: var(--bg-card); border: 1px solid var(--border-strong);
  padding: 12px 18px; border-radius: 6px; font-size: 13px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  transform: translateY(80px); opacity: 0;
  transition: transform 0.2s, opacity 0.2s;
}
.toast.show { transform: translateY(0); opacity: 1; }
.toast.error { border-color: var(--error); color: var(--error); }
</style>
</head>
<body>

<header class="bar">
  <div class="brand">adcp<span class="dot">·</span>signals</div>
  <nav>
    <a href="#discover">Discover</a>
    <a href="#catalog">Catalog</a>
    <a href="#concepts">Concepts</a>
    <a href="https://github.com/EvgenyAndroid/adcp-signals-adaptor" target="_blank" rel="noopener">GitHub</a>
  </nav>
</header>

<main>

<section class="hero">
  <h1>Describe an audience.<br/>Get activated signals.</h1>
  <p class="tagline">
    AdCP-conformant signals agent. Natural-language briefs become
    ranked catalog matches <em>and</em> AI-generated custom segments.
    Activate to any declared platform; webhooks on completion.
  </p>
  <div class="badges" id="hero-badges">
    <span class="badge live">agent live</span>
    <span class="badge" id="badge-tools">loading…</span>
    <span class="badge" id="badge-protocol">loading…</span>
    <span class="badge">conformance 3/3</span>
    <span class="badge">@adcp/client 5.6.0</span>
  </div>
  <a href="#discover" class="cta">Try it →</a>
  <a href="/capabilities" class="cta secondary" style="margin-left:10px">View capabilities JSON</a>
</section>

<section class="panel" id="discover">
  <h2><span class="section-num">§1</span>Brief-driven discovery</h2>
  <p class="subtitle">
    Type an audience in plain English. The agent runs a hybrid rule +
    embedding + lexical match over the catalog and generates custom
    segment proposals inline. Click any result to activate.
  </p>

  <div class="discover-input">
    <textarea id="brief" placeholder="e.g. high-income cord-cutters in top-20 DMAs interested in luxury travel"></textarea>
    <div class="discover-examples">
      <span>try:</span>
      <button data-brief="soccer moms 35+ who stream heavily">soccer moms 35+</button>
      <button data-brief="urban professionals without children who watch sci-fi">sci-fi urban pros</button>
      <button data-brief="affluent families 35-44 in top DMAs">affluent families</button>
      <button data-brief="college-educated millennials interested in sustainable brands">sustainable millennials</button>
    </div>
  </div>

  <div style="display:flex;gap:10px;align-items:center;margin-bottom:4px">
    <button class="cta" id="discover-btn">Find signals</button>
    <span class="mono" id="discover-status" style="color:var(--text-faint)"></span>
  </div>

  <div id="discover-results"></div>
</section>

<section class="panel" id="catalog">
  <h2><span class="section-num">§2</span>Catalog browser</h2>
  <p class="subtitle">
    The marketplace catalog without a brief. Filter by category type;
    paginated via the canonical <code>pagination.offset</code> field.
  </p>

  <div class="catalog-filters" id="catalog-filters">
    <button data-cat="" class="active">All</button>
    <button data-cat="demographic">Demographic</button>
    <button data-cat="interest">Interest</button>
    <button data-cat="purchase_intent">Purchase intent</button>
    <button data-cat="geo">Geo</button>
    <button data-cat="composite">Composite</button>
  </div>

  <div id="catalog-grid" class="catalog-grid"></div>
  <div class="catalog-footer" id="catalog-footer"></div>
</section>

<section class="panel" id="concepts">
  <h2><span class="section-num">§3</span>UCP concept registry</h2>
  <p class="subtitle">
    Cross-taxonomy audience concepts. Each concept carries member
    mappings to IAB 1.1, LiveRamp, TradeDesk, and internal taxonomies —
    resolved semantically, not by exact-string lookup.
  </p>

  <div class="concept-input">
    <input id="concept-q" placeholder="e.g. soccer mom, afternoon drama viewer, high income household" />
    <button class="cta" id="concept-btn">Search</button>
  </div>

  <div id="concept-list" class="concept-list"></div>
</section>

<footer class="page-footer">
  <div>AdCP Signals Adaptor — Demo Provider (Evgeny). Public demo key, mock data.</div>
  <div class="links">
    <a href="/capabilities">/capabilities</a>
    <a href="/mcp">/mcp</a>
    <a href="/health">/health</a>
    <a href="https://github.com/EvgenyAndroid/adcp-signals-adaptor" target="_blank" rel="noopener">GitHub</a>
    <a href="https://github.com/adcontextprotocol/adcp" target="_blank" rel="noopener">AdCP spec</a>
  </div>
</footer>

</main>

<div id="toast" class="toast"></div>

<script>
//----------------------------------------------------------------------
// MCP JSON-RPC client — single shared helper.
//----------------------------------------------------------------------
const DEMO_KEY = ${safeKey};
let rpcId = 1;

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

function showToast(msg, isError) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show" + (isError ? " error" : "");
  setTimeout(() => { el.className = "toast"; }, 3200);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmtNumber(n) {
  if (typeof n !== "number") return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}

function fmtPricing(options) {
  if (!Array.isArray(options) || options.length === 0) return "—";
  const o = options[0];
  if (o.model === "cpm") return \`\$\${o.cpm} CPM\`;
  if (o.model === "flat_fee") return \`\$\${o.amount} / \${o.period}\`;
  return "—";
}

//----------------------------------------------------------------------
// Hero badges — live populate from /capabilities.
//----------------------------------------------------------------------
(async () => {
  try {
    const r = await fetch("/capabilities");
    const c = await r.json();
    document.getElementById("badge-tools").textContent =
      (c.signals?.destinations?.length ?? 0) + " destinations";
    document.getElementById("badge-protocol").textContent =
      (c.supported_protocols || []).join(", ") || "unknown";
  } catch (e) { /* non-fatal — leave placeholders */ }
})();

//----------------------------------------------------------------------
// §1 Brief-driven discovery + activation
//----------------------------------------------------------------------
const briefEl = document.getElementById("brief");
document.querySelectorAll(".discover-examples button").forEach((b) => {
  b.addEventListener("click", () => {
    briefEl.value = b.dataset.brief;
    briefEl.focus();
  });
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
  btn.disabled = true; status.innerHTML = '<span class="spinner"></span>searching catalog + generating proposals…';
  results.innerHTML = "";

  try {
    const t0 = performance.now();
    const data = await callTool("get_signals", {
      signal_spec: brief,
      deliver_to: {
        deployments: [{ type: "platform", platform: "mock_dsp" }],
        countries: ["US"],
      },
      max_results: 6,
    });
    const elapsed = Math.round(performance.now() - t0);
    const catalog = (data.signals || []).filter((s) => s.signal_type !== "custom");
    const proposals = data.proposals || (data.signals || []).filter((s) => s.signal_type === "custom");
    status.textContent = \`\${catalog.length} catalog match\${catalog.length===1?"":"es"} · \${proposals.length} AI proposal\${proposals.length===1?"":"s"} · \${elapsed}ms\`;

    results.innerHTML = \`
      <div class="results-grid">
        <div class="results-col">
          <h3>Catalog matches (\${catalog.length})</h3>
          \${catalog.length ? catalog.map((s, i) => signalCard(s, "d-cat-" + i)).join("") : '<div class="empty">No catalog hits.</div>'}
        </div>
        <div class="results-col">
          <h3>AI-generated proposals (\${proposals.length})</h3>
          \${proposals.length ? proposals.map((s, i) => signalCard(s, "d-pro-" + i)).join("") : '<div class="empty">No custom proposals generated.</div>'}
        </div>
      </div>
    \`;
    wireActivateButtons();
  } catch (e) {
    showToast("Discovery failed: " + e.message, true);
    status.textContent = "error";
  } finally {
    btn.disabled = false;
  }
}

function signalCard(s, domId) {
  const type = s.signal_type || "marketplace";
  const size = fmtNumber(s.estimated_audience_size ?? s.coverage_percentage);
  const coverage = typeof s.coverage_percentage === "number" ? s.coverage_percentage.toFixed(1) + "%" : "—";
  const sid = s.signal_agent_segment_id || s.signal_id?.id || "";
  return \`
    <div class="signal-card" data-sid="\${escapeHtml(sid)}" id="\${escapeHtml(domId)}">
      <div class="sc-head">
        <div class="sc-name">\${escapeHtml(s.name || "(unnamed)")}</div>
        <span class="sc-type \${escapeHtml(type)}">\${escapeHtml(type)}</span>
      </div>
      <div class="sc-desc">\${escapeHtml(s.description || "")}</div>
      <div class="sc-meta">
        <span class="kv"><strong>Audience</strong> \${size}</span>
        <span class="kv"><strong>Coverage</strong> \${coverage}</span>
        <span class="kv"><strong>Price</strong> \${fmtPricing(s.pricing_options)}</span>
        <span class="kv mono" style="color:var(--text-faint)">\${escapeHtml(sid.slice(0, 28))}\${sid.length > 28 ? "…" : ""}</span>
      </div>
      <div class="sc-actions">
        <button class="activate-btn" data-sid="\${escapeHtml(sid)}" data-name="\${escapeHtml(s.name || "")}">Activate to mock_dsp</button>
        <span class="status"></span>
      </div>
    </div>
  \`;
}

function wireActivateButtons() {
  document.querySelectorAll(".signal-card .activate-btn").forEach((btn) => {
    btn.addEventListener("click", () => activate(btn));
  });
}

async function activate(btn) {
  const card = btn.closest(".signal-card");
  const status = card.querySelector(".status");
  const sid = btn.dataset.sid;
  btn.disabled = true; status.innerHTML = '<span class="spinner"></span>activating…';

  try {
    const act = await callTool("activate_signal", {
      signal_agent_segment_id: sid,
      deliver_to: {
        deployments: [{ type: "platform", platform: "mock_dsp" }],
        countries: ["US"],
      },
    });
    const taskId = act.task_id;
    status.textContent = "task " + taskId.slice(0, 18) + "… polling";

    // Poll up to ~10s
    let finalState = null;
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1200));
      const op = await callTool("get_operation_status", { task_id: taskId });
      if (op.status === "completed" || op.status === "failed") { finalState = op; break; }
      status.textContent = \`\${op.status} · polling \${i + 1}/8…\`;
    }

    if (finalState && finalState.status === "completed") {
      status.innerHTML = '<span style="color:var(--success)">✓ activated</span>';
      const deps = (finalState.deployments || []).map((d) => {
        const key = d.activation_key?.segment_id || "";
        return \`<div><span class="dim">\${escapeHtml(d.platform || d.type)}</span> · <span class="akey">\${escapeHtml(key)}</span></div>\`;
      }).join("");
      const existing = card.querySelector(".activation-details");
      if (existing) existing.remove();
      card.insertAdjacentHTML("beforeend", \`<div class="activation-details">\${deps || "(no deployments returned)"}</div>\`);
    } else if (finalState && finalState.status === "failed") {
      status.innerHTML = '<span style="color:var(--error)">✗ failed</span>';
    } else {
      status.textContent = "(still processing — poll manually at /operations/" + taskId + ")";
    }
  } catch (e) {
    status.innerHTML = '<span style="color:var(--error)">✗ ' + escapeHtml(e.message) + '</span>';
    btn.disabled = false;
  }
}

//----------------------------------------------------------------------
// §2 Catalog browser
//----------------------------------------------------------------------
let catalogState = { category: "", offset: 0, pageSize: 10, hasMore: true, signals: [] };

document.querySelectorAll("#catalog-filters button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#catalog-filters button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    catalogState = { category: b.dataset.cat, offset: 0, pageSize: 10, hasMore: true, signals: [] };
    loadCatalog();
  });
});

async function loadCatalog(append = false) {
  const grid = document.getElementById("catalog-grid");
  const footer = document.getElementById("catalog-footer");
  if (!append) grid.innerHTML = '<div class="empty"><span class="spinner"></span>loading catalog…</div>';
  footer.innerHTML = "";

  try {
    const req = {
      deliver_to: {
        deployments: [{ type: "platform", platform: "mock_dsp" }],
        countries: ["US"],
      },
      max_results: catalogState.pageSize,
      pagination: { offset: catalogState.offset },
    };
    if (catalogState.category) req.filters = { category_type: catalogState.category };

    const data = await callTool("get_signals", req);
    const newOnes = (data.signals || []).filter((s) => s.signal_type !== "custom");
    catalogState.signals = append ? catalogState.signals.concat(newOnes) : newOnes;
    catalogState.hasMore = !!data.hasMore;

    if (catalogState.signals.length === 0) {
      grid.innerHTML = '<div class="empty">No signals in this category.</div>';
    } else {
      grid.innerHTML = catalogState.signals.map((s, i) => signalCard(s, "c-" + i)).join("");
      wireActivateButtons();
    }

    footer.innerHTML = \`Showing \${catalogState.signals.length} of \${data.totalCount || catalogState.signals.length}\` +
      (catalogState.hasMore ? '<br/><button class="cta secondary" id="load-more">Load more</button>' : "");
    const lm = document.getElementById("load-more");
    if (lm) lm.addEventListener("click", () => {
      catalogState.offset += catalogState.pageSize;
      loadCatalog(true);
    });
  } catch (e) {
    grid.innerHTML = '<div class="empty" style="color:var(--error)">Load failed: ' + escapeHtml(e.message) + '</div>';
  }
}
loadCatalog();

//----------------------------------------------------------------------
// §3 UCP concepts
//----------------------------------------------------------------------
const cqEl = document.getElementById("concept-q");
document.getElementById("concept-btn").addEventListener("click", searchConcepts);
cqEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchConcepts();
});

async function searchConcepts() {
  const q = cqEl.value.trim();
  const list = document.getElementById("concept-list");
  if (!q) { list.innerHTML = '<div class="empty">Enter a query — e.g. "soccer mom" or "high income household".</div>'; return; }
  list.innerHTML = '<div class="empty"><span class="spinner"></span>searching concept registry…</div>';

  try {
    const data = await callTool("search_concepts", { q, limit: 10 });
    const rows = data.results || [];
    if (rows.length === 0) {
      list.innerHTML = '<div class="empty">No concepts matched. Try "mom", "income", "drama", "dma".</div>';
      return;
    }
    list.innerHTML = rows.map((c) => \`
      <div class="concept-card">
        <div class="cc-head">
          <span>\${escapeHtml(c.concept_id || "")}</span>
          <span class="cc-cat">\${escapeHtml(c.category || "")}</span>
        </div>
        <div class="cc-label">\${escapeHtml(c.label || "")}</div>
        <div class="cc-desc">\${escapeHtml(c.description || "")}</div>
      </div>
    \`).join("");
  } catch (e) {
    list.innerHTML = '<div class="empty" style="color:var(--error)">Search failed: ' + escapeHtml(e.message) + '</div>';
  }
}
// Prime with a suggestive empty state
searchConcepts();
</script>
</body>
</html>`;
}
