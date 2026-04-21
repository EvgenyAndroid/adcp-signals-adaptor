// src/domain/signals/financial.ts
// Financial vertical — 20 signals covering wealth tiers, credit profiles,
// banking & investment product holdings, and in-market intent for
// financial services.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "financial";

export const FINANCIAL_SIGNALS: CanonicalSignal[] = [
  // ── Wealth / investable assets (5) ────────────────────────────────────────
  make("fin_hnw_1m_plus",        "High Net Worth: $1M+ Investable",        "Households with $1M+ in investable assets. Prime target for wealth management, private banking.", "demographic", 1_100_000, cpm(12.00), V),
  make("fin_mass_affluent",      "Mass Affluent: $250K-$1M",               "Households with $250K-$1M in investable assets. Advisor-serviced + self-directed overlap.", "demographic", 3_600_000, cpm(10.00), V),
  make("fin_emerging_affluent",  "Emerging Affluent: $100K-$250K",         "Households growing wealth, $100K-$250K assets. Brokerage + robo-advisor target.", "demographic", 5_200_000, cpm(8.00), V),
  make("fin_net_worth_hhi",      "High Net Worth by HHI ($150K+)",         "Proxy for wealth using HHI $150K+ and premium housing indicators.", "demographic", 4_800_000, cpm(9.50), V),
  make("fin_accredited_investor","Accredited Investor Profile",            "Households meeting accredited-investor thresholds. Alternative-investments target.", "demographic", 620_000,   cpm(13.50), V),

  // ── Credit tiers (4) ──────────────────────────────────────────────────────
  make("fin_credit_tier_prime",  "Credit Tier: Prime (720+)",              "Adults with prime credit scores (720+). Low-APR lending + premium card target.", "demographic", 12_800_000, cpm(7.00), V),
  make("fin_credit_tier_near",   "Credit Tier: Near-Prime (660-719)",      "Adults with near-prime credit scores. Secured card / credit-building upsell target.", "demographic", 9_400_000, cpm(6.00), V),
  make("fin_credit_tier_subprime","Credit Tier: Subprime (<660)",          "Adults with subprime credit. Financial-wellness content + rebuild products.", "demographic", 11_200_000, cpm(5.00), V),
  make("fin_credit_thin_file",   "Credit: Thin File / New to Credit",      "Adults new to credit (students, new immigrants). Entry-card + starter-loan target.", "demographic", 2_900_000, cpm(7.50), V),

  // ── Product holdings (5) ──────────────────────────────────────────────────
  make("fin_checking_primary",   "Primary Checking Relationship",          "Adults with a primary checking account at a national or regional bank. Cross-sell target.", "demographic", 47_000_000, cpm(4.00), V),
  make("fin_brokerage_account",  "Self-Directed Brokerage Account",        "Adults with a self-directed brokerage account. Active traders + long-term investors mix.", "demographic", 8_300_000, cpm(8.50), V),
  make("fin_401k_active",        "Active 401(k) Contributor",              "Employed adults actively contributing to a 401(k). Rollover + IRA cross-sell target.", "demographic", 24_000_000, cpm(6.50), V),
  make("fin_roth_ira_holder",    "Roth IRA Holder",                        "Adults with an active Roth IRA. Long-horizon investor, tax-aware, advisor-receptive.", "demographic", 6_900_000, cpm(8.00), V),
  make("fin_crypto_holder",      "Cryptocurrency Holder",                  "Adults with a crypto wallet or exchange balance. Skews 25-44, male, tech-forward.", "interest", 8_100_000, cpm(9.00), V),

  // ── Insurance & lending intent (6) ────────────────────────────────────────
  make("fin_mortgage_shoppers",  "Mortgage Shoppers",                      "Adults comparing mortgage rates in the last 30 days. Purchase + refi intent mixed.", "purchase_intent", 1_600_000, cpm(14.00), V),
  make("fin_mortgage_refi",      "Mortgage Refinance Intenders",           "Current homeowners researching refinance. Rate-sensitive, late-funnel.", "purchase_intent", 780_000,   cpm(15.00), V),
  make("fin_life_insurance_shop","Life Insurance Shoppers",                "Adults comparing life insurance quotes. Skews 30-55, new parents + new homeowners.", "purchase_intent", 920_000,   cpm(11.00), V),
  make("fin_health_ins_shop",    "Health Insurance Shoppers",              "Adults comparing health insurance during OEP / SEP windows. High immediate-intent.", "purchase_intent", 2_400_000, cpm(10.50), V),
  make("fin_personal_loan_shop", "Personal Loan Shoppers",                 "Adults comparing personal loan offers. Debt consolidation + life-event spend drivers.", "purchase_intent", 1_300_000, cpm(10.00), V),
  make("fin_student_loan_refi",  "Student Loan Refinance Intenders",       "Grads exploring student loan refinance or forgiveness. Skews 25-40, prime credit.", "purchase_intent", 540_000,   cpm(11.50), V),
];
