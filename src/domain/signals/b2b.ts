// src/domain/signals/b2b.ts
// B2B / Firmographic vertical — 20 signals covering job function / seniority,
// industry (NAICS-grouped), company size, and tech-stack installations.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "b2b";

export const B2B_SIGNALS: CanonicalSignal[] = [
  // ── Function × seniority (6) ──────────────────────────────────────────────
  make("b2b_c_suite",             "C-Suite Executives",              "CEO, CFO, COO, CTO, CMO, CHRO. Top-of-funnel B2B target for enterprise + professional services.", "demographic", 380_000,   cpm(14.00), V),
  make("b2b_vp_director",         "VP & Director Level",             "Adults with VP or Director titles across functions. Primary B2B decision-maker segment.", "demographic", 1_900_000, cpm(12.00), V),
  make("b2b_it_decision_makers",  "IT Decision Makers",              "IT Directors, VPs of Engineering, CIOs. Primary buyers of enterprise software and infrastructure.", "demographic", 480_000,   cpm(13.50), V),
  make("b2b_marketing_leaders",   "Marketing Leaders",               "CMO, VP Marketing, Director of Marketing. Martech, agency, and media-platform target.", "demographic", 340_000,   cpm(13.00), V),
  make("b2b_hr_leaders",          "HR & People Leaders",             "CHRO, VP People, Director of HR. Benefits, HRIS, payroll, and recruiting software target.", "demographic", 290_000,   cpm(12.50), V),
  make("b2b_sales_leaders",       "Sales Leaders",                   "CRO, VP Sales, Sales Director. CRM, sales-enablement, and data-platform target.", "demographic", 360_000,   cpm(12.50), V),

  // ── Industry (5) ──────────────────────────────────────────────────────────
  make("b2b_industry_tech",       "Technology & Software Industry",  "Professionals at SaaS, software, IT services, and cloud providers. Early adopters, cross-pollination.", "demographic", 4_200_000, cpm(10.00), V),
  make("b2b_industry_finance",    "Financial Services Industry",     "Banking, insurance, investment management professionals. Regulated, risk-aware buyer base.", "demographic", 3_600_000, cpm(11.00), V),
  make("b2b_industry_healthcare", "Healthcare & Life Sciences",      "Healthcare delivery, pharma, biotech, medtech professionals. Long-cycle enterprise sales target.", "demographic", 5_800_000, cpm(10.50), V),
  make("b2b_industry_manufacturing","Manufacturing & Industrial",    "Manufacturing, industrial, logistics professionals. Supply-chain, ERP, and IIoT target.", "demographic", 4_900_000, cpm(9.50), V),
  make("b2b_industry_retail_cpg", "Retail & CPG Industry",           "Retail, e-commerce, and consumer-packaged-goods professionals. Commerce platforms + ad-tech target.", "demographic", 3_400_000, cpm(9.50), V),

  // ── Company size (5) ──────────────────────────────────────────────────────
  make("b2b_enterprise_5000plus", "Enterprise: 5,000+ Employees",    "Professionals at Fortune-500-scale enterprises. Enterprise-deal ACV, long sales cycles.", "demographic", 12_800_000, cpm(11.00), V),
  make("b2b_mid_market_500_5000", "Mid-Market: 500-5,000 Employees", "Professionals at mid-market companies. Fastest-growing ACV tier in modern SaaS.", "demographic", 9_400_000, cpm(10.00), V),
  make("b2b_smb_50_500",          "SMB: 50-500 Employees",           "Professionals at small-to-mid businesses. Self-serve + inside-sales motion target.", "demographic", 14_200_000, cpm(8.50), V),
  make("b2b_startup_under_50",    "Startup: Under 50 Employees",     "Professionals at early-stage startups. Budget-sensitive, tool-curious, rapid-deploy target.", "demographic", 8_100_000, cpm(7.50), V),
  make("b2b_small_business_owner","Small Business Owners",           "Proprietors of businesses under 20 employees. Owner-operators, payroll / finance / marketing target.", "demographic", 18_600_000, cpm(7.00), V),

  // ── Tech stack & behavior (4) ─────────────────────────────────────────────
  make("b2b_salesforce_users",    "Salesforce Installed Base",       "Companies with Salesforce CRM deployed. Integration partner + consulting target.", "demographic", 2_100_000, cpm(11.00), V),
  make("b2b_aws_cloud_users",     "AWS Cloud Infrastructure Users",  "Engineering teams running production workloads on AWS. Tooling, observability, cost-mgmt target.", "demographic", 4_600_000, cpm(10.50), V),
  make("b2b_g_suite_users",       "Google Workspace Orgs",           "Organizations on Google Workspace. Collaboration-tool + security add-on target.", "demographic", 8_200_000, cpm(8.00), V),
  make("b2b_event_attendees",     "Industry Event Attendees",        "Professionals who registered for or attended a B2B industry event in the last 12 months. High-intent.", "demographic", 5_700_000, cpm(9.50), V),
];
