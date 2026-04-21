// src/domain/signals/health.ts
// Health & Wellness vertical — 20 signals. Condition-sufferer segments
// kept at neutral, observably-public granularity (OTC / wellness intent)
// rather than HIPAA-sensitive diagnostic signals.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "health";

export const HEALTH_SIGNALS: CanonicalSignal[] = [
  // ── Wellness & fitness intent (6) ─────────────────────────────────────────
  make("health_fitness_enthusiasts", "Fitness Enthusiasts",              "Adults who work out 3+ times per week. Strong overlap with athletic apparel, supplements, wearables.", "interest", 12_400_000, cpm(5.50), V),
  make("health_gym_members",         "Gym & Studio Members",             "Adults with an active gym, studio, or fitness-app membership. Retention + cross-sell target.", "interest", 8_200_000, cpm(5.00), V),
  make("health_home_gym_buyers",     "Home Gym & Equipment Buyers",      "Adults who purchased home fitness equipment in the last 12 months. High LTV for accessories.", "purchase_intent", 2_400_000, cpm(7.50), V),
  make("health_yoga_meditation",     "Yoga & Meditation Practitioners",  "Adults practicing yoga or meditation regularly. Wellness-premium buyer segment.", "interest", 5_600_000, cpm(6.00), V),
  make("health_running_enthusiasts", "Running & Endurance Enthusiasts",  "Adults running 10+ miles/week or training for events. Running shoes, apparel, nutrition.", "interest", 4_100_000, cpm(6.50), V),
  make("health_outdoor_recreation",  "Outdoor Recreation Enthusiasts",   "Adults who hike, camp, climb, or bike regularly. Gear buyers, travel overlap.", "interest", 6_900_000, cpm(6.00), V),

  // ── Diet & nutrition (4) ──────────────────────────────────────────────────
  make("health_plant_based",         "Plant-Based / Vegan Diet",         "Adults following plant-based or vegan diets. Alt-protein, CPG, restaurant target.", "interest", 3_400_000, cpm(6.50), V),
  make("health_keto_low_carb",       "Keto / Low-Carb Lifestyle",        "Adults following keto or low-carb diets. Specialty CPG and supplement target.", "interest", 2_800_000, cpm(6.50), V),
  make("health_gluten_free",         "Gluten-Free Buyers",               "Households purchasing gluten-free products regularly. Medical-need + lifestyle mix.", "purchase_intent", 4_200_000, cpm(6.00), V),
  make("health_supplements_buyers",  "Vitamins & Supplements Buyers",    "Adults buying vitamins / supplements monthly+. Strong D2C subscription target.", "purchase_intent", 11_800_000, cpm(5.50), V),

  // ── OTC & pharmacy (4) ────────────────────────────────────────────────────
  make("health_otc_cold_flu",        "OTC Cold & Flu Remedies Buyers",   "Households purchasing OTC cold/flu medications seasonally. Seasonal CPG target.", "purchase_intent", 28_000_000, cpm(4.50), V),
  make("health_otc_allergy",         "OTC Allergy Relief Buyers",        "Households purchasing OTC allergy medications. Strong spring / fall seasonality.", "purchase_intent", 18_000_000, cpm(4.50), V),
  make("health_otc_pain_relief",     "OTC Pain Relief Buyers",           "Households with regular OTC pain-relief purchases. Broad, high-frequency CPG.", "purchase_intent", 42_000_000, cpm(4.00), V),
  make("health_skincare_premium",    "Premium Skincare Buyers",          "Adults purchasing premium / dermatology-recommended skincare. Beauty + health crossover.", "purchase_intent", 8_700_000, cpm(7.00), V),

  // ── Life / condition-adjacent (6) ─────────────────────────────────────────
  make("health_new_parents_health",  "New Parents: Baby Care Products",  "Households with a child under 24 months buying baby-care products. Monthly replenishment.", "purchase_intent", 3_200_000, cpm(9.50), V),
  make("health_senior_wellness",     "Seniors: Wellness & Mobility",     "Adults 65+ engaging with senior-wellness content or products. Medicare & supplement adjacent.", "demographic", 14_000_000, cpm(6.50), V),
  make("health_mental_wellness_app", "Mental Wellness App Users",        "Adults using meditation / mental-wellness apps (Calm, Headspace, etc.). Subscription target.", "interest", 7_400_000, cpm(7.00), V),
  make("health_weight_management",   "Weight Management Intenders",      "Adults actively researching weight-management programs or products. Seasonal (Jan, spring).", "purchase_intent", 9_200_000, cpm(8.00), V),
  make("health_sleep_solutions",     "Sleep Solutions Intenders",        "Adults researching sleep products (mattresses, aids, wearables). Mid-to-late funnel.", "purchase_intent", 5_800_000, cpm(7.50), V),
  make("health_wellness_subscribers","Wellness Subscription Buyers",     "Adults subscribed to meal, supplement, or fitness boxes. High-LTV D2C target.", "purchase_intent", 2_600_000, cpm(8.50), V),
];
