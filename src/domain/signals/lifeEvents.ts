// src/domain/signals/lifeEvents.ts
// Life events vertical — 20 signals. Life-event audiences have sharp
// buying windows and command premium CPMs. Classified as demographic
// (attribute-based) with the lifecycle framing in name + description.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "life_events";

export const LIFE_EVENTS_SIGNALS: CanonicalSignal[] = [
  // ── Household formation (5) ───────────────────────────────────────────────
  make("life_new_mover_30d",         "New Mover: 0-30 Days",            "Households that relocated in the last 30 days. Peak intent for furniture, utilities, local services.", "demographic", 410_000,   cpm(14.00), V),
  make("life_new_mover_90d",         "New Mover: 31-90 Days",           "Households 31-90 days post-relocation. Settling-in spend, still-elevated buying.", "demographic", 720_000,   cpm(10.50), V),
  make("life_new_homeowner_6mo",     "New Homeowner: 0-6 Months",       "Households that purchased a home in the last 6 months. Big-ticket + improvement spend.", "demographic", 1_200_000, cpm(12.00), V),
  make("life_pre_mover",             "Pre-Mover Intent",                "Adults showing relocation intent (real-estate research, moving company searches).", "demographic", 1_600_000, cpm(11.50), V),
  make("life_empty_nesters",         "Empty Nesters (Recent)",          "Households where youngest child recently left for college or independence. Travel + downsizing.", "demographic", 2_400_000, cpm(8.50), V),

  // ── Family & relationship (5) ─────────────────────────────────────────────
  make("life_newlyweds",             "Newlyweds: 0-12 Months",          "Couples married in the last year. Furniture, insurance, financial-planning, travel.", "demographic", 900_000,   cpm(11.00), V),
  make("life_engaged",               "Engaged / Pre-Wedding",           "Adults planning a wedding in the next 12 months. Venue, registry, financial-planning target.", "demographic", 1_100_000, cpm(12.00), V),
  make("life_expecting_parent",      "Expecting Parent",                "Households with a pregnancy / expected child. Baby-gear, insurance, financial planning.", "demographic", 680_000,   cpm(13.50), V),
  make("life_new_parent_12mo",       "New Parent: 0-12 Months",         "Households with an infant under 12 months. High-frequency baby-care CPG + subscription target.", "demographic", 1_600_000, cpm(11.50), V),
  make("life_recently_divorced",     "Recently Divorced: 0-24 Months",  "Adults divorced in the last 2 years. Financial-planning, single-person housing, dating-service target.", "demographic", 1_400_000, cpm(9.50), V),

  // ── Career & education (5) ────────────────────────────────────────────────
  make("life_recent_college_grad",   "Recent College Graduate",         "Adults graduated from a 4-year institution in the last 12 months. Credit, insurance, apartment.", "demographic", 1_900_000, cpm(10.50), V),
  make("life_new_job_start",         "New Job Start: 0-3 Months",       "Adults who started a new job in the last 90 days. Wardrobe, commute, financial updates.", "demographic", 3_200_000, cpm(8.50), V),
  make("life_promotion_raise",       "Recent Promotion / Raise",        "Adults with recent income increase (self-reported or inferred). Upgrade cycle.", "demographic", 4_100_000, cpm(8.00), V),
  make("life_career_change",         "Career Change / Industry Switch", "Adults actively transitioning careers. Skills-training, resume-coaching, certification target.", "demographic", 1_700_000, cpm(9.00), V),
  make("life_back_to_school",        "Back-to-School: Parents",         "Parents of K-12 students during back-to-school window. Seasonal CPG + apparel target.", "purchase_intent", 18_500_000, cpm(7.50), V),

  // ── Retirement & senior (5) ───────────────────────────────────────────────
  make("life_near_retirement",       "Near Retirement: 55-64",          "Adults 55-64 with retirement-planning engagement. Medicare-adjacent, wealth-transfer target.", "demographic", 8_700_000, cpm(9.50), V),
  make("life_recent_retiree",        "Recent Retiree: 0-24 Months",     "Adults retired in the last 2 years. Travel, leisure, wellness, financial-planning repositioning.", "demographic", 2_800_000, cpm(10.00), V),
  make("life_medicare_eligible",     "Medicare Eligible: 64-66",        "Adults approaching or newly eligible for Medicare. AEP + ICEP campaigns.", "demographic", 3_400_000, cpm(12.50), V),
  make("life_grandparent_new",       "New Grandparent",                 "Adults with a grandchild born in the last 12 months. Gift, travel, photography, insurance.", "demographic", 2_100_000, cpm(8.00), V),
  make("life_pet_adoption",          "Recent Pet Adoption",             "Households that added a pet in the last 6 months. Food, accessories, insurance, training.", "demographic", 3_800_000, cpm(7.50), V),
];
