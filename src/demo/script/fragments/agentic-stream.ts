// src/demo/script/fragments/agentic-stream.ts
//
// Agentic chat streaming: skeleton/section state, stream event handler, brief/plan/compliance/memory render, exec append.
//
// Source range (in pre-refactor src/demo/script.ts): lines 11304..11738 (435 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const agenticStreamJs = `function _agenticShowSkeleton(stage, label) {
  var sec = document.getElementById("agentic-" + stage + "-section");
  var src = document.getElementById("agentic-" + stage + "-source");
  var body = document.getElementById("agentic-" + stage + "-body");
  if (!sec || !body) return;
  sec.style.display = "";
  sec.classList.add("agentic-section-pending");
  if (src) src.innerHTML = '<span class="agentic-pulse-dot"></span><span class="agentic-pulse-dot"></span><span class="agentic-pulse-dot"></span>';
  body.innerHTML =
    '<div class="agentic-skel-card">' +
      '<div class="agentic-skel-line agentic-skel-line-w70"></div>' +
      '<div class="agentic-skel-line agentic-skel-line-w50"></div>' +
      '<div class="agentic-skel-line agentic-skel-line-w90"></div>' +
    '</div>' +
    '<div class="agentic-section-label-floating orch-small">' + escapeHtml(label || "") + '</div>';
}

function _agenticMarkSectionDone(stage) {
  var sec = document.getElementById("agentic-" + stage + "-section");
  if (sec) {
    sec.classList.remove("agentic-section-pending");
    sec.classList.add("agentic-section-arrived");
    setTimeout(function () { if (sec) sec.classList.remove("agentic-section-arrived"); }, 1200);
  }
}

// ── Stream event router ──────────────────────────────────────────────
function _agenticHandleStreamEvent(ev) {
  if (!ev || !ev.event) return;
  if (ev.event === "session_start") {
    _agenticSetActiveStage("brief");
    return;
  }
  if (ev.event === "stage_start") {
    _agenticSetActiveStage(ev.stage);
    var src = document.getElementById("agentic-" + ev.stage + "-source");
    if (src && ev.label) {
      src.innerHTML = '<span class="agentic-pulse-dot"></span><span class="agentic-pulse-dot"></span><span class="agentic-pulse-dot"></span> <span class="orch-small" style="color:var(--text-mut)">' + escapeHtml(ev.label) + '</span>';
    }
    return;
  }
  if (ev.event === "reasoning" && ev.step) {
    _agenticTrace.push(ev.step);
    _agenticAppendTraceStep(ev.step);
    return;
  }
  if (ev.event === "stage_complete") {
    if (ev.stage === "brief") {
      // Wave 3 fix: stash the expanded brief so /agentic/refine has a
      // previous_brief to send. Without this, refine silently no-ops
      // on the early-return guard checking _agenticCurrent.expanded.
      _agenticCurrent.expanded = ev.payload;
      _agenticRenderBrief(ev.payload);
      _agenticMarkSectionDone("brief");
    } else if (ev.stage === "coverage") {
      // Coverage is informational; just narrated in trace.
    } else if (ev.stage === "plan") {
      _agenticCurrent.plan = ev.payload;
      _agenticRenderPlan(ev.payload);
      _agenticMarkSectionDone("plan");
    } else if (ev.stage === "governance") {
      _agenticRenderCompliance({ advisory: ev.payload.advisory, remediations: ev.payload.remediations });
      _agenticMarkSectionDone("compliance");
    } else if (ev.stage === "memory") {
      _agenticRenderMemory(ev.payload);
      _agenticMarkSectionDone("memory");
    }
    return;
  }
  if (ev.event === "trace") {
    _captureTrace(ev.trace);
    return;
  }
  if (ev.event === "session_complete") {
    _agenticSetActiveStage(null);
    return;
  }
  if (ev.event === "error") {
    showToast("agentic stream error: " + ev.error, true);
    return;
  }
}

// Visual cue for which stage is currently being worked on.
function _agenticSetActiveStage(stage) {
  document.querySelectorAll(".agentic-section").forEach(function (el) {
    el.classList.remove("agentic-section-active");
  });
  if (!stage) return;
  var sec = document.getElementById("agentic-" + stage + "-section");
  if (sec) sec.classList.add("agentic-section-active");
}

// Type-out animation: append one trace step with char-by-char reveal.
// Each new step appears with a blinking cursor that disappears when
// the next step starts (or when typing finishes for the last one).
var _agenticTypingIndex = 0;
function _agenticAppendTraceStep(step) {
  var pane = document.getElementById("agentic-trace");
  var counter = document.getElementById("agentic-trace-count");
  if (counter) counter.textContent = _agenticTrace.length + " step" + (_agenticTrace.length === 1 ? "" : "s");
  if (!pane) return;
  // Drop the placeholder line if this is the first step.
  if (_agenticTrace.length === 1 && pane.querySelector(".orch-small")) pane.innerHTML = "";
  // Stop any prior typing cursors.
  pane.querySelectorAll(".agentic-trace-cursor").forEach(function (c) { c.remove(); });
  var idx = _agenticTypingIndex++;
  var row = document.createElement("div");
  row.className = "agentic-trace-step agentic-trace-" + (step.kind || "info") + " agentic-trace-arriving";
  row.innerHTML =
    '<span class="agentic-trace-kind mono">' + escapeHtml((step.kind || "info").toUpperCase()) + '</span>' +
    '<span class="agentic-trace-msg" id="agentic-trace-msg-' + idx + '"></span>' +
    (step.latency_ms != null ? '<span class="agentic-trace-lat mono orch-small">' + step.latency_ms + 'ms</span>' : '');
  pane.appendChild(row);
  pane.scrollTop = pane.scrollHeight;
  // Animate text in.
  var msgEl = document.getElementById("agentic-trace-msg-" + idx);
  if (!msgEl) return;
  var fullText = step.message || "";
  // Add a blinking cursor while typing.
  var cursor = document.createElement("span");
  cursor.className = "agentic-trace-cursor";
  cursor.textContent = "▌";
  msgEl.appendChild(cursor);
  // Type at ~160 chars/sec — fast enough to keep up with rapid steps,
  // slow enough to feel like the agent is forming the sentence.
  var charsPerTick = Math.max(2, Math.ceil(fullText.length / 50));  // type in ~50 ticks
  var pos = 0;
  var typedNode = document.createTextNode("");
  msgEl.insertBefore(typedNode, cursor);
  var typer = setInterval(function () {
    pos = Math.min(fullText.length, pos + charsPerTick);
    typedNode.nodeValue = fullText.slice(0, pos);
    pane.scrollTop = pane.scrollHeight;
    if (pos >= fullText.length) {
      clearInterval(typer);
      setTimeout(function () { if (cursor && cursor.parentNode) cursor.remove(); }, 150);
    }
  }, 16);
  // Fade-arriving class away after the slide-in completes.
  setTimeout(function () { row.classList.remove("agentic-trace-arriving"); }, 300);
}

// Reset the trace pane back to its placeholder. Called at the start of
// a new submission. The streaming consumer then appends steps one at
// a time via _agenticAppendTraceStep.
function _agenticUpdateTrace() {
  var pane = document.getElementById("agentic-trace");
  var counter = document.getElementById("agentic-trace-count");
  if (counter) counter.textContent = _agenticTrace.length + " step" + (_agenticTrace.length === 1 ? "" : "s");
  if (!pane) return;
  if (_agenticTrace.length === 0) {
    pane.innerHTML = '<span class="orch-small" style="color:var(--text-mut)">decisions will narrate here as the agent works…</span>';
    _agenticTypingIndex = 0;
    return;
  }
}

function _agenticRenderBrief(b) {
  var sec = document.getElementById("agentic-brief-section");
  var src = document.getElementById("agentic-brief-source");
  var body = document.getElementById("agentic-brief-body");
  if (!sec || !body) return;
  sec.style.display = "";
  if (src) src.textContent = "source: " + (b.source === "live_llm" ? "Claude" : "template") + " · confidence " + Math.round((b.confidence || 0) * 100) + "%";
  var industries = (b.industries || []).map(function (i) { return '<span class="pill pill-muted mono" style="font-size:9.5px">' + escapeHtml(i) + '</span>'; }).join(" ");
  var aud = (b.audience_descriptors || []).map(function (a) { return '<span class="pill pill-muted mono" style="font-size:9.5px">' + escapeHtml(a) + '</span>'; }).join(" ");
  body.innerHTML =
    '<div class="agentic-brief-grid">' +
      '<div class="agentic-brief-cell"><div class="agentic-brief-label">Brand</div><div class="mono">' + escapeHtml(b.brand_name || "(unknown)") + (b.brand_domain ? ' <span class="orch-small" style="color:var(--text-mut)">' + escapeHtml(b.brand_domain) + '</span>' : '') + '</div></div>' +
      '<div class="agentic-brief-cell"><div class="agentic-brief-label">KPI</div><div class="mono">' + escapeHtml(b.kpi || "?") + ' @ ' + escapeHtml(String(b.kpi_target || "?")) + '</div></div>' +
      '<div class="agentic-brief-cell"><div class="agentic-brief-label">Budget</div><div class="mono">' + (b.budget_usd_estimate ? '$' + b.budget_usd_estimate.toLocaleString() : '—') + '</div></div>' +
      '<div class="agentic-brief-cell"><div class="agentic-brief-label">Geo</div><div class="mono">' + escapeHtml((b.geo || []).join(", ")) + '</div></div>' +
      '<div class="agentic-brief-cell"><div class="agentic-brief-label">Flight</div><div class="mono">' + (b.flight_days ? b.flight_days + " days" : "—") + '</div></div>' +
      '<div class="agentic-brief-cell"><div class="agentic-brief-label">Dayparting</div><div class="mono">' + escapeHtml(b.dayparting_hint || "—") + '</div></div>' +
      '<div class="agentic-brief-cell agentic-brief-cell-wide"><div class="agentic-brief-label">Industries</div><div>' + (industries || '<span class="orch-small">unclassified</span>') + '</div></div>' +
      '<div class="agentic-brief-cell agentic-brief-cell-wide"><div class="agentic-brief-label">Audience</div><div>' + (aud || '<span class="orch-small">none extracted</span>') + '</div></div>' +
    '</div>';
}

function _agenticRenderPlan(plan) {
  var sec = document.getElementById("agentic-plan-section");
  var src = document.getElementById("agentic-plan-source");
  var body = document.getElementById("agentic-plan-body");
  if (!sec || !body) return;
  sec.style.display = "";
  if (src) src.textContent = "source: " + (plan.source === "live_llm" ? "Claude" : "template") + " · " + plan.steps.length + " steps · est " + Math.round((plan.estimated_duration_ms || 0) / 1000) + "s";
  body.innerHTML = '<div class="agentic-plan-steps">' + plan.steps.map(function (s) {
    return '<div class="agentic-plan-step">' +
      '<div class="agentic-plan-step-head">' +
        '<span class="agentic-plan-step-num mono">' + s.index + '</span>' +
        '<span class="agentic-plan-step-tool mono">' + escapeHtml(s.tool) + '</span>' +
        '<span class="agentic-plan-step-agents orch-small mono">→ ' + escapeHtml(s.agents.join(", ")) + '</span>' +
        (s.optional ? '<span class="pill pill-muted mono" style="font-size:8.5px">optional</span>' : '') +
      '</div>' +
      '<div class="agentic-plan-step-rationale">' + escapeHtml(s.rationale) + '</div>' +
    '</div>';
  }).join("") + '</div>';
  var execBtn = document.getElementById("agentic-execute-btn");
  if (execBtn) {
    execBtn.onclick = null;
    execBtn.addEventListener("click", _agenticExecute);
  }
  // Wave 3: wire self-critique + refine controls.
  var critBtn = document.getElementById("agentic-critique-btn");
  if (critBtn) { critBtn.onclick = null; critBtn.addEventListener("click", _agenticCritique); }
  var refineBtn = document.getElementById("agentic-refine-btn");
  if (refineBtn) { refineBtn.onclick = null; refineBtn.addEventListener("click", _agenticRefine); }
  var refineInp = document.getElementById("agentic-refine-input");
  if (refineInp) {
    refineInp.onkeydown = null;
    refineInp.addEventListener("keydown", function (e) { if (e.key === "Enter") _agenticRefine(); });
  }
}

// Wave 3: self-critique. Calls /agentic/critique with brief + plan;
// renders issue cards color-coded by severity.
async function _agenticCritique() {
  if (!_agenticCurrent || !_agenticCurrent.plan) return;
  var btn = document.getElementById("agentic-critique-btn");
  var out = document.getElementById("agentic-critique-result");
  if (!out) return;
  if (btn) { btn.disabled = true; btn.querySelector("span").textContent = "🔍 reviewing…"; }
  out.innerHTML = '<span class="orch-small">agent reviewing the plan…</span>';
  try {
    var r = await fetch("/agentic/critique", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: _agenticCurrent.expanded, plan: _agenticCurrent.plan }),
    });
    var d = await r.json();
    var overallCls = "agentic-crit-" + (d.overall || "looks_good");
    var ico = d.overall === "block" ? "⛔" : d.overall === "needs_revision" ? "⚠" : d.overall === "minor_issues" ? "ℹ" : "✓";
    out.innerHTML =
      '<div class="agentic-crit-banner ' + overallCls + '">' +
        '<span class="agentic-crit-icon">' + ico + '</span>' +
        '<span><strong>' + escapeHtml((d.overall || "looks_good").toUpperCase().replace(/_/g, " ")) + '</strong></span>' +
        '<span class="orch-small">' + escapeHtml(d.summary || "") + '</span>' +
        '<span class="orch-small mono" style="margin-left:auto">' + (d.mode === "live" ? "Claude" : "template") + '</span>' +
      '</div>' +
      (d.issues && d.issues.length ? d.issues.map(function (i) {
        return '<div class="agentic-crit-issue agentic-crit-sev-' + escapeHtml(i.severity) + '">' +
          '<span class="agentic-crit-sev mono">' + escapeHtml((i.severity || "info").toUpperCase()) + '</span>' +
          '<span class="agentic-crit-cat mono">' + escapeHtml(i.category || "other") + '</span>' +
          '<div class="agentic-crit-msg">' + escapeHtml(i.message || "") + '</div>' +
          (i.suggested_fix ? '<div class="agentic-crit-fix">→ ' + escapeHtml(i.suggested_fix) + '</div>' : '') +
        '</div>';
      }).join("") : '<div class="orch-small" style="color:var(--text-mut);margin-top:6px">No issues flagged. Plan ready to execute.</div>');
  } catch (e) {
    out.innerHTML = '<span class="orch-small" style="color:var(--error)">' + escapeHtml(String((e && e.message) || e)) + '</span>';
  } finally {
    if (btn) { btn.disabled = false; btn.querySelector("span").textContent = "🔍 Self-critique"; }
  }
}

// Wave 3: multi-turn refinement.
async function _agenticRefine() {
  if (!_agenticCurrent || !_agenticCurrent.expanded || !_agenticCurrent.plan) return;
  var inp = document.getElementById("agentic-refine-input");
  var btn = document.getElementById("agentic-refine-btn");
  var out = document.getElementById("agentic-refine-result");
  if (!inp || !out) return;
  var instruction = (inp.value || "").trim();
  if (!instruction) return;
  if (btn) { btn.disabled = true; btn.querySelector("span").textContent = "thinking…"; }
  out.innerHTML = '<span class="orch-small">refining brief + replanning against current coverage…</span>';
  try {
    var r = await fetch("/agentic/refine", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        previous_brief: _agenticCurrent.expanded,
        previous_plan: _agenticCurrent.plan,
        instruction: instruction,
      }),
    });
    var d = await r.json();
    if (d.error) { out.innerHTML = '<span class="orch-small" style="color:var(--error)">' + escapeHtml(d.error) + '</span>'; return; }

    // Replace state + re-render the brief + plan sections.
    _agenticCurrent.expanded = d.refined;
    _agenticCurrent.plan = d.plan;
    _agenticRenderBrief(d.refined);
    _agenticRenderPlan(d.plan);

    // Show diff inline
    var changeRows = (d.changes || []).map(function (c) {
      return '<div class="agentic-refine-change">' +
        '<span class="agentic-refine-field mono">' + escapeHtml(c.field) + '</span>' +
        '<span class="agentic-refine-arrow">→</span>' +
        '<span class="orch-small">' + escapeHtml(JSON.stringify(c.before)) + ' ⇒ ' + escapeHtml(JSON.stringify(c.after)) + '</span>' +
      '</div>';
    }).join("");
    var planChangeRows = (d.plan_changes || []).map(function (c) {
      return '<div class="agentic-refine-change agentic-refine-change-plan"><span class="mono">' + escapeHtml(c.kind) + '</span> <span class="mono">' + escapeHtml(c.detail) + '</span></div>';
    }).join("");
    out.innerHTML =
      '<div class="agentic-refine-summary">' + escapeHtml(d.summary || "Refined.") + '</div>' +
      changeRows +
      planChangeRows;
    inp.value = "";
  } catch (e) {
    out.innerHTML = '<span class="orch-small" style="color:var(--error)">' + escapeHtml(String((e && e.message) || e)) + '</span>';
  } finally {
    if (btn) { btn.disabled = false; btn.querySelector("span").textContent = "↻ Refine"; }
  }
}

function _agenticRenderCompliance(comp) {
  var sec = document.getElementById("agentic-compliance-section");
  var body = document.getElementById("agentic-compliance-body");
  if (!sec || !body || !comp || !comp.advisory) return;
  sec.style.display = "";
  var adv = comp.advisory;
  var outClass = "agentic-comp-" + adv.outcome;
  var ico = adv.outcome === "block" ? "⛔" : adv.outcome === "warn" ? "⚠" : "✓";
  var pols = adv.advisories.slice(0, 5).map(function (a) {
    return '<div class="agentic-comp-row agentic-comp-row-' + escapeHtml(a.outcome) + '">' +
      '<span class="mono">' + escapeHtml(a.policy_id) + '</span>' +
      '<span class="mono">' + escapeHtml(a.outcome) + '</span>' +
      '<span class="orch-small">' + escapeHtml((a.signal_claim || "silent") + " · " + (a.reason || "").slice(0, 80)) + '</span>' +
    '</div>';
  }).join("");
  var rems = (comp.remediations || []).map(function (r) {
    return '<div class="agentic-rem-row"><span class="agentic-rem-suggestion mono">' + escapeHtml(r.suggestion) + '</span> <span class="mono">' + escapeHtml(r.blocking_policy) + '</span> — <span>' + escapeHtml(r.detail) + '</span></div>';
  }).join("");
  body.innerHTML =
    '<div class="agentic-comp-banner ' + outClass + '">' +
      '<span class="agentic-comp-icon">' + ico + '</span>' +
      '<span>governance preview <strong>' + escapeHtml(adv.outcome.toUpperCase()) + '</strong></span>' +
      '<span class="orch-small">' + adv.restricted_attributes.length + ' block · ' + adv.advisories.filter(function (a) { return a.outcome === "warn"; }).length + ' warn · ' + adv.advisories.filter(function (a) { return a.outcome === "allow"; }).length + ' allow</span>' +
    '</div>' +
    pols +
    (rems ? '<div class="agentic-rem-block"><div class="agentic-section-label" style="margin:8px 0 4px;font-size:10.5px">remediation</div>' + rems + '</div>' : '');
}

function _agenticRenderMemory(mem) {
  var sec = document.getElementById("agentic-memory-section");
  var body = document.getElementById("agentic-memory-body");
  if (!sec || !body || !mem) return;
  sec.style.display = "";
  body.innerHTML =
    '<div class="orch-small" style="margin-bottom:6px">' + escapeHtml(mem.hint || "") + '</div>' +
    (mem.matches || []).map(function (m) {
      return '<div class="agentic-mem-row">' +
        '<span class="agentic-mem-when mono">' + escapeHtml(String(m.ran_at).slice(0, 10)) + '</span>' +
        '<span class="agentic-mem-input">' + escapeHtml(m.brief_input.slice(0, 80)) + '</span>' +
        '<span class="agentic-mem-outcome mono">' + escapeHtml(m.outcome) + '</span>' +
      '</div>';
    }).join("");
}

async function _agenticExecute() {
  if (!_agenticCurrent || !_agenticCurrent.plan) return;
  var btn = document.getElementById("agentic-execute-btn");
  var sec = document.getElementById("agentic-exec-section");
  var status = document.getElementById("agentic-exec-status");
  var body = document.getElementById("agentic-exec-body");
  if (!sec || !body) return;
  sec.style.display = "";
  body.innerHTML = "";
  if (btn) { btn.disabled = true; btn.querySelector("span").textContent = "executing…"; }
  if (status) status.textContent = "streaming…";
  try {
    var resp = await fetch("/agentic/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: _agenticCurrent.plan }) });
    if (!resp.body) throw new Error("no stream body");
    var reader = resp.body.getReader();
    var dec = new TextDecoder();
    var buffer = "";
    var stepResults = {};
    while (true) {
      var read = await reader.read();
      if (read.done) break;
      buffer += dec.decode(read.value, { stream: true });
      var lines = buffer.split("\\n");
      buffer = lines.pop() || "";
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li].trim();
        if (!line) continue;
        var ev = null;
        try { ev = JSON.parse(line); } catch (e) { continue; }
        if (ev.event === "reasoning" && ev.step) {
          _agenticTrace.push(ev.step);
          _agenticAppendTraceStep(ev.step);
        } else if (ev.event === "tool_complete") {
          stepResults[ev.step_id] = ev;
          _agenticAppendExec(ev);
        } else if (ev.event === "agent_result") {
          _agenticAppendAgentResult(ev);
        } else if (ev.event === "trace") {
          _captureTrace(ev.trace);
        } else if (ev.event === "execution_complete") {
          if (status) status.textContent = "done · " + (ev.step_results ? ev.step_results.length + " steps" : "");
        } else if (ev.event === "error") {
          showToast("execution error: " + ev.error, true);
        }
      }
    }
  } catch (e) {
    showToast("agentic execute failed: " + ((e && e.message) || e), true);
    if (status) status.textContent = "error";
  } finally {
    if (btn) { btn.disabled = false; btn.querySelector("span").textContent = "Re-execute"; }
  }
}

function _agenticAppendExec(ev) {
  var body = document.getElementById("agentic-exec-body");
  if (!body) return;
  var statusCls = ev.ok ? "agentic-exec-ok" : "agentic-exec-err";
  var resultPreview = "";
  try { resultPreview = JSON.stringify(ev.result || ev.agent_results, null, 2).slice(0, 400); } catch (e) { /* noop */ }
  body.insertAdjacentHTML("beforeend",
    '<div class="agentic-exec-step ' + statusCls + '">' +
      '<div class="agentic-exec-step-head">' +
        '<span class="mono">' + escapeHtml(ev.tool || "?") + '</span>' +
        '<span class="agentic-exec-status mono">' + (ev.ok ? "ok" : "err") + '</span>' +
        '<span class="agentic-exec-lat orch-small mono">' + (ev.latency_ms || 0) + 'ms</span>' +
      '</div>' +
      (resultPreview ? '<details><summary class="orch-small" style="cursor:pointer">payload preview</summary><pre class="wf-json mono" style="max-height:160px;overflow:auto;font-size:10.5px">' + escapeHtml(resultPreview) + '</pre></details>' : '') +
    '</div>'
  );
}

function _agenticAppendAgentResult(ev) {
  var body = document.getElementById("agentic-exec-body");
  if (!body) return;
  var statusCls = ev.status === "ok" ? "agentic-agent-ok" : "agentic-agent-err";
  body.insertAdjacentHTML("beforeend",
    '<div class="agentic-agent-row ' + statusCls + '">' +
      '<span class="mono">' + escapeHtml(ev.agent_id) + '</span>' +
      '<span class="orch-small mono">' + escapeHtml(ev.tool) + '</span>' +
      '<span class="orch-small mono">' + (ev.latency_ms || 0) + 'ms</span>' +
      (ev.status !== "ok" && ev.error ? '<span class="orch-small">' + escapeHtml(String(ev.error).slice(0, 100)) + '</span>' : '') +
    '</div>'
  );
}
`;
