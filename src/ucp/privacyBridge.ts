// src/ucp/privacyBridge.ts
// Maps DTS v1.2 privacy fields → UCP privacy object.
// Normative mapping per AdCP-UCP Bridge Profile.

import type { UcpPrivacy } from "../types/ucp";
import type { DtsV12Label } from "../types/api";

// TTL in seconds derived from DTS audience_refresh cadence
const REFRESH_TO_TTL: Record<string, number> = {
  "Intra-day":    3_600,       //  1 hour
  "Daily":        86_400,      //  1 day
  "Weekly":       604_800,     //  7 days
  "Monthly":      2_592_000,   // 30 days
  "Bi-Monthly":   5_184_000,   // 60 days
  "Quarterly":    7_776_000,   // 90 days
  "Bi-Annually":  15_552_000,  // 180 days
  "Annually":     31_536_000,  // 365 days
  "Static":       63_072_000,  // 2 years (static demo data)
  "N/A":          86_400,      // default 1 day
};

// Permitted uses derived from signal access policy
const PERMITTED_USES_BY_METHODOLOGY: Record<string, string[]> = {
  "Observed/Known": ["audience_matching", "frequency_capping", "measurement", "attribution"],
  "Derived":        ["audience_matching", "frequency_capping", "measurement"],
  "Modeled":        ["audience_matching", "frequency_capping"],
  "Inferred":       ["audience_matching"],
  "Declared":       ["audience_matching", "frequency_capping", "measurement", "attribution", "personalization"],
};

export function buildUcpPrivacy(dts: DtsV12Label): UcpPrivacy {
  const mechanisms = dts.privacy_compliance_mechanisms ?? [];

  return {
    privacy_compliance_mechanisms: mechanisms,
    permitted_uses:
      PERMITTED_USES_BY_METHODOLOGY[dts.audience_inclusion_methodology] ??
      ["audience_matching"],
    ttl_seconds: REFRESH_TO_TTL[dts.audience_refresh] ?? 86_400,
    gpp_applicable: mechanisms.includes("GPP"),
    tcf_applicable: mechanisms.includes("TCF (Europe)"),
  };
}
