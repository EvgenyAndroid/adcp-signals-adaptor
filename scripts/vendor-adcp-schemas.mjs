#!/usr/bin/env node
// scripts/vendor-adcp-schemas.mjs
//
// Vendors EVERY .json schema from the pinned AdCP spec release tarball
// into src/schemas/adcp/index.ts as a single TS module the worker can
// bundle without relying on @adcp/sdk's package.json exports map (which
// omits the schemas-data path) or matching the sdk's spec version.
//
// Source of truth: the AdCP GitHub releases page. Each release ships
// a `<version>.tgz` (signed with cosign) containing the canonical
// schemas/ tree. We pin a version constant below and download on
// demand; the tarball + extracted tree are gitignored so re-vendoring
// is reproducible from source.
//
// Auto-walks the schema tree — no manual SCHEMAS list to maintain.
// Adding a new tool to the recorder no longer requires editing this
// script; just add the tool's $id to SCHEMA_ID/SCHEMA_URL in
// src/domain/signalTrace.ts and the validator picks up the schema
// automatically (since it's already vendored as part of the corpus).
//
// Re-run after bumping ADCP_SPEC_VERSION:
//   node scripts/vendor-adcp-schemas.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, createWriteStream } from "node:fs";
import { join, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(__dirname);

// Pin to a published AdCP spec release. Bump this constant + re-run
// the script to refresh the vendored corpus.
const ADCP_SPEC_VERSION = "3.0.8";

const VENDOR_DIR = join(REPO_ROOT, "vendor", "adcp");
const TGZ_PATH = join(VENDOR_DIR, `${ADCP_SPEC_VERSION}.tgz`);
const SHA_PATH = join(VENDOR_DIR, `${ADCP_SPEC_VERSION}.tgz.sha256`);
const EXTRACTED_DIR = join(VENDOR_DIR, `adcp-${ADCP_SPEC_VERSION}`);
const SCHEMA_ROOT = join(EXTRACTED_DIR, "schemas");
const OUT_DIR = join(REPO_ROOT, "src", "schemas", "adcp");
const OUT_FILE = join(OUT_DIR, "index.ts");

const RELEASE_BASE = `https://github.com/adcontextprotocol/adcp/releases/download/v${ADCP_SPEC_VERSION}`;

function sh(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
}

function fetchTarball() {
  if (!existsSync(VENDOR_DIR)) mkdirSync(VENDOR_DIR, { recursive: true });
  if (existsSync(TGZ_PATH) && existsSync(SHA_PATH)) return;
  console.log(`[vendor-adcp-schemas] downloading ${ADCP_SPEC_VERSION}.tgz from ${RELEASE_BASE}`);
  sh(`curl -sL "${RELEASE_BASE}/${ADCP_SPEC_VERSION}.tgz" -o "${TGZ_PATH}"`);
  sh(`curl -sL "${RELEASE_BASE}/${ADCP_SPEC_VERSION}.tgz.sha256" -o "${SHA_PATH}"`);
}

function verifyTarball() {
  const want = readFileSync(SHA_PATH, "utf8").trim().split(/\s+/)[0].toLowerCase();
  const got = createHash("sha256").update(readFileSync(TGZ_PATH)).digest("hex");
  if (want !== got) {
    console.error(`[vendor-adcp-schemas] sha256 mismatch:\n  want ${want}\n  got  ${got}`);
    process.exit(1);
  }
  console.log(`[vendor-adcp-schemas] sha256 OK (${got.slice(0, 12)}…)`);
}

function extractTarball() {
  if (existsSync(SCHEMA_ROOT)) return;
  console.log(`[vendor-adcp-schemas] extracting ${TGZ_PATH} → ${VENDOR_DIR}`);
  sh(`tar xzf "${TGZ_PATH}" -C "${VENDOR_DIR}"`);
}

fetchTarball();
verifyTarball();
extractTarball();

if (!existsSync(SCHEMA_ROOT)) {
  console.error(`[vendor-adcp-schemas] schema root missing after extract: ${SCHEMA_ROOT}`);
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
      // Boundary characters: hyphen (kebab-case) and dot (e.g.
      // `manifest.schema.json` → `manifestSchema` — required because
      // 3.0.6 introduced `manifest.schema.json` at the schemas root).
      return safe
        .split(/[-.]/)
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
// Source: vendor/adcp/adcp-${ADCP_SPEC_VERSION}/schemas/
// (downloaded from https://github.com/adcontextprotocol/adcp/releases/tag/v${ADCP_SPEC_VERSION})
// Regenerate with: node scripts/vendor-adcp-schemas.mjs
//
// This module vendors EVERY AdCP ${ADCP_SPEC_VERSION} JSON schema as TypeScript
// constants so the worker can bundle them without relying on
// @adcp/sdk's package.json exports map. The trace recorder uses
// loadAdcpCorpus() to seed @cfworker/json-schema's $ref resolver.
//
// Auto-walks the schema tree; new schemas vendored on next regenerate
// without touching this script. To bump the spec version, edit
// ADCP_SPEC_VERSION in scripts/vendor-adcp-schemas.mjs and re-run.

export const ADCP_SPEC_VERSION = ${JSON.stringify(ADCP_SPEC_VERSION)};

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
