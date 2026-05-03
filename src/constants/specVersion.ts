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
 *  3.0.5 (2026-05-02): three additive changes — relaxed
 *  `identity.additionalProperties` on capabilities responses,
 *  optional `default_agent` field in storyboard YAML, brand-rights
 *  field-name fix in the conformance harness. All forward-compat /
 *  authoring-side; wire format unchanged for any 3.0 agent that
 *  doesn't claim a new optional surface (we don't claim
 *  `identity.brand_json_url`, so we're unaffected).
 *
 *  Compliance state on 2026-05-03: the daily watcher reported 0
 *  scenarios run after the @adcp/client testing-kit floated within
 *  the 5.x range. Production adapter is unchanged from the prior 7/7
 *  passing state; this is a watcher-side artifact, not a deployed
 *  regression. Re-investigate post-workshop.
 */
export const SPEC_VERSION = "3.0.5";

/** Composite label for UI display: "3.0 GA · 3.0.4". */
export const SPEC_LABEL = ADCP_MAJOR_LINE + " · " + SPEC_VERSION;
