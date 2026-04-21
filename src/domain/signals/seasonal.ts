// src/domain/signals/seasonal.ts
// Seasonal / occasion vertical — 20 signals tied to calendar events,
// major holidays, life-moment gift windows.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "seasonal";

export const SEASONAL_SIGNALS: CanonicalSignal[] = [
  // ── Holiday shoppers (6) ──────────────────────────────────────────────────
  make("seasonal_holiday_black_friday",  "Black Friday / Cyber Monday Shoppers","Adults with elevated purchase activity during BF/CM window. Deal-seeker + gift-buyer mix.", "purchase_intent", 54_000_000, cpm(8.00), V),
  make("seasonal_holiday_q4_gifting",    "Q4 Holiday Gift Buyers",              "Adults actively shopping for holiday gifts (Nov-Dec). Broadest seasonal segment.", "purchase_intent", 88_000_000, cpm(7.50), V),
  make("seasonal_holiday_valentines",    "Valentine's Day Shoppers",            "Adults purchasing for Valentine's Day. Jewelry, flowers, restaurants, gifts.", "purchase_intent", 42_000_000, cpm(8.00), V),
  make("seasonal_holiday_mothers_day",   "Mother's Day Gift Buyers",            "Adults shopping for Mother's Day in the April/May window.", "purchase_intent", 62_000_000, cpm(7.50), V),
  make("seasonal_holiday_fathers_day",   "Father's Day Gift Buyers",            "Adults shopping for Father's Day in the May/June window.", "purchase_intent", 52_000_000, cpm(7.00), V),
  make("seasonal_holiday_memorial_day",  "Memorial / Labor / July 4 Shoppers",  "Adults buying during long-weekend summer sale windows. Outdoor + travel + appliance.", "purchase_intent", 46_000_000, cpm(6.50), V),

  // ── School calendar (3) ───────────────────────────────────────────────────
  make("seasonal_back_to_school_k12",    "Back-to-School: K-12 Parents",        "Parents buying for K-12 BTS window (late July through mid-September).", "purchase_intent", 26_000_000, cpm(8.00), V),
  make("seasonal_back_to_school_college","Back-to-School: College Students",    "College students + parents in BTS window. Dorm, electronics, apparel surge.", "purchase_intent", 11_400_000, cpm(8.50), V),
  make("seasonal_graduation_gift",       "Graduation Gift Buyers",              "Adults purchasing graduation gifts (May/June). Gift-card + experience skew.", "purchase_intent", 18_000_000, cpm(7.50), V),

  // ── Life-moment gifting (4) ───────────────────────────────────────────────
  make("seasonal_birthday_gift_adult",   "Adult Birthday Gift Buyers",          "Year-round birthday gift shoppers. Baseline always-on gifting segment.", "purchase_intent", 68_000_000, cpm(6.50), V),
  make("seasonal_wedding_gift",          "Wedding Gift Buyers",                 "Adults purchasing wedding / registry gifts. Spring + summer peak.", "purchase_intent", 14_800_000, cpm(7.50), V),
  make("seasonal_baby_shower_gift",      "Baby Shower Gift Buyers",             "Adults purchasing baby shower gifts. Registry-driven + occasion-specific.", "purchase_intent", 12_400_000, cpm(7.50), V),
  make("seasonal_anniversary_gift",      "Anniversary Gift Buyers",             "Adults purchasing anniversary gifts for partner / parents / self. Year-round baseline.", "purchase_intent", 22_000_000, cpm(7.00), V),

  // ── Event attendees (4) ───────────────────────────────────────────────────
  make("seasonal_event_concert",         "Concert / Live Music Attendees",      "Adults with live-music ticket purchases in the last 12 months. Travel + entertainment overlap.", "purchase_intent", 14_800_000, cpm(7.50), V),
  make("seasonal_event_sports",          "Live Sports Event Attendees",         "Adults with pro-sports ticket purchases in the last 12 months.", "purchase_intent", 11_600_000, cpm(7.00), V),
  make("seasonal_event_festival",        "Music Festival Attendees",            "Adults attending multi-day music festivals (Coachella, Bonnaroo, Lollapalooza, etc.).", "purchase_intent", 3_800_000, cpm(8.50), V),
  make("seasonal_event_conference",      "Professional Conference Attendees",   "Adults registered for B2B / professional conferences. Cross-over to b2b.event_attendees.", "purchase_intent", 6_400_000, cpm(9.00), V),

  // ── Seasonal behavior windows (3) ─────────────────────────────────────────
  make("seasonal_tax_season_filers",     "Tax Season Active Filers",            "Adults actively filing taxes (Feb-April). Refund-spend, TurboTax/H&R Block audience.", "purchase_intent", 48_000_000, cpm(7.00), V),
  make("seasonal_summer_vacation",       "Summer Vacation Planners",            "Adults planning summer vacation (May-August). Travel, rental, outdoor purchases.", "purchase_intent", 32_000_000, cpm(8.00), V),
  make("seasonal_new_year_resolutions",  "New Year Resolution Shoppers",        "Adults with elevated fitness / wellness / organization spend in January.", "purchase_intent", 24_000_000, cpm(7.50), V),
];
