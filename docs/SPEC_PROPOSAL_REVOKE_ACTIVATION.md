# AdCP Spec Proposal: `revoke_activation`

**Status:** Draft v2 (post-Addie review — May 7, 2026)
**Author:** Evgeny (signals adaptor — adcp.signal-stack.io)
**Target:** AdCP 3.1
**Domain:** signals
**Type:** new tool (additive)

---

## 1 · Problem statement

AdCP 3.0.6 already declares an `action` field on `activate-signal-request.json` with values `"activate" | "deactivate"`. Direct quote from the schema description:

> *"Deactivating removes the segment from downstream platforms, required when campaigns end to comply with data governance policies (GDPR, CCPA). Defaults to 'activate' when omitted."*

The intent is real — the field carries GDPR/CCPA compliance language and a documented downstream-removal contract. But four things are missing for the field to actually work end-to-end:

1. **No per-activation scoping.** The request takes `signal_agent_segment_id` + `destinations[]`. There's no way to address "the activation I started yesterday" — only "the signal, at these destinations, right now." If a buyer activated the same signal twice with different `pricing_option_id` or different `account` references, there's no protocol-level way to revoke one without affecting the other.
2. **No reason codes.** The action is binary. There's no way for the audit trail to distinguish a buyer's discretionary cleanup from a producer-driven consent withdrawal from a fraud-detection trigger.
3. **No async lifecycle.** `activate_signal` returns `task_id` and `tasks/get` polls for completion. The deactivate path through the same tool inherits the same lifecycle, but the task represents the deactivation request — there's no link back to the original activation `task_id` for audit-chain correlation.
4. **No published implementation.** Per the live AdCP directory + this adaptor's federation probe (May 7, 2026), no published 3.0.x agent currently honors `action: "deactivate"` on `activate_signal`. Buyers fall back to manual destination action.

The buyer's current options are:

- **`activate_signal` with `action: "deactivate"`** — declared, undefined semantics, unimplemented across the live ecosystem.
- **Manual destination action** — log into the DSP and pause the line item using the segment. Out-of-band, untraceable in the AdCP audit chain.
- **Wait for `validity_period` expiry** — producer-set only, not buyer-triggered, and not implemented in any 3.0.x adapter today.
- **No-op** — keep paying for a signal you've decided you don't want.

This proposal sharpens the existing `action: "deactivate"` intent into a first-class tool with explicit per-activation scoping, reason codes, async chain linking, and a conformance harness — closing the four gaps above without breaking the existing field.

---

## 2 · Use cases (motivation)

1. **Brand-safety incident.** A signal turns out to overlap with content the brand can't be associated with. Buyer needs to stop activation across all running destinations within minutes, with an auditable receipt.
2. **Budget reallocation.** A campaign mid-flight pivots away from a planned audience. Buyer wants to revoke specific activations without canceling the whole media buy.
3. **Producer revocation.** The data provider learns that consent for a signal cohort was withdrawn. Producer needs to push revocation downstream to every active destination, not wait for `validity_period` expiry.
4. **Governance enforcement.** A `check_governance` advisory comes back `denied` after activation. Governance gate needs to revoke retroactively.
5. **Compliance audit.** A regulator asks "show me every signal that was active for this campaign and when it was revoked." Buyer needs a complete activation-to-revocation log.
6. **Fraud / TOS violation.** Producer or platform discovers a buyer used a signal outside permitted use. Authorized agent needs to revoke and log the cause.

---

## 3 · Primitive name

**`revoke_activation`** — chosen over alternatives:

| Candidate | Why rejected |
|---|---|
| `deactivate_signal` | Already a semantic conflict with the existing `action: "deactivate"` discriminator (which is per-call, not per-activation). Risks breaking existing 3.0.x storyboards. |
| `retract_signal` | "Signal" implies producer-side cancellation (kills it for everyone). Buyer-initiated revocation only affects this buyer's activation. |
| `cancel_activation` | "Cancel" suggests pre-completion. Revocation can also fire on already-completed activations. |
| `expire_activation` | Implies time-based, which `validity_period` already covers. |

**`revoke_activation`** correctly names the surface: a specific activation (identified by `task_id`) is revoked. The signal itself remains in the catalog; other buyers' activations are unaffected.

---

## 4 · Request schema

`/schemas/3.1/signals/revoke-activation-request.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.1/signals/revoke-activation-request.json",
  "title": "Revoke Activation Request",
  "description": "Revoke a previously-activated signal at one or more of its destinations.",
  "type": "object",
  "properties": {
    "adcp_major_version": { "type": "integer", "minimum": 1, "maximum": 99 },
    "task_id": {
      "type": "string",
      "description": "The task_id returned by the original activate_signal call. Identifies which activation to revoke.",
      "pattern": "^op_[A-Za-z0-9_]+$"
    },
    "reason_code": {
      "$ref": "/schemas/3.1/enums/revocation-reason.json"
    },
    "reason_detail": {
      "type": "string",
      "maxLength": 500,
      "description": "Optional human-readable detail. Audit-only; not propagated to destinations."
    },
    "effective_at": {
      "type": "string",
      "format": "date-time",
      "description": "When the revocation should take effect. Omit for immediate. Future timestamps are scheduled. Past timestamps are rejected with VALIDATION_ERROR."
    },
    "destinations": {
      "type": "array",
      "description": "Optional: revoke only at these destinations. When omitted, revokes at every destination the original activation ran to. Identified by destination type+platform OR type+agent_url.",
      "items": { "$ref": "/schemas/3.1/core/destination.json" },
      "minItems": 1
    },
    "idempotency_key": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{16,255}$",
      "description": "Idempotency key. Repeating the same key returns the original revocation task_id without creating a new one."
    },
    "context": { "$ref": "/schemas/3.1/core/context.json" },
    "ext": { "$ref": "/schemas/3.1/core/ext.json" }
  },
  "required": ["task_id", "reason_code", "idempotency_key"],
  "additionalProperties": true
}
```

### Reason code enum (`/schemas/3.1/enums/revocation-reason.json`)

```json
{
  "type": "string",
  "enum": [
    "buyer_decision",
    "producer_revoke",
    "governance_denied",
    "consent_withdrawn",
    "fraud_detected",
    "policy_violation",
    "campaign_ended",
    "expiry"
  ],
  "enumDescriptions": {
    "buyer_decision":     "Buyer-initiated discretionary revocation. No fault attribution.",
    "producer_revoke":    "Data provider revoked authorization. Buyer notified; activation stops.",
    "governance_denied":  "check_governance returned denied after the fact. Compliance-driven.",
    "consent_withdrawn":  "Underlying user/audience consent revoked. Privacy-driven; mandatory.",
    "fraud_detected":     "Fraud or invalid traffic detected against this signal's audience.",
    "policy_violation":   "Buyer used the signal outside permitted_uses. TOS-driven.",
    "campaign_ended":     "Campaign concluded normally. Housekeeping revocation.",
    "expiry":             "validity_period elapsed. Producer-set; included for audit symmetry."
  }
}
```

---

## 5 · Response schema

`/schemas/3.1/signals/revoke-activation-response.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.1/signals/revoke-activation-response.json",
  "title": "Revoke Activation Response",
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "New task_id for THIS revocation. Distinct from original_task_id."
    },
    "original_task_id": {
      "type": "string",
      "description": "Echoes the task_id from the request — the activation being revoked."
    },
    "status": {
      "$ref": "/schemas/3.1/enums/task-status.json",
      "description": "submitted | working | completed | failed | rejected"
    },
    "reason_code": { "$ref": "/schemas/3.1/enums/revocation-reason.json" },
    "effective_at": {
      "type": "string",
      "format": "date-time"
    },
    "revoked_at": {
      "type": "string",
      "format": "date-time",
      "description": "Wall-clock timestamp the agent recorded the revocation request. Set on submitted; immutable."
    },
    "completed_at": {
      "type": "string",
      "format": "date-time",
      "description": "Set when status flips to completed (or failed)."
    },
    "deployments": {
      "type": "array",
      "description": "Per-destination revocation state. One entry per destination affected.",
      "items": {
        "type": "object",
        "properties": {
          "type":         { "type": "string", "enum": ["platform", "agent"] },
          "platform":     { "type": "string" },
          "agent_url":    { "type": "string", "format": "uri" },
          "is_revoked":   { "type": "boolean" },
          "revoked_at":   { "type": "string", "format": "date-time" },
          "ack_received": { "type": "boolean", "description": "Did the destination acknowledge the revocation?" },
          "error":        { "type": "string", "description": "Per-destination error if revocation failed there." }
        },
        "required": ["type", "is_revoked"]
      }
    },
    "errors":  { "$ref": "/schemas/3.1/core/errors.json" },
    "context": { "$ref": "/schemas/3.1/core/context.json" },
    "ext":     { "$ref": "/schemas/3.1/core/ext.json" }
  },
  "required": ["task_id", "original_task_id", "status", "reason_code", "revoked_at"],
  "additionalProperties": true
}
```

---

## 6 · State machine

```
            ┌───────────┐
revoke_activation ─────▶ │ submitted │
            └─────┬─────┘
                  │
                  ▼
            ┌───────────┐
            │  working  │  ◀──── per-destination ack pending
            └─────┬─────┘
                  │
       ┌──────────┴──────────┐
       ▼                     ▼
 ┌───────────┐         ┌───────────┐
 │ completed │         │  failed   │
 └───────────┘         └───────────┘
   all destinations      ≥1 destination
   acknowledged          rejected/timed out
```

- **submitted**: agent recorded the request, hasn't started fan-out yet.
- **working**: at least one destination still pending acknowledgment.
- **completed**: every destination in `deployments[]` has `is_revoked=true && ack_received=true`.
- **failed**: at least one destination rejected or timed out. `deployments[i].error` populated.
- **rejected**: request itself was invalid (unknown task_id, unauthorized buyer, expired idempotency window).

---

## 7 · Async semantics

- **Polling**: same `tasks/get` surface as `activate_signal` (per `vendor/adcp/adcp-3.0.6/schemas/bundled/core/tasks-get-response.json`). The new revocation `task_id` is queryable identically — buyer calls `tasks/get` with the revocation `task_id` to get terminal state.
- **Webhook**: optional `webhook_url` can be passed via `context.webhook_url` in the request. Same HMAC-SHA256 signing contract as `activate_signal` webhooks.
- **Synchronous variant**: agents MAY choose to return `status: completed` immediately if all destinations support sync revocation. Buyers MUST handle either case.

---

## 8 · Audit + receipt contract

Every revocation produces:

1. A new **revocation task** persisted alongside the original activation (`task_id` + `original_task_id` linked).
2. Per-state-change events in the activation audit log:
   - `revocation_submitted`
   - `revocation_destination_ack_received` (one per destination)
   - `revocation_destination_failed` (when applicable)
   - `revocation_completed`
   - `revocation_failed`
3. Webhook payloads on each terminal state transition.

The `original_task_id ↔ revocation task_id` link MUST be queryable in both directions via `tasks/get`:
- `tasks/get` with `task_id = <original_task_id>` returns `revoked_by: <revocation_task_id>` in the task envelope when revoked.
- `tasks/get` with `task_id = <revocation_task_id>` returns `original_task_id` in the response payload.

This linkage is the auditable correlation between the activation lifecycle and its revocation lifecycle — neither task is the other's parent; they're peer tasks bound by `original_task_id`.

---

## 9 · Authorization

| Caller role | Permission |
|---|---|
| Buyer who originally activated | Always allowed. |
| Different buyer | Rejected with `UNAUTHORIZED`. |
| Authorized agent in producer's `adagents.json` | Allowed for `producer_revoke`, `consent_withdrawn`, `fraud_detected`, `policy_violation`, `expiry`. |
| Producer (data_provider_domain owner, verified via DNS) | Same as authorized agent. |
| Anonymous / unauthenticated | Rejected with `UNAUTHORIZED`. |

**Reason-code-scoped authorization** is required: `buyer_decision` is buyer-only; `producer_revoke` is producer-only; `governance_denied` requires governance-domain authorization; etc.

---

## 10 · Backwards compatibility

- **Additive only.** Adding a new tool name doesn't break any existing handler.
- **Existing `action: "deactivate"` field on `activate_signal` is preserved.** Its GDPR/CCPA-driven downstream-removal semantics (per the schema description) carry into `revoke_activation` as the equivalent of `reason_code: "consent_withdrawn"` or `reason_code: "campaign_ended"`. New callers SHOULD migrate to `revoke_activation` for the per-activation scoping + reason-code audit trail; the existing field continues to work for callers who don't need either.
- **Spec text alignment.** `activate-signal-request.json` description references "data governance policies (GDPR, CCPA)" — the new tool's `consent_withdrawn` reason code is the canonical surface for that exact use case. Cross-link the schema descriptions when the proposal lands.
- **`validity_period` expiry** continues to work; expiry generates a synthetic `revocation_completed` event with `reason_code: "expiry"` so the audit chain is uniform regardless of trigger.
- **Adapters that don't implement `revoke_activation`** return the standard `TOOL_NOT_FOUND` error. Buyers fall back to the existing `activate_signal` `action: "deactivate"` field (with all its undefined-scoping caveats) or to manual destination action.

---

## 11 · Worked example

### Request (MCP tools/call)

```json
{
  "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": {
    "name": "revoke_activation",
    "arguments": {
      "task_id": "op_1778079024826_f7856e532c85cd17",
      "reason_code": "governance_denied",
      "reason_detail": "Brand-safety overlap with restricted content category",
      "idempotency_key": "rev_be04bba2c4b241c3bdb44c8123",
      "context": {
        "correlation_id": "wf_2026-05-07_brand-safety-incident-42"
      }
    }
  }
}
```

### Response (synchronous case)

```json
{
  "task_id": "op_1778079111234_a7d9c1e3b5f0a2c4",
  "original_task_id": "op_1778079024826_f7856e532c85cd17",
  "status": "completed",
  "reason_code": "governance_denied",
  "effective_at": "2026-05-07T14:30:00Z",
  "revoked_at":   "2026-05-07T14:30:00Z",
  "completed_at": "2026-05-07T14:30:01Z",
  "deployments": [
    { "type": "platform", "platform": "the_trade_desk", "is_revoked": true,  "revoked_at": "2026-05-07T14:30:00Z", "ack_received": true },
    { "type": "platform", "platform": "dv360",          "is_revoked": true,  "revoked_at": "2026-05-07T14:30:01Z", "ack_received": true },
    { "type": "agent",    "agent_url": "https://liveramp.com/.well-known/adcp/signals", "is_revoked": false, "ack_received": false, "error": "Destination unreachable; will retry" }
  ],
  "context": { "correlation_id": "wf_2026-05-07_brand-safety-incident-42" }
}
```

### Response (async case)

```json
{
  "task_id": "op_1778079111234_a7d9c1e3b5f0a2c4",
  "original_task_id": "op_1778079024826_f7856e532c85cd17",
  "status": "submitted",
  "reason_code": "governance_denied",
  "effective_at": "2026-05-07T14:30:00Z",
  "revoked_at":   "2026-05-07T14:30:00Z"
}
```

Buyer polls `tasks/get` with `task_id=op_1778079111234_a7d9c1e3b5f0a2c4` for terminal state.

---

## 12 · Storyboard sketch (conformance harness)

```yaml
# /compliance/3.1/domains/signals/scenarios/revoke_activation_buyer_decision.yaml
id: revoke_activation_buyer_decision
phase: post_buy
description: Buyer revokes an activation mid-campaign with reason_code=buyer_decision.

steps:
  - id: activate
    tool: activate_signal
    state: completed
    capture: { task_id }

  - id: revoke
    tool: revoke_activation
    args:
      task_id: ${activate.task_id}
      reason_code: buyer_decision
      idempotency_key: rev_test_${run_id}
    expect_status: completed
    expect_envelope_field_present: original_task_id

  - id: verify_chain
    tool: tasks/get
    args: { task_id: ${activate.task_id} }
    expect_response_field:
      revoked_by: ${revoke.task_id}

  - id: idempotency_replay
    tool: revoke_activation
    args:
      task_id: ${activate.task_id}
      reason_code: buyer_decision
      idempotency_key: rev_test_${run_id}
    expect_response_field:
      task_id: ${revoke.task_id}   # same id, not a new one
```

Additional scenarios (one per reason code): `producer_revoke`, `governance_denied`, `consent_withdrawn`, `fraud_detected`, `policy_violation`, `campaign_ended`, `expiry`.

---

## 13 · Test plan (minimum)

- Revoke same-buyer happy path → `completed` synchronously.
- Revoke different-buyer → `UNAUTHORIZED`.
- Revoke unknown `task_id` → `NOT_FOUND`.
- Revoke already-revoked task → idempotent return of the original revocation `task_id`.
- Idempotency key reuse → returns first revocation's `task_id`.
- Async: revocation produces webhook on completion, signed per existing webhook contract.
- Per-destination partial failure → status `failed`, errored destination has `error` populated, others `is_revoked: true`.
- `effective_at` in past → `VALIDATION_ERROR`.
- `effective_at` in future → revocation status stays `submitted` until effective time, then auto-promotes.
- Reason-code-scoped authorization: `producer_revoke` from non-producer caller → `UNAUTHORIZED`.

---

## 14 · Open questions

1. **Producer-initiated revocation**: how does a producer push revocation when the original `task_id` lives in the buyer's audit chain? Possible answer: producer calls a separate `revoke_signal_at_buyer(buyer_agent_url, signal_id)` that the buyer's agent translates into per-task revocations. Out of scope for this proposal; flag as follow-up.
2. **Cascade semantics**: if a signal feeds an activation chain (signal → derived signal → activation), does revoking the source signal cascade? Recommend NO for v1 — explicit revocation per task only. Cascade can be a v2 concern.
3. **Pricing reconciliation**: revoking an activation mid-billing-period — does the buyer get a refund / credit? Out of scope for the protocol; commercial layer concern.
4. **Effective-at scheduling backend**: who runs the timer for future-dated revocations? Recommend the agent that received the request; DSPs can poll if they care.
5. **Privacy budget restoration**: if a clean-room signal is revoked, is the privacy budget refunded? Defer to clean-room-specific spec.

---

## 15 · Filing path

This proposal can be filed as a GitHub issue against `adcontextprotocol/adcp` with the title:

> `[proposal] revoke_activation — canonical buyer/producer revocation primitive (signals domain)`

Body: paste sections 1–14 above. Tag `domain:signals`, `kind:proposal`, `priority:high`.

---

## 16 · Related work

- AdCP issue [#4009](https://github.com/adcontextprotocol/adcp/issues/4009) — storyboard `activate_on_agent` step missing required fields. Adjacent surface; the same audit-chain principles apply.
- AdCP `validity_period` — producer-side time-bound expiry. **NOT a substitute** for buyer-initiated revocation; this proposal explicitly closes that gap.
- AdCP `check_governance` (3.0.6) — produces governance advisories that this proposal's `governance_denied` reason code consumes.

---

## 17 · Workshop close-out one-liner

> *"AdCP today has no canonical retraction primitive — once a signal is activated, the buyer's only options are manual destination action or `validity_period` expiry. We propose `revoke_activation`: clean, narrow, demonstrably missing, and the strongest spec-proposal candidate from this round-robin."*
