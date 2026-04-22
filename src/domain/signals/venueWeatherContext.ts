// src/domain/signals/venueWeatherContext.ts
// Sec-41: Venue-fenced + weather-triggered + contextual (28). Covers:
//   - 15 venue-fenced audiences (QSR, stadium, airport, gym, etc.)
//   - 8 weather-triggered audiences
//   - 5 advanced contextual audiences

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V_VENUE = "venue_fenced";
const V_WEATHER = "weather_triggered";
const V_CONTEXT = "contextual_advanced";

export const VENUE_WEATHER_CONTEXT_SIGNALS: CanonicalSignal[] = [
  // ── Venue-fenced (15) ─────────────────────────────────────────────────────
  make("venue_qsr_mcdonalds_visitors_30d", "McDonald's Visitors (30-Day)",
    "Adults with confirmed McDonald's visits in the last 30 days. QSR conquesting target.",
    "purchase_intent", 22_000_000, cpm(8.00), V_VENUE),
  make("venue_qsr_chipotle_visitors_30d", "Chipotle Visitors (30-Day)",
    "Adults with confirmed Chipotle visits in the last 30 days. Fast-casual QSR.",
    "purchase_intent", 9_400_000, cpm(8.50), V_VENUE),
  make("venue_qsr_starbucks_regulars", "Starbucks Regulars",
    "Adults with 4+ Starbucks visits per month. Premium coffee audience.",
    "purchase_intent", 12_800_000, cpm(8.50), V_VENUE),
  make("venue_stadium_nfl_attendees", "NFL Stadium Attendees",
    "Adults who attended an NFL game at a stadium in the last 12 months.",
    "purchase_intent", 3_800_000, cpm(10.00), V_VENUE),
  make("venue_stadium_nba_attendees", "NBA Arena Attendees",
    "Adults who attended an NBA game at an arena in the last 12 months.",
    "purchase_intent", 2_400_000, cpm(10.00), V_VENUE),
  make("venue_airport_international_flyers", "International Airport Departures",
    "Adults with international flight departures in the last 6 months.",
    "purchase_intent", 8_400_000, cpm(11.00), V_VENUE),
  make("venue_airport_business_class_lounge", "Business-Class Lounge Visitors",
    "Adults with Centurion / Polaris / Admiral's Club / KrisFlyer lounge visits.",
    "purchase_intent", 1_200_000, cpm(14.00), V_VENUE),
  make("venue_luxury_mall_visitors", "Luxury Mall Visitors",
    "Adults with visits to Short Hills / Bal Harbour / Aventura / Rodeo / Beverly Center in 90 days.",
    "purchase_intent", 3_600_000, cpm(11.50), V_VENUE),
  make("venue_big_box_home_improvement", "Big-Box Home Improvement Visitors",
    "Adults with recent Home Depot / Lowe's visits. DIY + renovation intent.",
    "purchase_intent", 24_000_000, cpm(7.50), V_VENUE),
  make("venue_gym_fitness_club_members", "Gym / Fitness Club Regulars",
    "Adults with 8+ monthly visits to a fitness club (Planet Fitness / Equinox / LA Fitness / 24 Hour).",
    "purchase_intent", 14_200_000, cpm(8.00), V_VENUE),
  make("venue_cinema_amc_regal_regulars", "Cinema Regulars (AMC / Regal)",
    "Adults with 6+ cinema visits per year.",
    "purchase_intent", 18_400_000, cpm(7.50), V_VENUE),
  make("venue_hospital_frequent_visitors", "Hospital System Frequent Visitors",
    "Adults with 4+ visits to a hospital system in 12 months. Healthcare-adjacent.",
    "interest", 7_200_000, cpm(11.00), V_VENUE),
  make("venue_university_campus_regulars", "University Campus Regulars",
    "Adults with weekly visits to a university campus. Students / staff / adjunct-faculty.",
    "demographic", 6_800_000, cpm(7.50), V_VENUE),
  make("venue_casino_las_vegas_visitors", "Las Vegas Casino Visitors",
    "Adults with Las Vegas strip casino visits in the last 12 months.",
    "purchase_intent", 4_200_000, cpm(9.00), V_VENUE),
  make("venue_ski_resort_winter", "Ski Resort Winter Visitors",
    "Adults with winter ski-resort visits (Vail / Aspen / Park City / Killington / etc).",
    "purchase_intent", 2_800_000, cpm(10.00), V_VENUE),

  // ── Weather-triggered (8) ─────────────────────────────────────────────────
  make("weather_extreme_heat_heat_wave", "Heat Wave Active Regions",
    "Adults in US regions currently experiencing heat-wave conditions (>95F / 35C).",
    "geo", 28_000_000, cpm(6.50), V_WEATHER),
  make("weather_snow_storm_active", "Snow Storm Active Regions",
    "Adults in US regions currently under winter-storm warning.",
    "geo", 18_000_000, cpm(6.50), V_WEATHER),
  make("weather_hurricane_watch_coastal", "Hurricane Watch Coastal",
    "Adults in US coastal regions currently under hurricane watch or warning.",
    "geo", 6_400_000, cpm(7.00), V_WEATHER),
  make("weather_rain_7day_forecast", "7-Day Rainy Forecast Regions",
    "Adults in regions with 5+ days of rain in the forward 7-day forecast.",
    "geo", 32_000_000, cpm(6.00), V_WEATHER),
  make("weather_sunny_beach_season", "Sunny + Beach-Season Regions",
    "Adults in coastal regions with sunny forecasts during beach season (May-Sept).",
    "geo", 18_000_000, cpm(6.00), V_WEATHER),
  make("weather_allergy_high_pollen", "High-Pollen Regions",
    "Adults in regions with elevated pollen counts. Allergy-relief intent.",
    "geo", 42_000_000, cpm(7.00), V_WEATHER),
  make("weather_cold_snap_north", "Cold Snap Northern Regions",
    "Adults in northern US regions during extreme-cold events (<10F / -12C).",
    "geo", 22_000_000, cpm(6.50), V_WEATHER),
  make("weather_drought_regions", "Drought-Classified Regions",
    "Adults in US regions under USDA drought classifications D2-D4.",
    "geo", 14_000_000, cpm(6.00), V_WEATHER),

  // ── Advanced contextual (5) ───────────────────────────────────────────────
  make("context_brand_safe_premium_news", "Brand-Safe Premium News Environments",
    "Contextual audience reading brand-safe premium-news publishers (NYT / WaPo / WSJ / FT / Economist).",
    "interest", 24_000_000, cpm(10.00), V_CONTEXT),
  make("context_ai_generated_content_exclude", "AI-Generated Content Excluded",
    "Contextual audience on human-verified / non-AI-generated content (Oracle Moat + Peer39 verified).",
    "interest", 64_000_000, cpm(9.00), V_CONTEXT),
  make("context_sports_live_broadcast", "Sports Live Broadcast Context",
    "Contextual audience during live sports broadcasts across CTV + linear + streaming.",
    "interest", 38_000_000, cpm(11.00), V_CONTEXT),
  make("context_finance_bloomberg_readers", "Finance Bloomberg + CNBC Readers",
    "Contextual audience on Bloomberg / CNBC / Marketwatch / Reuters finance content.",
    "interest", 16_000_000, cpm(11.50), V_CONTEXT),
  make("context_technology_wsj_cnet_readers", "Tech WSJ / CNET / The Verge Readers",
    "Contextual audience on WSJ Tech / CNET / The Verge / TechCrunch / Ars.",
    "interest", 18_000_000, cpm(10.00), V_CONTEXT),
];
