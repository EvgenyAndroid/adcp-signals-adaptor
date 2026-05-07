# Discussion thread: signal payments + multi-agent royalty in AdCP

**Status:** Open question / framing for AAO + Signals & Measurement WG
**Author:** Evgeny — adcp.signal-stack.io
**Date:** 2026-05-07
**Companion to:** `docs/SPEC_PROPOSAL_REVOKE_ACTIVATION.md` (separate, prescriptive proposal)

---

## Why this is a discussion thread, not a proposal

The `revoke_activation` primitive is shippable from spec design alone — the gap is observable, the use cases are clean, and conformance can be tested in <10 storyboards.

**Signal payments is different.** The protocol design depends on how vendors actually want to express commercial relationships, and those answers live in vendor finance / partnerships orgs, not in protocol engineering. Writing a schema before that conversation lands a field that gets ignored.

This thread surfaces the gap, maps what the spec models today, and asks the questions that need vendor input before any proposal is drafted.

---

## What 3.0.6 already models for signal payments

Three primitives carry the entire payments surface:

| Stage | Surface | Reference |
|---|---|---|
| **Discovery** | `pricing_options[]` (REQUIRED on every signal, `minItems: 1`) with five discriminated models: `cpm` / `percent_of_media` (TTD-style with optional `max_cpm` cap) / `flat_fee` / `per_unit` / `custom` | `vendor/adcp/adcp-3.0.6/schemas/core/signal-pricing.json` |
| **Commitment** | `pricing_option_id` recorded on `activate_signal` request | `vendor/.../signals/activate-signal-request.json` |
| **Settlement hint** | `report_usage` in the **account domain** carries `vendor_cost`, `currency`, `pricing_option_id`, `impressions`, `media_spend`, `signal_agent_segment_id`, idempotency-keyed | `vendor/.../account/report-usage-request.json` |
| **Financial state** | `get_account_financials` (invoice history, payment_terms, payment_status) | `vendor/.../account/get-account-financials-response.json` |

**What this gets right:** the rate is declared at discovery, the buyer's commitment is recorded at activation, and post-campaign usage is reportable. Idempotent. Multi-account. Multi-campaign per request.

**What's intentionally out of scope today:** money movement itself. AdCP describes the rate, records the commitment, hints at usage. Settlement is bilateral.

---

## How signal vendors actually get paid (real-world taxonomy)

| Pattern | Frequency | Spec support | Trust model |
|---|---|---|---|
| Direct license bundle (Experian → DSP, monthly) | Most common | `flat_fee` describes; billing is contract-driven | Off-protocol, contractual |
| CPM markup per impression | Common | `cpm` + `report_usage` provides reconciliation hint | DSP self-reports impressions; vendor trusts or audits offline |
| Percent of media (TTD) | TTD-and-similar | `percent_of_media` + `max_cpm` cap | Same trust model as CPM |
| Subscription / data feed | Mid-market | `flat_fee` (period: monthly/quarterly/annual) | Pay-per-period regardless of usage |
| Custom enterprise | Largest deals | `custom` model — explicit escape hatch | Bespoke contracts; protocol records, doesn't regulate |

**In every case: actual money movement happens OUT of the protocol.** Worth saying out loud.

---

## The gaps we observed

### 1. `report_usage` is a one-way push, not a settlement protocol

Orchestrator TELLS the vendor *"you earned X for serving signal Y in campaign Z."* Vendor trusts the report or audits offline. There's no on-protocol challenge / dispute / reconciliation. The vendor's ledger is the de-facto source of truth in disputes; buyer has no symmetric audit handle.

### 2. The signal vendor never sees the bid stream

Vendor depends entirely on the orchestrator for accurate impression counts. Trust gap is bridged by contract enforcement, periodic audits, and reputation discounts on fraud-detected reports. There's no cryptographic proof of *"this impression actually happened with this signal active."*

### 3. Multi-agent orchestration has no royalty model — the biggest gap

Real production chain:

```
Brand → Agency → DSP/Orchestrator → Reseller Agent (e.g., LiveRamp) → Source Agent (e.g., Polk) → Data Owner (e.g., DMV records, off-protocol)
```

When an impression fires, money should flow through the whole chain. AdCP today supports the **first hop** (DSP → LiveRamp via `report_usage`). Everything below is bilateral commercial agreement, off-protocol.

What's missing:
- No `revenue_share[]` field on `pricing_option` to declare the split at discovery.
- No vendor-to-vendor `report_usage` for upstream propagation.
- `signal_id.source: "catalog"` carries `data_provider_domain` (the source) but only as identity, not as a payment beneficiary.

### 4. No negotiation primitive

`pricing_options[]` is take-it-or-leave-it. Buyer picks from N pre-published options. No counter-offer, no volume tier renegotiation, no escalation-to-sales path. Big enterprise deals fall back to `custom` model + off-protocol contracts.

### 5. No payment-term lock at activation

`payment_terms` lives on `get_account_financials`, not on the activation. Vendor can change terms between activation and `report_usage`. Buyer has no signed term sheet.

### 6. Currency federation is naive

Each `pricing_option` declares its own currency. A multi-vendor campaign mixing USD/EUR/GBP forces the orchestrator to normalize at billing time. No FX rate lock, no conversion attestation, no hedge primitive.

### 7. No idempotent settlement close-out

`idempotency_key` on `report_usage` prevents double-billing on retries. But no protocol primitive for *"settle this period and freeze it."* Corrections after settlement go through bilateral processes.

---

## Framing questions for the WG

Before drafting any payments-domain proposal, these questions need vendor / commercial input. They're listed in priority order by my read of the gap surface — happy to be reordered by the WG.

### Q1 — Would signal vendors publish chain royalty splits at discovery?

If a `pricing_option` carried a `revenue_share[]` field with `[{ recipient: "polk.com", share_percent: 65, role: "data_provider" }, { recipient: "self", share_percent: 35, role: "reseller_agent" }]`, would real vendors populate it?

**Initial framing (v1):** binary fork — yes pivots to `revenue_share[]`; no pivots to signed receipts + chain-of-custody.

**Refined framing (v2, post-Addie feedback):** the answer is almost certainly **not binary**. Two reasons:

**1. Hybrid is the realistic outcome, not a clean fork.** Even one major data owner refusing to publish forces the protocol to support BOTH modes. `revenue_share[]` becomes an OPTIONAL field on `pricing_option`; signed-receipts-with-chain-of-custody becomes the MANDATORY baseline that works regardless of disclosure preference. Vendors pick per pricing option whether to populate the share array. The protocol carries both designs simultaneously rather than choosing.

**2. The answer differs by data category.** Commercial disclosure tolerance varies along a gradient:

| Category | Disclosure tolerance | Likely default |
|---|---|---|
| Commodity segments (contextual, basic demographics) | High — vendors compete on price; splits are commoditized | Publish |
| Deterministic identity graph (RampID, UID2 cohorts, hashed-email matches) | Low — high IP, splits are commercial secrets | Opaque |
| Modeled lookalikes / propensity scores | Mixed — depends on whether the modeling pipeline is the moat | Per-vendor decision |
| Subscription bundles (flat-fee data feeds) | N/A — not impression-based | Out of scope for `revenue_share[]` |

A vendor like Experian might publish splits on commodity demographic segments AND keep them opaque on their proprietary identity graph — both pricing options on the same vendor agent.

**Implications for the design:**
- `revenue_share[]` MUST be optional, per-pricing-option (not per-vendor or per-signal).
- Signed receipts + chain-of-custody MUST be the baseline (works without disclosure).
- Buyers see the chain at discovery only when ALL hops opt in; otherwise see "share withheld" markers.
- Conformance harness must test both modes — the spec ships valid even when no vendor populates the share array.

This means the design is additive in TWO directions, not a fork. The WG decides priority order, not exclusivity.

### Q2 — Push or pull for upstream propagation?

When DSP reports usage to LiveRamp, how does Polk get paid?

- **Push:** buyer/orchestrator fan-outs `report_usage` to each recipient. Requires the buyer to know the chain (couples buyer to upstream).
- **Pull:** each vendor reports up to its own upstream after settling with downstream. Vendor-to-vendor `report_usage` is the missing primitive. Chain stays opaque to the buyer.

Pull is more commercially realistic but introduces a vendor-to-vendor settlement protocol that doesn't exist today.

### Q3 — What's the dispute / reconciliation primitive?

When the buyer's `report_usage` says "8.4M impressions" and the vendor's edge logs say "9.1M impressions," who wins?

Today: vendor's ledger, by default. Off-protocol arbitration if it matters enough.

A standardized dispute primitive could be:
- A `reconcile_usage` tool that returns the diff
- Vendor-side acceptance / counter-offer of the buyer's report
- Time-bounded settlement window after which the report freezes

Is there appetite for this, or does every vendor / buyer prefer to handle disputes off-protocol with bilateral contracts?

### Q4 — Should activation receipts be cryptographically signed?

`task_id` is currently opaque random (`op_<timestamp>_<hex>` in our adapter — verified during workshop deck audit). This means a vendor's activation ledger is the source of truth in any dispute; the buyer has no signed receipt to present.

A signed `task_id + activation_key + pricing_option_id + timestamp` envelope (HMAC or ed25519) would let:
- Buyers prove activation happened with a specific commitment (for billing arbitration)
- Upstream vendors verify the chain (for royalty propagation)
- Auditors / regulators / clean rooms have a verifiable receipt

Is this worth specifying? Or is it overkill given today's bilateral-trust model is mostly working?

### Q5 — How do `flat_fee` and subscription deals fit a multi-agent chain?

The `cpm` / `percent_of_media` / `per_unit` models all scale with usage — easy to imagine a `revenue_share` split. But `flat_fee` is per-period regardless of usage. If a flat-fee data bundle's signals get re-sold downstream:

- Does the upstream get a flat cut of the downstream flat fee? Per-period or per-license?
- Does the share scale with reseller's subscriber count?
- How do you express that on a `pricing_option`?

`flat_fee + revenue_share` may not compose cleanly. Worth WG discussion.

### Q6 — Currency federation: lock at activation, or float at settlement?

Multi-vendor campaign has 4 signals: 2 USD-priced, 1 EUR, 1 GBP. Buyer activates all 4 today. Settlement happens 30 days later. FX moved 5%.

Options:
- **Lock at activation:** vendor declares a 30-day-valid FX quote on `activate_signal` response. Settlement uses the locked rate.
- **Float at settlement:** `report_usage` carries the rate-as-of-impression. Buyer absorbs the FX risk.
- **Vendor's call:** vendor's `pricing_option` declares which model.

Hedge instruments (collars, forwards) are out of scope for the protocol — but the lock-vs-float choice should probably be on-spec.

### Q7 — Is there a need for `negotiate_pricing` as a tool?

Most vendors today either publish their rate card (`pricing_options[]`) or escalate to sales out-of-protocol. Big enterprise deals (millions/year) negotiate volume tiers, custom rate cards, hold-back clauses, etc.

A `negotiate_pricing` tool would let buyers send `{quantity, period, terms}` and get back a counter-offer or escalation. Async like `activate_signal`.

Or: the existing `custom` model + off-protocol email is fine and the protocol shouldn't try to model commercial negotiation. Most vendors will probably say the latter; worth confirming.

---

## What I'm asking for

Three things, in order:

1. **Get this thread in front of vendor finance / partnerships people.** Q1 (would you publish chain royalty splits?) is the fork; the rest of the design depends on it.
2. **Surface real horror stories** about today's settlement model — disputes that took months to resolve, currency mismatches that ate margin, multi-agent chains that broke because someone in the middle wasn't paid. Real cases drive better proposals than theoretical ones.
3. **Decide whether this is a payments-domain track at all** or whether the right model is "extend `pricing_option` + `report_usage` incrementally and keep settlement off-protocol." Both are valid; the WG should pick.

If Q1 lands "no — splits are commercial secrets," the design pivots to **signed activation receipts + chain-of-custody** as the central primitive. That's a meaningfully different proposal than `revenue_share[]`.

If Q1 lands "yes — we'd publish splits if other vendors do too," then `revenue_share[]` is the smallest first step and `pricing_option_id` propagation in `report_usage` becomes the second.

Either way, **we shouldn't draft a schema before this conversation happens.**

---

## Suggested ordering once the WG aligns on direction

If the WG decides to pursue this, my read on realistic ordering:

1. **`revenue_share[]` extension on `pricing_option`** (Q3 2026) — declarative split. Smallest most-needed first piece. Optional field — vendors who don't want to publish leave it null.
2. **Signed activation receipts** (Q3 2026) — chain-of-custody foundation. Depends on cross-vendor webhook signing alignment landing first (separate gap; HMAC-v1 vs GA profile's ed25519/ecdsa-p256-sha256).
3. **Vendor-to-vendor `report_usage`** (Q4 2026) — generalize the existing tool. New `report_usage_upstream` if the existing surface can't be extended cleanly.
4. **Settlement-period close-out / `freeze_period`** (Q1 2027) — explicit "this period is settled, no more corrections" primitive.
5. **Negotiation primitive** (parking-lot — most vendors will not implement) — `negotiate_pricing` async tool. Worth scoping if at least 3 vendors say they'd implement.

**Revised ordering (v2, post-Addie feedback):** because Q1 is non-binary, the rollout becomes **additive in two directions** rather than sequential:

- **Track A (always-on baseline):** signed activation receipts + chain-of-custody. Works regardless of disclosure preference. Lays the audit foundation that every other primitive depends on.
- **Track B (opt-in by data category):** `revenue_share[]` extension on `pricing_option`. Vendors publish splits where commercial disclosure is acceptable (commodity segments); leave null on proprietary surfaces.
- **Track C (depends on A + B):** vendor-to-vendor `report_usage` upstream propagation. Uses signed receipts (Track A) as the proof carrier; uses revenue_share where present (Track B) for declarative routing, falls back to bilateral commercial agreement otherwise.
- **Track D (independent):** settlement period close-out (`freeze_period`).
- **Track E (parking-lot):** negotiation primitive.

**Track A is the gating dependency** for everything else — start there.

This is a **multi-PR program over 9-12 months**, not a single proposal. The retraction primitive is shippable in weeks; payments needs commercial-side validation as the gating step.

---

## Routing strategy across WGs

This thread is currently in the Signals & Measurement WG. Schema implications (the eventual `pricing_option` extension, the receipt envelope, the new tools) are Technical Standards WG territory.

**Recommendation:** keep the substantive discussion in Signals & Measurement until directional alignment lands (Q1 + Q4), then bring a focused schema spec to Technical Standards. Two reasons:

1. **Premature schema discussion crowds out commercial framing.** Technical Standards will reflexively want field names and JSON Schema sketches; the current questions (Q1, Q5) need vendor finance / partnerships people in the room first. Mixing audiences risks the conversation collapsing into syntax.
2. **A short heads-up note to Technical Standards** is still worth posting now, so they're not surprised when the schema work arrives and can flag any cross-domain implications early (e.g., interactions with `media-buy` `report_usage`, `account` `get_account_financials`).

Suggested heads-up message to Technical Standards WG:
> *Heads-up: payments-domain framing discussion is underway in Signals & Measurement (link to this doc). Schema implications include `revenue_share[]` extension on `pricing_option`, signed activation receipt envelope, vendor-to-vendor `report_usage`. Bringing detailed schema work here once the WG aligns on direction (Q1 in the doc is the fork). No action needed yet — flagging for awareness.*

This keeps Technical Standards in the loop without flooding their channel with commercial-side framing they can't directly action.

---

## Companion artifact

For the focused single-tool proposal that IS shippable today (canonical signal revocation), see `docs/SPEC_PROPOSAL_REVOKE_ACTIVATION.md`. That one's filed via `gh issue` once the WG triage owner is identified.

— Ev (adcp.signal-stack.io)
