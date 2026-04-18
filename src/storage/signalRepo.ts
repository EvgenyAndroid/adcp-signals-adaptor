// src/storage/signalRepo.ts

import type { CanonicalSignal } from "../types/signal";
import type { SearchSignalsRequest } from "../types/api";
import { queryAll, queryFirst, execute, executeBatch, type DB } from "./db";

// ── DB row shape ───────────────────────────────────────────────────────────────

interface SignalRow {
  signal_id: string;
  external_taxonomy_id: string | null;
  taxonomy_system: string;
  name: string;
  description: string;
  category_type: string;
  parent_signal_id: string | null;
  source_systems: string;
  destinations: string;
  activation_supported: number;
  estimated_audience_size: number | null;
  geography: string | null;
  pricing: string | null;
  freshness: string | null;
  access_policy: string;
  generation_mode: string;
  status: string;
  raw_source_refs: string | null;
  created_at: string;
  updated_at: string;
}

interface RuleRow {
  signal_id: string;
  dimension: string;
  operator: string;
  value: string;
  weight: number | null;
}

// ── Serialization ──────────────────────────────────────────────────────────────

/**
 * Parse a JSON column safely — a single corrupted row should not 500 the
 * whole list endpoint. Returns the fallback if the value is unparseable.
 */
function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToSignal(row: SignalRow, rules: RuleRow[] = []): CanonicalSignal {
  return {
    signalId: row.signal_id,
    ...(row.external_taxonomy_id ? { externalTaxonomyId: row.external_taxonomy_id } : {}),
    taxonomySystem: "iab_audience_1_1",
    name: row.name,
    description: row.description,
    categoryType: row.category_type as CanonicalSignal["categoryType"],
    ...(row.parent_signal_id ? { parentSignalId: row.parent_signal_id } : {}),
    sourceSystems: safeJsonParse<string[]>(row.source_systems, []),
    destinations: safeJsonParse<string[]>(row.destinations, []),
    activationSupported: row.activation_supported === 1,
    ...(row.estimated_audience_size !== null
      ? { estimatedAudienceSize: row.estimated_audience_size }
      : {}),
    ...(row.geography ? { geography: safeJsonParse<string[]>(row.geography, []) } : {}),
    ...(row.pricing
      ? { pricing: safeJsonParse<CanonicalSignal["pricing"]>(row.pricing, undefined as CanonicalSignal["pricing"]) }
      : {}),
    ...(row.freshness ? { freshness: row.freshness } : {}),
    accessPolicy: row.access_policy as CanonicalSignal["accessPolicy"],
    generationMode: row.generation_mode as CanonicalSignal["generationMode"],
    status: row.status as CanonicalSignal["status"],
    ...(row.raw_source_refs
      ? { rawSourceRefs: safeJsonParse<string[]>(row.raw_source_refs, []) }
      : {}),
    ...(rules.length > 0
      ? {
          rules: rules.map((r) => ({
            dimension: r.dimension as CanonicalSignal["rules"] extends Array<infer R>
              ? R["dimension"]
              : never,
            operator: r.operator as CanonicalSignal["rules"] extends Array<infer R>
              ? R["operator"]
              : never,
            value: safeJsonParse<string | number | string[]>(r.value, r.value as string),
            ...(r.weight !== null ? { weight: r.weight } : {}),
          })),
        }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────────

export async function findSignalById(
  db: DB,
  signalId: string
): Promise<CanonicalSignal | null> {
  const row = await queryFirst<SignalRow>(
    db,
    "SELECT * FROM signals WHERE signal_id = ?",
    [signalId]
  );
  if (!row) return null;

  const rules = await queryAll<RuleRow>(
    db,
    "SELECT * FROM signal_rules WHERE signal_id = ?",
    [signalId]
  );
  return rowToSignal(row, rules);
}

export interface SearchOptions {
  query?: string;
  categoryType?: string;
  generationMode?: string;
  taxonomyId?: string;
  destination?: string;
  activationSupported?: boolean;
  limit: number;
  offset: number;
}

export async function searchSignals(
  db: DB,
  opts: SearchOptions
): Promise<{ signals: CanonicalSignal[]; totalCount: number }> {
  const conditions: string[] = ["s.status = 'available'"];
  const params: unknown[] = [];

  if (opts.query) {
    conditions.push("(s.name LIKE ? OR s.description LIKE ?)");
    params.push(`%${opts.query}%`, `%${opts.query}%`);
  }
  if (opts.categoryType) {
    conditions.push("s.category_type = ?");
    params.push(opts.categoryType);
  }
  if (opts.generationMode) {
    conditions.push("s.generation_mode = ?");
    params.push(opts.generationMode);
  }
  if (opts.taxonomyId) {
    conditions.push("s.external_taxonomy_id = ?");
    params.push(opts.taxonomyId);
  }
  if (opts.activationSupported !== undefined) {
    conditions.push("s.activation_supported = ?");
    params.push(opts.activationSupported ? 1 : 0);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count query
  const countRow = await queryFirst<{ total: number }>(
    db,
    `SELECT COUNT(*) as total FROM signals s ${where}`,
    params
  );
  const totalCount = countRow?.total ?? 0;

  // Data query - destination filtering done in-memory (JSON column)
  const rows = await queryAll<SignalRow>(
    db,
    `SELECT s.* FROM signals s ${where} ORDER BY s.name ASC LIMIT ? OFFSET ?`,
    [...params, opts.limit, opts.offset]
  );

  let signals = rows.map((r) => rowToSignal(r));

  // Post-filter by destination
  if (opts.destination) {
    signals = signals.filter((s) => s.destinations.includes(opts.destination!));
  }

  return { signals, totalCount };
}

export async function upsertSignal(db: DB, signal: CanonicalSignal): Promise<void> {
  const now = new Date().toISOString();

  await execute(
    db,
    `INSERT INTO signals (
      signal_id, external_taxonomy_id, taxonomy_system, name, description,
      category_type, parent_signal_id, source_systems, destinations,
      activation_supported, estimated_audience_size, geography, pricing,
      freshness, access_policy, generation_mode, status, raw_source_refs,
      created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(signal_id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      estimated_audience_size = excluded.estimated_audience_size,
      status = excluded.status,
      updated_at = excluded.updated_at`,
    [
      signal.signalId,
      signal.externalTaxonomyId ?? null,
      signal.taxonomySystem,
      signal.name,
      signal.description,
      signal.categoryType,
      signal.parentSignalId ?? null,
      JSON.stringify(signal.sourceSystems),
      JSON.stringify(signal.destinations),
      signal.activationSupported ? 1 : 0,
      signal.estimatedAudienceSize ?? null,
      signal.geography ? JSON.stringify(signal.geography) : null,
      signal.pricing ? JSON.stringify(signal.pricing) : null,
      signal.freshness ?? null,
      signal.accessPolicy,
      signal.generationMode,
      signal.status,
      signal.rawSourceRefs ? JSON.stringify(signal.rawSourceRefs) : null,
      signal.createdAt,
      now,
    ]
  );

  // Upsert rules
  if (signal.rules && signal.rules.length > 0) {
    await execute(db, "DELETE FROM signal_rules WHERE signal_id = ?", [signal.signalId]);
    const ruleStmts = signal.rules.map((r) => ({
      sql: "INSERT INTO signal_rules (signal_id, dimension, operator, value, weight) VALUES (?,?,?,?,?)",
      params: [signal.signalId, r.dimension, r.operator, JSON.stringify(r.value), r.weight ?? null],
    }));
    await executeBatch(db, ruleStmts);
  }
}

export async function countSignals(db: DB): Promise<number> {
  const row = await queryFirst<{ total: number }>(db, "SELECT COUNT(*) as total FROM signals");
  return row?.total ?? 0;
}
