// src/routes/snapshots.ts
// Sec-44: operator-scoped audience-composition snapshots.
//
// Snapshots are named, dated freezes of a composition ({include, intersect,
// exclude, lookalike}) plus a caller-supplied note and optional tags. Each
// snapshot is stored under a KV key scoped to the operator who saved it, so
// a single demo deployment can host many operators without leakage.
//
// Endpoints (all auth-gated — operator_id is required):
//   POST /snapshots              — save a new snapshot
//   GET  /snapshots              — list snapshots for this operator
//   GET  /snapshots/:id          — fetch one snapshot
//   DELETE /snapshots/:id        — delete
//   POST /snapshots/diff         — diff two snapshots by id
//
// KV layout:
//   snap:index:<operator_id>          → JSON array of { id, name, saved_at, tags }
//   snap:body:<operator_id>:<id>      → full snapshot payload

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse, readJsonBody } from "./shared";
import { operatorIdFromRequest } from "../utils/operatorId";

const INDEX_PREFIX = "snap:index:";
const BODY_PREFIX  = "snap:body:";
const MAX_PER_OPERATOR = 50;

interface Composition {
  include?: string[];
  intersect?: string[];
  exclude?: string[];
  lookalike?: { seed_signal_id: string; k?: number; min_cosine?: number };
  // Sec-47: optional boolean expression AST for snapshots saved from the
  // Expression Tree Builder. Shape: { type:"signal"|"op", id, signal_id?,
  // op?, children? }. Stored as opaque JSON — backend doesn't interpret
  // on read/write, only the Expression tab does. Kept as `unknown` here
  // to avoid coupling the snapshot route to the audienceMath AST type.
  expression_ast?: unknown;
}

interface SnapshotBody {
  name?: string;
  note?: string;
  tags?: string[];
  composition?: Composition;
  reach_at_save?: number;     // optional — freeze the computed reach for audit
}

interface StoredSnapshot {
  id: string;
  operator_id: string;
  name: string;
  note: string;
  tags: string[];
  composition: Composition;
  reach_at_save: number;
  saved_at: string;          // ISO timestamp
}

interface IndexEntry {
  id: string;
  name: string;
  saved_at: string;
  tags: string[];
  reach_at_save: number;
}

function snapId(): string {
  return "snap_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
}

async function readIndex(env: Env, opId: string): Promise<IndexEntry[]> {
  const raw = await env.SIGNALS_CACHE.get(INDEX_PREFIX + opId);
  if (!raw) return [];
  try { return JSON.parse(raw) as IndexEntry[]; } catch { return []; }
}

async function writeIndex(env: Env, opId: string, index: IndexEntry[]): Promise<void> {
  await env.SIGNALS_CACHE.put(INDEX_PREFIX + opId, JSON.stringify(index));
}

function requireOperator(request: Request): Promise<string | null> {
  return operatorIdFromRequest(request);
}

// ── POST /snapshots ─────────────────────────────────────────────────────────

export async function handleSnapshotSave(request: Request, env: Env, logger: Logger): Promise<Response> {
  const opId = await requireOperator(request);
  if (!opId) return errorResponse("UNAUTHORIZED", "Bearer token required", 401);

  const parsed = await readJsonBody<SnapshotBody>(request);
  if (parsed.kind === "invalid") return errorResponse("INVALID_JSON", parsed.reason, 400);
  const body: SnapshotBody = parsed.kind === "parsed" ? parsed.data : {};
  if (!body.name || body.name.trim().length === 0) return errorResponse("INVALID_INPUT", "name required", 400);
  if (body.name.length > 80) return errorResponse("INVALID_INPUT", "name max 80 chars", 400);
  if (!body.composition) return errorResponse("INVALID_INPUT", "composition required", 400);

  const id = snapId();
  const snapshot: StoredSnapshot = {
    id,
    operator_id: opId,
    name: body.name.trim(),
    note: (body.note ?? "").slice(0, 500),
    tags: (body.tags ?? []).slice(0, 10).map((t) => String(t).slice(0, 32)),
    composition: {
      include:   body.composition.include ?? [],
      intersect: body.composition.intersect ?? [],
      exclude:   body.composition.exclude ?? [],
      ...(body.composition.lookalike ? { lookalike: body.composition.lookalike } : {}),
      // Sec-47: pass through the AST if the caller included one. Stored verbatim.
      ...(body.composition.expression_ast ? { expression_ast: body.composition.expression_ast } : {}),
    },
    reach_at_save: typeof body.reach_at_save === "number" ? body.reach_at_save : 0,
    saved_at: new Date().toISOString(),
  };

  const index = await readIndex(env, opId);
  if (index.length >= MAX_PER_OPERATOR) {
    return errorResponse("SNAPSHOT_LIMIT", `Max ${MAX_PER_OPERATOR} snapshots per operator. Delete some first.`, 409);
  }
  index.unshift({
    id, name: snapshot.name, saved_at: snapshot.saved_at,
    tags: snapshot.tags, reach_at_save: snapshot.reach_at_save,
  });
  await env.SIGNALS_CACHE.put(BODY_PREFIX + opId + ":" + id, JSON.stringify(snapshot));
  await writeIndex(env, opId, index);
  logger.info("snapshot_saved", { operator_id: opId, snapshot_id: id });
  return jsonResponse(snapshot, 201);
}

// ── GET /snapshots ──────────────────────────────────────────────────────────

export async function handleSnapshotList(request: Request, env: Env, _logger: Logger): Promise<Response> {
  const opId = await requireOperator(request);
  if (!opId) return errorResponse("UNAUTHORIZED", "Bearer token required", 401);
  const index = await readIndex(env, opId);
  return jsonResponse({
    operator_id: opId,
    count: index.length,
    max: MAX_PER_OPERATOR,
    snapshots: index,
  });
}

// ── GET /snapshots/:id ──────────────────────────────────────────────────────

export async function handleSnapshotGet(request: Request, env: Env, id: string, _logger: Logger): Promise<Response> {
  const opId = await requireOperator(request);
  if (!opId) return errorResponse("UNAUTHORIZED", "Bearer token required", 401);
  const raw = await env.SIGNALS_CACHE.get(BODY_PREFIX + opId + ":" + id);
  if (!raw) return errorResponse("NOT_FOUND", `Snapshot ${id} not found`, 404);
  try { return jsonResponse(JSON.parse(raw)); }
  catch { return errorResponse("CORRUPT", `Snapshot ${id} is unreadable`, 500); }
}

// ── DELETE /snapshots/:id ───────────────────────────────────────────────────

export async function handleSnapshotDelete(request: Request, env: Env, id: string, logger: Logger): Promise<Response> {
  const opId = await requireOperator(request);
  if (!opId) return errorResponse("UNAUTHORIZED", "Bearer token required", 401);
  await env.SIGNALS_CACHE.delete(BODY_PREFIX + opId + ":" + id);
  const index = await readIndex(env, opId);
  const next = index.filter((e) => e.id !== id);
  await writeIndex(env, opId, next);
  logger.info("snapshot_deleted", { operator_id: opId, snapshot_id: id });
  return jsonResponse({ deleted: id, remaining: next.length });
}

// ── POST /snapshots/diff ────────────────────────────────────────────────────

interface DiffBody {
  a?: string;   // snapshot id
  b?: string;   // snapshot id
}

export async function handleSnapshotDiff(request: Request, env: Env, _logger: Logger): Promise<Response> {
  const opId = await requireOperator(request);
  if (!opId) return errorResponse("UNAUTHORIZED", "Bearer token required", 401);
  const parsed = await readJsonBody<DiffBody>(request);
  if (parsed.kind === "invalid") return errorResponse("INVALID_JSON", parsed.reason, 400);
  const body: DiffBody = parsed.kind === "parsed" ? parsed.data : {};
  if (!body.a || !body.b) return errorResponse("INVALID_INPUT", "a + b snapshot ids required", 400);

  async function load(id: string): Promise<StoredSnapshot | null> {
    const raw = await env.SIGNALS_CACHE.get(BODY_PREFIX + opId + ":" + id);
    if (!raw) return null;
    try { return JSON.parse(raw) as StoredSnapshot; } catch { return null; }
  }
  const sa = await load(body.a);
  const sb = await load(body.b);
  if (!sa) return errorResponse("NOT_FOUND", `Snapshot ${body.a} not found`, 404);
  if (!sb) return errorResponse("NOT_FOUND", `Snapshot ${body.b} not found`, 404);

  function diffSets(a: string[], b: string[]): { added: string[]; removed: string[]; kept: string[] } {
    const sA = new Set(a), sB = new Set(b);
    return {
      added: b.filter((x) => !sA.has(x)),
      removed: a.filter((x) => !sB.has(x)),
      kept: a.filter((x) => sB.has(x)),
    };
  }

  return jsonResponse({
    a: { id: sa.id, name: sa.name, saved_at: sa.saved_at, reach_at_save: sa.reach_at_save },
    b: { id: sb.id, name: sb.name, saved_at: sb.saved_at, reach_at_save: sb.reach_at_save },
    delta_reach: sb.reach_at_save - sa.reach_at_save,
    include:   diffSets(sa.composition.include   ?? [], sb.composition.include   ?? []),
    intersect: diffSets(sa.composition.intersect ?? [], sb.composition.intersect ?? []),
    exclude:   diffSets(sa.composition.exclude   ?? [], sb.composition.exclude   ?? []),
    lookalike_changed: JSON.stringify(sa.composition.lookalike ?? null) !== JSON.stringify(sb.composition.lookalike ?? null),
  });
}
