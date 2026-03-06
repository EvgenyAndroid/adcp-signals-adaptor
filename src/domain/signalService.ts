// src/domain/signalService.ts

import type { CanonicalSignal } from "../types/signal";
import type {
  SearchSignalsRequest,
  SearchSignalsResponse,
  GenerateSignalRequest,
  GenerateSignalResponse,
} from "../types/api";
import type { DB } from "../storage/db";
import { searchSignals, findSignalById, upsertSignal } from "../storage/signalRepo";
import { toSignalSummary, toSignalSummaries } from "../mappers/signalMapper";
import { validateRules, generateSegment } from "./ruleEngine";
import type { ResolvedRule } from "../types/rule";
import type { RuleDimension, RuleOperator } from "../types/signal";
import { requestId } from "../utils/ids";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

  // Filter deployments by requested destinations array (spec: [{type, platform}])
  if (req.destinations && req.destinations.length > 0) {
    const requestedPlatforms = req.destinations
      .filter((d) => d.type === "platform" && d.platform)
      .map((d) => d.platform as string);
    // Only filter if platform destinations specified; agent-type = return all
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

  const filterDesc = req.query
    ? `matching "${req.query}"`
    : req.categoryType
    ? `in category "${req.categoryType}"`
    : "from catalog";

  return {
    message: `Found ${summaries.length} signal(s) ${filterDesc}. Review pricing and deployment status before activating.`,
    context_id: requestId(),
    signals: summaries,
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

export async function generateSignalService(
  db: DB,
  req: GenerateSignalRequest
): Promise<GenerateSignalResponse> {
  const resolvedRules: ResolvedRule[] = req.rules.map((r) => ({
    dimension: r.dimension as RuleDimension,
    operator: r.operator as RuleOperator,
    value: r.value,
  }));

  const validation = validateRules(resolvedRules);
  if (!validation.valid) {
    throw new Error(`Rule validation failed: ${validation.errors.join("; ")}`);
  }

  const result = generateSegment(resolvedRules, req.name);

  const now = new Date().toISOString();

  const signal: CanonicalSignal = {
    signalId: result.signalId,
    taxonomySystem: "iab_audience_1_1",
    name: result.name,
    description: result.description,
    categoryType: result.categoryType as CanonicalSignal["categoryType"],
    ...(result.taxonomyMatches[0]
      ? { externalTaxonomyId: result.taxonomyMatches[0] }
      : {}),
    sourceSystems: ["rule_engine"],
    destinations: ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"],
    activationSupported: true,
    estimatedAudienceSize: result.estimatedAudienceSize,
    accessPolicy: "public_demo",
    generationMode: "dynamic",
    status: "available",
    pricing: { model: "mock_cpm", value: 4.0, currency: "USD" },
    rules: resolvedRules,
    createdAt: now,
    updatedAt: now,
  };

  await upsertSignal(db, signal);

  return {
    signal: toSignalSummary(signal),
    generationNotes: result.generationNotes,
    ruleCount: resolvedRules.length,
  };
}
