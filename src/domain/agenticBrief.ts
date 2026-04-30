// src/domain/agenticBrief.ts
//
// LLM-driven brief expander. Takes a natural-language sentence and
// produces a structured CampaignBrief that downstream stages can
// consume. Live mode uses Claude; template mode applies regex-based
// extraction + sensible defaults.

import { llmCall, type AgenticContext, type ReasoningStep, newReasoningStep } from "./agenticCore";
import { enrichIndustries } from "./brandIndustryOverrides";

export interface ExpandedBrief {
  /** Original input. */
  input: string;
  /** Resolved brand name (may be best-guess). */
  brand_name?: string;
  /** Resolved brand domain (may be best-guess). */
  brand_domain?: string;
  /** Industries — registry-style + override-derived. */
  industries: string[];
  /** Audience descriptors extracted from the brief (e.g. "Gen Z urban"). */
  audience_descriptors: string[];
  /** Inferred KPI: ROAS · CPM · CPA · BRAND_LIFT. */
  kpi: "ROAS" | "CPM" | "CPA" | "BRAND_LIFT";
  /** Suggested target value. Numeric form. */
  kpi_target?: number;
  /** Inferred budget range in USD. */
  budget_usd_estimate?: number;
  /** Inferred geo. */
  geo: string[];
  /** Inferred flight duration in days. */
  flight_days?: number;
  /** Day-part hint: peak / always-on / business-hours / late-night. */
  dayparting_hint?: "peak_evening" | "always_on" | "business_hours" | "late_night";
  /** Confidence of the expansion 0–1. */
  confidence: number;
  /** Whether the brief was expanded by LLM (live) or template (rule). */
  source: "live_llm" | "template";
  /** Reasoning trace steps emitted while expanding. */
  trace: ReasoningStep[];
}

const SYSTEM_PROMPT_BRIEF = `You are a senior media planner expanding a one-line campaign brief into a structured plan.
Given a natural-language brief, extract:
  - brand (name, domain if present)
  - industries (registry-style: food_beverage, alcohol, pharma, gambling, financial, automotive, etc.)
  - audience descriptors (verbatim phrases from the brief)
  - KPI: ROAS / CPM / CPA / BRAND_LIFT (pick best fit; default ROAS for retail/CPG, BRAND_LIFT for awareness)
  - kpi_target (numeric; e.g. 3.5 for ROAS, 8.50 for CPM, 12 for BRAND_LIFT %)
  - budget_usd_estimate (parse from text; otherwise infer reasonable: $50K small, $250K mid, $1M+ enterprise)
  - geo (ISO codes or DMAs)
  - flight_days (parse from text; default 30)
  - dayparting_hint (peak_evening for entertainment/retail; business_hours for B2B; always_on for awareness)
  - confidence (0-1; how sure you are of the expansion)`;

const BRIEF_SCHEMA_HINT = `{
  "brand_name": string | null,
  "brand_domain": string | null,
  "industries": string[],
  "audience_descriptors": string[],
  "kpi": "ROAS" | "CPM" | "CPA" | "BRAND_LIFT",
  "kpi_target": number,
  "budget_usd_estimate": number,
  "geo": string[],
  "flight_days": number,
  "dayparting_hint": "peak_evening" | "always_on" | "business_hours" | "late_night",
  "confidence": number
}`;

// ── Template-mode extractor ──────────────────────────────────────────────────
//
// Rule-based fallback. Recognizes ~30 brand patterns + budget/KPI/geo
// hints from the brief. Produces a structurally identical output to
// the LLM path.

interface BrandHint { name: string; domain: string; industries: string[] }

const KNOWN_BRANDS: Array<{ pattern: RegExp; hint: BrandHint }> = [
  { pattern: /\b(coca[- ]?cola|coke)\b/i, hint: { name: "Coca-Cola", domain: "coca-cola.com", industries: ["food_beverage", "beverages"] } },
  { pattern: /\b(pepsi|pepsico)\b/i, hint: { name: "Pepsi", domain: "pepsi.com", industries: ["food_beverage", "beverages"] } },
  { pattern: /\b(nike)\b/i, hint: { name: "Nike", domain: "nike.com", industries: ["apparel", "sportswear"] } },
  { pattern: /\b(adidas)\b/i, hint: { name: "Adidas", domain: "adidas.com", industries: ["apparel", "sportswear"] } },
  { pattern: /\b(heineken)\b/i, hint: { name: "Heineken", domain: "heinekenusa.com", industries: ["alcohol", "beer"] } },
  { pattern: /\b(anheuser|bud(weiser)?)\b/i, hint: { name: "Anheuser-Busch", domain: "ab-inbev.com", industries: ["alcohol", "beer"] } },
  { pattern: /\b(pfizer)\b/i, hint: { name: "Pfizer", domain: "pfizer.com", industries: ["pharma", "healthcare"] } },
  { pattern: /\b(gsk|glaxo)\b/i, hint: { name: "GSK", domain: "gsk.com", industries: ["pharma", "healthcare"] } },
  { pattern: /\b(draftkings)\b/i, hint: { name: "DraftKings", domain: "draftkings.com", industries: ["gambling", "sports_betting"] } },
  { pattern: /\b(fanduel)\b/i, hint: { name: "FanDuel", domain: "fanduel.com", industries: ["gambling", "sports_betting"] } },
  { pattern: /\b(lego)\b/i, hint: { name: "LEGO", domain: "lego.com", industries: ["children", "toys"] } },
  { pattern: /\b(visa)\b/i, hint: { name: "Visa", domain: "visa.com", industries: ["financial", "fintech"] } },
  { pattern: /\b(bank of america|bofa)\b/i, hint: { name: "Bank of America", domain: "bankofamerica.com", industries: ["financial", "banking"] } },
  { pattern: /\b(toyota)\b/i, hint: { name: "Toyota", domain: "toyota.com", industries: ["automotive"] } },
  { pattern: /\b(tesla)\b/i, hint: { name: "Tesla", domain: "tesla.com", industries: ["automotive", "electric_vehicles"] } },
  { pattern: /\b(mcdonald|mcd)\b/i, hint: { name: "McDonald's", domain: "mcdonalds.com", industries: ["fast_food", "food_beverage"] } },
];

function extractBudget(input: string): number | undefined {
  const m1 = input.match(/\$(\d+(?:[.,]\d+)?)\s*(k|m|b|million|billion|thousand)?\b/i);
  if (m1) {
    const n = parseFloat(m1[1]!.replace(/,/g, ""));
    const unit = (m1[2] || "").toLowerCase();
    if (unit === "k" || unit === "thousand") return n * 1_000;
    if (unit === "m" || unit === "million") return n * 1_000_000;
    if (unit === "b" || unit === "billion") return n * 1_000_000_000;
    return n;
  }
  return undefined;
}

function extractGeo(input: string): string[] {
  const out = new Set<string>();
  if (/\b(US|united states|america)\b/i.test(input)) out.add("US");
  if (/\b(EU|europe|european)\b/i.test(input)) out.add("EU");
  if (/\b(UK|britain|british)\b/i.test(input)) out.add("GB");
  if (/\b(canada|canadian)\b/i.test(input)) out.add("CA");
  if (/\b(NYC|new york)\b/i.test(input)) out.add("US-NYC");
  if (/\b(LA|los angeles)\b/i.test(input)) out.add("US-LA");
  if (/\b(SF|san francisco)\b/i.test(input)) out.add("US-SF");
  if (/\b(chicago)\b/i.test(input)) out.add("US-CHI");
  if (out.size === 0) out.add("US");
  return Array.from(out);
}

function inferKpi(input: string): { kpi: ExpandedBrief["kpi"]; target: number } {
  const lo = input.toLowerCase();
  if (/\b(awareness|brand lift|reach|impression)\b/.test(lo)) return { kpi: "BRAND_LIFT", target: 12 };
  if (/\b(cpm|cost per mille|cost per thousand)\b/.test(lo)) return { kpi: "CPM", target: 8.5 };
  if (/\b(cpa|cost per acquisition|sign[- ]?up|acquisition)\b/.test(lo)) return { kpi: "CPA", target: 25 };
  if (/\b(roas|conversion|sale|purchase|ecommerce)\b/.test(lo)) return { kpi: "ROAS", target: 3.5 };
  // Default: ROAS for known retail brands; BRAND_LIFT otherwise
  return { kpi: "ROAS", target: 3.0 };
}

function inferDayparting(input: string): ExpandedBrief["dayparting_hint"] {
  const lo = input.toLowerCase();
  if (/\b(b2b|business hours|workday)\b/.test(lo)) return "business_hours";
  if (/\b(late night|night owl|insomniac)\b/.test(lo)) return "late_night";
  if (/\b(awareness|always[- ]?on|24[/ ]?7)\b/.test(lo)) return "always_on";
  return "peak_evening";
}

function expandViaTemplate(input: string): Omit<ExpandedBrief, "trace" | "source"> {
  const lower = input.toLowerCase();

  // Brand match
  let brand: BrandHint | null = null;
  for (const { pattern, hint } of KNOWN_BRANDS) {
    if (pattern.test(input)) { brand = hint; break; }
  }

  // Audience descriptors — just split out sequences of capitalized adjacent
  // words + known hint words.
  const audienceWords: string[] = [];
  const audMatches = input.match(/\b(gen[ -]?z|millennial|boomer|gen[ -]?x|teen|adult|adults?|moms?|dads?|family|families|sneakerheads?|gamers?|sports fans?|foodies?)\b/gi) || [];
  audienceWords.push(...audMatches.map((s) => s.trim()));
  const urbanMatches = input.match(/\b(urban|suburban|rural|city|metro)\b/gi) || [];
  audienceWords.push(...urbanMatches.map((s) => s.toLowerCase()));

  const { kpi, target } = inferKpi(input);
  const budget = extractBudget(input);
  const geo = extractGeo(input);

  // Flight days
  let flightDays = 30;
  const flightMatch = input.match(/\b(\d+)[- ]?(day|week|month|quarter)/i);
  if (flightMatch) {
    const n = parseInt(flightMatch[1]!, 10);
    const unit = flightMatch[2]!.toLowerCase();
    flightDays = unit.startsWith("week") ? n * 7 : unit.startsWith("month") ? n * 30 : unit.startsWith("quarter") ? n * 90 : n;
  } else if (/\b(summer|winter|spring|fall)\b/.test(lower)) {
    flightDays = 90;
  }

  // Industry enrichment overlay (alcohol/pharma/etc patterns)
  const baseIndustries = brand?.industries ?? [];
  const enr = enrichIndustries(brand?.name ?? input, baseIndustries);
  const industries = enr.industries.length > 0 ? enr.industries : ["general"];

  const dayparting = inferDayparting(input);
  const out: Omit<ExpandedBrief, "trace" | "source"> = {
    input,
    industries,
    audience_descriptors: Array.from(new Set(audienceWords)),
    kpi,
    kpi_target: target,
    geo,
    flight_days: flightDays,
    confidence: brand ? 0.78 : 0.55,
    ...(dayparting ? { dayparting_hint: dayparting } : {}),
  };
  if (brand) {
    out.brand_name = brand.name;
    out.brand_domain = brand.domain;
  }
  if (budget !== undefined) out.budget_usd_estimate = budget;
  return out;
}

// ── Public expander ─────────────────────────────────────────────────────────

export async function expandBrief(ctx: AgenticContext, input: string): Promise<ExpandedBrief> {
  const trace: ReasoningStep[] = [];
  trace.push(newReasoningStep("analyze", `Received brief: "${input}". Length ${input.length} chars; mode = ${ctx.mode}.`));

  if (ctx.mode === "live") {
    const start = Date.now();
    const r = await llmCall(ctx, {
      system: SYSTEM_PROMPT_BRIEF,
      messages: [{ role: "user", content: `Expand this brief:\n\n"${input}"` }],
      json_schema_hint: BRIEF_SCHEMA_HINT,
      max_tokens: 1000,
    });
    if (r.ok && r.json) {
      const j = r.json as Partial<ExpandedBrief>;
      trace.push(newReasoningStep("decide", `Claude expanded the brief in ${r.latency_ms}ms with confidence ${j.confidence ?? "?"}.`, undefined, r.latency_ms));
      const baseInds = Array.isArray(j.industries) ? j.industries : [];
      const enr = enrichIndustries(j.brand_name ?? input, baseInds);
      const expanded: ExpandedBrief = {
        input,
        ...(j.brand_name !== undefined && j.brand_name !== null ? { brand_name: j.brand_name } : {}),
        ...(j.brand_domain !== undefined && j.brand_domain !== null ? { brand_domain: j.brand_domain } : {}),
        industries: enr.industries.length > 0 ? enr.industries : ["general"],
        audience_descriptors: Array.isArray(j.audience_descriptors) ? j.audience_descriptors : [],
        kpi: (j.kpi as ExpandedBrief["kpi"]) ?? "ROAS",
        ...(j.kpi_target !== undefined ? { kpi_target: j.kpi_target } : {}),
        ...(j.budget_usd_estimate !== undefined ? { budget_usd_estimate: j.budget_usd_estimate } : {}),
        geo: Array.isArray(j.geo) ? j.geo : ["US"],
        ...(j.flight_days !== undefined ? { flight_days: j.flight_days } : {}),
        ...(j.dayparting_hint ? { dayparting_hint: j.dayparting_hint } : {}),
        confidence: typeof j.confidence === "number" ? j.confidence : 0.7,
        source: "live_llm",
        trace,
      };
      trace.push(newReasoningStep("complete", `Expansion done. KPI=${expanded.kpi}@${expanded.kpi_target}, geo=${expanded.geo.join("/")}, ${expanded.industries.length} industries.`, undefined, Date.now() - start));
      return expanded;
    }
    trace.push(newReasoningStep("recover", `Live LLM call failed (${r.error || "unknown"}); falling back to template extraction.`));
  } else {
    trace.push(newReasoningStep("plan", "No live LLM key; using rule-based template extractor."));
  }

  // Template mode (or fallback from failed live)
  const tStart = Date.now();
  const tpl = expandViaTemplate(input);
  trace.push(newReasoningStep("decide", `Template extraction: brand=${tpl.brand_name ?? "(unknown)"}, kpi=${tpl.kpi}@${tpl.kpi_target}, industries=[${tpl.industries.join(",")}], confidence=${tpl.confidence}.`, undefined, Date.now() - tStart));
  trace.push(newReasoningStep("complete", `Brief ready for downstream tool planning.`));
  return { ...tpl, source: "template", trace };
}
