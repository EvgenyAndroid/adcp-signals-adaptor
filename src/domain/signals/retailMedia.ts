// src/domain/signals/retailMedia.ts
// Sec-41: Retail Media Network audiences (15). Shoppable-intent signals
// historically only available through RMN partnerships — Amazon Ads,
// Walmart Connect, Target Roundel, Kroger Precision, etc.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "retail_media_network";

export const RETAIL_MEDIA_SIGNALS: CanonicalSignal[] = [
  make("rmn_amazon_prime_subscribers", "Amazon Prime Subscribers",
    "Amazon Prime members. High-intent Amazon ecosystem shoppers.",
    "purchase_intent", 82_000_000, cpm(8.00), V),
  make("rmn_amazon_high_aov_shoppers", "Amazon High-AOV Shoppers ($200+)",
    "Amazon shoppers with average order value $200+. Premium household goods + electronics.",
    "purchase_intent", 16_400_000, cpm(9.50), V),
  make("rmn_walmart_connect_shoppers", "Walmart+ / Walmart Connect Shoppers",
    "Walmart+ subscribers + Walmart Connect addressable audience.",
    "purchase_intent", 28_000_000, cpm(7.50), V),
  make("rmn_target_roundel_shoppers", "Target Circle / Roundel Shoppers",
    "Target Circle loyalty + Roundel RMN addressable audience.",
    "purchase_intent", 22_000_000, cpm(7.50), V),
  make("rmn_kroger_precision_loyal", "Kroger Precision Marketing Shoppers",
    "Kroger loyalty card shoppers addressable via Kroger Precision Marketing.",
    "purchase_intent", 14_000_000, cpm(8.00), V),
  make("rmn_costco_members", "Costco Members",
    "Costco warehouse members. Bulk-buyer + value-conscious affluent.",
    "purchase_intent", 18_000_000, cpm(7.50), V),
  make("rmn_homedepot_pro_contractors", "Home Depot Pro Contractors",
    "Home Depot Pro Xtra contractor + pro customer audience.",
    "purchase_intent", 4_200_000, cpm(11.00), V),
  make("rmn_lowes_onebuilder_contractors", "Lowe's MyLowe's Pro Contractors",
    "Lowe's pro contractor loyalty audience.",
    "purchase_intent", 3_400_000, cpm(11.00), V),
  make("rmn_wayfair_home_shoppers", "Wayfair Home Goods Shoppers",
    "Wayfair addressable shoppers — furniture + home decor.",
    "purchase_intent", 8_400_000, cpm(8.50), V),
  make("rmn_sephora_beauty_insiders", "Sephora Beauty Insiders",
    "Sephora Beauty Insider loyalty tier members.",
    "purchase_intent", 11_800_000, cpm(9.00), V),
  make("rmn_bestbuy_tech_shoppers", "Best Buy My Best Buy Shoppers",
    "Best Buy My Best Buy members. CE + home-appliance intent.",
    "purchase_intent", 14_400_000, cpm(8.50), V),
  make("rmn_instacart_grocery_frequent", "Instacart Frequent Shoppers",
    "Instacart shoppers with 3+ orders per month. Grocery + CPG intent.",
    "purchase_intent", 9_800_000, cpm(8.50), V),
  make("rmn_ulta_beauty_loyal", "Ulta Ultamate Rewards Members",
    "Ulta Ultamate rewards members. Mass + prestige beauty.",
    "purchase_intent", 7_600_000, cpm(9.00), V),
  make("rmn_dollargeneral_value_shoppers", "Dollar General Value Shoppers",
    "Dollar General DG Pickup + DG Go addressable shoppers.",
    "purchase_intent", 16_000_000, cpm(6.50), V),
  make("rmn_nordstrom_luxury_shoppers", "Nordstrom Luxury Shoppers",
    "Nordstrom + Nordstrom Rack shoppers in premium tiers.",
    "purchase_intent", 5_200_000, cpm(10.00), V),
];
