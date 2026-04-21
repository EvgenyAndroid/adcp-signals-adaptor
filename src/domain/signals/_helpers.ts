// src/domain/signals/_helpers.ts
// Shared constructors for per-vertical signal files. Same semantics as the
// helpers originally defined inline in signalModel.ts — extracted so each
// vertical can be its own file without duplicating the shape.

import type { CanonicalSignal } from "../../types/signal";
import { signalIdFromSlug } from "../../utils/ids";
import { compactObj } from "../../utils/objects";

export const NOW = "2026-04-21T00:00:00Z";
export const DEFAULT_DESTINATIONS = ["mock_dsp", "mock_cleanroom", "mock_cdp", "mock_measurement"];

// Source-system tags double as a vertical label — buyers inspecting the
// agent's `sourceSystems` on a signal can tell which marketplace vertical
// it came from without us adding a non-conformant top-level field.
export function sources(vertical: string): string[] {
  return ["marketplace:" + vertical, "iab_taxonomy_loader"];
}

// Pricing ladder calibrated to realistic DSP marketplace CPMs (USD):
//   broad demographic         $2–3
//   interest / affinity       $3–5
//   media / device            $3–5
//   life-event                $4–6
//   behavioral / in-market    $5–8
//   purchase / transactional  $6–10
//   B2B / firmographic        $8–14
//   financial / health        $8–12
//   automotive intenders      $7–11
//   composite / custom        $5–12 (varies with specificity)
export function cpm(value: number): CanonicalSignal["pricing"] {
  return { model: "mock_cpm", value, currency: "USD" };
}

type SeededOpts = Partial<CanonicalSignal> & { vertical?: string };

export function make(
  slug: string,
  name: string,
  description: string,
  categoryType: CanonicalSignal["categoryType"],
  estimatedSize: number,
  pricing: CanonicalSignal["pricing"],
  vertical: string,
  opts: SeededOpts = {},
): CanonicalSignal {
  const base: CanonicalSignal = {
    signalId: signalIdFromSlug(slug),
    taxonomySystem: "iab_audience_1_1",
    name,
    description,
    categoryType,
    sourceSystems: sources(vertical),
    destinations: DEFAULT_DESTINATIONS,
    activationSupported: true,
    estimatedAudienceSize: estimatedSize,
    accessPolicy: "public_demo",
    generationMode: "seeded",
    status: "available",
    freshness: "30d",
    ...(pricing ? { pricing } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  };
  // `vertical` is a display hint only — strip before merging so it doesn't
  // leak into the CanonicalSignal shape.
  const { vertical: _v, ...rest } = opts;
  return { ...base, ...compactObj(rest as Record<string, unknown>) };
}
