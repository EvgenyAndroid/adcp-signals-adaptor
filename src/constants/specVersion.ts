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
export const SPEC_VERSION = "3.0.8";

/** Composite label for UI display: "3.0 GA · 3.0.4". */
export const SPEC_LABEL = ADCP_MAJOR_LINE + " · " + SPEC_VERSION;
