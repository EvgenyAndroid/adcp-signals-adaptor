// src/domain/signals/crossVerticals.ts
// Sec-38 Tier-1 readiness: +80 cross-vertical signals that capture the
// high-value combinations HoldCo planners ask for but single-axis
// verticals don't express. Every entry is a first-class CanonicalSignal
// — same mapper, same DTS label, same cross-taxonomy surface.
//
// Buckets (count in parens):
//   seasonality × region      (20)  — holiday/event × DMA crossovers
//   life-event temporal window (15) — 0-30 / 31-90 / 91-180 day framing
//   B2B intent-in-window      (10) — fiscal-quarter-boxed buying intent
//   sports × market           (12) — team fandom × geo × activation window
//   CTV device × content      (12) — device class × content affinity
//   1P-lookalike templates    (10) — modeled seed-audience templates
//
// All pricing calibrated against existing _helpers.ts CPM ladder.

import type { CanonicalSignal } from "../../types/signal";
import { make, cpm } from "./_helpers";

const V_SR = "seasonal_x_region";
const V_LW = "life_event_window";
const V_BI = "b2b_intent_window";
const V_SM = "sports_x_market";
const V_CTV = "ctv_device_x_content";
const V_LAL = "lookalike_template";

export const CROSS_VERTICAL_SIGNALS: CanonicalSignal[] = [
  // ── Seasonality × Region (20) ────────────────────────────────────────────
  // Holiday / seasonal buyers crossed with top DMAs and regions. Enables
  // "Q4 gifting in NY metro" or "Back-to-School in Top 10 DMAs" plans.
  make("sr_q4_gifting_nyc",              "Q4 Gifting × NY Metro",              "Q4 holiday gift buyers in NY-NJ-CT DMA. Urban affluent gifting.", "purchase_intent", 7_800_000, cpm(9.00), V_SR),
  make("sr_q4_gifting_la",               "Q4 Gifting × LA Metro",              "Q4 holiday gift buyers in LA metro DMA. Affluent gifting, experiential skew.", "purchase_intent", 6_200_000, cpm(9.00), V_SR),
  make("sr_q4_gifting_chicago",          "Q4 Gifting × Chicago Metro",         "Q4 holiday gift buyers in Chicago DMA.", "purchase_intent", 3_400_000, cpm(8.50), V_SR),
  make("sr_q4_gifting_top10_dma",        "Q4 Gifting × Top-10 DMA",            "Q4 gift buyers in Top-10 DMAs (NY, LA, Chi, Phi, Dal, Bay, DC, Houston, Boston, Atlanta).", "purchase_intent", 28_000_000, cpm(8.50), V_SR),
  make("sr_bfcm_south",                  "Black Friday / CM × South Region",   "BF/CM shoppers in Southern US region. Deal-seeker density.", "purchase_intent", 15_800_000, cpm(7.50), V_SR),
  make("sr_bfcm_midwest",                "Black Friday / CM × Midwest",        "BF/CM shoppers in Midwest region.", "purchase_intent", 10_200_000, cpm(7.00), V_SR),
  make("sr_valentines_top25_dma",        "Valentine's × Top-25 DMA",           "Valentine's shoppers concentrated in Top-25 DMAs. Jewelry / restaurant / flowers.", "purchase_intent", 21_000_000, cpm(8.00), V_SR),
  make("sr_mothers_day_south",           "Mother's Day × South",               "Mother's Day buyers in Southern US region.", "purchase_intent", 18_400_000, cpm(7.50), V_SR),
  make("sr_back_to_school_tx_fl",        "BTS × Texas + Florida",              "Back-to-School K-12 parents in Texas + Florida (largest state populations).", "purchase_intent", 3_800_000, cpm(8.50), V_SR),
  make("sr_back_to_school_northeast",    "BTS × Northeast",                    "Back-to-School K-12 parents in Northeast region.", "purchase_intent", 4_200_000, cpm(8.00), V_SR),
  make("sr_summer_vacation_coastal",     "Summer Vacation × Coastal States",   "Summer vacation planners in CA, FL, NY, NJ, WA, MA coastal markets.", "purchase_intent", 11_600_000, cpm(8.00), V_SR),
  make("sr_summer_vacation_mountain",    "Summer Vacation × Mountain Region",  "Summer vacation planners in Mountain region (CO, UT, ID, MT, WY, NM, AZ).", "purchase_intent", 3_400_000, cpm(8.50), V_SR),
  make("sr_tax_season_top10_dma",        "Tax Season × Top-10 DMA",            "Tax-season active filers in Top-10 DMAs.", "purchase_intent", 14_200_000, cpm(7.00), V_SR),
  make("sr_new_year_fitness_coastal",    "New Year Fitness × Coastal Metros",  "New Year resolution fitness shoppers in coastal metros. Premium gym / D2C fitness target.", "purchase_intent", 7_600_000, cpm(8.00), V_SR),
  make("sr_july4_sunbelt",               "July 4 × Sun Belt",                  "July 4 weekend shoppers in Sun Belt states. Outdoor / grill / travel.", "purchase_intent", 12_800_000, cpm(7.00), V_SR),
  make("sr_halloween_top25_dma",         "Halloween × Top-25 DMA",             "Halloween costume + candy buyers in Top-25 DMAs.", "purchase_intent", 9_400_000, cpm(7.50), V_SR),
  make("sr_graduation_college_towns",    "Graduation × College Towns",         "Graduation gift buyers in top 40 college-town ZIPs.", "purchase_intent", 2_200_000, cpm(9.00), V_SR),
  make("sr_wedding_season_south",        "Wedding Season × South",             "Wedding gift buyers in Southern US region (spring/summer peak).", "purchase_intent", 3_800_000, cpm(8.00), V_SR),
  make("sr_spring_break_florida",        "Spring Break × Florida",             "Spring break travel planners with Florida destination intent.", "purchase_intent", 3_200_000, cpm(8.50), V_SR),
  make("sr_q4_gifting_luxury_hhi",       "Q4 Gifting × Luxury HHI $250k+",     "Q4 holiday gift buyers with household income $250k+. Luxury gifting.", "purchase_intent", 3_400_000, cpm(11.00), V_SR),

  // ── Life Event Temporal Windows (15) ─────────────────────────────────────
  // Sharp-window framings beyond the base life_events set. Splits on
  // 0-30 / 31-90 / 91-180 days post-event for precision targeting.
  make("lw_new_mover_0_30_premium",      "New Mover 0-30d × HHI $100k+",       "Premium new movers in first 30 days. Furniture, insurance, financial-planning peak.", "demographic", 180_000, cpm(16.00), V_LW),
  make("lw_new_homeowner_0_90d",         "New Homeowner 0-90d",                "Homeowners within 90 days of close. Big-ticket renovation + appliance surge.", "demographic", 420_000, cpm(14.50), V_LW),
  make("lw_new_homeowner_91_180d",       "New Homeowner 91-180d",              "Homeowners 3-6 months post-close. Furniture completion + services adoption.", "demographic", 380_000, cpm(11.50), V_LW),
  make("lw_expecting_2nd_trimester",     "Expecting Parent × 2nd Trimester",   "Expectant families in weeks 14-28. Peak registry + gear research window.", "demographic", 280_000, cpm(14.50), V_LW),
  make("lw_expecting_3rd_trimester",     "Expecting Parent × 3rd Trimester",   "Expectant families in weeks 29-40. Final-purchase + hospital-bag window.", "demographic", 260_000, cpm(15.00), V_LW),
  make("lw_new_parent_0_90d",            "New Parent 0-90 Days",               "Households with infant 0-3 months. Sleep products + diaper subscription peak.", "demographic", 420_000, cpm(14.00), V_LW),
  make("lw_new_parent_91_180d",          "New Parent 91-180 Days",             "Households with infant 3-6 months. Solids introduction + gear upgrade.", "demographic", 400_000, cpm(12.50), V_LW),
  make("lw_engaged_6_12mo_out",          "Engaged × Wedding 6-12mo Out",       "Engaged couples 6-12 months pre-wedding. Venue + attire purchase window.", "demographic", 480_000, cpm(12.50), V_LW),
  make("lw_engaged_3_6mo_out",           "Engaged × Wedding 3-6mo Out",        "Engaged couples 3-6 months pre-wedding. Registry + detail-vendor window.", "demographic", 420_000, cpm(13.00), V_LW),
  make("lw_newlyweds_0_90d",             "Newlyweds 0-90 Days",                "Just-married couples in first 90 days. Insurance + tax change + honeymoon recovery.", "demographic", 280_000, cpm(12.50), V_LW),
  make("lw_recent_divorce_0_6mo",        "Recently Divorced 0-6 Months",       "Divorced adults in first 6 months. High financial-services + housing intent.", "demographic", 340_000, cpm(11.00), V_LW),
  make("lw_empty_nester_0_12mo",         "Empty Nester 0-12 Months",           "Households with youngest child gone in last year. Downsize + travel + lifestyle shift.", "demographic", 680_000, cpm(9.50), V_LW),
  make("lw_retiring_0_12mo",             "Recently Retired 0-12 Months",       "Adults retired in last 12 months. Healthcare + travel + advisory services peak.", "demographic", 780_000, cpm(10.50), V_LW),
  make("lw_graduating_college_60d",      "Graduating College × 60-Day Window", "Seniors within 60 days of graduation. First-job financial + mover + apparel peak.", "demographic", 210_000, cpm(10.00), V_LW),
  make("lw_job_change_0_90d",            "Recent Job Change 0-90 Days",        "Adults starting a new job in last 90 days. 401k rollover + apparel + commute purchases.", "demographic", 1_200_000, cpm(9.50), V_LW),

  // ── B2B Intent-in-Window (10) ────────────────────────────────────────────
  // Fiscal-quarter-boxed purchase intent for B2B categories. Critical for
  // ABM campaigns timed to budget cycles.
  make("bi_saas_procurement_q1",         "SaaS Procurement Intent × Q1",       "B2B buyers with active SaaS procurement signals in Q1 fiscal window.", "purchase_intent", 480_000, cpm(13.00), V_BI),
  make("bi_saas_procurement_q4",         "SaaS Procurement Intent × Q4",       "B2B buyers with active SaaS procurement in Q4 use-it-or-lose-it budget window.", "purchase_intent", 720_000, cpm(14.00), V_BI),
  make("bi_cybersec_eval_30d",           "Cybersecurity Evaluation × 30-Day",  "IT/Security buyers with active cybersecurity vendor evaluation in last 30 days.", "purchase_intent", 180_000, cpm(14.50), V_BI),
  make("bi_cloud_migration_in_window",   "Cloud Migration × Active-RFP",       "B2B buyers with cloud-migration RFP activity in last 60 days.", "purchase_intent", 220_000, cpm(13.50), V_BI),
  make("bi_hr_tech_renewal_60d",         "HR Tech × Renewal 60-Day",           "HR buyers within 60 days of contract renewal (payroll / HRIS / benefits).", "purchase_intent", 160_000, cpm(13.00), V_BI),
  make("bi_martech_eval_90d",            "MarTech Evaluation × 90-Day",        "Marketing ops / CMO buyers with active martech RFP in last 90 days.", "purchase_intent", 140_000, cpm(13.50), V_BI),
  make("bi_it_refresh_fy_end",           "IT Hardware Refresh × Fiscal-Year-End", "IT buyers with hardware refresh signals in fiscal-year-end window.", "purchase_intent", 280_000, cpm(12.00), V_BI),
  make("bi_data_platform_eval",          "Data Platform Evaluation",           "Data / analytics buyers actively evaluating data-platform vendors (Snowflake/Databricks/BigQuery category).", "purchase_intent", 210_000, cpm(13.50), V_BI),
  make("bi_dev_tools_in_window",         "Developer Tools × Active Eval",      "Engineering leaders with dev-tool purchase intent in last 60 days.", "purchase_intent", 140_000, cpm(12.50), V_BI),
  make("bi_compliance_post_audit",       "Compliance Software × Post-Audit",   "Compliance / finance buyers within 90 days of audit finding. SOC2/PCI/HIPAA triggers.", "purchase_intent", 110_000, cpm(13.00), V_BI),

  // ── Sports × Market (12) ─────────────────────────────────────────────────
  // Team fandom crossed with DMA + activation window (regular season,
  // playoffs, draft). Sportsbook + CPG + beverage premium category.
  make("sm_nfl_patriots_boston",         "NFL Patriots Fans × Boston DMA",     "Active NFL Patriots fans in Boston DMA. In-season activation.", "interest", 980_000, cpm(9.50), V_SM),
  make("sm_nfl_cowboys_dallas",          "NFL Cowboys Fans × Dallas DMA",      "Active NFL Cowboys fans in Dallas-Ft Worth DMA.", "interest", 1_800_000, cpm(9.50), V_SM),
  make("sm_nba_warriors_bayarea",        "NBA Warriors Fans × Bay Area",       "Active NBA Warriors fans in SF Bay Area DMA.", "interest", 720_000, cpm(9.00), V_SM),
  make("sm_nba_lakers_la",               "NBA Lakers Fans × LA Metro",         "Active NBA Lakers fans in LA metro DMA.", "interest", 1_400_000, cpm(9.50), V_SM),
  make("sm_mlb_yankees_nyc",             "MLB Yankees Fans × NY Metro",        "Active MLB Yankees fans in NY DMA. Summer activation window.", "interest", 1_200_000, cpm(8.50), V_SM),
  make("sm_mlb_dodgers_la",              "MLB Dodgers Fans × LA Metro",        "Active MLB Dodgers fans in LA metro DMA.", "interest", 1_100_000, cpm(8.50), V_SM),
  make("sm_nhl_rangers_nyc",             "NHL Rangers Fans × NY Metro",        "Active NHL Rangers fans in NY metro DMA. Winter activation.", "interest", 420_000, cpm(8.00), V_SM),
  make("sm_college_football_sec",        "College Football × SEC Footprint",   "College football fans in SEC-conference states (AL, GA, FL, TN, SC, LA, AR, MS, MO, TX, KY, OK).", "interest", 8_400_000, cpm(8.00), V_SM),
  make("sm_college_football_big10",      "College Football × Big Ten",         "College football fans in Big Ten footprint states.", "interest", 6_200_000, cpm(8.00), V_SM),
  make("sm_sportsbook_legal_states",     "Sports Bettors × Legal States",      "Adults with sports-betting activity in states where online sportsbook is legal.", "purchase_intent", 18_200_000, cpm(10.00), V_SM),
  make("sm_sportsbook_playoff_window",   "Sports Bettors × Playoff Window",    "Active bettors with elevated wagering in playoff / March Madness / Super Bowl windows.", "purchase_intent", 8_400_000, cpm(11.00), V_SM),
  make("sm_fantasy_sports_active",       "Fantasy Sports × Active Managers",   "Adults actively managing fantasy football / basketball / baseball teams.", "interest", 12_400_000, cpm(8.50), V_SM),

  // ── CTV Device × Content (12) ────────────────────────────────────────────
  // Device class × content affinity for CTV / OTT premium inventory.
  make("ctv_roku_sports",                "Roku Households × Sports Affinity",  "Roku-device households with elevated live-sports content viewing.", "interest", 14_200_000, cpm(10.00), V_CTV),
  make("ctv_samsung_drama",              "Samsung TV × Drama Affinity",        "Samsung Tizen households with high prestige-drama viewing (HBO/AMC/FX).", "interest", 11_400_000, cpm(9.50), V_CTV),
  make("ctv_firetv_action",              "Fire TV × Action/Thriller",          "Amazon Fire TV households with elevated action/thriller content affinity.", "interest", 16_400_000, cpm(9.00), V_CTV),
  make("ctv_appletv_docs",               "Apple TV × Documentary Affinity",    "Apple TV households with elevated documentary / prestige-non-fiction viewing.", "interest", 7_200_000, cpm(10.50), V_CTV),
  make("ctv_roku_news",                  "Roku × News/Politics Affinity",      "Roku households with news / politics content affinity (excluded from political-advocacy use).", "interest", 9_600_000, cpm(8.50), V_CTV),
  make("ctv_lg_kids",                    "LG TV × Kids/Family",                "LG webOS households with elevated kids / family content viewing.", "interest", 5_800_000, cpm(9.00), V_CTV),
  make("ctv_vizio_reality",              "Vizio × Reality TV Affinity",        "Vizio households with reality TV / unscripted content affinity.", "interest", 10_200_000, cpm(8.50), V_CTV),
  make("ctv_chromecast_gaming",          "Chromecast × Gaming Content",        "Chromecast-with-GoogleTV households with gaming content / streaming affinity.", "interest", 4_400_000, cpm(9.50), V_CTV),
  make("ctv_roku_hispanic",              "Roku × Spanish-language Content",    "Roku households with elevated Spanish-language content viewing.", "interest", 6_200_000, cpm(9.00), V_CTV),
  make("ctv_ott_cordcutter_premium",     "Cord-Cutter × Premium SVOD Stack",   "Cord-cutter households subscribing to 3+ premium SVOD services.", "interest", 18_400_000, cpm(10.00), V_CTV),
  make("ctv_ctv_light_viewer",           "CTV Light Viewer (0-5h/wk)",         "Light CTV viewers (0-5 hours/week). Reach-efficient for incremental lift.", "interest", 32_000_000, cpm(7.50), V_CTV),
  make("ctv_ctv_heavy_viewer",           "CTV Heavy Viewer (20+h/wk)",         "Heavy CTV viewers (20+ hours/week). Frequency-capped premium inventory.", "interest", 18_400_000, cpm(10.50), V_CTV),

  // ── 1P Lookalike Templates (10) ──────────────────────────────────────────
  // Modeled seed-audience lookalike templates. Shipped as `custom` so
  // they're visibly distinct from seeded marketplace signals. These are
  // the "drop in your 1P CSV" activation story.
  make("lal_high_ltv_customers",         "1P Lookalike: High-LTV Customers",   "Modeled lookalike template matching top-quartile LTV customer seed. Upload 1P seed to refine.", "composite", 8_400_000, cpm(10.00), V_LAL, { generationMode: "derived" }),
  make("lal_churn_risk_winback",         "1P Lookalike: Churn Risk / Winback", "Modeled winback template — lookalike of recently churned customers with re-engagement potential.", "composite", 4_200_000, cpm(9.50), V_LAL, { generationMode: "derived" }),
  make("lal_saas_power_users",           "1P Lookalike: SaaS Power Users",     "Modeled lookalike of top-decile product-usage seed (B2B SaaS template).", "composite", 210_000, cpm(13.00), V_LAL, { generationMode: "derived" }),
  make("lal_ecomm_repeat_buyers",        "1P Lookalike: E-Comm Repeat Buyers", "Modeled lookalike of 3+ order e-commerce customers.", "composite", 14_200_000, cpm(9.00), V_LAL, { generationMode: "derived" }),
  make("lal_subscription_loyalists",     "1P Lookalike: Subscription Loyalists","Modeled lookalike of 12+ month subscription retainers (SVOD / D2C / news).", "composite", 11_400_000, cpm(9.50), V_LAL, { generationMode: "derived" }),
  make("lal_mobile_app_engaged",         "1P Lookalike: Mobile App Engaged",   "Modeled lookalike of top-quartile mobile-app engagement seed.", "composite", 18_400_000, cpm(8.50), V_LAL, { generationMode: "derived" }),
  make("lal_event_attendees",            "1P Lookalike: Event Attendees",      "Modeled lookalike of brand-event attendee seed (conference / activation / pop-up).", "composite", 3_200_000, cpm(10.00), V_LAL, { generationMode: "derived" }),
  make("lal_premium_tier_upgraders",     "1P Lookalike: Premium Tier Upgraders","Modeled lookalike of users who upgraded to premium/paid tier.", "composite", 6_800_000, cpm(10.00), V_LAL, { generationMode: "derived" }),
  make("lal_cart_abandoners_high_aov",   "1P Lookalike: High-AOV Cart Abandoners","Modeled lookalike of cart abandoners with above-median AOV. Retargeting expansion.", "composite", 4_400_000, cpm(9.50), V_LAL, { generationMode: "derived" }),
  make("lal_b2b_qualified_leads",        "1P Lookalike: Qualified B2B Leads",  "Modeled lookalike of MQL-converted B2B contacts. Firmographic + intent template.", "composite", 380_000, cpm(12.50), V_LAL, { generationMode: "derived" }),
];
