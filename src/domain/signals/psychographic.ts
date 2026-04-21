// src/domain/signals/psychographic.ts
// Psychographic / lifestyle vertical — 20 signals. Attitudes, values,
// lifestyle archetypes. Mosaic / PRIZM-style segmentation without
// proprietary branding.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "psychographic";

export const PSYCHOGRAPHIC_SIGNALS: CanonicalSignal[] = [
  // ── Value orientations (5) ────────────────────────────────────────────────
  make("psycho_early_adopters",          "Early Adopters",                   "Adults first to try new products, services, and technologies. High openness + discretionary spend.", "interest", 9_200_000, cpm(8.50), V),
  make("psycho_value_conscious",         "Value-Conscious / Deal-Focused",   "Adults who prioritize price and deals. Coupon, cashback, comparison-shopping crossover.", "interest", 32_000_000, cpm(5.00), V),
  make("psycho_premium_quality",         "Premium-Quality Seekers",          "Adults prioritizing quality and craftsmanship over price. Brand-loyal, premium-price accepters.", "interest", 14_600_000, cpm(7.50), V),
  make("psycho_convenience_first",       "Convenience-First Consumers",      "Adults valuing time-savings: subscriptions, delivery, curbside, ready-to-eat.", "interest", 26_000_000, cpm(6.50), V),
  make("psycho_experience_over_things",  "Experience-Over-Possession",       "Adults prioritizing experiences (travel, events, dining) over material goods.", "interest", 18_400_000, cpm(7.00), V),

  // ── Lifestyle archetypes (6) ──────────────────────────────────────────────
  make("psycho_urban_sophisticates",     "Urban Sophisticates",              "Adults in major urban metros, bachelors+, high cultural and dining engagement.", "interest", 8_400_000, cpm(8.00), V),
  make("psycho_suburban_family",         "Suburban Family-Focused",          "Suburban households with children, community-oriented, minivan/SUV drivers.", "interest", 22_000_000, cpm(6.00), V),
  make("psycho_rural_traditionalist",    "Rural Traditionalists",            "Rural-area adults, practical, value-oriented, community and faith-centric.", "interest", 17_000_000, cpm(5.00), V),
  make("psycho_creative_class",          "Creative Class Professionals",     "Designers, writers, artists, media/tech creatives. Urban + independent-work skew.", "interest", 6_200_000, cpm(8.50), V),
  make("psycho_striving_professional",   "Striving Young Professionals",     "25-35, urban, bachelors+, career-ambitious, fitness + dining + travel spend.", "interest", 7_800_000, cpm(8.50), V),
  make("psycho_diy_self_reliant",        "DIY / Self-Reliant",               "Adults strongly inclined to fix, build, grow, and repair themselves. Home improvement + outdoor.", "interest", 14_200_000, cpm(6.00), V),

  // ── Values & attitudes (5) ────────────────────────────────────────────────
  make("psycho_sustainability_focused",  "Sustainability-Focused",           "Adults who factor environmental impact into purchase decisions. B-corp, eco, fair-trade.", "interest", 11_800_000, cpm(7.50), V),
  make("psycho_health_focused",          "Health-Focused Lifestyle",         "Adults where health is an explicit purchase driver. Organic, wellness, fitness.", "interest", 18_000_000, cpm(7.00), V),
  make("psycho_family_first",            "Family-First Priorities",          "Adults whose spending and media choices center on family and children.", "interest", 36_000_000, cpm(6.00), V),
  make("psycho_adventure_seekers",       "Adventure Seekers",                "Adults with strong outdoor / travel / experience appetite. High-intent for active gear + travel.", "interest", 9_400_000, cpm(7.50), V),
  make("psycho_tech_enthusiasts",        "Tech Enthusiasts",                 "Adults with high engagement on tech news, reviews, and new-product releases.", "interest", 13_400_000, cpm(7.00), V),

  // ── Media / opinion orientation (4) ───────────────────────────────────────
  make("psycho_opinion_leaders",         "Opinion Leaders / Influencers",    "Adults whose social / professional networks regularly seek their recommendations.", "interest", 4_200_000, cpm(9.00), V),
  make("psycho_trend_followers",         "Trend Followers",                  "Adults who adopt trends after early movers. Social-signal + peer-driven purchasing.", "interest", 16_800_000, cpm(6.00), V),
  make("psycho_late_adopters",           "Late Adopters / Pragmatists",      "Adults who adopt new tech/products only after mainstream penetration. Skews 55+.", "interest", 18_600_000, cpm(5.00), V),
  make("psycho_minimalists",             "Minimalists",                      "Adults favoring fewer, better possessions and experiences. Quality-over-quantity philosophy.", "interest", 5_800_000, cpm(7.50), V),
];
