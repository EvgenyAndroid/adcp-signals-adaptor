// src/domain/dspMock.ts
//
// MVP for the Campaign Canvas (buy-side / DSP control-loop view).
//
// AdCP 3.0 GA covers sell-side discovery + plan-level buy:
//   get_signals · get_products · create_media_buy · activate_signal
//
// The buy-side real-time control loop is UNSPECIFIED across the 11
// directory agents:
//   - submit_bid_strategy       — declare how to bid
//   - get_bid_opportunities     — receive bid requests (streaming)
//   - get_pacing_status         — burn rate vs target
//   - optimize_strategy         — feedback from delivery → strategy
//
// This module mocks all four. Same playbook as governanceMock.ts +
// brandRightsMock.ts: deterministic synthetic data so the Canvas can
// render meaningful visuals; swap to live when upstream catches up.
//
// Determinism: all generators are seeded from (campaign_id × "salt").
// Same inputs → same outputs across requests. No real RTB latency.

// ── Campaign templates ──────────────────────────────────────────────────────
//
// 3 demo campaigns covering different KPI postures so the Canvas
// can show meaningful diversity in the control loop.

export type CampaignKpi = "CPM" | "CPA" | "ROAS" | "BRAND_LIFT";

export interface Campaign {
  campaign_id: string;
  name: string;
  brand_name: string;
  brand_domain: string;
  kpi: CampaignKpi;
  kpi_target: number;
  kpi_unit: string;        // e.g. "$" or "%"
  budget_total_usd: number;
  budget_daily_cap_usd: number;
  freq_cap_per_user: number;
  flight_start: string;    // ISO date
  flight_end: string;
  start_day_offset: number; // For demo: how many days into the flight
  geo: string[];
  audience_brief: string;
}

const CAMPAIGNS: Record<string, Campaign> = {
  cmp_cocacola_summer: {
    campaign_id: "cmp_cocacola_summer",
    name: "Coca-Cola Summer Refresh",
    brand_name: "Coca-Cola",
    brand_domain: "coca-cola.com",
    kpi: "ROAS",
    kpi_target: 3.5,
    kpi_unit: "x",
    budget_total_usd: 250_000,
    budget_daily_cap_usd: 10_000,
    freq_cap_per_user: 5,
    flight_start: "2026-04-15",
    flight_end: "2026-05-30",
    start_day_offset: 14,
    geo: ["US"],
    audience_brief: "food and drink + beverages buyers in Coca-Cola core markets",
  },
  cmp_nike_drop: {
    campaign_id: "cmp_nike_drop",
    name: "Nike Air Max Drop",
    brand_name: "Nike",
    brand_domain: "nike.com",
    kpi: "CPM",
    kpi_target: 8.50,
    kpi_unit: "$",
    budget_total_usd: 120_000,
    budget_daily_cap_usd: 25_000,
    freq_cap_per_user: 3,
    flight_start: "2026-04-25",
    flight_end: "2026-05-02",
    start_day_offset: 4,
    geo: ["US-NYC", "US-LA", "US-SF", "US-CHI", "US-MIA"],
    audience_brief: "sneakerheads + active lifestyle in urban DMAs",
  },
  cmp_pfizer_lift: {
    campaign_id: "cmp_pfizer_lift",
    name: "Pfizer Brand Lift Study",
    brand_name: "Pfizer",
    brand_domain: "pfizer.com",
    kpi: "BRAND_LIFT",
    kpi_target: 12.0,
    kpi_unit: "%",
    budget_total_usd: 80_000,
    budget_daily_cap_usd: 4_000,
    freq_cap_per_user: 2,
    flight_start: "2026-04-01",
    flight_end: "2026-05-15",
    start_day_offset: 28,
    geo: ["US"],
    audience_brief: "healthcare-engaged adults; contextual-only, brand-safe inventory",
  },
};

export function listCampaigns(): Campaign[] {
  return Object.values(CAMPAIGNS);
}

export function getCampaign(id: string): Campaign | null {
  return CAMPAIGNS[id] ?? null;
}

// ── Deterministic seed helpers ──────────────────────────────────────────────

function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function rng(campaign_id: string, salt: string): () => number {
  return lcg(fnv1a(campaign_id + "|" + salt));
}

// ── Bid strategy ────────────────────────────────────────────────────────────

export interface BidStrategy {
  campaign_id: string;
  algorithm: "first_price" | "second_price" | "fixed_cpm";
  base_bid_usd: number;
  bid_modifiers: Array<{ name: string; multiplier: number; reason: string }>;
  floor_strategy: "respect_publisher" | "negotiate_down" | "ignore";
  pacing_strategy: "even" | "asap" | "weighted";
  brand_safety_floor: number;  // 0-100; min DV/IAS score to accept
  viewability_floor: number;   // 0-1; min predicted viewability to bid
  dayparting: Array<{ hour: number; multiplier: number }>;
}

export function generateBidStrategy(c: Campaign): BidStrategy {
  const r = rng(c.campaign_id, "strategy");
  const algo = c.kpi === "BRAND_LIFT" ? "fixed_cpm" : (r() < 0.6 ? "second_price" : "first_price");
  const baseBid = c.kpi === "CPM" ? c.kpi_target * (0.85 + r() * 0.20) : 5.50 + r() * 4.00;
  const modifiers = [
    { name: "audience_match", multiplier: 1.25, reason: "+25% when audience signal matches" },
    { name: "contextual_brand_safe", multiplier: 1.10, reason: "+10% on brand-safe pages" },
    { name: "dayparting_peak", multiplier: 1.15, reason: "+15% during 18:00-22:00 local" },
    { name: "frequency_decay", multiplier: 0.70, reason: "-30% after 3 impressions/user" },
  ];
  if (c.kpi === "BRAND_LIFT") {
    modifiers.push({ name: "viewability_premium", multiplier: 1.30, reason: "+30% on >75% viewable" });
  }
  const dayparting = Array.from({ length: 24 }, (_, h) => {
    let m = 1.0;
    if (h >= 18 && h <= 22) m = 1.15;
    else if (h >= 0 && h <= 5) m = 0.6;
    else if (h >= 12 && h <= 14) m = 1.05;
    return { hour: h, multiplier: Math.round(m * 100) / 100 };
  });
  return {
    campaign_id: c.campaign_id,
    algorithm: algo,
    base_bid_usd: Math.round(baseBid * 100) / 100,
    bid_modifiers: modifiers,
    floor_strategy: c.kpi === "BRAND_LIFT" ? "respect_publisher" : "negotiate_down",
    pacing_strategy: c.kpi === "CPM" ? "asap" : "even",
    brand_safety_floor: c.kpi === "BRAND_LIFT" ? 85 : 70,
    viewability_floor: c.kpi === "BRAND_LIFT" ? 0.75 : 0.50,
    dayparting,
  };
}

// ── Bid stream ──────────────────────────────────────────────────────────────

export interface BidStreamSample {
  t_offset_sec: number;       // seconds before now
  bid_requests_per_sec: number;
  bids_per_sec: number;
  wins_per_sec: number;
  avg_winning_cpm_usd: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
}

export function generateBidStream(c: Campaign, samples = 60): BidStreamSample[] {
  const r = rng(c.campaign_id, "stream");
  const baseQps = c.budget_daily_cap_usd / 86400 * 1000;  // very rough QPS scaling
  const out: BidStreamSample[] = [];
  for (let i = 0; i < samples; i++) {
    const noise = 0.85 + r() * 0.30;
    const reqs = Math.round(baseQps * 60 * noise);   // ~per-minute aggregation
    const bidRate = 0.12 + r() * 0.08;               // 12-20% of requests we bid on
    const bids = Math.round(reqs * bidRate);
    const winRate = 0.18 + r() * 0.12;               // 18-30% win on bids
    const wins = Math.round(bids * winRate);
    const cpm = (c.kpi === "CPM" ? c.kpi_target : 6.0) * (0.85 + r() * 0.30);
    out.push({
      t_offset_sec: (samples - 1 - i) * 60,
      bid_requests_per_sec: reqs / 60,
      bids_per_sec: bids / 60,
      wins_per_sec: wins / 60,
      avg_winning_cpm_usd: Math.round(cpm * 100) / 100,
      latency_p50_ms: Math.round(35 + r() * 20),
      latency_p95_ms: Math.round(70 + r() * 40),
    });
  }
  return out;
}

// ── Inventory match per SSP ─────────────────────────────────────────────────

export interface SspPerformance {
  ssp_id: string;
  ssp_name: string;
  win_rate_pct: number;
  avg_winning_cpm_usd: number;
  audience_match_rate_pct: number;
  bid_qps: number;
  latency_p95_ms: number;
  share_of_spend_pct: number;
  trend_24h: "up" | "down" | "flat";
}

const SSP_POOL: Array<{ ssp_id: string; ssp_name: string }> = [
  { ssp_id: "ssp_pubmatic", ssp_name: "PubMatic" },
  { ssp_id: "ssp_magnite",  ssp_name: "Magnite" },
  { ssp_id: "ssp_index",    ssp_name: "Index Exchange" },
  { ssp_id: "ssp_openx",    ssp_name: "OpenX" },
  { ssp_id: "ssp_xandr",    ssp_name: "Microsoft Xandr" },
  { ssp_id: "ssp_ttd_ox",   ssp_name: "The Trade Desk OpenPath" },
  { ssp_id: "ssp_freewheel", ssp_name: "FreeWheel (CTV)" },
];

export function generateSspPerformance(c: Campaign): SspPerformance[] {
  const r = rng(c.campaign_id, "ssps");
  const out: SspPerformance[] = SSP_POOL.map((s) => {
    const winRate = 12 + r() * 28;
    const cpm = (c.kpi === "CPM" ? c.kpi_target : 6.0) * (0.80 + r() * 0.40);
    const matchRate = 38 + r() * 50;
    const qps = (c.budget_daily_cap_usd / 86400 * 1000) * (0.05 + r() * 0.20);
    const trend: SspPerformance["trend_24h"] = r() < 0.4 ? "up" : r() < 0.75 ? "flat" : "down";
    return {
      ssp_id: s.ssp_id,
      ssp_name: s.ssp_name,
      win_rate_pct: Math.round(winRate * 10) / 10,
      avg_winning_cpm_usd: Math.round(cpm * 100) / 100,
      audience_match_rate_pct: Math.round(matchRate * 10) / 10,
      bid_qps: Math.round(qps * 10) / 10,
      latency_p95_ms: Math.round(60 + r() * 80),
      share_of_spend_pct: 0,  // filled below
      trend_24h: trend,
    };
  });
  // Sort by composite score (win × match) and assign share-of-spend.
  out.sort((a, b) => (b.win_rate_pct * b.audience_match_rate_pct) - (a.win_rate_pct * a.audience_match_rate_pct));
  const totalWeight = out.reduce((s, x, i) => s + (out.length - i), 0);
  out.forEach((x, i) => {
    x.share_of_spend_pct = Math.round(((out.length - i) / totalWeight) * 1000) / 10;
  });
  return out;
}

// ── Brand safety / pre-bid filter ───────────────────────────────────────────

export interface BrandSafetyStats {
  total_impressions_evaluated: number;
  total_blocked: number;
  block_rate_pct: number;
  reasons: Array<{ reason: string; count: number; pct: number }>;
  avg_brand_safety_score: number;       // 0-100
  avg_predicted_viewability: number;     // 0-1
  filter_latency_p50_ms: number;
}

export function generateBrandSafety(c: Campaign): BrandSafetyStats {
  const r = rng(c.campaign_id, "safety");
  const impressions = Math.round(c.budget_total_usd / 6 * 1000 * (c.start_day_offset / 30));
  const blockRate = c.kpi === "BRAND_LIFT" ? 0.18 + r() * 0.06 : 0.06 + r() * 0.04;
  const blocked = Math.round(impressions * blockRate);
  const reasons = [
    { reason: "brand_safety_category_breach", weight: 0.42 },
    { reason: "viewability_below_floor", weight: 0.28 },
    { reason: "geo_jurisdiction_excluded", weight: 0.12 },
    { reason: "frequency_cap_hit", weight: 0.10 },
    { reason: "page_not_brand_aligned", weight: 0.05 },
    { reason: "audience_match_fail", weight: 0.03 },
  ].map(({ reason, weight }) => ({
    reason,
    count: Math.round(blocked * weight),
    pct: Math.round(weight * 1000) / 10,
  }));
  return {
    total_impressions_evaluated: impressions,
    total_blocked: blocked,
    block_rate_pct: Math.round(blockRate * 1000) / 10,
    reasons,
    avg_brand_safety_score: Math.round(78 + r() * 16),
    avg_predicted_viewability: Math.round((0.62 + r() * 0.20) * 100) / 100,
    filter_latency_p50_ms: Math.round(8 + r() * 12),
  };
}

// ── Pacing + delivery ───────────────────────────────────────────────────────

export interface PacingPoint {
  day: number;
  spend_usd: number;
  cum_spend_usd: number;
  target_cum_spend_usd: number;
  impressions: number;
  variance_pct: number;        // (actual - target) / target * 100
}

export interface PacingReport {
  budget_total_usd: number;
  spent_to_date_usd: number;
  remaining_usd: number;
  days_elapsed: number;
  days_total: number;
  pacing_health: "under" | "on_track" | "over";
  pacing_variance_pct: number;
  per_day: PacingPoint[];
  total_impressions: number;
}

export function generatePacing(c: Campaign): PacingReport {
  const r = rng(c.campaign_id, "pacing");
  const flightStart = Date.parse(c.flight_start);
  const flightEnd = Date.parse(c.flight_end);
  const daysTotal = Math.max(1, Math.round((flightEnd - flightStart) / 86400000));
  const daysElapsed = Math.min(daysTotal, c.start_day_offset);
  const targetPerDay = c.budget_total_usd / daysTotal;
  let cumActual = 0;
  let totalImps = 0;
  const perDay: PacingPoint[] = [];
  for (let d = 1; d <= daysElapsed; d++) {
    const dailyTarget = Math.min(targetPerDay, c.budget_daily_cap_usd);
    const noise = 0.85 + r() * 0.35;
    const spend = Math.round(dailyTarget * noise * 100) / 100;
    cumActual += spend;
    const cumTarget = Math.round((targetPerDay * d) * 100) / 100;
    const variance = cumTarget > 0 ? Math.round(((cumActual - cumTarget) / cumTarget) * 1000) / 10 : 0;
    const cpm = (c.kpi === "CPM" ? c.kpi_target : 6.0) * (0.90 + r() * 0.20);
    const imps = Math.round(spend / cpm * 1000);
    totalImps += imps;
    perDay.push({
      day: d,
      spend_usd: spend,
      cum_spend_usd: Math.round(cumActual * 100) / 100,
      target_cum_spend_usd: cumTarget,
      impressions: imps,
      variance_pct: variance,
    });
  }
  const overallVariance = perDay.length > 0 ? perDay[perDay.length - 1]!.variance_pct : 0;
  const health: PacingReport["pacing_health"] =
    Math.abs(overallVariance) < 5 ? "on_track" : overallVariance > 0 ? "over" : "under";
  return {
    budget_total_usd: c.budget_total_usd,
    spent_to_date_usd: Math.round(cumActual * 100) / 100,
    remaining_usd: Math.round((c.budget_total_usd - cumActual) * 100) / 100,
    days_elapsed: daysElapsed,
    days_total: daysTotal,
    pacing_health: health,
    pacing_variance_pct: overallVariance,
    per_day: perDay,
    total_impressions: totalImps,
  };
}

// ── Attribution + optimization signals ──────────────────────────────────────

export interface OptimizationSignal {
  kind: "boost" | "decay" | "shift" | "alert";
  target: string;          // e.g. "ssp:ssp_pubmatic" or "audience:auto_in_market"
  metric: string;          // e.g. "+12% lift" or "-8% efficiency"
  recommendation: string;
  confidence: number;      // 0-1
}

export interface AttributionReport {
  conversions: number;
  conversion_value_usd: number;
  realized_kpi: number;
  realized_kpi_unit: string;
  kpi_target: number;
  kpi_status: "above" | "on" | "below";
  optimization_signals: OptimizationSignal[];
  feedback_into_strategy: string[];   // human-readable diff vs current strategy
}

export function generateAttribution(c: Campaign, pacing: PacingReport): AttributionReport {
  const r = rng(c.campaign_id, "attribution");
  const imps = pacing.total_impressions;
  const ctr = 0.0008 + r() * 0.0012;
  const clicks = Math.round(imps * ctr);
  const cvr = 0.012 + r() * 0.020;
  const conversions = Math.round(clicks * cvr);
  const aov = 24 + r() * 56;
  const value = Math.round(conversions * aov * 100) / 100;
  let realized = 0;
  if (c.kpi === "ROAS") realized = Math.round((value / pacing.spent_to_date_usd) * 100) / 100;
  else if (c.kpi === "CPM") realized = Math.round((pacing.spent_to_date_usd / imps * 1000) * 100) / 100;
  else if (c.kpi === "CPA") realized = Math.round((pacing.spent_to_date_usd / Math.max(1, conversions)) * 100) / 100;
  else realized = Math.round((9 + r() * 6) * 10) / 10;  // BRAND_LIFT %

  let status: AttributionReport["kpi_status"];
  if (c.kpi === "CPM" || c.kpi === "CPA") {
    // Lower is better.
    status = realized < c.kpi_target * 0.95 ? "above" : realized > c.kpi_target * 1.05 ? "below" : "on";
  } else {
    // Higher is better.
    status = realized > c.kpi_target * 1.05 ? "above" : realized < c.kpi_target * 0.95 ? "below" : "on";
  }

  // Optimization signals — diverse set of recommendation kinds.
  const signals: OptimizationSignal[] = [
    {
      kind: "boost",
      target: "ssp:ssp_pubmatic",
      metric: "+" + (Math.round(8 + r() * 12)) + "% efficiency",
      recommendation: "Increase share-of-spend by 15% — match rate + win rate both top-quartile.",
      confidence: Math.round((0.78 + r() * 0.18) * 100) / 100,
    },
    {
      kind: "decay",
      target: "ssp:ssp_openx",
      metric: "-" + (Math.round(4 + r() * 6)) + "% efficiency",
      recommendation: "Reduce share-of-spend; CPM trending up while win rate drifts down.",
      confidence: Math.round((0.62 + r() * 0.20) * 100) / 100,
    },
    {
      kind: "shift",
      target: "audience:auto_in_market_signals",
      metric: "+" + (Math.round(10 + r() * 20)) + "% conversion lift",
      recommendation: "Reallocate frequency cap from broad-targeting to in-market segments.",
      confidence: Math.round((0.71 + r() * 0.18) * 100) / 100,
    },
    {
      kind: "alert",
      target: "dayparting:hours_2_5",
      metric: "low fill, high CPM",
      recommendation: "Suppress bidding 02:00-05:00 local — net negative ROAS contribution.",
      confidence: Math.round((0.85 + r() * 0.10) * 100) / 100,
    },
  ];

  const feedback = [
    "→ bid_modifier['audience_match'] multiplier: 1.25 → 1.35",
    "→ ssp_allowlist: drop ssp_openx, promote ssp_pubmatic to priority-1",
    "→ dayparting hours 02-05: multiplier 0.6 → 0.0 (suppress)",
  ];

  return {
    conversions,
    conversion_value_usd: value,
    realized_kpi: realized,
    realized_kpi_unit: c.kpi_unit,
    kpi_target: c.kpi_target,
    kpi_status: status,
    optimization_signals: signals,
    feedback_into_strategy: feedback,
  };
}
