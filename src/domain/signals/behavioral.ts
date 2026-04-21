// src/domain/signals/behavioral.ts
// Behavioral vertical — 20 signals derived from online browsing, app
// usage, site-visit, and search-behavior patterns. Classified as
// `interest` per AdCP enum (behavior-as-interest); the vertical label
// carries the finer semantic.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "behavioral";

export const BEHAVIORAL_SIGNALS: CanonicalSignal[] = [
  // ── Content consumption (5) ───────────────────────────────────────────────
  make("beh_news_heavy",             "Heavy News Consumers",           "Adults visiting news sites or apps 10+ times/week. Broad reach, news-publisher audience.", "interest", 28_000_000, cpm(4.50), V),
  make("beh_business_news_readers",  "Business News Readers",          "Adults engaged with WSJ, Bloomberg, FT, CNBC, and similar business/finance content.", "interest", 9_400_000, cpm(7.00), V),
  make("beh_long_form_readers",      "Long-Form Content Readers",      "Adults consistently engaging with articles 1,500+ words. Think pieces, deep-reads target.", "interest", 6_800_000, cpm(5.50), V),
  make("beh_podcast_listeners",      "Weekly Podcast Listeners",       "Adults who listen to 1+ podcasts weekly. Audio-ad + brand-sponsorship adjacent.", "interest", 24_000_000, cpm(5.00), V),
  make("beh_video_heavy_mobile",     "Heavy Mobile Video Watchers",    "Adults watching 60+ min/day of mobile video. Short-form, social, creator content.", "interest", 19_000_000, cpm(4.50), V),

  // ── Shopping & commerce behavior (5) ──────────────────────────────────────
  make("beh_comparison_shoppers",    "Comparison Shoppers",            "Adults who visit 3+ retailer sites before purchase. Price-sensitive, decision-stage target.", "interest", 11_200_000, cpm(6.50), V),
  make("beh_cart_abandoners",        "Recent Cart Abandoners",         "Adults who added items to cart but did not purchase in the last 14 days. Remarketing.", "interest", 8_400_000, cpm(7.50), V),
  make("beh_coupon_deal_seekers",    "Coupon & Deal Seekers",          "Adults who regularly use coupons, cashback, promo-code sites. Value-driven segment.", "interest", 14_600_000, cpm(5.00), V),
  make("beh_premium_buyers",         "Premium / Full-Price Buyers",    "Adults who rarely use discounts — purchase at full price. Luxury + brand-loyal adjacent.", "interest", 5_900_000, cpm(8.50), V),
  make("beh_mobile_commerce_heavy",  "Mobile Commerce Heavy Users",    "Adults who complete 50%+ of purchases on mobile. D2C app, checkout-UX target.", "interest", 16_800_000, cpm(5.50), V),

  // ── App & device engagement (5) ───────────────────────────────────────────
  make("beh_social_heavy_instagram", "Instagram Heavy Users",          "Adults with 2+ hours/day on Instagram. Creator + lifestyle brand target.", "interest", 22_000_000, cpm(5.00), V),
  make("beh_social_heavy_tiktok",    "TikTok Heavy Users",             "Adults with 2+ hours/day on TikTok. Skews younger, high-attention short-form video.", "interest", 18_500_000, cpm(5.50), V),
  make("beh_app_gaming_daily",       "Daily Mobile Gamers",            "Adults playing mobile games 30+ min/day. Strong in-app-purchase + IAP-adjacent target.", "interest", 26_000_000, cpm(4.50), V),
  make("beh_dating_app_active",      "Active Dating App Users",        "Adults active on dating apps in the last 30 days. Single, urban-skewing, discretionary spenders.", "interest", 11_000_000, cpm(7.00), V),
  make("beh_productivity_app_power", "Productivity App Power Users",   "Adults heavy on Notion, Slack, Linear, Asana, etc. Knowledge-worker target.", "interest", 6_400_000, cpm(9.00), V),

  // ── Search intent (5) ─────────────────────────────────────────────────────
  make("beh_search_home_improve",    "Search Intent: Home Improvement","Adults searching home-improvement terms (remodel, DIY, contractor) in last 30 days.", "interest", 8_700_000, cpm(8.00), V),
  make("beh_search_travel_planning", "Search Intent: Travel Planning", "Adults with recent travel-planning searches (flights, hotels, destinations).", "interest", 12_400_000, cpm(9.00), V),
  make("beh_search_career_jobs",     "Search Intent: Jobs / Career",   "Adults searching job-board, resume, and career-transition terms.", "interest", 7_800_000, cpm(8.50), V),
  make("beh_search_education",       "Search Intent: Education",       "Adults researching degree programs, certifications, or online courses.", "interest", 5_200_000, cpm(8.00), V),
  make("beh_search_auto_research",   "Search Intent: Auto Research",   "Adults searching auto-review, comparison, and dealer-inventory terms.", "interest", 6_400_000, cpm(9.50), V),
];
