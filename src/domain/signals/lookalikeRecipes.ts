// src/domain/signals/lookalikeRecipes.ts
// Sec-41: Named 1P-lookalike recipes (10). Each entry represents a
// modeled lookalike template built from a common seed-audience shape
// (high-LTV customers, rewards members, etc.). Generation mode = derived
// so they're visibly templated.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "lookalike_recipe";

export const LOOKALIKE_RECIPE_SIGNALS: CanonicalSignal[] = [
  make("lal_recipe_bestbuy_vip_customers", "Lookalike: Best Buy VIP Customers",
    "Modeled lookalike of Best Buy top-tier customers ($5k+ annual CE spend).",
    "composite", 4_800_000, cpm(10.50), V, { generationMode: "derived" }),
  make("lal_recipe_amex_platinum_holders", "Lookalike: Amex Platinum Cardholders",
    "Modeled lookalike of Amex Platinum cardholder profile (>$200k HHI, travel-heavy).",
    "composite", 1_200_000, cpm(13.00), V, { generationMode: "derived" }),
  make("lal_recipe_luxury_auto_owners", "Lookalike: Luxury Auto Owners",
    "Modeled lookalike of luxury auto owners (BMW / MB / Audi / Lexus).",
    "composite", 3_400_000, cpm(12.00), V, { generationMode: "derived" }),
  make("lal_recipe_disneyplus_power_users", "Lookalike: Disney+ Power Users",
    "Modeled lookalike of Disney+ daily watchers with kids household.",
    "composite", 7_600_000, cpm(10.00), V, { generationMode: "derived" }),
  make("lal_recipe_peloton_all_access", "Lookalike: Peloton All-Access Members",
    "Modeled lookalike of Peloton All-Access subscribers (fitness-affluent urban).",
    "composite", 1_800_000, cpm(12.00), V, { generationMode: "derived" }),
  make("lal_recipe_lululemon_vip", "Lookalike: Lululemon VIP Customers",
    "Modeled lookalike of Lululemon top-tier customers (athleisure + premium fitness).",
    "composite", 2_200_000, cpm(11.00), V, { generationMode: "derived" }),
  make("lal_recipe_shake_shack_regulars", "Lookalike: Shake Shack Regulars",
    "Modeled lookalike of Shake Shack app users with 4+ monthly orders.",
    "composite", 1_400_000, cpm(10.00), V, { generationMode: "derived" }),
  make("lal_recipe_equinox_members", "Lookalike: Equinox Gym Members",
    "Modeled lookalike of Equinox + SoulCycle premium urban fitness members.",
    "composite", 680_000, cpm(12.50), V, { generationMode: "derived" }),
  make("lal_recipe_wholefoods_amazon_prime", "Lookalike: Whole Foods + Amazon Prime",
    "Modeled lookalike of Whole Foods shoppers who are also Amazon Prime members.",
    "composite", 9_200_000, cpm(10.00), V, { generationMode: "derived" }),
  make("lal_recipe_warby_parker_repeat", "Lookalike: Warby Parker Repeat Buyers",
    "Modeled lookalike of Warby Parker 2+ purchase customers (DTC eyewear).",
    "composite", 1_600_000, cpm(11.00), V, { generationMode: "derived" }),
];
