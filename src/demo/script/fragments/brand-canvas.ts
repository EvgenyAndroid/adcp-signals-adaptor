// src/demo/script/fragments/brand-canvas.ts
//
// Brand Canvas: brand card, measurement lane, brief derivation, lane reset/event/compare, lane render.
//
// Source range (in pre-refactor src/demo/script.ts): lines 8509..9948 (1440 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const brandCanvasJs = `function _canvasRenderBrandCard(data) {
  var card = document.getElementById("canvas-brand-card");
  if (!card) return;
  var bm = data.brand_manifest || {};
  var company = bm.company || {};
  var classification = bm.classification || {};
  // Logos: pick a light-bg variant first, fall back to first.
  var logos = Array.isArray(bm.logos) ? bm.logos : [];
  var lightLogo = logos.find(function (l) { return (l.tags || []).indexOf("light") >= 0 && (l.tags || []).indexOf("symbol") < 0; });
  var anyLogo = lightLogo || logos[0];
  // Resolve relative URLs to the registry origin.
  // Phase 3: route through /brands/logo proxy. Uniform render path,
  // bypasses third-party CDN hotlink-detect (e.g. brandfetch.io
  // silently failing IMG fetches in our origin context).
  var rawLogoUrl = anyLogo && anyLogo.url
    ? (anyLogo.url.indexOf("http") === 0 ? anyLogo.url : "https://agenticadvertising.org" + anyLogo.url)
    : null;
  var logoUrl = rawLogoUrl ? ("/brands/logo?u=" + encodeURIComponent(rawLogoUrl)) : null;

  var colors = bm.colors || {};
  var palette = ["primary", "accent", "secondary"]
    .filter(function (k) { return colors[k]; })
    .map(function (k) {
      return '<div class="canvas-color-swatch" style="background:' + escapeHtml(colors[k]) + '" title="' + k + ': ' + escapeHtml(colors[k]) + '"></div>';
    }).join("");

  var fonts = Array.isArray(bm.fonts) ? bm.fonts : [];
  var fontList = fonts.slice(0, 3).map(function (f) {
    var role = f.role ? '<span class="orch-small mono" style="color:var(--text-mut)">' + escapeHtml(f.role) + '</span>' : '';
    return '<span class="canvas-font-chip mono">' + escapeHtml(f.name || "?") + ' ' + role + '</span>';
  }).join(" ");

  var industries = Array.isArray(company.industries) ? company.industries : [];
  // Dedupe (the data sometimes repeats)
  var uniqInd = [];
  industries.forEach(function (i) { if (uniqInd.indexOf(i) < 0) uniqInd.push(i); });
  // Brand industry enrichment provenance: mark override-added chips
  // visually so the demo stays honest about what came from registry vs
  // what we derived from brand-name patterns.
  var indMeta = bm.industries_meta || {};
  var addedSet = {};
  (indMeta.added_by_override || []).forEach(function (s) { addedSet[String(s).toLowerCase()] = true; });
  var industryChips = uniqInd.map(function (i) {
    var isAdded = addedSet[String(i).toLowerCase()] === true;
    var cls = "pill mono " + (isAdded ? "canvas-industry-augmented" : "pill-muted");
    var title = isAdded
      ? "added by client-side enrichment (registry industry taxonomy is coarse) — pattern: " + escapeHtml(indMeta.matched_pattern_id || "?")
      : "from registry";
    return '<span class="' + cls + '" style="font-size:10.5px" title="' + title + '">' +
      (isAdded ? '<span class="canvas-industry-augmented-mark">+</span> ' : '') +
      escapeHtml(i) +
    '</span>';
  }).join(" ");

  var qualityScore = typeof bm.quality_score === "number"
    ? '<span class="canvas-quality" title="registry quality score">q ' + (bm.quality_score * 100).toFixed(0) + '%</span>'
    : '';

  var classNote = classification.reasoning
    ? '<div class="canvas-classification">' +
        '<span class="orch-small" style="color:var(--text-mut)">classification:</span> ' +
        escapeHtml(classification.reasoning) +
        (classification.confidence ? ' <span class="pill pill-muted mono" style="font-size:9.5px">' + escapeHtml(classification.confidence) + '</span>' : '') +
      '</div>'
    : '';

  card.innerHTML =
    '<div class="canvas-brand-card">' +
      '<div class="canvas-brand-head">' +
        // Always emit BOTH — placeholder mounted under the IMG, hidden.
        // JS attaches an error handler post-render that hides the broken
        // IMG and reveals the placeholder. Avoids inline onerror (which
        // hits the SCRIPT_TAG escape trap on the apostrophes).
        (logoUrl
          ? '<img class="canvas-brand-logo" id="canvas-brand-logo-img" src="' + escapeHtml(logoUrl) + '" alt="' + escapeHtml(data.brand_name) + '"/>' +
            '<div class="canvas-brand-logo canvas-brand-logo-placeholder" id="canvas-brand-logo-fallback" style="display:none">' + escapeHtml((data.brand_name || "?").slice(0, 1)) + '</div>'
          : '<div class="canvas-brand-logo canvas-brand-logo-placeholder">' + escapeHtml((data.brand_name || "?").slice(0, 1)) + '</div>') +
        '<div class="canvas-brand-head-text">' +
          '<div class="canvas-brand-name">' + escapeHtml(data.brand_name || "(no name)") + '</div>' +
          '<div class="canvas-brand-domain mono">' + escapeHtml(data.canonical_domain || "") + '</div>' +
          '<div class="canvas-brand-desc">' + escapeHtml(bm.description || "") + '</div>' +
        '</div>' +
        qualityScore +
      '</div>' +
      '<div class="canvas-brand-grid">' +
        '<div class="canvas-brand-col">' +
          '<div class="canvas-brand-label">Palette</div>' +
          '<div class="canvas-palette">' + (palette || '<span class="orch-small">no colors</span>') + '</div>' +
        '</div>' +
        '<div class="canvas-brand-col">' +
          '<div class="canvas-brand-label">Typography</div>' +
          '<div>' + (fontList || '<span class="orch-small">no fonts</span>') + '</div>' +
        '</div>' +
        '<div class="canvas-brand-col canvas-brand-col-wide">' +
          '<div class="canvas-brand-label">Industries</div>' +
          '<div class="canvas-industries">' + (industryChips || '<span class="orch-small">unclassified</span>') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="canvas-brand-grid">' +
        '<div class="canvas-brand-col">' +
          '<div class="canvas-brand-label">Founded</div>' +
          '<div class="canvas-brand-fact mono">' + escapeHtml(String(company.founded || "—")) + '</div>' +
        '</div>' +
        '<div class="canvas-brand-col">' +
          '<div class="canvas-brand-label">Location</div>' +
          '<div class="canvas-brand-fact">' + escapeHtml(company.location || "—") + '</div>' +
        '</div>' +
        '<div class="canvas-brand-col">' +
          '<div class="canvas-brand-label">Employees</div>' +
          '<div class="canvas-brand-fact mono">' + escapeHtml(String(company.employees || "—")) + '</div>' +
        '</div>' +
        '<div class="canvas-brand-col">' +
          '<div class="canvas-brand-label">Source</div>' +
          '<div class="canvas-brand-fact mono">' + escapeHtml(data.source || "—") + '</div>' +
        '</div>' +
      '</div>' +
      classNote +
      // Phase C: applicable policies, matched on brand industries.
      // Slot is filled async after /registry/policies resolves —
      // until then it shows a "loading" placeholder.
      '<div class="canvas-policy-row" id="canvas-policy-row" data-industries="' +
        escapeHtml(uniqInd.join(",")) +
      '">' +
        '<div class="canvas-brand-label">Policy hits</div>' +
        '<div class="canvas-policy-chips" id="canvas-policy-chips">' +
          '<span class="orch-small">checking applicable policies…</span>' +
        '</div>' +
      '</div>' +
      // MVP #2: predictive check_governance overlay. Filled async by
      // /registry/governance-preview. Shows "would allow / warn / block"
      // with per-policy reasoning on hover. Trust-loop made visible.
      '<div class="canvas-governance-row" id="canvas-governance-row">' +
        '<div class="canvas-brand-label">Governance preview ' +
          '<span class="pill pill-muted mono" style="font-size:9px;margin-left:6px">predictive · check_governance mock</span>' +
        '</div>' +
        '<div class="canvas-governance-body" id="canvas-governance-body">' +
          '<span class="orch-small">computing predictive advisory…</span>' +
        '</div>' +
      '</div>' +
      // Refinement C: predictive brand-rights overlay. Filled async after
      // creative-stage chosen formats land — populates from brand.classification
      // × chosen_formats. Closes the AdCP 3.0.1 governance + brand-rights
      // domain pair on Canvas.
      '<div class="canvas-rights-row" id="canvas-rights-row">' +
        '<div class="canvas-brand-label">Brand-rights preview ' +
          '<span class="pill pill-muted mono" style="font-size:9px;margin-left:6px">predictive · get_rights mock</span>' +
        '</div>' +
        '<div class="canvas-rights-body" id="canvas-rights-body">' +
          '<span class="orch-small">awaiting creative-stage formats…</span>' +
        '</div>' +
      '</div>' +
      // Wave 1: predictive Sponsored-Intelligence overlay. Closes the
      // 4th of 6 AdCP protocol domains on Canvas. Populates from
      // brand industries; no live vendor in the directory advertises
      // any SI primitive yet.
      '<div class="canvas-si-row" id="canvas-si-row">' +
        '<div class="canvas-brand-label">Sponsored Intelligence ' +
          '<span class="pill pill-muted mono" style="font-size:9px;margin-left:6px">predictive · si_session mock · 0 live agents</span>' +
        '</div>' +
        '<div class="canvas-si-body" id="canvas-si-body">' +
          '<span class="orch-small">computing competitive overlap…</span>' +
        '</div>' +
      '</div>' +
      // Phase 2 + Multi-brand A/B: Run workflow + Compare buttons.
      '<div class="canvas-brand-actions">' +
        '<button class="btn-primary canvas-run-btn" id="canvas-run-btn">' +
          '<svg class="ico"><use href="#icon-bolt"/></svg>' +
          '<span>Run workflow with this brand</span>' +
        '</button>' +
        '<button class="canvas-compare-btn" id="canvas-compare-btn" title="A/B with another brand — side-by-side industries + policy hits + governance preview">' +
          '<span>vs another brand</span>' +
        '</button>' +
        '<div class="canvas-derived-brief orch-small">' +
          '<span style="color:var(--text-mut)">derived brief:</span> ' +
          '<code class="mono">' + escapeHtml(_canvasDeriveBrief(data)) + '</code>' +
        '</div>' +
      '</div>' +
      // Multi-brand A/B (light): comparison panel slot, hidden until invoked.
      '<div class="canvas-compare-panel" id="canvas-compare-panel" style="display:none"></div>' +
      '<div class="canvas-brand-rawdrop">' +
        '<details><summary class="orch-small">raw brand.json</summary>' +
          '<pre class="wf-json mono">' + escapeHtml(JSON.stringify(bm, null, 2)) + '</pre>' +
        '</details>' +
      '</div>' +
    '</div>';
  // Wire the run button after innerHTML is set.
  var runBtn = document.getElementById("canvas-run-btn");
  if (runBtn) runBtn.addEventListener("click", _canvasRunWorkflow);
  var compareBtn = document.getElementById("canvas-compare-btn");
  if (compareBtn) compareBtn.addEventListener("click", _canvasOpenCompare);

  // Attach JS-side error handler for the brand logo. If the proxy returns
  // non-image (e.g. brandfetch CF-1010 banned), swap to the placeholder
  // initial. Done in JS to dodge the SCRIPT_TAG inline-onerror trap.
  var logoImg = document.getElementById("canvas-brand-logo-img");
  var logoFallback = document.getElementById("canvas-brand-logo-fallback");
  if (logoImg && logoFallback) {
    logoImg.addEventListener("error", function () {
      logoImg.style.display = "none";
      logoFallback.style.display = "";
    });
  }

  // Phase C: hydrate the policy-hits row. Fetch /registry/policies once
  // (snapshot is small, ~14 entries) and match on brand industries.
  _canvasFillPolicyHits(uniqInd);
  // MVP #2: hydrate the governance-preview row. Calls
  // /registry/governance-preview with the same industries; renders
  // the worst-outcome banner + per-policy chips with hover reasoning.
  _canvasFillGovernancePreview(uniqInd);
  // Refinement C: hydrate brand-rights row. Pre-creative-stage it
  // shows "awaiting creative-stage formats"; the creative-stage
  // event handler calls it again with real format ids.
  _canvasFillBrandRights();
  // Wave 1: hydrate Sponsored-Intelligence row.
  _canvasFillSi(data, uniqInd);
}

// Wave 1: SI hydrator. Calls /registry/si-preview with the brand's
// name + industries + (optional) budget; renders competitor table +
// tier-grouped insights.
async function _canvasFillSi(brand, industries) {
  var body = document.getElementById("canvas-si-body");
  if (!body) return;
  try {
    var qs = new URLSearchParams({
      brand_name: brand.brand_name || "",
      brand_domain: brand.canonical_domain || "",
      industries: (industries || []).join(","),
    });
    var r = await fetch("/registry/si-preview?" + qs.toString());
    var d = await r.json();
    var adv = d.advisory;
    if (!adv) {
      body.innerHTML = '<span class="orch-small" style="color:var(--text-mut)">SI advisory unavailable</span>';
      return;
    }
    if (adv.state === "rate_limited") {
      body.innerHTML =
        '<div class="canvas-si-banner canvas-si-rate-limited">' +
          '<span class="canvas-si-icon">⏱</span>' +
          '<span><strong>SI session rate-limited.</strong> Retry in ' + (adv.refresh_window_sec || 60) + 's. (Demo: ~5% of brands hit this on probe.)</span>' +
        '</div>' +
        '<div class="orch-small" style="color:var(--text-mut);margin-top:4px">' + escapeHtml(adv.summary || "") + '</div>';
      return;
    }
    var compTbl = (adv.competitors || []).length === 0
      ? '<div class="orch-small" style="color:var(--text-mut)">no overlapping competitors found for these industries</div>'
      : '<table class="canvas-si-comps">' +
          '<thead><tr><th>brand</th><th>SOV</th><th>overlap</th><th>30d</th></tr></thead>' +
          '<tbody>' +
            adv.competitors.map(function (c) {
              var trendIcon = c.trend_30d === "up" ? "↑" : c.trend_30d === "down" ? "↓" : "→";
              var trendCls = "canvas-si-trend-" + c.trend_30d;
              return '<tr class="' + trendCls + '">' +
                '<td><span class="mono">' + escapeHtml(c.brand_name) + '</span> ' + (c.brand_domain ? '<span class="orch-small mono" style="color:var(--text-mut)">' + escapeHtml(c.brand_domain) + '</span>' : '') + '</td>' +
                '<td class="mono">' + Math.round((c.share_of_voice || 0) * 100) + '%</td>' +
                '<td class="mono">' + Math.round((c.campaign_overlap_pct || 0) * 100) + '%</td>' +
                '<td class="mono"><span class="canvas-si-trend-icon">' + trendIcon + '</span> ' + escapeHtml(c.trend_30d) + '</td>' +
              '</tr>';
            }).join("") +
          '</tbody>' +
        '</table>';
    var insights = (adv.insights || []).map(function (i) {
      var tierCls = "canvas-si-insight-" + i.tier;
      return '<div class="canvas-si-insight ' + tierCls + '">' +
        '<div class="canvas-si-insight-head">' +
          '<span class="canvas-si-tier mono">' + escapeHtml(i.tier.replace(/_/g, " ").toUpperCase()) + '</span>' +
          '<span class="canvas-si-headline">' + escapeHtml(i.headline) + '</span>' +
          '<span class="canvas-si-conf orch-small mono">conf ' + Math.round((i.confidence || 0) * 100) + '%</span>' +
        '</div>' +
        '<div class="canvas-si-detail">' + escapeHtml(i.detail) + '</div>' +
        (i.action ? '<div class="canvas-si-action mono">→ ' + escapeHtml(i.action) + '</div>' : '') +
      '</div>';
    }).join("");
    body.innerHTML =
      '<div class="canvas-si-summary orch-small">' + escapeHtml(adv.summary) + '</div>' +
      '<div class="canvas-si-section-label">Top overlapping competitors</div>' +
      compTbl +
      '<div class="canvas-si-section-label" style="margin-top:8px">Insights</div>' +
      insights;
  } catch (e) {
    body.innerHTML = '<span class="orch-small" style="color:var(--error)">SI preview failed</span>';
  }
}

// Phase C: in-page policy cache + hits resolver.
var _canvasPoliciesCache = null;

async function _canvasFillPolicyHits(industries) {
  var chips = document.getElementById("canvas-policy-chips");
  if (!chips) return;
  try {
    if (!_canvasPoliciesCache) {
      var r = await fetch("/registry/policies");
      var data = await r.json();
      _canvasPoliciesCache = Array.isArray(data.policies) ? data.policies : [];
    }
  } catch (e) {
    chips.innerHTML = '<span class="orch-small" style="color:var(--text-mut)">policy registry unreachable</span>';
    return;
  }
  // Match: brand industry overlaps policy.industries_inferred,
  // OR policy is industries_inferred=["all"] (catch-alls like GDPR, CSBS).
  var indNorm = (industries || []).map(function (i) { return String(i || "").toLowerCase(); });
  var hits = _canvasPoliciesCache.filter(function (p) {
    var inf = (p.industries_inferred || []).map(function (s) { return String(s).toLowerCase(); });
    if (inf.indexOf("all") >= 0) return true;
    return inf.some(function (i) { return indNorm.indexOf(i) >= 0; });
  });
  if (hits.length === 0) {
    chips.innerHTML = '<span class="orch-small" style="color:var(--text-mut)">no specific industry policies; CSBS + GDPR baseline still applies</span>';
    return;
  }
  // Sort: must regulations > must standards > should
  hits.sort(function (a, b) {
    var sa = (a.enforcement === "must" ? 0 : a.enforcement === "should" ? 1 : 2)
           + (a.category === "regulation" ? 0 : 0.5);
    var sb = (b.enforcement === "must" ? 0 : b.enforcement === "should" ? 1 : 2)
           + (b.category === "regulation" ? 0 : 0.5);
    return sa - sb;
  });
  chips.innerHTML = hits.map(function (p) {
    var enfClass = "canvas-policy-" + p.enforcement;
    var catBadge = p.category === "regulation"
      ? '<span class="canvas-policy-cat canvas-policy-reg mono">REG</span>'
      : '<span class="canvas-policy-cat canvas-policy-std mono">STD</span>';
    return '<span class="canvas-policy-chip ' + enfClass + '" title="' + escapeHtml(p.description) + ' (' + escapeHtml(p.region) + ')">' +
      catBadge +
      '<span class="canvas-policy-name">' + escapeHtml(p.name) + '</span>' +
      '<span class="canvas-policy-enf mono">' + escapeHtml(p.enforcement) + '</span>' +
    '</span>';
  }).join("");
}

// Workshop refinement C: brand-rights hydrator. Reads brand classification
// + chosen creative formats from _canvasState; renders an outcome banner
// + per-format chips. Symmetric layout with the governance preview.
async function _canvasFillBrandRights() {
  var body = document.getElementById("canvas-rights-body");
  if (!body || !_canvasState || !_canvasState.brand) return;
  var bm = _canvasState.brand.brand_manifest || {};
  var classification = bm.classification || {};
  // Format ids: prefer the chosen-creative set; otherwise pull a sample
  // from the union of available formats so the row isn't empty pre-stage-2.
  var chosen = (_canvasState.results && _canvasState.results.creative && _canvasState.results.creative.chosen) || [];
  var samplePool = chosen;
  if (samplePool.length === 0 && _canvasState.results && _canvasState.results.creative) {
    var byAgent = _canvasState.results.creative.agents || {};
    Object.keys(byAgent).forEach(function (aid) {
      var sm = byAgent[aid].summary || {};
      var formats = sm.formats || [];
      formats.slice(0, 2).forEach(function (f) {
        if (samplePool.indexOf(f.format_id || f.id) < 0) samplePool.push(f.format_id || f.id);
      });
    });
    samplePool = samplePool.slice(0, 5);
  }
  if (samplePool.length === 0) {
    body.innerHTML = '<span class="orch-small" style="color:var(--text-mut)">awaiting creative-stage formats…</span>';
    return;
  }
  try {
    var payload = {
      brand_classification: {
        kind: classification.kind || classification.classification || "",
        house_domain: bm.house_domain || classification.house_domain || null,
      },
      chosen_formats: samplePool.map(function (id) {
        return { format_id: String(id), subtype: String(id).toLowerCase() };
      }),
    };
    var r = await fetch("/registry/brand-rights-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    var d = await r.json();
    var adv = d.advisory;
    if (!adv || !adv.rights || adv.rights.length === 0) {
      body.innerHTML = '<span class="orch-small">no rights to evaluate</span>';
      return;
    }
    var outcomeClass = "canvas-rights-" + (adv.outcome === "needs_clearance" ? "warn" : adv.outcome === "unknown" ? "warn" : "ok");
    var iconChar = adv.outcome === "needs_clearance" ? "⚠" : adv.outcome === "unknown" ? "?" : "✓";
    var banner = '<div class="canvas-rights-banner ' + outcomeClass + '">' +
      '<span class="canvas-rights-icon">' + iconChar + '</span>' +
      '<span class="canvas-rights-banner-text">overall <strong>' + escapeHtml(String(adv.outcome).toUpperCase().replace(/_/g, " ")) + '</strong></span>' +
      '<span class="canvas-rights-banner-meta orch-small">' + adv.rights.length + ' formats checked</span>' +
    '</div>';
    var chips = adv.rights.map(function (r) {
      var clsR = "canvas-rights-chip-" + r.rights;
      var flags = '';
      if (r.needs_physical_clearance) flags += '<span class="canvas-rights-flag" title="DOOH placement">DOOH</span>';
      if (r.needs_disclosure) flags += '<span class="canvas-rights-flag" title="Native/sponsored">DISC</span>';
      return '<span class="canvas-rights-chip ' + clsR + '" title="' + escapeHtml(r.reason) + '">' +
        '<span class="canvas-rights-chip-id mono">' + escapeHtml(r.format_id) + '</span>' +
        '<span class="canvas-rights-chip-out mono">' + escapeHtml(String(r.rights).replace(/_/g, " ")) + '</span>' +
        flags +
      '</span>';
    }).join("");
    var advisoryRows = (adv.advisories || []).slice(0, 3).map(function (s) {
      return '<li>' + escapeHtml(s) + '</li>';
    }).join("");
    body.innerHTML = banner +
      '<div class="canvas-rights-chips">' + chips + '</div>' +
      (advisoryRows ? '<ul class="canvas-rights-advisories">' + advisoryRows + '</ul>' : '');
  } catch (e) {
    body.innerHTML = '<span class="orch-small" style="color:var(--text-mut)">brand-rights preview failed</span>';
  }
}

// MVP #7: measurement lane renderer. Shows one "Sample delivery" button
// per agent that fired (success or fail). Click → /agents/workflow/measurement-stub
// → render pacing data inline. Closes the AdCP 4-stage loop visually.
function _canvasShowMeasurementLane(ids, agents) {
  var row = document.getElementById("canvas-lane-measurement-row");
  var body = document.getElementById("canvas-row-measurement-body");
  if (!row || !body) return;
  row.style.display = "";
  // Successful fires get the live "Sample delivery" button. Failed fires
  // (auth-gated) get a muted placeholder — measurement is moot when buy
  // didn't go through.
  var firedAgents = ids.filter(function (aid) {
    var sm = agents[aid].summary || {};
    return sm.fired;
  });
  if (firedAgents.length === 0) {
    body.innerHTML = '<span class="orch-small">awaiting media-buy fire…</span>';
    return;
  }
  var wfId = (_canvasState && _canvasState.workflow_id) || "wf_unknown";
  var html = firedAgents.map(function (aid) {
    var sm = agents[aid].summary || {};
    var ok = agents[aid].ok;
    var label = ok ? "Sample delivery" : "—";
    return '<div class="canvas-measurement-cell">' +
      '<span class="mono">' + escapeHtml(aid) + '</span>' +
      (ok
        ? '<button class="canvas-measure-btn" data-canvas-measure="' + escapeHtml(aid) + '">' + label + '</button>'
        : '<span class="orch-small" style="color:var(--text-mut)">no buy → no delivery</span>') +
      '<div class="canvas-measure-result" id="canvas-measure-result-' + escapeHtml(aid) + '"></div>' +
    '</div>';
  }).join("");
  body.innerHTML = html;
  body.querySelectorAll(".canvas-measure-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var aid = btn.getAttribute("data-canvas-measure");
      if (aid) _canvasFetchMeasurement(wfId, aid, btn);
    });
  });
}

async function _canvasFetchMeasurement(wfId, agentId, btn) {
  var resultEl = document.getElementById("canvas-measure-result-" + agentId);
  if (!resultEl) return;
  btn.disabled = true; btn.textContent = "fetching…";
  try {
    var qs = new URLSearchParams({ workflow_id: wfId, agent_id: agentId, days: "7" });
    var r = await fetch("/agents/workflow/measurement-stub?" + qs.toString());
    var d = await r.json();
    var t = d.totals || {};
    var pacing = (d.pacing || []).map(function (p) {
      var bar = Math.round((p.spend_usd / Math.max.apply(null, d.pacing.map(function (q) { return q.spend_usd; }))) * 100);
      return '<div class="canvas-measure-pacing-bar"><span class="canvas-measure-bar-fill" style="width:' + bar + '%"></span><span class="canvas-measure-bar-day mono">d' + p.day + '</span><span class="canvas-measure-bar-spend mono">$' + Math.round(p.spend_usd) + '</span></div>';
    }).join("");
    var recs = (d.next_cycle_recommendations || []).map(function (s) {
      return '<li>' + escapeHtml(s) + '</li>';
    }).join("");
    resultEl.innerHTML =
      '<div class="canvas-measure-totals">' +
        '<span class="canvas-measure-total mono">$' + (t.spend_usd || 0).toLocaleString() + ' spent</span>' +
        '<span class="canvas-measure-total mono">' + (t.impressions || 0).toLocaleString() + ' impr</span>' +
        '<span class="canvas-measure-total mono">CPM $' + (t.cpm_usd || 0) + '</span>' +
        '<span class="canvas-measure-total mono">' + (t.avg_viewable_pct || 0) + '% viewable</span>' +
      '</div>' +
      '<div class="canvas-measure-pacing">' + pacing + '</div>' +
      (recs ? '<ul class="canvas-measure-recs">' + recs + '</ul>' : '');
    btn.textContent = "refresh";
    btn.disabled = false;
  } catch (e) {
    btn.textContent = "retry";
    btn.disabled = false;
    resultEl.innerHTML = '<span class="orch-small" style="color:var(--error)">measurement fetch failed</span>';
  }
}

// MVP #2: governance-preview hydrator. Calls /registry/governance-preview
// with the brand's industries; renders an outcome banner + per-policy
// chips. Catches the trust-loop visualization in one row.
//
// Workshop refinement A: caches the advisory on _canvasState so the
// media-buy lane render can ENFORCE the prediction (block fire button
// when outcome=block, soft-warn outline when outcome=warn). Turns the
// trust loop from informational into actionable.
async function _canvasFillGovernancePreview(industries) {
  var body = document.getElementById("canvas-governance-body");
  if (!body) return;
  try {
    var qs = new URLSearchParams({ industries: (industries || []).join(",") });
    var r = await fetch("/registry/governance-preview?" + qs.toString());
    var data = await r.json();
    var adv = data.advisory;
    // Cache for media-buy lane enforcement.
    if (_canvasState) _canvasState.governance_advisory = adv || null;
    if (!adv || !adv.advisories || adv.advisories.length === 0) {
      body.innerHTML = '<span class="orch-small">no applicable policies — governance allow by default</span>';
      return;
    }
    var outcomeBanner = '<div class="canvas-gov-banner canvas-gov-' + escapeHtml(adv.outcome) + '">' +
      '<span class="canvas-gov-icon">' + (adv.outcome === "block" ? "⛔" : adv.outcome === "warn" ? "⚠" : "✓") + '</span>' +
      '<span class="canvas-gov-banner-text">would <strong>' + escapeHtml(adv.outcome.toUpperCase()) + '</strong></span>' +
      '<span class="canvas-gov-banner-meta">' +
        adv.restricted_attributes.length + ' block · ' +
        adv.advisories.filter(function (a) { return a.outcome === "warn"; }).length + ' warn · ' +
        adv.advisories.filter(function (a) { return a.outcome === "allow"; }).length + ' allow' +
      '</span>' +
      _explainBadge("governance_outcome", adv) +
    '</div>';
    var chips = adv.advisories.map(function (a) {
      var enfTag = a.enforcement === "must" ? "M" : a.enforcement === "should" ? "S" : "?";
      return '<span class="canvas-gov-chip canvas-gov-chip-' + escapeHtml(a.outcome) + '" title="' +
        escapeHtml(a.reason) + ' (signal_claim: ' + (a.signal_claim || "silent") + ')">' +
        '<span class="canvas-gov-chip-enf mono">' + enfTag + '</span>' +
        '<span class="canvas-gov-chip-id mono">' + escapeHtml(a.policy_id) + '</span>' +
        '<span class="canvas-gov-chip-out mono">' + escapeHtml(a.outcome) + '</span>' +
      '</span>';
    }).join("");
    body.innerHTML = outcomeBanner + '<div class="canvas-gov-chips">' + chips + '</div>';
  } catch (e) {
    body.innerHTML = '<span class="orch-small" style="color:var(--text-mut)">governance preview failed</span>';
  }
}

// Phase B: hydrate registry-status bar. One-shot, idempotent — silently
// no-ops if the bar element isn't on the page (Orchestrator tab, etc.).
var _canvasRegistryBarFilled = false;
async function _canvasFillRegistryBar() {
  if (_canvasRegistryBarFilled) return;
  _canvasRegistryBarFilled = true;
  var agentsEl = document.getElementById("canvas-registry-agents");
  var policiesEl = document.getElementById("canvas-registry-policies");
  if (agentsEl) {
    fetch("/registry/agents").then(function (r) { return r.json(); }).then(function (d) {
      var c = d.counts || {};
      var newCount = c.only_in_registry || 0;
      // MVP #4: append the daily-cron freshness signal when available.
      var freshness = '';
      if (d.last_cron_diff && d.last_cron_diff.ran_at) {
        var hrs = Math.round((Date.now() - Date.parse(d.last_cron_diff.ran_at)) / 36e5);
        var label = hrs < 1 ? '<1h' : hrs < 24 ? hrs + 'h' : Math.round(hrs / 24) + 'd';
        freshness = ' <span class="registry-pill" title="last daily cron diff at ' + escapeHtml(d.last_cron_diff.ran_at) + '">cron ' + label + ' ago</span>';
      }
      agentsEl.innerHTML =
        'agents: <span class="registry-pill">' + (c.registry || 0) + ' upstream</span>' +
        ' <span class="registry-pill">' + (c.local || 0) + ' local</span>' +
        (newCount > 0 ? ' <span class="registry-pill registry-pill-new">+' + newCount + ' new</span>' : '') +
        freshness;
    }).catch(function () {
      agentsEl.innerHTML = '<span class="orch-small">agents: registry unreachable</span>';
    });
  }
  if (policiesEl) {
    fetch("/registry/policies").then(function (r) { return r.json(); }).then(function (d) {
      policiesEl.innerHTML =
        'policies: <span class="registry-pill">' + (d.count || 0) + ' (local snapshot)</span>';
    }).catch(function () {
      policiesEl.innerHTML = '<span class="orch-small">policies: snapshot read failed</span>';
    });
  }
}

// Brief deriver: fold brand industries + description + name into a short
// brief string. Vendor agents accept free-text briefs; we layer brand
// context as the seed.
function _canvasDeriveBrief(brandData) {
  var bm = (brandData && brandData.brand_manifest) || {};
  var company = bm.company || {};
  var inds = Array.isArray(company.industries) ? company.industries : [];
  // Dedupe + take the first 2 industries
  var uniq = [];
  inds.forEach(function (i) { if (uniq.indexOf(i) < 0 && uniq.length < 2) uniq.push(i); });
  var indPart = uniq.length > 0 ? uniq.join(" + ").toLowerCase() : "general";
  var brand = brandData.brand_name || bm.name || brandData.canonical_domain || "the brand";
  return indPart + " buyers in " + brand + " core markets";
}

// Phase 2: stream the workflow keyed off this brand. Routes events to lanes.
var _canvasRunning = false;
async function _canvasRunWorkflow() {
  if (_canvasRunning) return;
  if (!_canvasState.brand) return;
  var brand = _canvasState.brand;
  var brief = _canvasDeriveBrief(brand);
  _canvasRunning = true;

  // Reset lanes to running state.
  _canvasResetLanes();

  // Refinement: thread the brand BrandRef through to the workflow.
  // Pulls domain + name + industries from the resolved brand_manifest;
  // the backend's vendor adapter routes between BrandRef (Claire family)
  // and brand_manifest.brand (Adzymic + Swivel) at call time.
  var bm = (brand && brand.brand_manifest) || {};
  var company = bm.company || {};
  var brandPayload = {
    domain: brand.canonical_domain || "",
    name: brand.brand_name || bm.name || "",
    description: bm.description || "",
    industries: Array.isArray(company.industries) ? company.industries : [],
  };
  try {
    var r = await fetch("/agents/workflow/run/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: brief,
        brand: brandPayload,
        timeout_ms: 25000,
      }),
    });
    if (!r.ok || !r.body) throw new Error("HTTP " + r.status);
    var reader = r.body.getReader();
    var dec = new TextDecoder();
    var buf = "";
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      var nl;
      while ((nl = buf.indexOf("\\n")) >= 0) {
        var line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          var ev = JSON.parse(line);
          _canvasApplyEvent(ev);
        } catch (e) { /* malformed frame */ }
      }
    }
  } catch (e) {
    showToast("Workflow failed: " + (e && e.message ? e.message : e), true);
  } finally {
    _canvasRunning = false;
  }
}

function _canvasResetLanes() {
  var laneIds = ["canvas-lane-audiences-body", "canvas-lane-inventory-body", "canvas-lane-creative-body", "canvas-row-mediabuy-body"];
  laneIds.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="canvas-loading orch-small"><span class="spinner"></span> waiting…</div>';
  });
  // Reset state
  _canvasState.results = {
    signals: { agents: {}, total: 0, chosen: [] },
    creative: { agents: {}, total: 0, chosen: [] },
    products: { agents: {}, total: 0, chosen: {} },
    media_buy: { agents: {} },
  };
}

function _canvasApplyEvent(ev) {
  var type = ev && ev.type;
  if (!_canvasState.results) _canvasState.results = { signals:{agents:{}}, creative:{agents:{}}, products:{agents:{}}, media_buy:{agents:{}} };
  var r = _canvasState.results;

  if (type === "stage_start") {
    // Light up the lane border.
    var stage = ev.stage;
    var laneEl = document.getElementById("canvas-lane-" + (stage === "media_buy" ? "mediabuy-row" : stage));
    if (laneEl) laneEl.classList.add("canvas-lane-active");
    return;
  }
  if (type === "agent_complete") {
    var stage = ev.stage;
    if (!r[stage]) return;
    r[stage].agents[ev.agent_id] = ev;
    _canvasRenderLane(stage);
    return;
  }
  if (type === "stage_complete") {
    var stage = ev.stage;
    var laneEl = document.getElementById("canvas-lane-" + (stage === "media_buy" ? "mediabuy-row" : stage));
    if (laneEl) {
      laneEl.classList.remove("canvas-lane-active");
      laneEl.classList.add("canvas-lane-done");
    }
    if (r[stage]) r[stage].total = (ev.summary && ev.summary.total) || 0;
    _canvasRenderLane(stage);
    return;
  }
  if (type === "targeting_chosen") {
    r.signals.chosen = ev.chosen_signal_ids || [];
    _canvasRenderLane("signals");
    return;
  }
  if (type === "formats_chosen") {
    r.creative.chosen = ev.chosen_format_ids || [];
    _canvasRenderLane("creative");
    // Refinement C: re-evaluate brand-rights with real chosen formats.
    _canvasFillBrandRights();
    return;
  }
  if (type === "products_chosen") {
    r.products.chosen = ev.chosen_product_per_agent || {};
    _canvasRenderLane("products");
    return;
  }
  if (type === "trace") {
    // Streaming trace event from /agents/workflow/run/stream. Routes
    // into the universal trace panel; trigger pulses bottom-right.
    _captureTrace(ev.trace);
    return;
  }
  if (type === "workflow_complete") {
    // MVP #1: save the run state to KV after completion. Permalink shown
    // as a small link below the run button. Stays valid for 30 days.
    _canvasSaveRun();
    return;
  }
}

// Multi-brand A/B (light): open the comparison panel with an inline
// brand search; on pick, render side-by-side industries + policy hits
// + governance outcome. Reuses /brands/search and the existing
// policy + governance endpoints — no new server work.
function _canvasOpenCompare() {
  var panel = document.getElementById("canvas-compare-panel");
  if (!panel) return;
  panel.style.display = "";
  panel.innerHTML =
    '<div class="canvas-compare-head">' +
      '<span class="canvas-brand-label">A/B comparison</span>' +
      '<span class="orch-small" style="color:var(--text-mut)">side-by-side: industries · policy hits · governance preview</span>' +
      '<button class="canvas-compare-close" id="canvas-compare-close" title="close">×</button>' +
    '</div>' +
    '<div class="canvas-compare-search">' +
      '<input type="text" class="canvas-compare-input" id="canvas-compare-input" placeholder="search a 2nd brand domain (e.g. pepsi, anheuser-busch, lego)…" autofocus />' +
      '<div class="canvas-compare-suggestions" id="canvas-compare-suggestions"></div>' +
    '</div>';
  document.getElementById("canvas-compare-close").addEventListener("click", function () {
    panel.style.display = "none";
    panel.innerHTML = "";
  });
  var input = document.getElementById("canvas-compare-input");
  var sug = document.getElementById("canvas-compare-suggestions");
  var debounceId = null;
  input.addEventListener("input", function () {
    var q = input.value.trim();
    if (debounceId) clearTimeout(debounceId);
    if (q.length < 2) { sug.innerHTML = ""; return; }
    debounceId = setTimeout(function () {
      fetch("/brands/search?q=" + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (d) {
        var results = (d.brands || []).slice(0, 6);
        if (results.length === 0) { sug.innerHTML = '<div class="orch-small" style="color:var(--text-mut)">no matches</div>'; return; }
        sug.innerHTML = results.map(function (b) {
          return '<div class="canvas-compare-suggestion mono" data-domain="' + escapeHtml(b.domain) + '">' +
            escapeHtml(b.brand_name) + ' <span style="color:var(--text-mut)">' + escapeHtml(b.domain) + '</span>' +
          '</div>';
        }).join("");
        sug.querySelectorAll(".canvas-compare-suggestion").forEach(function (el) {
          el.addEventListener("click", function () {
            var d = el.getAttribute("data-domain");
            if (d) _canvasRenderCompare(d);
          });
        });
      });
    }, 200);
  });
}

async function _canvasRenderCompare(domainB) {
  var panel = document.getElementById("canvas-compare-panel");
  if (!panel || !_canvasState || !_canvasState.brand) return;
  var brandA = _canvasState.brand;
  panel.innerHTML = '<div class="canvas-compare-head">' +
    '<span class="canvas-brand-label">A/B comparison</span>' +
    '<span class="orch-small">loading ' + escapeHtml(domainB) + '…</span>' +
    '<button class="canvas-compare-close" id="canvas-compare-close" title="close">×</button>' +
  '</div>';
  document.getElementById("canvas-compare-close").addEventListener("click", function () {
    panel.style.display = "none";
    panel.innerHTML = "";
  });
  try {
    var rB = await fetch("/brands/resolve?domain=" + encodeURIComponent(domainB));
    var brandB = await rB.json();
    if (!brandB || brandB.error) {
      panel.innerHTML = '<div class="orch-small" style="color:var(--error)">brand not found: ' + escapeHtml(domainB) + '</div>';
      return;
    }
    // Industries
    var indA = ((brandA.brand_manifest && brandA.brand_manifest.company && brandA.brand_manifest.company.industries) || []);
    var indB = ((brandB.brand_manifest && brandB.brand_manifest.company && brandB.brand_manifest.company.industries) || []);
    // Dedupe
    var uniqA = []; indA.forEach(function (i) { if (uniqA.indexOf(i) < 0) uniqA.push(i); });
    var uniqB = []; indB.forEach(function (i) { if (uniqB.indexOf(i) < 0) uniqB.push(i); });
    // Fetch governance + policies for both
    var qA = new URLSearchParams({ industries: uniqA.join(",") });
    var qB = new URLSearchParams({ industries: uniqB.join(",") });
    var [govA, govB] = await Promise.all([
      fetch("/registry/governance-preview?" + qA.toString()).then(function (r) { return r.json(); }),
      fetch("/registry/governance-preview?" + qB.toString()).then(function (r) { return r.json(); }),
    ]);
    var advA = govA.advisory || { advisories: [], outcome: "allow", restricted_attributes: [] };
    var advB = govB.advisory || { advisories: [], outcome: "allow", restricted_attributes: [] };

    function side(name, domain, industries, adv) {
      var indChips = industries.map(function (i) { return '<span class="pill pill-muted mono" style="font-size:10px">' + escapeHtml(i) + '</span>'; }).join(" ");
      var policyChips = adv.advisories.map(function (a) {
        return '<span class="canvas-gov-chip canvas-gov-chip-' + escapeHtml(a.outcome) + '" title="' + escapeHtml(a.reason) + '">' +
          '<span class="canvas-gov-chip-id mono">' + escapeHtml(a.policy_id) + '</span>' +
          '<span class="canvas-gov-chip-out mono">' + escapeHtml(a.outcome) + '</span>' +
        '</span>';
      }).join("");
      var banner = '<div class="canvas-gov-banner canvas-gov-' + escapeHtml(adv.outcome) + '" style="font-size:11px">' +
        '<span class="canvas-gov-icon">' + (adv.outcome === "block" ? "⛔" : adv.outcome === "warn" ? "⚠" : "✓") + '</span>' +
        '<strong>' + escapeHtml(adv.outcome.toUpperCase()) + '</strong>' +
        '<span class="canvas-gov-banner-meta">' +
          adv.restricted_attributes.length + ' block · ' +
          adv.advisories.filter(function (a) { return a.outcome === "warn"; }).length + ' warn' +
        '</span>' +
      '</div>';
      return '<div class="canvas-compare-side">' +
        '<div class="canvas-compare-side-head">' +
          '<span class="canvas-compare-side-name">' + escapeHtml(name) + '</span>' +
          '<span class="canvas-compare-side-domain mono">' + escapeHtml(domain) + '</span>' +
        '</div>' +
        '<div class="canvas-compare-section"><div class="orch-small" style="color:var(--text-mut)">industries</div>' + (indChips || '<span class="orch-small">unclassified</span>') + '</div>' +
        '<div class="canvas-compare-section"><div class="orch-small" style="color:var(--text-mut)">governance</div>' + banner + '</div>' +
        '<div class="canvas-compare-section"><div class="orch-small" style="color:var(--text-mut)">policy outcomes</div><div class="canvas-gov-chips">' + policyChips + '</div></div>' +
      '</div>';
    }

    // Highlight delta — policies in only one side or differing outcome.
    var deltaSet = new Map();
    advA.advisories.forEach(function (a) { deltaSet.set(a.policy_id, { a: a, b: null }); });
    advB.advisories.forEach(function (a) {
      if (deltaSet.has(a.policy_id)) deltaSet.get(a.policy_id).b = a;
      else deltaSet.set(a.policy_id, { a: null, b: a });
    });
    var deltaRows = [];
    deltaSet.forEach(function (v, pid) {
      if (!v.a) deltaRows.push({ pid: pid, kind: "B-only", outcome: v.b.outcome, name: v.b.policy_name });
      else if (!v.b) deltaRows.push({ pid: pid, kind: "A-only", outcome: v.a.outcome, name: v.a.policy_name });
      else if (v.a.outcome !== v.b.outcome) deltaRows.push({ pid: pid, kind: "diff", outcome: v.a.outcome + " vs " + v.b.outcome, name: v.a.policy_name });
    });
    var deltaHtml = deltaRows.length === 0
      ? '<div class="orch-small" style="color:var(--text-mut)">no policy delta — both brands carry the same governance posture</div>'
      : '<table class="canvas-compare-delta"><thead><tr><th>policy</th><th>only on</th><th>outcome</th></tr></thead><tbody>' +
        deltaRows.map(function (r) {
          return '<tr>' +
            '<td><span class="mono">' + escapeHtml(r.pid) + '</span> <span class="orch-small" style="color:var(--text-mut)">' + escapeHtml(r.name) + '</span></td>' +
            '<td><span class="canvas-compare-kind canvas-compare-kind-' + escapeHtml(r.kind) + '">' + escapeHtml(r.kind) + '</span></td>' +
            '<td class="mono">' + escapeHtml(r.outcome) + '</td>' +
          '</tr>';
        }).join("") + '</tbody></table>';

    panel.innerHTML =
      '<div class="canvas-compare-head">' +
        '<span class="canvas-brand-label">A/B comparison</span>' +
        '<span class="orch-small" style="color:var(--text-mut)">' + uniqA.length + ' vs ' + uniqB.length + ' industries · ' + advA.advisories.length + ' vs ' + advB.advisories.length + ' applicable policies</span>' +
        '<button class="canvas-compare-close" id="canvas-compare-close" title="close">×</button>' +
      '</div>' +
      '<div class="canvas-compare-grid">' +
        side(brandA.brand_name || "(A)", brandA.canonical_domain || "", uniqA, advA) +
        side(brandB.brand_name || "(B)", brandB.canonical_domain || "", uniqB, advB) +
      '</div>' +
      '<div class="canvas-compare-delta-section">' +
        '<div class="canvas-brand-label">Delta — what is different</div>' +
        deltaHtml +
      '</div>';
    document.getElementById("canvas-compare-close").addEventListener("click", function () {
      panel.style.display = "none";
      panel.innerHTML = "";
    });
  } catch (e) {
    panel.innerHTML = '<div class="orch-small" style="color:var(--error)">compare failed: ' + escapeHtml(String((e && e.message) || e)) + '</div>';
  }
}

// MVP #1: persist a snapshot of the current canvas run + show permalink.
async function _canvasSaveRun() {
  if (!_canvasState || !_canvasState.brand) return;
  var brand = _canvasState.brand;
  try {
    var r = await fetch("/agents/workflow/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflow_id: _canvasState.workflow_id,
        brand_domain: brand.canonical_domain || "",
        brand_name: brand.brand_name || "",
        brief: _canvasDeriveBrief(brand),
        state: _canvasState,
      }),
    });
    var d = await r.json();
    if (!d.ok) return;
    // Wave 4 fix: persist the server-issued workflow_id so the
    // annotations button has a real id to attach to. Without this,
    // data-wf-id renders empty and clicking the button no-ops.
    if (d.id) _canvasState.workflow_id = d.id;
    // Avoid regex literal here — backslashes inside the SCRIPT_TAG
    // template literal collapse + break the regex. String slice instead.
    var savedWfId = _canvasState.workflow_id || ((d.permalink || "").indexOf("/?wf=") === 0 ? d.permalink.slice(5) : "");
    // Surface the permalink in a small footer chip beneath the run button.
    var actions = document.querySelector(".canvas-brand-actions");
    if (!actions) return;
    var existing = document.getElementById("canvas-permalink-chip");
    if (existing) existing.remove();
    var chip = document.createElement("div");
    chip.id = "canvas-permalink-chip";
    chip.className = "canvas-permalink-chip orch-small";
    var permalink = location.origin + d.permalink;
    chip.innerHTML =
      '<svg class="ico" style="width:10px;height:10px"><use href="#icon-link"/></svg> ' +
      'permalink: <a href="' + escapeHtml(permalink) + '" class="mono">' + escapeHtml(d.permalink) + '</a> ' +
      '<button class="canvas-permalink-copy" title="copy">copy</button>' +
      '<button class="canvas-annotation-toggle" data-wf-id="' + escapeHtml(savedWfId) + '" title="Add or view annotations on this run">💬 annotations</button>';
    actions.appendChild(chip);
    var copyBtn = chip.querySelector(".canvas-permalink-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        navigator.clipboard.writeText(permalink).then(function () {
          copyBtn.textContent = "copied!";
          setTimeout(function () { copyBtn.textContent = "copy"; }, 1500);
        });
      });
    }
    var annBtn = chip.querySelector(".canvas-annotation-toggle");
    if (annBtn) {
      annBtn.addEventListener("click", function () {
        var wfId = annBtn.getAttribute("data-wf-id");
        if (wfId) _canvasOpenAnnotations(wfId);
      });
    }
  } catch (e) { /* non-fatal */ }
}

// Wave 4: annotations modal — list + add + delete on a saved workflow.
async function _canvasOpenAnnotations(workflowId) {
  var existing = document.getElementById("canvas-annotation-modal");
  if (existing) existing.remove();
  var modal = document.createElement("div");
  modal.id = "canvas-annotation-modal";
  modal.className = "canvas-annotation-modal";
  modal.innerHTML =
    '<div class="canvas-annotation-inner">' +
      '<div class="canvas-annotation-head">' +
        '<span class="mono">annotations · ' + escapeHtml(workflowId) + '</span>' +
        '<button class="canvas-annotation-close" id="canvas-annotation-close">×</button>' +
      '</div>' +
      '<div class="canvas-annotation-body" id="canvas-annotation-body"><span class="orch-small">loading…</span></div>' +
      '<div class="canvas-annotation-form">' +
        '<input type="text" id="canvas-annotation-author" placeholder="your name (optional)" maxlength="80" />' +
        '<input type="text" id="canvas-annotation-text" placeholder="add a note (max 500 chars)…" maxlength="500" />' +
        '<button id="canvas-annotation-add">Add</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  document.getElementById("canvas-annotation-close").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
  document.getElementById("canvas-annotation-add").addEventListener("click", function () { _canvasAddAnnotation(workflowId); });
  document.getElementById("canvas-annotation-text").addEventListener("keydown", function (e) {
    if (e.key === "Enter") _canvasAddAnnotation(workflowId);
  });
  await _canvasReloadAnnotations(workflowId);
}

async function _canvasReloadAnnotations(workflowId) {
  var body = document.getElementById("canvas-annotation-body");
  if (!body) return;
  try {
    var r = await fetch("/agents/workflow/runs/" + encodeURIComponent(workflowId) + "/annotation");
    var d = await r.json();
    if (!d.annotations || d.annotations.length === 0) {
      body.innerHTML = '<span class="orch-small" style="color:var(--text-mut)">No annotations yet. Be the first.</span>';
      return;
    }
    body.innerHTML = d.annotations.map(function (a) {
      return '<div class="canvas-annotation-row">' +
        '<div class="canvas-annotation-meta orch-small">' +
          '<span class="mono">' + escapeHtml(a.author || "anonymous") + '</span> · ' +
          '<span>' + escapeHtml(String(a.ts).slice(0, 19).replace("T", " ")) + '</span>' +
          (a.ref ? ' · <span class="mono">' + escapeHtml(a.ref) + '</span>' : '') +
          '<button class="canvas-annotation-del" data-ann-id="' + escapeHtml(a.annotation_id) + '" title="delete">✕</button>' +
        '</div>' +
        '<div class="canvas-annotation-text">' + escapeHtml(a.text) + '</div>' +
      '</div>';
    }).join("");
    body.querySelectorAll(".canvas-annotation-del").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-ann-id");
        if (id) _canvasDeleteAnnotation(workflowId, id);
      });
    });
  } catch (e) {
    body.innerHTML = '<span class="orch-small" style="color:var(--error)">load failed</span>';
  }
}

async function _canvasAddAnnotation(workflowId) {
  var author = document.getElementById("canvas-annotation-author");
  var text = document.getElementById("canvas-annotation-text");
  if (!text) return;
  var t = (text.value || "").trim();
  if (!t) return;
  try {
    var r = await fetch("/agents/workflow/runs/" + encodeURIComponent(workflowId) + "/annotation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author: (author && author.value) || "anonymous",
        text: t,
      }),
    });
    if (!r.ok) { showToast("annotation failed", true); return; }
    text.value = "";
    await _canvasReloadAnnotations(workflowId);
  } catch (e) {
    showToast("annotation error: " + ((e && e.message) || e), true);
  }
}

async function _canvasDeleteAnnotation(workflowId, annId) {
  try {
    await fetch("/agents/workflow/runs/" + encodeURIComponent(workflowId) + "/annotation?annotation_id=" + encodeURIComponent(annId), { method: "DELETE" });
    await _canvasReloadAnnotations(workflowId);
  } catch (e) { /* noop */ }
}

// MVP #1: replay support — if the page loads with ?wf=<id>, fetch the
// saved snapshot and re-render the Canvas as if the user just ran it.
async function _canvasReplayFromQuery() {
  var url = new URL(location.href);
  var wfId = url.searchParams.get("wf");
  if (!wfId || !/^wf_[a-z0-9]+$/i.test(wfId)) return;
  try {
    var r = await fetch("/agents/workflow/runs/" + encodeURIComponent(wfId));
    if (!r.ok) return;
    var snap = await r.json();
    if (!snap || !snap.state) return;
    // Hydrate _canvasState directly. This skips the brand-search flow and
    // jumps straight to the post-workflow rendered view.
    _canvasState = snap.state;
    if (snap.state.brand) {
      var card = document.getElementById("canvas-brand-card");
      if (card) {
        _canvasRenderBrandCard(snap.state.brand);
        var lanes = document.getElementById("canvas-lanes");
        if (lanes) lanes.style.display = "";
        var bottom = document.getElementById("canvas-bottom");
        if (bottom) bottom.style.display = "";
        var loop = document.getElementById("canvas-loop-arrow");
        if (loop) loop.style.display = "";
      }
      ["signals", "creative", "products", "media_buy"].forEach(function (s) {
        if (_canvasState.results && _canvasState.results[s]) _canvasRenderLane(s);
      });
      _canvasFillRegistryBar();
    }
  } catch (e) { /* non-fatal */ }
}

function _canvasRenderLane(stage) {
  var r = _canvasState.results[stage] || { agents: {} };
  var bodyId =
    stage === "signals"   ? "canvas-lane-audiences-body" :
    stage === "creative"  ? "canvas-lane-creative-body" :
    stage === "products"  ? "canvas-lane-inventory-body" :
    stage === "media_buy" ? "canvas-row-mediabuy-body" : null;
  if (!bodyId) return;
  var el = document.getElementById(bodyId);
  if (!el) return;
  var agents = r.agents || {};
  var ids = Object.keys(agents);
  if (ids.length === 0) {
    el.innerHTML = '<div class="canvas-loading orch-small"><span class="spinner"></span> running…</div>';
    return;
  }

  if (stage === "signals") {
    var parts = ids.map(function (aid) {
      var a = agents[aid];
      var sm = a.summary || {};
      var preview = sm.preview || [];
      var rows = preview.slice(0, 3).map(function (s) {
        var chosen = (r.chosen || []).indexOf(s.id) >= 0;
        return '<div class="canvas-lane-row' + (chosen ? ' canvas-lane-row-chosen' : '') + '">' +
          '<span class="mono canvas-lane-row-id">' + escapeHtml(s.id || '-') + '</span>' +
          '<span class="canvas-lane-row-name">' + escapeHtml(s.name || '') + '</span>' +
        '</div>';
      }).join("");
      return '<div class="canvas-lane-agent">' +
        '<div class="canvas-lane-agent-head"><span class="mono">' + escapeHtml(aid) + '</span> ' +
          (a.ok ? '<span class="pill pill-success mono" style="font-size:9.5px">' + (sm.count || 0) + '</span>' : '<span class="pill pill-error mono" style="font-size:9.5px">err</span>') +
        '</div>' + rows +
      '</div>';
    }).join("");
    var chosenLine = (r.chosen && r.chosen.length > 0)
      ? '<div class="canvas-chosen-line"><span class="orch-small" style="color:var(--text-mut)">→ targeting:</span> ' +
          r.chosen.map(function (s) { return '<code class="mono canvas-chip">' + escapeHtml(s) + '</code>'; }).join(' ') +
        '</div>'
      : '';
    el.innerHTML = parts + chosenLine;
  } else if (stage === "creative") {
    var parts = ids.map(function (aid) {
      var a = agents[aid];
      var sm = a.summary || {};
      var preview = sm.preview || [];
      var pills = preview.slice(0, 4).map(function (p) {
        var pid = (p && p.id) || '';
        var pname = (p && (p.name || pid)) || '?';
        var chosen = (r.chosen || []).indexOf(pid) >= 0;
        return '<span class="pill pill-muted mono ' + (chosen ? 'canvas-format-chosen' : '') + '" style="font-size:10px">' +
          escapeHtml(String(pname).slice(0, 28)) + '</span>';
      }).join(" ");
      return '<div class="canvas-lane-agent">' +
        '<div class="canvas-lane-agent-head"><span class="mono">' + escapeHtml(aid) + '</span> ' +
          (a.ok ? '<span class="pill pill-success mono" style="font-size:9.5px">' + (sm.count || 0) + '</span>' : '<span class="pill pill-error mono" style="font-size:9.5px">err</span>') +
        '</div>' +
        '<div class="canvas-lane-format-list">' + pills + '</div>' +
      '</div>';
    }).join("");
    var chosenLine = (r.chosen && r.chosen.length > 0)
      ? '<div class="canvas-chosen-line"><span class="orch-small" style="color:var(--text-mut)">→ creative:</span> ' +
          r.chosen.map(function (f) { return '<code class="mono canvas-chip">' + escapeHtml(f) + '</code>'; }).join(' ') +
        '</div>'
      : '';
    el.innerHTML = parts + chosenLine;
  } else if (stage === "products") {
    var chosenMap = r.chosen || {};
    var parts = ids.map(function (aid) {
      var a = agents[aid];
      var sm = a.summary || {};
      var preview = sm.preview || [];
      var picked = chosenMap[aid];
      var rows = preview.slice(0, 3).map(function (p) {
        var chosen = picked && (p.id === picked);
        return '<div class="canvas-lane-row' + (chosen ? ' canvas-lane-row-chosen' : '') + '">' +
          '<span class="mono canvas-lane-row-id">' + escapeHtml(p.id || '-') + '</span>' +
          '<span class="canvas-lane-row-name">' + escapeHtml(p.name || '') + '</span>' +
        '</div>';
      }).join("");
      return '<div class="canvas-lane-agent">' +
        '<div class="canvas-lane-agent-head"><span class="mono">' + escapeHtml(aid) + '</span> ' +
          (a.ok ? '<span class="pill pill-success mono" style="font-size:9.5px">' + (sm.count || 0) + '</span>' : '<span class="pill pill-error mono" style="font-size:9.5px">err</span>') +
        '</div>' + rows +
      '</div>';
    }).join("");
    el.innerHTML = parts;
  } else if (stage === "media_buy") {
    // Workshop refinement A: governance enforcement. If the cached
    // advisory says "block", fire buttons render disabled with an
    // override link; "warn" gets an amber outline + tooltip. allow
    // is the no-op default.
    var govAdv = (_canvasState && _canvasState.governance_advisory) || null;
    var govOutcome = govAdv ? govAdv.outcome : "allow";
    var govBlockedPolicies = govAdv ? (govAdv.restricted_attributes || []) : [];
    // Block-banner (only when outcome=block) — surfaces the why-blocked
    // reason inline ABOVE the cells, separate from the rebalance banner.
    var govBlockBanner = "";
    if (govOutcome === "block" && govBlockedPolicies.length > 0) {
      govBlockBanner = '<div class="canvas-gov-enforce-banner canvas-gov-enforce-block">' +
        '<span class="canvas-gov-enforce-icon">⛔</span>' +
        '<span class="canvas-gov-enforce-text">' +
          'governance preview <strong>BLOCKS</strong> this fire — unmet must on ' +
          govBlockedPolicies.map(function (pid) { return '<span class="mono">' + escapeHtml(pid) + '</span>'; }).join(", ") +
        '</span>' +
        '<button class="canvas-gov-override-btn" id="canvas-gov-override-btn" title="Override block-prediction; the fire still proceeds in the demo.">override</button>' +
      '</div>';
    } else if (govOutcome === "warn") {
      govBlockBanner = '<div class="canvas-gov-enforce-banner canvas-gov-enforce-warn">' +
        '<span class="canvas-gov-enforce-icon">⚠</span>' +
        '<span class="canvas-gov-enforce-text">' +
          'governance preview <strong>WARNS</strong> — silent on ' +
          govAdv.advisories.filter(function (a) { return a.outcome === "warn"; }).slice(0, 3).map(function (a) { return '<span class="mono">' + escapeHtml(a.policy_id) + '</span>'; }).join(", ") +
          '. Fire allowed but flagged for review.' +
        '</span>' +
      '</div>';
    }
    // MVP #6: partial-result optimization. Count fired agents that
    // hit the auth-gate pattern; if N>0 and at least 1 succeeded,
    // show a portfolio-rebalance banner above the cells. Workshop
    // punchline made actionable.
    var authGatedCount = 0;
    var firedSuccessCount = 0;
    var firedFailCount = 0;
    var totalBudget = 0;
    var authRegexShared = /principal id not found|authentication required|auth_token_invalid|unauthorized|\\b401\\b|tenant policy/i;
    ids.forEach(function (aid) {
      var ag = agents[aid];
      var smm = ag.summary || {};
      if (smm.payload_preview && smm.payload_preview.total_budget) {
        totalBudget += (smm.payload_preview.total_budget.amount || 0);
      }
      if (!smm.fired) return;
      if (ag.ok) { firedSuccessCount++; return; }
      firedFailCount++;
      var resTxt = "";
      var c2 = smm.content;
      if (Array.isArray(c2)) {
        for (var k = 0; k < c2.length; k++) {
          if (c2[k] && c2[k].type === "text" && typeof c2[k].text === "string") {
            resTxt = c2[k].text; break;
          }
        }
      }
      if (!resTxt && smm.result) try { resTxt = JSON.stringify(smm.result); } catch (e) { /* noop */ }
      if (authRegexShared.test(resTxt)) authGatedCount++;
    });
    var rebalanceBanner = "";
    if (authGatedCount > 0 && firedSuccessCount > 0 && totalBudget > 0) {
      // Rebalance: redirect the auth-gated agents' share of the budget
      // proportionally to the successful ones. Shown as a chip not a
      // mutation — UX says "here's what we'd do", not "we did it".
      var perAgent = Math.round(totalBudget / ids.length);
      var rebalancedPerSuccess = Math.round(totalBudget / firedSuccessCount);
      var bonus = rebalancedPerSuccess - perAgent;
      rebalanceBanner = '<div class="canvas-rebalance-banner">' +
        '<span class="canvas-rebalance-icon">⚖</span>' +
        '<span class="canvas-rebalance-text">' +
          '<strong>' + authGatedCount + '</strong> auth-gated · ' +
          '<strong>' + firedSuccessCount + '</strong> live. ' +
          'Portfolio rebalance: $' + perAgent.toLocaleString() + ' → $' + rebalancedPerSuccess.toLocaleString() + ' / live agent ' +
          '<span class="canvas-rebalance-delta">(+$' + bonus.toLocaleString() + ' each)</span>' +
        '</span>' +
        '<span class="canvas-rebalance-meta orch-small">no rerun needed — total deployable budget preserved</span>' +
      '</div>';
    }
    var parts = ids.map(function (aid) {
      var a = agents[aid];
      var sm = a.summary || {};
      var fired = sm.fired
        ? (a.ok
          ? '<span class="pill pill-success mono" style="font-size:9.5px">fired ✓</span>'
          : '<span class="pill pill-error mono" style="font-size:9.5px">fired ✗</span>')
        : '<span class="pill pill-muted mono" style="font-size:9.5px">dry run</span>';
      // Phase 4 follow-up: fire button per vendor, only on dry-run cards.
      // Workshop refinement A: governance-aware enforcement. When the
      // cached advisory says block (and no override active), the button
      // renders disabled with the block reason in the title; warn gets
      // a class hook for amber styling.
      var govOverridden = (_canvasState && _canvasState.gov_override) === true;
      var fireDisabled = govOutcome === "block" && !govOverridden;
      var fireClass = "canvas-fire-btn"
        + (govOutcome === "warn" ? " canvas-fire-btn-warn" : "")
        + (fireDisabled ? " canvas-fire-btn-blocked" : "");
      var fireTitle = fireDisabled
        ? "governance BLOCK — click override above to enable"
        : govOutcome === "warn"
          ? "governance WARN — fire allowed, flagged for review"
          : "Live-fire create_media_buy on this vendor with the current brand context";
      var fireBtn = !sm.fired
        ? '<button class="' + fireClass + '" data-canvas-fire-agent="' + escapeHtml(aid) + '"' +
            (fireDisabled ? ' disabled' : '') +
            ' title="' + escapeHtml(fireTitle) + '">' +
            (fireDisabled ? "⛔ blocked" : govOutcome === "warn" ? "⚠ fire (warn)" : "simulate fire") +
          '</button>'
        : '';
      // Surface vendor rejection reason inline if fired and not ok.
      var rejection = "";
      if (sm.fired && !a.ok) {
        var content = sm.content;
        var resultText = "";
        if (Array.isArray(content)) {
          for (var ci = 0; ci < content.length; ci++) {
            var blk = content[ci];
            if (blk && typeof blk === "object" && blk.type === "text" && typeof blk.text === "string") {
              resultText = blk.text; break;
            }
          }
        }
        if (!resultText && sm.result) {
          try { resultText = JSON.stringify(sm.result); } catch (e) { /* noop */ }
        }
        // Same auth-pattern detector as the Orchestrator tab.
        var authRegex = /principal id not found|authentication required|auth_token_invalid|unauthorized|\\b401\\b|tenant policy/i;
        var isAuthGated = authRegex.test(resultText);
        rejection = isAuthGated
          ? '<div class="canvas-mediabuy-rejection canvas-mediabuy-auth"><span class="canvas-loop-arrow-glyph" style="font-size:13px">⚠</span> auth-gated — payload shape passed; vendor requires credentials we do not have</div>'
          : (resultText ? '<div class="canvas-mediabuy-rejection mono">' + escapeHtml(resultText.slice(0, 220)) + '</div>' : '');
      }
      // Workshop refinement B: cost/impression estimation in dry-run.
      // Same deterministic algorithm as /agents/workflow/measurement-stub
      // so the pre-fire prediction matches what a "Sample delivery" call
      // would return after fire. Hashes (workflow × agent) → seed → CPM
      // 1.5–2.5 → impressions ~ budget * (550–750). Anchors the dry-run
      // in numbers instead of payload-shape only.
      var pred = "";
      if (!sm.fired) {
        var budget = (sm.payload_preview && sm.payload_preview.total_budget && sm.payload_preview.total_budget.amount) || 1000;
        var seedSrc = (sm.payload_preview && sm.payload_preview.po_number) || aid;
        var seedH = 0;
        for (var si = 0; si < seedSrc.length; si++) seedH = (seedH * 31 + seedSrc.charCodeAt(si)) >>> 0;
        // Stable pseudo-random in [0,1) from the seed.
        var pseudo = ((seedH * 1664525 + 1013904223) >>> 0) / 0xffffffff;
        var cpm = Math.round((1.5 + pseudo * 1.0) * 100) / 100;
        var imps = Math.round(budget / cpm * 1000);
        pred = '<div class="canvas-mediabuy-pred mono" title="Predicted from same algo as measurement-stub. Replaced with live numbers when get_media_buy_delivery returns.">' +
          '<span class="canvas-mediabuy-pred-icon">≈</span> ' +
          '$' + budget.toLocaleString() + ' → ' +
          imps.toLocaleString() + ' impr · ' +
          'CPM $' + cpm +
        '</div>';
      }
      return '<div class="canvas-mediabuy-cell">' +
        '<div class="canvas-mediabuy-cell-row"><span class="mono">' + escapeHtml(aid) + '</span> ' + fired + fireBtn + '</div>' +
        pred +
        rejection +
      '</div>';
    }).join("");
    el.innerHTML = govBlockBanner + rebalanceBanner + parts;
    // Wire override button (only present when outcome=block).
    var overrideBtn = document.getElementById("canvas-gov-override-btn");
    if (overrideBtn) {
      overrideBtn.addEventListener("click", function () {
        if (_canvasState) _canvasState.gov_override = true;
        // Re-render the lane to reflect the override.
        _canvasRenderLane("media_buy");
      });
    }
    // MVP #7: as soon as ANY agent has fired (success OR fail), show the
    // measurement lane. Stub-only — surface intent + close 4-stage loop.
    var anyFired = ids.some(function (aid) { return (agents[aid].summary || {}).fired; });
    if (anyFired) _canvasShowMeasurementLane(ids, agents);
    // Wire fire buttons (post-innerHTML — addEventListener avoids the
    // SCRIPT_TAG inline-attr escape trap).
    el.querySelectorAll(".canvas-fire-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var aid = btn.getAttribute("data-canvas-fire-agent");
        if (aid) _canvasFireBuy(aid, btn);
      });
    });
  }
}

// Fire-buy from the Canvas Media-buy row. Calls /agents/workflow/fire-buy
// with the brand context, then synthesizes an agent_complete event so the
// existing render path picks up the result (fired ✓/✗ + auth callout).
async function _canvasFireBuy(agentId, btn) {
  if (!_canvasState || !_canvasState.brand) return;
  if (btn.disabled) return;
  var origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "firing…";
  var brand = _canvasState.brand;
  var bm = (brand && brand.brand_manifest) || {};
  var company = bm.company || {};
  var brandPayload = {
    domain: brand.canonical_domain || "",
    name: brand.brand_name || bm.name || "",
    industries: Array.isArray(company.industries) ? company.industries : [],
  };
  var brief = _canvasDeriveBrief(brand);
  var chosenSignals = (_canvasState.results && _canvasState.results.signals && _canvasState.results.signals.chosen) || [];
  var chosenFormats = (_canvasState.results && _canvasState.results.creative && _canvasState.results.creative.chosen) || [];
  var chosenProducts = (_canvasState.results && _canvasState.results.products && _canvasState.results.products.chosen_per_agent) || {};
  var productId = chosenProducts[agentId] || null;
  try {
    var r = await fetch("/agents/workflow/fire-buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        product_id: productId,
        signal_ids: chosenSignals,
        format_ids: chosenFormats,
        brief: brief,
        brand: brandPayload,
        timeout_ms: 20000,
      }),
    });
    var data = await r.json();
    if (!r.ok) {
      btn.textContent = origText;
      btn.disabled = false;
      showToast((data && (data.error || data.message)) || ("HTTP " + r.status), true);
      return;
    }
    _canvasApplyEvent({
      type: "agent_complete",
      stage: "media_buy",
      agent_id: agentId,
      ok: !!data.ok,
      error: data.error,
      latency_ms: data.latency_ms || 0,
      summary: {
        dry_run: false,
        fired: true,
        payload_preview: data.payload_preview,
        result: data.result,
        content: data.content,
      },
    });
  } catch (e) {
    btn.textContent = origText;
    btn.disabled = false;
    showToast(String((e && e.message) || e), true);
  }
}

// ─── Federation (partial — more in Part 3) ───────────────────────────────

// ─── Federation (partial — more in Part 3) ───────────────────────────────
var _fedLoaded = false;
async function ensureFederation() {
  if (_fedLoaded) return;
  _fedLoaded = true;
  document.getElementById("fed-run").addEventListener("click", runFederatedSearch);
  renderAgentRegistry();
}
async function renderAgentRegistry() {
  var host = document.getElementById("fed-registry");
  try {
    var r = await fetch("/agents/registry");
    var data = await r.json();
    var cards = (data.agents || []).map(function (a) {
      var stageClass = a.stage === "live" ? "pill-success" : a.stage === "sandbox" ? "pill-info" : "pill-mut";
      var specs = (a.specialties || []).map(function (s) { return '<span class="pill pill-muted mono" style="margin-right:4px">' + escapeHtml(s) + '</span>'; }).join('');
      return '<div class="fed-card">' +
        '<div class="fed-card-head"><div class="fed-card-name">' + escapeHtml(a.name || a.id) + '</div><span class="pill ' + stageClass + '">' + escapeHtml(a.stage || 'unknown') + '</span></div>' +
        (a.mcp_url ? '<div class="fed-url mono">' + escapeHtml(a.mcp_url) + '</div>' : '') +
        (a.vendor ? '<div class="fed-vendor">' + escapeHtml(a.vendor) + '</div>' : '') +
        '<div class="fed-specs">' + specs + '</div>' +
      '</div>';
    }).join("");
    host.innerHTML = '<div class="fed-grid">' + cards + '</div>';
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title" style="color:var(--error)">Registry not yet deployed</div><div class="empty-desc">Part 3 of Sec-41 wires live Dstillery federation.</div></div>';
  }
}
// Federation shortlist — cross-agent selection that persists while the
// user tries different briefs. Each entry: { agent, signal }. Used by
// the bulk action bar (activate evgeny rows / copy TTD ids / export CSV /
// send to portfolio builder).
var _fedShortlist = [];
var _fedLastResults = [];

`;
