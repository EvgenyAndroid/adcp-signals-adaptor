// src/demo/script/fragments/overlap.ts
//
// Overlap analysis: chips, suggestions, result rendering.
//
// Source range (in pre-refactor src/demo/script.ts): lines 3364..3559 (196 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const overlapJs = `function renderOverlapChips() {
  const host = document.getElementById("overlap-chips");
  const count = state.overlap.selected.length;
  document.getElementById("overlap-count").textContent = count + " / 6";
  document.getElementById("overlap-run").disabled = count < 2;
  if (count === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11.5px;padding:8px 0;font-style:italic">No signals selected yet.</div>';
    return;
  }
  host.innerHTML = state.overlap.selected.map((s, i) => {
    const sid = s.signal_agent_segment_id || s.signal_id?.id || "";
    return '<div class="overlap-chip" data-sid="' + escapeHtml(sid) + '">' +
      '<div><div class="oc-name">' + escapeHtml(s.name) + '</div><div style="font-size:10.5px;color:var(--text-mut);font-family:var(--font-mono)">' + fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "—") + '</div></div>' +
      '<button class="oc-remove" data-idx="' + i + '"><svg class="ico"><use href="#icon-close"/></svg></button>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".oc-remove").forEach((b) => {
    b.addEventListener("click", () => {
      state.overlap.selected.splice(Number(b.dataset.idx), 1);
      renderOverlapChips();
      renderOverlapSuggestions(state.overlap.searchQ);
    });
  });
}

function renderOverlapSuggestions(q) {
  const host = document.getElementById("overlap-suggestions");
  if (state.overlap.selected.length >= 6) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:6px 0">Max 6 signals. Remove one to add another.</div>';
    return;
  }
  const selectedIds = new Set(state.overlap.selected.map((s) => s.signal_agent_segment_id || s.signal_id?.id));
  let rows = state.catalog.all;
  if (q) rows = rows.filter((s) => (s.name || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q));
  rows = rows.filter((s) => !selectedIds.has(s.signal_agent_segment_id || s.signal_id?.id)).slice(0, 12);
  if (rows.length === 0) {
    host.innerHTML = '<div style="color:var(--text-mut);font-size:11.5px;padding:6px 0">No catalog matches.</div>';
    return;
  }
  host.innerHTML = rows.map((s) => {
    const sid = s.signal_agent_segment_id || s.signal_id?.id || "";
    return '<div class="overlap-suggestion" data-sid="' + escapeHtml(sid) + '">' +
      '<div>' + escapeHtml(s.name) + '</div>' +
      '<div class="sub">' + fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "—") + ' · ' + escapeHtml(verticalOf(s)) + '</div>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".overlap-suggestion").forEach((el) => {
    el.addEventListener("click", () => {
      const sid = el.dataset.sid;
      const sig = state.catalog.all.find((x) => (x.signal_agent_segment_id || x.signal_id?.id) === sid);
      if (sig && state.overlap.selected.length < 6) {
        state.overlap.selected.push(sig);
        renderOverlapChips();
        renderOverlapSuggestions(state.overlap.searchQ);
      }
    });
  });
}

async function runOverlap() {
  const host = document.getElementById("overlap-results");
  if (state.overlap.selected.length < 2) return;
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Computing pairwise + subset overlaps…</div></div>';
  const ids = state.overlap.selected.map((s) => s.signal_agent_segment_id || s.signal_id?.id);
  try {
    const res = await fetch("/signals/overlap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal_ids: ids }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "HTTP " + res.status);
    state.overlap.lastResult = data;
    host.innerHTML = renderOverlapResult(data);
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function renderOverlapResult(data) {
  const sigs = data.signals || [];
  const pairs = data.pairwise || [];
  const upset = (data.upset || []).filter((u) => u.sets.length >= 2).sort((a, b) => b.estimate - a.estimate).slice(0, 20);

  // Build index by id for matrix rendering
  const byId = new Map();
  for (const s of sigs) byId.set(s.signal_agent_segment_id, s);

  // Heat-matrix
  let matrix = '<div style="font-size:11px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Pairwise Jaccard (approximated)</div>';
  matrix += '<div style="overflow:auto;margin-bottom:24px"><table class="overlap-matrix"><thead><tr><th></th>';
  for (const s of sigs) matrix += '<th title="' + escapeHtml(s.name) + '">' + escapeHtml(truncate(s.name, 18)) + '</th>';
  matrix += '</tr></thead><tbody>';
  for (const a of sigs) {
    matrix += '<tr><th>' + escapeHtml(truncate(a.name, 20)) + '</th>';
    for (const b of sigs) {
      if (a.signal_agent_segment_id === b.signal_agent_segment_id) {
        matrix += '<td style="color:var(--text-mut)">1.000</td>';
      } else {
        const p = pairs.find((x) =>
          (x.a_id === a.signal_agent_segment_id && x.b_id === b.signal_agent_segment_id) ||
          (x.b_id === a.signal_agent_segment_id && x.a_id === b.signal_agent_segment_id)
        );
        const j = p ? p.jaccard : 0;
        const hue = 220 - (j * 160); // high Jaccard = red-ish, low = blue-ish
        const bg = "hsl(" + hue + " 60% " + (40 + j * 30) + "%)";
        matrix += '<td class="jcell" style="background:' + bg + '" title="J=' + j.toFixed(3) + ' · intersection=' + fmtNumber(p?.intersection || 0) + '">' + j.toFixed(3) + '</td>';
      }
    }
    matrix += '</tr>';
  }
  matrix += '</tbody></table></div>';

  // Pair list with affinity reasons
  let pairList = '<div style="font-size:11px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Pair breakdown</div>';
  pairList += pairs.map((p) => {
    const pct = (p.jaccard * 100).toFixed(1);
    return '<div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 12px;margin-bottom:6px">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:4px">' +
        '<div style="font-size:12.5px"><strong>' + escapeHtml(p.a_name) + '</strong> ∩ <strong>' + escapeHtml(p.b_name) + '</strong></div>' +
        '<div style="font-family:var(--font-mono);font-weight:600;color:var(--accent-hot)">J ' + p.jaccard.toFixed(3) + '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-mut);font-family:var(--font-mono)">' +
        'intersection ~' + fmtNumber(p.intersection) + ' · union ~' + fmtNumber(p.union) + ' · affinity ' + p.category_affinity.toFixed(2) + ' (' + escapeHtml(p.affinity_reason) + ')' +
      '</div>' +
    '</div>';
  }).join("");

  // UpSet-style bar rows (for 3+)
  let upsetBlock = "";
  if (upset.length > 0 && sigs.length >= 3) {
    const maxEst = Math.max(...upset.map((u) => u.estimate));
    upsetBlock = '<div style="font-size:11px;color:var(--text-mut);text-transform:uppercase;letter-spacing:0.08em;margin:24px 0 10px">UpSet — subset estimates (top ' + upset.length + ')</div>';
    upsetBlock += upset.map((u) => {
      const pct = maxEst > 0 ? (u.estimate / maxEst) * 100 : 0;
      return '<div class="upset-row">' +
        '<div class="upset-sets">' + u.names.map((n) => '<span>' + escapeHtml(truncate(n, 28)) + "</span>").join(" <span style='color:var(--text-mut)'>&cap;</span> ") + "</div>" +
        '<div class="upset-bar"><div class="upset-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="upset-val">' + fmtNumber(u.estimate) + '</div>' +
      '</div>';
    }).join("");
  }

  const methodologyNote = '<div style="margin-top:24px;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:11px;color:var(--text-mut);font-family:var(--font-mono)">' +
    '<strong style="color:var(--text-dim)">Methodology</strong> · ' + escapeHtml(data.note || "") +
    '</div>';

  const explainer = renderChartExplainer({
    what: "How much two audiences overlap \u2014 as a heat matrix (pairwise) and as UpSet bars (subset sizes when you pick 3+).",
    how: "Jaccard similarity \u2248 category-affinity \u00d7 min(size)/max(size). Same category + same vertical = 0.85, same category = 0.55, same vertical = 0.35, unrelated = 0.12. The real number needs cleanroom match-rates.",
    read: "Bright red cells = strong overlap (you\u2019d be re-buying the same people). Blue cells = distinct audiences safe to stack. UpSet bars rank the biggest shared slices across your whole selection.",
    limits: "Heuristic \u2014 not a true 1P overlap. For accurate numbers, push all selected signals into a cleanroom and compute member-level intersection.",
  });

  return matrix + pairList + upsetBlock + methodologyNote + explainer;
}

function truncate(s, n) {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

//────────────────────────────────────────────────────────────────────────
// §6a Capabilities — structured HTML + pretty-printed JSON
//────────────────────────────────────────────────────────────────────────
let _capsJsonCache = null;

async function loadCapabilities() {
  const host = document.getElementById("caps-html");
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Fetching /capabilities…</div></div>';
  try {
    const res = await fetch("/capabilities");
    const caps = await res.json();
    _capsJsonCache = caps;
    host.innerHTML = renderCapabilitiesHtml(caps);
    // Second async fetch — tools/list. Public (no auth). Mounts into the
    // placeholder left by renderCapabilitiesHtml so the main /capabilities
    // payload renders first and tool cards fill in.
    mountToolCatalog();
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

document.getElementById("caps-refresh").addEventListener("click", loadCapabilities);
document.getElementById("caps-copy").addEventListener("click", async () => {
  if (!_capsJsonCache) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(_capsJsonCache, null, 2));
    showToast("Capabilities JSON copied");
  } catch {
    showToast("Copy failed — select the JSON text manually", true);
  }
});

`;
