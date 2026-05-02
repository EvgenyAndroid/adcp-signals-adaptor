// src/domain/agenticArgsSanitizer.ts
//
// Sanitize args_template before fanning out to live agents.
//
// Why this exists:
//   AdCP 3.0.4 request schemas are intentionally open
//   (`additionalProperties: true`) so the protocol can evolve. But many
//   live vendors enforce stricter server-side validation
//   (`additionalProperties: false`, often Pydantic 2.x with
//   `extra=forbid`). When the agentic planner — especially in live LLM
//   mode — generates an args_template that hallucinates non-spec fields
//   (e.g. `brand` on list_creative_formats, `brand_categories` on
//   anything), strict-validating vendors reject the call with
//   "Unexpected keyword argument" instead of tolerating the extra.
//
//   The agentic UI then renders bare "err" pills when the planner is
//   the source of the bug, not the vendor.
//
// Design:
//   - Per-tool ALLOWLIST of arg names we know are safe across vendors.
//     Conservative — only fields with broad ecosystem support, not
//     bleeding-edge spec additions that vendors haven't adopted.
//   - REQUIRED-arg backfill: when the planner omits a required field
//     (e.g. signal_spec on get_signals), we fill it from the brief.
//
// This is the parallel to the #148 pagination removal — same bug class
// (outbound payload doesn't survive vendor schema validation), one
// layer up.

import type { ExpandedBrief } from "./agenticBrief";

/**
 * Per-tool allowlist of safe outbound arg names. Anything outside this
 * set is stripped before the call. Conservative on purpose — we'd
 * rather drop a field a vendor MIGHT accept than send a field a vendor
 * MIGHT reject.
 */
export const TOOL_ARG_ALLOWLIST: Record<string, ReadonlySet<string>> = {
  get_signals: new Set([
    "signal_spec",      // primary input — usually required by vendors
    "max_results",      // back-compat across all vendors
    "deliver_to",       // 3.0.0-era; legacy but most vendors still accept
    "destinations",     // 3.0.1+ replacement for deliver_to (some vendors only)
    "countries",        // 3.0.1+ companion to destinations
    "filters",          // universal optional
    "context",          // request-context echo (idempotency etc.)
  ]),
  list_creative_formats: new Set([
    "format_ids",
    "type",
    "asset_types",
    "max_width",
    "max_height",
    "min_width",
    "min_height",
    "is_responsive",
    "name_search",
    "account",
    "context",
  ]),
  get_products: new Set([
    "brief",
    "promoted_offering",
    "filters",
    "delivery_type",
    "is_fixed_price",
    "format_types",
    "format_ids",
    "min_exposures",
    "context",
  ]),
  create_media_buy: new Set([
    "promoted_offering",
    "po_number",
    "buyer_ref",
    "packages",
    "start_time",
    "end_time",
    "budget",
    "total_budget",
    "currency",
    "creative_assignments",
    "reporting_webhook",
    "context",
  ]),
  update_media_buy: new Set([
    "media_buy_id",
    "buyer_ref",
    "active",
    "budget",
    "creative_assignments",
    "packages",
    "context",
  ]),
  get_media_buy_delivery: new Set([
    "media_buy_id",
    "buyer_ref",
    "context",
  ]),
};

/**
 * Strip args not in the per-tool allowlist. Returns a new object;
 * doesn't mutate input. Tools without an entry in the allowlist
 * pass through unchanged (e.g. `check_governance`, `check_brand_rights`
 * are local mocks — no allowlist needed).
 */
export function stripUnknownArgs(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  const allow = TOOL_ARG_ALLOWLIST[tool];
  if (!allow) return { ...args };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (allow.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Backfill required args from the brief when the planner omits them.
 * The agentic planner — especially in live LLM mode — sometimes
 * generates args_template that drops required fields like signal_spec,
 * which hands the vendor a "Missing required argument" rejection.
 *
 * This is the safety net. We only fill if the field is missing, never
 * override what the planner provided.
 */
export function backfillRequiredArgs(
  tool: string,
  args: Record<string, unknown>,
  brief: ExpandedBrief,
): Record<string, unknown> {
  const out = { ...args };
  switch (tool) {
    case "get_signals":
      if (!out.signal_spec || (typeof out.signal_spec === "string" && out.signal_spec.length === 0)) {
        out.signal_spec = brief.input;
      }
      if (out.max_results === undefined || out.max_results === null) {
        out.max_results = 10;
      }
      break;
    case "get_products":
      if (!out.brief || (typeof out.brief === "string" && out.brief.length === 0)) {
        out.brief = brief.input;
      }
      break;
    case "create_media_buy":
      // promoted_offering is the canonical 3.0+ field; vendors with
      // legacy schemas may still accept brief. Don't backfill — the
      // workflow orchestrator's vendor adapters handle this per-vendor.
      break;
    // list_creative_formats has no protocol-required fields.
    // check_governance / check_brand_rights are local mocks.
  }
  return out;
}

/**
 * Convenience: full sanitize — strip unknown + backfill required.
 * Caller should ALWAYS use this before fanning out to live agents.
 */
export function sanitizeArgsForVendor(
  tool: string,
  args: Record<string, unknown>,
  brief: ExpandedBrief,
): Record<string, unknown> {
  const stripped = stripUnknownArgs(tool, args);
  return backfillRequiredArgs(tool, stripped, brief);
}
