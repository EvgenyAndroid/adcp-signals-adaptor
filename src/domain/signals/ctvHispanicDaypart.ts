// src/domain/signals/ctvHispanicDaypart.ts
// Sec-41: CTV × Hispanic × Daypart crossovers (12). Hispanic CTV is the
// fastest-growing premium AVOD demographic. Daypart crossovers answer
// "who's watching when" for programmatic CTV planners.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V = "ctv_hispanic_daypart";

export const CTV_HISPANIC_DAYPART_SIGNALS: CanonicalSignal[] = [
  make("ctv_hispanic_primetime_sports", "Hispanic CTV × Primetime × Sports",
    "Spanish-language CTV households watching primetime live sports (8-11pm ET).",
    "interest", 3_800_000, cpm(11.00), V),
  make("ctv_hispanic_telenovela_viewers", "Hispanic CTV × Telenovela Viewers",
    "Spanish-language CTV households with high telenovela content affinity.",
    "interest", 4_200_000, cpm(10.00), V),
  make("ctv_hispanic_youth_esports", "Hispanic Youth × Esports / Gaming CTV",
    "Hispanic 18-34 CTV households with gaming / esports content affinity.",
    "interest", 1_800_000, cpm(10.50), V),
  make("ctv_primetime_drama_en", "CTV × Primetime × English Prestige Drama",
    "English-language households watching primetime prestige drama (HBO / AMC / FX).",
    "interest", 14_200_000, cpm(10.50), V),
  make("ctv_early_fringe_news", "CTV × Early Fringe × News",
    "Early fringe (5-7pm) news audience via CTV.",
    "interest", 9_800_000, cpm(8.50), V),
  make("ctv_late_fringe_sports", "CTV × Late Fringe × Sports",
    "Late fringe (11pm-1am) sports audience via CTV.",
    "interest", 5_400_000, cpm(9.00), V),
  make("ctv_daytime_talk_shows", "CTV × Daytime × Talk Shows",
    "Daytime (11am-4pm) talk-show audience via CTV. Homemaker + semi-retired skew.",
    "interest", 7_200_000, cpm(7.50), V),
  make("ctv_weekend_movies_premium", "CTV × Weekend × Premium Movies",
    "Weekend premium-movie watchers via CTV / AVOD + premium SVOD stack.",
    "interest", 11_400_000, cpm(9.50), V),
  make("ctv_overnight_news_intl", "CTV × Overnight × International News",
    "Overnight (1-6am) international news audience. BBC / Al Jazeera / Euronews / NHK viewers.",
    "interest", 2_400_000, cpm(9.00), V),
  make("ctv_streaming_kids_weekday", "CTV × Weekday × Kids Programming",
    "Weekday kids-programming audience via CTV. Parents of 4-14 yo.",
    "interest", 8_600_000, cpm(8.00), V),
  make("ctv_streaming_docs_weekend", "CTV × Weekend × Documentaries",
    "Weekend documentary audience — Netflix / Apple / Disney prestige-nonfiction.",
    "interest", 6_800_000, cpm(10.00), V),
  make("ctv_streaming_foreign_language", "CTV × Foreign-Language Content",
    "Non-English-language streaming audience beyond Spanish. K-drama / anime / international film.",
    "interest", 4_800_000, cpm(9.50), V),
];
