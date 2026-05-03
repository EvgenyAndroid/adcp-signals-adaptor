// src/demo/script/fragments/catalog.ts
//
// Catalog tab: KPIs, vertical chips, filters, sorting, table render, primer.
//
// Source range (in pre-refactor src/demo/script.ts): lines 1339..1574 (236 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const catalogJs = `function populateKPIs() {
  const all = state.catalog.all;
  // Animated count-ups — KPIs settle from 0 → target with ease-out
  // (countUp from utils). Glow pulse on first paint signals data
  // arrival; subsequent calls (filter changes) skip the glow.
  const elTotal = document.getElementById("kpi-total");
  const elCpm = document.getElementById("kpi-cpm");
  const elVerticals = document.getElementById("kpi-verticals");
  const cpms = all.map((s) => fmtCPM(s).cpm).filter((x) => typeof x === "number");
  const avg = cpms.length ? cpms.reduce((a, b) => a + b, 0) / cpms.length : 0;
  const verticals = new Set(all.map(verticalOf));
  if (elTotal) {
    elTotal.classList.add("ux-count-up");
    countUp(elTotal, all.length, 700);
  }
  if (elCpm) {
    elCpm.classList.add("ux-count-up");
    countUp(elCpm, avg, 700, function (n) { return "$" + n.toFixed(2); });
  }
  if (elVerticals) {
    elVerticals.classList.add("ux-count-up");
    countUp(elVerticals, verticals.size, 600);
  }
  // Sparkline for "total signals" — fake upward trend visualizing growth
  const spark = document.getElementById("spark-total");
  spark.innerHTML = '<svg viewBox="0 0 80 24"><path d="M2 22 L12 20 L22 19 L32 16 L42 14 L52 10 L62 8 L72 5 L78 4" fill="none" stroke="var(--accent)" stroke-width="1.4"/></svg>';
  // Subtitle count on the catalog pane
  const sub = document.getElementById("catalog-subtitle-counts");
  if (sub) sub.textContent = all.length + " signals · " + verticals.size + " verticals";
  // Glow each KPI tile briefly on first populate so the user notices
  // the data has arrived. Re-populate (e.g. catalog refresh) skips
  // glow; the tile only highlights when state.catalog._kpiPrimed flips.
  if (!state.catalog._kpiPrimed) {
    state.catalog._kpiPrimed = true;
    [elTotal, elCpm, elVerticals].forEach(function (el) {
      const tile = el && el.closest ? el.closest(".kpi-tile") : null;
      if (tile && typeof glowOnce === "function") setTimeout(function () { glowOnce(tile); }, 100);
    });
  }
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

  tbody.innerHTML = slice.map((s, i) => {
    const sid = s.signal_agent_segment_id || s.signal_id?.id || "";
    const price = fmtCPM(s);
    // Stagger the row entry — first 14 rows fade in over ~500ms total,
    // remaining rows appear immediately (avoids long delays on page 2+).
    const staggerStyle = i < 14 ? ' style="--ux-stagger-i:' + i + '"' : '';
    const staggerCls = i < 14 ? ' ux-stagger-row' : '';
    return '' +
      '<tr class="cat-row' + staggerCls + '" data-sid="' + escapeHtml(sid) + '"' + staggerStyle + '>' +
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
`;
