# Security Model

This document records trust-model constraints that cannot be inferred from
reading the code alone. Skim this before opening a review issue about an
access-control surface — the constraint may be intentional. As of Sec-19
there are **no open parked items** — everything below describes active
implementation patterns.

## Trust model

One or more operators authenticate via `Authorization: Bearer <key>`.
The bearer token IS the operator identity — different tokens map to
different operators automatically via the operator-id derivation
described below.

Today the deployed Worker has one provisioned `DEMO_API_KEY` secret
(single-operator demo posture), but the code is ready to handle
multiple distinct tokens with full resource isolation between them.
Provisioning additional tokens is purely a wrangler-secret operation
and needs no code change.

## Per-operator resource scoping (Sec-18)

Every inbound call that touches operator-scoped resources derives a
stable identifier from the bearer token:

```
operator_id = base64url(sha256(bearer_token).slice(0, 9))   // 12 chars
```

See [src/utils/operatorId.ts](src/utils/operatorId.ts). Deterministic —
same token → same ID across calls and across Workers. Different tokens
→ different IDs, automatic isolation. 72 bits of namespace; collision
space comfortably exceeds any plausible operator count.

The bearer is never logged or stored; the operator_id is a one-way
derivative and is safe to use as a KV key suffix, DB column, or log
field.

### What's scoped per operator

**LinkedIn OAuth tokens** — stored under namespaced KV keys:
`linkedin:access_token:<operator_id>`, `:refresh_token:<…>`,
`:token_expires:<…>`, `:token_meta:<…>`. Two operators authorizing
independently produce disjoint token sets. Re-authorizing only
overwrites your own.

**OAuth state rows** — the `oauth_state` D1 table carries the issuing
operator_id. `/init` writes it; `/callback` (which runs public, no
bearer) consumes the row via `DELETE … RETURNING operator_id` and
uses the returned value to namespace token storage. See migration
`0005_oauth_state_operator.sql` and `consumeOAuthState` in
[src/activations/auth/linkedin.ts](src/activations/auth/linkedin.ts).

**Activation calls** — `/signals/activate/linkedin` derives the
operator_id from the bearer and threads it through the adapter
chain to `getValidAccessToken`, so activations always run under the
calling operator's LinkedIn identity.

### When multi-tenant scoping needs more

The current design covers operators who each hold distinct bearer
tokens. Genuinely multi-tenant products (end-user-facing UI where
viewers see signals scoped to their org) would add:

- A request-level session identity separate from the admin bearer
  (JWT or cookie-session)
- Per-tenant activation records / audit log
- Compliance-driven per-customer credential isolation

None of those are in scope today. Reopen this section if a real
multi-tenant requirement lands.

## Token encryption at rest

LinkedIn OAuth tokens in KV are AES-GCM encrypted when
`TOKEN_ENCRYPTION_KEY` is provisioned. **Currently provisioned on the
deployed worker** — the success page (post-OAuth callback) reflects this:
"Tokens stored encrypted in KV (AES-GCM at rest)."

Implementation lives in [src/utils/tokenCrypto.ts](src/utils/tokenCrypto.ts):

- `enc:v1:` envelope prefix so legacy plaintext values still read.
- 12-byte random IV per write; AES-GCM auth tag bundled in the ciphertext.
- 256-bit AES key derived via SHA-256 over the passphrase.
- 32-character minimum on the passphrase enforced at `deriveKey` time —
  throws `WeakPassphraseError` on shorter values. See `MIN_PASSPHRASE_LENGTH`.
  PBKDF2 is NOT used; the SHA-256-on-passphrase approach is correct only
  for high-entropy random secrets (Wrangler-secret posture).

Old plaintext entries continue to be readable via the legacy fallback in
`decryptIfNeeded` and get re-encrypted on the next OAuth refresh. No
migration script needed.

## What does NOT live here

- **Code-level auth gates**: see inline comments around `publicPaths` in
  [src/index.ts](src/index.ts) and `AUTHENTICATED_MCP_METHODS` in
  [src/mcp/server.ts](src/mcp/server.ts).
- **Webhook signing format**: see
  [src/domain/webhookSigning.ts](src/domain/webhookSigning.ts) and the
  "Webhook signatures" section of README.md.
- **Webhook retry policy**: bounded at 5 attempts with exponential backoff
  (30s → 2m → 8m → 32m). See `MAX_WEBHOOK_ATTEMPTS` and `backoffSeconds`
  in [src/domain/activationService.ts](src/domain/activationService.ts).
- **Callback error-page HTTP status codes**: 400 for caller-side bad state
  (Invalid State, Missing Code), 502 for upstream provider failures
  (Authorization Failed, Token Exchange Failed). 200 only on success.
  See `htmlResponse` in [src/activations/auth/linkedin.ts](src/activations/auth/linkedin.ts).
- **OAuth state atomicity**: single-use via D1 `DELETE … RETURNING`. See
  `consumeOAuthState` in
  [src/activations/auth/linkedin.ts](src/activations/auth/linkedin.ts).
