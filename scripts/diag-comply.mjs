// scripts/diag-comply.mjs
//
// AAO-style compliance diagnostic — runs `comply()` (the same engine AAO's
// registry grader uses) against the deployed agent and dumps per-track
// status + per-failure detail. Use this when AAO grades us anything other
// than "healthy" and we want to see exactly which storyboard step failed
// and why.
//
// Distinct from `scripts/run-compliance.mjs` (the existing smoke runner)
// because the two SDK APIs grade different rubrics:
//
//   testAllScenarios() (run-compliance.mjs)
//     - Higher-level aggregator; scenario-level pass/fail
//     - Useful as a fast smoke test ("did anything fundamentally break?")
//     - What we historically used since the @adcp/client → @adcp/sdk
//       migration
//
//   comply() (this script)
//     - Storyboard-driven engine; per-track pass/fail/partial/silent + a
//       flat list of step-level failures with structured validation detail
//     - What AAO uses to grade the registry
//     - REQUIRES the seller to advertise a `supported_versions` that
//       matches the SDK's bundled compliance cache. SDK 8.1.0-beta.13
//       ships only the 3.1.0-beta.5 cache; seller declaring `["3.0"]`
//       will error with "Compliance cache version X is not supported by
//       this seller." See README / #248 discussion thread for the
//       version-strict workaround when this surfaces.
//
// Why both exist: run-compliance.mjs gates the auto-write to
// complianceState.ts (the lightweight green/red signal for our deploy
// metadata). diag-comply.mjs is the deep diagnostic when AAO shows a
// gap — we don't auto-write from it because comply()'s richer "partial /
// silent" statuses don't fit the binary auto-write semantics cleanly,
// and the version-mismatch path makes failures non-comparable across
// runs until we conform to the bundled cache version.
//
// Usage:
//   API_KEY=demo-key-adcp-signals-v1 node scripts/diag-comply.mjs
//   API_KEY=... AGENT_URL=https://... node scripts/diag-comply.mjs --json
//
// On version mismatch: the script prints a clear diagnostic explaining
// the cache/seller mismatch and exits 4. AAO's grader appears to be
// more lenient (uses 3.1.0-beta.5 storyboards against [3.0] sellers
// without aborting) so the local diagnostic and AAO can diverge until
// we either declare 3.1 support or the SDK ships a 3.0.x cache. PR
// sequence A→B→C→D (#262, #263, #264, this) lands the storyboard fixes
// in-band; once AAO regrade flips to healthy, the version-mismatch
// surface goes away on the next 3.0/3.1-aligned SDK release.

import pkg from "@adcp/sdk/testing";
const { comply, formatComplianceResults, formatComplianceResultsJSON } = pkg;

const AGENT_URL = process.env.AGENT_URL ?? "https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp";
const API_KEY = process.env.API_KEY ?? process.env.DEMO_API_KEY;
const jsonOutput = process.argv.includes("--json");

if (!API_KEY) {
  console.error("ERROR: API_KEY not set (or DEMO_API_KEY)");
  process.exit(2);
}

const testOptions = {
  protocol: "mcp",
  auth: { type: "bearer", token: API_KEY },
  test_kit: {
    auth: {
      probe_task: "get_signals",
      api_key: API_KEY,
    },
  },
};

try {
  const result = await comply(AGENT_URL, testOptions);
  if (jsonOutput) {
    process.stdout.write(JSON.stringify(formatComplianceResultsJSON(result), null, 2) + "\n");
    process.exit(result.overall_status === "passing" ? 0 : 3);
  }
  console.log(formatComplianceResults(result));

  // Per-failure detail block — `formatComplianceResults()` summarizes but
  // doesn't dump the structured validation. For triage, surface every
  // failure's validation.check + json_pointer + expected/actual.
  if (result.failures?.length) {
    console.log("\n=== Per-failure detail ===");
    for (const f of result.failures) {
      console.log(`\n[${f.track}] ${f.storyboard_id} / ${f.step_id}`);
      if (f.step_title) console.log(`  title: ${f.step_title}`);
      if (f.task) console.log(`  task: ${f.task}`);
      if (f.expected) console.log(`  expected: ${f.expected.split("\n")[0]}`);
      if (f.error) console.log(`  error: ${f.error}`);
      if (f.validation) {
        console.log(`  validation.check: ${f.validation.check}`);
        if (f.validation.json_pointer) console.log(`  validation.json_pointer: ${f.validation.json_pointer}`);
        if (f.validation.expected !== undefined) console.log(`  validation.expected: ${JSON.stringify(f.validation.expected)}`);
        if (f.validation.actual !== undefined) console.log(`  validation.actual: ${JSON.stringify(f.validation.actual)?.slice(0, 200)}`);
      }
      if (f.fix_command) console.log(`  fix_command: ${f.fix_command}`);
    }
  }

  process.exit(result.overall_status === "passing" ? 0 : 3);
} catch (err) {
  const msg = err?.message ?? String(err);
  // Detect the version-mismatch surface and print actionable guidance
  // instead of just the raw error.
  if (msg.includes("Compliance cache version") && msg.includes("not supported by this seller")) {
    console.error("⚠️  Version-mismatch: SDK's bundled compliance cache version doesn't match the seller's `adcp.supported_versions`.\n");
    console.error(msg);
    console.error("\nThis happens when our agent declares an older `supported_versions` than the\n" +
      "compliance cache that ships with the installed SDK. AAO's grader appears to be\n" +
      "more lenient and runs the newer cache against older sellers regardless.\n\n" +
      "Workarounds for local diagnostic:\n" +
      "  1. Wait for SDK to ship a 3.0.x compliance cache, OR\n" +
      "  2. Bump capabilityService.ts's `supported_versions` to include the cache version\n" +
      "     (only honest if we actually conform to that spec line — currently we don't).\n\n" +
      "AAO will still grade us via its own runner (12h cadence); check the registry\n" +
      "page for the live grade.");
    process.exit(4);
  }
  console.error(`compliance run failed: ${msg}`);
  if (process.env.DEBUG) console.error(err?.stack ?? err);
  process.exit(1);
}
