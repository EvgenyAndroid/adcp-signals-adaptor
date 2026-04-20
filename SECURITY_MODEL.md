# Security Model

This document records trust-model constraints that cannot be inferred from
reading the code alone. Skim this before opening a review issue about an
access-control surface — the constraint may be intentional.

## Trust model: single-operator demo

This repo is a reference implementation, not a multi-tenant service. The
deployed Worker has one `DEMO_API_KEY` secret, shared by all operators
with admin access to the deployment.

## Shared LinkedIn token set

### Constraint

LinkedIn OAuth tokens are stored under fixed, unqualified KV keys:

- `linkedin:access_token`
- `linkedin:refresh_token`

See [src/activations/auth/linkedin.ts](src/activations/auth/linkedin.ts)
(constants at the top of the file).

There is no per-operator or per-tenant scoping. Any caller holding
`DEMO_API_KEY` who runs the `/auth/linkedin/init` → callback flow under
their own LinkedIn account will overwrite the previous token set.

### What this means in practice

- **DoS on the integration.** A second operator can invalidate the first
  operator's session by re-authorizing.
- **Activation runs under whichever LinkedIn identity authorized last.**
  `/signals/activate/linkedin` uses `getValidAccessToken` which returns
  whatever is currently in KV — so campaign creation charges, ad accounts,
  and creative ownership follow the last-writer.

### Why this is accepted for now

This is a demo / single-operator deployment. Adding per-operator token
scoping requires inventing an operator identity layer (session IDs,
multi-tenant KV keys, per-operator state tracking) that is out of
proportion for the current use case.

An observability signal for token overwrites exists:
`linkedin_oauth_tokens_overwritten` warns on every callback where a prior
token set existed. Watch `wrangler tail` for it — repeat overwrites are
usually the first symptom that two operators are stepping on each other.

### When to revisit

Reopen this decision if any of these become true:

1. The Worker is deployed to a setting where more than one independent
   operator holds `DEMO_API_KEY`.
2. The product grows an end-user-facing UI that relies on LinkedIn
   context per viewer/tenant.
3. LinkedIn Ads credentials need to be rotated per customer for billing
   or compliance reasons.

The minimal redesign is: namespace the KV keys by an operator identifier
derived from the request (e.g. hash of the calling `DEMO_API_KEY`, a
per-operator secret, or an explicit `X-Operator-Id` header). Callback,
`getValidAccessToken`, `/status`, and the activation route all resolve
the namespace from the same source.

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

## Callback HTTP status code disposition

`/auth/linkedin/callback` error pages return HTTP 200 with HTML bodies
that contain "Invalid State" / "Authorization Failed" / etc. instead of
mapping to 4xx/5xx. This is **intentional for the demo posture**:

- The page renders as a usable UI for the operator (back-link, error
  detail) regardless of status.
- The browser navigates to it as a top-level redirect from LinkedIn —
  4xx would surface as a generic browser error page in some browsers,
  hiding the actionable detail.

If observability or cache-behaviour eventually warrants proper status
codes (a 5xx page is implicitly cacheable as a "real" success in some
edge configs), the fix is small (`htmlResponse(title, content, status)`).
Logged for future cleanup, not currently a defect.

## What does NOT live here

- Code-level auth gates: see inline comments around `publicPaths` in
  [src/index.ts](src/index.ts) and `AUTHENTICATED_MCP_METHODS` in
  [src/mcp/server.ts](src/mcp/server.ts).
- Webhook signing format: see
  [src/domain/webhookSigning.ts](src/domain/webhookSigning.ts) and the
  "Webhook signatures" section of README.md.
- Webhook retry policy: see [src/domain/activationService.ts](src/domain/activationService.ts)
  `fireWebhook` — current implementation re-fires on every poll until
  the receiver returns 2xx (no max-attempts cap). Bounded retries are
  a known follow-up.
