// src/connectors/taxonomyBridgeLoader.ts
// Maps IAB Audience Taxonomy 1.1 nodes to IAB Content Taxonomy 3.0 nodes.
// Enables cross-taxonomy signal discovery: "find content signals that match this audience segment".
// Bridge methodology: semantic overlap based on IAB's published taxonomy alignment guidance.

export interface TaxonomyBridgeEntry {
  // Source: IAB Audience Taxonomy 1.1
  audienceTaxonomyId: string;
  audienceTaxonomyName: string;
  audienceTier1: string;

  // Target: IAB Content Taxonomy 3.0
  contentTaxonomyId: string;
  contentTaxonomyName: string;
  contentTier1: string;
  contentTier2?: string;

  // Bridge metadata
  mappingType: "strong" | "moderate" | "contextual";
  mappingRationale: string;
  bidirectional: boolean;  // if true, content signal also implies audience segment
}

export interface TaxonomyBridgeIndex {
  // audience ID → content nodes
  byAudienceId: Map<string, TaxonomyBridgeEntry[]>;
  // content ID → audience nodes
  byContentId: Map<string, TaxonomyBridgeEntry[]>;
  // tier1 audience category → content nodes
  byAudienceTier1: Map<string, TaxonomyBridgeEntry[]>;
}

/**
 * Parse bridge CSV into bridge entries.
 * CSV header: audience_id,audience_name,audience_tier1,content_id,content_name,content_tier1,content_tier2,mapping_type,mapping_rationale,bidirectional
 */
export function parseTaxonomyBridgeCsv(csv: string): TaxonomyBridgeEntry[] {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = (lines[0] ?? "").split(",").map((h) => h.trim());
  const col = (row: string[], name: string): string => {
    const idx = header.indexOf(name);
    return idx >= 0 ? (row[idx]?.trim() ?? "") : "";
  };

  return lines.slice(1).map((line): TaxonomyBridgeEntry => {
    const cols = line.split(",");
    const contentTier2 = col(cols, "content_tier2");
    return {
      audienceTaxonomyId: col(cols, "audience_id"),
      audienceTaxonomyName: col(cols, "audience_name"),
      audienceTier1: col(cols, "audience_tier1"),
      contentTaxonomyId: col(cols, "content_id"),
      contentTaxonomyName: col(cols, "content_name"),
      contentTier1: col(cols, "content_tier1"),
      mappingType: col(cols, "mapping_type") as TaxonomyBridgeEntry["mappingType"],
      mappingRationale: col(cols, "mapping_rationale"),
      bidirectional: col(cols, "bidirectional") === "true",
      ...(contentTier2 ? { contentTier2 } : {}),
    };
  });
}

/**
 * Build lookup indexes from bridge entries.
 */
export function buildBridgeIndex(entries: TaxonomyBridgeEntry[]): TaxonomyBridgeIndex {
  const byAudienceId = new Map<string, TaxonomyBridgeEntry[]>();
  const byContentId = new Map<string, TaxonomyBridgeEntry[]>();
  const byAudienceTier1 = new Map<string, TaxonomyBridgeEntry[]>();

  for (const entry of entries) {
    // Index by audience ID
    const existing = byAudienceId.get(entry.audienceTaxonomyId) ?? [];
    existing.push(entry);
    byAudienceId.set(entry.audienceTaxonomyId, existing);

    // Index by content ID
    const existingContent = byContentId.get(entry.contentTaxonomyId) ?? [];
    existingContent.push(entry);
    byContentId.set(entry.contentTaxonomyId, existingContent);

    // Index by audience tier1
    const existingTier = byAudienceTier1.get(entry.audienceTier1) ?? [];
    existingTier.push(entry);
    byAudienceTier1.set(entry.audienceTier1, existingTier);
  }

  return { byAudienceId, byContentId, byAudienceTier1 };
}

/**
 * Given an audience taxonomy ID, find the matching content taxonomy nodes.
 * Returns strong matches first, then moderate, then contextual.
 */
export function findContentMappings(
  index: TaxonomyBridgeIndex,
  audienceId: string,
  maxResults = 5
): TaxonomyBridgeEntry[] {
  const matches = index.byAudienceId.get(audienceId) ?? [];
  return [...matches]
    .sort((a, b) => {
      const order = { strong: 0, moderate: 1, contextual: 2 };
      return order[a.mappingType] - order[b.mappingType];
    })
    .slice(0, maxResults);
}

/**
 * Given a content taxonomy ID, find matching audience segments.
 */
export function findAudienceMappings(
  index: TaxonomyBridgeIndex,
  contentId: string
): TaxonomyBridgeEntry[] {
  return (index.byContentId.get(contentId) ?? []).filter((e) => e.bidirectional);
}

/**
 * Build a cross-taxonomy signal description for display.
 */
export function buildCrossTaxonomyDescription(
  audienceName: string,
  contentMappings: TaxonomyBridgeEntry[]
): string {
  if (contentMappings.length === 0) {
    return `Audience segment: ${audienceName}. No direct content taxonomy mapping available.`;
  }

  const strong = contentMappings.filter((m) => m.mappingType === "strong");
  const others = contentMappings.filter((m) => m.mappingType !== "strong");

  const parts: string[] = [`Audience: ${audienceName}.`];

  if (strong.length > 0) {
    parts.push(
      `Strong content affinity: ${strong.map((m) => m.contentTaxonomyName).join(", ")}.`
    );
  }
  if (others.length > 0) {
    parts.push(
      `Related content: ${others.map((m) => m.contentTaxonomyName).join(", ")}.`
    );
  }

  parts.push("IAB Audience 1.1 × Content Taxonomy 3.0 bridge mapping.");
  return parts.join(" ");
}
