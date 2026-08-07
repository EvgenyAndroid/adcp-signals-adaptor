// Tool handlers — pure functions over (args, env). Each returns the tool's
// structuredContent shape; the caller wraps it in MCP envelope.
//
// `create_media_buy` returns one of three AdCP 3.0.1 shapes:
//   - submitted task envelope : status='submitted'        (manual IO review)
//   - pending_creatives       : status='pending_creatives'
//   - active                  : status='active'
//
// TERMS_REJECTED: the buyer's `performance_standards[]` (decimal thresholds
// 0..1, per /schemas/3.0.1/core/performance-standard.json) must be ≤ the
// floor each product publishes. If the buyer asks for viewability ≥ 0.71
// against a product that publishes 0.70, we reject with errors[0].code =
// "TERMS_REJECTED". Buy-level performance_standards apply to all packages;
// package-level overrides take precedence per package.
//
// Idempotency: in-memory keyed cache scoped to the Worker isolate. Cache
// TTL = 86_400s (matches capabilities advertisement). For prod, swap to KV.

import type { Env } from "../env";
import { buildCapabilities } from "../capabilities";
import { CREATIVE_FORMATS, type CreativeFormat } from "../catalog/formats";
import {
    ALL_PRODUCTS,
    ABM_BUNDLE,
    findProduct,
    productHasPricingModel,
    rankProducts,
    type Product,
    type PerformanceStandard,
    type PerfMetric,
    type MeasurementTerms,
    type PricingOption,
} from "../catalog/products";
import {
    persistMediaBuy,
    getMediaBuy,
    type StoredMediaBuy,
    type StoredPackage,
} from "../catalog/mediaBuyStore";

const REPLAY_TTL_MS = 86_400 * 1000;

interface IdempotencyEntry {
    expires_at: number;
    response: unknown;
}
const idempotencyCache = new Map<string, IdempotencyEntry>();

// Floor metrics: actual rate must be >= threshold. Buyer asking for higher
// than the seller publishes is "asking for more than we'll commit to" → reject.
// `ivt` is a ceiling (must not exceed); buyer asking for a lower ceiling is
// stricter than what we publish → reject if requested.threshold < product's.
const FLOOR_METRICS = new Set<PerfMetric>([
    "viewability", "completion_rate", "brand_safety", "attention_score",
]);

// ── get_adcp_capabilities ──────────────────────────────────────────────────

interface CapabilitiesArgs {
    protocols?: unknown;
    protocol?: unknown;
    context?: unknown;
}

export function handleGetCapabilities(args: CapabilitiesArgs, env: Env): unknown {
    const filterArr = collectProtocolFilter(args);
    const filter = filterArr ? new Set(filterArr) : null;
    const cap = buildCapabilities(env, filter);
    return withContext(cap as unknown as Record<string, unknown>, args.context);
}

function collectProtocolFilter(args: CapabilitiesArgs): string[] | null {
    const out: string[] = [];
    if (Array.isArray(args.protocols)) {
        for (const p of args.protocols) {
            if (typeof p === "string") out.push(p);
        }
    }
    if (typeof args.protocol === "string") out.push(args.protocol);
    return out.length > 0 ? out : null;
}

// ── get_products ───────────────────────────────────────────────────────────

interface GetProductsArgs {
    brief?: unknown;
    promoted_offering?: unknown;
    deliver_to?: unknown;
    buying_mode?: unknown;
    refine?: unknown;
    brand?: unknown;
    account?: unknown;
    filters?: { format_ids?: unknown; delivery_type?: unknown; pricing_model?: unknown };
    adcp_version?: unknown;
    context?: unknown;
}

export function handleGetProducts(args: GetProductsArgs): unknown {
    const brief = typeof args.brief === "string" ? args.brief : undefined;
    const formatIds = stringArrayOrUndef(args.filters?.format_ids);
    const deliveryType = stringFilter(args.filters?.delivery_type, ["guaranteed", "non_guaranteed"]);
    const pricingModel = stringFilter(args.filters?.pricing_model, [
        "cpm", "vcpm", "cpc", "cpcv", "cpv", "cpp", "cpa", "flat_rate", "time",
    ]);

    let products = rankProducts(brief, formatIds);
    if (deliveryType) products = products.filter((p) => p.delivery_type === deliveryType);
    if (pricingModel) products = products.filter((p) => productHasPricingModel(p, pricingModel));

    const briefRelevance = (typeof brief === "string" && brief.length > 0)
        ? `Ranked against brief: ${brief.slice(0, 200)}`
        : undefined;

    const projected = products.map((p) => projectProduct(p, briefRelevance));
    return withContext({ products: projected }, args.context);
}

function projectProduct(p: Product, briefRelevance: string | undefined): Record<string, unknown> {
    const out: Record<string, unknown> = {
        product_id: p.product_id,
        name: p.name,
        description: p.description,
        publisher_properties: p.publisher_properties,
        format_ids: p.format_ids,
        delivery_type: p.delivery_type,
        is_custom: p.is_custom,
        pricing_options: p.pricing_options,
        reporting_capabilities: p.reporting_capabilities,
    };
    if (p.creative_policy) out.creative_policy = p.creative_policy;
    if (p.performance_standards) out.performance_standards = p.performance_standards;
    if (p.measurement_terms) out.measurement_terms = p.measurement_terms;
    if (p.bundled_product_ids) out.bundled_product_ids = p.bundled_product_ids;
    if (briefRelevance) out.brief_relevance = briefRelevance;
    return out;
}

// ── list_creative_formats ──────────────────────────────────────────────────

interface ListFormatsArgs {
    type?: unknown;
    format_ids?: unknown;
    context?: unknown;
}

export function handleListCreativeFormats(args: ListFormatsArgs): unknown {
    const type = typeof args.type === "string" ? args.type : undefined;
    const formatIds = stringArrayOrUndef(args.format_ids);

    let formats: CreativeFormat[] = CREATIVE_FORMATS;
    if (type) formats = formats.filter((f) => f.type === type);
    if (formatIds) {
        const wanted = new Set(formatIds);
        formats = formats.filter((f) => wanted.has(f.format_id));
    }
    return withContext({ formats }, args.context);
}

// ── create_media_buy ───────────────────────────────────────────────────────

interface CreateMediaBuyArgs {
    buyer_ref?: unknown;
    packages?: unknown;
    budget?: unknown;
    start_time?: unknown;
    end_time?: unknown;
    promoted_offering?: unknown;
    po_number?: unknown;
    idempotency_key?: unknown;
    reporting_webhook?: unknown;
    measurement_terms?: unknown;
    performance_standards?: unknown;
    brand?: unknown;
    account?: unknown;
    context?: unknown;
}

interface NormalizedPackage {
    buyer_ref: string;
    product_id: string;
    pricing_option_id?: string;
    budget?: number;
    impressions?: number;
    performance_standards?: PerformanceStandard[];
    measurement_terms?: Record<string, unknown>;
}

export function handleCreateMediaBuy(args: CreateMediaBuyArgs): unknown {
    try {
        return doCreateMediaBuy(args);
    } catch (e) {
        // Echo the buyer's context onto every ToolError so the runner can
        // correlate failures (per AdCP context-echo convention).
        if (e instanceof ToolError) throw e.withContext(args.context);
        throw e;
    }
}

function doCreateMediaBuy(args: CreateMediaBuyArgs): unknown {
    // Per AdCP 3.0.1 create-media-buy-request, buyer_ref is NOT a required
    // field — only packages (or proposal_id+total_budget) is. budget is
    // also optional at the buy level (per-package budget allocations carry
    // the spend). Accept the spec; default missing buyer_ref to a synthesized
    // id so downstream packages still cross-reference cleanly.
    const buyerRef = optionalString(args.buyer_ref) ?? `seller_${randId()}`;
    const packages = requirePackages(args.packages);
    const budget = optionalBudget(args.budget);
    const startTime = optionalStartTime(args.start_time);
    const endTime = optionalString(args.end_time);
    const promotedOffering = optionalString(args.promoted_offering);
    const poNumber = optionalString(args.po_number);
    const idempotencyKey = optionalString(args.idempotency_key);

    if (idempotencyKey) {
        const cached = lookupIdempotent(idempotencyKey);
        if (cached !== null) return cached;
    }

    // Resolve referenced products and validate they exist.
    const resolved: { pkg: NormalizedPackage; product: Product }[] = [];
    for (const p of packages) {
        const product = findProduct(p.product_id);
        if (!product) {
            throw toolError("PRODUCT_NOT_FOUND", `Unknown product_id: ${p.product_id}`);
        }
        resolved.push({ pkg: p, product });
    }

    // TERMS_REJECTED — two validators run in series. Either rejects with the
    // canonical AdCP error code; the buyer learns which axis they overshot on.
    //
    //   1. performance_standards (decimal floor/ceiling per
    //      /schemas/3.0.1/core/performance-standard.json)
    //   2. measurement_terms (billing vendor + variance + window per
    //      /schemas/3.0.1/core/measurement-terms.json)
    //
    // Buy-level proposals apply to every package; per-package overrides take
    // precedence per package.
    const buyLevelStandards = parsePerformanceStandards(args.performance_standards);
    const buyLevelMeasurementTerms = isObject(args.measurement_terms) ? args.measurement_terms : null;
    for (const { pkg, product } of resolved) {
        const requested = pkg.performance_standards ?? buyLevelStandards;
        if (requested && requested.length > 0) {
            const violation = findPerformanceViolation(product, requested);
            if (violation) {
                throw toolError(
                    "TERMS_REJECTED",
                    `Cannot commit to ${violation.metric}=${violation.requested} on ` +
                    `${product.product_id}; product publishes ${violation.metric} ` +
                    `${violation.directionDesc} ${violation.published}.`,
                );
            }
        }
        const proposedTerms = pkg.measurement_terms ?? buyLevelMeasurementTerms;
        if (proposedTerms) {
            const v = findMeasurementTermsViolation(product, proposedTerms);
            if (v) {
                throw toolError(
                    "TERMS_REJECTED",
                    `Cannot honor proposed measurement_terms on ${product.product_id}: ${v}.`,
                );
            }
        }
    }

    // Pick response shape based on product mix.
    const involvesBundleProposal = resolved.some(
        (r) => r.product.product_id === ABM_BUNDLE.product_id,
    );
    const hasNonGuaranteed = resolved.some((r) => r.product.delivery_type === "non_guaranteed");

    let response: Record<string, unknown>;
    if (involvesBundleProposal) {
        // Proposal-mode: bundle requires manual IO review → submitted envelope.
        // Per AdCP 3.0.1, the submitted shape needs task_id + status.
        response = {
            task_id: `task_${randId()}`,
            status: "submitted",
            buyer_ref: buyerRef,
            message:
                "Cross-Channel ABM Bundle requires proposal review. Our IO team will " +
                "respond within 2 business days with finalized pricing and flight " +
                "confirmation.",
            estimated_review_completion: isoPlusBusinessDays(2),
            ...(poNumber ? { po_number: poNumber } : {}),
        };
    } else {
        // Standard path: pending_creatives — buy approved, awaiting creative upload.
        const mediaBuyId = `mb_${randId()}`;
        const confirmedAt = new Date().toISOString();
        const responsePackages = resolved.map(({ pkg, product }) => ({
            package_id: `pkg_${randId()}`,
            buyer_ref: pkg.buyer_ref,
            product_id: pkg.product_id,
            ...(pkg.pricing_option_id ? { pricing_option_id: pkg.pricing_option_id } : {}),
            delivery_type: product.delivery_type,
            status: hasNonGuaranteed && product.delivery_type === "non_guaranteed"
                ? "pending_activation"
                : "pending_creatives",
        }));
        // Persist for downstream get_media_buy_delivery lookups. Stores just
        // enough to recompute delivery on demand; pricing rates resolve from
        // the catalog at call time so a catalog edit is reflected without
        // rewriting stored buys.
        const stored: StoredMediaBuy = {
            media_buy_id: mediaBuyId,
            buyer_ref: buyerRef,
            confirmed_at: confirmedAt,
            currency: budget?.currency ?? "USD",
            status: "pending_creatives",
            packages: responsePackages.map((rp, i): StoredPackage => {
                const src = packages[i]!;
                return {
                    package_id: rp.package_id,
                    buyer_ref: rp.buyer_ref,
                    product_id: rp.product_id,
                    ...(rp.pricing_option_id ? { pricing_option_id: rp.pricing_option_id } : {}),
                    ...(typeof src.budget === "number" ? { budget: src.budget } : {}),
                };
            }),
            ...(startTime ? { start_time: startTime } : {}),
            ...(endTime ? { end_time: endTime } : {}),
            ...(typeof budget?.total === "number" ? { total_budget: budget.total } : {}),
        };
        persistMediaBuy(stored);

        response = {
            media_buy_id: mediaBuyId,
            status: "pending_creatives",
            buyer_ref: buyerRef,
            confirmed_at: confirmedAt,
            revision: 1,
            packages: responsePackages,
            ...(budget ? { budget } : {}),
            ...(startTime ? { start_time: startTime } : {}),
            ...(endTime ? { end_time: endTime } : {}),
            ...(promotedOffering ? { promoted_offering: promotedOffering } : {}),
            ...(poNumber ? { po_number: poNumber } : {}),
            creative_deadline: startTime ? minusBusinessDays(startTime, 5) : isoPlusBusinessDays(5),
        };
    }

    const final = withContext(response, args.context);
    if (idempotencyKey) storeIdempotent(idempotencyKey, final);
    return final;
}

// ── get_media_buy_delivery ─────────────────────────────────────────────────
//
// Returns delivery metrics for one or more media buys. Per AdCP 3.0.1, the
// canonical fields are `impressions`, `conversions`, `pacing_index` (1.0 =
// on track). We also emit `impressions_delivered` / `conversations_delivered`
// / `pacing_percent` aliases so client contracts using those names work
// (additionalProperties: true on the response schema permits both).
//
// The SI product (slm_ai_buying_assistant) is billed per qualified
// conversation — its by_package entry replaces the impressions metric with
// `conversations_delivered` and `conversions`.

interface GetDeliveryArgs {
    media_buy_id?: unknown;     // singular convenience alias
    media_buy_ids?: unknown;    // canonical AdCP shape
    start_date?: unknown;
    end_date?: unknown;
    context?: unknown;
}

const SI_PRODUCT_ID = "slm_ai_buying_assistant";

export function handleGetMediaBuyDelivery(args: GetDeliveryArgs): unknown {
    const ids = collectMediaBuyIds(args);
    if (ids.length === 0) {
        throw toolError(
            "INVALID_REQUEST",
            "`media_buy_ids` (or `media_buy_id`) is required.",
        ).withContext(args.context);
    }

    const now = new Date();
    const deliveries: Record<string, unknown>[] = [];
    let aggImpressions = 0;
    let aggConversions = 0;
    let aggSpend = 0;

    for (const id of ids) {
        const buy = getMediaBuy(id);
        if (!buy) {
            throw toolError(
                "MEDIA_BUY_NOT_FOUND",
                `No media buy with id: ${id}`,
            ).withContext(args.context);
        }
        const delivery = computeBuyDelivery(buy, now);
        aggImpressions += delivery.totals.impressions;
        aggConversions += delivery.totals.conversions;
        aggSpend += delivery.totals.spend;
        deliveries.push(delivery.payload);
    }

    const reportingPeriod = computeReportingPeriod(deliveries, now);

    const body: Record<string, unknown> = {
        reporting_period: reportingPeriod,
        currency: "USD",
        aggregated_totals: {
            impressions: round2(aggImpressions),
            spend: round2(aggSpend),
            conversions: round2(aggConversions),
            media_buy_count: deliveries.length,
        },
        media_buy_deliveries: deliveries,
    };
    return withContext(body, args.context);
}

function collectMediaBuyIds(args: GetDeliveryArgs): string[] {
    const out: string[] = [];
    if (typeof args.media_buy_id === "string" && args.media_buy_id.length > 0) {
        out.push(args.media_buy_id);
    }
    if (Array.isArray(args.media_buy_ids)) {
        for (const x of args.media_buy_ids) if (typeof x === "string" && x.length > 0) out.push(x);
    }
    return [...new Set(out)];
}

interface BuyDelivery {
    payload: Record<string, unknown>;
    totals: { impressions: number; conversions: number; spend: number };
}

function computeBuyDelivery(buy: StoredMediaBuy, now: Date): BuyDelivery {
    const flight = resolveFlight(buy, now);
    const progress = clamp01(flight.elapsedMs / flight.durationMs);

    let totalImpressions = 0;
    let totalConversions = 0;
    let totalSpend = 0;

    const byPackage = buy.packages.map((sp) => {
        const product = findProduct(sp.product_id);
        const option = pickPricingOption(product, sp.pricing_option_id);
        const seed = `${buy.media_buy_id}|${sp.package_id}`;
        const j = jitter(seed);
        const pacingIndex = round3(j);
        const pacingPercent = round1(j * 100);

        const isSI = sp.product_id === SI_PRODUCT_ID;
        const isCpa = option?.pricing_model === "cpa";
        const isCpm = option?.pricing_model === "cpm";

        const budget = sp.budget ?? 0;
        const expectedSpend = budget * progress;
        const actualSpend = expectedSpend * j;

        const pkgRow: Record<string, unknown> = {
            package_id: sp.package_id,
            buyer_ref: sp.buyer_ref,
            product_id: sp.product_id,
            ...(option ? {
                pricing_model: option.pricing_model,
                rate: option.fixed_price,
                currency: option.currency,
            } : {}),
            spend: round2(actualSpend),
            spend_delivered: round2(actualSpend),
            pacing_index: pacingIndex,
            pacing_percent: pacingPercent,
            delivery_status: deliveryStatusFor(progress, j),
            paused: false,
            is_final: progress >= 1,
        };

        // Volume metric: impressions OR conversations, depending on product.
        if (isSI && isCpa && option) {
            const totalConvGoal = budget / option.fixed_price; // $3.50/conv → buy says total goal
            const convDelivered = Math.round(totalConvGoal * progress * j);
            pkgRow.conversions = convDelivered;
            pkgRow.conversations_delivered = convDelivered;
            pkgRow.cost_per_acquisition = round2(option.fixed_price);
            pkgRow.by_event_type = [
                {
                    event_type: "custom",
                    event_source_id: "qualified_conversation",
                    count: convDelivered,
                },
            ];
            totalConversions += convDelivered;
        } else if (isCpm && option) {
            const totalImps = (budget * 1000) / option.fixed_price;
            const impsDelivered = Math.round(totalImps * progress * j);
            pkgRow.impressions = impsDelivered;
            pkgRow.impressions_delivered = impsDelivered;
            totalImpressions += impsDelivered;
        } else {
            // flat_rate (sponsorships): synthesize a plausible impression count
            // from a per-product audience size. Avoids leaving the volume
            // metric blank on flat-rate inventory.
            const baseAudience = audienceFloorFor(sp.product_id);
            const impsDelivered = Math.round(baseAudience * progress * j);
            pkgRow.impressions = impsDelivered;
            pkgRow.impressions_delivered = impsDelivered;
            totalImpressions += impsDelivered;
        }

        totalSpend += actualSpend;
        return pkgRow;
    });

    const buyTotals: Record<string, unknown> = {
        impressions: round2(totalImpressions),
        spend: round2(totalSpend),
        conversions: round2(totalConversions),
    };

    const payload: Record<string, unknown> = {
        media_buy_id: buy.media_buy_id,
        buyer_ref: buy.buyer_ref,
        status: progress >= 1 ? "completed" : (progress > 0 ? "active" : "pending_start"),
        currency: buy.currency,
        totals: buyTotals,
        by_package: byPackage,
    };
    return {
        payload,
        totals: { impressions: totalImpressions, conversions: totalConversions, spend: totalSpend },
    };
}

function pickPricingOption(product: Product | undefined, pricingOptionId: string | undefined): PricingOption | undefined {
    if (!product) return undefined;
    if (pricingOptionId) {
        const found = product.pricing_options.find((o) => o.pricing_option_id === pricingOptionId);
        if (found) return found;
    }
    return product.pricing_options[0];
}

interface ResolvedFlight { elapsedMs: number; durationMs: number; startMs: number; endMs: number }

function resolveFlight(buy: StoredMediaBuy, now: Date): ResolvedFlight {
    // start_time may be ISO 8601 OR the literal string "asap" (per AdCP 3.0.1
    // start-timing). Treat "asap" / missing as the buy's confirmed_at.
    const start = parseFlightTimestamp(buy.start_time, buy.confirmed_at);
    // end_time absent → assume 30-day flight from start (typical campaign).
    const end = buy.end_time ? new Date(buy.end_time).getTime() : start + 30 * 86_400_000;
    const startMs = Math.min(start, end);
    const endMs = Math.max(start, end);
    const nowMs = now.getTime();
    const elapsedMs = Math.max(0, nowMs - startMs);
    const durationMs = Math.max(1, endMs - startMs);
    return { elapsedMs, durationMs, startMs, endMs };
}

function parseFlightTimestamp(t: string | undefined, fallbackIso: string): number {
    if (!t || t === "asap") return new Date(fallbackIso).getTime();
    const parsed = new Date(t).getTime();
    return Number.isNaN(parsed) ? new Date(fallbackIso).getTime() : parsed;
}

function computeReportingPeriod(deliveries: Record<string, unknown>[], now: Date): { start: string; end: string } {
    void deliveries;
    // Lifetime-to-date is the typical default when no date range is supplied.
    // Use the earliest stored confirmed_at vs now.
    return {
        start: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
        end: now.toISOString(),
    };
}

function deliveryStatusFor(progress: number, jitterValue: number): string {
    if (progress >= 1) return "completed";
    if (jitterValue < 0.6) return "delivering"; // behind but not paused
    return "delivering";
}

function audienceFloorFor(productId: string): number {
    // Plausible total-impression budget for flat-rate inventory at full flight.
    if (productId === "slm_data_leaders_podcast") return 18_000;          // listens
    if (productId === "slm_sponsored_research_brief") return 80_000;      // brief views over flight
    if (productId === "slm_cross_channel_abm_bundle") return 1_500_000;
    return 250_000;
}

function clamp01(v: number): number {
    if (Number.isNaN(v)) return 0;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

function round1(v: number): number { return Math.round(v * 10) / 10; }
function round2(v: number): number { return Math.round(v * 100) / 100; }
function round3(v: number): number { return Math.round(v * 1000) / 1000; }

// Deterministic 0.85..1.15 jitter — same (buy, package) returns the same
// number on every poll so pacing doesn't yo-yo between calls.
function jitter(seed: string): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
    }
    const norm = (Math.abs(h) % 31) / 30; // 0..1
    return 0.85 + norm * 0.30;
}

// ── helpers ────────────────────────────────────────────────────────────────

function withContext(body: Record<string, unknown>, context: unknown): unknown {
    if (isObject(context)) return { ...body, context };
    return body;
}

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringArrayOrUndef(v: unknown): string[] | undefined {
    if (!Array.isArray(v)) return undefined;
    const out: string[] = [];
    for (const x of v) if (typeof x === "string") out.push(x);
    return out.length > 0 ? out : undefined;
}

function stringFilter(v: unknown, allowed: string[]): string | undefined {
    if (typeof v !== "string") return undefined;
    return allowed.includes(v) ? v : undefined;
}

function requireString(v: unknown, name: string): string {
    if (typeof v !== "string" || v.trim().length === 0) {
        throw toolError("INVALID_REQUEST", `\`${name}\` is required and must be a non-empty string.`);
    }
    return v;
}

function optionalString(v: unknown): string | undefined {
    return typeof v === "string" && v.length > 0 ? v : undefined;
}

function requirePackages(v: unknown): NormalizedPackage[] {
    // Per AdCP 3.0.1 package-request, required fields are product_id, budget,
    // pricing_option_id. buyer_ref is optional (we synthesize one when absent
    // so packages still cross-reference cleanly in the response). The schema
    // also accepts proposal-mode buys with no packages — but our handler
    // only implements the manual mode, so packages must be non-empty.
    if (!Array.isArray(v) || v.length === 0) {
        throw toolError("INVALID_REQUEST", "`packages` is required and must be a non-empty array.");
    }
    const out: NormalizedPackage[] = [];
    for (let i = 0; i < v.length; i++) {
        const raw = v[i];
        if (!isObject(raw)) {
            throw toolError("INVALID_REQUEST", `packages[${i}] must be an object.`);
        }
        const productId = raw.product_id;
        if (typeof productId !== "string" || productId.length === 0) {
            throw toolError("INVALID_REQUEST", `packages[${i}].product_id is required.`);
        }
        const buyerRef = typeof raw.buyer_ref === "string" && raw.buyer_ref.length > 0
            ? raw.buyer_ref
            : `pkg_buyer_ref_${i}`;
        const pkg: NormalizedPackage = { buyer_ref: buyerRef, product_id: productId };
        if (typeof raw.pricing_option_id === "string") pkg.pricing_option_id = raw.pricing_option_id;
        if (typeof raw.budget === "number") pkg.budget = raw.budget;
        if (typeof raw.impressions === "number") pkg.impressions = Math.floor(raw.impressions);
        const ps = parsePerformanceStandards(raw.performance_standards);
        if (ps) pkg.performance_standards = ps;
        if (isObject(raw.measurement_terms)) pkg.measurement_terms = raw.measurement_terms;
        out.push(pkg);
    }
    return out;
}

function parsePerformanceStandards(v: unknown): PerformanceStandard[] | undefined {
    if (!Array.isArray(v)) return undefined;
    const out: PerformanceStandard[] = [];
    for (const raw of v) {
        if (!isObject(raw)) continue;
        const metric = raw.metric;
        const threshold = raw.threshold;
        if (
            typeof metric === "string"
            && typeof threshold === "number"
            && (metric === "viewability" || metric === "ivt"
                || metric === "completion_rate" || metric === "brand_safety"
                || metric === "attention_score")
        ) {
            const ps: PerformanceStandard = {
                metric,
                threshold,
                vendor: isObject(raw.vendor) && typeof raw.vendor.domain === "string"
                    ? { domain: raw.vendor.domain }
                    : { domain: "unspecified" },
            };
            if (raw.standard === "mrc" || raw.standard === "groupm") ps.standard = raw.standard;
            out.push(ps);
        }
    }
    return out.length > 0 ? out : undefined;
}

function findPerformanceViolation(
    product: Product,
    requested: PerformanceStandard[],
): { metric: PerfMetric; requested: number; published: number; directionDesc: string } | null {
    if (!product.performance_standards || product.performance_standards.length === 0) {
        // No published standards on this product → buyer's request is
        // unverifiable, but per spec we shouldn't synthesize floors. Accept.
        return null;
    }
    for (const r of requested) {
        const published = product.performance_standards.find((p) => p.metric === r.metric);
        if (!published) continue; // we don't publish this metric → no commitment to violate
        const isFloor = FLOOR_METRICS.has(r.metric);
        if (isFloor && r.threshold > published.threshold) {
            return {
                metric: r.metric,
                requested: r.threshold,
                published: published.threshold,
                directionDesc: ">=",
            };
        }
        if (!isFloor && r.threshold < published.threshold) {
            // ivt: buyer's ceiling is stricter than ours → reject
            return {
                metric: r.metric,
                requested: r.threshold,
                published: published.threshold,
                directionDesc: "<=",
            };
        }
    }
    return null;
}

// findMeasurementTermsViolation — reject when buyer's billing-measurement
// proposal is stricter than what the product publishes:
//   - max_variance_percent: buyer < seller floor → REJECT
//     (buyer demanding ≤0% variance on a product publishing ≥5% can't be
//     honored — we'd never make our number)
//   - measurement_window: buyer's requested window must be in the product's
//     supported set (default + supported_measurement_windows)
//
// Vendor identity is NOT enforced — buyers may propose any billing vendor;
// the seller can adjust at IO time. The storyboard's relaxed probe uses a
// non-default vendor and expects acceptance.
function findMeasurementTermsViolation(
    product: Product,
    proposed: Record<string, unknown>,
): string | null {
    const sellerTerms: MeasurementTerms | undefined = product.measurement_terms;
    if (!sellerTerms) return null;
    const billing = isObject(proposed.billing_measurement) ? proposed.billing_measurement : null;
    if (!billing) return null;

    if (typeof billing.max_variance_percent === "number") {
        const floor = sellerTerms.billing_measurement.max_variance_percent;
        if (billing.max_variance_percent < floor) {
            return `requested max_variance_percent=${billing.max_variance_percent} ` +
                `is stricter than seller floor (${floor}%)`;
        }
    }

    if (typeof billing.measurement_window === "string") {
        const supported = new Set<string>([
            sellerTerms.billing_measurement.measurement_window ?? "",
            ...(sellerTerms.supported_measurement_windows ?? []),
        ].filter(Boolean));
        if (!supported.has(billing.measurement_window)) {
            return `measurement_window="${billing.measurement_window}" not supported ` +
                `(seller honors: ${[...supported].join(", ")})`;
        }
    }

    return null;
}

function optionalBudget(v: unknown): { total: number; currency: string } | undefined {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "number" && v > 0) return { total: v, currency: "USD" };
    if (isObject(v) && typeof v.total === "number" && typeof v.currency === "string") {
        return { total: v.total, currency: v.currency };
    }
    if (isObject(v) && typeof v.amount === "number" && typeof v.currency === "string") {
        // AdCP 3.0.1 create_media_buy uses {amount, currency}; accept both shapes.
        return { total: v.amount, currency: v.currency };
    }
    return undefined;
}

// AdCP 3.0.1 start_time can be the literal string "asap" or an ISO 8601
// timestamp. Either is fine; we just echo what we got.
function optionalStartTime(v: unknown): string | undefined {
    return typeof v === "string" && v.length > 0 ? v : undefined;
}

export class ToolError extends Error {
    public context?: Record<string, unknown>;
    constructor(public readonly code: string, message: string) {
        super(message);
    }
    withContext(ctx: unknown): ToolError {
        if (isObject(ctx)) this.context = ctx;
        return this;
    }
}

function toolError(code: string, message: string): ToolError {
    return new ToolError(code, message);
}

function lookupIdempotent(key: string): unknown | null {
    const entry = idempotencyCache.get(key);
    if (!entry) return null;
    if (entry.expires_at < Date.now()) {
        idempotencyCache.delete(key);
        return null;
    }
    return entry.response;
}

function storeIdempotent(key: string, response: unknown): void {
    idempotencyCache.set(key, { expires_at: Date.now() + REPLAY_TTL_MS, response });
}

function randId(): string {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function isoPlusBusinessDays(n: number): string {
    const d = new Date();
    let added = 0;
    while (added < n) {
        d.setUTCDate(d.getUTCDate() + 1);
        const day = d.getUTCDay();
        if (day !== 0 && day !== 6) added++;
    }
    return d.toISOString();
}

function minusBusinessDays(iso: string, n: number): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return isoPlusBusinessDays(0);
    let removed = 0;
    while (removed < n) {
        d.setUTCDate(d.getUTCDate() - 1);
        const day = d.getUTCDay();
        if (day !== 0 && day !== 6) removed++;
    }
    return d.toISOString();
}

export { ALL_PRODUCTS };
