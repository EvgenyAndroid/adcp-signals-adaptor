/**
 * queryParser.ts
 * Natural Language → AudienceQueryAST decomposition via Claude API.
 *
 * UCP v0.2 NLAQ §3.1 — LLM Decomposition Layer
 *
 * Converts free-form audience descriptions into a structured boolean AST
 * that can be resolved against any signal catalog. The LLM handles:
 *   - Archetype resolution ("soccer moms" → constituent dimensions)
 *   - Negation extraction ("don't like coffee" → NOT node)
 *   - Temporal scoping ("in the afternoon" → temporal_scope)
 *   - Geo normalization ("Nashville" → DMA-659)
 *   - Title-level content affinity ("Desperate Housewives" → drama + audience embedding hint)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Dimension =
  | "age_band"
  | "income_band"
  | "education"
  | "household_type"
  | "metro_tier"
  | "content_genre"
  | "streaming_affinity"
  | "geo"
  | "interest"
  | "archetype"
  | "content_title"
  | "behavioral_absence";

export type DayPart = "morning" | "afternoon" | "primetime" | "latenight" | "overnight";

export interface TemporalScope {
  daypart?: DayPart;
  hours_utc?: [number, number]; // [start, end] inclusive
  days?: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
  timezone_inference: "geo" | "utc" | "local";
}

export interface AudienceQueryLeaf {
  op: "LEAF";
  dimension: Dimension;
  /**
   * Human-readable label for this leaf — used for signal catalog fuzzy matching.
   * e.g. "family_with_kids", "drama", "35-44", "DMA-659"
   */
  value: string;
  /**
   * Natural language description of this concept — used for embedding-based
   * similarity search against signal descriptions. Richer than value alone.
   */
  description: string;
  /**
   * Optional: concept_id hint if the LLM recognises a well-known archetype.
   * Maps to concept registry (UCP v5.2 §4 — Concept-Level VAC).
   */
  concept_id?: string;
  temporal?: TemporalScope;
  confidence: number; // 0–1, LLM self-assessed
  is_exclusion?: boolean;
}

export interface AudienceQueryBranch {
  op: "AND" | "OR" | "NOT";
  children: AudienceQueryNode[];
}

export type AudienceQueryNode = AudienceQueryLeaf | AudienceQueryBranch;

export interface AudienceQueryAST {
  /** Original NL input verbatim */
  nl_query: string;
  /** ISO timestamp of parse */
  parsed_at: string;
  /** Parser model identifier */
  parser_model: string;
  root: AudienceQueryNode;
  /** Overall parse confidence — min of leaf confidences */
  confidence: number;
  /** Any dimensions the LLM flagged as ambiguous or unresolvable */
  unresolved_hints: string[];
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an audience segmentation expert for programmatic advertising.
Your task: decompose a natural language audience description into a structured boolean query AST.

DIMENSION VOCABULARY (use exact strings):
- age_band: "18-24" | "25-34" | "35-44" | "45-54" | "55-64" | "65+"
- income_band: "under_50k" | "50k_100k" | "100k_150k" | "150k_plus"
- education: "high_school" | "some_college" | "bachelors" | "graduate"
- household_type: "single" | "couple_no_kids" | "family_with_kids" | "senior_household" | "urban_professional"
- metro_tier: "top_10" | "top_25" | "top_50" | "other"
- content_genre: "action" | "sci_fi" | "drama" | "comedy" | "documentary" | "thriller" | "animation" | "romance"
- streaming_affinity: "high" | "medium" | "low"
- geo: DMA code or city name normalised (e.g. "DMA-659" for Nashville)
- interest: free label (e.g. "coffee", "luxury_goods", "sports")
- archetype: cultural shorthand (e.g. "soccer_mom", "urban_professional", "cord_cutter")
- content_title: specific TV/film title (e.g. "desperate_housewives")
- behavioral_absence: signal indicating NON-consumption (e.g. "non_coffee_drinker")

RULES:
1. Produce a boolean AST with op: AND | OR | NOT | LEAF nodes.
2. Archetype nodes (op:LEAF, dimension:archetype) are valid — do NOT expand them inline. The resolver will handle expansion.
3. Wrap negations in NOT nodes. "don't like X" → {op:"NOT", children:[{op:"LEAF", dimension:"interest", value:"X"}]}
4. Temporal qualifiers ("in the afternoon") attach as temporal scope on the relevant LEAF, not as a separate node.
5. confidence: your estimate 0.0–1.0 for each LEAF. Use lower values for ambiguous or inferred dimensions.
6. unresolved_hints: list any phrases you could not map to a known dimension.
7. Age lower bounds: "35+" or "over 35" means ONLY age_band "35-44". Do NOT expand a lower-bound expression into multiple older bands (45-54, 55-64, 65+). Only add additional age bands if the query explicitly names them (e.g. "35 to 54" → two bands: "35-44" and "45-54").
8. description: write a rich 1-sentence description of each LEAF for semantic embedding search.

OUTPUT FORMAT: respond ONLY with valid JSON matching the AudienceQueryAST schema. No markdown. No preamble.

SCHEMA:
{
  "nl_query": string,
  "parsed_at": string (ISO),
  "parser_model": string,
  "root": AudienceQueryNode,
  "confidence": number,
  "unresolved_hints": string[]
}`;

// ─── Parser ───────────────────────────────────────────────────────────────────

export interface ParseOptions {
  /** Anthropic API key — injected from Worker env */
  apiKey?: string;
  /** Override model — defaults to claude-sonnet-4-20250514 */
  model?: string;
  /** Max tokens for AST response */
  maxTokens?: number;
}

export async function parseNLQuery(
  nlQuery: string,
  options: ParseOptions = {}
): Promise<AudienceQueryAST> {
  const model = options.model ?? "claude-sonnet-4-20250514";
  const maxTokens = options.maxTokens ?? 2000;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (options.apiKey) {
    headers["x-api-key"] = options.apiKey;
  }

  const body = {
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Decompose this audience description into an AudienceQueryAST:\n\n"${nlQuery}"`,
      },
    ],
  };

  let raw: string;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Claude API error ${resp.status}: ${err}`);
    }

    const data = (await resp.json()) as { content: Array<{ type: string; text?: string }> };
    raw = data.content.find((b) => b.type === "text")?.text ?? "";
  } catch (e) {
    throw new Error(`queryParser: fetch failed — ${(e as Error).message}`);
  }

  // Strip accidental markdown fences
  const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();

  let ast: AudienceQueryAST;
  try {
    ast = JSON.parse(cleaned) as AudienceQueryAST;
  } catch {
    throw new Error(`queryParser: invalid JSON from model. Raw:\n${cleaned.slice(0, 500)}`);
  }

  // Backfill metadata in case model omitted it
  ast.nl_query = ast.nl_query ?? nlQuery;
  ast.parsed_at = ast.parsed_at ?? new Date().toISOString();
  ast.parser_model = ast.parser_model ?? model;
  ast.unresolved_hints = ast.unresolved_hints ?? [];

  return ast;
}

// ─── Utility: flatten all LEAFs from an AST ───────────────────────────────────

export function flattenLeafs(node: AudienceQueryNode): AudienceQueryLeaf[] {
  if (node.op === "LEAF") return [node];
  return (node as AudienceQueryBranch).children.flatMap(flattenLeafs);
}

// ─── Utility: extract all NOT-wrapped LEAFs (exclusions) ─────────────────────

export function extractExclusions(node: AudienceQueryNode): AudienceQueryLeaf[] {
  if (node.op === "NOT") {
    return (node as AudienceQueryBranch).children.flatMap(flattenLeafs);
  }
  if (node.op === "LEAF") return [];
  return (node as AudienceQueryBranch).children.flatMap(extractExclusions);
}