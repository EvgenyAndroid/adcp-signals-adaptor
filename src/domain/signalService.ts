// src/domain/signalService.ts

import type { CanonicalSignal } from "../types/signal";
import type {
  SearchSignalsRequest,
  SearchSignalsResponse,
  CustomSignalProposal,
} from "../types/api";
import type { DB } from "../storage/db";
import { searchSignals, findSignalById } from "../storage/signalRepo";
import { putProposal } from "../storage/proposalCache";
import { toSignalSummary, toSignalSummaries } from "../mappers/signalMapper";
import { validateRules, generateSegment } from "./ruleEngine";
import { estimateAudienceSize } from "../utils/estimation";
import { dynamicSignalId } from "../utils/ids";
import { requestId } from "../utils/ids";
import type { CatalogSignal } from "./queryResolver";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const TOTAL_ADDRESSABLE = 240_000_000;
const DATA_PROVIDER = "AdCP Signals Adaptor - Demo Provider (Evgeny)";

/**
 * Search the signal catalog and, when a `brief` is supplied, generate
 * dynamic-segment proposals.
 *
 * Generated proposals are written to the KV proposal cache (not D1) so
 * a follow-up `activate_signal` call can promote them lazily into D1.
 * This keeps the search read-path off D1 writes — see proposalCache.ts.
 *
 * @param db   D1 binding
 * @param kv   KV binding for the proposal cache
 * @param req  search request
 */
export async function searchSignalsService(
  db: DB,
  kv: KVNamespace,
  req: SearchSignalsRequest
): Promise<SearchSignalsResponse> {
  const limit = Math.min(req.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = req.offset ?? 0;

  // When a brief is present, fetch a larger window so we can re-rank by relevance
  const fetchLimit = req.brief ? Math.min(200, MAX_LIMIT * 4) : limit;

  const { signals, totalCount } = await searchSignals(db, {
    query: req.query,
    categoryType: req.categoryType,
    generationMode: req.generationMode,
    taxonomyId: req.taxonomyId,
    destination: req.destination,
    activationSupported: req.activationSupported,
    limit: fetchLimit,
    offset: req.brief ? 0 : offset,  // always fetch from top when re-ranking
  });

  // If brief/signal_spec present, re-rank catalog results by relevance to brief
  // Fetch broader window, score, sort, then slice to limit
  let summaries = toSignalSummaries(
    req.brief ? rankByRelevance(signals, req.brief).slice(0, limit) : signals
  );

  // Filter deployments by requested destinations array
  if (req.destinations && req.destinations.length > 0) {
    const requestedPlatforms = req.destinations
      .filter((d) => d.type === "platform" && d.platform)
      .map((d) => d.platform as string);
    if (requestedPlatforms.length > 0) {
      summaries = summaries
        .map((s) => ({
          ...s,
          deployments: s.deployments.filter((dep) =>
            requestedPlatforms.includes(dep.platform ?? "")
          ),
        }))
        .filter((s) => s.deployments.length > 0);
    }
  }

  // Generate proposals from natural language brief. We cache each
  // proposal in KV (not D1) so activate_signal can promote it lazily on
  // demand — see src/storage/proposalCache.ts for rationale.
  let proposals: CustomSignalProposal[] | undefined;
  if (req.brief) {
    const generated = generateProposalsFromBrief(req.brief);
    if (generated.length > 0) {
      const now = new Date().toISOString();
      await Promise.all(
        generated.map((proposal) =>
          putProposal(kv, proposalToCanonical(proposal, now))
        )
      );
      proposals = generated;
    }
  }

  const filterDesc = req.brief
    ? `matching brief "${req.brief.slice(0, 50)}"`
    : req.query
    ? `matching "${req.query}"`
    : req.categoryType
    ? `in category "${req.categoryType}"`
    : "from catalog";

  return {
    message: `Found ${summaries.length} signal(s) ${filterDesc}. Review pricing and deployment status before activating.`,
    context_id: requestId(),
    signals: summaries,
    ...(proposals && proposals.length > 0 ? { proposals } : {}),
    count: summaries.length,
    totalCount,
    offset,
    hasMore: offset + summaries.length < totalCount,
  };
}

export async function getSignalByIdService(
  db: DB,
  signalId: string
): Promise<CanonicalSignal | null> {
  return findSignalById(db, signalId);
}

/**
 * Build the CanonicalSignal shape that activation expects from a
 * generated proposal. Extracted so search-side caching and
 * activation-side promotion produce identical D1 rows.
 */
export function proposalToCanonical(
  proposal: CustomSignalProposal,
  now: string,
): CanonicalSignal {
  return {
    signalId: proposal.signal_agent_segment_id,
    taxonomySystem: "iab_audience_1_1",
    name: proposal.name,
    description: proposal.description,
    categoryType: proposal.category_type as CanonicalSignal["categoryType"],
    sourceSystems: ["rule_engine", "brief_generator"],
    destinations: ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"],
    activationSupported: true,
    estimatedAudienceSize: proposal.estimated_audience_size,
    accessPolicy: "public_demo",
    generationMode: "dynamic",
    status: "available",
    pricing: { model: "mock_cpm", value: 4.0, currency: "USD" },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Parse a natural language brief into custom segment proposals.
 * Uses keyword extraction to infer relevant dimensions and values.
 * Proposals are NOT persisted — they are created lazily when activated.
 */
function generateProposalsFromBrief(brief: string): CustomSignalProposal[] {
  const lower = brief.toLowerCase();
  const proposals: CustomSignalProposal[] = [];

  // Extract dimensions from brief text
  const rules: Array<{ dimension: string; operator: "eq" | "in"; value: string | string[] }> = [];

  // Age detection
  if (lower.includes("18-24") || lower.includes("gen z") || lower.includes("young adult")) {
    rules.push({ dimension: "age_band", operator: "eq", value: "18-24" });
  } else if (lower.includes("25-34") || lower.includes("millennial")) {
    rules.push({ dimension: "age_band", operator: "eq", value: "25-34" });
  } else if (lower.includes("35-44") || lower.includes("gen x")) {
    rules.push({ dimension: "age_band", operator: "eq", value: "35-44" });
  } else if (lower.includes("45-54") || lower.includes("boomer")) {
    rules.push({ dimension: "age_band", operator: "eq", value: "45-54" });
  } else if (lower.includes("65") || lower.includes("senior")) {
    rules.push({ dimension: "age_band", operator: "eq", value: "65+" });
  }

  // Income detection
  if (lower.includes("high income") || lower.includes("affluent") || lower.includes("wealthy") || lower.includes("150k") || lower.includes("$150")) {
    rules.push({ dimension: "income_band", operator: "eq", value: "150k_plus" });
  } else if (lower.includes("upper middle") || lower.includes("100k") || lower.includes("$100")) {
    rules.push({ dimension: "income_band", operator: "eq", value: "100k_150k" });
  } else if (lower.includes("middle income") || lower.includes("50k")) {
    rules.push({ dimension: "income_band", operator: "eq", value: "50k_100k" });
  }

  // Education detection
  if (lower.includes("graduate") || lower.includes("phd") || lower.includes("mba") || lower.includes("postgrad")) {
    rules.push({ dimension: "education", operator: "eq", value: "graduate" });
  } else if (lower.includes("college") || lower.includes("bachelor") || lower.includes("university") || lower.includes("degree")) {
    rules.push({ dimension: "education", operator: "eq", value: "bachelors" });
  }

  // Household detection
  if (lower.includes("famil") || lower.includes("parent") || lower.includes("children") || lower.includes("kids")) {
    rules.push({ dimension: "household_type", operator: "eq", value: "family_with_kids" });
  } else if (lower.includes("single") || lower.includes("solo")) {
    rules.push({ dimension: "household_type", operator: "eq", value: "single" });
  } else if (lower.includes("couple") || lower.includes("no kids") || lower.includes("dink")) {
    rules.push({ dimension: "household_type", operator: "eq", value: "couple_no_kids" });
  }

  // Geo detection
  if (lower.includes("top 10") || lower.includes("major metro") || lower.includes("new york") || lower.includes("los angeles")) {
    rules.push({ dimension: "metro_tier", operator: "eq", value: "top_10" });
  } else if (lower.includes("top 25") || lower.includes("urban") || lower.includes("city")) {
    rules.push({ dimension: "metro_tier", operator: "in", value: ["top_10", "top_25"] });
  }

  // Interest detection
  if (lower.includes("sci-fi") || lower.includes("science fiction") || lower.includes("scifi")) {
    rules.push({ dimension: "content_genre", operator: "eq", value: "sci_fi" });
  } else if (lower.includes("action")) {
    rules.push({ dimension: "content_genre", operator: "eq", value: "action" });
  } else if (lower.includes("documentary") || lower.includes("news") || lower.includes("factual")) {
    rules.push({ dimension: "content_genre", operator: "eq", value: "documentary" });
  } else if (lower.includes("comedy")) {
    rules.push({ dimension: "content_genre", operator: "eq", value: "comedy" });
  }

  // Streaming detection
  if (lower.includes("streaming") || lower.includes("cord cut") || lower.includes("ctv") || lower.includes("ott")) {
    rules.push({ dimension: "streaming_affinity", operator: "eq", value: "high" });
  }

  if (rules.length === 0) {
    // No recognizable dimensions — return empty, let catalog results stand
    return [];
  }

  // Validate and generate
  const { valid } = validateRules(rules as Parameters<typeof validateRules>[0]);
  if (!valid) return [];

  const result = generateSegment(
    rules as Parameters<typeof generateSegment>[0],
    undefined // auto-name from rules
  );

  const coveragePct = Math.min(
    99,
    Math.round((result.estimatedAudienceSize / TOTAL_ADDRESSABLE) * 100 * 10) / 10
  );

  const proposal: CustomSignalProposal = {
    signal_agent_segment_id: result.signalId,
    name: result.name,
    description: `Custom segment generated from brief: "${brief.slice(0, 100)}". ${result.description}`,
    signal_type: "custom",
    category_type: result.categoryType,
    estimated_audience_size: result.estimatedAudienceSize,
    coverage_percentage: coveragePct,
    pricing_options: [
      {
        pricing_option_id: `opt-custom-${result.signalId}`.slice(0, 64),
        pricing_model: "cpm",
        rate: 4.0,
        currency: "USD",
        is_fixed: true,
      },
    ],
    deployments: ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"].map((dest) => ({
      type: "platform" as const,
      platform: dest,
      is_live: false, // not yet created — will be live after activation
      decisioning_platform_segment_id: `${dest}_${result.signalId}`,
      activation_supported: dest !== "mock_measurement",
    })),
    generation_rationale: result.generationNotes,
  };

  proposals.push(proposal);
  return proposals;
}

// ── Relevance ranking ─────────────────────────────────────────────────────────

/**
 * Score each signal by keyword overlap with the brief.
 * Returns signals sorted by score descending (most relevant first).
 *
 * Scoring:
 *   +4 per brief keyword found in signal name
 *   +2 per brief keyword found in signal description
 *   +3 bonus if signal category_type matches a brief category hint
 *   +2 bonus if signal generation_mode = "derived" or "dynamic" (richer composites)
 *   tie-break: larger estimatedAudienceSize first
 */
function rankByRelevance(signals: CanonicalSignal[], brief: string): CanonicalSignal[] {
  const lower = brief.toLowerCase();

  // Extract meaningful keywords (skip stop words)
  const STOP_WORDS = new Set([
    "a","an","the","and","or","in","on","of","to","for","with","by",
    "at","from","as","is","are","who","that","this","be","have","do",
    "not","but","so","if","its","it","my","we","our","they","their",
    "me","us","you","your","he","she","him","her","i","am","was","were",
    "will","would","could","should","may","might","can",
  ]);

  const keywords = lower
    .replace(/[^a-z0-9\s$]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Category hints from brief text
  const categoryHints: Record<string, string[]> = {
    demographic: ["age","income","education","household","family","senior","adult","young","boomer","millennial"],
    interest: ["fan","viewer","streaming","content","genre","movie","show","music","gaming","sports"],
    purchase_intent: ["buy","purchase","intent","shopping","luxury","goods","product","brand","market"],
    geo: ["dma","city","metro","market","area","region","state","zip","national","local"],
    composite: ["affluent","high income","premium","professional","educated","urban"],
  };

  const scored = signals.map((signal) => {
    const nameLower = signal.name.toLowerCase();
    const descLower = signal.description.toLowerCase();
    let score = 0;

    for (const kw of keywords) {
      if (nameLower.includes(kw)) score += 4;
      if (descLower.includes(kw)) score += 2;
    }

    // Category bonus
    for (const [cat, hints] of Object.entries(categoryHints)) {
      if (hints.some((h) => lower.includes(h)) && signal.categoryType === cat) {
        score += 3;
        break;
      }
    }

    // Prefer richer segments
    if (signal.generationMode === "derived") score += 1;
    if (signal.generationMode === "dynamic") score += 2;

    return { signal, score };
  });

  return scored
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : (b.signal.estimatedAudienceSize ?? 0) - (a.signal.estimatedAudienceSize ?? 0)
    )
    .map((s) => s.signal);
}

// ── NL Query catalog adapter ──────────────────────────────────────────────────

/**
 * Returns the full signal catalog as a flat CatalogSignal[] for use by the
 * NL query resolver (queryResolver.ts). Fetches all available signals from D1
 * with no filters, up to 500.
 *
 * CatalogSignal is a leaner shape than CanonicalSignal — just the fields the
 * resolver needs for matching and audience size estimation.
 */
export async function getAllSignalsForCatalog(db: DB): Promise<CatalogSignal[]> {
  const { signals } = await searchSignals(db, { limit: 500, offset: 0 });

  return signals.map((s): CatalogSignal => ({
    signal_agent_segment_id: s.signalId,
    name: s.name,
    category_type: s.categoryType,
    estimated_audience_size: s.estimatedAudienceSize ?? 0,
    coverage_percentage: s.estimatedAudienceSize
      ? s.estimatedAudienceSize / TOTAL_ADDRESSABLE
      : 0,
    description: s.description,
    iab_taxonomy_ids: s.taxonomyId ? [s.taxonomyId] : undefined,
    rules: inferRulesFromSignalId(s.signalId),
  }));
}

/**
 * Infers dimension rules from signal IDs so the NL query resolver's
 * Pass 1 (exact rule match) fires correctly against the real D1 catalog.
 *
 * Signal IDs follow the pattern: sig_{dimension}_{value}
 * e.g. sig_age_35_44 → { dimension: "age_band", value: "35-44" }
 *      sig_income_150k_plus → { dimension: "income_band", value: "150k_plus" }
 *
 * This is preferable to storing rules in D1 because it requires no schema change
 * and works for all seeded + derived signals whose IDs follow the naming convention.
 */
function inferRulesFromSignalId(
  signalId: string
): Array<{ dimension: string; operator: string; value: string }> {
  const SIGNAL_RULE_MAP: Record<string, { dimension: string; value: string }> = {
    // ── Age bands (actual D1 IDs) ────────────────────────────────────────────
    sig_age_18_24:   { dimension: "age_band", value: "18-24" },
    sig_age_25_34:   { dimension: "age_band", value: "25-34" },
    sig_age_35_44:   { dimension: "age_band", value: "35-44" },
    sig_age_45_54:   { dimension: "age_band", value: "45-54" },
    sig_age_55_64:   { dimension: "age_band", value: "55-64" },
    sig_age_65_plus: { dimension: "age_band", value: "65+" },

    // ── Income (actual D1 IDs) ───────────────────────────────────────────────
    sig_high_income_households:  { dimension: "income_band", value: "150k_plus" },
    sig_upper_middle_income:     { dimension: "income_band", value: "100k_150k" },
    sig_middle_income_households:{ dimension: "income_band", value: "50k_100k" },

    // ── Education (actual D1 IDs) ────────────────────────────────────────────
    sig_college_educated_adults:  { dimension: "education", value: "bachelors" },
    sig_graduate_educated_adults: { dimension: "education", value: "graduate" },

    // ── Household (actual D1 IDs) ────────────────────────────────────────────
    sig_families_with_children: { dimension: "household_type", value: "family_with_kids" },
    sig_senior_households:      { dimension: "household_type", value: "senior_household" },

    // ── Interest / content genre (actual D1 IDs) ────────────────────────────
    sig_action_movie_fans:    { dimension: "content_genre",      value: "action" },
    sig_comedy_fans:          { dimension: "content_genre",      value: "comedy" },
    sig_documentary_viewers:  { dimension: "content_genre",      value: "documentary" },
    sig_drama_viewers:        { dimension: "content_genre",      value: "drama" },
    sig_sci_fi_enthusiasts:   { dimension: "content_genre",      value: "sci_fi" },
    sig_streaming_enthusiasts:{ dimension: "streaming_affinity", value: "high" },

    // ── Composite / archetype signals ────────────────────────────────────────
    // Map to closest single dimension for Pass 1; description similarity
    // handles richer multi-dimension matching in Pass 2.
    sig_urban_professionals:          { dimension: "metro_tier",    value: "top_10" },
    sig_acs_affluent_college_educated:{ dimension: "income_band",   value: "100k_150k" },
    sig_acs_graduate_high_income:     { dimension: "income_band",   value: "150k_plus" },
    sig_acs_middle_income_families:   { dimension: "household_type",value: "family_with_kids" },
    sig_acs_senior_households_income: { dimension: "household_type",value: "senior_household" },
    sig_acs_young_single_adults:      { dimension: "age_band",      value: "18-24" },
  };

  const mapped = SIGNAL_RULE_MAP[signalId];
  if (mapped) {
    return [{ dimension: mapped.dimension, operator: "eq", value: mapped.value }];
  }
  return [];
}