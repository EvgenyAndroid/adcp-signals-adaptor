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
import { operationId } from "../utils/ids";

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

  return {
    signals: toSignalSummaries(signals),
    count: signals.length,
    totalCount,
    offset,
    hasMore: offset + signals.length < totalCount,
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
  // Map request rules to resolved rules (basic type coercion)
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

  // Persist the dynamic signal for later retrieval
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
