# Signal Ledger Media — AdCP Seller Agent

A B2B publisher sales agent implementing the AdCP 3.0.1 media-buy protocol on
Cloudflare Workers. Separate from the Signals Adaptor in the repo root — it
shares no code, no bindings, and no deploy target.

**Status:** passes the `media_buy_seller` storyboard suite **36/36** at
`@adcp/client@5.25.1`.

---

## Tools

| Tool | Auth | Notes |
|---|---|---|
| `get_adcp_capabilities` | public | `protocols` filter, `adcp.idempotency`, context echo. Public so directory/conformance probes can discover the agent pre-handshake. |
| `get_products` | bearer | 6 products. ABM-intent briefs rank the bundle proposal first. Filters: `format_ids`, `delivery_type`, `pricing_model`. |
| `create_media_buy` | bearer | Three response shapes; idempotency replay; `TERMS_REJECTED` validation. |
| `get_media_buy_delivery` | bearer | Per-package metrics; impressions vs. conversations by product. |
| `list_creative_formats` | bearer | 4 formats with full asset specs. Filter by `type` or `format_ids`. |

Discovery methods (`initialize`, `tools/list`, `ping`) are public. `tools/call`
requires `Authorization: Bearer $ADCP_TEST_TOKEN`, except
`get_adcp_capabilities`. Auth failures return HTTP 401 with an RFC 6750
`WWW-Authenticate` header **and** a well-formed JSON-RPC error body.

### Auth posture (fails closed)

Posture is resolved per request from env, in `src/auth.ts`:

| `ADCP_TEST_TOKEN` | `ALLOW_UNAUTHENTICATED` | `ENVIRONMENT` | Posture |
|---|---|---|---|
| set, ≥16 chars | any | any | `enforced` |
| set, <16 chars | any | any | `misconfigured` |
| unset | `"true"` | not production | `open` |
| unset | `"true"` | `production` | `misconfigured` |
| unset | unset / anything else | any | `misconfigured` |

Under `misconfigured` the worker refuses **every** route with
`503 AUTH_NOT_CONFIGURED`, including `/health`. That is intentional: a
deploy that is visibly down gets fixed, while one that silently serves
unauthenticated `create_media_buy` gets transacted against. Uptime checks
fail loudly for the same reason.

`ALLOW_UNAUTHENTICATED` only accepts the literal string `"true"`, and is
refused outright in production, so flipping `ENVIRONMENT` to production
cannot leave the escape hatch open behind you.

---

## Catalog

| Product | Delivery | Pricing | Format |
|---|---|---|---|
| Executive Insight Display | guaranteed | `cpm` $45 | `b2b_native_card` |
| Sponsored Research Brief | guaranteed | `flat_rate` $25K | `research_brief_sponsorship` |
| Data Leaders Podcast Sponsorship | guaranteed | `flat_rate` $18K | `podcast_host_read_30` |
| AI Buying Assistant Sponsorship | non_guaranteed | `cpa` $3.50 | `ai_sponsored_agent` |
| ABM Display Extension | guaranteed | `cpm` $65 | `b2b_native_card` |
| Cross-Channel ABM Bundle | guaranteed | proposal, $150K floor | (bundle of 3) |

### Why the SI product is `cpa`, not `cost_per_conversation`

The AI Buying Assistant is sold per **qualified conversation** ($3.50, defined
as a ≥3-turn intent-matched exchange). AdCP 3.0.1 has no native
conversation-pricing model, so the wire encoding is:

```json
{ "pricing_model": "cpa",
  "event_type": "custom",
  "custom_event_name": "qualified_conversation",
  "fixed_price": 3.50 }
```

`cost_per_conversation` appears **only** in human-facing description copy —
never as an enum value. A strict buyer agent validating `pricing_model`
against the spec enum would reject it. When a conversation-native event type
lands in a later AdCP version, this normalizes without changing buyer-facing
semantics.

---

## TERMS_REJECTED

Two validators run in series on `create_media_buy`. Buy-level proposals apply
to every package; per-package values override for that package.

**1. `performance_standards`** — decimal thresholds, 0..1. Floor metrics
(`viewability`, `completion_rate`, `brand_safety`, `attention_score`) reject
when the buyer's ask exceeds the product's published floor. `ivt` is a ceiling
and rejects when the buyer's ask falls below ours.

**2. `measurement_terms`** — reject when `max_variance_percent` is below our
5% floor, or `measurement_window` is outside `[c7, live, post_ivt]`. Billing
vendor identity is deliberately **not** enforced — buyers may propose any
vendor; that is settled at IO time.

The published floor is the contract: a buyer asking for exactly what we
publish is accepted; one basis point stricter is rejected.

```
viewability 0.70 → accepted     max_variance_percent 5  → accepted
viewability 0.71 → TERMS_REJECTED   max_variance_percent 0  → TERMS_REJECTED
```

Errors return `isError: true` with `structuredContent.errors[0].code`, and
echo the caller's `context` — success and error paths both round-trip it.

---

## Delivery metrics

`get_media_buy_delivery` returns spec-canonical field names alongside
convenience aliases (the response schema is `additionalProperties: true`, so
both ride together):

| Concept | Spec name | Alias |
|---|---|---|
| Volume (display/audio) | `impressions` | `impressions_delivered` |
| Volume (SI) | `conversions` | `conversations_delivered` |
| Pace | `pacing_index` (1.0 = on track) | `pacing_percent` |

The SI package reports `conversations_delivered` **instead of** impressions,
plus a `by_event_type` row for `qualified_conversation`.

Delivery is synthesized from stored buy state: progress is elapsed/total
flight, scaled by a deterministic hash-of-`(media_buy_id, package_id)` pacing
factor in 0.85–1.15. Same buy polls to the same numbers every time — pacing
does not yo-yo between calls.

---

## Running locally

```bash
npm install
cp .dev.vars.example .dev.vars   # then set a token of 16+ chars
npm run dev                      # http://127.0.0.1:8788
```

Health check: `GET /health`. MCP endpoint: `POST /mcp`. A 503 with
`AUTH_NOT_CONFIGURED` means the token is missing or too short.

```bash
npm run type-check   # tsc --noEmit, strict
npm test             # vitest — auth posture matrix
npm run build:check  # wrangler deploy --dry-run, no credentials needed
```

CI (`.github/workflows/seller-agent-ci.yml`) runs all three on any PR
touching `seller-agent/**`, plus a live fail-closed assertion against a real
`wrangler dev` process with no token configured. The repo-root Deploy
workflow and the Cloudflare Workers Build cover only the signals adaptor and
tell you nothing about this subproject.

### Conformance

```bash
npx @adcp/client@latest --save-auth signal-ledger http://127.0.0.1:8788/mcp --auth <your-token>
npx @adcp/client@latest storyboard run signal-ledger media_buy_seller --allow-http
```

`--allow-http` is required for localhost and marks results unpublishable. The
auth flag is `--auth`, not `--token`.

---

## Known limitations

These are deliberate, not oversights:

1. **SI disclosure is not yet enforced at buy time.** `ai_sponsored_agent`
   documents its FTC disclosure obligation, but `create_media_buy` only checks
   that the product resolves — it does not require the buyer to accept a
   format carrying `disclosure_required: true`. Since disclosure is a billing
   precondition for this inventory, that gap is real. Deferred because adding
   a required accepted-formats field breaks storyboard clients that do not
   send one.
2. **State is per-isolate and in-memory.** Both the idempotency cache and the
   media-buy store are `Map`s scoped to the Worker isolate. Requests land on
   different isolates, so on a real deploy `get_media_buy_delivery` would
   return `MEDIA_BUY_NOT_FOUND` for a buy created moments earlier, and a
   retried `create_media_buy` would miss the replay cache and create a
   **duplicate buy**. The advertised `replay_ttl_seconds: 86400` is a promise
   this storage cannot keep. **This is the blocker on deploying at all** —
   KV or D1 first.
3. **`delivery_measurement` is absent on products.** `measurement_terms` ships;
   its sister field (provider + methodology notes) does not.
4. **Single-tenant.** No account resolution — `account` is accepted and
   ignored rather than scoping the catalog or the stores.
5. **Placeholder domains.** `publisher_properties[].publisher_domain`
   (`signalledgermedia.example.com`) and `format_ids[].agent_url` point at
   non-resolving hosts. Buyers fetch `adagents.json` from `publisher_domain`
   to validate agent authorization, so these must be real before deploy.
