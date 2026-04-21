// src/domain/signals/retail.ts
// Retail / CPG vertical — 20 signals covering category buyers (fine-grained),
// retailer visitation, brand-level vs. private-label preference, channel
// mix, and retail-media network adjacent signals.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "retail";

export const RETAIL_SIGNALS: CanonicalSignal[] = [
  // ── Category buyers (8) ───────────────────────────────────────────────────
  make("retail_cat_apparel",            "Apparel & Fashion Buyers",       "Adults spending $100+/month on apparel. Fast-fashion + premium mix.", "purchase_intent", 22_000_000, cpm(6.00), V),
  make("retail_cat_footwear",           "Footwear Buyers",                "Adults purchasing footwear quarterly+. Athletic + dress + casual splits available.", "purchase_intent", 14_400_000, cpm(6.00), V),
  make("retail_cat_home_goods",         "Home Goods & Decor Buyers",      "Adults spending $200+/quarter on home goods. Urban + new-homeowner overlap.", "purchase_intent", 12_600_000, cpm(6.50), V),
  make("retail_cat_toys_games",         "Toys & Games Buyers",            "Households buying toys / games. Parents + grandparents + adult gamers.", "purchase_intent", 18_800_000, cpm(6.00), V),
  make("retail_cat_jewelry",            "Jewelry & Accessories Buyers",   "Adults purchasing jewelry $200+. Gifting + self-purchase mix. Seasonal Q4 spike.", "purchase_intent", 4_200_000, cpm(9.00), V),
  make("retail_cat_electronics",        "Consumer Electronics Buyers",    "Households with monthly consumer electronics purchases. Broad definition.", "purchase_intent", 16_000_000, cpm(6.50), V),
  make("retail_cat_sporting_goods",     "Sporting Goods Buyers",          "Adults purchasing sporting / outdoor goods quarterly+. Active lifestyle target.", "purchase_intent", 8_900_000, cpm(6.50), V),
  make("retail_cat_office_school",      "Office & School Supply Buyers",  "Households + SMBs with monthly office/school supply purchases. Back-to-school seasonality.", "purchase_intent", 26_000_000, cpm(5.00), V),

  // ── Retailer visitation (6) ───────────────────────────────────────────────
  make("retail_shop_amazon_heavy",      "Amazon Heavy Shoppers",          "Households with 10+ Amazon orders per month. Prime members, broad category reach.", "purchase_intent", 34_000_000, cpm(5.50), V),
  make("retail_shop_target",            "Target Frequent Shoppers",       "Households with 4+ monthly Target visits. Skews suburban, family + millennial.", "purchase_intent", 28_000_000, cpm(5.00), V),
  make("retail_shop_walmart_grocery",   "Walmart Grocery Shoppers",       "Households doing primary grocery at Walmart. Value-driven, broad geographic reach.", "purchase_intent", 36_000_000, cpm(4.00), V),
  make("retail_shop_costco",            "Costco Members",                 "Costco cardholders. Bulk-buy behavior, HHI skew $75K+, suburban + SMB mix.", "purchase_intent", 26_000_000, cpm(4.50), V),
  make("retail_shop_whole_foods",       "Whole Foods Shoppers",           "Households with 2+ monthly Whole Foods visits. Premium grocery + Amazon Prime overlap.", "purchase_intent", 5_400_000, cpm(8.50), V),
  make("retail_shop_tjx_ross",          "Off-Price Retail Shoppers",      "Households shopping TJ Maxx, Marshalls, Ross, HomeGoods. Treasure-hunt + value mix.", "purchase_intent", 19_800_000, cpm(5.00), V),

  // ── Channel mix & behavior (3) ────────────────────────────────────────────
  make("retail_omnichannel_shoppers",   "Omnichannel Shoppers",           "Adults blending online + in-store within categories. BOPIS + curbside-pickup users.", "purchase_intent", 21_000_000, cpm(6.00), V),
  make("retail_bopis_heavy",            "BOPIS / Pickup Heavy Users",     "Households using buy-online-pickup-in-store 3+ times/month. Convenience-driven.", "purchase_intent", 9_400_000, cpm(6.00), V),
  make("retail_returning_customers",    "Returning Customers",            "Adults with repeat-purchase history at a given retailer. Retention-campaign target.", "purchase_intent", 18_000_000, cpm(5.50), V),

  // ── Brand preference (3) ──────────────────────────────────────────────────
  make("retail_premium_brand_buyers",   "Premium Brand Buyers",           "Adults skewing toward premium / national brands over private label. Brand-trust premium.", "purchase_intent", 12_800_000, cpm(6.50), V),
  make("retail_dtc_brand_buyers",       "DTC Brand Buyers",               "Adults purchasing from direct-to-consumer brands (Warby, Allbirds, Away, Glossier, etc.).", "purchase_intent", 7_200_000, cpm(8.00), V),
  make("retail_sustainable_brands",     "Sustainable Brand Preferrers",   "Adults preferring brands with sustainability, fair-trade, or B-corp positioning.", "purchase_intent", 9_800_000, cpm(7.50), V),
];
