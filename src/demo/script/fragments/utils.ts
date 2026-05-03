// src/demo/script/fragments/utils.ts
//
// DOM/format utility helpers: escapeHtml, fmtNumber, idType pills, verticalOf, showToast, freshnessPill, confidenceRange, etc.
//
// Source range (in pre-refactor src/demo/script.ts): lines 111..294 (184 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const utilsJs = `function escapeHtml(s) {
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
  // Sec-31u: re-trigger slide-in animation each call by removing then
  // re-adding the class on the next frame. Force reflow with offsetWidth.
  el.classList.remove("show", "error", "toast-slide-in");
  void el.offsetWidth;
  el.className = "toast show toast-slide-in" + (isError ? " error" : "");
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
// UX deep-pass animation utilities (Sec-31u). Used across surfaces.
//────────────────────────────────────────────────────────────────────────

/**
 * Animate a number on an element from its current value (or 0) up to
 * \`target\` over \`duration\` ms. Uses ease-out-cubic for a "settling"
 * feel. \`fmt\` formats the displayed value (default: integer).
 * Cancels any prior count-up on the same element.
 */
function countUp(el, target, duration, fmt) {
  if (!el) return;
  if (typeof duration !== "number") duration = 700;
  if (typeof fmt !== "function") fmt = function (n) { return Math.round(n).toLocaleString(); };
  if (el._countUpRaf) cancelAnimationFrame(el._countUpRaf);
  var fromVal = parseFloat((el.textContent || "0").replace(/[^0-9.\\-]/g, "")) || 0;
  var startTs = null;
  function tick(ts) {
    if (startTs === null) startTs = ts;
    var t = Math.min(1, (ts - startTs) / duration);
    // ease-out-cubic
    var k = 1 - Math.pow(1 - t, 3);
    var v = fromVal + (target - fromVal) * k;
    el.textContent = fmt(v);
    if (t < 1) {
      el._countUpRaf = requestAnimationFrame(tick);
    } else {
      el.textContent = fmt(target);
      el._countUpRaf = null;
    }
  }
  el._countUpRaf = requestAnimationFrame(tick);
}

/**
 * Apply a one-shot pulse class to an element, removing it after the
 * animation completes. Triggers a state-change visual cue without
 * leaving stale class state behind.
 */
function pulseOnce(el, className) {
  if (!el) return;
  className = className || "ux-pulse-once";
  el.classList.remove(className);
  // Force reflow so the animation re-fires on consecutive calls.
  void el.offsetWidth;
  el.classList.add(className);
  setTimeout(function () { el.classList.remove(className); }, 800);
}

/**
 * Glow ring around an element that fades after 1.6s. Used to highlight
 * recently-updated cards/values without the full pulse.
 */
function glowOnce(el) {
  if (!el) return;
  el.classList.remove("ux-glow");
  void el.offsetWidth;
  el.classList.add("ux-glow");
  setTimeout(function () { el.classList.remove("ux-glow"); }, 1700);
}

/**
 * Apply a stagger-row entry animation to children of a container.
 * Sets each child's --ux-stagger-i custom property so the keyframe
 * delays in 35ms steps. Skips index >= maxStaggered to avoid long
 * delays on large lists; everything past that appears immediately.
 */
function staggerRows(container, selector, maxStaggered) {
  if (!container) return;
  selector = selector || ":scope > *";
  if (typeof maxStaggered !== "number") maxStaggered = 14;
  var els = container.querySelectorAll(selector);
  for (var i = 0; i < els.length; i++) {
    if (i < maxStaggered) {
      els[i].style.setProperty("--ux-stagger-i", String(i));
      els[i].classList.add("ux-stagger-row");
    }
  }
}

/**
 * Spawn an absolutely-positioned particle that travels from \`from\`
 * (page coords) to \`to\` (page coords) over \`duration\` ms. Used to
 * visualize work flowing between agents/lanes/UI sections.
 */
function spawnParticle(from, to, opts) {
  opts = opts || {};
  var duration = opts.duration || 600;
  var color = opts.color || null;
  var p = document.createElement("div");
  p.className = "ux-particle";
  p.style.left = from.x + "px";
  p.style.top = from.y + "px";
  p.style.setProperty("--x-from", "0px");
  p.style.setProperty("--y-from", "0px");
  p.style.setProperty("--x-to", (to.x - from.x) + "px");
  p.style.setProperty("--y-to", (to.y - from.y) + "px");
  p.style.setProperty("--duration-ms", duration + "ms");
  if (color) {
    p.style.background = color;
    p.style.boxShadow = "0 0 8px " + color;
  }
  document.body.appendChild(p);
  setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, duration + 100);
}

/**
 * Render a shimmer skeleton row block. Used in place of bare spinners
 * while a fetch is in flight. \`rows\` controls how many to render.
 */
function renderSkeletonRows(rows) {
  rows = rows || 5;
  var html = "";
  for (var i = 0; i < rows; i++) {
    html += '<div class="ux-skeleton-row"><div></div><div></div><div></div><div></div><div></div></div>';
  }
  return html;
}

/**
 * Center of an element in page coordinates (accounting for scroll).
 * Used as origin/target for spawnParticle.
 */
function elementCenter(el) {
  if (!el) return { x: 0, y: 0 };
  var rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 + window.scrollX,
    y: rect.top + rect.height / 2 + window.scrollY
  };
}
`;
