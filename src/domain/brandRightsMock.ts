// src/domain/brandRightsMock.ts
//
// Workshop refinement C — predictive brand-rights overlay.
//
// Closes the AdCP 3.0.1 governance + brand-rights domain pair.
// Tier 1 spec card on Canvas already names the brand-rights tools
// (get_rights, acquire_rights, update_rights) but no live vendor
// implements them. This module computes a synthetic answer to
// "do we have rights to use these creatives for this brand?"
// from the data we already have:
//   - brand.classification (master / sub_brand / independent + house_domain)
//   - chosen creative formats (asset bundles)
//   - registry's keller_type (parent → child rights flow)
//
// Decision matrix:
//
//   brand.classification.kind = "master"
//     → all creatives: rights "owned"
//   brand.classification.kind = "sub_brand" with house_domain
//     → creatives: rights "delegated_from_parent" (parent owns;
//       sub-brand has implicit license under registry conventions)
//   brand.classification.kind = "independent"
//     → creatives: rights "self_owned"
//   no classification
//     → rights "unknown" — would require live get_rights call
//
// For format-level granularity:
//   - DOOH formats → require physical-distribution clearance
//     (extra rights flag we surface as "needs_physical_clearance")
//   - sponsored / native formats → require advertiser-disclosure
//     attestation
//   - standard display → cleared by default
//
// Output mirrors AdCP 3.0.1 brand-rights advisory shape:
//   { mode, outcome, rights[], advisories[] }

export type BrandRightsOutcome = "owned" | "delegated" | "self_owned" | "needs_clearance" | "unknown";

export interface BrandRightsEntry {
  format_id: string;
  format_label?: string;
  rights: BrandRightsOutcome;
  reason: string;
  needs_physical_clearance?: boolean;
  needs_disclosure?: boolean;
}

export interface BrandRightsAdvisory {
  mode: "predictive_local";
  /** Worst-case across all chosen formats — `unknown` > `needs_clearance` > others. */
  outcome: BrandRightsOutcome;
  rights: BrandRightsEntry[];
  /** Plain-text advisories for the workshop UX. */
  advisories: string[];
}

export interface BrandClassification {
  kind?: "master" | "sub_brand" | "independent" | string;
  house_domain?: string | null;
  reasoning?: string;
}

export interface FormatLite {
  format_id: string;
  label?: string;
  /** Subtype categories — used to flag DOOH / native / sponsored.
   *  We accept a broad string and substring-match, so callers can
   *  pass `format_id` itself if no separate type field exists. */
  subtype?: string;
}

const DOOH_PATTERNS = [/dooh/i, /digital_out_of_home/i];
const NATIVE_PATTERNS = [/native/i, /sponsored/i, /advertorial/i];

function inferRights(
  classification: BrandClassification | undefined,
): BrandRightsOutcome {
  if (!classification || !classification.kind) return "unknown";
  if (classification.kind === "master") return "owned";
  if (classification.kind === "sub_brand") {
    return classification.house_domain ? "delegated" : "self_owned";
  }
  if (classification.kind === "independent") return "self_owned";
  return "unknown";
}

export function predictBrandRights(
  classification: BrandClassification | undefined,
  chosenFormats: FormatLite[],
): BrandRightsAdvisory {
  const baseRights = inferRights(classification);

  const rights: BrandRightsEntry[] = chosenFormats.map((f) => {
    const tag = `${f.format_id} ${f.subtype || ""} ${f.label || ""}`;
    const isDooh = DOOH_PATTERNS.some((re) => re.test(tag));
    const isNative = NATIVE_PATTERNS.some((re) => re.test(tag));

    let r: BrandRightsOutcome = baseRights;
    let reason: string;
    if (baseRights === "unknown") {
      reason = "Brand classification missing — live get_rights would resolve.";
    } else if (baseRights === "owned") {
      reason = "Master brand — owns asset rights directly.";
    } else if (baseRights === "delegated") {
      reason = `Sub-brand — rights delegated from parent (${classification!.house_domain}).`;
    } else {
      reason = "Independent brand — self-owned rights.";
    }

    const entry: BrandRightsEntry = { format_id: f.format_id, rights: r, reason };
    if (f.label !== undefined) entry.format_label = f.label;
    if (isDooh) {
      entry.needs_physical_clearance = true;
      entry.reason = entry.reason + " DOOH placement also requires physical-distribution clearance.";
      // DOOH escalation: even owned creatives need a clearance step.
      if (r === "owned" || r === "delegated" || r === "self_owned") r = "needs_clearance";
      entry.rights = r;
    }
    if (isNative) {
      entry.needs_disclosure = true;
      entry.reason = entry.reason + " Native/sponsored format requires advertiser disclosure attestation.";
    }
    return entry;
  });

  // Worst outcome wins — unknown > needs_clearance > owned/delegated/self_owned.
  const order: Record<BrandRightsOutcome, number> = {
    unknown: 0,
    needs_clearance: 1,
    delegated: 2,
    self_owned: 3,
    owned: 4,
  };
  let worst: BrandRightsOutcome = "owned";
  for (const r of rights) if (order[r.rights] < order[worst]) worst = r.rights;

  const advisories: string[] = [];
  if (rights.some((r) => r.needs_physical_clearance)) {
    advisories.push("DOOH formats require physical-distribution clearance — separate from creative ownership.");
  }
  if (rights.some((r) => r.needs_disclosure)) {
    advisories.push("Native/sponsored formats require advertiser-disclosure attestation under FTC + EU AVMSD.");
  }
  if (worst === "unknown") {
    advisories.push("Brand classification not in registry — live get_rights would resolve before fire-time.");
  }
  if (chosenFormats.length === 0) {
    advisories.push("No creative formats chosen yet — rights check is vacuous until creative stage runs.");
  }

  return { mode: "predictive_local", outcome: worst, rights, advisories };
}
