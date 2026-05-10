// scripts/run-compliance.mjs
// Drives @adcp/client's compliance suite programmatically so we can pass a
// `test_kit` — something the CLI (`npx @adcp/client storyboard run`) has no
// flag for. Without the test_kit, security_baseline/oauth_discovery fires and
// needs RFC 9728 protected-resource metadata we don't serve. With
// `auth.api_key` + `probe_task: get_signals`, the runner takes the api-key
// path and verifies our existing Bearer auth: valid key → 200 on get_signals;
// invalid key → 401.
//
// API note: pre-5.13 used `comply()` + `formatComplianceResults*`; 5.13
// renamed this to `testAllScenarios()` + `formatSuiteResults*` and split the
// suite into 24 tool-gated scenarios. Default-export destructure is needed
// because the published bundle is CJS without named ESM re-exports.
//
// Side effect on success: writes src/constants/complianceState.ts so the
// /capabilities response's `ext.compliance.last_run` + counts reflect the
// passing run. The write fires ONLY when failed_count === 0 — a failed run
// leaves the previous passing baseline untouched, so the deployed pointer
// never advertises a regression. Pass `--no-write` to skip the side effect
// (e.g. for ad-hoc probes against staging); --json mode skips it too.
// PR #249 introduced the side effect; see src/constants/complianceState.ts
// for the data shape.
//
// Usage:
//   API_KEY=demo-key-adcp-signals-v1 npm run compliance
//   API_KEY=... AGENT_URL=https://... node scripts/run-compliance.mjs --json
//   node scripts/run-compliance.mjs --no-write    # read-only probe

import pkg from "@adcp/client/testing";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const { testAllScenarios, formatSuiteResults, formatSuiteResultsJSON } = pkg;

const AGENT_URL = process.env.AGENT_URL ?? "https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp";
const API_KEY = process.env.API_KEY ?? process.env.DEMO_API_KEY;
const jsonOutput = process.argv.includes("--json");
const skipWrite = process.argv.includes("--no-write") || jsonOutput;

if (!API_KEY) {
  console.error("ERROR: API_KEY not set (or DEMO_API_KEY)");
  process.exit(2);
}

const testOptions = {
  protocol: "mcp",
  auth: { type: "bearer", token: API_KEY },
  test_kit: {
    auth: {
      // Drives security_baseline/api_key_path. `get_signals` is auth-gated,
      // read-only, and accepts an empty request body (callGetSignals at
      // src/mcp/server.ts defaults to limit=20, offset=0 when no args
      // are supplied).
      probe_task: "get_signals",
      api_key: API_KEY,
    },
  },
};

/**
 * Render the canonical src/constants/complianceState.ts content from a
 * passing result. The runner overwrites the whole file (not just fields)
 * so the format stays stable and a stale comment can't drift from the
 * data. The History block from the prior file is preserved by prepending
 * today's entry to it.
 */
function renderComplianceState(result, prevSource) {
  const lastRun = (result.tested_at ?? new Date().toISOString()).slice(0, 10);
  const scenariosRun = [...result.scenarios_run].sort();
  const applicable = result.scenarios_run.length;
  const skipped = result.scenarios_skipped?.length ?? 0;
  const passed = result.passed_count;
  const failed = result.failed_count;

  const prevHistory = extractHistoryLines(prevSource);
  const todayEntry = `//   ${lastRun} — auto-written by scripts/run-compliance.mjs (${passed}/${applicable} applicable, ${skipped} skipped).`;
  const mergedHistory = dedupePreservingOrder([todayEntry, ...prevHistory]).join("\n");
  const scenarioBlock = scenariosRun.map((s) => `    ${JSON.stringify(s)},`).join("\n");

  return `// src/constants/complianceState.ts
//
// SINGLE SOURCE OF TRUTH for the most recent compliance run against the
// deployed Worker. Read by capabilityService.ts so /capabilities advertises
// the current pass state without drift.
//
// ⚠️  AUTO-GENERATED. Do not hand-edit individual fields — they will be
//    overwritten on the next successful \`npm run compliance\` run.
//
// To refresh:
//   API_KEY=$DEMO_API_KEY npm run compliance
//
// The runner (scripts/run-compliance.mjs) overwrites this file when (and
// ONLY when) the suite passes with failed_count === 0 — so \`last_run\`
// always points at the last passing run, never a regression. Commit + push
// the updated file to deploy the new state to /capabilities.
//
// History (auto-prepended; manual entries also preserved across rewrites):
${mergedHistory}

export const COMPLIANCE_STATE = {
  /** ISO date (YYYY-MM-DD) of the last passing compliance run. */
  last_run: ${JSON.stringify(lastRun)},

  /** Scenario IDs that ran (i.e. were applicable to this agent's tool surface). */
  scenarios_run: [
${scenarioBlock}
  ],

  /** Pass / fail / skip counts from the last passing run. */
  results: {
    applicable: ${applicable},
    passed: ${passed},
    failed: ${failed},
    skipped: ${skipped},
  },
} as const;
`;
}

function extractHistoryLines(prevSource) {
  if (!prevSource) return [];
  const lines = prevSource.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^\/\/ History/i.test(l));
  if (startIdx < 0) return [];
  const out = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    // History block ends at the first non-comment line (e.g. blank line
    // before `export const`).
    if (!l.startsWith("//")) break;
    out.push(l);
  }
  return out;
}

function dedupePreservingOrder(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

try {
  const result = await testAllScenarios(AGENT_URL, testOptions);
  if (jsonOutput) {
    process.stdout.write(JSON.stringify(formatSuiteResultsJSON(result), null, 2) + "\n");
  } else {
    console.log(formatSuiteResults(result));
  }

  // Side effect: bump complianceState.ts on a clean pass. Suppressed in
  // --json mode (CI) and --no-write mode (ad-hoc probes).
  if (!skipWrite && result.failed_count === 0 && result.passed_count > 0) {
    const __filename = fileURLToPath(import.meta.url);
    const statePath = resolve(dirname(__filename), "..", "src", "constants", "complianceState.ts");
    let prev = "";
    try {
      prev = readFileSync(statePath, "utf8");
    } catch {
      // First run on a fresh checkout: no previous file, history starts fresh.
    }
    const next = renderComplianceState(result, prev);
    if (next !== prev) {
      writeFileSync(statePath, next, "utf8");
      console.log(`\n→ wrote ${statePath} (last_run=${(result.tested_at ?? "").slice(0, 10)}, ${result.passed_count}/${result.scenarios_run.length} applicable). Commit + push to deploy.`);
    } else {
      console.log(`\n→ ${statePath} already up to date.`);
    }
  } else if (!skipWrite && result.failed_count > 0) {
    console.log(`\n→ skipped writing complianceState.ts (${result.failed_count} failed) — previous passing baseline preserved.`);
  }

  process.exit(result.failed_count > 0 ? 3 : 0);
} catch (err) {
  console.error(`compliance run failed: ${err?.message ?? err}`);
  if (process.env.DEBUG) console.error(err?.stack ?? err);
  process.exit(1);
}
