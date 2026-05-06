#!/usr/bin/env node
// scripts/vendor-adcp-schemas.mjs
//
// Vendors EVERY .json schema from node_modules/@adcp/sdk/dist/lib/
// schemas-data/3.0/ into src/schemas/adcp/index.ts as a single TS module
// the worker can bundle without relying on @adcp/sdk's package.json
// exports map (which omits the schemas-data path).
//
// Auto-walks the directory tree — no manual SCHEMAS list to maintain.
// Adding a new tool to the recorder no longer requires editing this
// script; just add the tool's $id to SCHEMA_ID/SCHEMA_URL in
// src/domain/signalTrace.ts and the validator picks up the schema
// automatically (since it's already vendored as part of the corpus).
//
// Re-run whenever @adcp/sdk bumps and we want a refreshed corpus:
//   node scripts/vendor-adcp-schemas.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);
const SCHEMA_ROOT = join(REPO_ROOT, "node_modules", "@adcp", "sdk", "dist", "lib", "schemas-data", "3.0");
const OUT_DIR = join(REPO_ROOT, "src", "schemas", "adcp");
const OUT_FILE = join(OUT_DIR, "index.ts");

if (!existsSync(SCHEMA_ROOT)) {
  console.error(`[vendor-adcp-schemas] schema root missing: ${SCHEMA_ROOT}`);
  process.exit(1);
}
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Recursively collect every .json file under SCHEMA_ROOT.
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (st.isFile() && name.endsWith(".json")) out.push(full);
  }
  return out;
}

// Skip "bundled" copies and any other meta files — bundled schemas
// inline their refs and would create duplicate $id collisions with the
// non-bundled originals. We want the source-of-truth flat schemas.
function shouldSkip(relPath) {
  if (relPath.startsWith("bundled/")) return true;  // pre-bundled copies
  if (relPath === "index.json") return true;        // manifest, not a schema
  return false;
}

// Generate a stable, unique JS identifier from the relative file path.
// e.g. "core/format-id.json" -> "core_formatId"
//      "creative/list-creative-formats-request.json" -> "creative_listCreativeFormatsRequest"
//      "enums/wcag-level.json" -> "enums_wcagLevel"
//
// "package" is a reserved word in ESM; the path-prefix scheme avoids
// the collision (we get "core_packageSchema" -> oh wait it's just
// "core_package" which IS still reserved). Special-case the rename
// at the leaf level.
function toIdentifier(relPath) {
  const noExt = relPath.replace(/\.json$/, "");
  // Reserved-word safety: rename leaf "package" specifically (only
  // place it occurs in the corpus). All other path-segments are safe
  // ECMAScript identifiers after camelCase.
  return noExt
    .split(/[/\\]/)
    .map((seg, i) => {
      const safe = seg === "package" ? "packageSchema" : seg;
      // First segment stays lowercase, subsequent segments camelCase.
      // Hyphens become camel boundaries.
      return safe
        .split("-")
        .map((part, j) => (i === 0 && j === 0) ? part : (part.charAt(0).toUpperCase() + part.slice(1)))
        .join("");
    })
    .join("_");
}

const files = walk(SCHEMA_ROOT);
const blocks = [];
const exports = [];
const seenIds = new Set();
const seenIdents = new Set();
let skipped = 0;
let errored = 0;

for (const fullPath of files) {
  const rel = relative(SCHEMA_ROOT, fullPath).split("\\").join("/");
  if (shouldSkip(rel)) { skipped++; continue; }
  let raw, parsed;
  try {
    raw = readFileSync(fullPath, "utf8");
    parsed = JSON.parse(raw);
  } catch (_) {
    console.warn(`[vendor-adcp-schemas] parse error: ${rel}`);
    errored++;
    continue;
  }
  if (parsed.$id && seenIds.has(parsed.$id)) {
    // Two files with the same $id — keep the first, skip the rest.
    skipped++;
    continue;
  }
  let ident = toIdentifier(rel);
  // Guarantee uniqueness even if two paths collapse to the same ident
  // (shouldn't happen for AdCP's flat schema naming, but defensive).
  let suffix = 1;
  const baseIdent = ident;
  while (seenIdents.has(ident)) {
    suffix++;
    ident = `${baseIdent}_${suffix}`;
  }
  seenIdents.add(ident);
  if (parsed.$id) seenIds.add(parsed.$id);
  const literal = JSON.stringify(parsed, null, 2);
  blocks.push(`export const ${ident} = ${literal} as const;\n`);
  exports.push(ident);
}

const header = `// AUTO-GENERATED — do not edit by hand.
// Source: node_modules/@adcp/sdk/dist/lib/schemas-data/3.0/
// Regenerate with: node scripts/vendor-adcp-schemas.mjs
//
// This module vendors EVERY AdCP 3.0.1 JSON schema as TypeScript
// constants so the worker can bundle them without relying on
// @adcp/sdk's package.json exports map. The trace recorder uses
// loadAdcpCorpus() to seed @cfworker/json-schema's $ref resolver.
//
// Auto-walks the schema-data tree; new schemas vendored on next
// regenerate without touching this script.

`;

const corpus = `
export function loadAdcpCorpus(): Array<{ $id?: string; [k: string]: unknown }> {
  return [
    ${exports.join(", ")}
  ] as Array<{ $id?: string; [k: string]: unknown }>;
}
`;

writeFileSync(OUT_FILE, header + blocks.join("\n") + corpus, "utf8");
console.log(`[vendor-adcp-schemas] wrote ${OUT_FILE} with ${exports.length} schemas (skipped ${skipped}, errored ${errored})`);
