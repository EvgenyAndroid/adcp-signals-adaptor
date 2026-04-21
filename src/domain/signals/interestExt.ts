// src/domain/signals/interestExt.ts
// Interest / Affinity vertical — 20 EXTRA signals beyond the 6 already
// defined inline in signalModel.ts. Focused on interest areas the
// existing catalog doesn't cover: sports, gaming, cooking, hobbies,
// music, outdoor.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "interest";

export const INTEREST_EXT_SIGNALS: CanonicalSignal[] = [
  // ── Sports (5) ────────────────────────────────────────────────────────────
  make("int_sports_nfl_fans",           "NFL Fans",                      "Adults with strong NFL engagement: viewing, fantasy, merchandise, ticket purchase.", "interest", 42_000_000, cpm(7.00), V),
  make("int_sports_nba_fans",           "NBA Fans",                      "Adults with strong NBA engagement. Urban skew, younger-leaning than NFL.", "interest", 26_000_000, cpm(7.00), V),
  make("int_sports_mlb_fans",           "MLB Fans",                      "Adults with strong MLB engagement. Regional skews, broad age distribution.", "interest", 22_000_000, cpm(6.50), V),
  make("int_sports_soccer_fans",        "Soccer / Football Fans",        "Adults following domestic + international soccer (MLS, Premier League, La Liga).", "interest", 18_400_000, cpm(6.50), V),
  make("int_sports_fantasy_players",    "Fantasy Sports Players",        "Adults participating in fantasy football, basketball, baseball leagues.", "interest", 14_800_000, cpm(7.00), V),

  // ── Gaming (3) ────────────────────────────────────────────────────────────
  make("int_gaming_console",            "Console Gamers",                "Adults playing console games 5+ hours/week. PlayStation, Xbox, Switch.", "interest", 22_000_000, cpm(6.00), V),
  make("int_gaming_pc",                 "PC Gamers",                     "Adults playing PC games 5+ hours/week. Steam, Battle.net, Epic. Hardware-upgrade cycle.", "interest", 11_400_000, cpm(6.50), V),
  make("int_gaming_esports_viewers",    "Esports Viewers",               "Adults watching competitive gaming events (Twitch, YouTube Gaming). Skews 18-34.", "interest", 9_200_000, cpm(7.00), V),

  // ── Cooking / food (3) ────────────────────────────────────────────────────
  make("int_food_home_cooks",           "Home Cooking Enthusiasts",      "Adults with high cooking-content engagement (recipes, cooking shows, culinary tools).", "interest", 28_000_000, cpm(5.50), V),
  make("int_food_foodies",              "Foodies / Culinary Explorers",  "Adults with strong interest in dining-out, new restaurants, food travel, cuisine.", "interest", 14_200_000, cpm(7.00), V),
  make("int_food_wine_enthusiasts",     "Wine Enthusiasts",              "Adults with strong wine engagement (tastings, collection, wine tourism).", "interest", 7_400_000, cpm(8.00), V),

  // ── Outdoor / active (3) ──────────────────────────────────────────────────
  make("int_outdoor_camping_hiking",    "Camping & Hiking Enthusiasts",  "Adults camping or hiking 5+ times/year. REI + outdoor-apparel target.", "interest", 12_800_000, cpm(6.50), V),
  make("int_outdoor_cycling",           "Cycling Enthusiasts",           "Adults cycling weekly+ for fitness or recreation. Premium gear + apparel.", "interest", 6_800_000, cpm(7.00), V),
  make("int_outdoor_fishing",           "Fishing Enthusiasts",           "Adults fishing 10+ days/year. Skews male, rural + lake/coastal geographies.", "interest", 9_400_000, cpm(6.00), V),

  // ── Music & culture (3) ───────────────────────────────────────────────────
  make("int_music_pop_top40",           "Pop / Top 40 Music Fans",       "Adults with heavy Top-40 streaming. Spotify + Apple Music heavy, broad demo reach.", "interest", 36_000_000, cpm(5.00), V),
  make("int_music_country",             "Country Music Fans",            "Adults with strong country-music affinity. Radio + streaming + festival attendance.", "interest", 22_000_000, cpm(5.50), V),
  make("int_music_hip_hop",             "Hip-Hop Music Fans",            "Adults with strong hip-hop engagement. Skews 18-44, urban, streaming-primary.", "interest", 28_000_000, cpm(5.50), V),

  // ── Hobbies / lifestyle (3) ───────────────────────────────────────────────
  make("int_hobby_gardening",           "Gardening Enthusiasts",         "Adults actively gardening. Home-improvement + lawn-care + suburban overlap.", "interest", 16_400_000, cpm(5.50), V),
  make("int_hobby_photography",         "Photography Enthusiasts",       "Adults with interest in photography — hobbyist gear, travel photography, content creation.", "interest", 7_800_000, cpm(7.00), V),
  make("int_hobby_diy_home",            "DIY Home Project Enthusiasts",  "Adults regularly undertaking home DIY projects. Home Depot + Lowe's target.", "interest", 11_200_000, cpm(6.00), V),
];
