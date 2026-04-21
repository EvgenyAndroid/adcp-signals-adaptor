// src/domain/signals/intent.ts
// In-market / intent vertical — 20 signals for cross-category purchase
// intent outside auto, finance, health (which have their own files).
// Travel, home, electronics, education, and services.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "intent";

export const INTENT_SIGNALS: CanonicalSignal[] = [
  // ── Travel (5) ────────────────────────────────────────────────────────────
  make("intent_travel_domestic_leisure", "Travel Intent: Domestic Leisure",  "Adults planning US leisure travel in the next 90 days. Hotel, car-rental, destination target.", "purchase_intent", 12_400_000, cpm(8.50), V),
  make("intent_travel_international",    "Travel Intent: International",     "Adults planning international travel in the next 6 months. Premium airline + cruise target.", "purchase_intent", 5_200_000, cpm(11.00), V),
  make("intent_travel_luxury",           "Travel Intent: Luxury",            "Adults researching 5-star hotels, premium cabins, luxury resorts. HHI $150K+ skew.", "purchase_intent", 1_800_000, cpm(13.50), V),
  make("intent_travel_cruise",           "Travel Intent: Cruise",            "Adults researching cruise lines in the last 30 days. Skews 45+, couples + extended family.", "purchase_intent", 2_600_000, cpm(10.50), V),
  make("intent_travel_business",         "Business Travelers",               "Adults with 4+ business trips per year. Airline loyalty + corporate card target.", "purchase_intent", 8_200_000, cpm(9.00), V),

  // ── Home (4) ──────────────────────────────────────────────────────────────
  make("intent_home_buyer_active",       "Home Buyer: Actively Searching",   "Adults engaged with real-estate listings, mortgage calcs in last 30 days. Peak intent.", "purchase_intent", 3_100_000, cpm(13.00), V),
  make("intent_home_seller",             "Home Seller Intent",               "Adults researching home-selling (agents, listings, prep). Move-up + downsize mix.", "purchase_intent", 1_400_000, cpm(11.50), V),
  make("intent_home_remodel",            "Home Remodel Intenders",           "Adults researching major home remodel (kitchen, bath, addition). Premium contractor target.", "purchase_intent", 4_600_000, cpm(9.50), V),
  make("intent_home_furniture",          "Home Furniture Intenders",         "Adults shopping for furniture in the next 60 days. New-mover + remodel overlap.", "purchase_intent", 5_800_000, cpm(8.50), V),

  // ── Electronics (4) ───────────────────────────────────────────────────────
  make("intent_electronics_tv",          "In-Market: New TV",                "Adults researching new televisions (QLED, OLED, 65\\\"+). Strong CTV-advertiser target.", "purchase_intent", 3_400_000, cpm(9.00), V),
  make("intent_electronics_laptop",      "In-Market: New Laptop",            "Adults researching laptops for work or creative use. Strong back-to-school + Q4 seasonality.", "purchase_intent", 4_900_000, cpm(8.50), V),
  make("intent_electronics_smartphone",  "In-Market: New Smartphone",        "Adults researching new phones (iPhone, Pixel, Samsung flagship). Cyclic: Sept, Mar.", "purchase_intent", 8_600_000, cpm(8.00), V),
  make("intent_electronics_wearables",   "In-Market: Wearables",             "Adults researching smartwatches, rings, fitness trackers. Health + tech crossover.", "purchase_intent", 3_700_000, cpm(7.50), V),

  // ── Education & services (4) ──────────────────────────────────────────────
  make("intent_education_grad_school",   "Grad School Intenders",            "Adults researching MBA, JD, MD, PhD programs. Skews 25-40, bachelors+.", "purchase_intent", 820_000,   cpm(11.50), V),
  make("intent_education_online_course", "Online Course / Bootcamp Intent",  "Adults researching online learning platforms (Coursera, Udemy, bootcamps).", "purchase_intent", 3_400_000, cpm(9.00), V),
  make("intent_services_lawyer",         "Legal Services Intent",            "Adults researching attorneys or legal services. Estate, injury, business law split.", "purchase_intent", 1_600_000, cpm(13.50), V),
  make("intent_services_home_cleaning",  "Home Cleaning Services Intent",    "Adults researching residential cleaning services. Dual-income + new-parent target.", "purchase_intent", 2_100_000, cpm(7.50), V),

  // ── Subscription (3) ──────────────────────────────────────────────────────
  make("intent_streaming_new_sub",       "Streaming Subscription Intenders", "Adults researching new streaming subscriptions. Acquisition target for SVOD / FAST tiers.", "purchase_intent", 4_200_000, cpm(8.00), V),
  make("intent_meal_kit",                "Meal Kit / Food Delivery Intent",  "Adults researching meal kits or weekly food delivery. Urban + new-parent overlap.", "purchase_intent", 2_800_000, cpm(8.50), V),
  make("intent_gym_membership",          "Gym & Fitness Membership Intent",  "Adults researching gym memberships or boutique fitness. New-Year seasonality.", "purchase_intent", 3_900_000, cpm(8.00), V),
];
