// src/domain/signalService.ts

import type { CanonicalSignal } from "../types/signal";
import type {
  SearchSignalsRequest,
  SearchSignalsResponse,
  CustomSignalProposal,
} from "../types/api";
import type { DB } from "../storage/db";
import { searchSignals, findSignalById, upsertSignal } from "../storage/signalRepo";
import { toSignalSummary, toSignalSummaries } from "../mappers/signalMapper";
import { validateRules, generateSegment } from "./ruleEngine";
import { estimateAudienceSize } from "../utils/estimation";
import { dynamicSignalId } from "../utils/ids";
import { requestId } from "../utils/ids";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const TOTAL_ADDRESSABLE = 240_000_000;
const DATA_PROVIDER = "AdCP Signals Adaptor - Demo Provider (Evgeny)";

export async function searchSignalsService(
  db: DB,
  req: SearchSignalsRequest
): Promise<SearchSignalsResponse> {
  const limit = Math.min(req.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = req.offset ?? 0;

  const { signals, totalCount } = await searchSignals(db, {
    query: req.query,
    categoryType: req.categoryType,
    generationMode: req.generationMode,
    taxonomyId: req.taxonomyId,
    destination: req.destination,
    activationSupported: req.activationSupported,
    limit,
    offset,
  });

  let summaries = toSignalSummaries(signals);

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

  // Generate proposals from natural language brief and persist them to D1
  // so activate_signal can find them by ID
  let proposals: CustomSignalProposal[] | undefined;
  if (req.brief) {
    const generated = generateProposalsFromBrief(req.brief);
    if (generated.length > 0) {
      const now = new Date().toISOString();
      for (const proposal of generated) {
        const canonical: CanonicalSignal = {
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
        await upsertSignal(db, canonical);
      }
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
        cpm: 4.0,
        currency: "USD",
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