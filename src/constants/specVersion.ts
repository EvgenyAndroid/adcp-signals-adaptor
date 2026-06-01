// src/constants/specVersion.ts
//
// Single source of truth for the AdCP spec version we conform to.
// The sidebar footer reads from these so the displayed version isn't
// stale-by-default. When a new spec patch lands and we re-test, bump
// SPEC_VERSION here and the UI updates everywhere it's referenced.
//
// Watcher could PR a bump automatically when the daily check sees a
// new spec_release.latest_tag — post-workshop polish.

/** Major-version line we conform to. Stable string for a long time. */
export const ADCP_MAJOR_LINE = "3.0 GA";

/** Specific spec patch version we're tested against. Bump on each
 *  successful conformance pass against a new patch.
 *
 *  3.0.12 (2026-05-13): two real schema changes (triggers re-vendor):
 *  (1) `account.supported_billing` gated by `media_buy` in
 *  `supported_protocols` via a root `allOf` if/then guard — relaxes
 *  what was previously an unconditional MUST on every agent. No
 *  impact on us (we don't expose `media_buy`); SDKs using codegens
 *  that drop draft-07 if/then need a runtime guard. (2) TMP
 *  `identity-match-request.json` requires `seller_agent_url` (was
 *  optional) and relaxes `package_ids` to optional. Experimental
 *  schema we don't ride. Also two storyboard additions:
 *  `comply_controller_mode_gate` universal storyboard + the
 *  `force_scenario_unsupported` errata clarifying that UNKNOWN_SCENARIO
 *  on `force_*` controller steps grades `not_applicable`. We don't
 *  implement `comply_test_controller`, so those are informational.
 *  Re-vendored corpus (3.0.8 → 3.0.12) in the same PR.
 *
 *  3.0.11 (2026-05-11): storyboard-only — collapses the
 *  `key_reuse_conflict` phase of `universal/idempotency.yaml` into
 *  `replay_same_payload` as a fourth step, to make an adcp-client
 *  runner fix safe to land. Release notes: "no behavior change for
 *  sellers, only restructures the storyboard." Wire format unchanged.
 *
 *  3.0.10 (2026-05-10): storyboard-only — converts the remaining
 *  12 static `idempotency_key` literals across error / governance /
 *  signal / schema-validation / creative-ad-server scenarios to
 *  `$generate:uuid_v4#<alias>` form. Prevents idempotency-cache
 *  collisions on re-runs. Wire format unchanged.
 *
 *  3.0.9 (2026-05-09): the HMAC-framing fix — `reporting-webhook.json`,
 *  `auth-scheme.json`, `create-media-buy-request.json:artifact_webhook`,
 *  and `call-adcp-agent SKILL.md` realigned to RFC 9421 default (HMAC
 *  marked as the deprecated legacy fallback, removed in 4.0). This is
 *  adcp#4271 landing — supersedes our closed inventory PRs #4273/#4275
 *  per maintainer triage on adcp#4270. Description-only on the schemas,
 *  no wire shape change.
 *
 *  Schema corpus was vendored at 3.0.8 through this point — 3.0.9 /
 *  3.0.10 / 3.0.11 were storyboard / harness / description-only and
 *  didn't justify a re-vendor. 3.0.12 has real schema changes, so the
 *  corpus and `src/schemas/adcp/index.ts` are refreshed in this PR.
 *
 *  3.0.8 (2026-05-08): conformance-harness fix — UUID-aliased
 *  idempotency_keys across 15 storyboard steps in 9 scenarios
 *  (extends the #4218 precedent to the rest of the suite). Affects
 *  state-mutating tasks (`create_media_buy`, `sync_creatives`,
 *  `sync_plans`, `update_media_buy`). Compliance harness only;
 *  wire format unchanged.
 *
 *  3.0.7 (2026-05-08): docs-only — tightened type-column casing
 *  on `list_creatives` filtering options table to match
 *  `core/creative-filters.json` (`AccountRef[]`, `FormatID[]`,
 *  `CreativeStatus`). Patch-eligible per the non-normative-docs
 *  rule. No schema or wire-format change.
 *
 *  3.0.6 (2026-05-03): prose-only — wire-placement guidance for
 *  `GOVERNANCE_DENIED` and `GOVERNANCE_UNAVAILABLE`. Use the
 *  structured rejection arm (e.g. `AcquireRightsRejected`) when one
 *  exists; populate `errors[].code` + `adcp_error.code` only when
 *  the task lacks a rejection arm. `GOVERNANCE_UNAVAILABLE` always
 *  populates both layers regardless. No payload reshape.
 *
 *  3.0.5 (2026-05-02): three additive changes — relaxed
 *  `identity.additionalProperties` on capabilities responses,
 *  optional `default_agent` field in storyboard YAML, brand-rights
 *  field-name fix in the conformance harness.
 *
 *  3.0.4 (2026-05-02): prose-only — `AUTH_REQUIRED` retry-storm
 *  guidance. Wire format unchanged.
 *
 *  3.0.3 (2026-05-01): docs-fix on creative-channel `tracker_pixel`
 *  enum + storyboard `provides_state_for` field.
 *
 *  3.0.2 (2026-04-30): codegen-only refactor — promoted
 *  asset-variant `oneOf` to a canonical `core/assets/asset-union.json`
 *  reference. Wire format unchanged.
 *
 *  Schema corpus is vendored at this version via
 *  scripts/vendor-adcp-schemas.mjs; the trace inspector validates
 *  every payload against /schemas/<this-version>/ identifiers.
 */
export const SPEC_VERSION = "3.0.15";

/** Composite label for UI display: "3.0 GA · 3.0.4". */
export const SPEC_LABEL = ADCP_MAJOR_LINE + " · " + SPEC_VERSION;
