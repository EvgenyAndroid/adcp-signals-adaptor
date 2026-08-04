// src/connectors/synapticLoader.ts
// Federates the nofluffadvisory.com publisher's synaptic audience catalog
// (sell.nofluffadvisory.com/synaptic/catalog) into this agent's signal
// catalog as sig_syn_* signals — the publisher-side counterpart described in
// nofluffadvisory's docs/adcp-publisher-stack/PLAN.md §2.1C. Buyers then
// discover session-scoped, cookieless publisher audiences through the same
// get_signals / query_signals_nl surface as every other signal.
//
// Signal ids are kept IDENTICAL to the publisher's segment_ids so a buyer
// can activate against either agent without an id-mapping table.
//
// DTS posture (via signalMapper inference on sourceSystems 'synaptic'):
// data_sources ["Web Usage"], methodology "Derived" (generationMode), refresh
// "Daily" (the publisher's avails cron cadence; the underlying membership is
// session-scoped/real-time, which DTS v1.2 cannot express — see the
// publisher catalog's session-precision proposal).

import type { CanonicalSignal } from "../types/signal";

export const SYNAPTIC_SOURCE_SYSTEM = "nofluffadvisory_synaptic";
export const DEFAULT_SYNAPTIC_CATALOG_URL =
  "https://sell.nofluffadvisory.com/synaptic/catalog";

export interface SynapticCatalogSegment {
  segment_id: string;
  name: string;
  audience: string;
  member_slugs: string[];
  member_count: number;
  est_monthly_impressions: number;
  measured_28d_impressions: number;
}

export interface SynapticCatalog {
  catalog_version: string;
  definition: string;
  avails_basis: string;
  segments: SynapticCatalogSegment[];
}

/** Shape-validate a fetched catalog. Throws with a precise reason. */
export function validateSynapticCatalog(data: unknown): SynapticCatalog {
  const cat = data as SynapticCatalog;
  if (!cat || typeof cat !== "object") throw new Error("catalog is not an object");
  if (!Array.isArray(cat.segments) || cat.segments.length === 0) {
    throw new Error("catalog.segments missing or empty");
  }
  for (const s of cat.segments) {
    if (!/^syn_[a-z0-9_]+$/.test(s.segment_id ?? "")) {
      throw new Error(`invalid segment_id: ${String(s.segment_id)}`);
    }
    if (typeof s.name !== "string" || typeof s.audience !== "string") {
      throw new Error(`segment ${s.segment_id}: name/audience missing`);
    }
    if (!Array.isArray(s.member_slugs) || s.member_slugs.length === 0) {
      throw new Error(`segment ${s.segment_id}: empty member_slugs`);
    }
  }
  return cat;
}

/** Map catalog segments → canonical signals (pure; timestamps injected). */
export function buildSynapticSignals(
  cat: SynapticCatalog,
  nowIso: string
): CanonicalSignal[] {
  return cat.segments.map((s) => ({
    // Same id namespace as the publisher — sig_ prefix is this agent's
    // convention, but syn_* already reads as a signal id; keep it verbatim.
    signalId: s.segment_id,
    taxonomySystem: "iab_audience_1_1",
    name: `Synaptic: ${s.name}`,
    description:
      `${s.audience} Session-scoped, cookieless publisher audience on ` +
      `nofluffadvisory.com (${s.member_count} essays; ` +
      `~${s.est_monthly_impressions} est impressions/mo` +
      (s.measured_28d_impressions
        ? `, ${s.measured_28d_impressions} measured trailing 28d`
        : "") +
      `). Federated from ${SYNAPTIC_SOURCE_SYSTEM}.`,
    categoryType: "composite",
    sourceSystems: [SYNAPTIC_SOURCE_SYSTEM],
    destinations: ["nofluffadvisory_ad_server"],
    activationSupported: false, // activation happens publisher-side at serve time
    estimatedAudienceSize: s.est_monthly_impressions,
    geography: ["US"],
    freshness: "daily",
    accessPolicy: "public_demo",
    generationMode: "derived",
    status: "available",
    rawSourceRefs: s.member_slugs.slice(0, 20),
    createdAt: nowIso,
    updatedAt: nowIso,
  }));
}

/** Fetch + validate the live catalog. */
export async function fetchSynapticCatalog(url: string): Promise<SynapticCatalog> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`synaptic catalog fetch ${res.status} from ${url}`);
  return validateSynapticCatalog(await res.json());
}
