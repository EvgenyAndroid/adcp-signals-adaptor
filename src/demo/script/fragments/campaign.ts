// src/demo/script/fragments/campaign.ts
//
// Campaign generation: editable detection, source toggle wiring, selector + card render, provenance pill, tool coverage.
//
// Source range (in pre-refactor src/demo/script.ts): lines 10257..11159 (903 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const campaignJs = `function _isEditable(el) {
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
      // Original Sec-38 mapping
      d: "discover", c: "catalog", b: "builder", t: "treemap", o: "overlap",
      e: "embedding", k: "capabilities", v: "devkit", n: "destinations",
      l: "toollog", a: "activations",
      // Sec-41 new tabs. Bare f is reserved for detail-panel expand; the
      // g f prefix disambiguates.
      x: "lab", p: "portfolio", s: "seasonality", f: "federation",
      // 2026-05-04 — fill in remaining tabs that lacked shortcuts.
      // Mnemonics chosen to avoid collision with reserved letters above:
      //   y → sYnonyms (concept registry is the vocab layer)
      //   m → coMpose
      //   r → Rule (expression is rule-AST)
      //   j → Journey
      //   q → Query / sQenario (planner is what-if)
      //   h → History / Hash
      //   w → Window (freshness window)
      //   u → Unify agents (orchestrator)
      //   1/2/3 → Workshop Canvases #1, #2, #3
      y: "concepts", m: "composer", r: "expression", j: "journey",
      q: "planner", h: "snapshots", w: "freshness", u: "orchestrator",
      "1": "canvas", "2": "campaign", "3": "agentic",
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

// MVP #1: deep-link from a workflow permalink. If page loaded with ?wf=,
// auto-jump to Canvas tab + replay the snapshot.
(function () {
  try {
    var u = new URL(location.href);
    if (u.searchParams.get("wf") && /^wf_[a-z0-9]+$/i.test(u.searchParams.get("wf"))) {
      switchTab("canvas");
    }
  } catch (e) { /* noop */ }
})();

// ─────────────────────────────────────────────────────────────────
// Campaign Canvas (DSP buy-side control loop)
// ─────────────────────────────────────────────────────────────────

var _campaignCurrent = null;
var _campaignList = [];
var _campaignLoaded = false;
var _campaignSource = "demo";   // "demo" | "live"
var _campaignCoverage = null;   // probe matrix (cached after first load)

async function _campaignInit() {
  if (_campaignLoaded) return;
  _campaignLoaded = true;
  // Fire coverage probe + campaigns in parallel.
  _campaignFillCoverage();
  _campaignWireSourceToggle();
  try {
    var r = await fetch("/dsp/campaigns");
    var d = await r.json();
    _campaignList = d.campaigns || [];
    _campaignRenderSelector();
    if (_campaignList.length > 0) _campaignSelect(_campaignList[0].campaign_id);
  } catch (e) {
    var host = document.getElementById("campaign-card-host");
    if (host) host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">Failed to load campaigns</div></div>';
  }
}

// ── Live MCP coverage strip ───────────────────────────────────────────
async function _campaignFillCoverage() {
  var pills = document.getElementById("campaign-coverage-pills");
  if (!pills) return;
  try {
    var r = await fetch("/dsp/agents/coverage");
    _campaignCoverage = await r.json();
    var s = _campaignCoverage.coverage_summary || {};
    var spec = (_campaignCoverage.spec_status && _campaignCoverage.spec_status.spec_lifecycle) || [];
    var unspec = (_campaignCoverage.spec_status && _campaignCoverage.spec_status.unspec_primitives) || [];
    function pill(tool, isUnspec) {
      var sup = (s[tool] && s[tool].supported_count) || 0;
      var total = (s[tool] && s[tool].total_buying_agents) || 0;
      var clsState = sup === 0 ? "cov-zero" : sup === total ? "cov-full" : "cov-partial";
      var cls = "campaign-coverage-pill " + clsState + (isUnspec ? " cov-unspec" : "");
      var label = tool.replace(/^submit_|^get_|^optimize_/, "").replace(/_/g, " ");
      return '<span class="' + cls + '" title="' + escapeHtml(tool) + ' — ' + sup + '/' + total + ' agents · ' + (isUnspec ? "unspec'd in 3.0 GA" : "lifecycle tool") + '">' +
        '<span class="campaign-coverage-pill-tool mono">' + escapeHtml(label) + '</span>' +
        '<span class="campaign-coverage-pill-frac mono">' + sup + '/' + total + '</span>' +
      '</span>';
    }
    pills.innerHTML =
      '<span class="campaign-coverage-group-label">spec lifecycle:</span>' +
      spec.map(function (t) { return pill(t, false); }).join("") +
      '<span class="campaign-coverage-divider">|</span>' +
      '<span class="campaign-coverage-group-label">unspec&apos;d primitives:</span>' +
      unspec.map(function (t) { return pill(t, true); }).join("") +
      // Feature E: per-agent capabilities deep-probe links.
      '<span class="campaign-coverage-divider">|</span>' +
      '<span class="campaign-coverage-group-label">caps:</span>' +
      (_campaignCoverage.agents || []).map(function (a) {
        return '<button class="campaign-cap-link" data-agent-id="' + escapeHtml(a.agent_id) + '" title="get_adcp_capabilities on ' + escapeHtml(a.agent_id) + '">' + escapeHtml(a.agent_id) + '</button>';
      }).join(" ");
    pills.querySelectorAll(".campaign-cap-link").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var aid = btn.getAttribute("data-agent-id");
        if (aid) _campaignShowAgentCaps(aid);
      });
    });
  } catch (e) {
    pills.innerHTML = '<span class="orch-small" style="color:var(--text-mut)">coverage probe failed</span>';
  }
}

// ── Source toggle (demo / live) ──────────────────────────────────────
function _campaignWireSourceToggle() {
  document.querySelectorAll(".campaign-source-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var src = btn.getAttribute("data-source");
      if (!src || src === _campaignSource) return;
      _campaignSource = src;
      document.querySelectorAll(".campaign-source-btn").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-source") === src);
      });
      var livePanel = document.getElementById("campaign-live-panel");
      if (livePanel) livePanel.style.display = (src === "live") ? "" : "none";
      if (src === "live") _campaignFillLiveBuys();
    });
  });
}

// ── Live media-buys aggregator ───────────────────────────────────────
async function _campaignFillLiveBuys() {
  var list = document.getElementById("campaign-live-list");
  var meta = document.getElementById("campaign-live-meta");
  if (!list) return;
  list.innerHTML = '<span class="orch-small">querying get_media_buys across capable agents…</span>';
  try {
    var r = await fetch("/dsp/media-buys/live");
    var d = await r.json();
    if (meta) {
      meta.textContent =
        d.capable_agent_count + ' capable · ' +
        d.ok_count + ' returned · ' +
        d.auth_gated_count + ' auth-gated · ' +
        d.total_media_buys + ' real campaigns found';
    }
    if (!d.media_buys || d.media_buys.length === 0) {
      // Show per-agent status so the gap is visible.
      var perAgent = (d.per_agent || []).map(function (a) {
        var stateCls = a.ok ? "cov-full" : a.auth_gated ? "cov-auth" : "cov-zero";
        var stateLabel = a.ok ? "ok (0 buys)" : a.auth_gated ? "auth-gated" : "error";
        return '<div class="campaign-live-agent-row ' + stateCls + '">' +
          '<span class="mono">' + escapeHtml(a.agent_id) + '</span>' +
          '<span class="campaign-coverage-pill-frac">' + escapeHtml(stateLabel) + '</span>' +
          (a.error ? '<span class="orch-small" style="color:var(--text-mut)">' + escapeHtml(String(a.error).slice(0, 100)) + '</span>' : '') +
        '</div>';
      }).join("");
      list.innerHTML =
        '<div class="campaign-live-empty">' +
          '<div class="orch-small" style="color:var(--text-mut);margin-bottom:6px">no real campaigns returned — workshop story below:</div>' +
          perAgent +
          '<div class="orch-small" style="color:var(--text-mut);margin-top:6px">→ to populate this list, fire <code>create_media_buy</code> on a buying agent that returns ok (auth required for the default trio).</div>' +
        '</div>';
      return;
    }
    list.innerHTML = d.media_buys.map(function (b) {
      var brand = (b.brand && (b.brand.name || b.brand.domain)) || (b.brand_manifest && b.brand_manifest.brand) || "(no brand)";
      var budget = b.total_budget && (typeof b.total_budget === "object" ? b.total_budget.amount : b.total_budget);
      return '<div class="campaign-live-buy-row" data-media-buy-id="' + escapeHtml(b.media_buy_id || b.buyer_ref || "") + '" data-source-agent-id="' + escapeHtml(b.source_agent_id) + '">' +
        '<div class="campaign-live-buy-head">' +
          '<span class="mono">' + escapeHtml(b.media_buy_id || b.buyer_ref || "?") + '</span>' +
          '<span class="pill pill-muted mono" style="font-size:9.5px">' + escapeHtml(b.source_agent_id) + '</span>' +
          (b.status ? '<span class="orch-small mono" style="color:var(--text-mut)">' + escapeHtml(String(b.status)) + '</span>' : '') +
        '</div>' +
        '<div class="campaign-live-buy-meta orch-small">' +
          escapeHtml(brand) +
          (budget ? ' · $' + budget.toLocaleString() : '') +
          (b.start_time ? ' · ' + escapeHtml(String(b.start_time).slice(0, 10)) : '') +
        '</div>' +
        '<button class="campaign-live-buy-load mono" data-media-buy-id="' + escapeHtml(b.media_buy_id || "") + '" data-source-agent-id="' + escapeHtml(b.source_agent_id) + '">Load LIVE delivery</button>' +
      '</div>';
    }).join("");
    list.querySelectorAll(".campaign-live-buy-load").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-media-buy-id");
        var aid = btn.getAttribute("data-source-agent-id");
        if (id && aid) _campaignLoadLiveDelivery(id, aid, btn);
      });
    });
  } catch (e) {
    list.innerHTML = '<span class="orch-small" style="color:var(--error)">live media-buys aggregator failed</span>';
  }
}

async function _campaignLoadLiveDelivery(mediaBuyId, agentId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = "fetching…"; }
  try {
    var r = await fetch("/dsp/media-buys/" + encodeURIComponent(mediaBuyId) + "/delivery-live?agent_id=" + encodeURIComponent(agentId));
    var d = await r.json();
    var body = document.getElementById("campaign-delivery-body");
    if (!body) return;
    if (!d.ok) {
      body.innerHTML =
        '<div class="campaign-pacing-banner ' + (d.auth_gated ? "campaign-pacing-under" : "campaign-pacing-over") + '">' +
          '<span class="campaign-pacing-banner-label">' + (d.auth_gated ? "AUTH-GATED" : "ERROR") + '</span>' +
          '<span class="orch-small">live get_media_buy_delivery on ' + escapeHtml(d.agent_id) + ' returned ' + (d.error ? escapeHtml(d.error.slice(0, 200)) : "no body") + '</span>' +
        '</div>' +
        '<div class="orch-small" style="color:var(--text-mut)">falling back to mocked pacing for the demo.</div>';
    } else {
      body.innerHTML =
        '<div class="campaign-pacing-banner campaign-pacing-on_track">' +
          '<span class="campaign-pacing-banner-label">LIVE</span>' +
          '<span class="orch-small">get_media_buy_delivery returned in ' + d.latency_ms + 'ms from ' + escapeHtml(d.agent_id) + '</span>' +
          '<span class="campaign-data-source-pill" style="margin-left:auto">LIVE</span>' +
        '</div>' +
        '<pre class="wf-json mono" style="max-height:300px;overflow:auto">' + escapeHtml(JSON.stringify(d.delivery, null, 2).slice(0, 4000)) + '</pre>';
    }
    if (btn) { btn.textContent = "Reload LIVE delivery"; btn.disabled = false; }
  } catch (e) {
    if (btn) { btn.textContent = "Retry"; btn.disabled = false; }
  }
}

function _campaignRenderSelector() {
  var el = document.getElementById("campaign-selector-buttons");
  if (!el) return;
  el.innerHTML = _campaignList.map(function (c) {
    var active = (_campaignCurrent && _campaignCurrent.campaign_id === c.campaign_id) ? "active" : "";
    return '<button class="campaign-selector-btn ' + active + '" data-campaign-id="' + escapeHtml(c.campaign_id) + '">' +
      '<span class="campaign-selector-name">' + escapeHtml(c.brand_name) + '</span>' +
      '<span class="campaign-selector-kpi mono">' + escapeHtml(c.kpi) + ' ' + (c.kpi === "CPM" || c.kpi === "CPA" ? "$" : "") + escapeHtml(String(c.kpi_target)) + (c.kpi === "ROAS" ? "x" : c.kpi === "BRAND_LIFT" ? "%" : "") + '</span>' +
    '</button>';
  }).join("");
  el.querySelectorAll(".campaign-selector-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-campaign-id");
      if (id) _campaignSelect(id);
    });
  });
}

async function _campaignSelect(campaignId) {
  try {
    var r = await fetch("/dsp/campaigns/" + encodeURIComponent(campaignId));
    _campaignCurrent = await r.json();
    _campaignRenderSelector();
    _campaignRenderCard();
    var loop = document.getElementById("campaign-loop");
    if (loop) loop.style.display = "";
    // Hydrate all 5 lanes in parallel.
    _campaignFillStrategy();
    _campaignFillStream();
    _campaignFillInventory();
    _campaignFillDelivery();
    _campaignFillAttribution();
  } catch (e) { /* noop */ }
}

function _campaignRenderCard() {
  var c = _campaignCurrent;
  var host = document.getElementById("campaign-card-host");
  if (!host || !c) return;
  var startMs = Date.parse(c.flight_start);
  var endMs = Date.parse(c.flight_end);
  var totalDays = Math.max(1, Math.round((endMs - startMs) / 86400000));
  var daysElapsed = Math.min(totalDays, c.start_day_offset || 0);
  var daysRemaining = totalDays - daysElapsed;
  var pctElapsed = Math.round((daysElapsed / totalDays) * 100);
  var kpiLabel = c.kpi + " target: " + (c.kpi === "CPM" || c.kpi === "CPA" ? "$" : "") + c.kpi_target + (c.kpi === "ROAS" ? "x" : c.kpi === "BRAND_LIFT" ? "%" : "");
  var geoChips = (c.geo || []).map(function (g) {
    return '<span class="pill pill-muted mono" style="font-size:10px">' + escapeHtml(g) + '</span>';
  }).join(" ");
  host.innerHTML =
    '<div class="campaign-card">' +
      '<div class="campaign-card-head">' +
        '<div class="campaign-card-name">' + escapeHtml(c.name) + '</div>' +
        '<div class="campaign-card-brand mono">' + escapeHtml(c.brand_domain || "") + '</div>' +
      '</div>' +
      '<div class="campaign-card-grid">' +
        '<div class="campaign-card-cell">' +
          '<div class="campaign-card-label">KPI target</div>' +
          '<div class="campaign-card-value campaign-kpi-' + escapeHtml(String(c.kpi).toLowerCase()) + '">' + escapeHtml(kpiLabel) + '</div>' +
        '</div>' +
        '<div class="campaign-card-cell">' +
          '<div class="campaign-card-label">Budget</div>' +
          '<div class="campaign-card-value mono">$' + c.budget_total_usd.toLocaleString() + '</div>' +
          '<div class="campaign-card-sub orch-small">cap $' + c.budget_daily_cap_usd.toLocaleString() + '/day</div>' +
        '</div>' +
        '<div class="campaign-card-cell">' +
          '<div class="campaign-card-label">Flight</div>' +
          '<div class="campaign-card-value mono">' + escapeHtml(c.flight_start) + ' → ' + escapeHtml(c.flight_end) + '</div>' +
          '<div class="campaign-card-sub orch-small">day ' + daysElapsed + ' of ' + totalDays + ' · ' + daysRemaining + ' left</div>' +
        '</div>' +
        '<div class="campaign-card-cell">' +
          '<div class="campaign-card-label">Frequency cap</div>' +
          '<div class="campaign-card-value mono">' + c.freq_cap_per_user + '/user</div>' +
        '</div>' +
        '<div class="campaign-card-cell campaign-card-cell-wide">' +
          '<div class="campaign-card-label">Geo + audience brief</div>' +
          '<div class="campaign-card-value">' + geoChips + '</div>' +
          '<div class="campaign-card-sub orch-small mono">' + escapeHtml(c.audience_brief || "") + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="campaign-card-progress">' +
        '<div class="campaign-card-progress-label orch-small"><span style="color:var(--text-mut)">flight progress</span> <span class="mono">' + pctElapsed + '%</span></div>' +
        '<div class="campaign-card-progress-bar"><div class="campaign-card-progress-fill" style="width:' + pctElapsed + '%"></div></div>' +
      '</div>' +
      // Feature B: live fire button. Calls /dsp/campaigns/:id/fire-live →
      // create_media_buy on a real buying agent. Auth-gated response is
      // expected for the default trio; surfaces inline with the boundary.
      '<div class="campaign-card-actions">' +
        '<button class="campaign-fire-btn" id="campaign-fire-btn" data-campaign-id="' + escapeHtml(c.campaign_id) + '">' +
          '<svg class="ico"><use href="#icon-bolt"/></svg>' +
          '<span>Simulate live fire</span>' +
        '</button>' +
        '<select class="campaign-fire-agent" id="campaign-fire-agent">' +
          '<option value="adzymic_apx">adzymic_apx</option>' +
          '<option value="claire_scope3">claire_scope3</option>' +
          '<option value="swivel">swivel</option>' +
          '<option value="content_ignite">content_ignite</option>' +
        '</select>' +
        '<span class="orch-small" style="color:var(--text-mut)">→ create_media_buy on the chosen agent with the campaign brief + brand + signals</span>' +
        '<div class="campaign-fire-result orch-small" id="campaign-fire-result"></div>' +
      '</div>' +
    '</div>';
  // Wire fire button.
  var fireBtn = document.getElementById("campaign-fire-btn");
  if (fireBtn) fireBtn.addEventListener("click", _campaignFireLive);
}

// Feature B: live fire from Campaign card.
async function _campaignFireLive() {
  if (!_campaignCurrent) return;
  var btn = document.getElementById("campaign-fire-btn");
  var sel = document.getElementById("campaign-fire-agent");
  var out = document.getElementById("campaign-fire-result");
  if (!btn || !sel || !out) return;
  var agentId = sel.value;
  btn.disabled = true; btn.textContent = "firing…";
  try {
    var r = await fetch("/dsp/campaigns/" + encodeURIComponent(_campaignCurrent.campaign_id) + "/fire-live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agentId, signal_ids: [] }),
    });
    var d = await r.json();
    var statusCls = d.ok ? "campaign-fire-ok" : (d.auth_gated ? "campaign-fire-auth" : "campaign-fire-err");
    var label = d.ok ? "OK" : (d.auth_gated ? "AUTH-GATED" : "ERROR");
    var msg = d.ok ? "media-buy created · " + d.latency_ms + "ms" : (d.error || "no response body");
    out.innerHTML =
      '<div class="campaign-fire-row ' + statusCls + '">' +
        '<span class="campaign-fire-label">' + label + '</span>' +
        '<span class="mono">' + escapeHtml(d.agent_id) + '</span>' +
        '<span>' + escapeHtml(String(msg).slice(0, 200)) + '</span>' +
      '</div>';
    if (d.ok) {
      // Refresh the live media-buys panel since a new buy now exists.
      _campaignSource = "live";
      var liveToggle = document.querySelector('.campaign-source-btn[data-source="live"]');
      if (liveToggle) liveToggle.click();
    }
    btn.textContent = "Re-fire"; btn.disabled = false;
  } catch (e) {
    out.innerHTML = '<span class="orch-small" style="color:var(--error)">' + escapeHtml(String((e && e.message) || e)) + '</span>';
    btn.textContent = "Retry"; btn.disabled = false;
  }
}

// ── Provenance pill helper ───────────────────────────────────────────
// Returns a small inline pill describing whether this lane's data is
// LIVE (from a real agent), MOCK (synthetic), or LIVE-FALLBACK (we
// tried live and got nothing usable). Workshop-relevant: every lane
// states its provenance honestly.
function _campaignProvenancePill(state, detail) {
  var cls = "campaign-provenance-" + state;
  var label = state === "live" ? "LIVE" : state === "fallback" ? "LIVE-FALLBACK" : state === "zero" ? "MOCK · 0 live agents" : "MOCK";
  return '<span class="campaign-provenance-pill ' + cls + '" title="' + escapeHtml(detail || "") + '">' + label + '</span>';
}

function _campaignToolCoverage(tool) {
  if (!_campaignCoverage || !_campaignCoverage.coverage_summary) return null;
  var s = _campaignCoverage.coverage_summary[tool];
  if (!s) return null;
  return { sup: s.supported_count, total: s.total_buying_agents };
}

// ── Lane 1: Bid strategy ─────────────────────────────────────────────
async function _campaignFillStrategy() {
  var body = document.getElementById("campaign-strategy-body");
  if (!body || !_campaignCurrent) return;
  // Live coverage: 0 agents advertise submit_bid_strategy. Surface
  // that explicitly so the mock framing stays honest.
  var cov = _campaignToolCoverage("submit_bid_strategy");
  var prov = cov && cov.sup === 0
    ? _campaignProvenancePill("zero", "0/" + cov.total + " agents advertise submit_bid_strategy — primitive is unspec'd in 3.0 GA")
    : _campaignProvenancePill("mock", "synthesized locally");
  try {
    var r = await fetch("/dsp/campaigns/" + encodeURIComponent(_campaignCurrent.campaign_id) + "/strategy");
    var d = await r.json();
    var s = d.strategy;
    var modifiers = s.bid_modifiers.map(function (m) {
      var cls = m.multiplier > 1 ? "mod-up" : "mod-down";
      return '<div class="campaign-strategy-mod ' + cls + '" title="' + escapeHtml(m.reason) + '">' +
        '<span class="mono">' + escapeHtml(m.name) + '</span>' +
        '<span class="campaign-strategy-mod-val mono">×' + m.multiplier + '</span>' +
      '</div>';
    }).join("");
    var dayparting = s.dayparting.map(function (h) {
      var hh = (h.hour < 10 ? "0" : "") + h.hour;
      var height = Math.round((h.multiplier / 1.2) * 24);
      var cls = h.multiplier > 1.05 ? "dp-peak" : h.multiplier < 0.7 ? "dp-low" : "";
      return '<div class="campaign-strategy-daypart ' + cls + '" title="' + hh + ':00 ×' + h.multiplier + '"><div class="campaign-strategy-daypart-bar" style="height:' + height + 'px"></div><span class="campaign-strategy-daypart-h mono">' + hh + '</span></div>';
    }).join("");
    body.innerHTML =
      '<div class="campaign-lane-prov">' + prov + '</div>' +
      '<div class="campaign-strategy-row">' +
        '<div class="campaign-strategy-cell"><div class="campaign-strategy-label">Algorithm</div><div class="mono"><span class="pill pill-muted">' + escapeHtml(s.algorithm) + '</span></div></div>' +
        '<div class="campaign-strategy-cell"><div class="campaign-strategy-label">Base bid</div><div class="mono">$' + s.base_bid_usd + ' CPM</div></div>' +
        '<div class="campaign-strategy-cell"><div class="campaign-strategy-label">Pacing</div><div class="mono">' + escapeHtml(s.pacing_strategy) + '</div></div>' +
        '<div class="campaign-strategy-cell"><div class="campaign-strategy-label">Floor</div><div class="mono">' + escapeHtml(s.floor_strategy) + '</div></div>' +
        '<div class="campaign-strategy-cell"><div class="campaign-strategy-label">Brand safety floor</div><div class="mono">≥' + s.brand_safety_floor + '/100</div></div>' +
        '<div class="campaign-strategy-cell"><div class="campaign-strategy-label">Viewability floor</div><div class="mono">≥' + Math.round(s.viewability_floor * 100) + '%</div></div>' +
      '</div>' +
      '<div class="campaign-strategy-block">' +
        '<div class="campaign-strategy-label">Bid modifiers</div>' +
        '<div class="campaign-strategy-mods">' + modifiers + '</div>' +
      '</div>' +
      '<div class="campaign-strategy-block">' +
        '<div class="campaign-strategy-label">Dayparting (hour-of-day multipliers)</div>' +
        '<div class="campaign-strategy-dayparting">' + dayparting + '</div>' +
      '</div>' +
      // Feature C: live audience signals from get_signals against the brief.
      '<div class="campaign-strategy-block" id="campaign-live-signals-block">' +
        '<div class="campaign-strategy-label">' +
          '<span>Live audience signals</span>' +
          '<span class="campaign-provenance-pill campaign-provenance-live" style="margin-left:6px" title="real call to get_signals on every live signals agent">LIVE · get_signals</span>' +
        '</div>' +
        '<div id="campaign-live-signals-list"><span class="orch-small">querying signals agents…</span></div>' +
      '</div>';
    _campaignFillLiveSignals();
  } catch (e) { body.innerHTML = '<span class="orch-small" style="color:var(--error)">strategy load failed</span>'; }
}

// Feature E: capabilities deep-probe modal.
async function _campaignShowAgentCaps(agentId) {
  var existing = document.getElementById("campaign-cap-modal");
  if (existing) existing.remove();
  var modal = document.createElement("div");
  modal.id = "campaign-cap-modal";
  modal.className = "campaign-cap-modal";
  modal.innerHTML =
    '<div class="campaign-cap-modal-inner">' +
      '<div class="campaign-cap-modal-head">' +
        '<span class="mono">' + escapeHtml(agentId) + ' · get_adcp_capabilities</span>' +
        '<button class="campaign-cap-modal-close" id="campaign-cap-modal-close">×</button>' +
      '</div>' +
      '<div class="campaign-cap-modal-body" id="campaign-cap-modal-body"><span class="orch-small">probing…</span></div>' +
    '</div>';
  document.body.appendChild(modal);
  document.getElementById("campaign-cap-modal-close").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
  try {
    var r = await fetch("/dsp/agents/" + encodeURIComponent(agentId) + "/capabilities-live");
    var d = await r.json();
    var body = document.getElementById("campaign-cap-modal-body");
    if (!d.ok || !d.capabilities) {
      body.innerHTML = '<span class="orch-small" style="color:var(--error)">no capabilities returned · ' + escapeHtml(d.error || "") + '</span>';
      return;
    }
    var caps = d.capabilities;
    var adcp = caps.adcp || {};
    var idem = adcp.idempotency || {};
    var summary =
      '<div class="campaign-cap-summary">' +
        '<div class="campaign-cap-row"><span class="campaign-cap-key">supported_protocols</span><span class="mono">' + escapeHtml(JSON.stringify(caps.supported_protocols || [])) + '</span></div>' +
        '<div class="campaign-cap-row"><span class="campaign-cap-key">supports_governance</span><span class="mono">' + escapeHtml(String(caps.supports_governance ?? false)) + '</span></div>' +
        '<div class="campaign-cap-row"><span class="campaign-cap-key">supports_si</span><span class="mono">' + escapeHtml(String(caps.supports_si ?? false)) + '</span></div>' +
        '<div class="campaign-cap-row"><span class="campaign-cap-key">adcp.major_versions</span><span class="mono">' + escapeHtml(JSON.stringify(adcp.major_versions || [])) + '</span></div>' +
        '<div class="campaign-cap-row"><span class="campaign-cap-key">adcp.idempotency.supported</span><span class="mono">' + escapeHtml(String(idem.supported ?? false)) + '</span></div>' +
        '<div class="campaign-cap-row"><span class="campaign-cap-key">adcp.idempotency.replay_ttl_seconds</span><span class="mono">' + escapeHtml(String(idem.replay_ttl_seconds ?? "—")) + '</span></div>' +
        '<div class="campaign-cap-row"><span class="campaign-cap-key">latency_ms</span><span class="mono">' + d.latency_ms + '</span></div>' +
      '</div>';
    body.innerHTML =
      summary +
      '<details style="margin-top:8px"><summary class="orch-small" style="cursor:pointer">raw capabilities JSON</summary><pre class="wf-json mono" style="max-height:240px;overflow:auto">' + escapeHtml(JSON.stringify(caps, null, 2).slice(0, 4000)) + '</pre></details>';
  } catch (e) {
    var b = document.getElementById("campaign-cap-modal-body");
    if (b) b.innerHTML = '<span class="orch-small" style="color:var(--error)">' + escapeHtml(String((e && e.message) || e)) + '</span>';
  }
}

// Feature C: live signals on Lane 1.
async function _campaignFillLiveSignals() {
  var el = document.getElementById("campaign-live-signals-list");
  if (!el || !_campaignCurrent) return;
  try {
    var r = await fetch("/dsp/campaigns/" + encodeURIComponent(_campaignCurrent.campaign_id) + "/signals-live");
    var d = await r.json();
    var top = d.top_signals || [];
    if (top.length === 0) {
      el.innerHTML = '<span class="orch-small" style="color:var(--text-mut)">no signals returned for brief: ' + escapeHtml(d.audience_brief || "") + '</span>';
      return;
    }
    el.innerHTML =
      '<div class="campaign-live-signals-meta orch-small" style="margin-bottom:4px">brief: <code class="mono">' + escapeHtml(d.audience_brief || "") + '</code> · returned ' + top.length + ' top from ' + (d.per_agent || []).length + ' agents</div>' +
      '<div class="campaign-live-signals">' + top.map(function (s) {
        var cov = s.coverage_percentage != null ? s.coverage_percentage + "%" : "?";
        var size = s.estimated_audience_size != null ? Math.round(s.estimated_audience_size / 1000000) + "M" : "?";
        return '<div class="campaign-live-signal-chip" title="' + escapeHtml(s.signal_agent_segment_id) + ' · from ' + escapeHtml(s.source_agent_id) + '">' +
          '<span class="campaign-live-signal-name">' + escapeHtml(s.name || s.signal_agent_segment_id) + '</span>' +
          '<span class="campaign-live-signal-meta mono">cov ' + cov + ' · ~' + size + '</span>' +
          '<span class="campaign-live-signal-source orch-small mono">' + escapeHtml(s.source_agent_id) + '</span>' +
        '</div>';
      }).join("") + '</div>';
  } catch (e) {
    el.innerHTML = '<span class="orch-small" style="color:var(--error)">signals fetch failed</span>';
  }
}

// ── Lane 2: Bid stream ───────────────────────────────────────────────
async function _campaignFillStream() {
  var body = document.getElementById("campaign-stream-body");
  if (!body || !_campaignCurrent) return;
  var cov = _campaignToolCoverage("get_bid_opportunities");
  var prov = cov && cov.sup === 0
    ? _campaignProvenancePill("zero", "0/" + cov.total + " agents advertise get_bid_opportunities — primitive is unspec'd in 3.0 GA")
    : _campaignProvenancePill("mock", "synthesized locally");
  try {
    var r = await fetch("/dsp/campaigns/" + encodeURIComponent(_campaignCurrent.campaign_id) + "/bid-stream");
    var d = await r.json();
    var samples = d.samples || [];
    if (samples.length === 0) { body.innerHTML = '<span class="orch-small">no samples</span>'; return; }
    // Aggregate totals across the window
    var totalReqs = samples.reduce(function (s, x) { return s + x.bid_requests_per_sec; }, 0) * 60;
    var totalBids = samples.reduce(function (s, x) { return s + x.bids_per_sec; }, 0) * 60;
    var totalWins = samples.reduce(function (s, x) { return s + x.wins_per_sec; }, 0) * 60;
    var winRate = totalBids > 0 ? Math.round((totalWins / totalBids) * 1000) / 10 : 0;
    var bidRate = totalReqs > 0 ? Math.round((totalBids / totalReqs) * 1000) / 10 : 0;
    var avgCpm = samples.reduce(function (s, x) { return s + x.avg_winning_cpm_usd; }, 0) / samples.length;
    var p95avg = Math.round(samples.reduce(function (s, x) { return s + x.latency_p95_ms; }, 0) / samples.length);
    // Sparkline: 60 bars showing wins-per-sec over time
    var maxW = Math.max.apply(null, samples.map(function (x) { return x.wins_per_sec; })) || 1;
    var spark = samples.map(function (x) {
      var h = Math.max(1, Math.round((x.wins_per_sec / maxW) * 32));
      return '<div class="campaign-spark-bar" style="height:' + h + 'px" title="t-' + x.t_offset_sec + 's: ' + Math.round(x.wins_per_sec) + ' wins/s, CPM $' + x.avg_winning_cpm_usd + '"></div>';
    }).join("");
    body.innerHTML =
      '<div class="campaign-lane-prov">' + prov + '</div>' +
      '<div class="campaign-stream-stats">' +
        '<div class="campaign-stream-stat"><div class="campaign-stream-stat-label">bid requests</div><div class="mono">' + Math.round(totalReqs).toLocaleString() + '</div></div>' +
        '<div class="campaign-stream-stat"><div class="campaign-stream-stat-label">bids submitted</div><div class="mono">' + Math.round(totalBids).toLocaleString() + ' <span class="orch-small">(' + bidRate + '%)</span></div></div>' +
        '<div class="campaign-stream-stat"><div class="campaign-stream-stat-label">wins</div><div class="mono">' + Math.round(totalWins).toLocaleString() + ' <span class="orch-small">(' + winRate + '%)</span></div></div>' +
        '<div class="campaign-stream-stat"><div class="campaign-stream-stat-label">avg winning CPM</div><div class="mono">$' + (Math.round(avgCpm * 100) / 100) + '</div></div>' +
        '<div class="campaign-stream-stat"><div class="campaign-stream-stat-label">latency p95</div><div class="mono">' + p95avg + ' ms</div></div>' +
      '</div>' +
      '<div class="campaign-stream-spark"><div class="campaign-spark-label orch-small">wins/sec — last 60 minutes</div><div class="campaign-spark-bars">' + spark + '</div></div>';
  } catch (e) { body.innerHTML = '<span class="orch-small" style="color:var(--error)">bid-stream load failed</span>'; }
}

// ── Lane 3: Inventory match (per-SSP) + Brand safety ──────────────────
async function _campaignFillInventory() {
  var sspEl = document.getElementById("campaign-inventory-ssp");
  var safetyEl = document.getElementById("campaign-inventory-safety");
  if (!sspEl || !safetyEl || !_campaignCurrent) return;
  try {
    var [invR, safR] = await Promise.all([
      fetch("/dsp/campaigns/" + encodeURIComponent(_campaignCurrent.campaign_id) + "/inventory").then(function (r) { return r.json(); }),
      fetch("/dsp/campaigns/" + encodeURIComponent(_campaignCurrent.campaign_id) + "/brand-safety").then(function (r) { return r.json(); }),
    ]);
    // SSP table
    var ssps = invR.ssps || [];
    var rows = ssps.map(function (s) {
      var trendIcon = s.trend_24h === "up" ? "↑" : s.trend_24h === "down" ? "↓" : "→";
      var trendCls = "trend-" + s.trend_24h;
      return '<tr class="' + trendCls + '">' +
        '<td class="mono"><span class="' + trendCls + '-icon">' + trendIcon + '</span> ' + escapeHtml(s.ssp_name) + '</td>' +
        '<td class="mono">' + s.win_rate_pct + '%</td>' +
        '<td class="mono">$' + s.avg_winning_cpm_usd + '</td>' +
        '<td class="mono">' + s.audience_match_rate_pct + '%</td>' +
        '<td class="mono">' + s.bid_qps + '</td>' +
        '<td class="mono">' + s.latency_p95_ms + 'ms</td>' +
        '<td class="mono"><div class="campaign-share-bar"><div class="campaign-share-fill" style="width:' + (s.share_of_spend_pct * 2.5) + '%"></div><span class="campaign-share-num">' + s.share_of_spend_pct + '%</span></div></td>' +
      '</tr>';
    }).join("");
    var covInv = _campaignToolCoverage("get_media_buys");
    var provInv = covInv && covInv.sup > 0
      ? _campaignProvenancePill("fallback", covInv.sup + "/" + covInv.total + " agents advertise get_media_buys; SSP-level rollup is unspec'd — synthesized")
      : _campaignProvenancePill("mock", "synthesized locally");
    var provSafety = _campaignProvenancePill("mock", "no agent in directory advertises pre-bid filter — entirely synthesized");
    sspEl.innerHTML =
      '<div class="campaign-lane-prov">' + provInv + '</div>' +
      '<div class="campaign-strategy-label">Per-SSP performance · sorted by composite (win × match)</div>' +
      '<table class="campaign-ssp-table">' +
        '<thead><tr><th>SSP</th><th>win</th><th>CPM</th><th>match</th><th>QPS</th><th>p95</th><th>share</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';
    // Brand safety
    var bs = safR.brand_safety || {};
    var reasons = (bs.reasons || []).map(function (r) {
      return '<div class="campaign-safety-reason"><span>' + escapeHtml(r.reason) + '</span><span class="mono">' + r.count.toLocaleString() + ' <span class="orch-small">(' + r.pct + '%)</span></span></div>';
    }).join("");
    safetyEl.innerHTML =
      '<div class="campaign-lane-prov">' + provSafety + '</div>' +
      '<div class="campaign-strategy-label">Brand-safety pre-bid filter</div>' +
      '<div class="campaign-safety-totals">' +
        '<div class="campaign-safety-total"><div class="campaign-stream-stat-label">evaluated</div><div class="mono">' + (bs.total_impressions_evaluated || 0).toLocaleString() + '</div></div>' +
        '<div class="campaign-safety-total"><div class="campaign-stream-stat-label">blocked</div><div class="mono">' + (bs.total_blocked || 0).toLocaleString() + ' <span class="orch-small">(' + bs.block_rate_pct + '%)</span></div></div>' +
        '<div class="campaign-safety-total"><div class="campaign-stream-stat-label">avg DV/IAS</div><div class="mono">' + (bs.avg_brand_safety_score || 0) + '/100</div></div>' +
        '<div class="campaign-safety-total"><div class="campaign-stream-stat-label">avg viewable</div><div class="mono">' + Math.round((bs.avg_predicted_viewability || 0) * 100) + '%</div></div>' +
        '<div class="campaign-safety-total"><div class="campaign-stream-stat-label">filter latency</div><div class="mono">' + (bs.filter_latency_p50_ms || 0) + 'ms</div></div>' +
      '</div>' +
      '<div class="campaign-safety-reasons">' + reasons + '</div>';
    // Feature D: live products list under the SSP table.
    sspEl.insertAdjacentHTML("beforeend",
      '<div class="campaign-strategy-block" style="margin-top:10px" id="campaign-live-products-block">' +
        '<div class="campaign-strategy-label">' +
          '<span>Live targetable inventory (real get_products)</span>' +
          '<span class="campaign-provenance-pill campaign-provenance-live" style="margin-left:6px" title="real call to get_products on every capable buying agent">LIVE · get_products</span>' +
        '</div>' +
        '<div id="campaign-live-products-list"><span class="orch-small">querying buying agents…</span></div>' +
      '</div>');
    _campaignFillLiveProducts();
  } catch (e) { sspEl.innerHTML = '<span class="orch-small" style="color:var(--error)">inventory load failed</span>'; }
}

// Feature D: live get_products on Lane 3.
async function _campaignFillLiveProducts() {
  var el = document.getElementById("campaign-live-products-list");
  if (!el || !_campaignCurrent) return;
  try {
    var r = await fetch("/dsp/campaigns/" + encodeURIComponent(_campaignCurrent.campaign_id) + "/products-live");
    var d = await r.json();
    var meta =
      d.capable_agent_count + ' capable · ' +
      d.ok_count + ' returned · ' +
      d.auth_gated_count + ' auth-gated · ' +
      d.total_products + ' products';
    var top = d.top_products || [];
    if (top.length === 0) {
      el.innerHTML =
        '<div class="orch-small" style="color:var(--text-mut);margin-bottom:4px">' + escapeHtml(meta) + '</div>' +
        '<div class="campaign-live-empty">' + (d.per_agent || []).map(function (a) {
          var stateCls = a.ok ? "cov-full" : a.auth_gated ? "cov-auth" : "cov-zero";
          var stateLabel = a.ok ? "ok (0 products)" : a.auth_gated ? "auth-gated" : "error";
          return '<div class="campaign-live-agent-row ' + stateCls + '"><span class="mono">' + escapeHtml(a.agent_id) + '</span><span class="campaign-coverage-pill-frac">' + escapeHtml(stateLabel) + '</span></div>';
        }).join("") + '</div>';
      return;
    }
    el.innerHTML =
      '<div class="orch-small" style="color:var(--text-mut);margin-bottom:4px">' + escapeHtml(meta) + '</div>' +
      top.map(function (p) {
        return '<div class="campaign-live-product-row">' +
          '<span class="mono">' + escapeHtml(p.product_id) + '</span>' +
          '<span class="pill pill-muted mono" style="font-size:9px">' + escapeHtml(p.source_agent_id) + '</span>' +
          (p.cpm_floor != null ? '<span class="orch-small mono">CPM floor $' + p.cpm_floor + '</span>' : '') +
          (p.name ? '<span class="campaign-live-product-name">' + escapeHtml(p.name) + '</span>' : '') +
        '</div>';
      }).join("");
  } catch (e) {
    el.innerHTML = '<span class="orch-small" style="color:var(--error)">products fetch failed</span>';
  }
}

// ── Lane 4: Delivery + pacing ────────────────────────────────────────
async function _campaignFillDelivery() {
  var body = document.getElementById("campaign-delivery-body");
  if (!body || !_campaignCurrent) return;
  // Pacing has TWO live primitives: get_pacing_status (unspec) and
  // get_media_buy_delivery (lifecycle, broadly supported). The mock
  // is the strategy-side; the delivery-side is replaced with LIVE
  // when the user clicks "Load LIVE delivery" on a real campaign.
  var covPacing = _campaignToolCoverage("get_pacing_status");
  var covDelivery = _campaignToolCoverage("get_media_buy_delivery");
  var prov;
  if (covPacing && covPacing.sup === 0 && covDelivery && covDelivery.sup > 0) {
    prov = _campaignProvenancePill("fallback", "0/" + covPacing.total + " agents advertise get_pacing_status (unspec'd); " + covDelivery.sup + "/" + covDelivery.total + " advertise get_media_buy_delivery — load a real campaign for live data");
  } else {
    prov = _campaignProvenancePill("mock", "synthesized locally");
  }
  try {
    var r = await fetch("/dsp/campaigns/" + encodeURIComponent(_campaignCurrent.campaign_id) + "/pacing");
    var d = await r.json();
    var p = d.pacing;
    var spent = p.spent_to_date_usd;
    var total = p.budget_total_usd;
    var pctSpent = total > 0 ? Math.round((spent / total) * 100) : 0;
    var healthCls = "campaign-pacing-" + p.pacing_health;
    var healthLabel = p.pacing_health === "on_track" ? "ON TRACK" : p.pacing_health === "over" ? "OVER" : "UNDER";
    var maxDayspend = Math.max.apply(null, (p.per_day || []).map(function (x) { return x.spend_usd; })) || 1;
    var bars = (p.per_day || []).map(function (pt) {
      var h = Math.max(2, Math.round((pt.spend_usd / maxDayspend) * 60));
      var varCls = Math.abs(pt.variance_pct) < 5 ? "var-on" : pt.variance_pct > 0 ? "var-over" : "var-under";
      return '<div class="campaign-pacing-bar ' + varCls + '" title="day ' + pt.day + ': $' + pt.spend_usd + ' (var ' + pt.variance_pct + '%)"><div class="campaign-pacing-bar-fill" style="height:' + h + 'px"></div></div>';
    }).join("");
    body.innerHTML =
      '<div class="campaign-lane-prov">' + prov + '</div>' +
      '<div class="campaign-pacing-banner ' + healthCls + '">' +
        '<span class="campaign-pacing-banner-label">' + healthLabel + '</span>' +
        '<span class="campaign-pacing-banner-meta orch-small">variance ' + (p.pacing_variance_pct > 0 ? "+" : "") + p.pacing_variance_pct + '% vs target</span>' +
      '</div>' +
      '<div class="campaign-pacing-stats">' +
        '<div class="campaign-stream-stat"><div class="campaign-stream-stat-label">spent / total</div><div class="mono">$' + spent.toLocaleString() + ' / $' + total.toLocaleString() + '</div></div>' +
        '<div class="campaign-stream-stat"><div class="campaign-stream-stat-label">remaining</div><div class="mono">$' + p.remaining_usd.toLocaleString() + '</div></div>' +
        '<div class="campaign-stream-stat"><div class="campaign-stream-stat-label">days elapsed</div><div class="mono">' + p.days_elapsed + ' / ' + p.days_total + '</div></div>' +
        '<div class="campaign-stream-stat"><div class="campaign-stream-stat-label">total impressions</div><div class="mono">' + (p.total_impressions || 0).toLocaleString() + '</div></div>' +
      '</div>' +
      '<div class="campaign-pacing-progress">' +
        '<div class="campaign-pacing-progress-bar"><div class="campaign-pacing-progress-fill" style="width:' + pctSpent + '%"></div></div>' +
        '<span class="campaign-pacing-progress-label orch-small mono">' + pctSpent + '% of budget</span>' +
      '</div>' +
      '<div class="campaign-strategy-label">Daily spend (variance vs target)</div>' +
      '<div class="campaign-pacing-bars">' + bars + '</div>';
  } catch (e) { body.innerHTML = '<span class="orch-small" style="color:var(--error)">pacing load failed</span>'; }
}

// ── Lane 5: Attribution + optimization signals ───────────────────────
async function _campaignFillAttribution() {
  var body = document.getElementById("campaign-attribution-body");
  if (!body || !_campaignCurrent) return;
  var cov = _campaignToolCoverage("optimize_strategy");
  var prov = cov && cov.sup === 0
    ? _campaignProvenancePill("zero", "0/" + cov.total + " agents advertise optimize_strategy — primitive is unspec'd in 3.0 GA")
    : _campaignProvenancePill("mock", "synthesized locally");
  try {
    var r = await fetch("/dsp/campaigns/" + encodeURIComponent(_campaignCurrent.campaign_id) + "/attribution");
    var d = await r.json();
    var a = d.attribution;
    var statusCls = "kpi-status-" + a.kpi_status;
    var prefix = (_campaignCurrent.kpi === "CPM" || _campaignCurrent.kpi === "CPA") ? "$" : "";
    var suffix = _campaignCurrent.kpi === "ROAS" ? "x" : _campaignCurrent.kpi === "BRAND_LIFT" ? "%" : "";
    var statusLabel = a.kpi_status === "above" ? "ABOVE TARGET" : a.kpi_status === "below" ? "BELOW TARGET" : "ON TARGET";
    var signals = a.optimization_signals.map(function (s) {
      var kindCls = "campaign-opt-" + s.kind;
      return '<div class="campaign-opt-signal ' + kindCls + '">' +
        '<div class="campaign-opt-signal-head">' +
          '<span class="campaign-opt-signal-kind">' + escapeHtml(s.kind.toUpperCase()) + '</span>' +
          '<span class="mono">' + escapeHtml(s.target) + '</span>' +
          '<span class="campaign-opt-signal-metric mono">' + escapeHtml(s.metric) + '</span>' +
          '<span class="campaign-opt-signal-conf orch-small mono">conf ' + Math.round(s.confidence * 100) + '%</span>' +
        '</div>' +
        '<div class="campaign-opt-signal-rec">' + escapeHtml(s.recommendation) + '</div>' +
      '</div>';
    }).join("");
    var feedback = (a.feedback_into_strategy || []).map(function (f) {
      return '<div class="campaign-feedback-item mono">' + escapeHtml(f) + '</div>';
    }).join("");
    body.innerHTML =
      '<div class="campaign-lane-prov">' + prov + '</div>' +
      '<div class="campaign-attr-row">' +
        '<div class="campaign-stream-stat"><div class="campaign-stream-stat-label">conversions</div><div class="mono">' + a.conversions.toLocaleString() + '</div></div>' +
        '<div class="campaign-stream-stat"><div class="campaign-stream-stat-label">conversion value</div><div class="mono">$' + a.conversion_value_usd.toLocaleString() + '</div></div>' +
        '<div class="campaign-stream-stat campaign-kpi-realized"><div class="campaign-stream-stat-label">realized ' + escapeHtml(_campaignCurrent.kpi) + '</div><div class="mono">' + prefix + a.realized_kpi + suffix + ' <span class="' + statusCls + '">' + statusLabel + '</span></div></div>' +
        '<div class="campaign-stream-stat"><div class="campaign-stream-stat-label">target</div><div class="mono">' + prefix + a.kpi_target + suffix + '</div></div>' +
      '</div>' +
      '<div class="campaign-strategy-label">Optimization signals · feedback into bid strategy</div>' +
      '<div class="campaign-opt-signals">' + signals + '</div>' +
      '<div class="campaign-strategy-label" style="margin-top:8px">Strategy diff (next cycle)</div>' +
      '<div class="campaign-feedback-list">' + feedback + '</div>' +
      // Feature A: apply diff via update_media_buy on a real media-buy.
      // Picks the first live media-buy from the live panel; if none yet,
      // shows hint about firing first.
      '<div class="campaign-apply-diff-row">' +
        '<button class="campaign-apply-diff-btn" id="campaign-apply-diff-btn">' +
          '<span>Apply diff via update_media_buy</span>' +
        '</button>' +
        '<span class="orch-small" style="color:var(--text-mut)">→ calls update_media_buy on the first live media-buy from the live panel; tries each agent that fired one</span>' +
        '<div class="campaign-apply-diff-result" id="campaign-apply-diff-result"></div>' +
      '</div>';
    var diffBtn = document.getElementById("campaign-apply-diff-btn");
    if (diffBtn) diffBtn.addEventListener("click", _campaignApplyDiffLive);
  } catch (e) { body.innerHTML = '<span class="orch-small" style="color:var(--error)">attribution load failed</span>'; }
}

// Feature A: apply strategy diff via update_media_buy on a real buy.
async function _campaignApplyDiffLive() {
  var btn = document.getElementById("campaign-apply-diff-btn");
  var out = document.getElementById("campaign-apply-diff-result");
  if (!btn || !out) return;
  btn.disabled = true; btn.textContent = "querying live media-buys…";
  try {
    var listResp = await fetch("/dsp/media-buys/live");
    var listData = await listResp.json();
    var buy = (listData.media_buys || [])[0];
    if (!buy) {
      out.innerHTML = '<span class="orch-small" style="color:var(--text-mut)">no live media-buys exist yet — fire one from the campaign card first.</span>';
      btn.textContent = "Apply diff via update_media_buy"; btn.disabled = false;
      return;
    }
    btn.textContent = "calling update_media_buy…";
    var r = await fetch("/dsp/media-buys/" + encodeURIComponent(buy.media_buy_id || buy.buyer_ref) + "/update-live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: buy.source_agent_id }),
    });
    var d = await r.json();
    var statusCls = d.ok ? "campaign-fire-ok" : (d.auth_gated ? "campaign-fire-auth" : "campaign-fire-err");
    var label = d.ok ? "OK" : (d.auth_gated ? "AUTH-GATED" : "ERROR");
    out.innerHTML =
      '<div class="campaign-fire-row ' + statusCls + '">' +
        '<span class="campaign-fire-label">' + label + '</span>' +
        '<span class="mono">' + escapeHtml(d.agent_id) + '</span>' +
        '<span>update_media_buy → ' + d.latency_ms + 'ms</span>' +
        (d.error ? '<span class="orch-small">' + escapeHtml(String(d.error).slice(0, 200)) + '</span>' : '') +
      '</div>';
    btn.textContent = "Re-apply"; btn.disabled = false;
  } catch (e) {
    out.innerHTML = '<span class="orch-small" style="color:var(--error)">' + escapeHtml(String((e && e.message) || e)) + '</span>';
    btn.textContent = "Retry"; btn.disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────────
// Agentic helper: "Explain this decision" reusable button + modal.
// Clickable "?" badge on any surface. POSTs to /agentic/explain.
// ─────────────────────────────────────────────────────────────────

`;
