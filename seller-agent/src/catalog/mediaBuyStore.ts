// In-memory media buy store. Lives for the lifetime of the Worker isolate;
// production swap-in is KV/D1, scoped per-account. The store records just
// enough to compute plausible delivery metrics on demand:
//   - flight window (start/end_time)
//   - per-package product_id + pricing_option_id + budget
// Pricing rates and pricing_model live on the catalog; the delivery handler
// resolves them from the product on each call so a catalog edit takes effect
// without rewriting stored buys.
//
// Bundle-proposal buys (status=submitted) are NOT stored — they have no
// media_buy_id yet.

export interface StoredPackage {
    package_id: string;
    buyer_ref: string;
    product_id: string;
    pricing_option_id?: string;
    /** Per-package budget allocation in the buy's currency. */
    budget?: number;
}

export interface StoredMediaBuy {
    media_buy_id: string;
    buyer_ref: string;
    confirmed_at: string;
    /** ISO 8601 or the literal "asap". */
    start_time?: string;
    end_time?: string;
    currency: string;
    total_budget?: number;
    packages: StoredPackage[];
    status: "pending_creatives" | "pending_start" | "active" | "completed" | "canceled";
}

const store = new Map<string, StoredMediaBuy>();

export function persistMediaBuy(buy: StoredMediaBuy): void {
    store.set(buy.media_buy_id, buy);
}

export function getMediaBuy(id: string): StoredMediaBuy | undefined {
    return store.get(id);
}

export function listMediaBuys(): StoredMediaBuy[] {
    return Array.from(store.values());
}

/** Test-only: clear between unit tests. Not exposed via any tool. */
export function _resetMediaBuyStore(): void {
    store.clear();
}
