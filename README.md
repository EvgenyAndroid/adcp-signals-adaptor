# UCP Phase 2 + 3 — GTS, Projector, Handshake Simulator

Three new endpoints implementing the full three-phase Vector Alignment Handshake
described in the article "AI Agents in Ads need a Common Language."

---

## New Files

| File | Type | Description |
|---|---|---|
| `src/routes/getGts.ts` | NEW | `GET /ucp/gts` — Golden Test Set validation |
| `src/routes/getProjector.ts` | NEW | `GET /ucp/projector` — Procrustes/SVD alignment matrix |
| `src/routes/simulateHandshake.ts` | NEW | `POST /ucp/simulate-handshake` — Phase 1 buyer-side demo |
| `src/ucp/vacDeclaration.ts` | REPLACE | Adds GTS + projector + handshake fields to capability block |
| `src/index.patch.ts` | PATCH | Instructions + 3 route additions for `src/index.ts` |
| `src/mcp/server.patch.ts` | PATCH | Updated `handleInitialize` return value for `src/mcp/server.ts` |
| `tests/ucp-phase2-3.test.ts` | NEW | Full test suite — 22 tests across all three endpoints |

---

## How to Apply

### 1. Drop in new route files
```
cp src/routes/getGts.ts           <your-repo>/src/routes/getGts.ts
cp src/routes/getProjector.ts     <your-repo>/src/routes/getProjector.ts
cp src/routes/simulateHandshake.ts <your-repo>/src/routes/simulateHandshake.ts
```

### 2. Replace vacDeclaration.ts
```
cp src/ucp/vacDeclaration.ts      <your-repo>/src/ucp/vacDeclaration.ts
```

### 3. Patch src/index.ts
See `src/index.patch.ts` — add 3 imports and 3 route blocks.

### 4. Patch src/mcp/server.ts
See `src/mcp/server.patch.ts` — replace the `handleInitialize` return value.

### 5. Add tests
```
cp tests/ucp-phase2-3.test.ts     <your-repo>/tests/ucp-phase2-3.test.ts
npx vitest run tests/ucp-phase2-3.test.ts
```

### 6. Deploy
```
wrangler deploy
```

---

## New Endpoints

### GET /ucp/gts
Golden Test Set. Returns 15 curated signal pairs (identity / related / orthogonal)
with pre-computed cosine similarities from the real OpenAI v1 vectors.
Buyer agents call this during Phase 1 to verify semantic alignment before
committing to the VAC handshake.

```bash
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/gts \
  | jq '{overall_pass, pass_rate, summary}'
```

### GET /ucp/projector
Procrustes/SVD rotation matrix. Maps `openai-te3-small-d512-v1` → `ucp-space-v1.0`.
Status is `"simulated"` — IAB reference model not yet published, so R ≈ I (identity).
Endpoint shape is fully spec-compliant and will carry the real matrix when IAB publishes.

```bash
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/projector \
  | jq '{from_space, to_space, status, anchor_count}'
```

### POST /ucp/simulate-handshake
Phase 1 capability discovery demo. Send a buyer agent's capability payload,
get back the negotiated outcome with a full step-by-step negotiation trace.

Three outcomes:
- `direct_match` — buyer and seller share the same space, no transformation needed
- `projector_required` — buyer uses a different space, projector available at `/ucp/projector`
- `legacy_fallback` — no embedding compatibility, fall back to AdCOM Segment IDs

```bash
# Direct match
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/simulate-handshake \
  -H "Content-Type: application/json" \
  -d '{"buyer_space_ids":["openai-te3-small-d512-v1"],"buyer_ucp_version":"ucp-v1"}' \
  | jq '{outcome, matched_space}'

# Projector path (different space)
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/simulate-handshake \
  -H "Content-Type: application/json" \
  -d '{"buyer_space_ids":["bert-base-uncased-v1"],"buyer_ucp_version":"ucp-v1"}' \
  | jq '{outcome, projector_endpoint, projector_status}'

# Legacy fallback (incompatible version)
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/simulate-handshake \
  -H "Content-Type: application/json" \
  -d '{"buyer_space_ids":[],"buyer_ucp_version":"ucp-v0"}' \
  | jq '{outcome, fallback_mechanism, negotiation_trace}'
```

---

## What Stays the Same

- All 8 existing MCP tools — no changes
- `/signals/*` routes — no changes
- `/ucp/concepts` — no changes
- `embeddingStore.ts` — no changes (GTS + Projector read from it directly)
- D1 schema — no changes
- Auth model — all three new endpoints are public (no auth required)

---

## Phase Sequencing

```
GTS (/ucp/gts)
  └─► Projector (/ucp/projector)
        └─► Handshake Simulator (/ucp/simulate-handshake)
              └─► Full buyer agent demo: try all three outcomes
```

GTS provides the anchor pairs → Projector uses them to fit R →
Handshake Simulator demonstrates the full Phase 1/2/3 flow end-to-end.
