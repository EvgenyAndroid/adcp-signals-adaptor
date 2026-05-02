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
 *  successful conformance pass against a new patch. As of this commit:
 *  - Spec released:  v3.0.4  (2026-05-02)
 *  - Watcher report: 7/7 applicable scenarios passing
 */
export const SPEC_VERSION = "3.0.4";

/** Composite label for UI display: "3.0 GA · 3.0.4". */
export const SPEC_LABEL = ADCP_MAJOR_LINE + " · " + SPEC_VERSION;
