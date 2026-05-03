// src/demo/script/fragments/snapshots.ts
//
// Snapshots tab: list render, diff toggle, diff render.
//
// Source range (in pre-refactor src/demo/script.ts): lines 6462..6632 (171 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const snapshotsJs = `function _renderSnapList() {
  var host = document.getElementById("snap-list");
  if (!host) return;
  if (state.snapshots.list.length === 0) {
    host.innerHTML = '<div class="empty-state"><div class="empty-title">No snapshots yet</div><div class="empty-desc">Compose a set in the <strong>Composer</strong> tab, come back here, and hit <strong>Save snapshot</strong>.</div></div>';
    return;
  }
  var selected = new Set(state.snapshots.diffPair);
  host.innerHTML = '<div class="snap-rows">' + state.snapshots.list.map(function (e) {
    var picked = selected.has(e.id);
    var tags = (e.tags || []).map(function (t) { return '<span class="pill pill-muted mono" style="font-size:10px;margin-right:3px">' + escapeHtml(t) + '</span>'; }).join("");
    var when = new Date(e.saved_at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return '<div class="snap-row' + (picked ? ' snap-row-picked' : '') + '" data-id="' + escapeHtml(e.id) + '">' +
      '<div class="snap-row-main">' +
        '<div class="snap-row-name">' + escapeHtml(e.name) + '</div>' +
        '<div class="snap-row-meta mono">' + escapeHtml(when) + ' · reach ' + fmtNumber(e.reach_at_save || 0) + '</div>' +
        (tags ? '<div style="margin-top:4px">' + tags + '</div>' : '') +
      '</div>' +
      '<div class="snap-row-actions">' +
        '<button class="btn-secondary snap-diff-btn" data-id="' + escapeHtml(e.id) + '">' + (picked ? '✓ for diff' : 'mark diff') + '</button>' +
        '<button class="btn-secondary snap-del-btn" data-id="' + escapeHtml(e.id) + '" title="Delete"><svg class="ico"><use href="#icon-close"/></svg></button>' +
      '</div>' +
    '</div>';
  }).join("") + '</div>';
  host.querySelectorAll(".snap-diff-btn").forEach(function (b) {
    b.addEventListener("click", function () { toggleSnapDiff(b.dataset.id); });
  });
  host.querySelectorAll(".snap-del-btn").forEach(function (b) {
    b.addEventListener("click", function () { deleteSnapshot(b.dataset.id); });
  });
}

async function saveSnapshot() {
  var nameEl = document.getElementById("snap-name");
  var noteEl = document.getElementById("snap-note");
  var tagsEl = document.getElementById("snap-tags");
  var name = (nameEl.value || "").trim();
  if (!name) { showToast("Name required.", true); return; }
  if (state.composer.inc.length === 0 && state.composer.itx.length === 0) {
    showToast("Compose an audience first (at least one include or intersect signal).", true);
    return;
  }
  var composition = {
    include:   state.composer.inc.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean),
    intersect: state.composer.itx.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean),
    exclude:   state.composer.exc.map(function (s) { return s.signal_agent_segment_id || (s.signal_id && s.signal_id.id); }).filter(Boolean),
  };
  var seedEl = document.getElementById("comp-lal-seed");
  var kEl = document.getElementById("comp-lal-k");
  var minEl = document.getElementById("comp-lal-min");
  if (seedEl && seedEl.value) {
    composition.lookalike = { seed_signal_id: seedEl.value, k: Number(kEl && kEl.value) || 8, min_cosine: Number(minEl && minEl.value) || 0 };
  }
  var reachAtSave = state.composer.lastCompose && state.composer.lastCompose.reach && state.composer.lastCompose.reach.final || 0;
  var tags = (tagsEl.value || "").split(",").map(function (t) { return t.trim(); }).filter(Boolean);
  var body = { name: name, note: noteEl.value || "", tags: tags, composition: composition, reach_at_save: reachAtSave };
  try {
    var r = await fetch("/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
      body: JSON.stringify(body),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    showToast("Saved snapshot “" + name + "”");
    nameEl.value = ""; noteEl.value = ""; tagsEl.value = "";
    await loadSnapshots();
  } catch (e) {
    showToast(e.message, true);
  }
}

async function deleteSnapshot(id) {
  try {
    var r = await fetch("/snapshots/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: { "Authorization": "Bearer " + DEMO_KEY },
    });
    if (!r.ok) { var data = await r.json(); throw new Error(data.error || "HTTP " + r.status); }
    state.snapshots.diffPair = state.snapshots.diffPair.filter(function (x) { return x !== id; });
    await loadSnapshots();
  } catch (e) {
    showToast(e.message, true);
  }
}

function toggleSnapDiff(id) {
  var pair = state.snapshots.diffPair.slice();
  var idx = pair.indexOf(id);
  if (idx >= 0) pair.splice(idx, 1);
  else {
    if (pair.length >= 2) pair.shift();
    pair.push(id);
  }
  state.snapshots.diffPair = pair;
  _renderSnapList();
  if (pair.length === 2) runSnapDiff();
}

async function runSnapDiff() {
  var host = document.getElementById("snap-diff");
  var pair = state.snapshots.diffPair;
  if (pair.length !== 2) return;
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Diffing…</div></div>';
  try {
    var r = await fetch("/snapshots/diff", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
      body: JSON.stringify({ a: pair[0], b: pair[1] }),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    _renderSnapDiff(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function _renderSnapDiff(data) {
  var host = document.getElementById("snap-diff");
  function facetBlock(label, d) {
    var add = (d.added || []).length, rem = (d.removed || []).length, kept = (d.kept || []).length;
    return '<div class="snap-diff-facet">' +
      '<div class="snap-diff-facet-head">' + escapeHtml(label) +
        ' <span class="mono" style="color:var(--text-mut);font-weight:400;margin-left:6px">+' + add + ' · −' + rem + ' · =' + kept + '</span>' +
      '</div>' +
      (add > 0 ? '<div class="snap-diff-line snap-add">+ ' + d.added.map(escapeHtml).join(", ") + '</div>' : '') +
      (rem > 0 ? '<div class="snap-diff-line snap-rem">− ' + d.removed.map(escapeHtml).join(", ") + '</div>' : '') +
    '</div>';
  }
  var dr = data.delta_reach || 0;
  var header =
    '<div class="snap-diff-header">' +
      '<div><div class="k">A</div><div class="v">' + escapeHtml(data.a.name) + '</div><div class="sub mono">' + fmtNumber(data.a.reach_at_save) + '</div></div>' +
      '<div><div class="k">B</div><div class="v">' + escapeHtml(data.b.name) + '</div><div class="sub mono">' + fmtNumber(data.b.reach_at_save) + '</div></div>' +
      '<div><div class="k">Δ reach</div><div class="v mono" style="color:' + (dr >= 0 ? 'var(--success)' : 'var(--error)') + '">' + (dr >= 0 ? '+' : '') + fmtNumber(dr) + '</div></div>' +
      (data.lookalike_changed ? '<div><div class="k">Lookalike</div><div class="v pill pill-warning">changed</div></div>' : '') +
    '</div>';
  host.innerHTML = header +
    facetBlock("Include", data.include || {}) +
    facetBlock("Intersect", data.intersect || {}) +
    facetBlock("Exclude", data.exclude || {});
}

// ─────────────────────────────────────────────────────────────────────────
// Sec-45: Signal Freshness — per-signal x_analytics facets (half-life,
// volatility, authority, stability). All data comes from the already-
// loaded catalog — no new endpoint needed.
// ─────────────────────────────────────────────────────────────────────────
var _freshnessLoaded = false;

async function ensureFreshness() {
  if (_freshnessLoaded) return;
  _freshnessLoaded = true;
  if (state.catalog.all.length === 0) await loadCatalog();
  state.freshness.rows = _freshnessExtractRows();
  document.querySelectorAll("#fresh-table th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var col = th.dataset.sort;
      if (state.freshness.sortCol === col) {
        state.freshness.sortDir = state.freshness.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.freshness.sortCol = col;
        state.freshness.sortDir = (col === "name" || col === "vertical" || col === "stability") ? "asc" : "desc";
      }
      _freshnessRender();
    });
  });
  _freshnessRender();
}

`;
