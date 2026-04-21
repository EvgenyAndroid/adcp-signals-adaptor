// src/domain/signals/transactional.ts
// Transactional / purchase vertical — 20 signals. Retained-purchase data
// (what people have bought), spend tiers, channel preference, loyalty.
// Complements the /intent vertical which covers forward-looking research.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "transactional";

export const TRANSACTIONAL_SIGNALS: CanonicalSignal[] = [
  // ── CPG category buyers (6) ───────────────────────────────────────────────
  make("trans_cpg_beverage_premium",     "Premium Beverage Buyers",        "Households buying premium / craft beverages (coffee, beer, wine, spirits).", "purchase_intent", 14_800_000, cpm(6.00), V),
  make("trans_cpg_snack_healthy",        "Healthy Snack Category Buyers",  "Households buying health-positioned snacks (protein, keto, plant-based, RTD).", "purchase_intent", 11_200_000, cpm(6.50), V),
  make("trans_cpg_beauty_premium",       "Premium Beauty Buyers",          "Households buying premium beauty + cosmetics ($25+/item). Sephora / Ulta + DTC.", "purchase_intent", 9_400_000, cpm(7.00), V),
  make("trans_cpg_pet_food_premium",     "Premium Pet Food Buyers",        "Households buying premium pet food (grain-free, fresh, veterinary). Pet-owner HHI skew.", "purchase_intent", 6_800_000, cpm(7.50), V),
  make("trans_cpg_baby_care",            "Baby Care Category Buyers",      "Households with regular baby-care purchases (diapers, formula, wipes).", "purchase_intent", 3_900_000, cpm(8.50), V),
  make("trans_cpg_household_eco",        "Eco Household Products Buyers",  "Households buying eco-positioned household products (cleaning, paper, laundry).", "purchase_intent", 7_200_000, cpm(6.50), V),

  // ── Channel preference (4) ────────────────────────────────────────────────
  make("trans_channel_mass",             "Mass Retail Shoppers",           "Households with 5+ monthly visits to Walmart, Target, Costco, Sam's. Broad CPG reach.", "purchase_intent", 42_000_000, cpm(4.00), V),
  make("trans_channel_club",             "Warehouse Club Members",         "Households with Costco, Sam's, BJ's membership. Bulk-buy behavior, family + SMB mix.", "purchase_intent", 26_000_000, cpm(4.50), V),
  make("trans_channel_specialty",        "Specialty Retailer Shoppers",    "Households preferring specialty retail (Sephora, REI, Williams-Sonoma, etc.).", "purchase_intent", 8_900_000, cpm(7.00), V),
  make("trans_channel_online_heavy",     "Online-Primary Shoppers",        "Households where 60%+ of purchases are online. Amazon, DTC, marketplace target.", "purchase_intent", 18_400_000, cpm(5.50), V),

  // ── Spend tier (4) ────────────────────────────────────────────────────────
  make("trans_spend_tier_top_10",        "Retail Spend: Top 10%",          "Households in the top decile of annual retail spend. Premium + discretionary target.", "purchase_intent", 5_400_000, cpm(9.00), V),
  make("trans_spend_tier_top_quartile",  "Retail Spend: Top Quartile",     "Households in the top 25% of retail spend. High-LTV acquisition target.", "purchase_intent", 13_200_000, cpm(7.00), V),
  make("trans_spend_subscription_heavy", "Subscription-Heavy Households",  "Households with 5+ recurring subscriptions (streaming, box, service). LTV-concentrated.", "purchase_intent", 7_600_000, cpm(7.50), V),
  make("trans_spend_restaurant_heavy",   "Restaurant / Dining-Out Heavy",  "Households spending $300+/month on restaurants. QSR + fine-dining mix.", "purchase_intent", 9_800_000, cpm(6.50), V),

  // ── Loyalty programs (3) ──────────────────────────────────────────────────
  make("trans_loyalty_active_multi",     "Active Loyalty Program Members", "Adults active in 3+ loyalty programs. Brand-aware, retention-receptive.", "purchase_intent", 21_000_000, cpm(5.50), V),
  make("trans_loyalty_airline_premier",  "Airline Elite Loyalty Members",  "Adults with airline elite status. Premium cabin + card + hotel crossover.", "purchase_intent", 2_400_000, cpm(11.00), V),
  make("trans_loyalty_hotel_premier",    "Hotel Elite Loyalty Members",    "Adults with hotel elite status (Marriott, Hilton, Hyatt Gold+).", "purchase_intent", 1_900_000, cpm(10.50), V),

  // ── Private label & value (3) ─────────────────────────────────────────────
  make("trans_private_label_buyers",     "Private Label / Store Brand Buyers","Households skewing heavily toward private-label / store-brand products. Value-driven.", "purchase_intent", 22_000_000, cpm(4.50), V),
  make("trans_brand_loyalists",          "Brand Loyalists",                "Households with high single-brand purchase ratios within categories. Retention target.", "purchase_intent", 14_000_000, cpm(6.00), V),
  make("trans_subscription_box",         "Subscription Box Buyers",        "Households with 2+ active curated subscription boxes. High LTV D2C target.", "purchase_intent", 3_200_000, cpm(7.50), V),
];
