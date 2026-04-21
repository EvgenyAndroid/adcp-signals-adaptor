// src/domain/signals/geographicExt.ts
// Geographic vertical — 20 EXTRA signals. Core geography (top-10 / top-25
// metro, urban/suburban) is in signalModel.ts; this file adds DMA tiers,
// regional clusters, ZIP-cluster segments, and density-based splits.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "geographic";

export const GEOGRAPHIC_EXT_SIGNALS: CanonicalSignal[] = [
  // ── DMA-level (5) ─────────────────────────────────────────────────────────
  make("geo_dma_nyc_tri_state",       "DMA: NYC Tri-State Area",          "Adults in New York DMA (NY, NJ, CT, PA counties). Largest US DMA by HH count.", "geo", 7_800_000, cpm(6.00), V, { geography: ["US-NYC-DMA"] }),
  make("geo_dma_los_angeles",         "DMA: Los Angeles",                 "Adults in Los Angeles DMA (LA, Orange, Riverside, SB counties). #2 US DMA.", "geo", 5_600_000, cpm(6.00), V, { geography: ["US-LA-DMA"] }),
  make("geo_dma_chicago",             "DMA: Chicago",                     "Adults in Chicago DMA (IL, IN, WI counties). #3 US DMA.", "geo", 3_400_000, cpm(5.50), V, { geography: ["US-CHI-DMA"] }),
  make("geo_dma_dallas_ft_worth",     "DMA: Dallas-Ft. Worth",            "Adults in DFW DMA. Fast-growing metro, strong retail + finance presence.", "geo", 2_800_000, cpm(5.50), V, { geography: ["US-DFW-DMA"] }),
  make("geo_dma_san_francisco",       "DMA: San Francisco Bay Area",      "Adults in SF DMA. Affluent, tech-heavy, premium-ad category target.", "geo", 2_400_000, cpm(7.50), V, { geography: ["US-SFO-DMA"] }),

  // ── Regional clusters (4) ─────────────────────────────────────────────────
  make("geo_region_northeast_urban",  "Region: Northeast Urban Corridor", "Adults in northeast urban belt (Boston-NYC-Philly-DC).", "geo", 18_200_000, cpm(6.00), V, { geography: ["US-NE-URBAN"] }),
  make("geo_region_sun_belt",         "Region: Sun Belt",                 "Adults in Sun Belt states (AZ, FL, GA, NC, NV, TX). Fastest-growing US region.", "geo", 38_000_000, cpm(4.50), V, { geography: ["US-SUNBELT"] }),
  make("geo_region_pacific_northwest","Region: Pacific Northwest",        "Adults in WA, OR, Northern CA. Tech + outdoor + premium-brand overlap.", "geo", 9_400_000, cpm(5.50), V, { geography: ["US-PNW"] }),
  make("geo_region_midwest_rust",     "Region: Midwest Industrial",       "Adults in OH, MI, IN, PA industrial corridor. Manufacturing + value-brand overlap.", "geo", 22_000_000, cpm(4.00), V, { geography: ["US-MIDWEST-IND"] }),

  // ── Density splits (4) ────────────────────────────────────────────────────
  make("geo_density_dense_urban",     "Density: Dense Urban Cores",       "Adults in >10K-population-per-sq-mi ZIPs. Transit-primary, premium-amenity target.", "geo", 16_000_000, cpm(6.50), V, { geography: ["US-DENSE-URBAN"] }),
  make("geo_density_suburban_high",   "Density: High-Density Suburban",   "Adults in dense suburban ZIPs (close-in rings of major metros). Upwardly mobile families.", "geo", 34_000_000, cpm(5.50), V, { geography: ["US-SUBURB-HIGH"] }),
  make("geo_density_exurban",         "Density: Exurban",                 "Adults in outer-ring suburbs. Car-primary, larger homes, family-focused.", "geo", 22_000_000, cpm(4.50), V, { geography: ["US-EXURBAN"] }),
  make("geo_density_rural",           "Density: Rural",                   "Adults in rural ZIPs. Practical-brand + value-driven + agricultural adjacent.", "geo", 26_000_000, cpm(3.50), V, { geography: ["US-RURAL"] }),

  // ── Climate / lifestyle geography (3) ─────────────────────────────────────
  make("geo_climate_snow_belt",       "Climate: Snow Belt",               "Adults in states with significant winter snow (Northeast, upper Midwest, Rockies).", "geo", 48_000_000, cpm(4.50), V, { geography: ["US-SNOWBELT"] }),
  make("geo_climate_coastal",         "Climate: Coastal",                 "Adults within 50 miles of US coastline. Premium real estate + beach-lifestyle target.", "geo", 62_000_000, cpm(5.00), V, { geography: ["US-COASTAL"] }),
  make("geo_climate_mountain_west",   "Climate: Mountain West",           "Adults in mountain states (CO, UT, WY, MT, ID). Outdoor + adventure-travel target.", "geo", 8_400_000, cpm(5.00), V, { geography: ["US-MOUNTAIN-WEST"] }),

  // ── Market-specific (4) ───────────────────────────────────────────────────
  make("geo_market_college_town",     "Market Type: College Town",        "Adults in ZIPs with 1+ large 4-year university. Student + knowledge-worker mix.", "geo", 14_200_000, cpm(5.50), V, { geography: ["US-COLLEGE-TOWN"] }),
  make("geo_market_retiree_destination","Market Type: Retiree Destinations","Adults in AZ, FL, SC retiree-destination metros. Skews 55+.", "geo", 9_600_000, cpm(5.50), V, { geography: ["US-RETIREE-DEST"] }),
  make("geo_market_military",         "Market Type: Military-Adjacent",   "Adults in ZIPs adjacent to active military installations. Base + veteran services target.", "geo", 7_400_000, cpm(5.00), V, { geography: ["US-MILITARY"] }),
  make("geo_market_tourist",          "Market Type: Tourist-Heavy",       "Adults in high-tourism metros (Orlando, Vegas, NYC, SF). Hospitality + retail target.", "geo", 6_800_000, cpm(5.50), V, { geography: ["US-TOURIST"] }),
];
