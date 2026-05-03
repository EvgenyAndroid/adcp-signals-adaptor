// src/demo/styles.ts
//
// CSS for the demo UI — extracted from src/routes/demo.ts so the route
// file can stay readable. The whole thing is one big template literal
// returned verbatim and inlined into the <head> of the rendered HTML.
//
// No interpolations are used: the file is pure CSS wrapped in a
// `<style>...</style>` shell. If you need a value injected, do it in
// renderHtml() rather than here.
//
// Theme system: three palettes (midnight / daylight / solar) selected
// via [data-theme] on <html>. The picker UI lives in the sidebar
// footer; choice persists to localStorage under "ui-theme".
export const STYLES = `<style>
/* ──────────────────────────────────────────────────────────────────────
   Theme system — three palettes selected via [data-theme] on <html>.
   Picker UI lives in the sidebar footer; choice persists to localStorage
   under "ui-theme". Falls back to midnight if no value set.

   Midnight  — default dark, contrast-bumped from the original
   Daylight  — clean light theme for projector / brightly-lit rooms
   Solar     — warm sepia for long-session readability + presentation

   All UI components reference the var()s — never hardcoded hex — so
   theme swap is instant + total. Add a new theme by adding one block
   below + one button in the picker.
   ────────────────────────────────────────────────────────────────────── */

:root, :root[data-theme="midnight"] {
  /* Surfaces */
  --bg-base:    #0b1017;
  --bg-sidebar: #0a0f1a;
  --bg-top:     #0d1320;
  --bg-surface: #121a28;
  --bg-raised:  #1a2230;
  --bg-input:   #0b1220;
  --bg-hover:   #182132;

  /* Borders */
  --border:         #1f2a3d;
  --border-faint:   #141a26;
  --border-strong:  #2e3a50;
  --border-focus:   #3b5a87;

  /* Text — bumped contrast vs original (text-mut #5d6b7e was unreadable) */
  --text:        #e8eef6;
  --text-bright: #ffffff;
  --text-dim:    #a5b1c2;
  --text-mut:    #76849a;
  --text-dis:    #3d4658;

  /* Accents */
  --accent:        #4f8eff;
  --accent-hot:    #6fa4ff;
  --accent-dim:    rgba(79, 142, 255, 0.14);
  --accent-border: rgba(79, 142, 255, 0.32);

  --success:     #10b981;
  --success-dim: rgba(16, 185, 129, 0.14);
  --warning:     #f59e0b;
  --warning-dim: rgba(245, 158, 11, 0.14);
  --error:       #ef4444;
  --error-dim:   rgba(239, 68, 68, 0.14);
  --violet:      #8b5cf6;
  --cyan:        #06b6d4;
}

:root[data-theme="daylight"] {
  --bg-base:    #f5f7fb;
  --bg-sidebar: #ffffff;
  --bg-top:     #ffffff;
  --bg-surface: #ffffff;
  --bg-raised:  #f0f3f9;
  --bg-input:   #ffffff;
  --bg-hover:   #e9eef7;

  --border:         #d8dde8;
  --border-faint:   #ebeef5;
  --border-strong:  #b8c0d0;
  --border-focus:   #6090ff;

  --text:        #1a1f2e;
  --text-bright: #050810;
  --text-dim:    #4d5872;
  --text-mut:    #76829a;
  --text-dis:    #b0b8c8;

  --accent:        #2867ee;
  --accent-hot:    #4480ff;
  --accent-dim:    rgba(40, 103, 238, 0.10);
  --accent-border: rgba(40, 103, 238, 0.30);

  --success:     #0a8e5e;
  --success-dim: rgba(10, 142, 94, 0.10);
  --warning:     #c87a00;
  --warning-dim: rgba(200, 122, 0, 0.10);
  --error:       #d63333;
  --error-dim:   rgba(214, 51, 51, 0.10);
  --violet:      #6b3fc4;
  --cyan:        #0598b6;
}

:root[data-theme="solar"] {
  --bg-base:    #1c1810;
  --bg-sidebar: #14110a;
  --bg-top:     #1f1a12;
  --bg-surface: #241e15;
  --bg-raised:  #2a2418;
  --bg-input:   #1a160e;
  --bg-hover:   #2e2719;

  --border:         #3a2f1e;
  --border-faint:   #251f15;
  --border-strong:  #4d3f29;
  --border-focus:   #b87a2e;

  --text:        #f3eada;
  --text-bright: #fff8e8;
  --text-dim:    #c4b594;
  --text-mut:    #a08c6c;
  --text-dis:    #5e5642;

  --accent:        #ffaa3a;
  --accent-hot:    #ffbd5e;
  --accent-dim:    rgba(255, 170, 58, 0.16);
  --accent-border: rgba(255, 170, 58, 0.40);

  --success:     #5db82d;
  --success-dim: rgba(93, 184, 45, 0.14);
  --warning:     #ffd166;
  --warning-dim: rgba(255, 209, 102, 0.14);
  --error:       #ff6b5b;
  --error-dim:   rgba(255, 107, 91, 0.14);
  --violet:      #c98aff;
  --cyan:        #6cd9d2;
}

/* Static layout + non-themed tokens */
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;

  --sidebar-w: 244px;
  --topbar-h:  56px;
  --detail-w:  480px;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
}

/* ── Auth overlay (UI gating) ─────────────────────────────────────────
   Visibility gated by <html class="is-locked">. Default-visible until
   the inline head script unlocks for sessionStorage-authed users. */
html.is-locked .app { display: none; }
html:not(.is-locked) .auth-overlay { display: none; }
.auth-overlay {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-base);
  z-index: 9999;
  padding: 24px;
}
.auth-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 36px 32px 28px;
  width: 100%; max-width: 380px;
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  box-shadow: 0 24px 48px rgba(0,0,0,0.35);
}
.auth-logo {
  width: 64px; height: 64px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--bg-raised);
  margin-bottom: 4px;
}
.auth-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.auth-title {
  font-size: 18px; font-weight: 700; letter-spacing: -0.01em;
  color: var(--text-bright);
  text-align: center;
}
.auth-sub {
  font: 12px/1.4 var(--font-mono);
  color: var(--text-mut);
  text-align: center;
  margin-bottom: 8px;
}
.auth-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 11px 14px;
  color: var(--text);
  font: 14px var(--font-sans);
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.auth-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}
.auth-submit {
  width: 100%;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  padding: 11px 14px;
  font: 600 14px var(--font-sans);
  cursor: pointer;
  transition: filter 0.12s;
}
.auth-submit:hover { filter: brightness(1.08); }
.auth-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.auth-error {
  font: 12px var(--font-mono);
  color: var(--error);
  min-height: 16px;
  text-align: center;
}
.auth-hint {
  font: 11px var(--font-mono);
  color: var(--text-mut);
  text-align: center;
  margin-top: 4px;
}
@keyframes auth-shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}
.auth-card.is-shake { animation: auth-shake 0.35s ease-in-out; }

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
  width: 36px; height: 36px; border-radius: 8px;
  background: var(--bg-raised);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.brand-mark img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
}
.brand-mark .ico { width: 18px; height: 18px; }
.brand-text { line-height: 1.25; }
.brand-title {
  font-size: 14px; font-weight: 600; letter-spacing: -0.01em;
  line-height: 1.2;
}
/* Marketplace + Agent stay together (non-breaking space). When the
   sidebar is narrow, the title wraps cleanly after "Evgeny's" instead
   of breaking the phrase "Marketplace Agent" mid-air. The .brand-title-mp
   span gets accent color for visual interest in place of the old dot. */
.brand-title-mp { color: var(--accent); }
.brand-sub { font-size: 11px; color: var(--text-mut); }

.sidebar-nav { flex: 1; overflow-y: auto; padding-right: 2px; }
.nav-group-label {
  font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--text-mut); padding: 14px 8px 6px; font-weight: 500;
}

/* ── Capability-grouped sidebar (collapsible) ──────────────────────────
   Groups have a clickable header with a rotating chevron. Items inside
   a group hide on .is-collapsed. State persisted in localStorage under
   "sidebar-group-state". The active tab's group is always force-expanded
   on render so the user never lands on a tab whose group is collapsed.
*/
/* Group hierarchy:
   - Each group has a faint top border so groups read as distinct sections
   - Group header is brighter + larger than items, with a colored
     domain icon to anchor the eye
   - Items inside a group are indented (28px left padding) so the
     hierarchy reads as "category → contents" not "two flat lists"
   - Active item shows a 3px accent stripe on its left edge — much
     stronger affordance than a bg-tint alone, especially in light theme
   - has-active group: header icon goes full-opacity accent
*/
.nav-group {
  margin-bottom: 2px;
  padding-top: 2px;
  border-top: 1px solid var(--border-faint);
}
.nav-group:first-of-type { border-top: none; }
.nav-group-header {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 11px 12px 9px;
  border-radius: var(--radius-md);
  background: transparent; border: none;
  color: var(--text-bright);
  font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.10em;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.nav-group-header:hover {
  background: var(--bg-hover);
}
.nav-group-header .ico-group {
  width: 16px; height: 16px;
  color: var(--accent);
  opacity: 0.55;
  flex-shrink: 0;
  transition: opacity 0.12s;
}
.nav-group-header:hover .ico-group { opacity: 1; }
.nav-group-title { flex: 1; text-align: left; }
.nav-group-count {
  font: 10px var(--font-mono);
  color: var(--text-mut);
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}
.nav-group-chevron {
  width: 12px; height: 12px;
  color: var(--text-mut);
  flex-shrink: 0;
  transition: transform 0.18s ease;
}
.nav-group.is-collapsed .nav-group-chevron {
  transform: rotate(-90deg);
}
.nav-group.has-active .nav-group-header .ico-group {
  opacity: 1;
}
.nav-group.has-active .nav-group-header {
  color: var(--text-bright);
}
.nav-group-items {
  display: flex; flex-direction: column;
  padding: 2px 0 6px;
}
.nav-group.is-collapsed .nav-group-items {
  display: none;
}

.nav-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 7px 10px 7px 32px;
  margin-bottom: 1px;
  border-radius: var(--radius-md);
  color: var(--text-dim); font-size: 13.5px; font-weight: 500;
  text-align: left; text-decoration: none !important;
  transition: background 0.12s, color 0.12s;
  position: relative;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text); }
.nav-item.active {
  background: var(--accent-dim);
  color: var(--text-bright);
  font-weight: 600;
}
.nav-item.active::before {
  content: "";
  position: absolute;
  left: 14px; top: 6px; bottom: 6px;
  width: 3px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}
.nav-item .ico { width: 15px; height: 15px; }
.nav-item.active .ico { color: var(--accent); }
.nav-item span { flex: 1; }
.nav-count {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--text-mut);
  background: var(--bg-raised); padding: 1px 7px; border-radius: 10px;
  flex: 0 !important;
}
.nav-item.active .nav-count { color: var(--accent); background: var(--accent-dim); }

/* Theme picker — small button row in the sidebar footer.
   Each button is a 16x16 swatch + label tooltip. Active theme gets
   a ring border. */
.theme-picker {
  display: flex; gap: 6px; align-items: center;
  padding: 8px 6px 4px;
  margin-top: 6px;
  border-top: 1px solid var(--border-faint);
}
.theme-picker-label {
  font: 10px var(--font-mono);
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text-mut);
  margin-right: 4px;
}
.theme-swatch {
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  cursor: pointer;
  padding: 0;
  position: relative;
  transition: transform 0.12s, border-color 0.12s;
}
.theme-swatch:hover { transform: scale(1.08); border-color: var(--accent); }
.theme-swatch.is-active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-dim);
}
.theme-swatch[data-theme-pick="midnight"] {
  background: linear-gradient(135deg, #0b1017 0%, #1a2230 100%);
}
.theme-swatch[data-theme-pick="daylight"] {
  background: linear-gradient(135deg, #ffffff 0%, #e9eef7 100%);
}
.theme-swatch[data-theme-pick="solar"] {
  background: linear-gradient(135deg, #1c1810 0%, #ffaa3a 200%);
}

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
  padding: 0 24px 0 12px;
  display: flex; justify-content: space-between; align-items: center;
  gap: 14px;
}
.topbar-sidebar-toggle {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  border-radius: var(--radius-md);
  color: var(--text-dim);
  background: transparent;
  border: 1px solid transparent;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.12s;
}
.topbar-sidebar-toggle:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--border);
}
.topbar-sidebar-toggle .ico { width: 18px; height: 18px; }

/* Manual sidebar collapse — class-driven, mirrors auto narrow-mode
   below but triggered by topbar toggle (Ctrl/Cmd+B). */
.app.is-sidebar-collapsed { --sidebar-w: 64px; }
.app.is-sidebar-collapsed .sidebar-brand .brand-text,
.app.is-sidebar-collapsed .nav-item span,
.app.is-sidebar-collapsed .nav-count,
.app.is-sidebar-collapsed .nav-tag,
.app.is-sidebar-collapsed .nav-group-header,
.app.is-sidebar-collapsed .nav-group-chevron,
.app.is-sidebar-collapsed .nav-group-title,
.app.is-sidebar-collapsed .sidebar-footer .kv,
.app.is-sidebar-collapsed .sidebar-footer .theme-picker {
  display: none;
}
.app.is-sidebar-collapsed .nav-group.is-collapsed .nav-group-items {
  display: flex !important;
}
.app.is-sidebar-collapsed .nav-group {
  margin-bottom: 0;
  padding-top: 0;
  border-top: none;
}
.app.is-sidebar-collapsed .sidebar-brand {
  justify-content: center;
  padding: 0 0 14px;
}
.app.is-sidebar-collapsed .sidebar {
  padding: 16px 8px;
}
.app.is-sidebar-collapsed .nav-item {
  justify-content: center;
  padding: 10px;
}
.app.is-sidebar-collapsed .nav-item.active::before {
  left: 0;
  top: 4px;
  bottom: 4px;
}

.crumbs { display: flex; align-items: center; gap: 10px; font-size: 13px; flex: 1; }
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
/* Wraps a pane title + (?) info icon + popover. The popover overrides
   the default right-anchored position from .lane-info-popover so it
   reads left-to-right under the icon. */
.pane-title-with-info {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  position: relative;
}
.pane-title-with-info .lane-info-btn {
  margin-left: 0;
  width: 26px; height: 26px;
}
.pane-title-with-info .lane-info-btn .ico { width: 15px; height: 15px; }
.pane-title-with-info .lane-info-popover {
  right: auto;
  left: 0;
  top: calc(100% + 4px);
  width: 420px;
}
.pane-title-with-info .lane-info-popover::before {
  right: auto;
  left: 18px;
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

/* ── Trace inspector — slide-in panel + trigger button ───────────────────
   Wow-factor build: backdrop blur, stagger-fade step entry, glow-stroke
   score bars, gradient histogram, animated duration counter, sliding
   tab indicator. Theme-aware via CSS vars. */

.trace-trigger {
  position: fixed;
  bottom: 22px; right: 22px;
  z-index: 9000;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px 10px 14px;
  border-radius: 999px;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  color: var(--text-dim);
  font: 600 12px var(--font-sans);
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0,0,0,0.32);
  transform: translateY(60px);
  opacity: 0;
  pointer-events: none;
  transition: transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2),
              opacity 0.25s ease,
              border-color 0.15s, color 0.15s, background 0.15s;
}
.trace-trigger.is-visible {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}
.trace-trigger:hover {
  border-color: var(--accent);
  color: var(--text-bright);
  background: var(--bg-raised);
}
.trace-trigger.is-pulsing {
  animation: tracePulse 1.6s ease-in-out 3;
  border-color: var(--accent);
  color: var(--accent);
}
@keyframes tracePulse {
  0%, 100% { box-shadow: 0 6px 18px rgba(0,0,0,0.32), 0 0 0 0 var(--accent-dim); }
  50%      { box-shadow: 0 6px 18px rgba(0,0,0,0.32), 0 0 0 10px transparent; }
}
.trace-trigger svg { color: var(--accent); }
.trace-trigger-label { letter-spacing: 0.02em; }
.trace-trigger-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 9px;
  background: var(--accent);
  color: #fff;
  font: 700 10px var(--font-mono);
}

.trace-backdrop {
  position: fixed; inset: 0; z-index: 9990;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px) saturate(0.85);
  -webkit-backdrop-filter: blur(6px) saturate(0.85);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.22s ease;
}
.trace-backdrop.is-open {
  opacity: 1;
  pointer-events: auto;
}

.trace-panel {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 540px; max-width: 92vw;
  z-index: 9995;
  background: var(--bg-surface);
  border-left: 1px solid var(--border-strong);
  box-shadow: -24px 0 60px rgba(0,0,0,0.4);
  display: flex; flex-direction: column;
  transform: translateX(102%);
  transition: transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1);
  font-family: var(--font-sans);
}
.trace-panel.is-open {
  transform: translateX(0);
}

.trace-head {
  padding: 22px 24px 14px;
  border-bottom: 1px solid var(--border);
  /* Subtle scanline gradient — workshop "scientific instrument" feel */
  background:
    linear-gradient(180deg, rgba(255,255,255,0.02), transparent),
    var(--bg-surface);
}
.trace-head-eyebrow {
  font: 10px/1 var(--font-mono);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 8px;
}
.trace-head-row {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px;
}
.trace-title {
  margin: 0; font: 600 18px/1.25 var(--font-sans);
  color: var(--text-bright);
  letter-spacing: -0.015em;
}
.trace-close {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  font: 200 22px/1 var(--font-sans);
  cursor: pointer;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.trace-close:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--accent);
}
.trace-input {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-dim);
  word-break: break-word;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  display: inline-block;
  max-width: 100%;
}
.trace-meta {
  display: flex; flex-wrap: wrap; gap: 8px;
  margin-top: 12px;
}
.trace-meta-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 9px;
  border-radius: 4px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  font-size: 11px;
}
.trace-meta-k { color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.06em; font-size: 10px; }
.trace-meta-v { color: var(--text); }

.trace-tabs {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 16px 0;
  border-bottom: 1px solid var(--border);
  position: relative;
}
.trace-tab {
  background: transparent; border: none;
  padding: 10px 14px;
  color: var(--text-dim);
  font: 500 12px var(--font-sans);
  cursor: pointer;
  border-radius: 0;
  position: relative;
  transition: color 0.12s;
}
.trace-tab:hover { color: var(--text); }
.trace-tab.is-active { color: var(--text-bright); }
.trace-tab-indicator {
  position: absolute;
  bottom: -1px;
  height: 2px;
  background: var(--accent);
  border-radius: 1px;
  transition: left 0.22s cubic-bezier(0.2, 0.9, 0.3, 1), width 0.22s ease;
  box-shadow: 0 0 8px var(--accent-border);
}

.trace-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px 28px;
}
.trace-body::-webkit-scrollbar { width: 8px; }
.trace-body::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
.trace-body::-webkit-scrollbar-thumb:hover { background: var(--text-mut); }
.trace-tab-pane { display: none; animation: traceFadeIn 0.2s ease; }
.trace-tab-pane.is-active { display: block; }
@keyframes traceFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Performance flame-bar at the top of Overview. */
.trace-perf {
  margin-bottom: 18px;
  padding: 12px 14px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.trace-perf-label {
  font: 10px/1 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-mut);
  margin-bottom: 8px;
}
.trace-perf-bar {
  display: flex;
  height: 14px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--bg);
  border: 1px solid var(--border);
}
.trace-perf-segment {
  height: 100%;
  position: relative;
  border-right: 1px solid rgba(0,0,0,0.18);
  transition: opacity 0.2s;
}
.trace-perf-segment:last-child { border-right: none; }
.trace-perf-legend {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 4px 12px;
  margin-top: 10px;
  font: 11px var(--font-mono);
}
.trace-perf-legend-row {
  display: flex; align-items: center; gap: 6px;
  color: var(--text-dim);
}
.trace-perf-legend-swatch {
  width: 9px; height: 9px;
  border-radius: 2px;
  flex-shrink: 0;
}
.trace-perf-legend-k { color: var(--text-dim); }
.trace-perf-legend-v { color: var(--text); margin-left: auto; }

/* Steps accordion. */
.trace-steps {
  display: flex; flex-direction: column; gap: 10px;
}
.trace-step {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  opacity: 0;
  transform: translateY(8px);
  animation: traceStepIn 0.4s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
}
@keyframes traceStepIn {
  to { opacity: 1; transform: translateY(0); }
}
.trace-step-head {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px;
  cursor: pointer;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  color: var(--text);
  transition: background 0.12s;
}
.trace-step-head:hover { background: var(--bg-hover); }
.trace-step-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  border-radius: 50%;
  background: var(--bg-raised);
  border: 1px solid var(--border-strong);
  font: 700 10px var(--font-mono);
  color: var(--accent);
  flex-shrink: 0;
}
.trace-step-label {
  flex: 1;
  font: 600 13px var(--font-sans);
  color: var(--text-bright);
  letter-spacing: -0.005em;
}
.trace-step-duration {
  font: 11px var(--font-mono);
  color: var(--text-mut);
}
.trace-step-chevron {
  width: 12px; height: 12px;
  color: var(--text-mut);
  transition: transform 0.18s;
}
.trace-step.is-open .trace-step-chevron { transform: rotate(180deg); }

.trace-step-body {
  display: none;
  padding: 4px 16px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg);
}
.trace-step.is-open .trace-step-body { display: block; }

.trace-step-note {
  font: 12px/1.5 var(--font-sans);
  color: var(--text-dim);
  font-style: italic;
  padding: 10px 0 6px;
}

.trace-detail-grid {
  display: grid;
  grid-template-columns: minmax(120px, max-content) 1fr;
  gap: 4px 14px;
  font: 11.5px/1.5 var(--font-mono);
  margin: 8px 0;
}
.trace-detail-k { color: var(--text-mut); }
.trace-detail-v { color: var(--text); word-break: break-word; }

/* Match list with score bars — the headline visualization. */
.trace-match-list {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  display: flex; flex-direction: column; gap: 6px;
}
.trace-match {
  display: grid;
  grid-template-columns: 32px 1fr 56px;
  gap: 8px;
  align-items: center;
  padding: 5px 0;
}
.trace-match-rank {
  font: 11px var(--font-mono);
  color: var(--text-mut);
  text-align: right;
}
.trace-match-bar-wrap {
  position: relative;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 3px;
  height: 22px;
  overflow: hidden;
}
.trace-match-bar {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  background: linear-gradient(90deg, var(--accent-dim), var(--accent));
  border-right: 1px solid var(--accent-hot);
  box-shadow: 0 0 8px var(--accent-border);
  transition: width 0.4s cubic-bezier(0.2, 0.9, 0.3, 1);
  width: 0;
}
.trace-match-text {
  position: absolute;
  inset: 0;
  display: flex; align-items: center;
  padding: 0 8px;
  font: 11px var(--font-mono);
  color: var(--text-bright);
  text-shadow: 0 1px 2px rgba(0,0,0,0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.trace-match-meta {
  font: 10px var(--font-mono);
  color: var(--text-mut);
  padding-left: 38px;
  margin-top: -2px;
}
.trace-match-score {
  font: 600 12px var(--font-mono);
  color: var(--accent);
  text-align: right;
}

/* Histogram with gradient + threshold marker. */
.trace-histo {
  margin-top: 12px;
  padding: 10px 12px 8px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.trace-histo-label {
  font: 10px var(--font-mono);
  color: var(--text-mut);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}
.trace-histo-bars {
  display: flex; align-items: flex-end; gap: 2px;
  height: 50px;
  position: relative;
}
.trace-histo-bar {
  flex: 1;
  background: linear-gradient(180deg, var(--accent), var(--accent-dim));
  border-radius: 1px 1px 0 0;
  min-height: 2px;
  transition: height 0.4s cubic-bezier(0.2, 0.9, 0.3, 1);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.18);
}
.trace-histo-threshold {
  position: absolute;
  top: 0; bottom: 0;
  width: 1px;
  background: var(--warning);
  box-shadow: 0 0 6px var(--warning);
}
.trace-histo-axis {
  display: flex; justify-content: space-between;
  font: 10px var(--font-mono);
  color: var(--text-mut);
  margin-top: 4px;
}

/* JSON tab. */
.trace-copy-btn {
  position: sticky; top: 0;
  float: right;
  margin-bottom: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-dim);
  padding: 5px 10px;
  border-radius: 4px;
  font: 11px var(--font-mono);
  cursor: pointer;
  transition: all 0.12s;
}
.trace-copy-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.trace-json {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  font: 11px/1.55 var(--font-mono);
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: calc(100vh - 280px);
  overflow: auto;
  clear: both;
}

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

/* Phase D: policy_attestations sub-section nested INSIDE the
   Privacy & compliance group. Separated from the IAB kv-list above
   by a faint divider + subhead, so the two layers (IAB DTS v1.2
   fields + agentic-advertising registry attestations) read as one
   coherent compliance block instead of two redundant siblings. */
.dts-attest-subhead {
  margin-top: 12px; padding-top: 10px;
  border-top: 1px dashed var(--border);
  font-size: 10.5px; color: var(--accent);
  text-transform: uppercase; letter-spacing: 0.06em;
  font-weight: 600;
}
.dts-attest-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.dts-attest-row {
  display: grid; grid-template-columns: 220px 90px 1fr;
  gap: 10px; padding: 4px 0; align-items: center;
  border-bottom: 1px dashed var(--border); font-size: 11.5px;
}
.dts-attest-row:last-child { border-bottom: none; }
.dts-attest-id { color: var(--text-dim); }
.dts-attest-claim {
  font-size: 9.5px; padding: 1px 6px; border-radius: 3px;
  border: 1px solid currentColor; text-align: center;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.dts-attest-compliant      { color: var(--success); background: rgba(102,187,106,0.10); }
.dts-attest-exempt         { color: var(--text-dim); background: var(--bg-input); }
.dts-attest-out-of-scope   { color: var(--text-mut); background: var(--bg-input); }
.dts-attest-not-applicable { color: var(--text-mut); background: var(--bg-input); }
.dts-attest-unknown        { color: var(--warning, #d4a017); background: rgba(212,160,23,0.08); }
.dts-attest-note { color: var(--text-mut); font-size: 11px; line-height: 1.35; }

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
  /* Narrow mode: collapse the group chrome and force all items visible
     as a flat icon list. Group headers + chevrons + titles disappear so
     the user gets a Linear-style icon-only nav. */
  .nav-group-header, .nav-group-chevron, .nav-group-title { display: none; }
  .nav-group.is-collapsed .nav-group-items { display: flex !important; }
  .nav-group { margin-bottom: 0; }
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

/* Sec-48d: expandable tool drawer inside agent cards. */
.orch-expand-btn {
  display: inline-block; background: transparent; border: none; padding: 0;
  color: var(--text-mut); cursor: pointer; font-size: 11px; margin-right: 4px;
  font-family: var(--font-mono); line-height: 1; width: 12px; text-align: center;
}
.orch-expand-btn:hover { color: var(--text); }
.orch-agent-card.orch-agent-expanded { grid-column: 1 / -1; }
.orch-tool-drawer {
  margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 10px;
}
.orch-tool-empty { font-size: 11px; color: var(--text-mut); }
.orch-tool {
  background: var(--bg-raised); border: 1px solid var(--border); border-radius: 5px;
  padding: 8px 10px;
}
.orch-tool-head { font-size: 12.5px; font-weight: 500; color: var(--text); margin-bottom: 2px; }
.orch-tool-desc { font-size: 11px; color: var(--text-mut); margin-bottom: 6px; line-height: 1.4; }
.orch-tool-noparams { font-size: 10.5px; color: var(--text-mut); font-style: italic; }
.orch-tool-rawschema { font-size: 10.5px; background: var(--bg-surface); padding: 6px 8px; border-radius: 4px; overflow: auto; max-height: 200px; }
.orch-tool-params { width: 100%; font-size: 11px; border-collapse: collapse; }
.orch-tool-params thead th { text-align: left; padding: 3px 6px; color: var(--text-mut); font-weight: 500; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border); }
.orch-tool-params tbody td { padding: 4px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
.orch-tool-params tbody tr:last-child td { border-bottom: none; }
.orch-tool-pname { color: var(--accent); font-size: 11px; white-space: nowrap; }
.orch-tool-ptype { color: var(--text-mut); font-size: 10.5px; }
.orch-tool-preq { white-space: nowrap; }
.orch-tool-pdesc { color: var(--text-mut); line-height: 1.4; }
.orch-tool-enum { color: var(--text-dim); font-size: 10px; }

/* Sec-48f: end-to-end workflow UI. */
.wf-controls { display: flex; flex-direction: column; gap: 8px; }
.wf-control-row { display: flex; flex-direction: column; gap: 4px; }
.wf-activate-row { flex-direction: row; align-items: center; gap: 12px; flex-wrap: wrap; }
.wf-activate-label { font-size: 11px; color: var(--text-mut); font-weight: 500; }
.wf-activate-toggles { display: flex; gap: 8px; flex-wrap: wrap; }
.wf-toggle {
  display: inline-flex; align-items: center; gap: 4px; font-size: 11px;
  padding: 3px 8px; background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: 4px; cursor: pointer; color: var(--text-mut);
}
.wf-toggle:hover { color: var(--text); }
.wf-toggle input[type=checkbox] { width: 12px; height: 12px; margin: 0; }
.wf-toggle input[type=checkbox]:checked + span { color: var(--accent); font-weight: 500; }

.wf-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; background: var(--bg-raised);
  border: 1px solid var(--border); border-radius: 5px; margin-bottom: 10px;
}
.wf-header-id { font-size: 11px; color: var(--text-mut); }
.wf-header-brief { font-size: 13px; color: var(--text); margin-top: 2px; }
.wf-header-right { display: flex; align-items: center; }

.wf-timeline {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px; background: var(--bg-surface);
  border: 1px solid var(--border); border-radius: 5px;
  margin-bottom: 12px; gap: 6px;
}
.wf-timeline-cell {
  flex: 1; text-align: center; padding: 4px 8px;
  background: var(--bg-raised); border-radius: 4px;
  border: 1px solid var(--border);
}
.wf-timeline-label { font-size: 11px; color: var(--text); font-weight: 500; }
.wf-timeline-count { font-size: 10px; color: var(--text-mut); margin-top: 2px; }
.wf-timeline-arrow { color: var(--accent); font-size: 16px; }

.wf-stage {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-left-width: 3px; border-radius: 5px;
  padding: 10px 12px; margin-bottom: 10px;
}
.wf-stage-signals   { border-left-color: #64b5f6; }
.wf-stage-creative  { border-left-color: #ba68c8; }
.wf-stage-products  { border-left-color: #ffb74d; }
.wf-stage-media-buy { border-left-color: var(--accent); }

.wf-stage-head {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
  padding-bottom: 6px; border-bottom: 1px solid var(--border);
}
.wf-stage-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%; background: var(--bg-raised);
  border: 1px solid var(--border); font-size: 11px; color: var(--text);
}
.wf-stage-title { font-size: 13px; font-weight: 500; color: var(--text); }

.wf-stage-agents {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
}
.wf-agent-card {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-left-width: 2px; border-radius: 4px;
  padding: 8px 10px;
}
.wf-agent-ok  { border-left-color: var(--success); }
.wf-agent-err { border-left-color: var(--error); }
.wf-agent-dry { border-left-color: var(--text-mut); opacity: 0.9; }

.wf-agent-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.wf-agent-name { font-size: 11.5px; font-weight: 500; color: var(--text); }
.wf-agent-vendor { font-size: 10.5px; color: var(--text-mut); flex: 1; }
.wf-agent-error {
  font-size: 10.5px; color: var(--error); margin-top: 4px;
  background: rgba(239,83,80,0.06); padding: 4px 6px; border-radius: 3px;
  word-break: break-word;
}

.wf-stage-body { font-size: 11px; color: var(--text-mut); margin-top: 4px; }
.wf-stage-count { font-size: 10px; color: var(--text-dim); margin-bottom: 4px; }
.wf-signal-row, .wf-product-row {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 0; border-top: 1px solid var(--border);
  font-size: 11px;
}
.wf-signal-row:first-child, .wf-product-row:first-child { border-top: none; }
.wf-signal-id, .wf-product-id { color: var(--text-dim); font-size: 10px; white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
.wf-signal-name, .wf-product-name { flex: 1; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-product-chosen { background: var(--accent-dim); padding: 3px 6px; margin: 2px -4px; border-radius: 3px; }

.wf-formats-list { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }

.wf-chosen {
  margin-top: 8px; padding: 6px 10px;
  background: var(--accent-dim); border: 1px solid var(--accent);
  border-radius: 4px; font-size: 11px;
}
.wf-chosen-label { color: var(--text-mut); margin-right: 6px; }
.wf-chosen code { margin-right: 4px; font-size: 10.5px; }

.wf-payload-details, .wf-result-details { margin-top: 6px; }
.wf-payload-details summary, .wf-result-details summary {
  cursor: pointer; font-size: 10.5px; color: var(--text-mut);
  padding: 2px 0;
}
.wf-payload-details summary:hover, .wf-result-details summary:hover { color: var(--accent); }
.wf-json {
  font-size: 10.5px; background: var(--bg-surface);
  padding: 6px 8px; border-radius: 4px; overflow: auto; max-height: 280px;
  color: var(--text-dim); line-height: 1.45;
}

/* Sec-48g: progressive reveal animations for the streaming workflow. */
@keyframes wf-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(79, 195, 127, 0.4); }
  50%      { box-shadow: 0 0 0 6px rgba(79, 195, 127, 0); }
}
@keyframes wf-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes wf-body-expand {
  from { opacity: 0; max-height: 0; }
  to   { opacity: 1; max-height: 800px; }
}
@keyframes wf-chosen-pulse {
  0%   { background: var(--accent-dim); box-shadow: 0 0 0 0 var(--accent); }
  50%  { background: var(--accent); color: #fff; box-shadow: 0 0 0 4px rgba(79,195,127,0.3); }
  100% { background: var(--accent-dim); box-shadow: 0 0 0 0 transparent; }
}
@keyframes wf-spinner-rotate {
  to { transform: rotate(360deg); }
}

.wf-timeline-cell {
  transition: background-color 0.25s, border-color 0.25s, color 0.25s;
}
.wf-cell-pending { opacity: 0.5; }
.wf-cell-active {
  background: var(--accent-dim);
  border-color: var(--accent);
  animation: wf-pulse 1.2s ease-in-out infinite;
}
.wf-cell-done {
  background: var(--bg-raised);
  border-color: var(--success);
}
.wf-timeline-arrow { transition: color 0.3s; }
.wf-arrow-done { color: var(--success); }
.wf-arrow-active { color: var(--accent); }
.wf-arrow-pending { color: var(--text-mut); opacity: 0.4; }

.wf-agent-card { transition: border-left-color 0.25s; }
.wf-agent-pending {
  border-left-color: var(--text-mut); opacity: 0.85;
}
.wf-agent-pending .wf-agent-name { color: var(--text-mut); }
.wf-agent-pending.wf-agent-ok,
.wf-agent-pending.wf-agent-err {
  opacity: 1;
}
.wf-agent-ok, .wf-agent-err { animation: wf-fade-in 0.35s ease-out; }

.wf-agent-spinner {
  display: inline-block;
  width: 10px; height: 10px;
  border: 1.5px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: wf-spinner-rotate 0.7s linear infinite;
  margin-right: 4px;
}
.wf-agent-ok .wf-agent-spinner,
.wf-agent-err .wf-agent-spinner { display: none; }

.wf-agent-live-timer { color: var(--text-mut); font-size: 10px; margin-top: 2px; }

.wf-stage-pending {
  padding: 8px 12px;
  color: var(--text-mut);
  font-style: italic;
  font-size: 11px;
}

.wf-body-anim { animation: wf-body-expand 0.35s ease-out; overflow: hidden; }

.wf-chosen-anim { animation: wf-fade-in 0.35s ease-out; }

.wf-chosen-chip {
  display: inline-block; padding: 2px 6px;
  background: var(--accent-dim); border-radius: 3px; margin: 0 3px;
  color: var(--accent); font-size: 10.5px;
  animation: wf-chosen-pulse 0.9s ease-out;
}

.wf-chosen-pulse { animation: wf-chosen-pulse 0.9s ease-out; }

.wf-product-row {
  transition: background-color 0.25s;
}

/* Sec-48q: pickable signal rows + format pills. */
.wf-signal-pickable { cursor: pointer; border-radius: 3px; padding: 3px 4px; margin: 0 -4px; }
.wf-signal-pickable:hover { background: var(--bg-hover); outline: 1px solid var(--accent-border); }
.wf-signal-pickable:hover .wf-signal-name { color: var(--accent); }
.wf-signal-chosen {
  background: var(--accent-dim);
  border-left: 2px solid var(--accent);
  padding-left: 6px !important;
}
.wf-signal-chosen .wf-signal-name { color: var(--accent); font-weight: 500; }

.wf-format-pickable {
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}
.wf-format-pickable:hover { background: var(--bg-hover); color: var(--accent); border-color: var(--accent-border); }
.wf-format-chosen {
  background: var(--accent-dim) !important;
  color: var(--accent) !important;
  border-color: var(--accent) !important;
  font-weight: 600;
}

.wf-chosen-empty { opacity: 0.7; font-style: italic; }

/* Sec-48r5: auth-gated callout on fire-buy cards. Used when the vendor
   rejection text matches known auth idioms. Teaches the room that the
   payload shape passed; the wall is auth. */
.wf-auth-callout {
  display: flex; gap: 8px; align-items: flex-start;
  margin-top: 8px; padding: 8px 10px;
  background: rgba(255, 183, 77, 0.08);
  border: 1px solid rgba(255, 183, 77, 0.4);
  border-left: 3px solid #ffb74d;
  border-radius: 4px;
  font-size: 11px;
}
.wf-auth-icon { color: #ffb74d; font-size: 14px; flex-shrink: 0; line-height: 1.3; }
.wf-auth-title { color: #ffb74d; font-weight: 600; font-size: 11.5px; margin-bottom: 2px; }
.wf-auth-body { color: var(--text-dim); line-height: 1.45; }
.wf-auth-body em { color: var(--text); font-style: italic; }

/* Canvas v2 Phase 1 — brand-anchored canvas. Brand picker + brand card
   sourced live from the agentic-advertising registry. Three empty lanes
   (audiences/inventory/creative) wait for Phase 2 to wire fan-outs. */
.canvas-picker-panel { padding: 12px; }
.canvas-picker-row { display: flex; gap: 8px; }
.canvas-picker-row .lab-input { flex: 1; }
.canvas-picker-row .btn-secondary { white-space: nowrap; }
.canvas-quickpicks {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  margin-top: 8px;
}
.canvas-quickpick {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: 4px; padding: 3px 8px; font-size: 11px;
  font-family: var(--font-mono); color: var(--text-mut); cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}
.canvas-quickpick:hover { color: var(--accent); border-color: var(--accent-border); }
.canvas-demo-spacer { flex: 1; min-width: 8px; }
.canvas-demo-btn {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--accent); color: #000;
  border: 1px solid var(--accent); border-radius: 4px;
  padding: 4px 10px; font-size: 11px; font-weight: 600;
  cursor: pointer; font-family: inherit;
  transition: filter 0.15s;
}
.canvas-demo-btn:hover:not(:disabled) { filter: brightness(1.1); }
.canvas-demo-btn:disabled { opacity: 0.6; cursor: wait; }

.canvas-search-list {
  margin-top: 10px;
  border: 1px solid var(--border); border-radius: 5px;
  background: var(--bg-input); overflow: hidden;
}
.canvas-search-row {
  padding: 8px 10px; border-bottom: 1px solid var(--border); cursor: pointer;
  transition: background-color 0.12s;
}
.canvas-search-row:last-child { border-bottom: none; }
.canvas-search-row:hover { background: var(--bg-hover); }
.canvas-search-name { font-size: 12.5px; font-weight: 500; color: var(--text); display: flex; align-items: center; gap: 6px; }
.canvas-row-swatch {
  display: inline-block; width: 10px; height: 10px;
  border-radius: 2px; border: 1px solid rgba(255,255,255,0.15);
  vertical-align: middle; flex-shrink: 0;
}
.canvas-search-meta {
  display: flex; align-items: center; gap: 8px;
  font-size: 10.5px; color: var(--text-mut); margin-top: 2px;
}
.canvas-loading { display: flex; align-items: center; gap: 6px; color: var(--text-mut); padding: 8px 0; }

.canvas-brand-card-host { margin-top: 14px; }
.canvas-brand-loading {
  padding: 16px; background: var(--bg-input);
  border: 1px solid var(--border); border-radius: 6px;
  color: var(--text-mut); display: flex; align-items: center; gap: 8px;
}

.canvas-brand-card {
  background: var(--bg-input); border: 1px solid var(--border);
  border-left: 3px solid var(--accent); border-radius: 6px;
  padding: 14px 16px;
}
.canvas-brand-head {
  display: flex; align-items: flex-start; gap: 14px;
  padding-bottom: 12px; border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}
.canvas-brand-logo {
  width: 64px; height: 64px;
  object-fit: contain; background: #fff; padding: 6px;
  border-radius: 6px; border: 1px solid var(--border); flex-shrink: 0;
}
.canvas-brand-logo-placeholder {
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-raised); color: var(--accent);
  font-size: 28px; font-weight: 700;
}
.canvas-brand-head-text { flex: 1; min-width: 0; }
.canvas-brand-name { font-size: 18px; font-weight: 600; color: var(--text); }
.canvas-brand-domain { font-size: 11.5px; color: var(--text-mut); margin-top: 2px; }
.canvas-brand-desc {
  font-size: 12px; color: var(--text-dim); margin-top: 6px;
  line-height: 1.45; max-width: 70ch;
}
.canvas-quality {
  flex-shrink: 0; padding: 4px 8px; font-size: 11px;
  background: var(--accent-dim); color: var(--accent); border-radius: 4px;
  font-family: var(--font-mono); font-weight: 600;
}

.canvas-brand-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px; margin-bottom: 12px;
}
.canvas-brand-col-wide { grid-column: span 2; }
.canvas-brand-label {
  font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--text-mut); margin-bottom: 4px;
}
.canvas-brand-fact { font-size: 12.5px; color: var(--text); }
.canvas-palette { display: flex; gap: 6px; }
.canvas-color-swatch {
  width: 24px; height: 24px; border-radius: 4px;
  border: 1px solid var(--border); box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}
.canvas-font-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 6px; font-size: 11px;
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: 4px;
}
.canvas-industries { display: flex; flex-wrap: wrap; gap: 4px; }
.canvas-classification {
  font-size: 11.5px; color: var(--text-dim); line-height: 1.5;
  margin-bottom: 10px; padding: 8px 10px;
  background: var(--bg-raised); border-radius: 4px;
}
.canvas-brand-rawdrop summary { font-size: 10.5px; color: var(--text-mut); cursor: pointer; }
.canvas-brand-rawdrop summary:hover { color: var(--accent); }

.canvas-lanes {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
  margin-top: 14px;
}
.canvas-lane {
  background: var(--bg-input); border: 1px solid var(--border);
  border-top: 3px solid var(--border); border-radius: 6px;
  padding: 12px; min-height: 140px;
}
.canvas-lane-audiences { border-top-color: #64b5f6; }
.canvas-lane-inventory { border-top-color: #ffb74d; }
.canvas-lane-creative  { border-top-color: #ba68c8; }
.canvas-lane-head {
  display: flex; align-items: center; gap: 8px;
  padding-bottom: 8px; margin-bottom: 8px;
  border-bottom: 1px solid var(--border);
  position: relative; /* anchor for .lane-info-popover */
}

/* Lane "(?) how this works" affordance — small info icon on the right
   of each lane title, clicking opens a popover anchored below the icon
   with a 3-step explainer. Non-modal, click-outside-to-close, one open
   at a time. Designed to feel like a Linear/Stripe info-bubble. */
.lane-info-btn {
  margin-left: auto;
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-mut);
  cursor: pointer;
  transition: all 0.12s;
  flex-shrink: 0;
}
.lane-info-btn:hover {
  background: var(--bg-hover);
  color: var(--accent);
  border-color: var(--accent-border);
}
.lane-info-btn .ico { width: 14px; height: 14px; }
.lane-info-btn.is-open {
  background: var(--accent-dim);
  color: var(--accent);
  border-color: var(--accent-border);
}

.lane-info-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  width: 360px;
  max-width: calc(100vw - 32px);
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  padding: 16px 18px 14px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.32);
  display: none;
  animation: laneInfoFade 0.15s ease-out;
}
.lane-info-popover.is-open { display: block; }
@keyframes laneInfoFade {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.lane-info-popover::before {
  /* Small triangle pointer above the popover, aimed at the (?) icon. */
  content: "";
  position: absolute;
  top: -7px; right: 6px;
  width: 12px; height: 12px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-strong);
  border-left: 1px solid var(--border-strong);
  transform: rotate(45deg);
}
.lane-info-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-bright);
  margin-bottom: 10px;
  letter-spacing: -0.01em;
}
.lane-info-steps {
  margin: 0 0 12px;
  padding: 0 0 0 22px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text);
}
.lane-info-steps li { margin-bottom: 8px; }
.lane-info-steps li:last-child { margin-bottom: 0; }
.lane-info-steps strong { color: var(--text-bright); }
.lane-info-steps code {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 11px;
  color: var(--accent);
}
.lane-info-trace {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font: 11px var(--font-mono);
  color: var(--text-mut);
  line-height: 1.5;
}
.lane-info-trace code {
  color: var(--text-dim);
  background: transparent;
  border: none;
  padding: 0;
  font-size: 11px;
}
.canvas-lane-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--bg-raised); border: 1px solid var(--border);
  font-size: 11px; color: var(--text);
}
.canvas-lane-title { font-size: 13px; font-weight: 500; color: var(--text); }
.canvas-lane-body { font-size: 12px; color: var(--text-dim); line-height: 1.5; }
.canvas-lane-placeholder { font-style: italic; }

/* Phase 2: lane active/done states + populated lane content */
.canvas-lane.canvas-lane-active {
  box-shadow: 0 0 0 2px rgba(79,195,127,0.25);
  background: linear-gradient(0deg, var(--bg-input), var(--bg-input)) padding-box;
}
.canvas-lane.canvas-lane-done .canvas-lane-num {
  background: var(--accent-dim);
  border-color: var(--accent);
}
.canvas-bottom-row.canvas-lane-active {
  box-shadow: 0 0 0 2px rgba(79,195,127,0.25);
}

.canvas-lane-agent {
  margin-bottom: 8px;
  padding: 6px 8px;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 4px;
}
.canvas-lane-agent-head {
  display: flex; align-items: center; gap: 6px;
  font-size: 10.5px; color: var(--text-mut);
  margin-bottom: 4px;
}
.canvas-lane-row {
  display: flex; align-items: center; gap: 6px;
  padding: 2px 0; font-size: 11px;
  border-top: 1px solid var(--border);
}
.canvas-lane-row:first-of-type { border-top: none; }
.canvas-lane-row-id { color: var(--text-dim); font-size: 10px; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.canvas-lane-row-name { flex: 1; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.canvas-lane-row-chosen {
  background: var(--accent-dim);
  border-radius: 3px; padding: 2px 4px; margin: 0 -4px;
}
.canvas-lane-row-chosen .canvas-lane-row-name { color: var(--accent); font-weight: 500; }

.canvas-lane-format-list {
  display: flex; flex-wrap: wrap; gap: 4px;
}
.canvas-format-chosen {
  background: var(--accent-dim) !important;
  color: var(--accent) !important;
  border-color: var(--accent) !important;
  font-weight: 600;
}

.canvas-chosen-line {
  margin-top: 8px; padding: 6px 8px;
  background: var(--accent-dim);
  border: 1px solid var(--accent);
  border-radius: 4px; font-size: 11px;
  display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
}
.canvas-chip {
  display: inline-block; padding: 2px 6px;
  background: var(--bg-input); color: var(--accent);
  border-radius: 3px; font-size: 10px;
}

.canvas-mediabuy-cell {
  display: inline-flex; flex-direction: column; align-items: stretch;
  gap: 4px; padding: 4px 8px; margin: 0 6px 6px 0;
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: 4px; font-size: 11px; vertical-align: top;
}
.canvas-mediabuy-cell-row {
  display: flex; align-items: center; gap: 6px;
}
.canvas-fire-btn {
  background: transparent; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 3px;
  padding: 1px 6px; font-size: 9.5px; font-weight: 500;
  cursor: pointer; transition: background-color 0.15s, opacity 0.15s;
  font-family: inherit;
}
.canvas-fire-btn:hover:not(:disabled) { background: var(--accent); color: #000; }
.canvas-fire-btn:disabled { opacity: 0.6; cursor: wait; }
.canvas-mediabuy-rejection {
  font-size: 10px; line-height: 1.35; color: var(--error);
  max-width: 360px; word-break: break-word;
  padding-top: 2px; border-top: 1px dashed var(--border);
}
.canvas-mediabuy-rejection.canvas-mediabuy-auth {
  color: var(--warning, #d4a017); border-top-color: var(--warning, #d4a017);
  display: flex; align-items: flex-start; gap: 5px;
}

/* Refinement A: governance enforcement banners + fire-button states. */
.canvas-gov-enforce-banner {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  width: 100%; box-sizing: border-box;
  padding: 8px 12px; margin: 0 0 10px 0;
  border: 1px solid; border-radius: 5px; font-size: 11.5px;
}
.canvas-gov-enforce-block {
  border-color: var(--error); color: var(--error);
  background: rgba(239,68,68,0.08);
}
.canvas-gov-enforce-warn {
  border-color: var(--warning, #d4a017); color: var(--warning, #d4a017);
  background: rgba(212,160,23,0.08);
}
.canvas-gov-enforce-icon { font-size: 16px; }
.canvas-gov-enforce-text { color: var(--text-dim); }
.canvas-gov-enforce-text strong { color: currentColor; }
.canvas-gov-enforce-text .mono { color: var(--text); }
.canvas-gov-override-btn {
  margin-left: auto;
  background: transparent; color: var(--error);
  border: 1px solid var(--error); border-radius: 3px;
  padding: 2px 8px; font-size: 10.5px; font-weight: 500;
  cursor: pointer; font-family: inherit;
}
.canvas-gov-override-btn:hover { background: var(--error); color: #000; }
.canvas-fire-btn-warn {
  border-color: var(--warning, #d4a017); color: var(--warning, #d4a017);
}
.canvas-fire-btn-warn:hover:not(:disabled) {
  background: var(--warning, #d4a017); color: #000;
}
.canvas-fire-btn-blocked {
  border-color: var(--error); color: var(--error);
  cursor: not-allowed;
}
.canvas-fire-btn-blocked:hover { background: transparent; color: var(--error); }

/* Refinement B: per-cell cost/impression prediction. */
.canvas-mediabuy-pred {
  font-size: 10px; color: var(--text-mut);
  padding-top: 3px; padding-bottom: 1px;
  border-top: 1px dashed var(--border);
  cursor: help;
}
.canvas-mediabuy-pred-icon { color: var(--accent); }

/* Industry-enrichment provenance: chips added by brand-name pattern
   override (vs registry-original) get a dashed accent border + a "+"
   prefix so the demo stays honest about which tags we derived. */
.canvas-industry-augmented {
  background: rgba(56,182,255,0.08);
  color: var(--accent);
  border: 1px dashed var(--accent);
}
.canvas-industry-augmented-mark {
  font-weight: 700; opacity: 0.75; margin-right: 1px;
}

/* ────────────────────────────────────────────────────────────────
   Campaign Canvas (DSP buy-side control loop)
   ──────────────────────────────────────────────────────────────── */

.campaign-selector {
  display: flex; align-items: center; gap: 6px; margin-bottom: 12px;
  padding: 8px 12px; background: var(--bg-input);
  border: 1px solid var(--border); border-radius: 5px;
}
.campaign-selector-buttons { display: flex; gap: 6px; flex-wrap: wrap; }
.campaign-selector-btn {
  display: inline-flex; flex-direction: column; align-items: flex-start; gap: 2px;
  background: var(--bg-raised); color: var(--text-dim);
  border: 1px solid var(--border); border-radius: 4px;
  padding: 6px 12px; font-size: 11.5px; cursor: pointer;
  font-family: inherit; transition: all 0.15s;
}
.campaign-selector-btn:hover { border-color: var(--accent); }
.campaign-selector-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(56,182,255,0.08); }
.campaign-selector-name { font-weight: 600; }
.campaign-selector-kpi { font-size: 9.5px; color: var(--text-mut); text-transform: uppercase; letter-spacing: 0.05em; }

/* Campaign card */
.campaign-card-host { margin-bottom: 14px; }
.campaign-card {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 14px;
}
.campaign-card-head {
  display: flex; align-items: baseline; gap: 12px;
  padding-bottom: 8px; margin-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.campaign-card-name { font-size: 16px; font-weight: 600; color: var(--text); }
.campaign-card-brand { font-size: 12px; color: var(--text-mut); }
.campaign-card-grid {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;
  margin-bottom: 10px;
}
.campaign-card-cell-wide { grid-column: span 2; }
.campaign-card-cell {
  display: flex; flex-direction: column; gap: 2px;
}
.campaign-card-label {
  font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--text-mut); font-weight: 500;
}
.campaign-card-value { font-size: 13px; color: var(--text); font-weight: 500; }
.campaign-card-sub { color: var(--text-mut); font-size: 10.5px; }
.campaign-kpi-roas        { color: var(--success); }
.campaign-kpi-cpm         { color: var(--accent); }
.campaign-kpi-cpa         { color: var(--warning, #d4a017); }
.campaign-kpi-brand_lift  { color: #c084fc; }
.campaign-card-progress { display: flex; flex-direction: column; gap: 4px; }
.campaign-card-progress-label { display: flex; justify-content: space-between; }
.campaign-card-progress-bar {
  height: 4px; background: var(--bg-input); border-radius: 2px; overflow: hidden;
}
.campaign-card-progress-fill {
  height: 100%; background: var(--accent); transition: width 0.3s;
}

/* Lane shell */
.campaign-loop { display: flex; flex-direction: column; gap: 10px; }
.campaign-lane {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-left-width: 3px; border-radius: 5px; padding: 10px 12px;
}
.campaign-lane-strategy    { border-left-color: var(--accent); }
.campaign-lane-stream      { border-left-color: var(--success); }
.campaign-lane-inventory   { border-left-color: var(--warning, #d4a017); }
.campaign-lane-delivery    { border-left-color: #c084fc; }
.campaign-lane-attribution { border-left-color: #f97316; }
.campaign-lane-head {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 6px; margin-bottom: 8px;
  border-bottom: 1px dashed var(--border);
}
.campaign-lane-label {
  font-size: 12px; font-weight: 600; color: var(--text);
}
.campaign-lane-body { display: flex; flex-direction: column; gap: 8px; }
.campaign-lane-2col { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; }

/* Strategy lane */
.campaign-strategy-row {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px;
}
.campaign-strategy-cell { display: flex; flex-direction: column; gap: 2px; }
.campaign-strategy-label {
  font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-mut); font-weight: 500; margin-bottom: 4px;
}
.campaign-strategy-block { display: flex; flex-direction: column; gap: 4px; }
.campaign-strategy-mods {
  display: flex; flex-wrap: wrap; gap: 4px;
}
.campaign-strategy-mod {
  display: inline-flex; gap: 6px; align-items: center;
  padding: 3px 8px; background: var(--bg-raised);
  border: 1px solid var(--border); border-radius: 3px;
  font-size: 11px; cursor: help;
}
.campaign-strategy-mod.mod-up { border-color: var(--success); }
.campaign-strategy-mod.mod-down { border-color: var(--error); }
.campaign-strategy-mod-val { color: var(--text-dim); font-size: 10.5px; }
.campaign-strategy-dayparting {
  display: grid; grid-template-columns: repeat(24, 1fr);
  gap: 1px; height: 32px; align-items: end;
  padding: 4px 0;
}
.campaign-strategy-daypart {
  display: flex; flex-direction: column; align-items: center;
  height: 100%; justify-content: flex-end; cursor: help;
}
.campaign-strategy-daypart-bar {
  width: 70%; background: var(--accent); opacity: 0.5;
  border-radius: 1px;
}
.campaign-strategy-daypart.dp-peak .campaign-strategy-daypart-bar { opacity: 1; }
.campaign-strategy-daypart.dp-low .campaign-strategy-daypart-bar { background: var(--text-mut); opacity: 0.3; }
.campaign-strategy-daypart-h {
  font-size: 7.5px; color: var(--text-mut); margin-top: 1px;
}

/* Bid stream lane */
.campaign-stream-stats {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;
  padding-bottom: 8px; border-bottom: 1px dashed var(--border);
}
.campaign-stream-stat { display: flex; flex-direction: column; gap: 2px; }
.campaign-stream-stat-label {
  font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-mut); font-weight: 500;
}
.campaign-stream-spark { display: flex; flex-direction: column; gap: 4px; padding-top: 4px; }
.campaign-spark-label { color: var(--text-mut); }
.campaign-spark-bars {
  display: grid; grid-template-columns: repeat(60, 1fr); gap: 1px;
  height: 36px; align-items: end; padding: 2px 0;
  background: var(--bg-input); border-radius: 3px;
}
.campaign-spark-bar {
  background: var(--success); opacity: 0.85; border-radius: 1px 1px 0 0;
  cursor: help;
}

/* Inventory + brand-safety */
.campaign-ssp-table {
  width: 100%; border-collapse: collapse; font-size: 11.5px;
}
.campaign-ssp-table th {
  text-align: left; padding: 4px 8px; color: var(--text-mut);
  font-weight: 500; font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.05em; border-bottom: 1px solid var(--border);
}
.campaign-ssp-table td {
  padding: 5px 8px; color: var(--text-dim); vertical-align: middle;
  border-bottom: 1px dashed var(--border);
}
.campaign-ssp-table tr:last-child td { border-bottom: none; }
.campaign-ssp-table tr.trend-up    .trend-up-icon    { color: var(--success); font-weight: 700; }
.campaign-ssp-table tr.trend-down  .trend-down-icon  { color: var(--error); font-weight: 700; }
.campaign-ssp-table tr.trend-flat  .trend-flat-icon  { color: var(--text-mut); }
.campaign-share-bar {
  position: relative; height: 14px; background: var(--bg-input);
  border-radius: 2px; min-width: 60px; overflow: hidden;
}
.campaign-share-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: var(--accent); opacity: 0.55;
}
.campaign-share-num {
  position: relative; padding: 0 5px; font-size: 10px;
  line-height: 14px; color: var(--text);
}
.campaign-safety-totals {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
  padding-bottom: 8px; border-bottom: 1px dashed var(--border);
}
.campaign-safety-reasons {
  display: flex; flex-direction: column; gap: 2px; padding-top: 4px;
}
.campaign-safety-reason {
  display: flex; justify-content: space-between; gap: 8px;
  font-size: 11px; color: var(--text-dim);
  padding: 2px 0;
}

/* Delivery + pacing */
.campaign-pacing-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; border-radius: 4px;
  border: 1px solid currentColor; font-size: 12px;
}
.campaign-pacing-banner-label {
  font-family: var(--font-mono); font-weight: 700;
  letter-spacing: 0.06em; font-size: 11px;
}
.campaign-pacing-banner-meta { margin-left: auto; }
.campaign-pacing-on_track { color: var(--success); background: rgba(102,187,106,0.10); }
.campaign-pacing-over     { color: var(--warning, #d4a017); background: rgba(212,160,23,0.10); }
.campaign-pacing-under    { color: var(--error); background: rgba(239,68,68,0.10); }
.campaign-pacing-stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
  padding: 6px 0;
}
.campaign-pacing-progress {
  display: flex; align-items: center; gap: 8px;
}
.campaign-pacing-progress-bar {
  flex: 1; height: 8px; background: var(--bg-input);
  border-radius: 4px; overflow: hidden;
}
.campaign-pacing-progress-fill {
  height: 100%; background: var(--accent);
  transition: width 0.4s;
}
.campaign-pacing-bars {
  display: flex; gap: 2px; align-items: end;
  height: 64px; padding: 4px 2px;
  background: var(--bg-input); border-radius: 3px;
  overflow-x: auto;
}
.campaign-pacing-bar {
  flex: 0 0 14px; height: 100%; display: flex;
  flex-direction: column; justify-content: flex-end;
  cursor: help;
}
.campaign-pacing-bar-fill { width: 100%; border-radius: 1px 1px 0 0; }
.campaign-pacing-bar.var-on    .campaign-pacing-bar-fill { background: var(--success); opacity: 0.75; }
.campaign-pacing-bar.var-over  .campaign-pacing-bar-fill { background: var(--warning, #d4a017); opacity: 0.85; }
.campaign-pacing-bar.var-under .campaign-pacing-bar-fill { background: var(--error); opacity: 0.7; }

/* Attribution + optimization */
.campaign-attr-row {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
  padding-bottom: 8px; border-bottom: 1px dashed var(--border);
}
.kpi-status-above { color: var(--success); margin-left: 4px; font-size: 9.5px; padding: 1px 5px; border-radius: 2px; background: rgba(102,187,106,0.10); border: 1px solid var(--success); }
.kpi-status-on    { color: var(--text); margin-left: 4px; font-size: 9.5px; padding: 1px 5px; border-radius: 2px; background: var(--bg-input); border: 1px solid var(--border); }
.kpi-status-below { color: var(--error); margin-left: 4px; font-size: 9.5px; padding: 1px 5px; border-radius: 2px; background: rgba(239,68,68,0.10); border: 1px solid var(--error); }
.campaign-opt-signals {
  display: flex; flex-direction: column; gap: 6px;
}
.campaign-opt-signal {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-left-width: 3px; border-radius: 4px;
  padding: 6px 10px; font-size: 11px;
}
.campaign-opt-boost { border-left-color: var(--success); }
.campaign-opt-decay { border-left-color: var(--error); }
.campaign-opt-shift { border-left-color: var(--accent); }
.campaign-opt-alert { border-left-color: var(--warning, #d4a017); }
.campaign-opt-signal-head {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 2px;
}
.campaign-opt-signal-kind {
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 700;
  letter-spacing: 0.06em; padding: 1px 5px; border-radius: 2px;
  background: var(--bg-input); color: var(--text);
}
.campaign-opt-signal-metric { color: var(--text); font-weight: 600; }
.campaign-opt-signal-conf { margin-left: auto; }
.campaign-opt-signal-rec { color: var(--text-dim); font-size: 11px; line-height: 1.4; }
.campaign-feedback-list {
  display: flex; flex-direction: column; gap: 2px;
  padding: 6px 8px; background: var(--bg-raised);
  border: 1px dashed var(--accent); border-radius: 4px;
  font-size: 10.5px;
}
.campaign-feedback-item { color: var(--accent); }

/* Closed-loop arrow */
.campaign-feedback-arrow {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; margin-top: 4px;
  background: linear-gradient(90deg, rgba(249,115,22,0.06), rgba(56,182,255,0.06));
  border: 1px dashed var(--accent); border-radius: 5px;
  font-size: 11px; color: var(--text-mut);
}
.campaign-feedback-arrow .ico { color: var(--accent); }
.campaign-feedback-arrow-tag {
  margin-left: auto; color: var(--accent); font-size: 10px;
}

@media (max-width: 1100px) {
  .campaign-card-grid { grid-template-columns: repeat(3, 1fr); }
  .campaign-card-cell-wide { grid-column: span 3; }
  .campaign-strategy-row { grid-template-columns: repeat(3, 1fr); }
  .campaign-stream-stats { grid-template-columns: repeat(2, 1fr); }
  .campaign-safety-totals { grid-template-columns: repeat(3, 1fr); }
  .campaign-attr-row { grid-template-columns: repeat(2, 1fr); }
  .campaign-lane-2col { grid-template-columns: 1fr; }
}

/* ────────────────────────────────────────────────────────────────
   Agentic Canvas
   ──────────────────────────────────────────────────────────────── */

.agentic-shell {
  display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, 1fr);
  gap: 16px; min-height: 500px;
}
.agentic-chat-col { display: flex; flex-direction: column; gap: 12px; }
.agentic-chat-input-row {
  display: flex; gap: 8px; align-items: stretch;
}
.agentic-input {
  flex: 1; padding: 10px 12px; font-size: 13px; line-height: 1.4;
  background: var(--bg-input); color: var(--text);
  border: 1px solid var(--border); border-radius: 5px;
  font-family: inherit; resize: vertical; min-height: 50px;
}
.agentic-input:focus { outline: none; border-color: var(--accent); }
.agentic-submit-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 18px; background: var(--accent); color: #000;
  border: 1px solid var(--accent); border-radius: 5px;
  font-size: 13px; font-weight: 600; cursor: pointer;
  font-family: inherit; transition: filter 0.15s;
}
.agentic-submit-btn:hover:not(:disabled) { filter: brightness(1.1); }
.agentic-submit-btn:disabled { opacity: 0.6; cursor: wait; }
.agentic-submit-btn .ico { width: 14px; height: 14px; }
.agentic-suggestions {
  display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
}
.agentic-sugg {
  background: var(--bg-raised); color: var(--text-dim);
  border: 1px solid var(--border); border-radius: 4px;
  padding: 4px 10px; font-size: 10.5px; cursor: pointer;
  font-family: inherit;
}
.agentic-sugg:hover { border-color: var(--accent); color: var(--accent); }

/* Sections */
.agentic-section {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-left-width: 3px; border-left-color: var(--accent);
  border-radius: 5px; padding: 10px 12px;
}
.agentic-section-head {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 6px; margin-bottom: 8px;
  border-bottom: 1px dashed var(--border);
}
.agentic-section-label {
  font-size: 11.5px; font-weight: 600; color: var(--text);
}
.agentic-section-source {
  margin-left: auto; font-size: 9.5px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.agentic-section-body { display: flex; flex-direction: column; gap: 6px; }

/* Brief panel */
.agentic-brief-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
}
.agentic-brief-cell-wide { grid-column: span 3; }
.agentic-brief-cell { display: flex; flex-direction: column; gap: 2px; }
.agentic-brief-label {
  font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-mut); font-weight: 500;
}

/* Plan panel */
.agentic-plan-steps { display: flex; flex-direction: column; gap: 6px; }
.agentic-plan-step {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: 4px; padding: 6px 10px;
}
.agentic-plan-step-head {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 3px;
}
.agentic-plan-step-num {
  background: var(--accent); color: #000;
  width: 18px; height: 18px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700;
}
.agentic-plan-step-tool { color: var(--text); font-weight: 600; font-size: 12px; }
.agentic-plan-step-agents { color: var(--text-mut); }
.agentic-plan-step-rationale {
  color: var(--text-dim); font-size: 11px; line-height: 1.4;
  padding-left: 26px;
}
.agentic-plan-actions {
  display: flex; align-items: center; gap: 10px;
  padding-top: 8px; margin-top: 8px;
  border-top: 1px dashed var(--border);
}
.agentic-execute-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 12px; background: var(--success); color: #000;
  border: 1px solid var(--success); border-radius: 4px;
  font-size: 12px; font-weight: 500; cursor: pointer;
  font-family: inherit;
}
.agentic-execute-btn:disabled { opacity: 0.6; cursor: wait; }

/* Wave 3: self-critique button + result panel */
.agentic-critique-btn {
  background: transparent; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 4px;
  padding: 4px 12px; font-size: 12px; cursor: pointer;
  font-family: inherit;
}
.agentic-critique-btn:hover:not(:disabled) { background: var(--accent); color: #000; }
.agentic-critique-btn:disabled { opacity: 0.6; cursor: wait; }
.agentic-critique-result { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.agentic-crit-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 5px 10px; border-radius: 3px;
  border: 1px solid currentColor; font-size: 11px;
}
.agentic-crit-icon { font-size: 14px; }
.agentic-crit-looks_good     { color: var(--success); background: rgba(102,187,106,0.10); }
.agentic-crit-minor_issues   { color: var(--text-mut); background: var(--bg-input); }
.agentic-crit-needs_revision { color: var(--warning, #d4a017); background: rgba(212,160,23,0.10); }
.agentic-crit-block          { color: var(--error); background: rgba(239,68,68,0.10); }
.agentic-crit-issue {
  padding: 5px 10px; border-radius: 3px;
  background: var(--bg-raised); border: 1px solid var(--border);
  border-left-width: 3px;
  display: grid; grid-template-columns: 50px 100px 1fr; gap: 6px;
  align-items: baseline; font-size: 11px;
}
.agentic-crit-issue .agentic-crit-msg { grid-column: 3; color: var(--text-dim); }
.agentic-crit-issue .agentic-crit-fix {
  grid-column: 1 / -1; color: var(--accent); font-size: 10.5px;
  margin-top: 2px; padding-top: 2px;
  border-top: 1px dashed var(--border);
}
.agentic-crit-sev {
  font-size: 8.5px; padding: 1px 4px; border-radius: 2px;
  font-weight: 700; letter-spacing: 0.05em;
}
.agentic-crit-issue.agentic-crit-sev-info  { border-left-color: var(--text-mut); }
.agentic-crit-issue.agentic-crit-sev-warn  { border-left-color: var(--warning, #d4a017); }
.agentic-crit-issue.agentic-crit-sev-block { border-left-color: var(--error); }
.agentic-crit-issue.agentic-crit-sev-info  .agentic-crit-sev { background: var(--bg-input); color: var(--text-mut); }
.agentic-crit-issue.agentic-crit-sev-warn  .agentic-crit-sev { background: var(--warning, #d4a017); color: #000; }
.agentic-crit-issue.agentic-crit-sev-block .agentic-crit-sev { background: var(--error); color: #000; }
.agentic-crit-cat {
  font-size: 9px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.04em;
}

/* Wave 3: refinement input + diff panel */
.agentic-refine-row {
  display: flex; gap: 6px; margin-top: 8px;
  padding-top: 8px; border-top: 1px dashed var(--border);
}
.agentic-refine-input {
  flex: 1; padding: 5px 10px; font-size: 12px;
  background: var(--bg-raised); color: var(--text);
  border: 1px solid var(--border); border-radius: 4px;
  font-family: inherit;
}
.agentic-refine-input:focus { outline: none; border-color: var(--accent); }
.agentic-refine-btn {
  background: var(--bg-input); color: var(--text-dim);
  border: 1px solid var(--border); border-radius: 4px;
  padding: 4px 12px; font-size: 11px; cursor: pointer;
  font-family: inherit;
}
.agentic-refine-btn:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.agentic-refine-btn:disabled { opacity: 0.6; cursor: wait; }
.agentic-refine-result { margin-top: 6px; display: flex; flex-direction: column; gap: 3px; }
.agentic-refine-summary {
  font-size: 11.5px; color: var(--accent); font-style: italic;
  padding: 4px 8px; background: rgba(56,182,255,0.06);
  border-radius: 3px;
}
.agentic-refine-change {
  display: flex; align-items: center; gap: 8px;
  padding: 3px 8px; font-size: 11px;
  background: var(--bg-raised); border-radius: 3px;
}
.agentic-refine-field { color: var(--text); font-weight: 600; min-width: 140px; }
.agentic-refine-arrow { color: var(--accent); }
.agentic-refine-change-plan { background: rgba(102,187,106,0.06); }
.agentic-execute-btn .ico { width: 12px; height: 12px; }

/* Execution panel */
.agentic-exec-step {
  border-left: 3px solid var(--text-mut);
  padding: 4px 10px; margin-bottom: 4px;
  background: var(--bg-raised); border-radius: 0 4px 4px 0;
}
.agentic-exec-step.agentic-exec-ok  { border-left-color: var(--success); }
.agentic-exec-step.agentic-exec-err { border-left-color: var(--error); }
.agentic-exec-step-head {
  display: flex; align-items: center; gap: 8px; font-size: 11px;
}
.agentic-exec-status {
  font-size: 9px; padding: 1px 5px; border-radius: 2px;
  background: var(--bg-input); color: var(--text);
  text-transform: uppercase; letter-spacing: 0.06em;
}
.agentic-exec-lat { margin-left: auto; color: var(--text-mut); }
.agentic-agent-row {
  display: flex; gap: 8px; align-items: center;
  padding: 2px 8px 2px 26px; font-size: 10.5px;
  color: var(--text-mut);
}
.agentic-agent-row.agentic-agent-ok  { border-left: 2px solid var(--success); }
.agentic-agent-row.agentic-agent-err { border-left: 2px solid var(--error); }

/* Compliance panel */
.agentic-comp-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 5px 10px; border-radius: 3px;
  border: 1px solid currentColor; font-size: 11px;
}
.agentic-comp-icon { font-size: 14px; }
.agentic-comp-allow { color: var(--success); background: rgba(102,187,106,0.10); }
.agentic-comp-warn  { color: var(--warning, #d4a017); background: rgba(212,160,23,0.10); }
.agentic-comp-block { color: var(--error); background: rgba(239,68,68,0.10); }
.agentic-comp-row {
  display: grid; grid-template-columns: 200px 80px 1fr;
  gap: 8px; padding: 3px 0; font-size: 10.5px;
  border-bottom: 1px dashed var(--border);
}
.agentic-comp-row-block .mono:nth-child(2) { color: var(--error); font-weight: 600; }
.agentic-comp-row-warn  .mono:nth-child(2) { color: var(--warning, #d4a017); font-weight: 600; }
.agentic-comp-row-allow .mono:nth-child(2) { color: var(--success); }
.agentic-rem-block { padding-top: 4px; }
.agentic-rem-row {
  font-size: 10.5px; color: var(--text-dim);
  padding: 3px 0; border-bottom: 1px dashed var(--border);
}
.agentic-rem-suggestion {
  font-size: 9px; padding: 1px 5px; border-radius: 2px;
  background: var(--accent); color: #000; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em;
  margin-right: 4px;
}

/* Memory panel */
.agentic-mem-row {
  display: grid; grid-template-columns: 90px 1fr 80px;
  gap: 8px; padding: 3px 0; font-size: 10.5px;
  color: var(--text-dim);
  border-bottom: 1px dashed var(--border);
}
.agentic-mem-when { color: var(--text-mut); }
.agentic-mem-outcome { color: var(--accent); text-align: right; }

/* Trace pane */
.agentic-trace-col {
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: 5px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
  min-height: 400px; max-height: 80vh;
}
.agentic-trace {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: 4px;
  padding-right: 4px;
}
.agentic-trace-step {
  display: grid; grid-template-columns: 70px 1fr 50px;
  gap: 6px; padding: 3px 6px; align-items: baseline;
  font-size: 10.5px; line-height: 1.35;
  border-left: 2px solid transparent;
  background: var(--bg-raised); border-radius: 3px;
}
.agentic-trace-kind {
  font-size: 8.5px; font-weight: 700; letter-spacing: 0.06em;
  color: var(--text-mut);
}
.agentic-trace-msg { color: var(--text-dim); }
.agentic-trace-lat { color: var(--text-mut); text-align: right; }
.agentic-trace-step.agentic-trace-analyze   { border-left-color: var(--text-mut); }
.agentic-trace-step.agentic-trace-plan      { border-left-color: var(--accent); }
.agentic-trace-step.agentic-trace-call      { border-left-color: var(--accent); }
.agentic-trace-step.agentic-trace-observe   { border-left-color: var(--success); }
.agentic-trace-step.agentic-trace-decide    { border-left-color: var(--accent); }
.agentic-trace-step.agentic-trace-reflect   { border-left-color: var(--warning, #d4a017); }
.agentic-trace-step.agentic-trace-recover   { border-left-color: var(--warning, #d4a017); }
.agentic-trace-step.agentic-trace-remediate { border-left-color: var(--warning, #d4a017); }
.agentic-trace-step.agentic-trace-complete  { border-left-color: var(--success); background: rgba(102,187,106,0.06); }

@media (max-width: 1100px) {
  .agentic-shell { grid-template-columns: 1fr; }
  .agentic-brief-grid { grid-template-columns: repeat(2, 1fr); }
  .agentic-brief-cell-wide { grid-column: span 2; }
}

/* ── Agentic Canvas streaming WOW polish ─────────────────────────
   Animations that make the page FEEL like an agent is thinking:
   skeleton pulse while waiting, slide-up on arrival, type-out on
   reasoning trace, glow on the active stage.
*/
@keyframes agentic-skel-pulse {
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 0.85; }
}
@keyframes agentic-pulse-dot {
  0%, 60%, 100% { opacity: 0.25; transform: scale(0.85); }
  30%           { opacity: 1; transform: scale(1.1); }
}
@keyframes agentic-slide-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes agentic-trace-arrive {
  from { opacity: 0; transform: translateX(-6px); background: rgba(56,182,255,0.18); }
  to   { opacity: 1; transform: translateX(0);    background: var(--bg-raised); }
}
@keyframes agentic-section-arrive {
  0%   { box-shadow: 0 0 0 1px var(--border); }
  30%  { box-shadow: 0 0 0 2px var(--accent), 0 0 18px 4px rgba(56,182,255,0.30); }
  100% { box-shadow: 0 0 0 1px var(--border); }
}
@keyframes agentic-cursor-blink {
  0%, 50%   { opacity: 1; }
  51%, 100% { opacity: 0; }
}
@keyframes agentic-active-glow {
  0%, 100% { box-shadow: -3px 0 0 0 var(--accent); }
  50%      { box-shadow: -3px 0 0 0 var(--accent), 0 0 14px 1px rgba(56,182,255,0.20); }
}

.agentic-section { transition: border-color 0.3s; animation: agentic-slide-in 0.32s ease both; }
.agentic-section.agentic-section-pending {
  border-left-color: var(--text-mut);
  opacity: 0.95;
}
.agentic-section.agentic-section-active {
  border-left-color: var(--accent);
  animation: agentic-active-glow 1.6s ease-in-out infinite;
}
.agentic-section.agentic-section-arrived {
  animation: agentic-section-arrive 1.0s ease;
}

/* Skeleton card while waiting */
.agentic-skel-card {
  display: flex; flex-direction: column; gap: 8px;
  padding: 8px 0;
}
.agentic-skel-line {
  height: 9px; border-radius: 3px;
  background: linear-gradient(90deg, var(--bg-raised), var(--bg-input), var(--bg-raised));
  background-size: 200% 100%;
  animation: agentic-skel-pulse 1.4s ease-in-out infinite;
}
.agentic-skel-line-w90 { width: 90%; }
.agentic-skel-line-w70 { width: 70%; }
.agentic-skel-line-w50 { width: 50%; }
.agentic-section-label-floating {
  margin-top: 8px; color: var(--text-mut);
  font-style: italic; font-size: 10.5px;
}

/* Pulsing dots ("thinking…") in section source area */
.agentic-pulse-dot {
  display: inline-block; width: 5px; height: 5px;
  border-radius: 50%; background: var(--accent);
  margin-right: 3px; vertical-align: middle;
  animation: agentic-pulse-dot 1.4s ease-in-out infinite;
}
.agentic-pulse-dot:nth-child(2) { animation-delay: 0.2s; }
.agentic-pulse-dot:nth-child(3) { animation-delay: 0.4s; }

/* Trace step animations */
.agentic-trace-step.agentic-trace-arriving {
  animation: agentic-trace-arrive 0.32s ease both;
}
.agentic-trace-cursor {
  display: inline-block; color: var(--accent); margin-left: 1px;
  font-weight: 700; animation: agentic-cursor-blink 1s steps(1) infinite;
}

/* "Explain this" badge + modal — works across all surfaces */
.explain-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; margin-left: 6px;
  border-radius: 50%; border: 1px solid var(--text-mut);
  background: transparent; color: var(--text-mut);
  font-size: 9px; font-weight: 700; cursor: pointer;
  font-family: inherit;
  transition: border-color 0.15s, color 0.15s;
}
.explain-badge:hover { border-color: var(--accent); color: var(--accent); }
.explain-modal {
  position: fixed; inset: 0; z-index: 9100;
  background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.explain-modal-inner {
  background: var(--bg-surface); border: 1px solid var(--accent);
  border-radius: 6px; padding: 14px;
  min-width: 380px; max-width: 600px; max-height: 80vh; overflow-y: auto;
}
.explain-modal-head {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 8px; margin-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.explain-modal-close {
  background: transparent; border: 1px solid var(--border);
  border-radius: 3px; width: 22px; height: 22px;
  cursor: pointer; color: var(--text-mut); font-size: 14px;
}
.explain-modal-close:hover { color: var(--error); border-color: var(--error); }
.explain-mode-pill {
  display: inline-block; padding: 2px 6px;
  background: var(--bg-input); color: var(--text-mut);
  border-radius: 3px; font-size: 9.5px;
  text-transform: uppercase; letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.explain-text {
  color: var(--text-dim); font-size: 12.5px; line-height: 1.55;
}

/* Live MCP coverage strip — top of Campaign Canvas */
.campaign-coverage {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 8px 12px; margin-bottom: 8px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: 5px; font-size: 11px;
}
.campaign-coverage-pills {
  display: flex; gap: 4px; flex-wrap: wrap; align-items: center;
}
.campaign-coverage-group-label {
  font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-mut); font-weight: 600; margin: 0 4px 0 2px;
}
.campaign-coverage-divider { color: var(--text-mut); margin: 0 4px; }
.campaign-coverage-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 5px; font-size: 9.5px; cursor: help;
  border-radius: 3px; border: 1px solid;
}
.campaign-coverage-pill-tool { font-size: 9.5px; }
.campaign-coverage-pill-frac { font-size: 9px; opacity: 0.8; }
.campaign-coverage-pill.cov-full    { color: var(--success); border-color: var(--success); background: rgba(102,187,106,0.08); }
.campaign-coverage-pill.cov-partial { color: var(--warning, #d4a017); border-color: var(--warning, #d4a017); background: rgba(212,160,23,0.08); }
.campaign-coverage-pill.cov-zero    { color: var(--error); border-color: var(--error); background: rgba(239,68,68,0.08); }
.campaign-coverage-pill.cov-unspec  { font-style: italic; opacity: 0.95; }

/* Source toggle (demo / live) */
.campaign-source-toggle {
  margin-left: auto; display: inline-flex; gap: 1px;
  padding: 2px; background: var(--bg-raised);
  border: 1px solid var(--border); border-radius: 4px;
}
.campaign-source-btn {
  background: transparent; color: var(--text-mut);
  border: none; border-radius: 3px;
  padding: 4px 10px; font-size: 11px; cursor: pointer;
  font-family: inherit;
}
.campaign-source-btn.active {
  background: var(--accent); color: #000; font-weight: 500;
}

/* Live media-buys panel */
.campaign-live-panel {
  background: var(--bg-surface); border: 1px solid var(--accent);
  border-radius: 5px; padding: 10px 12px; margin-bottom: 12px;
}
.campaign-live-head {
  display: flex; align-items: center; gap: 12px;
  padding-bottom: 6px; margin-bottom: 8px;
  border-bottom: 1px dashed var(--border);
}
.campaign-live-label { font-size: 12px; font-weight: 600; color: var(--accent); }
.campaign-live-empty { display: flex; flex-direction: column; gap: 4px; }
.campaign-live-agent-row {
  display: flex; gap: 8px; align-items: center;
  padding: 3px 6px; border-radius: 3px;
  background: var(--bg-raised);
}
.campaign-live-agent-row.cov-full  { border-left: 3px solid var(--success); }
.campaign-live-agent-row.cov-zero  { border-left: 3px solid var(--error); }
.campaign-live-agent-row.cov-auth  { border-left: 3px solid var(--warning, #d4a017); }
.campaign-live-buy-row {
  display: flex; flex-direction: column; gap: 3px;
  padding: 6px 8px; margin-bottom: 4px; border-radius: 4px;
  background: var(--bg-raised); border: 1px solid var(--border);
}
.campaign-live-buy-head { display: flex; align-items: center; gap: 8px; }
.campaign-live-buy-meta { color: var(--text-mut); }
.campaign-live-buy-load {
  align-self: flex-start; margin-top: 4px;
  background: transparent; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 3px;
  padding: 2px 8px; font-size: 10.5px; cursor: pointer;
  font-family: inherit;
}
.campaign-live-buy-load:hover:not(:disabled) { background: var(--accent); color: #000; }
.campaign-live-buy-load:disabled { opacity: 0.6; cursor: wait; }

/* Per-lane provenance pill */
.campaign-lane-prov {
  display: flex; justify-content: flex-end; margin-bottom: 4px;
}
.campaign-provenance-pill {
  font-family: var(--font-mono); font-size: 9px;
  padding: 1px 6px; border-radius: 2px;
  text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;
  cursor: help; border: 1px solid;
}
.campaign-provenance-live     { color: var(--success); border-color: var(--success); background: rgba(102,187,106,0.10); }
.campaign-provenance-fallback { color: var(--accent); border-color: var(--accent); background: rgba(56,182,255,0.08); }
.campaign-provenance-zero     { color: var(--error); border-color: var(--error); background: rgba(239,68,68,0.08); }
.campaign-provenance-mock     { color: var(--text-mut); border-color: var(--text-mut); background: var(--bg-input); }

/* LIVE banner pill on the delivery panel */
.campaign-data-source-pill {
  font-family: var(--font-mono); font-size: 9px; font-weight: 700;
  padding: 1px 6px; border-radius: 2px; letter-spacing: 0.08em;
  background: var(--success); color: #000;
}

/* Feature B: campaign-card live fire button row */
.campaign-card-actions {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 10px; padding-top: 10px;
  border-top: 1px dashed var(--border);
}
.campaign-fire-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--accent); color: #000;
  border: 1px solid var(--accent); border-radius: 4px;
  padding: 6px 12px; font-size: 12px; font-weight: 500;
  cursor: pointer; font-family: inherit; transition: filter 0.15s;
}
.campaign-fire-btn:hover:not(:disabled) { filter: brightness(1.1); }
.campaign-fire-btn:disabled { opacity: 0.6; cursor: wait; }
.campaign-fire-btn .ico { width: 12px; height: 12px; }
.campaign-fire-agent {
  background: var(--bg-input); color: var(--text-dim);
  border: 1px solid var(--border); border-radius: 4px;
  padding: 5px 8px; font-size: 11.5px;
  font-family: var(--font-mono);
}
.campaign-fire-result { width: 100%; }
.campaign-fire-row {
  display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 4px 8px; border-radius: 3px; font-size: 11px;
}
.campaign-fire-row.campaign-fire-ok   { background: rgba(102,187,106,0.10); border: 1px solid var(--success); }
.campaign-fire-row.campaign-fire-auth { background: rgba(212,160,23,0.10); border: 1px solid var(--warning, #d4a017); }
.campaign-fire-row.campaign-fire-err  { background: rgba(239,68,68,0.10); border: 1px solid var(--error); }
.campaign-fire-label {
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 700;
  letter-spacing: 0.06em; padding: 1px 5px; border-radius: 2px;
  background: var(--bg-raised); color: var(--text);
}

/* Feature A: apply-diff button row */
.campaign-apply-diff-row {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-top: 8px; padding-top: 8px;
  border-top: 1px dashed var(--border);
}
.campaign-apply-diff-btn {
  background: transparent; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 4px;
  padding: 4px 10px; font-size: 11px; cursor: pointer;
  font-family: inherit; transition: background-color 0.15s;
}
.campaign-apply-diff-btn:hover:not(:disabled) { background: var(--accent); color: #000; }
.campaign-apply-diff-btn:disabled { opacity: 0.6; cursor: wait; }
.campaign-apply-diff-result { width: 100%; }

/* Feature C: live audience signals on Lane 1 */
.campaign-live-signals {
  display: flex; flex-wrap: wrap; gap: 4px;
}
.campaign-live-signal-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 8px; background: var(--bg-raised);
  border: 1px solid var(--success); border-radius: 4px;
  font-size: 10.5px; cursor: help;
}
.campaign-live-signal-name { color: var(--text); }
.campaign-live-signal-meta { color: var(--text-mut); font-size: 9.5px; }
.campaign-live-signal-source { font-size: 8.5px; color: var(--accent); }

/* Feature D: live products on Lane 3 */
.campaign-live-product-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 3px 6px; border-bottom: 1px dashed var(--border);
  font-size: 11px;
}
.campaign-live-product-row:last-child { border-bottom: none; }
.campaign-live-product-name { color: var(--text-mut); font-size: 10.5px; }

/* Feature E: capabilities modal */
.campaign-cap-link {
  background: transparent; color: var(--accent);
  border: 1px solid transparent; border-radius: 3px;
  padding: 1px 5px; font-size: 9.5px; cursor: pointer;
  font-family: var(--font-mono);
  text-decoration: underline; text-decoration-style: dotted;
}
.campaign-cap-link:hover { border-color: var(--accent); background: rgba(56,182,255,0.08); text-decoration: none; }
.campaign-cap-modal {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.campaign-cap-modal-inner {
  background: var(--bg-surface); border: 1px solid var(--accent);
  border-radius: 6px; padding: 14px; min-width: 400px; max-width: 700px;
  max-height: 80vh; overflow-y: auto;
}
.campaign-cap-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 8px; margin-bottom: 10px;
  border-bottom: 1px solid var(--border);
  font-size: 12.5px; color: var(--text);
}
.campaign-cap-modal-close {
  background: transparent; border: 1px solid var(--border);
  border-radius: 3px; width: 24px; height: 24px;
  cursor: pointer; color: var(--text-mut); font-size: 16px;
}
.campaign-cap-summary {
  display: flex; flex-direction: column; gap: 4px;
}
.campaign-cap-row {
  display: grid; grid-template-columns: 240px 1fr;
  gap: 8px; padding: 4px 0;
  border-bottom: 1px dashed var(--border); font-size: 11.5px;
}
.campaign-cap-row:last-child { border-bottom: none; }
.campaign-cap-key { color: var(--text-mut); font-size: 11px; }

/* MVP #6: portfolio-rebalance banner. Shows above the media-buy cells
   when N agents auth-gate and at least 1 succeeds. Communicates that
   the workflow is robust to partial failure and the deployable budget
   is preserved — workshop's "the auth-gate is a feature, not a flaw"
   talking point. */
.canvas-rebalance-banner {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 12px; margin: 0 0 10px 0;
  background: linear-gradient(90deg, rgba(102,187,106,0.10), rgba(102,187,106,0.02));
  border: 1px solid var(--success);
  border-radius: 5px; font-size: 11.5px;
  width: 100%; box-sizing: border-box;
}
.canvas-rebalance-icon { font-size: 16px; color: var(--success); }
.canvas-rebalance-text { color: var(--text-dim); }
.canvas-rebalance-text strong { color: var(--text); }
.canvas-rebalance-delta { color: var(--success); font-weight: 600; font-family: var(--font-mono); }
.canvas-rebalance-meta { margin-left: auto; }

/* MVP #1: workflow permalink chip — appended below run button after save. */
.canvas-permalink-chip {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  width: 100%; padding-top: 6px; margin-top: 4px;
  border-top: 1px dashed var(--border);
  color: var(--text-mut); font-size: 11px;
}
.canvas-permalink-chip a { color: var(--accent); }
.canvas-permalink-copy {
  background: transparent; color: var(--text-mut);
  border: 1px solid var(--border); border-radius: 3px;
  padding: 0 6px; font-size: 9.5px; cursor: pointer;
  font-family: inherit;
}
.canvas-permalink-copy:hover { color: var(--accent); border-color: var(--accent); }

/* Wave 4: annotations modal — comments thread on a saved run */
.canvas-annotation-toggle {
  background: transparent; color: var(--text-mut);
  border: 1px solid var(--border); border-radius: 3px;
  padding: 0 8px; font-size: 10px; cursor: pointer;
  font-family: inherit;
}
.canvas-annotation-toggle:hover { color: var(--accent); border-color: var(--accent); }
.canvas-annotation-modal {
  position: fixed; inset: 0; z-index: 9200;
  background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.canvas-annotation-inner {
  background: var(--bg-surface); border: 1px solid var(--accent);
  border-radius: 6px; padding: 14px;
  min-width: 480px; max-width: 700px;
  display: flex; flex-direction: column; gap: 10px;
  max-height: 80vh;
}
.canvas-annotation-head {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 8px; border-bottom: 1px solid var(--border);
}
.canvas-annotation-close {
  background: transparent; border: 1px solid var(--border);
  border-radius: 3px; width: 22px; height: 22px;
  cursor: pointer; color: var(--text-mut); font-size: 14px;
}
.canvas-annotation-body {
  flex: 1; overflow-y: auto; max-height: 50vh;
  display: flex; flex-direction: column; gap: 6px;
}
.canvas-annotation-row {
  padding: 6px 10px; border-radius: 4px;
  background: var(--bg-raised); border: 1px solid var(--border);
}
.canvas-annotation-meta {
  display: flex; align-items: center; gap: 4px;
  color: var(--text-mut); margin-bottom: 3px;
}
.canvas-annotation-del {
  margin-left: auto; background: transparent; color: var(--text-mut);
  border: 1px solid transparent; border-radius: 2px;
  width: 18px; height: 18px; cursor: pointer; font-size: 10px;
}
.canvas-annotation-del:hover { color: var(--error); border-color: var(--error); }
.canvas-annotation-text { color: var(--text); font-size: 12px; line-height: 1.4; }
.canvas-annotation-form {
  display: grid; grid-template-columns: 130px 1fr 60px; gap: 6px;
  padding-top: 8px; border-top: 1px solid var(--border);
}
.canvas-annotation-form input {
  padding: 5px 8px; font-size: 11.5px;
  background: var(--bg-input); color: var(--text);
  border: 1px solid var(--border); border-radius: 3px;
  font-family: inherit;
}
.canvas-annotation-form input:focus { outline: none; border-color: var(--accent); }
.canvas-annotation-form button {
  background: var(--accent); color: #000;
  border: 1px solid var(--accent); border-radius: 3px;
  font-size: 11.5px; cursor: pointer; font-family: inherit;
}

/* Multi-brand A/B (light) — comparison panel + side-by-side cards. */
.canvas-compare-btn {
  background: transparent; color: var(--text-dim);
  border: 1px solid var(--border); border-radius: 4px;
  padding: 8px 14px; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: border-color 0.15s, color 0.15s;
  font-family: inherit;
}
.canvas-compare-btn:hover { border-color: var(--accent); color: var(--accent); }
.canvas-compare-panel {
  margin-top: 12px; padding: 12px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: 5px;
}
.canvas-compare-head {
  display: flex; align-items: center; gap: 12px;
  padding-bottom: 8px; margin-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.canvas-compare-close {
  margin-left: auto; background: transparent;
  border: 1px solid var(--border); border-radius: 3px;
  width: 22px; height: 22px; cursor: pointer; color: var(--text-mut);
  font-size: 16px; line-height: 1;
}
.canvas-compare-close:hover { color: var(--error); border-color: var(--error); }
.canvas-compare-search { display: flex; flex-direction: column; gap: 6px; }
.canvas-compare-input {
  width: 100%; padding: 8px 10px; font-size: 12.5px;
  background: var(--bg-raised); color: var(--text);
  border: 1px solid var(--border); border-radius: 4px;
  font-family: inherit;
}
.canvas-compare-input:focus { outline: none; border-color: var(--accent); }
.canvas-compare-suggestions {
  display: flex; flex-direction: column; gap: 2px; max-height: 200px;
  overflow-y: auto;
}
.canvas-compare-suggestion {
  padding: 5px 10px; cursor: pointer; font-size: 11.5px;
  border-radius: 3px; color: var(--text-dim);
}
.canvas-compare-suggestion:hover { background: var(--bg-raised); color: var(--accent); }
.canvas-compare-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
}
.canvas-compare-side {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: 5px; padding: 10px;
  display: flex; flex-direction: column; gap: 8px;
}
.canvas-compare-side-head {
  display: flex; align-items: baseline; gap: 8px;
  padding-bottom: 6px; border-bottom: 1px dashed var(--border);
}
.canvas-compare-side-name {
  font-size: 13px; font-weight: 600; color: var(--text);
}
.canvas-compare-side-domain {
  font-size: 10.5px; color: var(--text-mut);
}
.canvas-compare-section { display: flex; flex-direction: column; gap: 4px; }
.canvas-compare-delta-section {
  margin-top: 12px; padding-top: 8px;
  border-top: 1px dashed var(--border);
}
.canvas-compare-delta {
  width: 100%; border-collapse: collapse; font-size: 11px;
  margin-top: 6px;
}
.canvas-compare-delta th {
  text-align: left; padding: 4px 6px; color: var(--text-mut);
  font-weight: 500; font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.05em; border-bottom: 1px solid var(--border);
}
.canvas-compare-delta td {
  padding: 4px 6px; border-bottom: 1px dashed var(--border);
  color: var(--text-dim); vertical-align: top;
}
.canvas-compare-kind {
  font-size: 9px; padding: 1px 5px; border-radius: 2px;
  text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;
}
.canvas-compare-kind-A-only { background: rgba(212,160,23,0.15); color: var(--warning, #d4a017); }
.canvas-compare-kind-B-only { background: rgba(102,187,106,0.15); color: var(--success); }
.canvas-compare-kind-diff   { background: rgba(239,68,68,0.15); color: var(--error); }

/* MVP #7: measurement lane (5th Canvas stage). */
.canvas-row-measurement { border-left-color: var(--warning, #d4a017); }
.canvas-measurement-cell {
  display: flex; flex-direction: column; gap: 4px;
  padding: 6px 10px; margin: 0 6px 6px 0;
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: 4px; font-size: 11px; min-width: 240px;
}
.canvas-measurement-cell .mono { color: var(--text-dim); }
.canvas-measure-btn {
  background: transparent; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 3px;
  padding: 1px 8px; font-size: 10px; font-weight: 500;
  cursor: pointer; align-self: flex-start;
  font-family: inherit; transition: background-color 0.15s;
}
.canvas-measure-btn:hover:not(:disabled) { background: var(--accent); color: #000; }
.canvas-measure-btn:disabled { opacity: 0.6; cursor: wait; }
.canvas-measure-result { display: contents; }
.canvas-measure-totals {
  display: flex; flex-wrap: wrap; gap: 6px; padding-top: 4px;
  border-top: 1px dashed var(--border);
}
.canvas-measure-total {
  font-size: 10.5px; color: var(--text-dim);
  background: var(--bg-input); padding: 1px 5px; border-radius: 2px;
}
.canvas-measure-pacing {
  display: flex; flex-direction: column; gap: 2px;
  margin-top: 4px;
}
.canvas-measure-pacing-bar {
  display: grid; grid-template-columns: 1fr 30px 50px;
  gap: 6px; align-items: center; font-size: 10px;
  color: var(--text-mut); position: relative;
}
.canvas-measure-bar-fill {
  display: block; height: 4px; background: var(--accent); border-radius: 2px;
}
.canvas-measure-bar-day { color: var(--text-mut); }
.canvas-measure-bar-spend { text-align: right; color: var(--text-dim); }
.canvas-measure-recs {
  margin: 4px 0 0 14px; padding: 0; font-size: 10.5px;
  color: var(--text-mut);
}
.canvas-measure-recs li { margin-bottom: 2px; }

/* Phase C: policy hits row on the brand card. Each chip = one
   applicable policy from the agentic-advertising registry,
   matched on brand industries. Color codes: red = must
   regulation, amber = must standard, muted = should. */
.canvas-policy-row {
  margin-top: 10px; padding: 8px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.canvas-policy-chips {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;
}
.canvas-policy-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 7px; border-radius: 4px; font-size: 11px;
  background: var(--bg-raised); border: 1px solid var(--border);
  cursor: help;
}
.canvas-policy-chip.canvas-policy-must  { border-color: var(--error); }
.canvas-policy-chip.canvas-policy-should { border-color: var(--warning, #d4a017); }
.canvas-policy-cat {
  font-size: 8.5px; padding: 1px 4px; border-radius: 2px;
  font-weight: 600; letter-spacing: 0.04em;
}
.canvas-policy-cat.canvas-policy-reg { background: var(--error); color: #000; }
.canvas-policy-cat.canvas-policy-std { background: var(--accent); color: #000; }
.canvas-policy-name { color: var(--text); }
.canvas-policy-enf {
  font-size: 9px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.05em;
}

/* MVP #2: predictive check_governance overlay row. Sits between
   policy-hits and the run button. Shows worst-outcome banner +
   per-policy chips with hover reasoning. */
.canvas-governance-row {
  margin-top: 8px; padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.canvas-governance-body {
  display: flex; flex-direction: column; gap: 6px; margin-top: 4px;
}
.canvas-gov-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; border-radius: 4px;
  border: 1px solid currentColor; font-size: 12px;
}
.canvas-gov-banner .canvas-gov-icon { font-size: 14px; }
.canvas-gov-banner .canvas-gov-banner-meta {
  margin-left: auto; font-family: var(--font-mono);
  font-size: 10.5px; color: var(--text-mut);
}
.canvas-gov-allow { color: var(--success); background: rgba(102,187,106,0.10); }
.canvas-gov-warn  { color: var(--warning, #d4a017); background: rgba(212,160,23,0.10); }
.canvas-gov-block { color: var(--error); background: rgba(239,68,68,0.10); }
.canvas-gov-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.canvas-gov-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 5px; border-radius: 3px; font-size: 10px;
  background: var(--bg-raised); border: 1px solid var(--border);
  cursor: help;
}
.canvas-gov-chip-allow { border-color: var(--success); }
.canvas-gov-chip-warn  { border-color: var(--warning, #d4a017); }
.canvas-gov-chip-block { border-color: var(--error); }
.canvas-gov-chip-enf {
  font-size: 8.5px; padding: 0 3px; border-radius: 2px;
  background: var(--bg-input); color: var(--text-mut);
}
.canvas-gov-chip-id { color: var(--text-dim); }
.canvas-gov-chip-out {
  font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--text-mut);
}

/* Refinement C: brand-rights row — symmetric with governance preview. */
.canvas-rights-row {
  margin-top: 8px; padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.canvas-rights-body {
  display: flex; flex-direction: column; gap: 6px; margin-top: 4px;
}
.canvas-rights-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; border-radius: 4px;
  border: 1px solid currentColor; font-size: 12px;
}
.canvas-rights-banner .canvas-rights-icon { font-size: 14px; }
.canvas-rights-banner .canvas-rights-banner-text strong { font-family: var(--font-mono); }
.canvas-rights-banner .canvas-rights-banner-meta { margin-left: auto; }
.canvas-rights-ok    { color: var(--success); background: rgba(102,187,106,0.10); }
.canvas-rights-warn  { color: var(--warning, #d4a017); background: rgba(212,160,23,0.10); }
.canvas-rights-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.canvas-rights-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 5px; border-radius: 3px; font-size: 10px;
  background: var(--bg-raised); border: 1px solid var(--border);
  cursor: help;
}
.canvas-rights-chip-owned       { border-color: var(--success); }
.canvas-rights-chip-self_owned  { border-color: var(--success); }
.canvas-rights-chip-delegated   { border-color: var(--accent); }
.canvas-rights-chip-needs_clearance { border-color: var(--warning, #d4a017); }
.canvas-rights-chip-unknown     { border-color: var(--text-mut); }
.canvas-rights-chip-id  { color: var(--text-dim); }
.canvas-rights-chip-out {
  font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--text-mut);
}
.canvas-rights-flag {
  font-size: 8px; padding: 0 3px; border-radius: 2px;
  background: var(--bg-input); color: var(--text-mut); font-weight: 600;
}
.canvas-rights-advisories {
  margin: 4px 0 0 14px; padding: 0; font-size: 10.5px;
  color: var(--text-mut);
}
.canvas-rights-advisories li { margin-bottom: 2px; }

/* Wave 1: Sponsored-Intelligence row — symmetric with brand-rights /
   governance preview rows. Closes the AdCP 4th protocol domain
   visually on Canvas. */
.canvas-si-row {
  margin-top: 8px; padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.canvas-si-body { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.canvas-si-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; border-radius: 4px; font-size: 12px;
  border: 1px solid currentColor;
}
.canvas-si-icon { font-size: 14px; }
.canvas-si-rate-limited { color: var(--warning, #d4a017); background: rgba(212,160,23,0.10); }
.canvas-si-summary { color: var(--text-dim); }
.canvas-si-section-label {
  font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-mut); font-weight: 600;
  margin-top: 4px; margin-bottom: 2px;
}
.canvas-si-comps {
  width: 100%; border-collapse: collapse; font-size: 11px;
}
.canvas-si-comps th {
  text-align: left; padding: 3px 6px; color: var(--text-mut);
  font-weight: 500; font-size: 9.5px; text-transform: uppercase;
  letter-spacing: 0.05em; border-bottom: 1px solid var(--border);
}
.canvas-si-comps td {
  padding: 4px 6px; color: var(--text-dim);
  border-bottom: 1px dashed var(--border);
}
.canvas-si-comps tr:last-child td { border-bottom: none; }
.canvas-si-comps tr.canvas-si-trend-up   .canvas-si-trend-icon { color: var(--success); font-weight: 700; }
.canvas-si-comps tr.canvas-si-trend-down .canvas-si-trend-icon { color: var(--error); font-weight: 700; }
.canvas-si-comps tr.canvas-si-trend-flat .canvas-si-trend-icon { color: var(--text-mut); }
.canvas-si-insight {
  padding: 6px 10px; border-radius: 4px; font-size: 11.5px;
  background: var(--bg-raised); border: 1px solid var(--border);
  border-left-width: 3px;
}
.canvas-si-insight-competitive       { border-left-color: var(--accent); }
.canvas-si-insight-category          { border-left-color: var(--success); }
.canvas-si-insight-content_adjacency { border-left-color: var(--warning, #d4a017); }
.canvas-si-insight-share_of_voice    { border-left-color: #c084fc; }
.canvas-si-insight-head {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 3px;
}
.canvas-si-tier {
  font-size: 8.5px; padding: 1px 5px; border-radius: 2px;
  background: var(--bg-input); color: var(--text);
  font-weight: 700; letter-spacing: 0.06em;
}
.canvas-si-headline { color: var(--text); font-weight: 500; }
.canvas-si-conf { margin-left: auto; }
.canvas-si-detail { color: var(--text-dim); font-size: 11px; line-height: 1.4; }
.canvas-si-action {
  margin-top: 4px; padding-top: 4px;
  border-top: 1px dashed var(--border);
  color: var(--accent); font-size: 10.5px;
}

/* Phase B: registry health bar. Strip across canvas-bottom showing
   how stale our local view of the registry is (agents + policies
   + brands). Click-through to upstream registry. */
.canvas-registry-bar {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 8px 12px; margin-bottom: 8px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: 5px; font-size: 11px;
}
.canvas-registry-label {
  font-size: 10px; color: var(--text-mut);
  text-transform: uppercase; letter-spacing: 0.06em;
}
.canvas-registry-stat { color: var(--text-dim); }
.canvas-registry-stat .registry-pill {
  display: inline-block; padding: 1px 6px; border-radius: 3px;
  background: var(--bg-raised); border: 1px solid var(--border);
  font-family: var(--font-mono); font-size: 10.5px;
  margin-left: 4px;
}
.canvas-registry-stat .registry-pill-new {
  border-color: var(--accent); color: var(--accent);
}
.canvas-registry-stat-href { margin-left: auto; }
.canvas-registry-stat-href a { color: var(--accent); }

.canvas-brand-actions {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 10px 0; margin: 10px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.canvas-run-btn {
  display: inline-flex; align-items: center; gap: 6px; justify-content: center;
  background: var(--accent); color: #000; border: 1px solid var(--accent);
  border-radius: 4px; padding: 8px 14px; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: filter 0.15s;
}
.canvas-run-btn:hover { filter: brightness(1.1); }
.canvas-run-btn .ico { width: 12px; height: 12px; }
.canvas-derived-brief {
  flex: 1; min-width: 200px;
  color: var(--text-dim);
  font-size: 11px;
}

/* Phase 3: governance + brand-rights + measurement spec cards.
   Make the AdCP 3.0 unimplemented-tool surface visible by design. */
.canvas-spec-block {
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-left: 3px solid #ffb74d;
  border-radius: 5px;
}
.canvas-spec-header {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 8px; margin-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.canvas-spec-label {
  font-size: 12.5px; font-weight: 500; color: var(--text);
}
.canvas-spec-body {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 8px;
}
.canvas-spec-card {
  padding: 8px 10px;
  background: var(--bg-raised);
  border: 1px dashed var(--border);
  border-radius: 4px;
}
.canvas-spec-card-gap {
  border-color: var(--error);
  background: rgba(239,83,80,0.05);
}
.canvas-spec-card-name {
  font-size: 11.5px; font-weight: 500; color: var(--accent);
  margin-bottom: 3px;
}
.canvas-spec-card-shape {
  font-size: 10.5px; color: var(--text-dim); line-height: 1.45;
  margin-bottom: 4px;
}
.canvas-spec-card-shape code {
  font-size: 10px; background: var(--bg-input); padding: 1px 4px; border-radius: 3px;
}
.canvas-spec-card-note { color: var(--text-mut); line-height: 1.4; }
.canvas-spec-card-note strong { color: var(--text); }

/* AdCP 3.0.1: mode swatch on check_governance card.
   Visual strawman of the enforcement-posture options surfaced by the
   new mode response field. Workshop trust-contract teaching moment:
   is your governance call actually gating, or just telemetry? */
.canvas-gov-mode-row {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  margin-top: 6px; padding-top: 6px;
  border-top: 1px dashed var(--border);
}
.canvas-gov-mode-label {
  color: var(--text-mut); font-size: 10px;
}
.canvas-gov-mode-pill {
  font-size: 9.5px; padding: 1px 6px; border-radius: 3px;
  border: 1px solid currentColor; cursor: help;
}
.canvas-gov-mode-enforce  { color: var(--error); background: rgba(239,83,80,0.08); }
.canvas-gov-mode-advisory { color: var(--warning, #d4a017); background: rgba(212,160,23,0.08); }
.canvas-gov-mode-audit    { color: var(--text-dim); background: var(--bg-input); }

/* Phase 4: view-mode toggle (Pattern C/B/A). */
.canvas-viewmodes {
  display: flex; align-items: center; gap: 6px;
  margin-top: 10px; padding: 6px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 5px;
}
.canvas-viewmode {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: 4px; padding: 4px 10px; font-size: 11px;
  cursor: pointer; color: var(--text-mut);
  transition: color 0.15s, border-color 0.15s;
}
.canvas-viewmode:hover:not(.disabled) { color: var(--accent); border-color: var(--accent-border); }
.canvas-viewmode.active {
  color: var(--accent); border-color: var(--accent);
  background: var(--accent-dim);
}
.canvas-viewmode.disabled {
  opacity: 0.5; cursor: not-allowed;
}

/* Phase 4: closed-loop indicator. Plain row, no SVG aspect-ratio
   surprises. Sits between the In-flight + measurement spec card
   and the view-mode toggle. */
.canvas-loop-indicator {
  display: flex; align-items: center; gap: 10px;
  margin: 12px 0;
  padding: 8px 12px;
  background: linear-gradient(90deg,
    rgba(79,195,127,0.05) 0%,
    rgba(255,183,77,0.06) 50%,
    rgba(79,195,127,0.05) 100%);
  border: 1px dashed var(--accent);
  border-radius: 5px;
  font-size: 11px;
  color: var(--text-dim);
}
.canvas-loop-arrow-glyph {
  font-size: 18px; color: var(--accent);
  /* gentle rotation hint to suggest the loop without animating */
  display: inline-block; transform: rotate(0deg);
}
.canvas-loop-text { flex: 1; }

.canvas-bottom { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.canvas-bottom-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-left: 3px solid var(--text-mut); border-radius: 5px;
}
.canvas-row-governance  { border-left-color: #ffb74d; }
.canvas-row-mediabuy    { border-left-color: var(--accent); }
.canvas-row-measurement { border-left-color: #ba68c8; }
.canvas-bottom-label {
  font-size: 12.5px; font-weight: 500; color: var(--text);
  min-width: 200px;
}
.canvas-bottom-body { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

/* Sec-48n: pickable product rows + fire-buy button. */
.wf-product-pickable { cursor: pointer; border-radius: 3px; }
.wf-product-pickable:hover {
  background: var(--bg-hover);
  outline: 1px solid var(--accent-border);
}
.wf-product-pickable:hover .wf-product-name { color: var(--accent); }
.wf-refire-btn {
  display: inline-flex; align-items: center; gap: 4px; justify-content: center;
  background: var(--accent); color: #000; border: 1px solid var(--accent);
  border-radius: 4px; padding: 6px 10px; font-size: 11px; font-weight: 500;
  cursor: pointer; transition: background-color 0.15s, opacity 0.15s;
}
.wf-refire-btn:hover:not(:disabled) { background: var(--accent-hover, var(--accent)); filter: brightness(1.1); }
.wf-refire-btn:disabled { opacity: 0.6; cursor: wait; }
.wf-refire-btn .ico { width: 11px; height: 11px; }
.wf-refire-btn .spinner {
  display: inline-block; border: 1.5px solid rgba(0,0,0,0.2);
  border-top-color: #000; border-radius: 50%;
  animation: wf-spinner-rotate 0.7s linear infinite;
}

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
