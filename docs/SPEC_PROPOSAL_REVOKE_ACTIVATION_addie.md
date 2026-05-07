# Proposal for Addie / AAO: `revoke_activation` (signals domain)

Hey Addie — workshop close-out from the May 7 round-robin surfaced a gap I'd like to push through the working group. Sharing the proposal here so you can route it to whoever owns the signals-domain backlog.

## TL;DR

**Gap:** AdCP 3.0.6 has no protocol-level way for a buyer to stop using a signal mid-campaign once it's been activated to a destination. The buyer's only options today are manual destination action (out-of-band, untraceable) or producer-set `validity_period` (which isn't buyer-triggered and isn't implemented in any 3.0.x adapter I've seen).

**Proposal:** add a new tool `revoke_activation` to the signals domain. Async-by-default, reason-coded, reason-scoped authorization, reuses `get_operation_status` + the existing webhook signing contract. Clean greenfield, additive only, backwards-compatible.

**Why now:** demonstrably missing on the wire today. Walked through the workshop crowd, every adopter recognized it. Cleanest spec-proposal candidate from the round-robin.

---

## Design choices (1 line each)

1. **Name: `revoke_activation`** — not `deactivate_signal` (conflicts with existing `action: "deactivate"` discriminator), not `retract_signal` (kills it for everyone, wrong scope), not `cancel_activation` (implies pre-completion). Revocation targets a specific `task_id`; the signal itself stays in catalog; other buyers' activations untouched.
2. **Async-by-default** — same lifecycle as `activate_signal`. Returns a new `task_id`; buyers poll via `get_operation_status` or receive webhook. Sync return permitted when every destination supports immediate revocation.
3. **Reason codes are required** — eight values covering buyer + producer + governance + privacy + fraud + housekeeping triggers. Audit-grade.
4. **Reason-scoped authorization** — `buyer_decision` is buyer-only; `producer_revoke` requires DNS-verified producer ownership; `governance_denied` requires governance-domain auth. The trust gradient gets enforced at the action layer for the first time.
5. **Per-destination acks** — response carries one entry per affected destination with `is_revoked` + `ack_received` + optional `error`. Partial-failure semantics are explicit.
6. **Idempotent** — `idempotency_key` required (matches `activate_signal` 3.0.6 contract). Repeated calls with the same key return the original revocation `task_id`.

---

## Request schema sketch

`/schemas/3.1/signals/revoke-activation-request.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.1/signals/revoke-activation-request.json",
  "title": "Revoke Activation Request",
  "type": "object",
  "properties": {
    "adcp_major_version": { "type": "integer", "minimum": 1, "maximum": 99 },
    "task_id": {
      "type": "string",
      "description": "task_id returned by the original activate_signal call.",
      "pattern": "^op_[A-Za-z0-9_]+$"
    },
    "reason_code": { "$ref": "/schemas/3.1/enums/revocation-reason.json" },
    "reason_detail": { "type": "string", "maxLength": 500 },
    "effective_at": {
      "type": "string", "format": "date-time",
      "description": "Omit for immediate. Future = scheduled. Past = VALIDATION_ERROR."
    },
    "destinations": {
      "type": "array",
      "description": "Optional: revoke only at these destinations. When omitted, revokes everywhere the original activation ran.",
      "items": { "$ref": "/schemas/3.1/core/destination.json" },
      "minItems": 1
    },
    "idempotency_key": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{16,255}$"
    },
    "context": { "$ref": "/schemas/3.1/core/context.json" },
    "ext":     { "$ref": "/schemas/3.1/core/ext.json" }
  },
  "required": ["task_id", "reason_code", "idempotency_key"],
  "additionalProperties": true
}
```

---

## Reason code enum

`/schemas/3.1/enums/revocation-reason.json`:

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
    "buyer_decision":    "Buyer-initiated discretionary revocation. No fault.",
    "producer_revoke":   "Data provider revoked authorization.",
    "governance_denied": "check_governance returned denied after the fact.",
    "consent_withdrawn": "Underlying user/audience consent revoked. Mandatory.",
    "fraud_detected":    "Fraud or invalid traffic against this signal.",
    "policy_violation":  "Buyer used the signal outside permitted_uses.",
    "campaign_ended":    "Campaign concluded normally. Housekeeping.",
    "expiry":            "validity_period elapsed. Producer-set; included for audit symmetry."
  }
}
```

---

## Response schema sketch

`/schemas/3.1/signals/revoke-activation-response.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "/schemas/3.1/signals/revoke-activation-response.json",
  "title": "Revoke Activation Response",
  "type": "object",
  "properties": {
    "task_id":          { "type": "string", "description": "New task_id for THIS revocation." },
    "original_task_id": { "type": "string", "description": "The activation being revoked." },
    "status":           { "$ref": "/schemas/3.1/enums/task-status.json" },
    "reason_code":      { "$ref": "/schemas/3.1/enums/revocation-reason.json" },
    "effective_at":     { "type": "string", "format": "date-time" },
    "revoked_at":       { "type": "string", "format": "date-time" },
    "completed_at":     { "type": "string", "format": "date-time" },
    "deployments": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type":         { "type": "string", "enum": ["platform", "agent"] },
          "platform":     { "type": "string" },
          "agent_url":    { "type": "string", "format": "uri" },
          "is_revoked":   { "type": "boolean" },
          "revoked_at":   { "type": "string", "format": "date-time" },
          "ack_received": { "type": "boolean" },
          "error":        { "type": "string" }
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

## State machine

```
revoke_activation ──▶ submitted ──▶ working ──┬──▶ completed   (all destinations acked)
                                              ├──▶ failed      (≥1 destination errored)
                                              └──▶ rejected    (request invalid)
```

Same envelope status enum as `activate_signal` — buyers reuse the existing poll/webhook plumbing.

---

## Authorization matrix

| Caller | Permission |
|---|---|
| Buyer who originally activated | Always allowed for `buyer_decision` |
| Different buyer | `UNAUTHORIZED` |
| Authorized agent in producer's `adagents.json` | Allowed for `producer_revoke`, `consent_withdrawn`, `fraud_detected`, `policy_violation`, `expiry` |
| DNS-verified producer | Same as authorized agent |
| Governance-domain agent | Allowed for `governance_denied` |
| Anonymous | `UNAUTHORIZED` |

The reason-code-scoped check is the centerpiece — the *first* place AdCP enforces the trust gradient at the action layer rather than just describing it in the schema.

---

## Worked example (MCP tools/call)

**Request — buyer-driven brand-safety incident:**

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
      "context": { "correlation_id": "wf_brand-safety-incident-42" }
    }
  }
}
```

**Response (sync, all-acked):**

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
    { "type": "platform", "platform": "the_trade_desk", "is_revoked": true, "revoked_at": "2026-05-07T14:30:00Z", "ack_received": true },
    { "type": "platform", "platform": "dv360",          "is_revoked": true, "revoked_at": "2026-05-07T14:30:01Z", "ack_received": true },
    { "type": "agent", "agent_url": "https://liveramp.com/.well-known/adcp/signals", "is_revoked": false, "ack_received": false, "error": "Destination unreachable; will retry" }
  ],
  "context": { "correlation_id": "wf_brand-safety-incident-42" }
}
```

**Response (async — typical case):**

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

Buyer polls `get_operation_status(op_1778079111234_a7d9c1e3b5f0a2c4)` or receives the existing HMAC-signed completion webhook.

---

## Backwards compatibility

- **Additive only.** New tool name; doesn't break any existing handler.
- **`action: "deactivate"` discriminator** on `activate-signal-request.json` is preserved but deprecated for revocation purposes. New callers SHOULD use `revoke_activation`.
- **`validity_period` expiry** continues to work; expiry generates a synthetic `revocation_completed` event with `reason_code: "expiry"` so the audit chain is uniform regardless of trigger.
- **Adapters that don't implement** return the standard `TOOL_NOT_FOUND` error. Buyers fall back to manual destination action with no protocol-level audit (today's status quo).

---

## Conformance storyboard sketch

`/compliance/3.1/domains/signals/scenarios/revoke_activation_buyer_decision.yaml`:

```yaml
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
    tool: get_operation_status
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

Plus 7 sibling scenarios — one per reason code.

---

## Open questions I need help with

1. **Producer-initiated revocation routing.** A producer revoking a signal needs to push to every buyer who activated it. Does that go through a sibling tool (`revoke_signal_at_buyer(buyer_agent_url, signal_id)`) that the buyer's agent translates into per-task revocations, or does the producer directly call buyer agents' `revoke_activation`? Either has trade-offs.
2. **Cascade semantics.** If a signal feeds an activation chain (signal → derived signal → activation), does revoking the source cascade? My instinct: NO for v1 — explicit per-task only. Cascade is v2.
3. **Pricing reconciliation.** Mid-billing-period revocation — refund / credit? I think it's out of scope for the protocol (commercial-layer concern), but flag it because adopters will ask.
4. **Effective-at scheduling.** Future-dated revocations — who runs the timer? Recommend the agent that received the request.
5. **Privacy budget restoration.** Clean-room signal revoked → budget refunded? Defer to clean-room-specific spec.

---

## What I'm asking from Addie / AAO

Three things:

1. **File this as an issue** against `adcontextprotocol/adcp` titled `[proposal] revoke_activation — canonical buyer/producer revocation primitive (signals domain)`. I have a self-contained version at `docs/SPEC_PROPOSAL_REVOKE_ACTIVATION.md` in evgeny-193's adaptor repo if it's easier to link than paste; this chat is also paste-friendly.
2. **Route it to the signals-domain working-group owner** for triage — I think this should target 3.1 minor.
3. **Surface the five open questions** above so the working group can discuss them in the next sync. I'll show up to defend the design choices; happy to revise based on input.

If there's prior art I missed (an existing GH issue, a thread on the working-group call, an in-flight RFC), point me at it and I'll fold this into whatever's already moving.

---

## Why this is the right candidate to push first

- **Clean greenfield.** Zero implementation today (verified across the live AdCP directory + my adaptor's federation probe). No vendor migration to negotiate.
- **Stakeholder coverage.** Buyer + producer + governance + privacy + platform all need this. Reason-code enum makes the cross-stakeholder contract explicit.
- **Testable in <10 storyboards.** I sketched the buyer_decision case above; the others are trivial extensions.
- **Reuses existing AdCP infrastructure end-to-end.** No new transport, no new auth, no new persistence shape, no new envelope. Just the new tool + two schemas + one enum.
- **Backwards compatible.** Additive. Adapters that don't implement degrade to today's behavior.

Round-robin's strongest spec-proposal candidate. Ready when you are, Addie.

— Ev (adcp.signal-stack.io)
