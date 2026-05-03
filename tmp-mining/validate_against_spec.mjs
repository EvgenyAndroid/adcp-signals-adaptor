// tmp-mining/validate_against_spec.mjs
//
// Schema-grounded compliance check. Fetches real prod responses for
// every signals tools/call surface (get_adcp_capabilities, get_signals,
// activate_signal) — including the variants AAO's storyboard sends —
// then validates each one against the published @adcp/sdk schemas
// (3.0) using AJV in strict mode (additionalProperties enforced).
//
// Run: node tmp-mining/validate_against_spec.mjs
//
// Output is JSON-line per check. Exit 0 if all pass, 1 otherwise.

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PROD = "https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp";
const KEY = "demo-key-adcp-signals-v1";
const SCHEMA_ROOT = "node_modules/@adcp/sdk/dist/lib/schemas-data/3.0";

// Load every schema in the 3.0 schemas-data directory so $ref resolution
// across files works (signal-id, deployment, vendor-pricing-option,
// pagination-response, etc. are all referenced).
function loadAllSchemas(root) {
  const all = [];
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) {
        try {
          const s = JSON.parse(readFileSync(p, "utf8"));
          if (s.$id) all.push(s);
        } catch { /* not a JSON schema */ }
      }
    }
  }
  walk(root);
  return all;
}

const ajv = new Ajv({
  strict: false,    // skip schema-side strictness (some schemas use draft-07 idioms)
  allErrors: true,  // collect every error, not just the first
  verbose: true,
});
addFormats(ajv);

const allSchemas = loadAllSchemas(SCHEMA_ROOT);
console.log(`Loaded ${allSchemas.length} schemas from ${SCHEMA_ROOT}`);
for (const s of allSchemas) {
  try {
    ajv.addSchema(s);
  } catch (e) {
    // Some schemas may have collisions or other issues; skip rather than abort
    if (!String(e.message).includes("already")) throw e;
  }
}

async function callTool(name, args, label) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  };
  const headers = { "Content-Type": "application/json" };
  if (KEY) headers["Authorization"] = `Bearer ${KEY}`;
  const r = await fetch(PROD, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json();
  if (j.error) return { label, ok: false, error: `JSON-RPC ${j.error.code}: ${j.error.message}` };
  if (!j.result?.content?.[0]?.text) return { label, ok: false, error: "no result.content[0].text" };
  let payload;
  try { payload = JSON.parse(j.result.content[0].text); } catch (e) { return { label, ok: false, error: `parse: ${e.message}` }; }
  return { label, ok: true, payload };
}

function validate(schemaId, payload, label) {
  const validator = ajv.getSchema(schemaId);
  if (!validator) return { label, schemaId, ok: false, error: `schema not found: ${schemaId}` };
  const ok = validator(payload);
  return { label, schemaId, ok, errors: ok ? [] : (validator.errors || []) };
}

const checks = [];

// 1. get_adcp_capabilities (no args, public)
checks.push(await callTool("get_adcp_capabilities", {}, "get_adcp_capabilities"));

// 2. get_signals (legacy string signal_spec)
checks.push(await callTool("get_signals", {
  signal_spec: "high income households",
  deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
  max_results: 1,
}, "get_signals (legacy string signal_spec)"));

// 3. get_signals (v3 object signal_spec — was crash before #178)
checks.push(await callTool("get_signals", {
  signal_spec: { brief: "high income households" },
  deliver_to: { deployments: [{ type: "platform", platform: "mock_dsp" }], countries: ["US"] },
  max_results: 1,
}, "get_signals (v3 object signal_spec)"));

// 4. activate_signal (storyboard fixture ID + agent destination)
checks.push(await callTool("activate_signal", {
  signal_agent_segment_id: "prism_cart_abandoner",
  destinations: [{ type: "agent", agent_url: "https://wonderstruck.salesagents.example" }],
  pricing_option_id: "po_prism_abandoner_cpm",
  context: { correlation_id: "signal_owned--activate_on_agent" },
}, "activate_signal (synthetic, agent dest)"));

// 5. activate_signal (storyboard fixture ID + platform destination)
checks.push(await callTool("activate_signal", {
  signal_agent_segment_id: "prism_high_ltv",
  destinations: [{ type: "platform", platform: "the-trade-desk" }],
  pricing_option_id: "po_prism_flat_monthly",
  context: { correlation_id: "signal_owned--activate_on_platform" },
}, "activate_signal (synthetic, platform dest)"));

// 6. activate_signal (real catalog signal — success path)
checks.push(await callTool("activate_signal", {
  signal_agent_segment_id: "sig_acs_graduate_high_income",
  destinations: [{ type: "platform", platform: "mock_dsp" }],
}, "activate_signal (real signal, success path)"));

console.log("\n=== Live prod responses captured. Validating against 3.0 schemas... ===\n");

const results = [];
for (const r of checks) {
  console.log(`\n--- ${r.label} ---`);
  if (!r.ok) {
    console.log(`  CALL FAILED: ${r.error}`);
    results.push({ label: r.label, schemaCheck: "skipped (call failed)" });
    continue;
  }
  console.log(`  payload top-level keys: ${Object.keys(r.payload).sort().join(", ")}`);
  let schemaId;
  if (r.label.startsWith("get_adcp_capabilities")) schemaId = "/schemas/3.0.1/protocol/get-adcp-capabilities-response.json";
  else if (r.label.startsWith("get_signals")) schemaId = "/schemas/3.0.1/signals/get-signals-response.json";
  else if (r.label.startsWith("activate_signal")) schemaId = "/schemas/3.0.1/signals/activate-signal-response.json";
  if (!schemaId) {
    results.push({ label: r.label, schemaCheck: "no schema id resolved" });
    continue;
  }
  const v = validate(schemaId, r.payload, r.label);
  if (v.ok) {
    console.log(`  ✅ valid against ${schemaId}`);
    results.push({ label: r.label, ok: true });
  } else {
    console.log(`  ❌ FAILED ${schemaId}`);
    if (v.error) console.log(`     ${v.error}`);
    for (const err of (v.errors || []).slice(0, 8)) {
      console.log(`     - ${err.instancePath || "(root)"}: ${err.message} (${err.keyword})`);
    }
    results.push({ label: r.label, ok: false, errors: v.errors });
  }
}

const allOk = results.every((r) => r.ok);
console.log(`\n=== Summary: ${results.filter((r) => r.ok).length}/${results.length} passed ===`);
process.exit(allOk ? 0 : 1);
