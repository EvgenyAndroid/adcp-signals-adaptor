// src/demo/script/fragments/expression-tree.ts
//
// Expression Tree builder: node primitives, walker, render, drag/drop, leaf picker, serializer, result render.
//
// Source range (in pre-refactor src/demo/script.ts): lines 6738..7308 (571 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const expressionTreeJs = `function _exprNextId() {
  var n = state.expression.nextId || 1;
  state.expression.nextId = n + 1;
  return "n" + n;
}
function _exprNewLeaf() {
  return { type: "signal", id: _exprNextId(), signal_id: "" };
}
function _exprNewGroup(op, children) {
  return { type: "op", id: _exprNextId(), op: op, children: (children || []).slice() };
}

// Walk the tree. cb(node, parent, indexInParent, depth). depth starts at 1 for root.
function _exprWalk(node, cb, parent, idx, depth) {
  parent = parent || null; idx = idx || 0; depth = depth || 1;
  cb(node, parent, idx, depth);
  if (node.type === "op") {
    for (var i = 0; i < node.children.length; i++) {
      _exprWalk(node.children[i], cb, node, i, depth + 1);
    }
  }
}

function _exprCountNodesAndDepth() {
  var root = state.expression.tree;
  if (!root) return { nodes: 0, depth: 0 };
  var n = 0, d = 0;
  _exprWalk(root, function (_node, _p, _i, depth) {
    n++;
    if (depth > d) d = depth;
  });
  return { nodes: n, depth: d };
}

function _exprFindNode(id) {
  var found = null, foundParent = null, foundIdx = -1;
  _exprWalk(state.expression.tree, function (node, parent, idx) {
    if (node.id === id) { found = node; foundParent = parent; foundIdx = idx; }
  });
  return { node: found, parent: foundParent, idx: foundIdx };
}

function _exprIsDescendant(ancestor, descendantId) {
  if (ancestor.id === descendantId) return true;
  if (ancestor.type !== "op") return false;
  for (var i = 0; i < ancestor.children.length; i++) {
    if (_exprIsDescendant(ancestor.children[i], descendantId)) return true;
  }
  return false;
}

function _exprDetach(id) {
  var loc = _exprFindNode(id);
  if (!loc.node || !loc.parent) return null;
  loc.parent.children.splice(loc.idx, 1);
  return loc.node;
}

function _exprRender() {
  var canvas = document.getElementById("expr-canvas");
  if (!canvas) return;
  canvas.innerHTML = _exprRenderNode(state.expression.tree, null, 1);
  _exprWireNode(state.expression.tree);
  _exprUpdateCounters();
  _exprUpdateRunBtn();
}

function _exprRenderNode(node, parentOp, depth) {
  if (node.type === "signal") return _exprRenderLeaf(node, parentOp);
  return _exprRenderGroup(node, parentOp, depth);
}

function _exprRenderLeaf(node, parentOp) {
  var sig = node.signal_id ? state.catalog.all.find(function (s) {
    return (s.signal_agent_segment_id || (s.signal_id && s.signal_id.id)) === node.signal_id;
  }) : null;
  var reachTxt = "";
  var lastResult = state.expression.lastResult;
  if (lastResult) {
    var match = _exprFindResultNode(lastResult.root, node.id);
    if (match) reachTxt = '<span class="expr-node-reach mono">' + fmtNumber(match.reach) + '</span>';
  }
  var body = sig
    ? '<div class="expr-leaf-body"><div class="expr-leaf-name">' + escapeHtml(sig.name) + '</div>' +
      '<div class="expr-leaf-meta mono">' + fmtNumber(sig.estimated_audience_size) + ' · ' + escapeHtml(sig.category_type || "—") + '</div></div>'
    : '<div class="expr-leaf-body expr-leaf-empty"><span>Click to pick a signal</span></div>';
  var canNegate = parentOp === "AND";
  return '<div class="expr-node expr-leaf' + (sig ? '' : ' expr-leaf-unfilled') + '" data-id="' + escapeHtml(node.id) + '" draggable="true">' +
    '<span class="expr-drag-handle" title="Drag to reparent">⋮⋮</span>' +
    body +
    reachTxt +
    '<div class="expr-leaf-actions">' +
      (canNegate ? '<button class="expr-btn-ghost" data-expr-action="wrap-not" data-id="' + escapeHtml(node.id) + '" title="Wrap in NOT (exclude)">NOT</button>' : '') +
      '<button class="expr-btn-ghost" data-expr-action="pick" data-id="' + escapeHtml(node.id) + '" title="Pick signal">' + (sig ? '↻' : '+') + '</button>' +
      '<button class="expr-btn-ghost expr-btn-danger" data-expr-action="delete" data-id="' + escapeHtml(node.id) + '" title="Delete node">×</button>' +
    '</div>' +
    (state.expression.pickingLeafId === node.id ? _exprRenderLeafPicker(node.id) : '') +
  '</div>';
}

function _exprRenderLeafPicker(leafId) {
  return '<div class="expr-leaf-picker" data-leaf-id="' + escapeHtml(leafId) + '">' +
    '<input class="expr-leaf-picker-input" placeholder="Search catalog\u2026" autocomplete="off"/>' +
    '<div class="expr-leaf-picker-list" id="expr-picker-list-' + escapeHtml(leafId) + '"></div>' +
  '</div>';
}

function _exprRenderGroup(node, parentOp, depth) {
  var isRoot = depth === 1;
  var lastResult = state.expression.lastResult;
  var reachTxt = "";
  if (lastResult) {
    var match = _exprFindResultNode(lastResult.root, node.id);
    if (match) reachTxt = '<span class="expr-node-reach mono">' + fmtNumber(match.reach) + '</span>';
  }
  var opLabel = node.op === "OR" ? "Any (OR)" : node.op === "AND" ? "All (AND)" : "NOT";
  var opClass = "expr-op-" + node.op.toLowerCase();
  var isNot = node.op === "NOT";
  var childrenHtml = node.children.map(function (c) { return _exprRenderNode(c, node.op, depth + 1); }).join("");
  var addMenu = isNot ? "" :
    '<div class="expr-add-menu">' +
      '<button class="expr-btn-ghost" data-expr-action="add-signal" data-id="' + escapeHtml(node.id) + '">+ Signal</button>' +
      '<button class="expr-btn-ghost" data-expr-action="add-or" data-id="' + escapeHtml(node.id) + '">+ OR group</button>' +
      '<button class="expr-btn-ghost" data-expr-action="add-and" data-id="' + escapeHtml(node.id) + '">+ AND group</button>' +
      (node.op === "AND" ? '<button class="expr-btn-ghost" data-expr-action="add-not" data-id="' + escapeHtml(node.id) + '">+ NOT</button>' : '') +
    '</div>';
  var opSelector = isNot ? '<span class="expr-op-chip ' + opClass + '">NOT</span>' :
    '<span class="expr-op-chip ' + opClass + '" data-expr-action="toggle-op" data-id="' + escapeHtml(node.id) + '" title="Click to toggle OR/AND">' + escapeHtml(opLabel) + '</span>';
  return '<div class="expr-node expr-group ' + opClass + (isRoot ? ' expr-root' : '') + '" data-id="' + escapeHtml(node.id) + '"' + (isRoot ? '' : ' draggable="true"') + '>' +
    '<div class="expr-group-head">' +
      (isRoot ? '' : '<span class="expr-drag-handle" title="Drag to reparent">⋮⋮</span>') +
      opSelector +
      reachTxt +
      '<div class="expr-group-actions">' +
        (isRoot ? '' : '<button class="expr-btn-ghost expr-btn-danger" data-expr-action="delete" data-id="' + escapeHtml(node.id) + '" title="Delete group">×</button>') +
      '</div>' +
    '</div>' +
    '<div class="expr-group-body">' +
      (node.children.length === 0
        ? '<div class="expr-empty-group">Empty group — add a child below</div>'
        : childrenHtml) +
    '</div>' +
    addMenu +
  '</div>';
}

function _exprFindResultNode(root, id) {
  if (!root) return null;
  if (root.node_id === id) return root;
  if (root.children) {
    for (var i = 0; i < root.children.length; i++) {
      var hit = _exprFindResultNode(root.children[i], id);
      if (hit) return hit;
    }
  }
  return null;
}

function _exprWireNode(root) {
  var canvas = document.getElementById("expr-canvas");
  if (!canvas) return;
  // Action buttons (bubbling listener).
  canvas.onclick = function (ev) {
    var t = ev.target;
    while (t && t !== canvas && !(t.dataset && t.dataset.exprAction)) t = t.parentNode;
    if (!t || t === canvas) return;
    var action = t.dataset.exprAction;
    var id = t.dataset.id;
    _exprHandleAction(action, id);
    ev.stopPropagation();
  };
  _exprWireDragAndDrop(canvas);
  // If a leaf picker is open, wire it.
  if (state.expression.pickingLeafId) {
    _exprWireLeafPicker(state.expression.pickingLeafId);
  }
  void root;
}

function _exprHandleAction(action, id) {
  var loc = _exprFindNode(id);
  if (!loc.node && action !== "reset") return;
  var counters = _exprCountNodesAndDepth();
  switch (action) {
    case "pick":
      state.expression.pickingLeafId = state.expression.pickingLeafId === id ? null : id;
      _exprRender();
      break;
    case "wrap-not":
      // Replace the leaf with NOT(leaf).
      if (!loc.parent) return;
      if (loc.parent.op !== "AND") { showToast("NOT is only legal under AND.", true); return; }
      if (counters.nodes + 1 > EXPR_MAX_NODES) { showToast("Node cap reached.", true); return; }
      if (counters.depth + 1 > EXPR_MAX_DEPTH) { showToast("Depth cap reached.", true); return; }
      var wrapped = _exprNewGroup("NOT", [loc.node]);
      loc.parent.children[loc.idx] = wrapped;
      _exprRender();
      break;
    case "delete":
      if (!loc.parent) return;  // root can't be deleted here
      loc.parent.children.splice(loc.idx, 1);
      // If the parent is now empty (and it's an op), leave it — user can add children back or delete it.
      if (state.expression.pickingLeafId === id) state.expression.pickingLeafId = null;
      _exprRender();
      break;
    case "toggle-op":
      if (loc.node.type !== "op") return;
      if (loc.node.op === "OR") loc.node.op = "AND";
      else if (loc.node.op === "AND") loc.node.op = "OR";
      // Don't toggle NOT here
      _exprRender();
      break;
    case "add-signal":
    case "add-or":
    case "add-and":
    case "add-not":
      if (loc.node.type !== "op") return;
      if (counters.nodes + 1 > EXPR_MAX_NODES) { showToast("Node cap reached (" + EXPR_MAX_NODES + ").", true); return; }
      var newDepth = _exprDepthOf(id) + 1;
      if (newDepth > EXPR_MAX_DEPTH) { showToast("Depth cap reached (" + EXPR_MAX_DEPTH + ").", true); return; }
      var child = null;
      if (action === "add-signal") child = _exprNewLeaf();
      else if (action === "add-or") child = _exprNewGroup("OR", [_exprNewLeaf(), _exprNewLeaf()]);
      else if (action === "add-and") child = _exprNewGroup("AND", [_exprNewLeaf(), _exprNewLeaf()]);
      else if (action === "add-not") {
        if (loc.node.op !== "AND") { showToast("NOT only legal under AND.", true); return; }
        child = _exprNewGroup("NOT", [_exprNewLeaf()]);
      }
      if (child) loc.node.children.push(child);
      _exprRender();
      break;
  }
}

function _exprDepthOf(id) {
  var d = 0;
  _exprWalk(state.expression.tree, function (node, _p, _i, depth) {
    if (node.id === id) d = depth;
  });
  return d;
}

function _exprWireDragAndDrop(canvas) {
  // dragstart on any node, dragover/drop on any group body.
  canvas.ondragstart = function (ev) {
    var t = ev.target;
    while (t && t !== canvas && !(t.dataset && t.dataset.id && t.draggable)) t = t.parentNode;
    if (!t || t === canvas) return;
    state.expression.draggedNodeId = t.dataset.id;
    try { ev.dataTransfer.setData("text/plain", t.dataset.id); ev.dataTransfer.effectAllowed = "move"; } catch (_e) {}
    t.classList.add("expr-dragging");
  };
  canvas.ondragend = function () {
    state.expression.draggedNodeId = null;
    Array.prototype.forEach.call(canvas.querySelectorAll(".expr-dragging,.expr-drop-target"), function (el) {
      el.classList.remove("expr-dragging", "expr-drop-target");
    });
  };
  canvas.ondragover = function (ev) {
    var group = _exprFindGroupDropTarget(ev.target);
    if (!group) return;
    var draggedId = state.expression.draggedNodeId;
    if (!draggedId) return;
    var targetId = group.dataset.id;
    if (targetId === draggedId) return;
    var targetNode = _exprFindNode(targetId).node;
    var draggedNode = _exprFindNode(draggedId).node;
    if (!targetNode || !draggedNode) return;
    // Descendant-guard: can't drop a node into its own subtree.
    if (_exprIsDescendant(draggedNode, targetId)) return;
    // NOT groups are unary — refuse drops if already has a child.
    if (targetNode.op === "NOT" && targetNode.children.length >= 1) return;
    ev.preventDefault();
    group.classList.add("expr-drop-target");
  };
  canvas.ondragleave = function (ev) {
    var group = _exprFindGroupDropTarget(ev.target);
    if (group) group.classList.remove("expr-drop-target");
  };
  canvas.ondrop = function (ev) {
    var group = _exprFindGroupDropTarget(ev.target);
    if (!group) return;
    var draggedId = state.expression.draggedNodeId;
    if (!draggedId) return;
    var targetId = group.dataset.id;
    if (targetId === draggedId) return;
    ev.preventDefault();
    var draggedNode = _exprFindNode(draggedId).node;
    if (!draggedNode) return;
    if (_exprIsDescendant(draggedNode, targetId)) return;
    var targetNode = _exprFindNode(targetId).node;
    if (!targetNode || targetNode.type !== "op") return;
    if (targetNode.op === "NOT" && targetNode.children.length >= 1) return;
    // NOT-only-under-AND invariant: if the dragged node is a NOT group, only
    // accept it under AND parents.
    if (draggedNode.type === "op" && draggedNode.op === "NOT" && targetNode.op !== "AND") {
      showToast("NOT is only legal under AND.", true); return;
    }
    // Detach, then append to target.
    var detached = _exprDetach(draggedId);
    if (!detached) return;
    targetNode.children.push(detached);
    state.expression.draggedNodeId = null;
    _exprRender();
  };
}

function _exprFindGroupDropTarget(node) {
  // Walk up to the nearest expr-group element.
  while (node && node.classList) {
    if (node.classList.contains("expr-group")) return node;
    node = node.parentNode;
  }
  return null;
}

function _exprWireLeafPicker(leafId) {
  var input = document.querySelector('.expr-leaf-picker[data-leaf-id="' + leafId + '"] .expr-leaf-picker-input');
  if (!input) return;
  setTimeout(function () { try { input.focus(); } catch (_e) {} }, 10);
  var render = function (q) {
    var host = document.getElementById("expr-picker-list-" + leafId);
    if (!host) return;
    var rows = (state.catalog.all || []).slice();
    if (q) rows = rows.filter(function (s) {
      return (s.name || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
    });
    rows = rows.slice(0, 12);
    if (rows.length === 0) {
      host.innerHTML = '<div style="color:var(--text-mut);font-size:11px;padding:6px 0">No matches.</div>';
      return;
    }
    host.innerHTML = rows.map(function (s) {
      var sid = s.signal_agent_segment_id || (s.signal_id && s.signal_id.id) || "";
      return '<div class="expr-leaf-picker-row" data-sid="' + escapeHtml(sid) + '">' +
        '<div class="expr-leaf-picker-name">' + escapeHtml(s.name) + '</div>' +
        '<div class="expr-leaf-picker-meta mono">' + fmtNumber(s.estimated_audience_size) + ' · ' + escapeHtml(s.category_type || "—") + '</div>' +
      '</div>';
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".expr-leaf-picker-row"), function (el) {
      el.addEventListener("click", function () {
        var sid = el.dataset.sid;
        var loc = _exprFindNode(leafId);
        if (!loc.node) return;
        loc.node.signal_id = sid;
        state.expression.pickingLeafId = null;
        _exprRender();
      });
    });
  };
  render("");
  input.addEventListener("input", function () { render(input.value.trim().toLowerCase()); });
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") { state.expression.pickingLeafId = null; _exprRender(); }
  });
}

function _exprUpdateCounters() {
  var counters = _exprCountNodesAndDepth();
  var n = document.getElementById("expr-count-nodes");
  var d = document.getElementById("expr-count-depth");
  if (n) n.textContent = counters.nodes;
  if (d) d.textContent = counters.depth;
  var wrap = document.getElementById("expr-counters");
  if (wrap) {
    wrap.classList.toggle("expr-counters-warn", counters.nodes >= EXPR_MAX_NODES * 0.8 || counters.depth >= EXPR_MAX_DEPTH);
  }
}

function _exprUpdateRunBtn() {
  var btn = document.getElementById("expr-run");
  if (!btn) return;
  // Tree is runnable if every leaf has a signal_id and every group is valid.
  var ok = true;
  _exprWalk(state.expression.tree, function (node) {
    if (node.type === "signal" && !node.signal_id) ok = false;
    if (node.type === "op") {
      if (node.op === "NOT" && node.children.length !== 1) ok = false;
      if ((node.op === "OR" || node.op === "AND") && node.children.length < 2) ok = false;
    }
  });
  btn.disabled = !ok;
}

// Strip client-only runtime fields before sending to server.
function _exprSerialize(node) {
  if (node.type === "signal") return { type: "signal", id: node.id, signal_id: node.signal_id };
  return { type: "op", id: node.id, op: node.op, children: node.children.map(_exprSerialize) };
}

async function runExpression() {
  var host = document.getElementById("expr-result");
  host.innerHTML = '<div class="empty-state"><span class="spinner"></span><div class="empty-title">Evaluating expression\u2026</div></div>';
  try {
    var r = await fetch("/audience/compose-ast", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ast: _exprSerialize(state.expression.tree) }),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    state.expression.lastResult = data;
    _renderExprResult(data);
    _exprRender();  // re-render tree so per-node reach pills show up
    document.getElementById("expr-save-panel").hidden = false;
  } catch (e) {
    host.innerHTML = '<div class="empty-state" style="border-color:var(--error)"><div class="empty-title" style="color:var(--error)">' + escapeHtml(e.message) + '</div></div>';
  }
}

function _renderExprResult(data) {
  var host = document.getElementById("expr-result");
  var reach = data.reach || 0;
  var sigCount = (data.resolved_signal_ids || []).length;
  host.innerHTML =
    '<div class="expr-result-cards">' +
      '<div class="expr-result-card expr-result-primary">' +
        '<div class="k">Total reach</div>' +
        '<div class="v mono">' + fmtNumber(reach) + '</div>' +
      '</div>' +
      '<div class="expr-result-card">' +
        '<div class="k">Signals resolved</div>' +
        '<div class="v mono">' + sigCount + '</div>' +
      '</div>' +
      '<div class="expr-result-card">' +
        '<div class="k">Tree shape</div>' +
        '<div class="v mono">' + escapeHtml(_exprShapeSummary(data.root)) + '</div>' +
      '</div>' +
    '</div>';
  runExprPrivacyGate(reach, data.resolved_signal_ids || []);
  runExprHoldout(reach);
  var expl = document.getElementById("expr-explainer");
  if (expl) {
    expl.innerHTML = renderChartExplainer({
      what: "Arbitrary boolean expression over catalog signals, evaluated bottom-up into a single reach estimate.",
      how: "Every leaf returns its signal's reach. OR over leaves uses inclusion-exclusion with pairwise Jaccard. AND folds positives via intersect-decay and subtracts NOT-wrapped children via exclude-overlap. Between subtrees we synthesize a virtual composite signal carrying the subtree's reach and its dominant category, so the same heuristics compose recursively at any depth.",
      read: "Each node shows its subtree's reach in the tree above after you Compute. The total at the root is the whole expression's reach. <strong>Privacy</strong> + <strong>Incrementality</strong> blocks below run automatically — same math as the Composer.",
      limits: "Reach is estimated, not user-level. Subtree composition loses some pairwise detail vs flat lists; treat as a planning sketch, verify winning expressions in a clean-room before committing spend. Max depth 5, max 30 nodes.",
    });
  }
}

function _exprShapeSummary(root) {
  if (!root) return "—";
  var opCounts = { OR: 0, AND: 0, NOT: 0, leaf: 0 };
  (function walk(n) {
    if (n.type === "signal") { opCounts.leaf++; return; }
    if (n.op === "OR") opCounts.OR++;
    else if (n.op === "AND") opCounts.AND++;
    else if (n.op === "NOT") opCounts.NOT++;
    (n.children || []).forEach(walk);
  })(root);
  var parts = [];
  if (opCounts.AND) parts.push(opCounts.AND + " AND");
  if (opCounts.OR) parts.push(opCounts.OR + " OR");
  if (opCounts.NOT) parts.push(opCounts.NOT + " NOT");
  parts.push(opCounts.leaf + " signals");
  return parts.join(" · ");
}

async function runExprPrivacyGate(cohortSize, signalIds) {
  var host = document.getElementById("expr-privacy");
  if (!host) return;
  if (cohortSize <= 0 || signalIds.length === 0) { host.innerHTML = ""; return; }
  try {
    var r = await fetch("/audience/privacy-check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal_ids: signalIds.slice(0, 20), cohort_size: cohortSize }),
    });
    var data = await r.json();
    if (!r.ok || data.error) { host.innerHTML = ""; return; }
    var statusColor = data.status === "ok" ? "var(--success)" : data.status === "warn" ? "var(--warning)" : "var(--error)";
    var statusLabel = data.status === "ok" ? "Ok to activate" : data.status === "warn" ? "Warning" : "Blocked";
    var reasons = (data.reasons || []).map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join("");
    host.innerHTML =
      '<div class="privacy-gate" style="border-left:3px solid ' + statusColor + '">' +
        '<div class="privacy-title"><strong>Privacy gate: ' + statusLabel + '</strong>' +
          '<span class="mono" style="color:var(--text-mut);margin-left:10px">k-anon floor ' + data.min_k + ' · cohort ' + fmtNumber(data.cohort_size) + '</span></div>' +
        (reasons ? '<ul class="privacy-reasons">' + reasons + '</ul>' : '<div style="color:var(--text-mut);font-size:11.5px">No privacy concerns flagged.</div>') +
      '</div>';
  } catch (_e) { host.innerHTML = ""; }
}

async function runExprHoldout(reach) {
  var host = document.getElementById("expr-holdout");
  if (!host) return;
  if (reach <= 0) { host.innerHTML = ""; return; }
  try {
    var r = await fetch("/audience/holdout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reach: reach, holdout_pct: 0.10, baseline_conversion_rate: 0.02 }),
    });
    var data = await r.json();
    if (!r.ok || data.error) { host.innerHTML = ""; return; }
    host.innerHTML =
      '<div class="holdout-block">' +
        '<div class="holdout-title">Incrementality plan <span class="mono" style="color:var(--text-mut);font-weight:400;margin-left:8px">(10% holdout · 2% baseline CR · \u03b1=0.05 · 80% power)</span></div>' +
        '<div class="holdout-stats">' +
          '<div><div class="k">Exposed</div><div class="v">' + fmtNumber(data.exposed_size) + '</div></div>' +
          '<div><div class="k">Control</div><div class="v">' + fmtNumber(data.control_size) + '</div></div>' +
          '<div><div class="k">MDE (abs)</div><div class="v mono">' + (data.mde_absolute * 100).toFixed(2) + '%</div></div>' +
          '<div><div class="k">MDE (rel)</div><div class="v mono">' + (data.mde_relative * 100).toFixed(1) + '%</div></div>' +
        '</div>' +
      '</div>';
  } catch (_e) { host.innerHTML = ""; }
}

async function saveExpressionSnapshot() {
  var nameEl = document.getElementById("expr-save-name");
  var tagsEl = document.getElementById("expr-save-tags");
  var name = (nameEl.value || "").trim();
  if (!name) { showToast("Snapshot name required.", true); return; }
  var lastResult = state.expression.lastResult;
  if (!lastResult) { showToast("Compute the expression first.", true); return; }
  var ast = _exprSerialize(state.expression.tree);
  var tags = (tagsEl.value || "").split(",").map(function (t) { return t.trim(); }).filter(Boolean);
  // Snapshot composition carries the AST in a new optional field; we also
  // project the resolved signals as an include list so older diff code
  // (which only understands include/intersect/exclude) can still produce
  // a useful view.
  var composition = {
    include: (lastResult.resolved_signal_ids || []).slice(),
    intersect: [],
    exclude: [],
    expression_ast: ast,
  };
  var body = {
    name: name,
    note: "Saved from Expression tab · " + _exprShapeSummary(lastResult.root),
    tags: tags,
    composition: composition,
    reach_at_save: lastResult.reach || 0,
  };
  try {
    var r = await fetch("/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + DEMO_KEY },
      body: JSON.stringify(body),
    });
    var data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || "HTTP " + r.status);
    showToast('Saved snapshot "' + name + '"');
    nameEl.value = ""; tagsEl.value = "";
  } catch (e) {
    showToast(e.message, true);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sec-48: Multi-Agent Orchestrator — live view + fan-out + capability matrix
// across every AdCP agent in our curated directory.
// ─────────────────────────────────────────────────────────────────────────
var _orchLoaded = false;

async function ensureOrchestrator() {
  if (_orchLoaded) return;
  _orchLoaded = true;
  document.getElementById("orch-refresh").addEventListener("click", runOrchProbeAll);
  document.getElementById("orch-run").addEventListener("click", runOrchFanout);
  document.getElementById("orch-matrix-run").addEventListener("click", runOrchMatrix);
  var wfRunBtn = document.getElementById("wf-run");
  if (wfRunBtn) wfRunBtn.addEventListener("click", runWorkflow);
  // Sec-48n: delegated click handler for workflow interactivity — product
  // re-pick + per-card "Fire this buy". Attached once per tab-load, picks
  // up future dynamic content in #wf-results.
  var wfResults = document.getElementById("wf-results");
  if (wfResults) wfResults.addEventListener("click", _wfOnClick);
  // Load static directory first, then kick off probe in parallel.
  await loadOrchDirectory();
  runOrchProbeAll();
}

`;
