#!/usr/bin/env node
// scripts/run-compliance.mjs
//
// Runs the AdCP STORYBOARD conformance suite — the suite the AAO grader (the
// registry card at agenticadvertising.org) actually runs — against the
// deployed signals agent, and refreshes src/constants/complianceState.ts on
// a passing run so /capabilities advertises real numbers.
//
// WHY THIS CHANGED (2026-09-07). Until now this script drove
// `testAllScenarios()` from @adcp/sdk/testing. That is the LEGACY scenario
// suite: 7 scenarios for a signals-only agent, 32 skipped, and byte-identical
// output on @adcp/sdk 5.25.1 and 13.0.0. It never reproduced the registry
// card (57 scenarios / 35 storyboards on the 3.1.x line) at ANY SDK version,
// because the card is graded by the storyboard runner (`adcp storyboard
// run`), which this repo had never adopted. The sales agent
// (nofluffadvisory/adcp-sales-agent/scripts/compliance.mjs) did; this mirrors
// it. Every gotcha below was paid for over there first.
//
//   1. VERSION. package.json pins @adcp/sdk to the GA build the grader runs
//      (13.0.2 = AdCP 3.1.20 — the line the registry card grades on;
//      13.0.0 = 3.1.15 before that, and this agent's results were
//      byte-identical across the two on 2026-09-07). npm `latest` and this
//      repo's old ^12.1.1 range bundle far older cache lines (12.1.1 =
//      AdCP 3.1.5); a run on those silently hides whole storyboards. This
//      script asserts the pinned line's cache is present before running so
//      a stray `npm install` can't quietly downgrade the suite.
//   2. --test-kit. Steps declaring `auth: {from_test_kit: true}` read the
//      KIT's api_key, not --auth. Without a kit those probes go out with no
//      Authorization header and a conformant agent fails its own
//      security_baseline. The template lives in
//      scripts/compliance/signal-stack.kit.yaml with the key blanked; the
//      key is injected from API_KEY into a temp file at run time and deleted
//      afterwards, so it never lands in git.
//   3. --compliance-version. The runner ignores the cache line the kit path
//      points into; without the flag it runs its bundled default line.
//   4. --timeout 300. The default 120s soft budget can clip a cold run and
//      print a clean-looking partial total. Look for a timeout-budget
//      advisory in the report before trusting any number.
//   5. Target the REGISTERED endpoint (adcp.signal-stack.io/mcp) — that is
//      what the card keys on — not the workers.dev origin. Override with
//      --url or AGENT_URL for staging.
//
// Side effect on success (contract unchanged from the legacy script): writes
// src/constants/complianceState.ts, which capabilityService.ts reads. The
// write fires ONLY when the run has zero failed steps and zero failed
// scenarios — a run with failures leaves the previous passing baseline
// untouched, so /capabilities never advertises a regression. `--no-write`
// skips it (ad-hoc probes); `--json` skips it and prints a compact summary
// instead of the human report. The served /capabilities block keeps its
// old field set (last_run, client_runner, results, scenarios_run); the
// step- and storyboard-level breakdown is stored alongside for humans.
//
// Usage:
//   API_KEY=... npm run compliance
//   API_KEY=... npm run compliance -- --no-write        # read-only probe
//   API_KEY=... npm run compliance -- --json            # compact JSON, no write
//   API_KEY=... npm run compliance -- --url https://…   # another endpoint
//   AGENT_URL is honoured too (--url wins). DEMO_API_KEY is an accepted
//   alias for API_KEY. The key is never printed.
//
// Exit codes: 0 pass · 3 failures · 2 missing key / setup · 1 runner error.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// The GA line the grader runs. Bump BOTH together, and re-verify against the
// card before trusting the new numbers (see the sales agent's history: a
// line bump has changed pass/fail on individual steps more than once).
const SDK_PIN = "13.0.2";
const LINE = "3.1.20";

const SDK_DIR = resolve(ROOT, "node_modules", "@adcp", "sdk");
const CLI = join(SDK_DIR, "bin", "adcp.js");
const CACHE = join(SDK_DIR, "compliance", "cache", LINE);
const KIT_TEMPLATE = resolve(ROOT, "scripts", "compliance", "signal-stack.kit.yaml");
const STATE_PATH = resolve(ROOT, "src", "constants", "complianceState.ts");

// Captured live, not hardcoded, so /capabilities advertises the build that
// really executed the suite and can never drift past a dependency bump.
const INSTALLED = require("@adcp/sdk/package.json").version;
const CLIENT_RUNNER = `@adcp/sdk@${INSTALLED}`;

// ---- args ------------------------------------------------------------------
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const skipWrite = args.includes("--no-write") || jsonOutput;
const urlFlag = args.indexOf("--url");
const AGENT_URL =
  (urlFlag >= 0 && args[urlFlag + 1]) ||
  process.env.AGENT_URL ||
  "https://adcp.signal-stack.io/mcp";
const API_KEY = process.env.API_KEY ?? process.env.DEMO_API_KEY;

const log = (...a) => { if (!jsonOutput) console.log(...a); };
const die = (code, msg) => { console.error(`ERROR: ${msg}`); process.exit(code); };

if (!API_KEY) die(2, "API_KEY not set (or DEMO_API_KEY)");
if (!existsSync(CLI)) die(2, `@adcp/sdk CLI not found at ${CLI} — run npm install`);
if (!existsSync(CACHE)) {
  die(2, `@adcp/sdk ${INSTALLED} does not bundle compliance line ${LINE} (expected ${SDK_PIN}). ` +
         `Run \`npm install\` to restore the pinned build, or bump SDK_PIN/LINE together.`);
}
if (INSTALLED !== SDK_PIN) {
  console.error(`WARN: installed @adcp/sdk ${INSTALLED} != pinned ${SDK_PIN}; line ${LINE} is present so continuing.`);
}
if (!existsSync(KIT_TEMPLATE)) die(2, `kit template missing: ${KIT_TEMPLATE}`);

// ---- run ------------------------------------------------------------------
let tmp;
let raw;
try {
  // Render the kit with the real key into a private temp dir (0700), never
  // into the repo. Deleted in `finally` even if the runner throws.
  tmp = mkdtempSync(join(tmpdir(), "adcp-signals-kit-"));
  const kitPath = join(tmp, "signal-stack.kit.yaml");
  const template = readFileSync(KIT_TEMPLATE, "utf8");
  if (!template.includes("__API_KEY__")) die(2, "kit template has no __API_KEY__ placeholder");
  writeFileSync(kitPath, template.replace("__API_KEY__", API_KEY), { mode: 0o600 });

  log(`\n──── storyboard suite · ${AGENT_URL} · AdCP ${LINE} via ${CLIENT_RUNNER} ────`);
  const argv = [
    CLI, "storyboard", "run", AGENT_URL,
    "--auth", API_KEY,
    "--test-kit", kitPath,
    "--compliance-version", LINE,
    "--timeout", "300",
    "--json", // machine result on stdout; the human report goes to stderr
  ];
  const r = spawnSync(process.execPath, argv, {
    cwd: ROOT,
    encoding: "utf8",
    // The JSON embeds every step's details (~1 MB for this agent). Node's
    // 1 MiB default maxBuffer would truncate it and hand us invalid JSON.
    maxBuffer: 256 * 1024 * 1024,
    // Human mode: stream the runner's own report live. JSON mode: swallow it.
    stdio: ["ignore", "pipe", jsonOutput ? "pipe" : "inherit"],
  });
  if (r.error) throw r.error;
  if (!r.stdout || !r.stdout.trim()) {
    throw new Error(`runner produced no JSON (exit ${r.status}, signal ${r.signal})` +
      (jsonOutput && r.stderr ? `\n${r.stderr.slice(-2000)}` : ""));
  }
  raw = JSON.parse(r.stdout);
} catch (err) {
  console.error(`compliance run failed: ${err?.message ?? err}`);
  if (process.env.DEBUG) console.error(err?.stack ?? err);
  process.exit(1);
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}

// ---- shape the result ------------------------------------------------------
// Scenario-level numbers keep the legacy `results` semantics (the served
// /capabilities field names say "scenarios"). A scenario counts as run if it
// belongs to a tested track; scenarios listed under tracks the runner
// skipped wholesale are counted as skipped.
const tested = new Set((raw.tested_tracks ?? []).map((t) => t.track));
const run = [];
let scenariosSkipped = 0;
for (const t of raw.tracks ?? []) {
  const list = t.scenarios ?? [];
  if (tested.has(t.track)) {
    for (const s of list) run.push({ id: s.scenario, passed: s.overall_passed === true });
  } else {
    scenariosSkipped += list.length;
  }
  scenariosSkipped += t.skipped_scenarios?.length ?? 0;
}
const scenariosRun = run.map((s) => s.id).sort();
const scenarioPassed = run.filter((s) => s.passed).length;
const scenarioFailed = run.length - scenarioPassed;
const S = raw.summary ?? {};

const result = {
  agent_url: raw.agent_url,
  adcp_version: raw.adcp_version ?? LINE,
  client_runner: CLIENT_RUNNER,
  overall_status: raw.overall_status,
  headline: S.headline ?? "",
  tested_at: raw.tested_at ?? new Date().toISOString(),
  duration_ms: raw.total_duration_ms ?? 0,
  scenarios: {
    applicable: run.length,
    passed: scenarioPassed,
    failed: scenarioFailed,
    skipped: scenariosSkipped,
    run: scenariosRun,
  },
  steps: {
    passed: S.steps_passed ?? 0,
    failed: S.steps_failed ?? 0,
    skipped: S.steps_skipped ?? 0,
    total: S.total_steps ?? 0,
  },
  storyboards: {
    executed: [...(raw.storyboards_executed ?? [])].sort(),
    missing_tools: [...(raw.storyboards_missing_tools ?? [])].sort(),
  },
  skipped_by_reason: S.skipped_by_reason ?? {},
  notices: (raw.notices ?? []).map(({ severity, code, message }) => ({ severity, code, message })),
};

const passing = result.steps.failed === 0 && result.scenarios.failed === 0 && result.steps.passed > 0;

// ---- output ---------------------------------------------------------------
if (jsonOutput) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} else {
  log(`\n${passing ? "✅" : "❌"} ${result.headline || result.overall_status} · ` +
      `${result.scenarios.passed}/${result.scenarios.applicable} scenarios · ` +
      `${result.steps.passed}/${result.steps.total} steps passed, ${result.steps.failed} failed, ${result.steps.skipped} skipped · ` +
      `${result.storyboards.executed.length} storyboards run, ${result.storyboards.missing_tools.length} not applicable`);
  for (const n of result.notices) log(`   ${n.severity.toUpperCase()} ${n.code}`);
}

// ---- side effect: refresh complianceState.ts on a clean run -----------------
if (!skipWrite && passing) {
  let prev = "";
  try { prev = readFileSync(STATE_PATH, "utf8"); } catch { /* fresh checkout */ }
  const next = renderComplianceState(result, prev);
  if (next !== prev) {
    writeFileSync(STATE_PATH, next, "utf8");
    log(`\n→ wrote ${STATE_PATH} (last_run=${result.tested_at.slice(0, 10)}, ` +
        `${result.scenarios.passed}/${result.scenarios.applicable} scenarios, ${result.steps.passed}/${result.steps.total} steps). Commit + push to deploy.`);
  } else {
    log(`\n→ ${STATE_PATH} already up to date.`);
  }
} else if (!skipWrite && !passing) {
  log(`\n→ skipped writing complianceState.ts (${result.steps.failed} failed step(s), ` +
      `${result.scenarios.failed} failed scenario(s)) — previous passing baseline preserved.`);
}

process.exit(passing ? 0 : 3);

// ---- complianceState.ts renderer ------------------------------------------
/**
 * Render the canonical src/constants/complianceState.ts from a passing
 * result. The whole file is overwritten (not just fields) so the format stays
 * stable and a stale comment can't drift from the data. The History block
 * from the prior file is preserved by prepending today's entry to it.
 */
function renderComplianceState(res, prevSource) {
  const lastRun = res.tested_at.slice(0, 10);
  const prevHistory = extractHistoryLines(prevSource);
  const todayEntry =
    `//   ${lastRun} — auto-written by scripts/run-compliance.mjs ` +
    `(${res.scenarios.passed}/${res.scenarios.applicable} scenarios, ` +
    `${res.steps.passed}/${res.steps.total} steps passed, ${res.steps.skipped} skipped, ` +
    `${res.storyboards.executed.length} storyboards; AdCP ${res.adcp_version} via ${res.client_runner}).`;
  const mergedHistory = dedupePreservingOrder([todayEntry, ...prevHistory]).join("\n");
  const list = (arr, indent) => arr.map((s) => `${indent}${JSON.stringify(s)},`).join("\n");

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
// The runner (scripts/run-compliance.mjs) drives the AdCP STORYBOARD suite —
// the same suite the AAO registry card is graded on — and overwrites this
// file when (and ONLY when) the run has zero failed steps and zero failed
// scenarios, so \`last_run\` always points at the last passing run, never a
// regression. Commit + push the updated file to deploy the new state to
// /capabilities.
//
// History (auto-prepended; manual entries also preserved across rewrites):
${mergedHistory}

export const COMPLIANCE_STATE = {
  /** ISO date (YYYY-MM-DD) of the last passing compliance run. */
  last_run: ${JSON.stringify(lastRun)},

  /** The @adcp/sdk build that executed the suite, captured live by the
   *  runner so /capabilities never advertises a stale runner version. */
  client_runner: ${JSON.stringify(res.client_runner)},

  /** AdCP compliance line the storyboards were resolved from. */
  compliance_line: ${JSON.stringify(res.adcp_version)},

  /** Runner headline for the run (track-level status, e.g. "1 partial, 2 silent"). */
  headline: ${JSON.stringify(res.headline)},

  /** Scenario IDs that ran (i.e. were applicable to this agent's tool surface). */
  scenarios_run: [
${list(res.scenarios.run, "    ")}
  ],

  /** Scenario-level pass / fail / skip counts from the last passing run.
   *  Served on /capabilities as \`results\`. */
  results: {
    applicable: ${res.scenarios.applicable},
    passed: ${res.scenarios.passed},
    failed: ${res.scenarios.failed},
    skipped: ${res.scenarios.skipped},
  },

  /** Step-level counts for the same run (the runner's primary accounting). */
  steps: {
    passed: ${res.steps.passed},
    failed: ${res.steps.failed},
    skipped: ${res.steps.skipped},
    total: ${res.steps.total},
  },

  /** Storyboards the runner executed vs. skipped for tools this agent
   *  does not advertise (the badge gate is storyboard-level). */
  storyboards: {
    executed: [
${list(res.storyboards.executed, "      ")}
    ],
    missing_tools: [
${list(res.storyboards.missing_tools, "      ")}
    ],
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
    // History block ends at the first non-comment line (the blank line
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
