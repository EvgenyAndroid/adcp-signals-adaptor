// src/demo/script/fragments/capabilities.ts
//
// Capabilities/REST viewer: caps html, REST endpoint table, tool cards, dts label, JSON highlighter.
//
// Source range (in pre-refactor src/demo/script.ts): lines 3560..4031 (472 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
export const capabilitiesJs = `function renderCapabilitiesHtml(caps) {
  const adcp = caps.adcp || {};
  const sig = caps.signals || {};
  const ucp = caps.ext?.ucp || {};
  const dts = caps.ext?.dts || {};
  const dests = Array.isArray(sig.destinations) ? sig.destinations : [];
  const limits = sig.limits || {};
  const protos = Array.isArray(caps.supported_protocols) ? caps.supported_protocols : [];
  const categories = Array.isArray(sig.signal_categories) ? sig.signal_categories : [];

  return '' +
    // ─── Protocol header ───
    '<div class="caps-section">' +
      '<div class="caps-section-title">AdCP Protocol</div>' +
      '<div class="caps-grid">' +
        card("Major versions", (adcp.major_versions || []).join(", ") || "—") +
        card("Supported protocols", protos.map((p) => '<span class="pill pill-accent">' + escapeHtml(p) + '</span>').join(" "), true) +
        card("Idempotency", adcp.idempotency?.supported
          ? '<span class="pill pill-success">enabled</span> <span class="mono" style="color:var(--text-mut);font-size:12px">replay ' + (adcp.idempotency.replay_ttl_seconds || 0) + 's</span>'
          : '<span class="pill pill-warning">off</span>', true) +
        card("Provider", escapeHtml(sig.provider || "—"), true) +
      '</div>' +
    '</div>' +

    // ─── Signals block ───
    '<div class="caps-section">' +
      '<div class="caps-section-title">Signals</div>' +
      '<div class="caps-grid">' +
        card("Activation mode", '<span class="pill pill-accent">' + escapeHtml(sig.activation_mode || "—") + '</span>', true) +
        card("Dynamic segment generation", sig.dynamic_segment_generation
          ? '<span class="pill pill-success">supported</span>'
          : '<span class="pill pill-muted">off</span>', true) +
        card("Max signals / request", String(limits.max_signals_per_request ?? "—")) +
        card("Default max_results", String(limits.default_max_results ?? "—")) +
        card("Max rules / segment", String(limits.max_rules_per_segment ?? "—")) +
        card("Signal categories",
          categories.map((c) => '<span class="pill pill-muted mono">' + escapeHtml(c) + '</span>').join(" "),
          true) +
      '</div>' +
    '</div>' +

    // ─── Destinations ───
    (dests.length
      ? '<div class="caps-section">' +
          '<div class="caps-section-title">Activation destinations (' + dests.length + ')</div>' +
          '<div class="caps-dest-list">' +
            dests.map((d) => '' +
              '<div class="caps-dest">' +
                '<div class="caps-dest-meta">' +
                  '<div class="caps-dest-name">' + escapeHtml(d.name || d.id) + '</div>' +
                  '<div class="caps-dest-id">' + escapeHtml(d.id || "") + ' · ' + escapeHtml(d.type || "—") + '</div>' +
                '</div>' +
                (d.activation_supported
                  ? '<span class="pill pill-success">active</span>'
                  : '<span class="pill pill-muted">inactive</span>') +
              '</div>'
            ).join("") +
          '</div>' +
        '</div>'
      : "") +

    // ─── UCP extension ───
    // The Universal Context Protocol block is genuinely the most
    // technically interesting part of the capabilities response — vector
    // embedding space, dimensions, encoding, similarity-search endpoint
    // template, concept registry. Surface all of it prominently rather
    // than hiding under a "phase" placeholder.
    (Object.keys(ucp).length
      ? '<div class="caps-section">' +
          '<div class="caps-section-title">UCP extension (ext.ucp) — semantic / NLP discovery layer</div>' +
          '<div class="caps-grid">' +
            (Array.isArray(ucp.supported_spaces) && ucp.supported_spaces.length
              ? card("Embedding space", '<span class="mono" style="font-size:12px">' + escapeHtml(ucp.supported_spaces[0]) + '</span>', true)
              : "") +
            (Array.isArray(ucp.dimensions) && ucp.dimensions.length
              ? card("Dimensions", '<span class="mono">' + ucp.dimensions[0] + '</span>', true)
              : "") +
            (Array.isArray(ucp.supported_encodings) && ucp.supported_encodings.length
              ? card("Encoding", '<span class="mono">' + escapeHtml(ucp.supported_encodings.join(", ")) + '</span>', true)
              : "") +
            (typeof ucp.similarity_search === "boolean"
              ? card("Similarity search",
                  ucp.similarity_search
                    ? '<span class="pill pill-success">enabled</span>'
                    : '<span class="pill pill-muted">off</span>', true)
              : "") +
            (ucp.phase
              ? card("Phase", '<span class="mono" style="font-size:12px">' + escapeHtml(ucp.phase) + '</span>', true)
              : "") +
            (ucp.gts_version
              ? card("GTS version", '<span class="mono" style="font-size:12px">' + escapeHtml(ucp.gts_version) + '</span>', true)
              : "") +
            (ucp.embedding_endpoint_template
              ? card("Embedding endpoint",
                  '<span class="mono" style="font-size:12px;color:var(--accent-hot)">' + escapeHtml(ucp.embedding_endpoint_template) + '</span>', true)
              : "") +
            (ucp.gts?.supported
              ? card("GTS",
                  '<span class="pill pill-success">supported</span>' +
                  (ucp.gts.endpoint ? ' <span class="mono" style="color:var(--text-mut);font-size:12px;margin-left:6px">' + escapeHtml(ucp.gts.endpoint) + '</span>' : ""),
                  true)
              : "") +
            (ucp.concept_registry?.supported
              ? card("Concept registry",
                  '<span class="pill pill-success">' + (ucp.concept_registry.concept_count ?? 0) + ' concepts</span>' +
                  (ucp.concept_registry.endpoint ? ' <span class="mono" style="color:var(--text-mut);font-size:12px;margin-left:6px">' + escapeHtml(ucp.concept_registry.endpoint) + '</span>' : ""),
                  true)
              : "") +
            (ucp.handshake_simulator?.supported
              ? card("Handshake simulator",
                  '<span class="pill pill-success">supported</span>' +
                  (ucp.handshake_simulator.endpoint ? ' <span class="mono" style="color:var(--text-mut);font-size:12px;margin-left:6px">' + escapeHtml(ucp.handshake_simulator.endpoint) + '</span>' : ""),
                  true)
              : "") +
            (ucp.projector?.supported
              ? card("Projector",
                  '<span class="pill pill-success">supported</span>' +
                  (ucp.projector.endpoint ? ' <span class="mono" style="color:var(--text-mut);font-size:12px;margin-left:6px">' + escapeHtml(ucp.projector.endpoint) + '</span>' : ""),
                  true)
              : "") +
          '</div>' +
        '</div>'
      : "") +

    // ─── DTS extension (IAB Data Transparency Standard v1.2) ───
    // Signal-level compliance: every row in the catalog carries a full
    // x_dts label. Capabilities-level declaration tells buyer agents
    // up-front whether to expect those fields + which privacy
    // mechanisms this agent emits.
    (Object.keys(dts).length
      ? '<div class="caps-section">' +
          '<div class="caps-section-title">DTS extension (ext.dts) — IAB Data Transparency Standard</div>' +
          '<div class="caps-grid">' +
            card("DTS version", '<span class="mono">v' + escapeHtml(String(dts.version || "—")) + '</span>', true) +
            card("Support",
              dts.supported
                ? '<span class="pill pill-success">enabled</span>'
                : '<span class="pill pill-muted">off</span>', true) +
            card("IAB Tech Lab compliant",
              dts.iab_techlab_compliant
                ? '<span class="pill pill-success">yes</span>'
                : '<span class="pill pill-muted">no</span>', true) +
            card("Label field", '<span class="mono" style="color:var(--accent-hot)">' + escapeHtml(dts.label_field || "x_dts") + '</span>', true) +
            card("Offline sources",
              dts.offline_sources_supported
                ? '<span class="pill pill-success">supported</span>'
                : '<span class="pill pill-muted">online only</span>', true) +
            (Array.isArray(dts.privacy_compliance_mechanisms) && dts.privacy_compliance_mechanisms.length
              ? card("Privacy mechanisms",
                  dts.privacy_compliance_mechanisms.map((m) => '<span class="pill pill-muted mono">' + escapeHtml(m) + '</span>').join(" "),
                  true)
              : "") +
            (Array.isArray(dts.supported_precision_levels) && dts.supported_precision_levels.length
              ? card("Precision levels",
                  dts.supported_precision_levels.map((p) => '<span class="pill pill-muted mono">' + escapeHtml(p) + '</span>').join(" "),
                  true)
              : "") +
            (dts.provider_privacy_policy_url
              ? card("Privacy policy",
                  '<a href="' + escapeHtml(dts.provider_privacy_policy_url) + '" target="_blank" rel="noopener" class="mono" style="font-size:11.5px;word-break:break-all">' + escapeHtml(dts.provider_privacy_policy_url) + '</a>',
                  true)
              : "") +
          '</div>' +
        '</div>'
      : "") +

    // ─── MCP tool catalog (discovery) ───
    // Tools list is populated async via mountToolCatalog() after this
    // template renders. The pane is public — tools/list is unauth
    // per AdCP convention.
    '<div class="caps-section">' +
      '<div class="caps-section-title">MCP tools (tools/list) <span style="color:var(--text-mut);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px">— discovery is public</span></div>' +
      '<div id="caps-tool-catalog"><div style="padding:8px 4px;color:var(--text-mut);font-size:12px"><span class="spinner"></span>Loading tools/list…</div></div>' +
    '</div>' +

    // ─── REST endpoint reference ───
    '<div class="caps-section">' +
      '<div class="caps-section-title">REST endpoints</div>' +
      renderRestEndpointsTable() +
    '</div>' +

    // ─── Raw JSON (collapsible) ───
    '<div class="caps-section">' +
      '<div class="caps-section-title">Raw JSON</div>' +
      '<div class="caps-raw-json">' + highlightJson(JSON.stringify(caps, null, 2)) + '</div>' +
    '</div>';
}

// Static REST endpoint reference. Kept in the UI code (not fetched) so
// this surface stays predictable — the moment an endpoint lands it
// should be added here alongside its route handler file.
function renderRestEndpointsTable() {
  const rows = [
    { m: "GET",  path: "/capabilities",        auth: "public", note: "Agent handshake — protocols, signals block, ext.ucp, ext.dts" },
    { m: "POST", path: "/mcp",                 auth: "mixed",  note: "JSON-RPC 2.0 — discovery public, tools/call auth-gated" },
    { m: "GET",  path: "/mcp/recent",          auth: "public", note: "Ring buffer of recent tools/call (last 50, isolate-scoped)" },
    { m: "POST", path: "/signals/search",      auth: "public", note: "REST equivalent of tools/call get_signals" },
    { m: "POST", path: "/signals/activate",    auth: "bearer", note: "REST equivalent of tools/call activate_signal" },
    { m: "POST", path: "/signals/estimate",    auth: "public", note: "Dry-run sizer for builder UIs (no persist)" },
    { m: "POST", path: "/signals/generate",    auth: "bearer", note: "Persist a composite from rules" },
    { m: "GET",  path: "/operations/:id",      auth: "bearer", note: "Single activation status" },
    { m: "GET",  path: "/operations",          auth: "bearer", note: "Paginated activation list, newest first" },
    { m: "POST", path: "/admin/reseed",        auth: "bearer", note: "Drop + re-seed signals table (operator only)" },
    { m: "GET",  path: "/signals/:id/embedding", auth: "bearer", note: "Raw UCP embedding vector for a signal" },
    { m: "POST", path: "/signals/query",       auth: "bearer", note: "NL audience query → AST → ranked matches" },
    { m: "GET",  path: "/ucp/concepts",        auth: "public", note: "UCP concept registry" },
    { m: "GET",  path: "/ucp/gts",             auth: "public", note: "UCP Global Trust Score endpoint" },
    { m: "GET",  path: "/.well-known/oauth-protected-resource", auth: "public", note: "RFC 9728 OAuth metadata" },
    { m: "GET",  path: "/.well-known/oauth-authorization-server", auth: "public", note: "RFC 8414 AS metadata" },
    { m: "GET",  path: "/privacy",             auth: "public", note: "DTS-referenced privacy page" },
    { m: "GET",  path: "/health",              auth: "public", note: "Liveness" },
  ];
  return '' +
    '<div class="rest-table-shell">' +
      '<table class="rest-table"><thead><tr><th>Method</th><th>Path</th><th>Auth</th><th>Purpose</th></tr></thead><tbody>' +
        rows.map((r) => '<tr>' +
          '<td><span class="rest-method m-' + r.m.toLowerCase() + '">' + r.m + '</span></td>' +
          '<td class="rest-path">' + escapeHtml(r.path) + '</td>' +
          '<td>' + renderAuthPill(r.auth) + '</td>' +
          '<td class="rest-note">' + escapeHtml(r.note) + '</td>' +
        '</tr>').join("") +
      '</tbody></table>' +
    '</div>';
}
function renderAuthPill(a) {
  if (a === "public") return '<span class="pill pill-muted">public</span>';
  if (a === "bearer") return '<span class="pill pill-accent">bearer</span>';
  if (a === "mixed")  return '<span class="pill pill-warning">mixed</span>';
  return '<span class="pill pill-muted">' + escapeHtml(a) + '</span>';
}

// Fetch tools/list via the MCP JSON-RPC endpoint (no auth required —
// discovery is public) and render each tool as a collapsible card.
// Called by loadCapabilities() after renderCapabilitiesHtml injects the
// placeholder. A failure leaves the placeholder in a muted error state
// but doesn't block the rest of the tab.
async function mountToolCatalog() {
  const host = document.getElementById("caps-tool-catalog");
  if (!host) return;
  try {
    const res = await fetch("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method: "tools/list", params: {} }),
    });
    const body = await res.json();
    const tools = body.result?.tools || [];
    if (tools.length === 0) {
      host.innerHTML = '<div style="padding:8px 4px;color:var(--text-mut);font-size:12px">tools/list returned 0 tools (unexpected).</div>';
      return;
    }
    host.innerHTML = tools.map((t) => renderToolCard(t)).join("");
  } catch (e) {
    host.innerHTML = '<div style="padding:8px 4px;color:var(--error);font-size:12px">Failed to load tools/list: ' + escapeHtml(e.message) + '</div>';
  }
}

function renderToolCard(tool) {
  const required = tool.inputSchema?.required || [];
  const props = tool.inputSchema?.properties || {};
  const propKeys = Object.keys(props);
  // Auth is a function of the method, not the tool — all tools/call go
  // through the bearer gate, tools/list doesn't. Reflect that honestly.
  return '' +
    '<details class="tool-card">' +
      '<summary class="tool-card-head">' +
        '<div class="tool-card-main">' +
          '<span class="tool-card-name">' + escapeHtml(tool.name) + '</span>' +
          '<span class="pill pill-accent">bearer (tools/call)</span>' +
          (required.length ? '<span class="pill pill-muted mono">' + required.length + ' required</span>' : '') +
        '</div>' +
        '<div class="tool-card-desc">' + escapeHtml(tool.description || "") + '</div>' +
      '</summary>' +
      '<div class="tool-card-body">' +
        (propKeys.length
          ? '<div class="tool-card-props-label">Parameters</div>' +
            '<div class="tool-card-props">' +
              propKeys.map((k) => {
                const p = props[k] || {};
                const isReq = required.includes(k);
                return '<div class="tool-prop">' +
                  '<div class="tool-prop-key"><span class="mono">' + escapeHtml(k) + '</span>' +
                    (isReq ? ' <span class="pill" style="background:rgba(239,68,68,0.12);color:var(--error);font-size:9.5px">required</span>' : '') +
                    ' <span class="tool-prop-type mono">' + escapeHtml(p.type || "any") + (p.enum ? " (enum)" : "") + '</span></div>' +
                  (p.description ? '<div class="tool-prop-desc">' + escapeHtml(p.description) + '</div>' : "") +
                  (Array.isArray(p.enum) ? '<div class="tool-prop-enum mono">' + p.enum.map((v) => '<span>' + escapeHtml(String(v)) + '</span>').join("") + '</div>' : "") +
                '</div>';
              }).join("") +
            '</div>'
          : '<div style="color:var(--text-mut);font-size:12px;padding:4px 2px">No parameters.</div>') +
        '<div class="tool-card-curl-label">Example curl</div>' +
        '<pre class="tool-card-curl">' + escapeHtml(buildExampleCurl(tool)) + '</pre>' +
      '</div>' +
    '</details>';
}

function buildExampleCurl(tool) {
  // Plausible argument values per tool — matches what Discover / Builder
  // pass so operators can replay a real request.
  const exampleArgs = {
    get_adcp_capabilities: {},
    get_signals: { signal_spec: "affluent streamers 25-44", deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] }, max_results: 5 },
    activate_signal: { signal_agent_segment_id: "sig_auto_in_market_new_suv", deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] } },
    get_operation_status: { task_id: "op_1700000000000_abcdef" },
    get_similar_signals: { signal_agent_segment_id: "sig_auto_in_market_new_suv", top_k: 5, deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] } },
    query_signals_nl: { query: "soccer moms 35+ who stream heavily", limit: 5 },
    get_concept: { concept_id: "SOCCER_MOM_US" },
    search_concepts: { q: "high income", limit: 5 },
  };
  const args = exampleArgs[tool.name] ?? {};
  const payload = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool.name, arguments: args } };
  // Line continuations require literal backslashes in the rendered JS
  // string. Because this whole SCRIPT_TAG body lives inside the outer
  // TypeScript template literal, each literal backslash needs four here
  // (TS-literal → JS-source → in-JS string-literal).
  const BS = "\\\\";
  return 'curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp ' + BS + '\\n' +
    '  -H "Authorization: Bearer demo-key-adcp-signals-v1" ' + BS + '\\n' +
    '  -H "Content-Type: application/json" ' + BS + '\\n' +
    "  -d '" + JSON.stringify(payload) + "'";
}

// Render a DTS v1.2 label as a grouped KV list. Fields are ordered by the
// IAB spec sections: Core, Audience, Data Sources, Onboarder. Long lists
// (data_sources, privacy mechanisms) render as pill chips.
function renderDtsLabel(dts) {
  if (!dts) return "";
  const groups = [
    {
      title: "Provider & audience",
      rows: [
        ["Provider", dts.provider_name],
        ["Domain", dts.provider_domain],
        ["Email", dts.provider_email],
        ["Audience name", dts.audience_name],
        ["Audience ID", dts.audience_id],
        ["Audience size", dts.audience_size != null ? dts.audience_size.toLocaleString() : null],
        ["Taxonomy IDs", dts.taxonomy_id_list],
        ["Originating domain", dts.originating_domain],
      ],
    },
    {
      title: "Audience details",
      rows: [
        ["Criteria", dts.audience_criteria],
        ["Scope", dts.audience_scope],
        ["Inclusion methodology", dts.audience_inclusion_methodology],
        ["Precision levels", Array.isArray(dts.audience_precision_levels) ? dts.audience_precision_levels.join(", ") : null],
        ["ID types", Array.isArray(dts.id_types) ? dts.id_types.join(", ") : null],
        ["Data sources", Array.isArray(dts.data_sources) ? dts.data_sources.join(", ") : null],
        ["Audience expansion", dts.audience_expansion],
        ["Device expansion", dts.device_expansion],
        ["Audience refresh", dts.audience_refresh],
        ["Lookback window", dts.lookback_window],
        ["Geocode list", dts.geocode_list],
      ],
    },
    {
      title: "Onboarder (offline sources)",
      rows: [
        ["Match keys", dts.onboarder_match_keys],
        ["Audience expansion", dts.onboarder_audience_expansion],
        ["Device expansion", dts.onboarder_device_expansion],
        ["Precision level", dts.onboarder_audience_precision_level],
      ],
    },
  ];

  // Phase D refinement: the IAB DTS "Privacy & compliance" group AND the
  // policy_attestations are the same conceptual layer (provider's
  // compliance posture) — just at different granularities. The IAB
  // fields describe HOW consent is honored (TCF / GPP / MSPA channels);
  // attestations describe WHICH agentic-advertising registry policies
  // the signal claims compliance with. Rendered as one group with the
  // attestations as a sub-section, instead of two sibling blocks
  // (which read as redundant).
  var attestations = Array.isArray(dts.policy_attestations) ? dts.policy_attestations : [];
  var attestSubBlock = "";
  if (attestations.length > 0) {
    attestSubBlock =
      '<div class="dts-attest-subhead">' +
        'Policy attestations ' +
        '<span class="pill pill-muted mono" style="font-size:9px;margin-left:6px">DTS v1.3 proposal · agentic-advertising registry</span>' +
      '</div>' +
      '<div class="dts-attest-list">' +
        attestations.map(function (a) {
          var cls = "dts-attest-" + (a.claim || "unknown").replace(/_/g, "-");
          var notes = a.notes ? '<span class="dts-attest-note">' + escapeHtml(a.notes) + '</span>' : '';
          return '<div class="dts-attest-row">' +
            '<span class="mono dts-attest-id">' + escapeHtml(a.policy_id || "?") + '</span>' +
            '<span class="dts-attest-claim ' + escapeHtml(cls) + ' mono">' + escapeHtml(a.claim || "unknown") + '</span>' +
            notes +
          '</div>';
        }).join("") +
      '</div>';
  }

  // Privacy + compliance group is rendered manually so we can interleave
  // the IAB kv-list with the attestation sub-block underneath it.
  var privacyKv = [
    ["Privacy mechanisms", Array.isArray(dts.privacy_compliance_mechanisms) ? dts.privacy_compliance_mechanisms.join(", ") : null],
    ["Privacy policy", dts.privacy_policy_url ? '<a href="' + escapeHtml(dts.privacy_policy_url) + '" target="_blank" rel="noopener">' + escapeHtml(dts.privacy_policy_url) + "</a>" : null],
    ["IAB Tech Lab compliant", dts.iab_techlab_compliant],
  ].filter(function (r) { return r[1] != null && r[1] !== ""; });

  var privacyBlock = (privacyKv.length || attestSubBlock)
    ? '<div class="dts-group">' +
        '<div class="dts-group-title">Privacy &amp; compliance</div>' +
        (privacyKv.length
          ? '<div class="dts-kv-list">' +
              privacyKv.map(function (r) {
                var k = r[0], v = r[1];
                var val = typeof v === "string" && v.indexOf("<a ") === 0 ? v : escapeHtml(String(v));
                return '<div class="dts-kv"><span class="dts-k">' + escapeHtml(k) + '</span><span class="dts-v">' + val + '</span></div>';
              }).join("") +
            '</div>'
          : '') +
        attestSubBlock +
      '</div>'
    : '';

  return '<div class="dts-groups">' +
    groups.map((g) => {
      const rows = g.rows.filter(([, v]) => v != null && v !== "");
      if (rows.length === 0) return "";
      return '' +
        '<div class="dts-group">' +
          '<div class="dts-group-title">' + escapeHtml(g.title) + '</div>' +
          '<div class="dts-kv-list">' +
            rows.map(([k, v]) => {
              const val = typeof v === "string" && v.startsWith("<a ") ? v : escapeHtml(String(v));
              return '<div class="dts-kv"><span class="dts-k">' + escapeHtml(k) + '</span><span class="dts-v">' + val + '</span></div>';
            }).join("") +
          '</div>' +
        '</div>';
    }).join("") +
    privacyBlock +
    '</div>';
}

function card(label, value, isHtml) {
  return '' +
    '<div class="caps-card">' +
      '<div class="caps-card-label">' + escapeHtml(label) + '</div>' +
      '<div class="caps-card-value ' + (isHtml ? 'small' : '') + '">' + (isHtml ? value : escapeHtml(value)) + '</div>' +
    '</div>';
}

// Minimal JSON syntax highlighter. Tokenizes on a regex that captures
// keys / strings / numbers / booleans / null / punctuation separately.
// Escaping done up-front so nothing injected can break out of a span.
function highlightJson(jsonText) {
  const escaped = escapeHtml(jsonText);
  return escaped.replace(
    /(&quot;(?:\\\\.|[^&])*?&quot;(?=\\s*:))|(&quot;(?:\\\\.|[^&])*?&quot;)|\\b(true|false)\\b|\\bnull\\b|(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|([{}\\[\\],])/g,
    (match, key, str, bool, num, punct) => {
      if (key)   return '<span class="json-key">' + key + '</span>';
      if (str)   return '<span class="json-str">' + str + '</span>';
      if (bool)  return '<span class="json-bool">' + bool + '</span>';
      if (match === "null") return '<span class="json-null">null</span>';
      if (num !== undefined) return '<span class="json-num">' + num + '</span>';
      if (punct) return '<span class="json-punct">' + punct + '</span>';
      return match;
    },
  );
}

//────────────────────────────────────────────────────────────────────────
// §6 Activations — poll GET /operations every 10s while visible
//────────────────────────────────────────────────────────────────────────
document.getElementById("refresh-activations").addEventListener("click", loadActivations);

`;
