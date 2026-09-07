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
// The runner (scripts/run-compliance.mjs) drives the AdCP STORYBOARD suite —
// the same suite the AAO registry card is graded on — and overwrites this
// file when (and ONLY when) the run has zero failed steps and zero failed
// scenarios, so `last_run` always points at the last passing run, never a
// regression. Commit + push the updated file to deploy the new state to
// /capabilities.
//
// History (auto-prepended; manual entries also preserved across rewrites):
//   2026-09-07 — auto-written by scripts/run-compliance.mjs (49/49 scenarios, 32/77 steps passed, 45 skipped, 15 storyboards; AdCP 3.1.15 via @adcp/sdk@13.0.0).
//   2026-08-04 — auto-written by scripts/run-compliance.mjs (7/7 applicable, 32 skipped).
//   2026-07-31 — auto-written by scripts/run-compliance.mjs (7/7 applicable, 32 skipped).
//   2026-07-16 — auto-written by scripts/run-compliance.mjs (7/7 applicable, 32 skipped).
//   2026-06-30 — auto-written by scripts/run-compliance.mjs (7/7 applicable, 32 skipped).
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
  last_run: "2026-09-07",

  /** The @adcp/sdk build that executed the suite, captured live by the
   *  runner so /capabilities never advertises a stale runner version. */
  client_runner: "@adcp/sdk@13.0.0",

  /** AdCP compliance line the storyboards were resolved from. */
  compliance_line: "3.1.15",

  /** Runner headline for the run (track-level status, e.g. "1 partial, 2 silent"). */
  headline: "1 partial, 2 silent",

  /** Scenario IDs that ran (i.e. were applicable to this agent's tool surface). */
  scenarios_run: [
    "billing_gate_dispatch/not_applicable",
    "capability_discovery/protocol_discovery",
    "deterministic_testing/not_applicable",
    "error_compliance/not_applicable",
    "error_compliance_signals/capability_discovery",
    "error_compliance_signals/error_responses",
    "error_compliance_signals/error_structure",
    "error_compliance_signals/error_transport",
    "error_compliance_signals/version_negotiation",
    "get_media_buys_pagination_integrity/not_applicable",
    "get_signals_pagination_integrity/capability_discovery",
    "get_signals_pagination_integrity/pagination_walk",
    "idempotency/__controller_seeding__",
    "idempotency/capability_discovery",
    "idempotency/concurrent_retry",
    "idempotency/fresh_key_new_resource",
    "idempotency/missing_key",
    "idempotency/rate_limit_replay_invariant",
    "idempotency/replay_same_payload",
    "idempotency/verify_media_buy_count",
    "notification_config_event_scope/not_applicable",
    "notification_config_lifecycle/not_applicable",
    "notification_config_rejections/not_applicable",
    "pagination_integrity/not_applicable",
    "pagination_integrity_collection_lists/not_applicable",
    "pagination_integrity_content_standards/not_applicable",
    "pagination_integrity_creative_formats/not_applicable",
    "pagination_integrity_list_accounts/not_applicable",
    "pagination_integrity_property_lists/not_applicable",
    "read_tool_idempotency/omitted_key_grace_accept_path",
    "read_tool_idempotency/omitted_key_grace_assertion",
    "read_tool_idempotency/omitted_key_grace_reject_path",
    "read_tool_idempotency/read_requests_accept_idempotency_key",
    "schema_validation/not_applicable",
    "schema_validation_signals/capability_discovery",
    "schema_validation_signals/schema_compliance",
    "signal_owned/capability_discovery",
    "signal_owned/discovery",
    "signals_baseline/capability_discovery",
    "signals_baseline/discovery",
    "signals_baseline/get_signals_async/not_applicable",
    "stale_response_advisory/not_applicable",
    "v3_envelope_integrity/envelope_integrity_check",
    "version_negotiation/capabilities_advertise_and_echo",
    "webhook_emission/requirement_unmet",
    "webhook_receiver_envelope/requirement_unmet",
    "wholesale_feed_bulk_webhooks/not_applicable",
    "wholesale_feed_signal_webhooks/not_applicable",
    "wholesale_feed_signals/conditional_fetch",
  ],

  /** Scenario-level pass / fail / skip counts from the last passing run.
   *  Served on /capabilities as `results`. */
  results: {
    applicable: 49,
    passed: 49,
    failed: 0,
    skipped: 5,
  },

  /** Step-level counts for the same run (the runner's primary accounting). */
  steps: {
    passed: 32,
    failed: 0,
    skipped: 45,
    total: 77,
  },

  /** Storyboards the runner executed vs. skipped for tools this agent
   *  does not advertise (the badge gate is storyboard-level). */
  storyboards: {
    executed: [
      "capability_discovery",
      "error_compliance_signals",
      "get_signals_pagination_integrity",
      "idempotency",
      "read_tool_idempotency",
      "schema_validation_signals",
      "security_baseline",
      "signal_owned",
      "signals_baseline",
      "signed_requests",
      "v3_envelope_integrity",
      "version_negotiation",
      "webhook_emission",
      "webhook_receiver_envelope",
      "wholesale_feed_signals",
    ],
    missing_tools: [
      "billing_gate_dispatch",
      "canonical_format_validate_input",
      "comply_controller_mode_gate",
      "deterministic_testing",
      "error_compliance",
      "get_media_buys_pagination_integrity",
      "get_products_pagination_integrity",
      "notification_config_event_scope",
      "notification_config_lifecycle",
      "notification_config_rejections",
      "pagination_integrity",
      "pagination_integrity_collection_lists",
      "pagination_integrity_content_standards",
      "pagination_integrity_creative_formats",
      "pagination_integrity_list_accounts",
      "pagination_integrity_property_lists",
      "schema_validation",
      "signals_baseline/get_signals_async",
      "stale_response_advisory",
      "wholesale_feed_bulk_webhooks",
      "wholesale_feed_product_webhooks",
      "wholesale_feed_products",
      "wholesale_feed_signal_webhooks",
    ],
  },
} as const;
