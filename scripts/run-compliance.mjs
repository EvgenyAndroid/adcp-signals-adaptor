// scripts/run-compliance.mjs
// Drives @adcp/client `comply()` programmatically so we can pass a `test_kit`
// — something the CLI (`npx @adcp/client storyboard run`) has no flag for.
// Without the test_kit, security_baseline/oauth_discovery fires and needs RFC
// 9728 protected-resource metadata we don't serve. With `auth.api_key` +
// `probe_task: get_signals`, the runner takes the api-key path and verifies
// our existing Bearer auth: valid key → 200 on get_signals; invalid key → 401.
//
// Usage:
//   API_KEY=demo-key-adcp-signals-v1 npm run compliance
//   API_KEY=... AGENT_URL=https://... node scripts/run-compliance.mjs --json

import { comply, formatComplianceResults, formatComplianceResultsJSON } from "@adcp/client/testing";

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
      // Drives security_baseline/api_key_path. Must be in PROBE_TASK_ALLOWLIST
      // at dist/lib/testing/storyboard/test-kit.js — `get_signals` is listed
      // because it's auth-gated, read-only, and accepts an empty request body
      // (our callGetSignals at src/mcp/server.ts:332 defaults to limit=20,
      //  offset=0 when no args are supplied).
      probe_task: "get_signals",
      api_key: API_KEY,
    },
  },
};

try {
  const result = await comply(AGENT_URL, testOptions);
  if (jsonOutput) {
    process.stdout.write(JSON.stringify(formatComplianceResultsJSON(result), null, 2) + "\n");
  } else {
    console.log(formatComplianceResults(result));
  }
  process.exit(result.summary.tracks_failed > 0 ? 3 : 0);
} catch (err) {
  console.error(`compliance run failed: ${err?.message ?? err}`);
  if (process.env.DEBUG) console.error(err?.stack ?? err);
  process.exit(1);
}
