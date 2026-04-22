// src/domain/signals/b2bFirmoTechno.ts
// Sec-41: B2B firmographic + technographic signals (20). High-value for
// CMO-tech / HoldCo B2B accounts. Complements the existing B2B_SIGNALS
// with identity-level firmographic intent.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "b2b_firmo_techno";

export const B2B_FIRMO_TECHNO_SIGNALS: CanonicalSignal[] = [
  // ── Firmographic tiers (5) ────────────────────────────────────────────────
  make("b2b_firmo_fortune500_decision_makers", "Fortune 500 Decision Makers",
    "C-suite + VP-level decision makers at Fortune 500 companies. High consideration + long sales cycles.",
    "purchase_intent", 280_000, cpm(14.50), V),
  make("b2b_firmo_smb_1_50_employees", "SMB Decision Makers (1-50 employees)",
    "Small business owners + decision makers at companies with 1-50 headcount.",
    "purchase_intent", 2_800_000, cpm(10.00), V),
  make("b2b_firmo_midmarket_51_1000", "Mid-Market Decision Makers (51-1000 employees)",
    "Mid-market B2B buyers at companies with 51-1000 employees.",
    "purchase_intent", 1_200_000, cpm(12.00), V),
  make("b2b_firmo_enterprise_1000_plus", "Enterprise Decision Makers (1000+ employees)",
    "Enterprise B2B buyers at companies with 1000+ employees.",
    "purchase_intent", 680_000, cpm(13.50), V),
  make("b2b_firmo_highgrowth_yoy_30pct", "High-Growth Companies (≥30% YoY)",
    "Decision makers at companies growing ≥30% YoY. Expansion-stage target.",
    "purchase_intent", 340_000, cpm(13.00), V),

  // ── Cloud / Infra technographic (5) ───────────────────────────────────────
  make("b2b_techno_aws_customers", "AWS Customer Companies",
    "Decision makers at AWS-committed companies. Cross-sell + partner-ecosystem target.",
    "purchase_intent", 540_000, cpm(12.50), V),
  make("b2b_techno_gcp_customers", "GCP Customer Companies",
    "Decision makers at GCP-committed companies.",
    "purchase_intent", 280_000, cpm(12.50), V),
  make("b2b_techno_azure_customers", "Azure Customer Companies",
    "Decision makers at Azure-committed companies.",
    "purchase_intent", 460_000, cpm(12.50), V),
  make("b2b_techno_kubernetes_shops", "Kubernetes in Production",
    "Engineering leaders at companies running Kubernetes in production.",
    "purchase_intent", 180_000, cpm(13.00), V),
  make("b2b_techno_terraform_users", "Terraform / IaC Practitioners",
    "Infrastructure teams using Terraform or similar IaC tools.",
    "purchase_intent", 220_000, cpm(12.50), V),

  // ── Data / ML stack technographic (5) ─────────────────────────────────────
  make("b2b_techno_snowflake_users", "Snowflake Customer Companies",
    "Data leaders at Snowflake-committed companies.",
    "purchase_intent", 120_000, cpm(13.50), V),
  make("b2b_techno_databricks_users", "Databricks Customer Companies",
    "ML / data platform leaders at Databricks-committed companies.",
    "purchase_intent", 98_000, cpm(13.50), V),
  make("b2b_techno_salesforce_admins", "Salesforce Admins & Architects",
    "Salesforce practitioners at mid-market + enterprise accounts.",
    "purchase_intent", 420_000, cpm(12.00), V),
  make("b2b_techno_hubspot_users", "HubSpot Customer Companies",
    "Marketing ops leaders at HubSpot-committed companies.",
    "purchase_intent", 380_000, cpm(11.50), V),
  make("b2b_techno_segment_cdp_users", "Segment / CDP Users",
    "CDP practitioners at Segment / mParticle / Tealium companies.",
    "purchase_intent", 95_000, cpm(13.50), V),

  // ── Funding / stage (2) ───────────────────────────────────────────────────
  make("b2b_funding_series_a_recent", "Recent Series A (< 12mo)",
    "Decision makers at companies that closed a Series A in the last 12 months.",
    "purchase_intent", 42_000, cpm(14.00), V),
  make("b2b_funding_series_b_recent", "Recent Series B (< 12mo)",
    "Decision makers at companies that closed a Series B in the last 12 months.",
    "purchase_intent", 28_000, cpm(14.50), V),

  // ── Intent / activity (3) ─────────────────────────────────────────────────
  make("b2b_intent_rfp_active_30d", "B2B RFP Active (30-Day)",
    "Companies with active RFP signals in the last 30 days across any major category.",
    "purchase_intent", 180_000, cpm(14.50), V),
  make("b2b_intent_analyst_mentions", "Gartner / Forrester Mentioned Vendors",
    "Decision makers at companies recently mentioned in Gartner / Forrester analyst research.",
    "purchase_intent", 72_000, cpm(14.00), V),
  make("b2b_intent_trade_show_attendees", "B2B Trade Show Attendees (90-Day)",
    "Decision makers who attended a B2B trade show in the last 90 days.",
    "purchase_intent", 340_000, cpm(12.50), V),
];
