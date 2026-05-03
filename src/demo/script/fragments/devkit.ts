// src/demo/script/fragments/devkit.ts
//
// Devkit pane: API key display, code samples, destination field renderer.
//
// Source range (in pre-refactor src/demo/script.ts): lines 4228..4475 (248 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const devkitJs = `function ensureDevkit() {
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
`;
