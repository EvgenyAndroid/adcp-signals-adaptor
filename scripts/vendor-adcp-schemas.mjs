#!/usr/bin/env node
// scripts/vendor-adcp-schemas.mjs
//
// Vendors the AdCP Signals schemas from node_modules/@adcp/sdk into
// src/schemas/adcp/ as a single TS module that the worker can import
// directly. @adcp/sdk's package.json `exports` field doesn't expose
// the schemas-data path, so we can't `import x from "@adcp/sdk/.../foo.json"`
// at TypeScript compile-time.
//
// Re-run whenever @adcp/sdk bumps and we want a refreshed schema corpus:
//   node scripts/vendor-adcp-schemas.mjs
//
// Output: src/schemas/adcp/index.ts — TS module exporting every
// schema we use as a typed const + a loadAdcpCorpus() helper.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);
const SCHEMA_ROOT = join(REPO_ROOT, "node_modules", "@adcp", "sdk", "dist", "lib", "schemas-data", "3.0");
const OUT_DIR = join(REPO_ROOT, "src", "schemas", "adcp");
const OUT_FILE = join(OUT_DIR, "index.ts");

// The schemas we need for signal trace validation. Order matches the
// imports in src/domain/signalTrace.ts. New refs introduced by spec
// updates would surface as "missing_schema" warnings in the validator
// and prompt a re-run of this script.
const SCHEMAS = [
  // Request/response schemas we validate against
  { id: "getSignalsReq",       path: "signals/get-signals-request.json" },
  { id: "getSignalsRes",       path: "signals/get-signals-response.json" },
  { id: "activateReq",         path: "signals/activate-signal-request.json" },
  { id: "activateRes",         path: "signals/activate-signal-response.json" },
  // Cross-file $refs
  { id: "signalId",            path: "core/signal-id.json" },
  { id: "deployment",          path: "core/deployment.json" },
  { id: "destination",         path: "core/destination.json" },
  { id: "accountRef",          path: "core/account-ref.json" },
  { id: "context",             path: "core/context.json" },
  { id: "ext",                 path: "core/ext.json" },
  { id: "error",               path: "core/error.json" },
  { id: "paginationReq",       path: "core/pagination-request.json" },
  { id: "paginationRes",       path: "core/pagination-response.json" },
  { id: "signalFilters",       path: "core/signal-filters.json" },
  { id: "vendorPricingOption", path: "core/vendor-pricing-option.json" },
  { id: "activationKey",       path: "core/activation-key.json" },
  { id: "signalValueType",     path: "enums/signal-value-type.json" },
  { id: "signalCatalogType",   path: "enums/signal-catalog-type.json" },
  { id: "taskStatus",          path: "enums/task-status.json" },
  // Brand-related $refs that signal-filters or sales schemas pull in
  { id: "brandId",             path: "core/brand-id.json" },
  { id: "brandRef",            path: "core/brand-ref.json" },
];

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const blocks = [];
const exports = [];
const seenIds = new Set();

for (const s of SCHEMAS) {
  const fullPath = join(SCHEMA_ROOT, s.path);
  if (!existsSync(fullPath)) {
    console.warn(`[vendor-adcp-schemas] missing: ${s.path} — skipped`);
    continue;
  }
  const raw = readFileSync(fullPath, "utf8");
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { console.warn(`[vendor-adcp-schemas] parse error: ${s.path}`); continue; }
  if (parsed.$id && seenIds.has(parsed.$id)) {
    // Some schemas may share $ids (rare); skip duplicates.
    console.warn(`[vendor-adcp-schemas] duplicate $id: ${parsed.$id} — skipping ${s.path}`);
    continue;
  }
  if (parsed.$id) seenIds.add(parsed.$id);
  const literal = JSON.stringify(parsed, null, 2);
  blocks.push(`export const ${s.id} = ${literal} as const;\n`);
  exports.push(s.id);
}

const header = `// AUTO-GENERATED — do not edit by hand.
// Source: node_modules/@adcp/sdk/dist/lib/schemas-data/3.0/
// Regenerate with: node scripts/vendor-adcp-schemas.mjs
//
// This module vendors AdCP signal-protocol JSON schemas as TypeScript
// constants so the worker can bundle them without relying on
// @adcp/sdk's package.json exports map (which omits the schemas-data
// path). Used by src/domain/signalTrace.ts for AJV-based runtime
// validation of get_signals + activate_signal request/response payloads.

`;

const corpus = `
export function loadAdcpCorpus(): Array<{ $id?: string; [k: string]: unknown }> {
  return [
    ${exports.join(", ")}
  ] as Array<{ $id?: string; [k: string]: unknown }>;
}
`;

writeFileSync(OUT_FILE, header + blocks.join("\n") + corpus, "utf8");
console.log(`[vendor-adcp-schemas] wrote ${OUT_FILE} with ${exports.length} schemas`);
