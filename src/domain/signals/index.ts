// src/domain/signals/index.ts
// Barrel — aggregates all vertical signal files into a single
// EXTENDED_VERTICAL_SIGNALS array consumed by the seed pipeline.
//
// 15 verticals × 20 signals = 300 signals, plus Sec-38 cross-vertical
// additions (80 more: seasonality×region, life-event windows, B2B
// intent windows, sports×market, CTV device×content, 1P lookalikes).
// Added on top of the SEEDED_SIGNALS + DERIVED_SIGNALS in signalModel.ts
// (~55 signals) and ALL_ENRICHED_SIGNALS in enrichedSignalModel.ts, the
// live catalog post-reseed is ~435 signals across every major DSP
// marketplace vertical.

import type { CanonicalSignal } from "../../types/signal";
import { AUTOMOTIVE_SIGNALS } from "./automotive";
import { FINANCIAL_SIGNALS } from "./financial";
import { HEALTH_SIGNALS } from "./health";
import { B2B_SIGNALS } from "./b2b";
import { LIFE_EVENTS_SIGNALS } from "./lifeEvents";
import { BEHAVIORAL_SIGNALS } from "./behavioral";
import { INTENT_SIGNALS } from "./intent";
import { TRANSACTIONAL_SIGNALS } from "./transactional";
import { MEDIA_SIGNALS } from "./media";
import { RETAIL_SIGNALS } from "./retail";
import { SEASONAL_SIGNALS } from "./seasonal";
import { PSYCHOGRAPHIC_SIGNALS } from "./psychographic";
import { INTEREST_EXT_SIGNALS } from "./interestExt";
import { DEMOGRAPHIC_EXT_SIGNALS } from "./demographicExt";
import { GEOGRAPHIC_EXT_SIGNALS } from "./geographicExt";
import { CROSS_VERTICAL_SIGNALS } from "./crossVerticals";
import { B2B_FIRMO_TECHNO_SIGNALS } from "./b2bFirmoTechno";
import { RETAIL_MEDIA_SIGNALS } from "./retailMedia";
import { CTV_HISPANIC_DAYPART_SIGNALS } from "./ctvHispanicDaypart";
import { VENUE_WEATHER_CONTEXT_SIGNALS } from "./venueWeatherContext";
import { LOOKALIKE_RECIPE_SIGNALS } from "./lookalikeRecipes";

export const EXTENDED_VERTICAL_SIGNALS: CanonicalSignal[] = [
  ...AUTOMOTIVE_SIGNALS,
  ...FINANCIAL_SIGNALS,
  ...HEALTH_SIGNALS,
  ...B2B_SIGNALS,
  ...LIFE_EVENTS_SIGNALS,
  ...BEHAVIORAL_SIGNALS,
  ...INTENT_SIGNALS,
  ...TRANSACTIONAL_SIGNALS,
  ...MEDIA_SIGNALS,
  ...RETAIL_SIGNALS,
  ...SEASONAL_SIGNALS,
  ...PSYCHOGRAPHIC_SIGNALS,
  ...INTEREST_EXT_SIGNALS,
  ...DEMOGRAPHIC_EXT_SIGNALS,
  ...GEOGRAPHIC_EXT_SIGNALS,
  ...CROSS_VERTICAL_SIGNALS,
  // Sec-41 Tier 2/3 additions
  ...B2B_FIRMO_TECHNO_SIGNALS,
  ...RETAIL_MEDIA_SIGNALS,
  ...CTV_HISPANIC_DAYPART_SIGNALS,
  ...VENUE_WEATHER_CONTEXT_SIGNALS,
  ...LOOKALIKE_RECIPE_SIGNALS,
];
