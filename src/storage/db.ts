// src/storage/db.ts
// Thin D1 wrapper with typed query helpers

import type { Env } from "../types/env";

export type DB = D1Database;

export function getDb(env: Env): DB {
  return env.DB;
}

// The T constraint below is `object` rather than `Record<string, unknown>`
// so callers can pass interface row shapes (JobRow, SignalRow, RuleRow) —
// TypeScript interfaces don't satisfy a `Record<string, unknown>` constraint
// because they lack an index signature. D1's `.all<T>()` / `.first<T>()`
// accept any object type, so the constraint wasn't providing extra safety.

/**
 * Run a query and return all rows typed.
 */
export async function queryAll<T extends object>(
  db: DB,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const stmt = db.prepare(sql).bind(...params);
  const result = await stmt.all<T>();
  return result.results;
}

/**
 * Run a query and return the first row or null.
 */
export async function queryFirst<T extends object>(
  db: DB,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const stmt = db.prepare(sql).bind(...params);
  return stmt.first<T>();
}

/**
 * Execute a write statement and return meta.
 */
export async function execute(
  db: DB,
  sql: string,
  params: unknown[] = []
): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run();
}

/**
 * Execute multiple statements in a batch.
 */
export async function executeBatch(
  db: DB,
  statements: { sql: string; params?: unknown[] }[]
): Promise<D1Result[]> {
  const prepared = statements.map(({ sql, params = [] }) =>
    db.prepare(sql).bind(...params)
  );
  return db.batch(prepared);
}
