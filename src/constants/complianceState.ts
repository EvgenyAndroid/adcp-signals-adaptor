// src/constants/complianceState.ts
//
// SINGLE SOURCE OF TRUTH for the most recent compliance run against the
// deployed Worker. Read by capabilityService.ts so /capabilities advertises
// the current pass state without drift.
//
// ⚠️  AUTO-GENERATED. Do not hand-edit individual fields — they will be
//    overwritten on the next successful `npm run compliance` run.
//
// To refresh:
//   API_KEY=$DEMO_API_KEY npm run compliance
//
// The runner (scripts/run-compliance.mjs) overwrites this file when (and
// ONLY when) the suite passes with failed_count === 0 — so `last_run`
// always points at the last passing run, never a regression. Commit + push
// the updated file to deploy the new state to /capabilities.
//
// History (auto-prepended; manual entries also preserved across rewrites):
//   2026-06-27 — auto-written by scripts/run-compliance.mjs (7/7 applicable, 32 skipped).
//   2026-06-07 — auto-written by scripts/run-compliance.mjs (7/7 applicable, 32 skipped).
//   2026-06-01 — auto-written by scripts/run-compliance.mjs (7/7 applicable, 32 skipped).
//   2026-05-22 — auto-written by scripts/run-compliance.mjs (7/7 applicable, 32 skipped).
//   2026-05-16 — auto-written by scripts/run-compliance.mjs (7/7 applicable, 32 skipped).
//   2026-05-15 — auto-written by scripts/run-compliance.mjs (7/7 applicable, 32 skipped).
//   2026-05-10 — auto-written by scripts/run-compliance.mjs (7/7 applicable, 32 skipped).
//   2026-05-10 — bumped from 2026-05-08 in PR #249; introduced auto-write.
//   2026-05-08 — first full 7/7 against 5.25.1 after VERSION_UNSUPPORTED
//                enforcement (PR #246).

export const COMPLIANCE_STATE = {
  /** ISO date (YYYY-MM-DD) of the last passing compliance run. */
  last_run: "2026-06-27",

  /** The @adcp/sdk build that executed the suite, captured live by the
   *  runner so /capabilities never advertises a stale runner version. */
  client_runner: "@adcp/sdk@9.2.0",

  /** Scenario IDs that ran (i.e. were applicable to this agent's tool surface). */
  scenarios_run: [
    "capability_discovery",
    "discovery",
    "error_handling",
    "health_check",
    "schema_compliance",
    "signals_flow",
    "validation",
  ],

  /** Pass / fail / skip counts from the last passing run. */
  results: {
    applicable: 7,
    passed: 7,
    failed: 0,
    skipped: 32,
  },
} as const;
