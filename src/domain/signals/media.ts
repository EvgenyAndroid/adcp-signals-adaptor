// src/domain/signals/media.ts
// Media / Device vertical — 20 signals covering CTV viewership, streaming
// subscriptions, daypart patterns, device ownership, connection type.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "media";

export const MEDIA_SIGNALS: CanonicalSignal[] = [
  // ── Streaming / CTV (6) ───────────────────────────────────────────────────
  make("media_svod_heavy",              "Heavy SVOD Subscribers",         "Households subscribed to 3+ SVOD services (Netflix, Disney+, Max, Hulu, Prime).", "interest", 18_400_000, cpm(6.00), V),
  make("media_ad_supported_svod",       "Ad-Supported Streaming Viewers", "Households on ad-supported SVOD tiers (Netflix basic, Disney+ basic, Peacock, Hulu w/ads).", "interest", 22_800_000, cpm(7.00), V),
  make("media_fast_channel_viewers",    "FAST Channel Viewers",           "Adults watching Free Ad-Supported Streaming TV (Tubi, Pluto, Freevee, Roku).", "interest", 14_600_000, cpm(6.50), V),
  make("media_cord_cutters",            "Cord Cutters: No Linear",        "Households with no linear cable or satellite. Streaming-only.", "interest", 28_000_000, cpm(5.50), V),
  make("media_cord_shavers",            "Cord Shavers: Reduced Linear",   "Households who downgraded from full cable to skinny bundle + streaming.", "interest", 11_200_000, cpm(6.00), V),
  make("media_linear_loyalists",        "Linear TV Loyalists",            "Households still on full cable / satellite with low streaming adoption. Skews 55+.", "interest", 19_400_000, cpm(5.00), V),

  // ── Genre / daypart (5) ───────────────────────────────────────────────────
  make("media_sports_watchers_live",    "Live Sports Watchers",           "Adults watching 5+ hours/week of live sports (NFL, NBA, MLB, soccer, etc.).", "interest", 34_000_000, cpm(7.50), V),
  make("media_news_viewers_national",   "National News Viewers",          "Adults watching network or cable national news 4+ nights/week.", "interest", 16_800_000, cpm(5.50), V),
  make("media_reality_tv_fans",         "Reality TV Enthusiasts",         "Adults with strong reality-TV affinity (dating, competition, lifestyle).", "interest", 12_400_000, cpm(5.00), V),
  make("media_daypart_morning",         "Morning Daypart Viewers",        "Adults watching 5-9am (morning news, talk, kids content). Breakfast CPG target.", "interest", 11_600_000, cpm(5.50), V),
  make("media_daypart_primetime",       "Primetime Viewers",              "Adults watching 8-11pm. Broad reach with CPG, auto, pharma historical skew.", "interest", 42_000_000, cpm(5.50), V),

  // ── Device (5) ────────────────────────────────────────────────────────────
  make("media_device_ctv_smart_tv",     "Smart TV Households",            "Households with a connected smart TV (Samsung Tizen, LG webOS, Roku TV, Google TV).", "interest", 38_000_000, cpm(5.50), V),
  make("media_device_roku",             "Roku Device Users",              "Households with a Roku device (stick, Ultra, Roku TV). Ad-supported-primary audience.", "interest", 22_000_000, cpm(6.00), V),
  make("media_device_fire_tv",          "Amazon Fire TV Users",           "Households with Fire TV stick or built-in. Amazon-ecosystem commerce crossover.", "interest", 17_000_000, cpm(6.00), V),
  make("media_device_apple_tv",         "Apple TV Users",                 "Households with Apple TV hardware. Premium-content + Apple-ecosystem skew.", "interest", 6_400_000, cpm(7.50), V),
  make("media_device_gaming_console",   "Gaming Console Households",      "Households with PS5, Xbox Series, or Switch. Gaming + SVOD + YouTube overlap.", "interest", 16_800_000, cpm(6.50), V),

  // ── Mobile / connection (4) ───────────────────────────────────────────────
  make("media_mobile_ios_users",        "iOS Mobile Users",               "Adults with iPhone. HHI skew $75K+, premium-app consumption.", "demographic", 118_000_000, cpm(5.00), V),
  make("media_mobile_android_users",    "Android Mobile Users",           "Adults with Android phones. Broad distribution, value-app consumption.", "demographic", 102_000_000, cpm(4.50), V),
  make("media_mobile_5g_users",         "5G Connection Users",            "Adults with 5G service. Higher data consumption, streaming + gaming skew.", "demographic", 78_000_000, cpm(5.50), V),
  make("media_wifi_heavy_home",         "Heavy Home WiFi Users",          "Households with 500+ Mbps home broadband. Multi-device streaming + remote work.", "demographic", 42_000_000, cpm(5.00), V),
];
