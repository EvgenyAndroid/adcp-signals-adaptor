// src/domain/signals/automotive.ts
// Automotive vertical — 20 signals spanning in-market intenders, current
// owners (by make / class), lifecycle / lease-end windows, and adjacent
// auto services (finance, insurance, parts).
//
// category_type assignments follow AdCP's 5-value enum:
//   intenders, lifecycle, services → purchase_intent
//   current owners (segmentation)  → demographic
// Vertical label "automotive" lives in sourceSystems for UI filtering.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "automotive";

export const AUTOMOTIVE_SIGNALS: CanonicalSignal[] = [
  // ── In-market intenders (5) ────────────────────────────────────────────────
  make("auto_in_market_new_suv",        "In-Market: New SUV",             "Adults shopping for a new SUV in the next 90 days. Strong signal for mid-funnel display + CTV creative.", "purchase_intent", 2_400_000, cpm(8.50), V),
  make("auto_in_market_new_sedan",      "In-Market: New Sedan",           "Adults shopping for a new sedan. Skews 35-54, urban/suburban, bachelors or higher.", "purchase_intent", 1_900_000, cpm(7.80), V),
  make("auto_in_market_new_truck",      "In-Market: New Truck",           "Adults shopping for a new pickup truck. Skews male, 35-64, south and midwest regions.", "purchase_intent", 1_600_000, cpm(8.20), V),
  make("auto_in_market_ev",             "In-Market: Electric Vehicle",    "EV intenders — researched an electric or PHEV model in the last 30 days. Affluent, early-adopter skew.", "purchase_intent", 1_100_000, cpm(10.50), V),
  make("auto_in_market_used",           "In-Market: Used Vehicle",        "Adults shopping for a used vehicle. Broad income distribution, higher share 25-44.", "purchase_intent", 3_200_000, cpm(6.00), V),

  // ── Current owners / segment (5) ───────────────────────────────────────────
  make("auto_owner_toyota",             "Current Owner: Toyota",          "Households with a Toyota vehicle in driveway. Loyalty + cross-sell / service retention target.", "demographic", 4_800_000, cpm(5.50), V),
  make("auto_owner_honda",              "Current Owner: Honda",           "Households with a Honda vehicle. Reliability-seeker segment, strong cross-sell to newer models.", "demographic", 3_900_000, cpm(5.50), V),
  make("auto_owner_ford",               "Current Owner: Ford",            "Households with a Ford vehicle. Strong truck skew, south/midwest concentration.", "demographic", 4_200_000, cpm(5.50), V),
  make("auto_owner_luxury",             "Current Owner: Luxury Brand",    "Households with a luxury-brand vehicle (BMW, Mercedes, Audi, Lexus, etc.). Affluent, HHI $150K+.", "demographic", 1_800_000, cpm(9.00), V),
  make("auto_owner_ev_existing",        "Current Owner: Electric Vehicle","Households that already own an EV or PHEV. Second-vehicle / replacement-upgrade target.", "demographic", 480_000,   cpm(11.00), V),

  // ── Lifecycle / lease-end (5) ──────────────────────────────────────────────
  make("auto_lease_end_90d",            "Lease End Window: 0-90 Days",    "Current lessees with a lease ending in the next 90 days. Highest-intent window for competitive conquest.", "purchase_intent", 540_000,   cpm(12.00), V),
  make("auto_lease_end_180d",           "Lease End Window: 91-180 Days",  "Current lessees 91-180 days from lease-end. Research-phase targeting.", "purchase_intent", 780_000,   cpm(9.00), V),
  make("auto_recent_buyer_6mo",         "Recent Auto Buyer: 0-6 Months",  "Households that purchased a vehicle in the last 6 months. Accessories, tire, service-retention target.", "purchase_intent", 1_200_000, cpm(6.50), V),
  make("auto_first_time_buyer",         "First-Time Auto Buyer",          "Adults who have never previously purchased a vehicle. Skews 22-32, urban, recent grads + new professionals.", "purchase_intent", 680_000,   cpm(8.50), V),
  make("auto_vehicle_age_5yr_plus",     "Vehicle Age: 5+ Years",          "Households with primary vehicle 5+ years old. Likely in-market within 18 months.", "demographic", 6_400_000, cpm(4.50), V),

  // ── Adjacent services (5) ──────────────────────────────────────────────────
  make("auto_loan_shoppers",            "Auto Loan Shoppers",             "Adults researching auto financing. Rate-comparison intent, late-funnel.", "purchase_intent", 920_000,   cpm(9.50), V),
  make("auto_insurance_shoppers",       "Auto Insurance Shoppers",        "Adults comparing auto insurance quotes in the last 30 days. High switching intent.", "purchase_intent", 1_350_000, cpm(10.00), V),
  make("auto_dealership_visitors",      "Recent Dealership Visitors",     "Adults who visited a dealership (online or offline) in the last 14 days. Peak-consideration signal.", "purchase_intent", 1_650_000, cpm(11.50), V),
  make("auto_parts_accessories",        "Auto Parts & Accessories Shoppers","Adults buying parts, tires, or accessories. DIY + enthusiast overlap, strong retail co-target.", "purchase_intent", 2_100_000, cpm(5.50), V),
  make("auto_fleet_commercial",         "Fleet & Commercial Vehicle Intent","Small business owners + fleet managers researching commercial vehicles. B2B auto crossover.", "purchase_intent", 190_000,   cpm(13.00), V),
];
