// src/connectors/iabTaxonomyLoader.ts
// Parses the IAB Audience Taxonomy 1.1 TSV into normalized nodes.
// Output is an intermediate representation - no protocol knowledge here.

import type { IabTaxonomyNode } from "../types/signal";

export interface TaxonomyIndex {
  byId: Map<string, IabTaxonomyNode>;
  byName: Map<string, IabTaxonomyNode>;
  roots: IabTaxonomyNode[];
  children: Map<string, IabTaxonomyNode[]>;
}

/**
 * Parse a TSV string (IAB Audience Taxonomy 1.1 format) into an index.
 */
export function parseTaxonomyTsv(tsv: string): TaxonomyIndex {
  const lines = tsv.split("\n").map((l) => l.trim()).filter(Boolean);
  const header = lines[0];

  if (!header || !header.toLowerCase().includes("unique id")) {
    throw new Error("Invalid taxonomy TSV: missing header row");
  }

  const nodes: IabTaxonomyNode[] = [];

  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    // Columns: Unique ID, Parent ID, Name, Tier 1, Tier 2, Tier 3, Extension
    const uniqueId = cols[0]?.trim();
    if (!uniqueId) continue;

    const node: IabTaxonomyNode = {
      uniqueId,
      parentId: cols[1]?.trim() || undefined,
      name: cols[2]?.trim() ?? "",
      tier1: cols[3]?.trim() || undefined,
      tier2: cols[4]?.trim() || undefined,
      tier3: cols[5]?.trim() || undefined,
      extension: (cols[6]?.trim() ?? "").toLowerCase() === "true",
    };
    nodes.push(node);
  }

  return buildIndex(nodes);
}

function buildIndex(nodes: IabTaxonomyNode[]): TaxonomyIndex {
  const byId = new Map<string, IabTaxonomyNode>();
  const byName = new Map<string, IabTaxonomyNode>();
  const children = new Map<string, IabTaxonomyNode[]>();
  const roots: IabTaxonomyNode[] = [];

  for (const node of nodes) {
    byId.set(node.uniqueId, node);
    byName.set(node.name.toLowerCase(), node);

    if (!node.parentId) {
      roots.push(node);
    } else {
      const siblings = children.get(node.parentId) ?? [];
      siblings.push(node);
      children.set(node.parentId, siblings);
    }
  }

  return { byId, byName, roots, children };
}

/**
 * Find the taxonomy node most relevant to a given signal name using fuzzy matching.
 */
export function findBestTaxonomyMatch(
  index: TaxonomyIndex,
  terms: string[]
): IabTaxonomyNode | undefined {
  for (const term of terms) {
    const lower = term.toLowerCase();
    // Exact match
    const exact = index.byName.get(lower);
    if (exact) return exact;

    // Partial match
    for (const [name, node] of index.byName) {
      if (name.includes(lower) || lower.includes(name)) {
        return node;
      }
    }
  }
  return undefined;
}
