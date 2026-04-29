// src/domain/policyRegistry.ts
//
// Local snapshot of the agentic-advertising registry policy table.
// As of 2026-04-29 the public site renders the policies tab from
// internal data, but `/api/registry/policies` returns 404 (the
// brand-side `/api/brands/resolve` and the agent-side
// `/api/registry/agents` are both live; policies API has not landed).
//
// We mirror the 14 published entries here so:
//   1. Our DTS `policy_attestations` extension (Phase D) has real
//      stable policy_ids to point at, NOT placeholder strings.
//   2. The Canvas brand-anchored view can match brand industries to
//      applicable policies *today* — no upstream blocker.
//   3. When `/api/registry/policies` ships, this file becomes a
//      cached/seed copy and a daily worker can keep it fresh.
//      Migration: replace `POLICIES` with a `loadPolicies()` that
//      hits the live API + falls back to this snapshot on error.
//
// Source: agenticadvertising.org/registry/?tab=policies
// Snapshotted: 2026-04-29

export type PolicyCategory = "regulation" | "standard";
export type PolicyEnforcement = "must" | "should" | "may";

export interface RegistryPolicy {
  policy_id: string;          // slug, e.g. "ca_sb_942"
  name: string;               // human-readable
  category: PolicyCategory;   // regulation | standard
  enforcement: PolicyEnforcement;
  description: string;
  region: string;             // ISO-2 or "EU" or "Global"
  effective_date: string;     // ISO date
  authority: string;          // e.g. "California State Legislature"
  // Industries this policy is relevant to. Not in the registry's published
  // schema yet — we infer from the policy name/description so the
  // Canvas-side brand→policy matcher (Phase C) has something to chew on.
  // When the upstream schema adds an explicit industries field, replace.
  industries_inferred: string[];
}

export const POLICIES: RegistryPolicy[] = [
  {
    policy_id: "ca_sb_942",
    name: "California AI Transparency Act",
    category: "regulation",
    enforcement: "must",
    description: "California requirements for labeling AI-generated content on large platforms.",
    region: "US",
    effective_date: "2026-01-01",
    authority: "California State Legislature",
    industries_inferred: ["ai_generated_content"],
  },
  {
    policy_id: "eu_ai_act_article_50",
    name: "EU AI Act Transparency Obligations",
    category: "regulation",
    enforcement: "must",
    description: "EU AI Act requirements for AI-generated advertising content disclosure.",
    region: "EU",
    effective_date: "2026-08-02",
    authority: "European Parliament and Council",
    industries_inferred: ["ai_generated_content"],
  },
  {
    policy_id: "eu_gdpr_advertising",
    name: "EU GDPR Advertising Requirements",
    category: "regulation",
    enforcement: "must",
    description: "GDPR requirements for personal data processing in advertising.",
    region: "EU",
    effective_date: "2018-05-25",
    authority: "European Parliament and Council",
    industries_inferred: ["all"],
  },
  {
    policy_id: "political_advertising",
    name: "Political advertising transparency",
    category: "regulation",
    enforcement: "must",
    description: "Transparency and disclosure requirements for political advertising across jurisdictions.",
    region: "EU",
    effective_date: "2024-02-17",
    authority: "European Union / Various national authorities",
    industries_inferred: ["political", "advocacy"],
  },
  {
    policy_id: "tobacco_nicotine",
    name: "Tobacco and nicotine advertising restrictions",
    category: "regulation",
    enforcement: "must",
    description: "Tobacco and nicotine advertising restrictions across jurisdictions. Most markets ban tobacco advertising entirely.",
    region: "Global",
    effective_date: "2024-01-01",
    authority: "World Health Organization",
    industries_inferred: ["tobacco", "vaping", "nicotine"],
  },
  {
    policy_id: "uk_hfss",
    name: "UK HFSS Advertising Restrictions",
    category: "regulation",
    enforcement: "must",
    description: "UK ban on paid online advertising of less healthy food and drink products.",
    region: "GB",
    effective_date: "2025-10-01",
    authority: "UK Parliament",
    industries_inferred: ["food_beverage", "fast_food", "confectionery"],
  },
  {
    policy_id: "us_cannabis",
    name: "US Cannabis Advertising Restrictions",
    category: "regulation",
    enforcement: "must",
    description: "Cannabis advertising compliance requirements across US jurisdictions.",
    region: "US",
    effective_date: "2024-01-01",
    authority: "National Conference of State Legislatures",
    industries_inferred: ["cannabis"],
  },
  {
    policy_id: "us_coppa",
    name: "US COPPA",
    category: "regulation",
    enforcement: "must",
    description: "Children's Online Privacy Protection Act requirements for advertising.",
    region: "US",
    effective_date: "2000-04-21",
    authority: "US Federal Trade Commission",
    industries_inferred: ["children", "toys", "education"],
  },
  {
    policy_id: "alcohol_advertising",
    name: "Alcohol Advertising Standards",
    category: "standard",
    enforcement: "should",
    description: "Industry best practices for responsible alcohol advertising.",
    region: "Global",
    effective_date: "2024-01-01",
    authority: "International Alliance for Responsible Drinking",
    industries_inferred: ["alcohol", "beer", "wine", "spirits"],
  },
  {
    policy_id: "childrens_advertising",
    name: "Children's advertising standards",
    category: "standard",
    enforcement: "should",
    description: "Global standards for advertising directed at or likely to be seen by children, covering protections beyond US COPPA.",
    region: "Global",
    effective_date: "2025-01-01",
    authority: "Multiple: UK ASA/CAP, EU AVMSD, ICC, UNICEF",
    industries_inferred: ["children", "toys", "education"],
  },
  {
    policy_id: "csbs",
    name: "Common Sense Brand Standards",
    category: "standard",
    enforcement: "must",
    description: "Common Sense Brand Standards (CSBS) — content adjacency standard governed by AgenticAdvertising.org.",
    region: "Global",
    effective_date: "2026-01-01",
    authority: "AgenticAdvertising.org",
    industries_inferred: ["all"],
  },
  {
    policy_id: "financial_services",
    name: "Financial Services Advertising Standards",
    category: "standard",
    enforcement: "should",
    description: "Best practices for financial product and services advertising.",
    region: "Global",
    effective_date: "2024-01-01",
    authority: "Consumer Financial Protection Bureau",
    industries_inferred: ["financial", "banking", "insurance", "lending", "fintech"],
  },
  {
    policy_id: "gambling_advertising",
    name: "Gambling Advertising Standards",
    category: "standard",
    enforcement: "should",
    description: "Industry best practices for responsible gambling advertising.",
    region: "Global",
    effective_date: "2024-01-01",
    authority: "International Comparative Legal Guides",
    industries_inferred: ["gambling", "lottery", "sports_betting"],
  },
  {
    policy_id: "pharma_us_fda",
    name: "US Pharmaceutical Advertising Standards",
    category: "standard",
    enforcement: "should",
    description: "FDA-aligned best practices for pharmaceutical and healthcare advertising.",
    region: "US",
    effective_date: "2024-01-01",
    authority: "US Food and Drug Administration",
    industries_inferred: ["pharma", "healthcare", "medical_devices"],
  },
];

/**
 * Look up a policy by its slug. Returns undefined if not found.
 */
export function getPolicy(policyId: string): RegistryPolicy | undefined {
  return POLICIES.find((p) => p.policy_id === policyId);
}

/**
 * Find all policies whose `industries_inferred` list overlaps with the
 * supplied brand industry slugs. The "all" sentinel matches every brand.
 *
 * Brand-anchored Canvas view (Phase C) uses this. Phase D's
 * `policy_attestations` emission is provider-side and doesn't strictly
 * need brand context — it declares which policies our SIGNAL data
 * complies with regardless of campaign target.
 */
export function policiesForIndustries(industries: readonly string[]): RegistryPolicy[] {
  const norm = industries.map((i) => i.toLowerCase());
  return POLICIES.filter((p) => {
    if (p.industries_inferred.includes("all")) return true;
    return p.industries_inferred.some((ind) => norm.includes(ind.toLowerCase()));
  });
}
