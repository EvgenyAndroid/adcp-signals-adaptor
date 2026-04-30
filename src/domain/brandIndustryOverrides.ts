// src/domain/brandIndustryOverrides.ts
//
// The agentic-advertising registry's industry taxonomy is COARSE.
// Many brands miss obvious tags:
//   - Pfizer  → tagged "Heavy Industry and Engineering" (no "pharma")
//   - Heineken→ tagged "Food and Drink" (no "alcohol" or "beer")
//   - DraftKings, lego, etc. — frequently absent from search
//
// This drops policy-matching (Phase C), governance preview (MVP #2),
// and brand-rights inference (Refinement C) at the catch-all level
// for brands that should clearly trigger industry-specific must/should
// policies.
//
// Solution: pattern-derived enrichment keyed on `brand_name`. The
// overrides are MERGED with registry industries (not replaced); a
// provenance field records what we added so the UI can flag it.
//
// When upstream registry adds finer-grained tags, this file becomes
// redundant — at worst, harmless duplication. The override layer is
// purely additive and idempotent.

export interface BrandIndustryEnrichment {
  /** Merged list: registry industries + override additions, in that order. */
  industries: string[];
  /** What we added beyond registry — empty = no override applied. */
  added_by_override: string[];
  /** Brief ID of the matched pattern, for UI provenance display. */
  matched_pattern_id?: string;
}

interface OverridePattern {
  /** Stable identifier shown in the UI as provenance. */
  id: string;
  /** Regex against lowercased brand_name. First-match-wins. */
  pattern: RegExp;
  /** Industry slugs to add. Lowercased. Match policyRegistry's
   *  industries_inferred conventions where possible. */
  add: string[];
}

// First-match-wins. Order matters when patterns overlap.
const OVERRIDES: OverridePattern[] = [
  // Alcohol — beer / wine / spirits / brewers / distillers
  {
    id: "alcohol",
    pattern: /\b(heineken|anheuser|budweiser|coors|miller|corona|stella|guinness|pernod|diageo|bacardi|absolut|smirnoff|jack\s*daniel|jim\s*beam|johnnie\s*walker|jose\s*cuervo|patron|barefoot|yellow\s*tail|crown\s*royal|captain\s*morgan|ketel\s*one|grey\s*goose|hennessy|jagermeister|jameson|chivas|maker.?s\s*mark|tequila|whisky|whiskey|vodka|\brum\b|\bgin\b|cognac|champagne|wine|brewing|brewery|spirits|distillery|distilleries|liquor|cellars?|vineyard)/i,
    add: ["alcohol", "beer", "wine", "spirits"],
  },
  // Tobacco / nicotine / vaping
  {
    id: "tobacco",
    pattern: /\b(philip\s*morris|altria|reynolds\s*american|british\s*american\s*tobacco|imperial\s*brands|jt\s*international|tobacco|cigarette|marlboro|\bcamel\b|newport|juul|vape|vaping|nicotine)/i,
    add: ["tobacco", "vaping", "nicotine"],
  },
  // Cannabis
  {
    id: "cannabis",
    pattern: /\b(curaleaf|cresco|trulieve|green\s*thumb|tilray|aurora\s*cannabis|canopy\s*growth|cronos|cannabis|marijuana|\bcbd\b|dispensary|dispensaries)/i,
    add: ["cannabis"],
  },
  // Gambling / sportsbook / lottery
  {
    id: "gambling",
    pattern: /\b(draftkings|fanduel|mgm\s*resorts|caesars|wynn|las\s*vegas\s*sands|penn\s*entertainment|flutter|bet365|pokerstars|gambling|casino|sportsbook|lottery|sports\s*bett?ing)/i,
    add: ["gambling", "sports_betting", "lottery"],
  },
  // Pharma / healthcare / medical
  {
    id: "pharma",
    pattern: /\b(pfizer|merck|gsk|glaxo|astrazeneca|roche|novartis|johnson\s*&\s*johnson|johnson\s+and\s+johnson|j&j|abbvie|bristol[-\s]*myers|sanofi|eli\s*lilly|\blilly\b|amgen|gilead|biogen|moderna|biontech|regeneron|takeda|bayer|teva|mylan|viatris|cvs\s*health|caremark|walgreens|pharmaceutic|pharma|biotech|hospital|clinic|medical\s*device|healthcare)/i,
    add: ["pharma", "healthcare", "medical_devices"],
  },
  // Children / toys / education / family-targeted
  {
    id: "children",
    pattern: /\b(lego|mattel|hasbro|fisher[-\s]*price|barbie|hot\s*wheels|playmobil|crayola|nintendo|playstation|xbox|disney(\s*kids)?|nickelodeon|cartoon\s*network|pbs\s*kids|kids?|toddler|toys?|preschool|kindergarten|elementary|montessori)/i,
    add: ["children", "toys", "education"],
  },
  // Financial services / banking / insurance / fintech
  {
    id: "financial",
    pattern: /\b(visa|mastercard|amex|american\s*express|\bchase\b|citi(\s*bank)?|bank\s*of\s*america|wells\s*fargo|jpmorgan|goldman|morgan\s*stanley|capital\s*one|\bdiscover\b|paypal|stripe|\bsquare\b|robinhood|fidelity|charles\s*schwab|vanguard|blackrock|allianz|\baig\b|metlife|prudential|geico|progressive|state\s*farm|liberty\s*mutual|farmers\s*insurance|intuit|turbotax|quickbooks|\bbank|insurance|loan|mortgage|credit|fintech|investment|brokerage|wealth\s*management)/i,
    add: ["financial", "banking", "insurance", "lending", "fintech"],
  },
  // Fast food / HFSS-relevant — UK HFSS regulation triggers on these
  {
    id: "fast_food",
    pattern: /\b(mcdonald|burger\s*king|wendy|kfc|taco\s*bell|pizza\s*hut|domino|subway|chipotle|popeyes|chick[-\s]*fil[-\s]*a|arby|sonic\s*drive|five\s*guys|in[-\s]*n[-\s]*out|whataburger|fast\s*food|quick\s*service)/i,
    add: ["fast_food", "food_beverage"],
  },
  // Confectionery / snacks (HFSS-relevant)
  {
    id: "confectionery",
    pattern: /\b(hershey|mars|mondelez|nestl[ée]|ferrero|cadbury|oreo|kit\s*kat|snickers|reese|m&m|gummy|chocolate|candy|confectionery|snack|chip|cookie|biscuit|cereal)/i,
    add: ["confectionery", "food_beverage"],
  },
  // Political / advocacy
  {
    id: "political",
    pattern: /\b(political|campaign\s*committee|democratic|republican|partisan|advocacy|super\s*pac|\bpac\b|nonprofit\s*advocacy)/i,
    add: ["political", "advocacy"],
  },
  // AI-generated content / generative AI vendors
  {
    id: "ai_generated",
    pattern: /\b(openai|anthropic|midjourney|stability\s*ai|runway\s*ml|elevenlabs|synthesia|generative\s*ai|ai[-\s]*generated|deepfake)/i,
    add: ["ai_generated_content"],
  },
];

/**
 * Given a brand_name and the registry-supplied industries, return the
 * merged list with override-added entries appended. Idempotent: re-running
 * on already-enriched output yields the same result. First-pattern-wins.
 */
export function enrichIndustries(
  brandName: string | undefined | null,
  registryIndustries: readonly string[],
): BrandIndustryEnrichment {
  const name = (brandName || "").toLowerCase();
  const lowerRegistry = new Set(registryIndustries.map((s) => s.toLowerCase()));
  if (!name) {
    return { industries: registryIndustries.slice(), added_by_override: [] };
  }
  for (const p of OVERRIDES) {
    if (p.pattern.test(name)) {
      const additions = p.add.filter((a) => !lowerRegistry.has(a.toLowerCase()));
      if (additions.length === 0) {
        // Pattern matched but every tag already present — return as-is,
        // mark the match for UI provenance ("registry already has this").
        return {
          industries: registryIndustries.slice(),
          added_by_override: [],
          matched_pattern_id: p.id,
        };
      }
      return {
        industries: [...registryIndustries, ...additions],
        added_by_override: additions,
        matched_pattern_id: p.id,
      };
    }
  }
  return { industries: registryIndustries.slice(), added_by_override: [] };
}
