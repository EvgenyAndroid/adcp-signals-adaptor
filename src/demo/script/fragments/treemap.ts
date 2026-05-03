// src/demo/script/fragments/treemap.ts
//
// Treemap visualization: category color math, render, tooltip.
//
// Source range (in pre-refactor src/demo/script.ts): lines 2287..2494 (208 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const treemapJs = `function categoryHue(category, allCategories) {
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

`;
