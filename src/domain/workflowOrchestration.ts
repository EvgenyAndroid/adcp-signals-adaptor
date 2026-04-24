// src/domain/workflowOrchestration.ts
// Sec-48f: pure helpers for the 4-stage end-to-end workflow that
// fans a single brief across signals → creative → products →
// media_buy, using live AdCP directory agents at every stage.
//
// All functions here are deterministic and don't touch the network.
// Transport + fan-out live in agentsEndpoints.ts; schema synth lives
// here so it's unit-testable.
//
// Payload synthesis targets the UNION of required fields across the
// three buying agents we ship with by default (adzymic_apx, claire_pub,
// swivel). Union = buyer_ref + brand_manifest + packages + start_time
// + end_time. Claire accepts less but doesn't reject the extras.
//
// Live probe data 2026-04-24 informs the field list:
//   adzymic_apx.create_media_buy   — 22 props, 5 required
//   claire_pub.create_media_buy    — 24 props, 1 required
//   swivel.create_media_buy        — 10 props, 5 required

export interface SignalLite {
  source_agent?: string;
  signal_agent_segment_id?: string;
  id?: string;
  name?: string;
  description?: string;
  coverage_percentage?: number;
  estimated_audience_size?: number;
  [k: string]: unknown;
}

export interface ProductLite {
  product_id?: string;
  id?: string;
  name?: string;
  description?: string;
  [k: string]: unknown;
}

/** Identify a signal with a single stable string ID regardless of
 *  vendor variations. Dstillery uses signal_agent_segment_id; our
 *  own signals may surface under `id`. */
export function signalId(s: SignalLite): string | null {
  if (typeof s.signal_agent_segment_id === "string") return s.signal_agent_segment_id;
  if (typeof s.id === "string") return s.id;
  return null;
}

/** Identify a product. `product_id` is AdCP canonical; some vendors
 *  surface plain `id`. */
export function productId(p: ProductLite): string | null {
  if (typeof p.product_id === "string") return p.product_id;
  if (typeof p.id === "string") return p.id;
  return null;
}

/** Pick top-N signals from a merged multi-agent list. Ranking is
 *  coverage-desc; ties broken by appearance order. Returns just the
 *  IDs — downstream stages don't need the full signal object. */
export function pickTopSignals(merged: SignalLite[], n: number): string[] {
  const scored = merged
    .map((s, i) => ({ id: signalId(s), cov: typeof s.coverage_percentage === "number" ? s.coverage_percentage : -1, idx: i }))
    .filter((x): x is { id: string; cov: number; idx: number } => x.id !== null);
  scored.sort((a, b) => b.cov - a.cov || a.idx - b.idx);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s.id);
    if (out.length >= n) break;
  }
  return out;
}

/** Pick the first product per agent (deterministic). Returns a map
 *  of agent_id → product_id (or null when the agent returned no
 *  products). */
export function pickProductPerAgent(
  perAgent: Array<{ id: string; products: ProductLite[] }>,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const a of perAgent) {
    const first = a.products.find((p) => productId(p) !== null);
    out[a.id] = first ? productId(first) : null;
  }
  return out;
}

export interface MediaBuyPayloadInput {
  workflowId: string;
  agentId: string;
  brief: string;
  chosenProductId: string | null;
  chosenSignalIds: string[];
  /** Optional override for the demo budget. Default: $1000 USD for 7d. */
  totalBudgetUsd?: number;
  /** Optional override for start delay. Default: +24h from now. */
  startDelayHours?: number;
  /** Optional campaign duration in days. Default: 7. */
  durationDays?: number;
  /** Optional reference clock — injected for testability. Defaults to Date.now(). */
  nowMs?: number;
}

export interface MediaBuyPayloadInputWithCreative extends MediaBuyPayloadInput {
  /** Optional format IDs chosen in the creative stage. Populate
   *  `packages[0].creatives` so the vendor sees a compatible
   *  format declaration alongside the product + targeting. */
  chosenFormatIds?: string[];
}

export interface MediaBuyPayload {
  buyer_ref: string;
  brand_manifest: {
    brand: string;
    advertiser: string;
    categories: string[];
  };
  packages: Array<{
    package_ref: string;
    product_id: string | null;
    budget: { amount: number; currency: "USD" };
    creatives?: Array<{ format_id: string }>;
  }>;
  start_time: string;
  end_time: string;
  total_budget: { amount: number; currency: "USD" };
  targeting_overlay?: {
    required_axe_signals?: string[];
  };
  po_number: string;
}

/** Synthesize a create_media_buy payload that satisfies the union of
 *  required fields across Adzymic / Claire / Swivel. Same payload is
 *  emitted for every agent in the workflow — any per-vendor tailoring
 *  happens at the transport layer. */
export function buildCreateMediaBuyPayload(input: MediaBuyPayloadInputWithCreative): MediaBuyPayload {
  const now = input.nowMs ?? Date.now();
  const startDelayMs = (input.startDelayHours ?? 24) * 60 * 60 * 1000;
  const durationMs = (input.durationDays ?? 7) * 24 * 60 * 60 * 1000;
  const startIso = new Date(now + startDelayMs).toISOString();
  const endIso = new Date(now + startDelayMs + durationMs).toISOString();
  const totalBudget = input.totalBudgetUsd ?? 1000;
  const formats = input.chosenFormatIds ?? [];

  const pkg: MediaBuyPayload["packages"][number] = {
    package_ref: "pkg_1",
    product_id: input.chosenProductId,
    budget: { amount: totalBudget, currency: "USD" },
  };
  if (formats.length > 0) {
    pkg.creatives = formats.map((fid) => ({ format_id: fid }));
  }

  const payload: MediaBuyPayload = {
    buyer_ref: `wf_${input.workflowId}_${input.agentId}`,
    brand_manifest: {
      brand: "AdCP Workflow Demo",
      advertiser: "AdCP Workflow Demo",
      categories: extractCategories(input.brief),
    },
    packages: [pkg],
    start_time: startIso,
    end_time: endIso,
    total_budget: { amount: totalBudget, currency: "USD" },
    po_number: `demo_${input.workflowId}`,
  };

  if (input.chosenSignalIds.length > 0) {
    payload.targeting_overlay = { required_axe_signals: input.chosenSignalIds };
  }

  return payload;
}

/** Shallow category extraction for the brand_manifest. Just tokenizes
 *  the brief on whitespace + punctuation and keeps the first 3 alpha
 *  tokens of length ≥4. Good enough to populate the field without
 *  triggering "categories[] required" validators. */
export function extractCategories(brief: string): string[] {
  const tokens = brief.toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 4);
  const uniq: string[] = [];
  for (const t of tokens) {
    if (!uniq.includes(t)) uniq.push(t);
    if (uniq.length >= 3) break;
  }
  return uniq.length > 0 ? uniq : ["general"];
}

/** Sec-48r (expanded in Sec-48r3): per-vendor transform applied to the
 *  synthesized media-buy payload just before the `create_media_buy`
 *  tool call. Compensates for validation drift across live
 *  implementations observed via the Sec-48k/p diagnostic probes.
 *
 *  Rules after iterating against live responses:
 *
 *    adzymic_*      — brand_manifest.name required (synth emits brand);
 *                     packages[].buyer_ref required; budget + total_budget
 *                     must be scalar numbers, not {amount, currency} objects.
 *    swivel         — brand_manifest.name required; packages[].buyer_ref
 *                     required. Budget shape lenient (keep object).
 *    claire_*       — packages[].buyer_ref required; budget + total_budget
 *                     scalar numbers; brand_manifest narrower — accepts
 *                     ONLY `name` + `categories` (rejects `brand` and
 *                     `advertiser` as unexpected keyword arguments);
 *                     packages[].pricing_option_id required.
 *    content_ignite — same as claire_*.
 *
 *  Unknown vendor_ids fall through to identity (base payload unchanged).
 *
 *  The `packages[].pricing_option_id` default is a known-bad placeholder —
 *  Claire's real schema expects a value sourced from the product's
 *  pricing_options array. Wiring that through requires re-threading the
 *  product result into fire-buy; tracked as follow-up. For now the
 *  placeholder surfaces as a different vendor error message, which is
 *  still better than the current outright rejection. */
export function applyVendorAdapter(agentId: string, payload: MediaBuyPayload): MediaBuyPayload {
  // Deep-clone so callers can still inspect the pre-transform shape.
  const p: MediaBuyPayload = JSON.parse(JSON.stringify(payload));

  const isAdzymic = agentId.startsWith("adzymic_");
  const isClaire = agentId.startsWith("claire_");
  const isContentIgnite = agentId === "content_ignite";
  const isSwivel = agentId === "swivel";

  // brand_manifest.name — required by adzymic + swivel; for claire/ci we
  // rebuild the object entirely below with only name + categories.
  if (isAdzymic || isSwivel) {
    (p.brand_manifest as unknown as Record<string, unknown>).name = p.brand_manifest.brand;
  }

  // packages[].buyer_ref — required by every known vendor except bare
  // adzymic_apx (which tolerates its absence; harmless to add).
  if (isAdzymic || isClaire || isContentIgnite || isSwivel) {
    for (const pkg of p.packages) {
      (pkg as unknown as Record<string, unknown>).buyer_ref = `${p.buyer_ref}_${pkg.package_ref}`;
    }
  }

  // Budget + total_budget as scalar number — required by adzymic + claire
  // + content_ignite. Swivel's pydantic is lenient here so we leave the
  // object form in place for it.
  if (isAdzymic || isClaire || isContentIgnite) {
    for (const pkg of p.packages) {
      const b = pkg.budget;
      if (b && typeof b === "object" && typeof b.amount === "number") {
        (pkg as unknown as Record<string, unknown>).budget = b.amount;
      }
    }
    if (p.total_budget && typeof p.total_budget === "object" && typeof p.total_budget.amount === "number") {
      (p as unknown as Record<string, unknown>).total_budget = p.total_budget.amount;
    }
  }

  // claire_* + content_ignite: rebuild brand_manifest to their narrow
  // contract (rejects `brand` and `advertiser` as unexpected keyword
  // arguments), and add a placeholder pricing_option_id on each package.
  if (isClaire || isContentIgnite) {
    const origName = p.brand_manifest.brand ?? "Demo Brand";
    const origCats = p.brand_manifest.categories ?? [];
    (p as unknown as Record<string, unknown>).brand_manifest = {
      name: origName,
      categories: origCats,
    };
    for (const pkg of p.packages) {
      (pkg as unknown as Record<string, unknown>).pricing_option_id = "default";
    }
  }

  return p;
}

/** Sec-48q: pick up to N format IDs from the creative stage results.
 *  Takes the first good format from each vendor (per-vendor diversity),
 *  then fills remaining slots from the first vendor's overflow. */
export function pickTopFormatIds(
  creativeResults: Array<{ payload: { formats: unknown[] } }>,
  n: number,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  function fmtId(f: unknown): string | null {
    if (!f || typeof f !== "object") return null;
    const o = f as { format_id?: unknown; id?: unknown };
    // Celtra returns format_id as {agent_url, id}; flatten to the id field.
    if (typeof o.format_id === "string") return o.format_id;
    if (o.format_id && typeof o.format_id === "object") {
      const inner = (o.format_id as { id?: unknown }).id;
      if (typeof inner === "string") return inner;
    }
    if (typeof o.id === "string") return o.id;
    return null;
  }
  // Pass 1: one from each vendor.
  for (const r of creativeResults) {
    if (ids.length >= n) break;
    const formats = r.payload.formats;
    for (const f of formats) {
      const id = fmtId(f);
      if (id && !seen.has(id)) { ids.push(id); seen.add(id); break; }
    }
  }
  // Pass 2: fill remaining from first vendor's overflow.
  for (const r of creativeResults) {
    if (ids.length >= n) break;
    for (const f of r.payload.formats) {
      if (ids.length >= n) break;
      const id = fmtId(f);
      if (id && !seen.has(id)) { ids.push(id); seen.add(id); }
    }
  }
  return ids;
}

/** Sec-48q: keyword-driven creative filter. Parses the brief for
 *  obvious format hints (video / display, mobile / desktop) and
 *  returns arguments suitable for `list_creative_formats`.
 *
 *  Intentionally shallow — production would use LLM intent parsing.
 *  Here we just map a few canonical keywords so the creative stage
 *  doesn't drown the UI with 81 formats when the user clearly asked
 *  for, e.g., "video APAC" or "mobile display". */
export interface CreativeFilter {
  asset_types?: ("image" | "video")[];
  max_width?: number;
  min_width?: number;
  max_height?: number;
  min_height?: number;
}

export function deriveCreativeFilter(brief: string): CreativeFilter {
  const out: CreativeFilter = {};
  const b = brief.toLowerCase();
  const wantsVideo = /\bvideo\b|\bpre[- ]?roll\b|\bmid[- ]?roll\b|\bott\b|\bctv\b/.test(b);
  const wantsImage = /\bdisplay\b|\bbanner\b|\bimage\b|\bstatic\b/.test(b);
  // If both or neither are matched, leave asset_types unset — full catalog.
  if (wantsVideo && !wantsImage) out.asset_types = ["video"];
  else if (wantsImage && !wantsVideo) out.asset_types = ["image"];
  if (/\bmobile\b|\bphone\b|\bios\b|\bandroid\b/.test(b)) {
    out.max_width = 500;
  }
  if (/\bdesktop\b|\bhome[- ]?page\b|\btake[- ]?over\b/.test(b)) {
    out.min_width = 728;
  }
  return out;
}

/** Sec-48q: filter args for `get_products`. Passed under `filters` in the
 *  tools/call. Vendors that don't honor any given key just ignore it; this
 *  is best-effort intent-signaling. */
export interface ProductFilter {
  targeting_signals?: string[];
  format_ids?: string[];
  asset_types?: ("image" | "video")[];
}

export function deriveProductFilter(
  chosenSignalIds: string[],
  chosenFormatIds: string[],
  creativeFilter: CreativeFilter,
): ProductFilter {
  const out: ProductFilter = {};
  if (chosenSignalIds.length > 0) out.targeting_signals = chosenSignalIds;
  // Sec-48r: format_ids is DELIBERATELY not forwarded as string[]. Live
  // probe 2026-04-24 of the 8 buying agents revealed that 5 of 8
  // (adzymic_sph/tsl/mediacorp, content_ignite, claire_pub) validate
  // format_ids against an AdCP `FormatId` Pydantic model that expects
  // {agent_url, id} objects — passing bare strings trips:
  //   "Input should be a valid dictionary or instance of FormatId
  //    [type=model_type, input_value='sizeless-native-app-v1'...]"
  // Only adzymic_apx tolerates the scalar form. Stripping format_ids
  // from the filter recovers the other 5. The proper object shape
  // needs creative-agent URL provenance threaded through the picker —
  // tracked as a follow-up.
  //
  // chosenFormatIds ARE still emitted into packages[0].creatives in
  // create_media_buy (that's a different protocol shape on a different
  // tool, and does accept bare strings under {format_id}).
  void chosenFormatIds;
  if (creativeFilter.asset_types && creativeFilter.asset_types.length > 0) {
    out.asset_types = creativeFilter.asset_types;
  }
  return out;
}

/** Create a reasonably unique + human-recognizable workflow id.
 *  Format: wf_<base36-ms><6-random>. Called once per POST. */
export function newWorkflowId(): string {
  const t = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `wf_${t}${rand}`;
}

/** Extract an array from an MCP tool's `structured_content` payload.
 *
 * Different vendors return their results under different top-level keys,
 * and some nest them one level deeper inside a wrapper object:
 *   - Our get_signals:              { signals: [...] }
 *   - Adzymic get_products:         { products: [...] }
 *   - Advertible list_formats:      { formats: [...] }
 *   - Celtra list_formats:          { formats: [...] } nested under a
 *                                     wrapper (Sec-48i: depth-1 search)
 *
 * Lookup priority:
 *   1. preferredKeys at depth 0 — the fast path
 *   2. preferredKeys at depth 1 — wrapper envelopes like {result:{…}}
 *   3. any array at depth 0 — generic fallback
 *   4. any array at depth 1 — last-resort for deeply-wrapped responses
 *
 * Bounded to depth 1. If a future vendor nests the array at depth 2+,
 * we add an explicit preferred-key entry rather than making this walk
 * the whole object graph.
 */
/** Describe the shape of a tool-call result for diagnostic purposes.
 *  Used in stream events when the extractor returns an empty array so
 *  we can see live what the vendor's response looked like without
 *  dumping the full payload. */
export interface ToolResultDiagnostic {
  structured_type: "object" | "array" | "null" | "other";
  structured_keys: string[];        // top-level keys if object, empty otherwise
  content_count: number;             // number of content blocks
  content_types: string[];           // unique types seen ("text", "image", ...)
  text_preview?: string;             // first 300 chars of first text block
  text_is_json: boolean;             // whether that preview parsed as JSON
  text_json_keys: string[];          // top-level keys of that JSON, if any
}

export function describeToolResult(structuredContent: unknown, content: unknown): ToolResultDiagnostic {
  const out: ToolResultDiagnostic = {
    structured_type: "other",
    structured_keys: [],
    content_count: 0,
    content_types: [],
    text_is_json: false,
    text_json_keys: [],
  };
  if (structuredContent === null) out.structured_type = "null";
  else if (Array.isArray(structuredContent)) out.structured_type = "array";
  else if (structuredContent && typeof structuredContent === "object") {
    out.structured_type = "object";
    out.structured_keys = Object.keys(structuredContent as Record<string, unknown>).slice(0, 20);
  }
  if (Array.isArray(content)) {
    out.content_count = content.length;
    const seen = new Set<string>();
    for (const block of content) {
      if (block && typeof block === "object") {
        const t = (block as { type?: unknown }).type;
        if (typeof t === "string") seen.add(t);
      }
    }
    out.content_types = Array.from(seen);
    const firstText = content.find((b) => b && typeof b === "object" && (b as { type?: unknown }).type === "text");
    if (firstText) {
      const text = (firstText as { text?: unknown }).text;
      if (typeof text === "string") {
        out.text_preview = text.slice(0, 300);
        try {
          const parsed = JSON.parse(text);
          out.text_is_json = true;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            out.text_json_keys = Object.keys(parsed as Record<string, unknown>).slice(0, 20);
          } else if (Array.isArray(parsed)) {
            out.text_json_keys = ["(array:" + parsed.length + ")"];
          }
        } catch { /* leave text_is_json false */ }
      }
    }
  }
  return out;
}

/** Extract an array from an MCP tools/call result, trying both the
 *  structured-content and text-content paths.
 *
 *  MCP tools can return data two ways:
 *    1. `result.structuredContent`  — typed JSON, what we mostly get
 *    2. `result.content[]`          — array of {type:"text"|"image"|...}
 *                                     blocks. Some servers (Celtra)
 *                                     return the structured payload as
 *                                     JSON inside content[0].text.
 *
 *  We try structured first (fast path), then scan content[] for any
 *  text block that parses as JSON and looks for the array under the
 *  same preferred keys. Designed to replace direct extractArrayPayload
 *  calls on `res.structured_content` where the caller also has access
 *  to `res.content`.
 */
export function extractMcpToolArray<T = unknown>(
  structuredContent: unknown,
  content: unknown,
  preferredKeys: readonly string[],
): T[] {
  const fromStructured = extractArrayPayload<T>(structuredContent, preferredKeys);
  if (fromStructured.length > 0) return fromStructured;
  if (!Array.isArray(content)) return fromStructured;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: string; text?: string };
    if (b.type !== "text" || typeof b.text !== "string") continue;
    for (const candidate of jsonCandidatesFromText(b.text)) {
      try {
        const parsed = JSON.parse(candidate);
        const fromText = extractArrayPayload<T>(parsed, preferredKeys);
        if (fromText.length > 0) return fromText;
      } catch { /* candidate didn't parse; try next */ }
    }
  }
  return fromStructured;
}

/** Produce JSON-parse candidates from a text block. Tries the whole
 *  text first (happy path for pure-JSON responses), then falls back
 *  to sliced ranges starting at the first `{`/`[` and ending at the
 *  last matching bracket.
 *
 *  Celtra (and other MCP servers that prioritize human readability)
 *  emit "Available Creative Formats:\n\n{...}" — a prefix followed
 *  by JSON. A plain JSON.parse on that fails. Slicing from the first
 *  `{` to the matching `}` (or `[`/`]`) recovers the payload without
 *  needing vendor-specific parsers. */
function jsonCandidatesFromText(text: string): string[] {
  const out: string[] = [text];
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  // Pick whichever opener appears first (and exists).
  let start = -1;
  if (firstBrace >= 0 && firstBracket >= 0) start = Math.min(firstBrace, firstBracket);
  else if (firstBrace >= 0) start = firstBrace;
  else if (firstBracket >= 0) start = firstBracket;
  if (start < 0 || start === 0) return out; // nothing to slice, or already pure JSON
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  const end = text.lastIndexOf(closer);
  if (end > start) out.push(text.slice(start, end + 1));
  return out;
}

export function extractArrayPayload<T = unknown>(
  structured: unknown,
  preferredKeys: readonly string[],
): T[] {
  if (!structured || typeof structured !== "object") return [];
  const obj = structured as Record<string, unknown>;

  // 1. preferred keys at top level
  for (const k of preferredKeys) {
    const v = obj[k];
    if (Array.isArray(v)) return v as T[];
  }

  // 2. preferred keys inside any object-valued top-level key
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = v as Record<string, unknown>;
      for (const pk of preferredKeys) {
        const nv = inner[pk];
        if (Array.isArray(nv)) return nv as T[];
      }
    }
  }

  // 3. first array-valued top-level key
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (Array.isArray(v)) return v as T[];
  }

  // 4. first array-valued key inside any object-valued top-level key
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = v as Record<string, unknown>;
      for (const nk of Object.keys(inner)) {
        const nv = inner[nk];
        if (Array.isArray(nv)) return nv as T[];
      }
    }
  }

  return [];
}
