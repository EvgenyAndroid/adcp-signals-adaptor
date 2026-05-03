// src/demo/script/fragments/builder.ts
//
// Set Builder: rule rows, suggestions, similarity brief, funnel, explain, debounced estimates.
//
// Source range (in pre-refactor src/demo/script.ts): lines 2495..3363 (869 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const builderJs = `function ensureBuilder() {
  renderBuilderRules();
  debouncedEstimate();
  ensureBuilderStack();
}

//────────────────────────────────────────────────────────────────────────
// Sec-38 B6 — Builder multi-signal audience stack
//────────────────────────────────────────────────────────────────────────
var _builderStack = { selected: [], suggestions: [] };
async function ensureBuilderStack() {
  if (state.catalog.all.length === 0) await loadCatalog();
  renderStackList();
  renderStackSuggestions("");
  var inp = document.getElementById("stack-search-input");
  if (inp && !inp.__wired) {
    inp.__wired = true;
    inp.addEventListener("input", function (e) { renderStackSuggestions(e.target.value.toLowerCase()); });
  }
}
function renderStackSuggestions(q) {
  var host = document.getElementById("stack-suggestions");
  if (!host) return;
  if (!q || q.length < 2) { host.innerHTML = ""; host.style.display = "none"; return; }
  var selectedIds = new Set(_builderStack.selected.map(function (s) { return s.signal_agent_segment_id; }));
  var hits = state.catalog.all
    .filter(function (s) { return !selectedIds.has(s.signal_agent_segment_id) && (s.name || "").toLowerCase().includes(q); })
    .slice(0, 8);
  if (!hits.length) { host.innerHTML = '<div class="stack-sugg-empty">No matches</div>'; host.style.display = "block"; return; }
  host.innerHTML = hits.map(function (s) {
    return '<div class="stack-sugg" data-sid="' + escapeHtml(s.signal_agent_segment_id) + '">' +
      '<div><div class="stack-sugg-name">' + escapeHtml(s.name) + '</div>' +
      '<div class="stack-sugg-meta">' + fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "") + '</div></div>' +
      '<button class="btn-secondary" style="padding:2px 10px;font-size:11px">+ add</button>' +
    '</div>';
  }).join("");
  host.style.display = "block";
  host.querySelectorAll(".stack-sugg").forEach(function (el) {
    el.addEventListener("click", function () {
      var sid = el.dataset.sid;
      var sig = state.catalog.all.find(function (x) { return x.signal_agent_segment_id === sid; });
      if (sig && _builderStack.selected.length < 8) {
        _builderStack.selected.push(sig);
        document.getElementById("stack-search-input").value = "";
        renderStackSuggestions("");
        renderStackList();
      }
    });
  });
}
function renderStackList() {
  var host = document.getElementById("stack-list");
  if (!host) return;
  if (_builderStack.selected.length === 0) {
    host.innerHTML = '<div class="empty-state" style="padding:14px"><div class="empty-desc">Pick 2-8 catalog signals to model a stacked audience. Useful when one rule-set can\\'t cleanly capture the target.</div></div>';
    document.getElementById("stack-summary").style.display = "none";
    document.getElementById("stack-bar-wrap").innerHTML = "";
    return;
  }
  host.innerHTML = _builderStack.selected.map(function (s, i) {
    return '<div class="stack-chip">' +
      '<div><div class="stack-chip-name">' + escapeHtml(s.name) + '</div>' +
      '<div class="stack-chip-meta">' + fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "") + '</div></div>' +
      '<button class="stack-remove" data-idx="' + i + '"><svg class="ico"><use href="#icon-close"/></svg></button>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".stack-remove").forEach(function (b) {
    b.addEventListener("click", function () {
      _builderStack.selected.splice(parseInt(b.dataset.idx, 10), 1);
      renderStackList();
    });
  });
  computeStackSummary();
}
function computeStackSummary() {
  var sigs = _builderStack.selected;
  if (sigs.length < 2) {
    document.getElementById("stack-summary").style.display = "none";
    document.getElementById("stack-bar-wrap").innerHTML = "";
    return;
  }
  var sum = 0, costWeighted = 0;
  sigs.forEach(function (s) {
    var sz = s.estimated_audience_size || 0;
    var cpm = fmtCPM(s).cpm || 5;
    sum += sz;
    costWeighted += sz * cpm;
  });
  // Heuristic pairwise overlap via category affinity (same as overlap.ts)
  function affinity(a, b) {
    if (a.category_type === b.category_type) return 0.55;
    return 0.20;
  }
  var overlap = 0;
  for (var i = 0; i < sigs.length; i++) {
    for (var j = i + 1; j < sigs.length; j++) {
      var a = sigs[i], b = sigs[j];
      var aff = affinity(a, b);
      var minSz = Math.min(a.estimated_audience_size || 0, b.estimated_audience_size || 0);
      overlap += aff * minSz * 0.6; // 0.6 dampener for higher-order dedupe
    }
  }
  var uniqueReach = Math.max(0, sum - overlap);
  var blendedCpm = sum > 0 ? costWeighted / sum : 0;

  document.getElementById("stack-summary").style.display = "grid";
  document.getElementById("stack-unique").textContent = fmtNumber(Math.round(uniqueReach));
  document.getElementById("stack-sum").textContent = fmtNumber(Math.round(sum));
  document.getElementById("stack-overlap").textContent = fmtNumber(Math.round(overlap)) + " (" + ((overlap / sum) * 100).toFixed(1) + "%)";
  document.getElementById("stack-cpm").textContent = "$" + blendedCpm.toFixed(2);

  // Stacked bar visualization — per signal contribution, overlap striped
  var W = 520, H = 32;
  var stackSvg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:40px">';
  var xPos = 0;
  sigs.forEach(function (s, i) {
    var sz = s.estimated_audience_size || 0;
    var w = (sz / sum) * W;
    var hue = (i * 47) % 360;
    stackSvg += '<rect x="' + xPos + '" y="0" width="' + w.toFixed(1) + '" height="' + H + '" fill="hsl(' + hue + ' 60% 55%)" fill-opacity="0.85"><title>' + escapeHtml(s.name) + ': ' + fmtNumber(sz) + '</title></rect>';
    xPos += w;
  });
  // Overlap stripe overlay
  var overlapFrac = sum > 0 ? overlap / sum : 0;
  stackSvg += '<pattern id="ov-stripe" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0,0,0,0.5)" stroke-width="3"/></pattern>';
  stackSvg += '<rect x="' + ((1 - overlapFrac) * W).toFixed(1) + '" y="0" width="' + (overlapFrac * W).toFixed(1) + '" height="' + H + '" fill="url(#ov-stripe)"/>';
  stackSvg += '</svg>';
  document.getElementById("stack-bar-wrap").innerHTML =
    stackSvg +
    '<div style="font-size:10.5px;color:var(--text-mut);margin-top:6px">Each block ∝ signal size · striped area ∝ estimated overlap · unique reach = sum − overlap</div>';
}

function renderBuilderRules() {
  const host = document.getElementById("builder-rules");
  if (state.builder.rules.length === 0) {
    host.innerHTML = '<div class="empty-state" style="padding:18px"><div class="empty-desc">Click <strong>Add rule</strong> to compose a segment. Estimated audience size updates as you go.</div></div>';
  } else {
    host.innerHTML = state.builder.rules.map((r, i) => renderBuilderRule(r, i)).join("");
    host.querySelectorAll(".builder-rule").forEach((row, i) => wireRuleRow(row, i));
  }
  const addBtn = document.getElementById("add-rule-btn");
  if (addBtn) {
    addBtn.disabled = state.builder.rules.length >= MAX_RULES;
    addBtn.title = state.builder.rules.length >= MAX_RULES ? "Maximum of 6 rules" : "";
  }
  const resetBtn = document.getElementById("reset-rules-btn");
  if (resetBtn) {
    const nameVal = document.getElementById("builder-name")?.value || "";
    resetBtn.disabled = state.builder.rules.length === 0 && nameVal.length === 0;
  }
}

function renderBuilderRule(rule, idx) {
  const dim = DIMENSIONS.find((d) => d.key === rule.dimension) || DIMENSIONS[0];
  return '' +
    '<div class="builder-rule" data-idx="' + idx + '">' +
      '<select data-role="dim">' +
        DIMENSIONS.map((d) => '<option value="' + d.key + '"' + (d.key === rule.dimension ? ' selected' : '') + '>' + d.key.replace(/_/g, " ") + '</option>').join("") +
      '</select>' +
      '<select data-role="op">' +
        OPERATORS.map((o) => '<option value="' + o + '"' + (o === rule.operator ? ' selected' : '') + '>' + o + '</option>').join("") +
      '</select>' +
      '<select data-role="val">' +
        dim.values.map((v) => '<option value="' + v + '"' + (v === rule.value ? ' selected' : '') + '>' + v + '</option>').join("") +
      '</select>' +
      '<button class="remove-btn" data-role="remove" aria-label="Remove rule"><svg class="ico"><use href="#icon-minus"/></svg></button>' +
    '</div>';
}

function wireRuleRow(row, idx) {
  const rule = state.builder.rules[idx];
  row.querySelector("[data-role=dim]").addEventListener("change", (e) => {
    rule.dimension = e.target.value;
    // Reset value to first valid for new dimension
    const dim = DIMENSIONS.find((d) => d.key === rule.dimension);
    if (dim && !dim.values.includes(rule.value)) rule.value = dim.values[0];
    renderBuilderRules();
    debouncedEstimate();
  });
  row.querySelector("[data-role=op]").addEventListener("change", (e) => {
    rule.operator = e.target.value;
    debouncedEstimate();
  });
  row.querySelector("[data-role=val]").addEventListener("change", (e) => {
    rule.value = e.target.value;
    debouncedEstimate();
  });
  row.querySelector("[data-role=remove]").addEventListener("click", () => {
    state.builder.rules.splice(idx, 1);
    renderBuilderRules();
    debouncedEstimate();
  });
}

document.getElementById("add-rule-btn").addEventListener("click", () => {
  if (state.builder.rules.length >= MAX_RULES) return;
  const used = new Set(state.builder.rules.map((r) => r.dimension));
  const nextDim = DIMENSIONS.find((d) => !used.has(d.key)) || DIMENSIONS[0];
  state.builder.rules.push({ dimension: nextDim.key, operator: "eq", value: nextDim.values[0] });
  renderBuilderRules();
  debouncedEstimate();
});

// Sec-34: real similarity check on each rule change. Uses the agent's
// own semantic-ranking tool (get_signals with the composed NL brief as
// signal_spec) instead of a hand-rolled algorithm — the answer comes
// from the same embedding engine that services every buyer-agent query,
// so what's shown here is what the agent would match in production.
//
// Why not get_similar_signals? That tool takes a reference
// signal_agent_segment_id — but the builder draft isn't persisted yet
// (and persisting JUST to run the similarity check creates the
// duplicate we're trying to prevent). Instead we compose a textual
// description from the rules and let the brief-driven search surface
// catalog neighbors.
let _similarSeq = 0;
async function runSimilarCheck() {
  const rules = state.builder.rules;
  const host = document.getElementById("similar-signals");
  const subtitle = document.getElementById("similar-subtitle");
  if (rules.length === 0) {
    host.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-desc">Compose a rule and the agent\\'s semantic ranker will surface existing catalog signals that overlap — use one before creating a duplicate.</div></div>';
    subtitle.textContent = "—";
    return;
  }
  const seq = ++_similarSeq;
  const brief = buildSimilarityBrief(rules);
  subtitle.innerHTML = '<span class="spinner"></span>scanning catalog…';
  try {
    const res = await fetch("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
      body: JSON.stringify({
        jsonrpc: "2.0", id: rpcId++, method: "tools/call",
        params: { name: "get_signals", arguments: {
          signal_spec: brief,
          deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
          max_results: 5,
        } },
      }),
    });
    if (seq !== _similarSeq) return;
    const body = await res.json();
    const sc = body.result?.structuredContent;
    const matches = (sc?.signals || []).filter((s) => s.signal_type !== "custom").slice(0, 3);

    if (matches.length === 0) {
      host.innerHTML = '<div class="empty-state" style="padding:16px"><div class="empty-desc">No close catalog matches — this composition looks genuinely novel. Generating it would add value.</div></div>';
      subtitle.textContent = "0 matches";
      return;
    }

    // The top match is the potential duplicate. Rank by ordinal position
    // (agent's semantic ranker already sorted these); assign coarse high/
    // medium/low tiers by ordinal since scores aren't exposed on the wire.
    const tiers = ["high", "medium", "low"];
    const warning = matches.length > 0 && rules.length >= 2
      ? '<div class="similar-warning">' +
          '<svg class="ico"><use href="#icon-info"/></svg>' +
          '<span>Your composition semantically overlaps with <strong>' + escapeHtml(matches[0].name) + '</strong> — consider using it before generating a near-duplicate.</span>' +
        '</div>'
      : "";
    host.innerHTML = warning + matches.map((s, i) => renderSimilarCard(s, tiers[i] || "low")).join("");
    subtitle.textContent = matches.length + " candidate" + (matches.length === 1 ? "" : "s");
    // Wire clicks — jump into the detail panel for the matched signal
    host.querySelectorAll(".similar-card").forEach((card) => {
      card.addEventListener("click", () => {
        const sid = card.dataset.sid;
        const sig = state.catalog.all.find((x) => (x.signal_agent_segment_id || x.signal_id?.id) === sid)
                 || matches.find((m) => (m.signal_agent_segment_id || m.signal_id?.id) === sid);
        if (sig) openDetail(sig);
      });
    });
  } catch (e) {
    if (seq === _similarSeq) {
      host.innerHTML = '<div class="empty-state" style="padding:16px;color:var(--text-mut)"><div class="empty-desc">Similarity check unavailable: ' + escapeHtml(e.message) + '</div></div>';
      subtitle.textContent = "error";
    }
  }
}

// Compose a natural-language brief from rules for the similarity probe.
// Denser / more keyword-heavy than buildExplainSentence because the
// embedding engine benefits from repeated dimensional terms.
function buildSimilarityBrief(rules) {
  const parts = [];
  for (const r of rules) {
    const val = Array.isArray(r.value) ? r.value[0] : r.value;
    const strVal = String(val).replace(/_/g, " ");
    parts.push(r.dimension.replace(/_/g, " ") + " " + strVal);
  }
  return "Audience with " + parts.join(", ");
}

function renderSimilarCard(sig, tier) {
  const sid = sig.signal_agent_segment_id || sig.signal_id?.id || "";
  const price = fmtCPM(sig);
  const rankLabel = tier === "high" ? "top match" : tier === "medium" ? "similar" : "related";
  return '' +
    '<div class="similar-card" data-sid="' + escapeHtml(sid) + '">' +
      '<div class="sc-main">' +
        '<div class="sc-nm">' + escapeHtml(sig.name || "") + '</div>' +
        '<div class="sc-sub">' + fmtNumber(sig.estimated_audience_size) + ' audience · ' + price.display + ' cpm · ' + escapeHtml(sig.category_type || "—") + '</div>' +
      '</div>' +
      '<span class="sc-rank ' + tier + '">' + rankLabel + '</span>' +
    '</div>';
}

// Sec-33: starter templates — seed rule sets for common DSP audiences.
// Clicking a template replaces the current rules and re-runs estimate.
const BUILDER_TEMPLATES = {
  affluent_streamers: {
    label: "Affluent Streamers 25-44",
    defaultName: "Affluent Streamers 25-44",
    rules: [
      { dimension: "age_band", operator: "in", value: ["25-34", "35-44"] },
      { dimension: "income_band", operator: "eq", value: "150k_plus" },
      { dimension: "streaming_affinity", operator: "eq", value: "high" },
    ],
  },
  cord_cutter_parents: {
    label: "Cord-Cutter Parents",
    defaultName: "Cord-Cutter Parents",
    rules: [
      { dimension: "age_band", operator: "in", value: ["35-44", "45-54"] },
      { dimension: "household_type", operator: "eq", value: "family_with_kids" },
      { dimension: "streaming_affinity", operator: "eq", value: "high" },
    ],
  },
  urban_millennials: {
    label: "Urban Millennials",
    defaultName: "Urban Millennials",
    rules: [
      { dimension: "age_band", operator: "eq", value: "25-34" },
      { dimension: "metro_tier", operator: "eq", value: "top_10" },
      { dimension: "education", operator: "in", value: ["bachelors", "graduate"] },
    ],
  },
  seniors_documentary: {
    label: "Seniors · Documentary",
    defaultName: "Seniors · Documentary",
    rules: [
      { dimension: "age_band", operator: "eq", value: "65+" },
      { dimension: "content_genre", operator: "eq", value: "documentary" },
    ],
  },
  b2b_exec_profile: {
    label: "B2B Exec Profile",
    defaultName: "B2B Exec Profile",
    rules: [
      { dimension: "age_band", operator: "in", value: ["35-44", "45-54"] },
      { dimension: "education", operator: "eq", value: "graduate" },
      { dimension: "income_band", operator: "eq", value: "150k_plus" },
    ],
  },
};

let _pendingTemplate = null;

document.getElementById("builder-template").addEventListener("change", (e) => {
  const key = e.target.value;
  if (!key) return;
  const tpl = BUILDER_TEMPLATES[key];
  if (!tpl) { e.target.value = ""; return; }
  // Sec-35: inline confirm when replacing non-empty rules instead of
  // silently clobbering. Browser confirm() is ugly + doesn't match the
  // aesthetic. Apply directly when the rule list is empty.
  if (state.builder.rules.length > 0) {
    _pendingTemplate = key;
    document.getElementById("template-confirm-msg").innerHTML =
      'Replace <strong>' + state.builder.rules.length + ' current rule' + (state.builder.rules.length === 1 ? "" : "s") +
      '</strong> with <strong>' + escapeHtml(tpl.label) + '</strong>?';
    document.getElementById("template-confirm").style.display = "flex";
  } else {
    applyBuilderTemplate(key);
  }
  e.target.value = ""; // reset selector so the same template re-triggers
});

document.getElementById("template-confirm-apply").addEventListener("click", () => {
  if (_pendingTemplate) applyBuilderTemplate(_pendingTemplate);
  document.getElementById("template-confirm").style.display = "none";
  _pendingTemplate = null;
});
document.getElementById("template-confirm-cancel").addEventListener("click", () => {
  document.getElementById("template-confirm").style.display = "none";
  _pendingTemplate = null;
});

function applyBuilderTemplate(key) {
  const tpl = BUILDER_TEMPLATES[key];
  if (!tpl) return;
  state.builder.rules = tpl.rules.map((r) => ({
    dimension: r.dimension,
    operator: Array.isArray(r.value) ? "eq" : r.operator,
    value: Array.isArray(r.value) ? r.value[0] : r.value,
  }));
  // Prefill segment name when empty. Don't overwrite if the user already
  // typed something — respect their intent.
  const nameInput = document.getElementById("builder-name");
  if (nameInput && !nameInput.value.trim()) nameInput.value = tpl.defaultName;
  renderBuilderRules();
  runEstimate();
}

// Reset — clear all rules, segment name, and any "generated" banner so
// the builder is back to the initial empty state. Preview returns to the
// 240M baseline via runEstimate on empty rules.
document.getElementById("reset-rules-btn").addEventListener("click", () => {
  if (state.builder.rules.length === 0 && !document.getElementById("builder-name").value) return;
  state.builder.rules = [];
  document.getElementById("builder-name").value = "";
  const note = document.getElementById("generate-note");
  note.className = "builder-note";
  note.textContent = "";
  state.builder.generatedSegment = null;
  renderBuilderRules();
  runEstimate();
});

function debouncedEstimate() {
  clearTimeout(state.builder.debounceTimer);
  state.builder.debounceTimer = setTimeout(runEstimate, 250);
}

async function runEstimate() {
  const seq = ++state.builder.estimateSeq;
  const heroEl = document.getElementById("preview-audience");
  heroEl.classList.add("loading");
  try {
    const res = await fetch("/signals/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: state.builder.rules }),
    });
    // Newer request superseded us — drop the result
    if (seq !== state.builder.estimateSeq) return;
    const data = await res.json();
    if (data.error) {
      heroEl.textContent = "—";
      document.getElementById("preview-sub").textContent = "validation error";
      document.getElementById("preview-meta").textContent = (data.details?.validation_errors || []).join("; ");
      document.getElementById("coverage-fill").style.width = "0%";
      renderFunnel([]);
      return;
    }
    heroEl.classList.remove("loading");
    heroEl.textContent = fmtNumber(data.estimated_audience_size);
    // Sec-37 A3: render a ± range derived from the confidence tier so
    // a tier-1 reviewer sees honest uncertainty on every estimate.
    const range = confidenceRange(data.estimated_audience_size, data.confidence);
    const rangeText = range
      ? data.estimated_audience_size.toLocaleString() + " adults · ±" + range.pct + "% range: " + fmtNumber(range.lo) + "–" + fmtNumber(range.hi)
      : data.estimated_audience_size.toLocaleString() + " adults";
    document.getElementById("preview-sub").textContent = rangeText;
    document.getElementById("coverage-fill").style.width = Math.min(100, data.coverage_percentage) + "%";
    document.getElementById("preview-meta").textContent = data.rule_count + " rule" + (data.rule_count === 1 ? "" : "s") + " · " + data.coverage_percentage + "% of US adults · dimensions: " + (data.dimensions_used.join(", ") || "(none)");
    // Sec-33: confidence pill, floor warning, NL explain
    const confEl = document.getElementById("preview-confidence");
    if (confEl && data.confidence) {
      confEl.textContent = data.confidence;
      confEl.className = "preview-confidence-pill " + data.confidence;
    } else if (confEl) { confEl.textContent = ""; confEl.className = "preview-confidence-pill"; }
    const floorEl = document.getElementById("preview-floor-warning");
    if (floorEl) floorEl.style.display = data.estimated_audience_size <= 50_000 && data.rule_count > 0 ? "flex" : "none";
    const explainEl = document.getElementById("preview-explain");
    if (explainEl) explainEl.textContent = buildExplainSentence(state.builder.rules, data);
    await renderFunnelCumulative();
    // Fire-and-forget similar-signals check — uses the composed NL
    // sentence as a semantic brief against get_signals. Intentionally
    // awaited AFTER the funnel so it doesn't block the headline number.
    runSimilarCheck();
  } catch (e) {
    if (seq === state.builder.estimateSeq) {
      heroEl.classList.remove("loading");
      showToast("Estimate failed: " + e.message, true);
    }
  }
}

// Sec-33: human-readable one-sentence description of the composed segment.
// Makes the audience-estimate legible for non-technical stakeholders and
// turns the builder output into a pitch line rather than a JSON prop.
const DIM_PHRASES = {
  age_band: { prefix: "Adults", render: (v) => v + (String(v).endsWith("+") ? "" : "") },
  income_band: {
    prefix: "earning",
    render: (v) => ({
      "under_50k": "under $50K", "50k_100k": "$50K–$100K",
      "100k_150k": "$100K–$150K", "150k_plus": "$150K+",
    }[String(v)] || String(v)),
  },
  education: {
    prefix: "with",
    render: (v) => ({
      "high_school": "HS education", "some_college": "some college",
      "bachelors": "bachelors or above", "graduate": "graduate education",
    }[String(v)] || String(v)),
  },
  household_type: {
    prefix: "in",
    render: (v) => ({
      "single": "single-adult households", "couple_no_kids": "child-free couples",
      "family_with_kids": "households with children", "senior_household": "senior households",
    }[String(v)] || String(v)),
  },
  metro_tier: {
    prefix: "in",
    render: (v) => ({
      "top_10": "the top-10 US metros", "top_25": "the top-25 US metros",
      "top_50": "the top-50 US metros", "other": "smaller markets",
    }[String(v)] || String(v)),
  },
  content_genre: { prefix: "with affinity for", render: (v) => String(v).replace(/_/g, "-") + " content" },
  streaming_affinity: { prefix: "with", render: (v) => String(v) + " streaming engagement" },
};

function buildExplainSentence(rules, data) {
  if (!rules || rules.length === 0) return "";
  const parts = [];
  for (const r of rules) {
    const phr = DIM_PHRASES[r.dimension];
    if (!phr) { parts.push(r.dimension + " " + r.operator + " " + r.value); continue; }
    parts.push(phr.prefix + " " + phr.render(Array.isArray(r.value) ? r.value[0] : r.value));
  }
  const size = (data.estimated_audience_size || 0).toLocaleString();
  const coverage = (data.coverage_percentage || 0).toFixed(data.coverage_percentage < 1 ? 2 : 1);
  return parts.join(", ") + " — about " + size + " adults (" + coverage + "% of US adult baseline).";
}

async function renderFunnelCumulative() {
  const host = document.getElementById("funnel-chart");
  const rules = state.builder.rules;
  if (rules.length === 0) {
    host.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-desc">Add a rule to see the funnel.</div></div>';
    return;
  }

  // Call /signals/estimate cumulatively for each prefix of rules so we
  // can show size-after-rule-N. Sequential to keep things simple — at
  // ≤6 rules this is 6 network calls, bounded and fast.
  const steps = [];
  for (let i = 1; i <= rules.length; i++) {
    try {
      const res = await fetch("/signals/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: rules.slice(0, i) }),
      });
      const data = await res.json();
      if (!data.error) steps.push({ rule: rules[i - 1], size: data.estimated_audience_size });
      else return; // Bail on validation error — runEstimate already displayed it
    } catch { return; }
  }
  renderFunnel(steps);
  // Sec-31u: pulse the funnel container to signal a fresh recompute
  // after rule changes. Subtle but communicates "this is live data".
  if (typeof glowOnce === "function") glowOnce(host);
}

function renderFunnel(steps) {
  const host = document.getElementById("funnel-chart");
  if (steps.length === 0) {
    host.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-desc">Add a rule to see the funnel.</div></div>';
    return;
  }
  const maxSize = steps[0].size;
  host.innerHTML = steps.map((step, i) => {
    const pct = (step.size / maxSize) * 100;
    const retained = i === 0 ? 100 : (step.size / steps[i - 1].size) * 100;
    const label = step.rule.dimension + " " + step.rule.operator + " " + step.rule.value;
    return '' +
      '<div class="funnel-step">' +
        '<div>' +
          '<div class="funnel-step-label">' + escapeHtml(label) + '</div>' +
          '<div class="funnel-step-bar"><div class="funnel-step-fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
        '</div>' +
        '<div class="funnel-step-meta">' + fmtNumber(step.size) + '<br/><span style="opacity:0.6">' + retained.toFixed(0) + '% of prior</span></div>' +
      '</div>';
  }).join("");
}

document.getElementById("generate-btn").addEventListener("click", generateSegment);

async function generateSegment() {
  const btn = document.getElementById("generate-btn");
  const note = document.getElementById("generate-note");
  if (state.builder.rules.length === 0) {
    note.className = "builder-note error";
    note.textContent = "Add at least one rule before generating.";
    return;
  }
  btn.disabled = true;
  note.className = "builder-note";
  note.innerHTML = '<span class="spinner"></span>generating segment…';

  try {
    const name = document.getElementById("builder-name").value.trim();
    const res = await fetch("/signals/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + DEMO_KEY,
      },
      body: JSON.stringify({ rules: state.builder.rules, ...(name ? { name } : {}) }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || ("HTTP " + res.status));
    }
    note.className = "builder-note success";
    const sid = data.signal_agent_segment_id || data.signalId || "";
    note.innerHTML = '✓ Segment created · <span class="mono">' + escapeHtml(sid) + '</span>';
    state.builder.generatedSegment = data;
    // Refresh catalog in the background so the new segment shows up
    state.catalog.all = []; state.treemap.rendered = false;
    showToast("Segment generated. Switch to Catalog to see it.");
  } catch (e) {
    note.className = "builder-note error";
    note.textContent = "Generation failed: " + e.message;
  } finally {
    btn.disabled = false;
  }
}

//────────────────────────────────────────────────────────────────────────
// §5b Overlap — pick 2-6 signals, compute Jaccard via /signals/overlap
//────────────────────────────────────────────────────────────────────────
async function ensureOverlap() {
  if (state.catalog.all.length === 0) await loadCatalog();
  renderOverlapChips();
  renderOverlapSuggestions("");
}

//────────────────────────────────────────────────────────────────────────
// Sec-38 B5 — Embedding tab: 2D scatter + similarity heatmap + cross-tax Sankey
//────────────────────────────────────────────────────────────────────────
var _embeddingLoaded = false;
async function ensureEmbedding() {
  if (_embeddingLoaded) return;
  _embeddingLoaded = true;
  renderEmbeddingScatter();
  renderEmbeddingHeatmap();
  renderEmbeddingSankey();
}
document.getElementById("emb-refresh").addEventListener("click", function () {
  _embeddingLoaded = false;
  ensureEmbedding();
});

async function renderEmbeddingScatter() {
  var host = document.getElementById("emb-scatter");
  var legend = document.getElementById("emb-legend");
  try {
    var r = await fetch("/ucp/projection");
    var data = await r.json();
    var points = data.points || [];
    if (!points.length) { host.innerHTML = '<div class="empty-state"><div class="empty-title">No embeddings</div></div>'; return; }
    var xs = points.map(function (p) { return p.x; });
    var ys = points.map(function (p) { return p.y; });
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    var yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
    var pad = 0.1;
    var W = 640, H = 380;
    function sx(x) { return 40 + ((x - xMin) / (xMax - xMin + 1e-9)) * (W - 80); }
    function sy(y) { return H - 30 - ((y - yMin) / (yMax - yMin + 1e-9)) * (H - 60); }
    var colorMap = {
      demographic:     "#4f8eff",
      interest:        "#8b6eff",
      purchase_intent: "#ff7a5c",
      geo:             "#2bd4a0",
      composite:       "#ffcb5c",
    };
    var svgDots = points.map(function (p, idx) {
      var color = colorMap[p.category] || "#8892a6";
      // Stagger dot entry so the scatter "blooms" on initial render.
      // data-emb-idx wires the click handler installed below.
      return '<circle class="emb-dot ux-stagger-row" data-emb-idx="' + idx + '" style="--ux-stagger-i:' + Math.min(idx, 28) + '" cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="5" ' +
        'fill="' + color + '" fill-opacity="0.85" stroke="rgba(255,255,255,0.2)" stroke-width="0.8">' +
        '<title>' + escapeHtml(p.name) + ' (' + escapeHtml(p.category) + ')&#10;' + escapeHtml(p.description) + '</title>' +
      '</circle>';
    }).join("");
    var svgLabels = points.map(function (p) {
      var shortName = p.name.length > 22 ? p.name.slice(0, 20) + "…" : p.name;
      return '<text x="' + (sx(p.x) + 8).toFixed(1) + '" y="' + (sy(p.y) + 4).toFixed(1) + '" ' +
        'fill="var(--text-mut)" font-size="10" font-family="ui-sans-serif" paint-order="stroke fill" ' +
        'stroke="var(--bg-surface)" stroke-width="2.5">' + escapeHtml(shortName) + '</text>';
    }).join("");
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
      '<line x1="40" y1="' + (H - 30) + '" x2="' + (W - 40) + '" y2="' + (H - 30) + '" stroke="var(--border)" stroke-width="1"/>' +
      '<line x1="40" y1="20" x2="40" y2="' + (H - 30) + '" stroke="var(--border)" stroke-width="1"/>' +
      '<text x="' + (W - 40) + '" y="' + (H - 10) + '" text-anchor="end" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">UCP₁ (random projection)</text>' +
      '<text x="8" y="18" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">UCP₂</text>' +
      svgDots + svgLabels +
    '</svg>';
    // Sec-31u: interactive scatter — click dot to highlight + draw
    // dashed edges to its 5 nearest 2D neighbors. Click again or
    // outside to clear. State lives on the SVG element via data-attrs
    // so it survives re-renders.
    var svgEl = host.querySelector("svg");
    if (svgEl) {
      svgEl.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || !t.classList) return;
        // Click on background → clear
        if (t.tagName === "svg" || t.tagName === "SVG") {
          host.querySelectorAll(".emb-dot.is-anchor, .emb-dot.is-near, .emb-dot.is-dim").forEach(function (e) {
            e.classList.remove("is-anchor", "is-near", "is-dim");
          });
          host.querySelectorAll(".emb-edge").forEach(function (e) { e.parentNode.removeChild(e); });
          return;
        }
        if (!t.classList.contains("emb-dot")) return;
        var idx = parseInt(t.getAttribute("data-emb-idx"), 10);
        if (isNaN(idx)) return;
        // Compute 5 nearest in 2D
        var anchor = points[idx];
        var dists = [];
        for (var i = 0; i < points.length; i++) {
          if (i === idx) continue;
          var dx = points[i].x - anchor.x, dy = points[i].y - anchor.y;
          dists.push({ idx: i, d: Math.sqrt(dx * dx + dy * dy) });
        }
        dists.sort(function (a, b) { return a.d - b.d; });
        var near = {};
        for (var k = 0; k < 5 && k < dists.length; k++) near[dists[k].idx] = true;
        // Apply visual state to dots
        host.querySelectorAll(".emb-dot").forEach(function (d) {
          var di = parseInt(d.getAttribute("data-emb-idx"), 10);
          d.classList.remove("is-anchor", "is-near", "is-dim");
          if (di === idx) d.classList.add("is-anchor");
          else if (near[di]) d.classList.add("is-near");
          else d.classList.add("is-dim");
        });
        // Remove old edges, draw new
        host.querySelectorAll(".emb-edge").forEach(function (e) { e.parentNode.removeChild(e); });
        var ax = sx(anchor.x).toFixed(1), ay = sy(anchor.y).toFixed(1);
        for (var n = 0; n < 5 && n < dists.length; n++) {
          var p2 = points[dists[n].idx];
          var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("class", "emb-edge ux-stagger-row");
          line.setAttribute("x1", ax); line.setAttribute("y1", ay);
          line.setAttribute("x2", sx(p2.x).toFixed(1));
          line.setAttribute("y2", sy(p2.y).toFixed(1));
          line.setAttribute("stroke", "var(--accent)");
          line.setAttribute("stroke-width", "1.4");
          line.setAttribute("stroke-dasharray", "3,3");
          line.setAttribute("opacity", "0.6");
          line.style.setProperty("--ux-stagger-i", String(n));
          // Insert edges UNDER the dots so clicks still hit dots first
          svgEl.insertBefore(line, svgEl.firstChild.nextSibling);
        }
      });
    }
    var cats = Object.keys(colorMap);
    legend.innerHTML = cats.map(function (c) {
      return '<span class="emb-legend-item"><span class="emb-legend-dot" style="background:' + colorMap[c] + '"></span>' + escapeHtml(c) + '</span>';
    }).join("");
    var expl = document.getElementById("emb-scatter-explainer");
    if (expl) expl.innerHTML = renderChartExplainer({
      what: "A 2D map of the UCP semantic space. Each dot is one audience in this agent; distance roughly means semantic similarity.",
      how: "Every audience is a 512-dim vector from OpenAI text-embedding-3-small. We project to 2D with Johnson\u2013Lindenstrauss random projection \u2014 fast, fully deterministic, preserves relative distances approximately (not as tight as PCA but needs no SVD).",
      read: "Dots close together = semantically similar audiences. Dots in the same color cluster = same category type. Hover any dot for its full description.",
      limits: "JL axes are not interpretable on their own \u2014 UCP\u2081 / UCP\u2082 are arbitrary projection axes, not principal components.",
    });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">Could not load projection</div><div class="empty-desc">' + escapeHtml(String(e)) + '</div></div>';
  }
}

async function renderEmbeddingHeatmap() {
  var host = document.getElementById("emb-heatmap");
  try {
    var r = await fetch("/ucp/similarity?n=20");
    var data = await r.json();
    var n = data.n;
    var matrix = data.matrix || [];
    var names = data.signal_names || [];
    var cell = 18;
    var margin = 140;
    var W = margin + n * cell + 20;
    var H = margin + n * cell + 20;
    function colorFor(v) {
      // v in [-1, 1]. Diagonal = 1 (self). Map to a cool-warm scale.
      var t = (v + 1) / 2; // 0..1
      // lerp between dark blue and warm orange through white
      if (t > 0.5) {
        var f = (t - 0.5) * 2;
        var rr = Math.round(255 * f + 60 * (1 - f));
        var gg = Math.round(128 * f + 100 * (1 - f));
        var bb = Math.round(90 * f + 200 * (1 - f));
        return "rgb(" + rr + "," + gg + "," + bb + ")";
      } else {
        var f2 = t * 2;
        var rr2 = Math.round(60 * f2 + 22 * (1 - f2));
        var gg2 = Math.round(100 * f2 + 52 * (1 - f2));
        var bb2 = Math.round(200 * f2 + 120 * (1 - f2));
        return "rgb(" + rr2 + "," + gg2 + "," + bb2 + ")";
      }
    }
    var svgCells = "";
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var v = matrix[i * n + j];
        svgCells += '<rect x="' + (margin + j * cell) + '" y="' + (margin + i * cell) + '" width="' + cell + '" height="' + cell + '" ' +
          'fill="' + colorFor(v) + '" stroke="var(--bg-surface)" stroke-width="0.4">' +
          '<title>' + escapeHtml(names[i] || "") + ' × ' + escapeHtml(names[j] || "") + ': cos=' + v.toFixed(3) + '</title>' +
        '</rect>';
      }
    }
    var svgRowLabels = names.map(function (nm, i) {
      var shortName = nm.length > 22 ? nm.slice(0, 20) + "…" : nm;
      return '<text x="' + (margin - 6) + '" y="' + (margin + i * cell + cell / 2 + 3) + '" text-anchor="end" fill="var(--text-mut)" font-size="9.5" font-family="ui-monospace">' + escapeHtml(shortName) + '</text>';
    }).join("");
    var svgColLabels = names.map(function (nm, j) {
      var shortName = nm.length > 22 ? nm.slice(0, 20) + "…" : nm;
      return '<text transform="rotate(-55 ' + (margin + j * cell + cell / 2) + ' ' + (margin - 6) + ')" x="' + (margin + j * cell + cell / 2) + '" y="' + (margin - 6) + '" text-anchor="start" fill="var(--text-mut)" font-size="9.5" font-family="ui-monospace">' + escapeHtml(shortName) + '</text>';
    }).join("");
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMinYMin meet">' +
      svgCells + svgRowLabels + svgColLabels +
    '</svg>' +
    // Visible color scale with labeled endpoints
    '<div class="emb-heatmap-scale">' +
      '<span class="ehs-label">cos = \u22121<br><span class="ehs-sub">opposite meaning</span></span>' +
      '<div class="ehs-gradient"></div>' +
      '<span class="ehs-label" style="text-align:center">0<br><span class="ehs-sub">unrelated</span></span>' +
      '<div class="ehs-gradient ehs-gradient-r"></div>' +
      '<span class="ehs-label" style="text-align:right">+1<br><span class="ehs-sub">identical</span></span>' +
    '</div>';
    var expl2 = document.getElementById("emb-heatmap-explainer");
    if (expl2) expl2.innerHTML = renderChartExplainer({
      what: "How semantically close every audience is to every other one, shown as a 20\u00d720 grid of cosine similarity scores.",
      how: "Cosine similarity between each pair of 512-d embedding vectors. Bright orange = very similar, deep blue = very different. The diagonal is always +1 (every audience matches itself).",
      read: "Bright blocks along the diagonal = clusters of similar audiences. A bright off-diagonal cell means you might be duplicating reach if you activate both.",
      limits: "Shows only the first 20 embedded signals for readability. Use /ucp/similarity?n=N for larger matrices.",
    });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">Could not load heatmap</div></div>';
  }
}

async function renderEmbeddingSankey() {
  // Uses x_cross_taxonomy from the live catalog. Visualizes the bridge
  // IAB 1.1 → IAB 3.0 → {LR, TTD, MC, Nielsen} as left-to-right flows
  // aggregated by unique iab_3_0 topic. No external libs — pure SVG.
  var host = document.getElementById("emb-sankey");
  try {
    if (state.catalog.all.length === 0) await loadCatalog();
    var signals = state.catalog.all.slice(0, 50); // limit for readability
    // Build flows: left=categoryType, mid=iab_content_3_0 label, right=system
    var midCounts = {};    // iab30 label -> count
    var rightFromMid = {}; // mid -> { system -> count }
    signals.forEach(function (s) {
      var tx = s.x_cross_taxonomy || [];
      var iab30 = tx.find(function (e) { return e.system === "iab_content_3_0"; });
      if (!iab30) return;
      var midLabel = iab30.label;
      midCounts[midLabel] = (midCounts[midLabel] || 0) + 1;
      if (!rightFromMid[midLabel]) rightFromMid[midLabel] = {};
      tx.forEach(function (e) {
        if (e.system === "iab_content_3_0" || e.system === "iab_audience_1_1") return;
        rightFromMid[midLabel][e.system] = (rightFromMid[midLabel][e.system] || 0) + 1;
      });
    });
    var mids = Object.keys(midCounts).sort(function (a, b) { return midCounts[b] - midCounts[a]; }).slice(0, 8);
    var rightSystems = ["liveramp_abilitec", "ttd_dmp", "nielsen_category", "mastercard_spendingpulse"];
    var W = 960, H = 420;
    var leftX = 40, midX = 360, rightX = 760;
    var nodeW = 18;
    var midSpace = (H - 40) / (mids.length || 1);
    var rightSpace = (H - 40) / rightSystems.length;
    // Nodes
    var nodes = "";
    mids.forEach(function (m, i) {
      var y = 20 + i * midSpace;
      var size = Math.max(16, Math.min(midSpace - 8, midCounts[m] * 6));
      nodes += '<rect x="' + midX + '" y="' + y + '" width="' + nodeW + '" height="' + size + '" fill="var(--accent)" fill-opacity="0.7"/>' +
        '<text x="' + (midX + nodeW + 8) + '" y="' + (y + size / 2 + 4) + '" fill="var(--text)" font-size="11" font-family="ui-sans-serif">' + escapeHtml(m) + ' · ' + midCounts[m] + '</text>';
    });
    rightSystems.forEach(function (sys, i) {
      var y = 20 + i * rightSpace;
      var size = Math.max(20, rightSpace - 20);
      var totalForSys = 0;
      mids.forEach(function (m) { totalForSys += (rightFromMid[m] && rightFromMid[m][sys]) || 0; });
      nodes += '<rect x="' + rightX + '" y="' + y + '" width="' + nodeW + '" height="' + size + '" fill="#8b6eff" fill-opacity="0.7"/>' +
        '<text x="' + (rightX + nodeW + 8) + '" y="' + (y + size / 2 + 4) + '" fill="var(--text)" font-size="11" font-family="ui-sans-serif">' + escapeHtml(sys) + ' · ' + totalForSys + '</text>';
    });
    // Left-column anchor
    nodes += '<rect x="' + leftX + '" y="20" width="' + nodeW + '" height="' + (H - 40) + '" fill="#2bd4a0" fill-opacity="0.5"/>' +
      '<text x="' + (leftX + nodeW + 8) + '" y="40" fill="var(--text)" font-size="11" font-family="ui-sans-serif">IAB Audience 1.1</text>' +
      '<text x="' + (leftX + nodeW + 8) + '" y="56" fill="var(--text-mut)" font-size="10" font-family="ui-monospace">' + signals.length + ' signals</text>';
    // Flows: left → mid (all one color), mid → right (colored per mid)
    var flows = "";
    mids.forEach(function (m, mi) {
      var yMid = 20 + mi * midSpace + Math.min(midSpace - 8, midCounts[m] * 6) / 2;
      // left→mid
      var yLeft = 20 + (H - 40) / 2 + (mi - mids.length / 2) * 10;
      var cx1 = leftX + nodeW + (midX - leftX - nodeW) / 2;
      flows += '<path d="M' + (leftX + nodeW) + ',' + yLeft + ' C' + cx1 + ',' + yLeft + ' ' + cx1 + ',' + yMid + ' ' + midX + ',' + yMid + '" ' +
        'fill="none" stroke="#2bd4a0" stroke-opacity="0.3" stroke-width="' + Math.max(1, midCounts[m] * 1.5) + '"/>';
      // mid→right(s)
      var rfm = rightFromMid[m] || {};
      rightSystems.forEach(function (sys, ri) {
        var count = rfm[sys] || 0;
        if (!count) return;
        var yRight = 20 + ri * rightSpace + rightSpace / 2;
        var cx2 = midX + nodeW + (rightX - midX - nodeW) / 2;
        flows += '<path d="M' + (midX + nodeW) + ',' + yMid + ' C' + cx2 + ',' + yMid + ' ' + cx2 + ',' + yRight + ' ' + rightX + ',' + yRight + '" ' +
          'fill="none" stroke="#8b6eff" stroke-opacity="0.25" stroke-width="' + Math.max(1, count * 1.2) + '"/>';
      });
    });
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
      flows + nodes +
    '</svg>' +
    '<div style="font-size:10.5px;color:var(--text-mut);margin-top:8px">Left column: native IAB Audience 1.1 catalog. Middle: mapped IAB Content 3.0 topics. Right: buyer-side DMP / onboarder / measurement systems. Widths \u221d signal count. Stage flags (live/modeled/roadmap) surfaced in signal detail panel.</div>';
    var expl3 = document.getElementById("emb-sankey-explainer");
    if (expl3) expl3.innerHTML = renderChartExplainer({
      what: "How this agent\u2019s audiences map into the buyer-side taxonomies a HoldCo planner already uses.",
      how: "Three columns: our native IAB Audience 1.1 catalog (green) \u2192 derived IAB Content 3.0 topics (blue) \u2192 buyer systems (purple: LiveRamp, TTD, Nielsen, Mastercard). Ribbon width \u221d number of signals that flow through that path.",
      read: "Thick ribbons hitting a buyer system = that system already has direct coverage of this audience class. Thin / missing ribbons = integration gaps to prioritize.",
      limits: "Stage flags (live/modeled/roadmap) live on individual signal cards \u2014 this view shows volume, not confidence.",
    });
  } catch (e) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">Could not load bridge</div></div>';
  }
}

document.getElementById("overlap-search-input").addEventListener("input", (e) => {
  state.overlap.searchQ = e.target.value.toLowerCase();
  renderOverlapSuggestions(state.overlap.searchQ);
});
document.getElementById("overlap-run").addEventListener("click", runOverlap);

`;
