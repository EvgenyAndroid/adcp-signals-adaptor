// src/domain/sponsoredIntelligenceMock.ts
//
// Wave 1 — predictive Sponsored-Intelligence (SI) mock.
//
// Closes the 4th of 6 AdCP 3.0 GA protocol domains:
//   1. media_buy             — live (sell-side + buy-side)
//   2. creative              — live (Celtra, Advertible)
//   3. signals               — live (us, Dstillery)
//   4. governance            — predictive mock (no live vendor)
//   5. brand                 — predictive mock (no live vendor)
//   6. sponsored_intelligence — THIS — predictive mock (no live vendor)
//
// SI is the "competitive context" layer in the spec: knowing which
// brands compete in your space, what their content/creative postures
// look like, when they're up-bidding, etc. Spec-relevant tools:
//   - submit_si_request   — declare intent for an SI session
//   - si_session_lifecycle — open / close / extend a research session
//   - si_availability     — what SI signals are available for this brand?
//   - si_handoff          — pass SI context to a buyer agent for use
//
// All 4 are unspec'd in the directory. We mock the predictive
// "what would SI look like for this brand" view; when upstream lands,
// swap to passthrough.

export type SiSessionState = "available" | "active" | "expired" | "rate_limited";
export type SiInsightTier = "competitive" | "category" | "content_adjacency" | "share_of_voice";

export interface SiCompetitor {
  /** Best-effort competitor brand name. */
  brand_name: string;
  /** Domain (when known). */
  brand_domain?: string;
  /** Estimated share of voice 0-1 within the brand's primary industry. */
  share_of_voice: number;
  /** Active campaign overlap (0-1). */
  campaign_overlap_pct: number;
  /** Trend: bidding more / less / same vs last 30 days. */
  trend_30d: "up" | "flat" | "down";
}

export interface SiInsight {
  tier: SiInsightTier;
  /** One-line headline of the insight. */
  headline: string;
  /** Plain-English narrative. */
  detail: string;
  /** Confidence of the insight (0-1). */
  confidence: number;
  /** Suggested action ("up-bid in DMA-X", "exclude page-category Y", etc). */
  action?: string;
}

export interface SiAdvisory {
  mode: "predictive_local";
  /** Whether SI is available for this brand. Most brands will get
   *  "available"; some return "rate_limited" to demo error states. */
  state: SiSessionState;
  /** Plain-language summary of the SI posture. */
  summary: string;
  /** Top competitors overlapping with the brand. */
  competitors: SiCompetitor[];
  /** Tier-grouped insights. */
  insights: SiInsight[];
  /** Refresh window in seconds. */
  refresh_window_sec: number;
}

interface SiInputs {
  brand_name: string;
  brand_domain?: string;
  industries: string[];
  budget_usd?: number;
}

// Pattern: industry → typical competitor seed map. When the brand is
// in one of these industries, we surface plausible competitors.
const COMPETITOR_MAP: Record<string, Array<{ name: string; domain: string }>> = {
  food_beverage: [
    { name: "Pepsi", domain: "pepsi.com" },
    { name: "Dr Pepper Snapple", domain: "drpeppersnapple.com" },
    { name: "Monster Beverage", domain: "monsterbevcorp.com" },
  ],
  beverages: [
    { name: "Pepsi", domain: "pepsi.com" },
    { name: "Red Bull", domain: "redbull.com" },
    { name: "Anheuser-Busch", domain: "ab-inbev.com" },
  ],
  alcohol: [
    { name: "Anheuser-Busch", domain: "ab-inbev.com" },
    { name: "Diageo", domain: "diageo.com" },
    { name: "Constellation Brands", domain: "cbrands.com" },
  ],
  pharma: [
    { name: "Merck", domain: "merck.com" },
    { name: "Johnson & Johnson", domain: "jnj.com" },
    { name: "AbbVie", domain: "abbvie.com" },
  ],
  gambling: [
    { name: "FanDuel", domain: "fanduel.com" },
    { name: "BetMGM", domain: "betmgm.com" },
    { name: "Caesars Sportsbook", domain: "caesars.com" },
  ],
  apparel: [
    { name: "Adidas", domain: "adidas.com" },
    { name: "Under Armour", domain: "underarmour.com" },
    { name: "Lululemon", domain: "lululemon.com" },
  ],
  automotive: [
    { name: "Honda", domain: "honda.com" },
    { name: "Ford", domain: "ford.com" },
    { name: "Volkswagen", domain: "vw.com" },
  ],
  financial: [
    { name: "Mastercard", domain: "mastercard.com" },
    { name: "American Express", domain: "americanexpress.com" },
    { name: "Capital One", domain: "capitalone.com" },
  ],
  fast_food: [
    { name: "Burger King", domain: "bk.com" },
    { name: "Wendy's", domain: "wendys.com" },
    { name: "Chick-fil-A", domain: "chick-fil-a.com" },
  ],
  children: [
    { name: "Mattel", domain: "mattel.com" },
    { name: "Hasbro", domain: "hasbro.com" },
    { name: "Spin Master", domain: "spinmaster.com" },
  ],
};

// FNV-1a hash for deterministic per-brand pseudo-randomness.
function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string): () => number {
  let s = fnv1a(seed);
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function predictSi(input: SiInputs): SiAdvisory {
  const brandName = input.brand_name || "(unknown)";
  const r = rng(brandName + "|" + (input.industries || []).join(","));

  // 5% rate-limited demo: helps the workshop show error states.
  const state: SiSessionState = (fnv1a(brandName) % 20) === 0 ? "rate_limited" : "available";
  if (state === "rate_limited") {
    return {
      mode: "predictive_local",
      state,
      summary: `SI session rate-limited for ${brandName}. Retry in 60s. (Demo: ~5% of brands hit this state on probe.)`,
      competitors: [],
      insights: [],
      refresh_window_sec: 60,
    };
  }

  // Pull competitors keyed on the FIRST matching industry.
  const indLower = (input.industries || []).map((i) => i.toLowerCase());
  let competitors: Array<{ name: string; domain: string }> = [];
  for (const ind of indLower) {
    const seed = COMPETITOR_MAP[ind];
    if (seed) { competitors = seed; break; }
  }
  // Filter out self-matches (e.g. Coca-Cola seeded into food_beverage).
  competitors = competitors.filter((c) => c.name.toLowerCase() !== brandName.toLowerCase());

  const compEntries: SiCompetitor[] = competitors.map((c) => {
    const sov = Math.round((0.10 + r() * 0.40) * 100) / 100;
    const overlap = Math.round((0.20 + r() * 0.50) * 100) / 100;
    const trend: SiCompetitor["trend_30d"] = r() < 0.4 ? "up" : r() < 0.75 ? "flat" : "down";
    const entry: SiCompetitor = {
      brand_name: c.name,
      brand_domain: c.domain,
      share_of_voice: sov,
      campaign_overlap_pct: overlap,
      trend_30d: trend,
    };
    return entry;
  });

  // Insights — 4 tiers, each producing 1-2 narrative items.
  const insights: SiInsight[] = [];

  if (compEntries.length > 0) {
    const top = compEntries.sort((a, b) => b.share_of_voice - a.share_of_voice)[0]!;
    insights.push({
      tier: "competitive",
      headline: `${top.brand_name} leads category share-of-voice at ${Math.round(top.share_of_voice * 100)}%`,
      detail: `Top overlapping competitor in your industry. Trend: ${top.trend_30d} bid pressure last 30 days. Campaign-overlap with you: ${Math.round(top.campaign_overlap_pct * 100)}% — implies same audience pool.`,
      confidence: Math.round((0.78 + r() * 0.15) * 100) / 100,
      action: top.trend_30d === "up" ? `Up-bid by ~10% on overlapping inventory to defend SOV.` : `Hold bid floor; opportunity to expand reach without escalation.`,
    });
  }

  insights.push({
    tier: "category",
    headline: `Category seasonality: ${(input.industries[0] || "your industry").replace(/_/g, " ")} sees ${(50 + Math.round(r() * 30))}% summer-uplift in CPM`,
    detail: `Aggregate trend across the directory's category data. Driven by Q2/Q3 brand-budget cycles in this industry. Plan flight-windows accordingly.`,
    confidence: Math.round((0.65 + r() * 0.20) * 100) / 100,
  });

  insights.push({
    tier: "content_adjacency",
    headline: `Brand-safe content adjacency rate at ${Math.round((0.70 + r() * 0.20) * 100)}%`,
    detail: `Of impressions classified as "${(input.industries[0] || "general")}-adjacent" content, this share met your typical brand-safety floor (DV/IAS ≥ 70). Lift the floor to 80 to drop ~12% volume but push viewability ~5pp.`,
    confidence: Math.round((0.72 + r() * 0.18) * 100) / 100,
    action: `Consider raising brand_safety_floor to 80 on premium-CPC tactics; keep 70 on prospecting.`,
  });

  insights.push({
    tier: "share_of_voice",
    headline: `Your projected SOV: ${(8 + Math.round(r() * 14))}% if you fire the current plan`,
    detail: `Modeled from your $${(input.budget_usd || 50000).toLocaleString()} budget × industry CPM × competitor pressure. Top quartile in this industry typically commits 22-30% SOV.`,
    confidence: Math.round((0.60 + r() * 0.25) * 100) / 100,
    action: input.budget_usd && input.budget_usd > 200_000
      ? `Budget supports top-quartile SOV; allocate to high-overlap inventory.`
      : `Budget limits competitive matchup; consider niche audience pockets to maximize lift-per-dollar.`,
  });

  return {
    mode: "predictive_local",
    state: "available",
    summary: `SI session active for ${brandName}. ${compEntries.length} competitor(s) overlapping; ${insights.length} insight(s) across ${new Set(insights.map((i) => i.tier)).size} tier(s).`,
    competitors: compEntries,
    insights,
    refresh_window_sec: 900,
  };
}
