// src/mappers/taxonomyMapper.ts

import type { IabTaxonomyNode } from "../types/signal";
import type { SignalCategoryType } from "../types/signal";

/**
 * Map a taxonomy node's tier structure to our internal category type.
 */
export function taxonomyToCategoryType(node: IabTaxonomyNode): SignalCategoryType {
  const tier1 = (node.tier1 ?? node.name).toLowerCase();

  if (tier1.includes("demographic") || tier1.includes("age") || tier1.includes("income")) {
    return "demographic";
  }
  if (tier1.includes("interest") || tier1.includes("entertainment") || tier1.includes("hobbies")) {
    return "interest";
  }
  if (tier1.includes("purchase") || tier1.includes("intent") || tier1.includes("buyer")) {
    return "purchase_intent";
  }
  if (tier1.includes("geographic") || tier1.includes("geo") || tier1.includes("location")) {
    return "geo";
  }
  if (tier1.includes("professional") || tier1.includes("business")) {
    return "demographic";
  }
  return "interest";
}

/**
 * Build a human-readable description from a taxonomy node's hierarchy.
 */
export function taxonomyToDescription(node: IabTaxonomyNode): string {
  const parts = [node.tier1, node.tier2, node.tier3].filter(Boolean);
  if (parts.length <= 1) {
    return `Audience segment: ${node.name}`;
  }
  return `${parts.join(" > ")} audience segment based on IAB Audience Taxonomy 1.1`;
}
