// src/domain/seedPipeline.ts
// One-shot seeding pipeline: loads datasets, builds canonical signals, writes to D1.
// Safe to run multiple times (upsert semantics).

import type { DB } from "../storage/db";
import { upsertSignal, countSignals } from "../storage/signalRepo";
import { SEEDED_SIGNALS, DERIVED_SIGNALS } from "./signalModel";
import { ALL_ENRICHED_SIGNALS } from "./enrichedSignalModel";
import { EXTENDED_VERTICAL_SIGNALS } from "./signals";
import { execute } from "../storage/db";
import type { IabTaxonomyNode } from "../types/signal";
import { parseTaxonomyTsv } from "../connectors/iabTaxonomyLoader";
import type { Logger } from "../utils/logger";

// Bundled seed files - in Workers these are imported as text via wrangler assets
// For runtime use, pass them in as strings from the Worker entrypoint
export interface SeedAssets {
  taxonomyTsv: string;
  demographicsCsv?: string;
  interestsCsv?: string;
  geoCsv?: string;
}

export async function runSeedPipeline(
  db: DB,
  assets: SeedAssets,
  logger: Logger,
  force = false
): Promise<{ seeded: number; skipped: boolean }> {
  const existing = await countSignals(db);

  if (existing > 0 && !force) {
    logger.info("seed_skipped", { reason: "signals_already_present", count: existing });
    return { seeded: existing, skipped: true };
  }

  logger.info("seed_start");

  // 1. Load taxonomy into DB
  let taxonomyCount = 0;
  try {
    const index = parseTaxonomyTsv(assets.taxonomyTsv);
    for (const [, node] of index.byId) {
      await upsertTaxonomyNode(db, node);
      taxonomyCount++;
    }
    logger.info("taxonomy_loaded", { count: taxonomyCount });
  } catch (err) {
    logger.error("taxonomy_load_failed", { error: String(err) });
  }

  // 2. Insert all seeded signals
  let count = 0;
  for (const signal of SEEDED_SIGNALS) {
    await upsertSignal(db, signal);
    count++;
  }
  logger.info("seeded_signals_loaded", { count });

  // 3. Insert all derived signals
  for (const signal of DERIVED_SIGNALS) {
    await upsertSignal(db, signal);
    count++;
  }
  logger.info("derived_signals_loaded", { count: DERIVED_SIGNALS.length });

  // 4. Insert enriched signals (Census ACS, Nielsen DMA, cross-taxonomy)
  for (const signal of ALL_ENRICHED_SIGNALS) {
    await upsertSignal(db, signal);
    count++;
  }
  logger.info("enriched_signals_loaded", { count: ALL_ENRICHED_SIGNALS.length });

  // 5. Insert extended vertical signals — 15 verticals × 20 signals each.
  //    Automotive, Financial, Health, B2B, Life Events, Behavioral, Intent,
  //    Transactional, Media, Retail, Seasonal, Psychographic, plus extension
  //    files covering Interest / Demographic / Geographic gaps.
  for (const signal of EXTENDED_VERTICAL_SIGNALS) {
    await upsertSignal(db, signal);
    count++;
  }
  logger.info("extended_vertical_signals_loaded", { count: EXTENDED_VERTICAL_SIGNALS.length });

  logger.info("seed_complete", { total: count });

  return { seeded: count, skipped: false };
}

async function upsertTaxonomyNode(db: DB, node: IabTaxonomyNode): Promise<void> {
  await execute(
    db,
    `INSERT INTO taxonomy_nodes (unique_id, parent_id, name, tier1, tier2, tier3, extension)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(unique_id) DO UPDATE SET
       name = excluded.name,
       tier1 = excluded.tier1,
       tier2 = excluded.tier2,
       tier3 = excluded.tier3`,
    [
      node.uniqueId,
      node.parentId ?? null,
      node.name,
      node.tier1 ?? null,
      node.tier2 ?? null,
      node.tier3 ?? null,
      node.extension ? 1 : 0,
    ]
  );
}
