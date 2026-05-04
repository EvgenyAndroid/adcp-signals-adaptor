// src/demo/script/fragments/ui-state.ts
//
// Sidebar group collapse + theme picker + sidebar-collapsed state.
//
// Source range (in pre-refactor src/demo/script.ts): lines 353..558 (206 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const uiStateJs = `
//────────────────────────────────────────────────────────────────────────
// Sidebar group collapse / expand (capability-grouped nav).
//
// Default behavior: ALL groups collapsed EXCEPT the one containing the
// active tab. This keeps the sidebar compact on first visit; users
// expand the groups they want and that choice persists.
//
// State semantics (localStorage key sidebar-group-state):
//   state[groupId] === true   user explicitly COLLAPSED this group
//   state[groupId] === false  user explicitly EXPANDED this group
//   state[groupId] === undef  never touched, falls through to default
//                              (default is collapsed)
//
// The active tab's parent group is force-expanded regardless of state,
// so the user never lands on a tab whose group is hidden.
//────────────────────────────────────────────────────────────────────────
const SIDEBAR_STATE_KEY = "sidebar-group-state";

function _readSidebarState() {
  try {
    const raw = localStorage.getItem(SIDEBAR_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch (e) { return {}; }
}
function _writeSidebarState(state) {
  try { localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify(state)); } catch (e) {}
}
// forceExpandActive: when true (default), the group containing the
// currently-active item is force-expanded so the user never lands on a
// collapsed-active state from a tab switch / first paint. When false
// (passed by the collapse-all handler), the active group can stay
// collapsed — explicit user intent overrides the safety net.
function _applySidebarGroupState(forceExpandActive) {
  if (forceExpandActive === undefined) forceExpandActive = true;
  const state = _readSidebarState();
  document.querySelectorAll(".nav-group").forEach((g) => {
    const id = g.dataset.groupId;
    // Default to collapsed UNLESS the user has explicitly expanded this
    // group (state[id] === false). Untouched groups are treated as
    // collapsed by default to keep the sidebar compact.
    const collapsed = state[id] !== false;
    g.classList.toggle("is-collapsed", collapsed);
  });
  const activeItem = document.querySelector(".nav-item.active");
  if (forceExpandActive && activeItem) {
    const parentGroup = activeItem.closest(".nav-group");
    if (parentGroup) parentGroup.classList.remove("is-collapsed");
  }
  // Decorate the active group's header icon so it picks up the accent
  // color. Decoration is independent of expansion — even a collapsed
  // active group should still highlight its header icon.
  document.querySelectorAll(".nav-group").forEach((g) => g.classList.remove("has-active"));
  if (activeItem) {
    const parentGroup = activeItem.closest(".nav-group");
    if (parentGroup) parentGroup.classList.add("has-active");
  }
  // Refresh the master collapse-all label/icon to reflect the new
  // post-paint state. The function may be undefined on the very first
  // call (defined later in the file), so guard it.
  if (typeof _refreshCollapseAllUi === "function") _refreshCollapseAllUi();
}
// Wire group-header clicks to toggle + persist.
document.querySelectorAll("[data-group-toggle]").forEach((header) => {
  header.addEventListener("click", () => {
    const group = header.closest(".nav-group");
    if (!group) return;
    const id = group.dataset.groupId;
    group.classList.toggle("is-collapsed");
    const state = _readSidebarState();
    state[id] = group.classList.contains("is-collapsed");
    _writeSidebarState(state);
    _refreshCollapseAllUi();
  });
});

// Collapse-all / expand-all master toggle. Two states:
//   - is-all-collapsed: every group is collapsed → next click expands all
//   - default:           at least one group is expanded → next click collapses all
//
// We inspect EVERY group (including the active one) when computing the
// state because the collapse-all handler now passes forceExpandActive=false
// to _applySidebarGroupState — meaning the active group can be collapsed
// as part of "collapse all". The active group's auto-expand only fires
// from tab switches / first paint, not from the master toggle.
function _everyGroupCollapsed() {
  const groups = Array.from(document.querySelectorAll(".nav-group"));
  if (groups.length === 0) return true;
  return groups.every(function(g) { return g.classList.contains("is-collapsed"); });
}
function _refreshCollapseAllUi() {
  const btn = document.querySelector("[data-nav-collapse-all]");
  if (!btn) return;
  const allCollapsed = _everyGroupCollapsed();
  btn.classList.toggle("is-all-collapsed", allCollapsed);
  const label = btn.querySelector(".nav-collapse-all-label");
  if (label) label.textContent = allCollapsed ? "Expand all" : "Collapse all";
}
document.querySelectorAll("[data-nav-collapse-all]").forEach(function(btn) {
  btn.addEventListener("click", function() {
    const allCollapsed = _everyGroupCollapsed();
    // If all collapsed → expand all (state[id] = false).
    // If any expanded → collapse all (state[id] = true).
    const nextCollapsedValue = !allCollapsed;
    const state = _readSidebarState();
    document.querySelectorAll(".nav-group").forEach(function(g) {
      const id = g.dataset.groupId;
      if (id) state[id] = nextCollapsedValue;
    });
    _writeSidebarState(state);
    // Pass forceExpandActive=false when collapsing so the active group
    // also collapses (explicit user intent). When expanding (every group
    // already in expanded state), the param is irrelevant — pass true
    // to preserve the default behavior.
    _applySidebarGroupState(!nextCollapsedValue);
    _refreshCollapseAllUi();
  });
});

// Apply initial state on first paint.
_applySidebarGroupState();
_refreshCollapseAllUi();

//────────────────────────────────────────────────────────────────────────
// Theme switcher (Midnight / Daylight / Solar / Paper / Forest)
// Sets data-theme on <html>; CSS in :root[data-theme="..."] picks up
// the palette. Persists to localStorage under "ui-theme". Add more by
// adding a CSS block + a swatch button + an entry here.
//────────────────────────────────────────────────────────────────────────
const THEME_KEY = "ui-theme";
const THEME_VALID = { midnight: 1, daylight: 1, solar: 1, paper: 1, forest: 1 };

function _readTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v && THEME_VALID[v]) return v;
  } catch (e) {}
  return "midnight";
}
function _applyTheme(name) {
  const theme = THEME_VALID[name] ? name : "midnight";
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll("[data-theme-pick]").forEach(function(btn) {
    btn.classList.toggle("is-active", btn.getAttribute("data-theme-pick") === theme);
  });
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
}
document.querySelectorAll("[data-theme-pick]").forEach(function(btn) {
  btn.addEventListener("click", function() {
    _applyTheme(btn.getAttribute("data-theme-pick"));
  });
});
// Apply persisted theme on first paint.
_applyTheme(_readTheme());

//────────────────────────────────────────────────────────────────────────
// Manual sidebar collapse — topbar toggle + Ctrl/Cmd+B keyboard.
// Class-driven (.app.is-sidebar-collapsed); CSS rules above narrow the
// sidebar to icons-only. Persists to localStorage. Skips toggling when
// the user is typing in inputs / textareas / contenteditable.
//────────────────────────────────────────────────────────────────────────
const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

function _readSidebarCollapsed() {
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"; } catch (e) { return false; }
}
function _applySidebarCollapsed(collapsed) {
  const app = document.querySelector(".app");
  if (!app) return;
  app.classList.toggle("is-sidebar-collapsed", collapsed);
  try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0"); } catch (e) {}
}
document.querySelectorAll("[data-sidebar-toggle]").forEach(function(btn) {
  btn.addEventListener("click", function() {
    const app = document.querySelector(".app");
    if (!app) return;
    _applySidebarCollapsed(!app.classList.contains("is-sidebar-collapsed"));
  });
});
document.addEventListener("keydown", function(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
    const t = e.target;
    const tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
    e.preventDefault();
    const app = document.querySelector(".app");
    if (!app) return;
    _applySidebarCollapsed(!app.classList.contains("is-sidebar-collapsed"));
  }
});
_applySidebarCollapsed(_readSidebarCollapsed());

//────────────────────────────────────────────────────────────────────────
// Trace inspector — slide-in panel that renders any operation's _trace
// payload. Universal renderer; new traced surfaces just need to populate
// window.__lastTrace and trigger _showTraceTrigger().
//────────────────────────────────────────────────────────────────────────
window.__lastTrace = null;

// Global fetch interceptor — any JSON response from /signals, /agents,
// /audience, /portfolio, /analytics, /ucp, /registry, /dsp, /agentic
// is sniffed for a _trace field. If present, it auto-populates the
// panel and pulses the trigger. Means every backend endpoint that
// emits _trace gets free trace UI without per-site frontend wiring.
//
// Implementation: monkey-patch window.fetch. Clone the response so the
// caller can still consume the body normally. Body sniff happens off
// the critical path. Failures are silent (trace is decorative).
(function() {
  if (window.__traceInterceptorInstalled) return;
  window.__traceInterceptorInstalled = true;
  var origFetch = window.fetch.bind(window);
  // Path prefixes worth sniffing for _trace. Backslash-slash in regex
  // literals is a Trap-3 hazard inside this template literal — we use
  // string-prefix matching instead. Order doesn't matter; matching is
  // O(n) over a tiny list.
  var TRACE_PREFIXES = [
    "/signals", "/agents", "/audience", "/portfolio", "/analytics",
    "/ucp", "/registry", "/dsp", "/agentic", "/race", "/vendor-health",
    "/brands"
  ];
  function _isTracePath(p) {
    for (var i = 0; i < TRACE_PREFIXES.length; i++) {
      var pre = TRACE_PREFIXES[i];
      if (p === pre || p.indexOf(pre + "/") === 0) return true;
    }
    return false;
  }
  window.fetch = function(input, init) {
    var resp = origFetch(input, init);
    return resp.then(function(r) {
      try {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        var path = url;
        try { path = new URL(url, window.location.origin).pathname; } catch (e) {}
        if (!_isTracePath(path)) return r;
        var ct = r.headers && r.headers.get && r.headers.get("content-type") || "";
        if (ct.indexOf("application/json") < 0) return r;
        // Clone so the caller can still .json() / .text() the original.
        var cloned = r.clone();
        cloned.json().then(function(j) {
          if (j && j._trace) _captureTrace(j._trace);
          // Some handlers wrap result under .result (e.g. nlQueryHandler)
          else if (j && j.result && j.result._trace) _captureTrace(j.result._trace);
        }).catch(function() {});
      } catch (e) {}
      return r;
    });
  };
})();

// Per-site capture (kept as no-op safety net; the interceptor above
// usually beats this to the trace). Call sites added in #157/#158
// remain harmless.
//
// Replacement rule: a rich trace (multi-step, OR single step with id !=
// "handler" — i.e. NOT the default auto-trace from injectTraceIfMissing)
// is sticky. Default auto-traces from background side-effect endpoints
// (workflow/save, annotation writes, brand resolves) can't overwrite a
// rich trace from the user's just-completed primary operation.
`;
