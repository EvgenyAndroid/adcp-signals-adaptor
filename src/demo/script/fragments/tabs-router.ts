// src/demo/script/fragments/tabs-router.ts
//
// Tab switching + lane popovers + brief-hint data tables.
//
// Source range (in pre-refactor src/demo/script.ts): lines 833..968 (136 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const tabsRouterJs = `function _closeAllLanePopovers() {
  document.querySelectorAll(".lane-info-popover.is-open").forEach(function(p) {
    p.classList.remove("is-open");
  });
  document.querySelectorAll(".lane-info-btn.is-open").forEach(function(b) {
    b.classList.remove("is-open");
  });
}
document.querySelectorAll("[data-lane-info-toggle]").forEach(function(btn) {
  btn.addEventListener("click", function(e) {
    e.stopPropagation();
    var id = btn.getAttribute("data-lane-info-toggle");
    var popover = document.querySelector("[data-lane-info-panel=\\"" + id + "\\"]");
    var wasOpen = btn.classList.contains("is-open");
    _closeAllLanePopovers();
    if (!wasOpen && popover) {
      popover.classList.add("is-open");
      btn.classList.add("is-open");
    }
  });
});
// Click outside any popover or its trigger button → dismiss.
document.addEventListener("click", function(e) {
  var t = e.target;
  if (t && (t.closest && (t.closest(".lane-info-popover") || t.closest("[data-lane-info-toggle]")))) return;
  _closeAllLanePopovers();
});
// Esc dismisses any open popover.
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") _closeAllLanePopovers();
});

//────────────────────────────────────────────────────────────────────────
// Tab switching
//────────────────────────────────────────────────────────────────────────
document.querySelectorAll(".nav-item[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function switchTab(name) {
  // Reset trace on tab change — stale context from a prior page shouldn't
  // dangle. New operation on the new tab pulses the trigger fresh.
  _resetTrace();
  document.querySelectorAll(".nav-item[data-tab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  document.querySelectorAll(".tab-pane").forEach((p) => {
    p.classList.toggle("active", p.dataset.tab === name);
  });
  // Re-evaluate parent-group expansion + accent decoration whenever the
  // user navigates to a new tab. Keeps the collapsed-active invariant.
  _applySidebarGroupState();
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
    orchestrator: "Orchestrator", canvas: "Brand Canvas", campaign: "Campaign Canvas", agentic: "Agentic Canvas",
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
  if (name === "canvas") _canvasReplayFromQuery();
  if (name === "campaign") _campaignInit();
  if (name === "agentic") _agenticInit();
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
  if (name === "canvas") ensureCanvas();

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

`;
