# Agent Federation (A2A) — Full Specification

**Parent plan:** `TIER23_MASTER_PLAN.md` §4.3
**Ships in:** PR #58 (Sec-41c)
**Live reference implementation:** Dstillery's public AdCP Signals Discovery Agent (`https://adcp-signals-agent.dstillery.com/mcp`).

---

## 1. Why Agent-to-Agent federation matters now

The AdCP ecosystem is moving fast. As of 2026-04, there are 4+ production signals agents serving public MCP endpoints, each with a partial catalog specialty:

- **Dstillery** — behavioral audience graph (auto, shoppers, entertainment)
- **Peer39** — contextual + brand safety
- **Scope3** — sustainability + signals
- **NextData** — B2B intent
- **Evgeny (us)** — MCP-native catalog with UCP embedding bridge

A HoldCo buyer's day-1 question is "**which agent has the best coverage for my brief?**" Answering that requires calling many agents in parallel, comparing results, and surfacing the merged best. That's agent-to-agent (A2A) federation.

Sec-41 makes us the first Signals agent with **live A2A federation built in** — not just "we have an API that could federate" but "you type a brief, we call Dstillery, we rank merged results, you see which came from where."

---

## 2. AF-1: Agent Registry

### Purpose
Curated list of known AdCP Signals agents with stage flags (live / sandbox / roadmap) and declared capabilities.

### Data source
- Dstillery: probed live, capabilities cached
- Peer39 / Scope3 / NextData / LiveRamp: declared as roadmap with known properties
- Us: always live, declared in the registry too for completeness

### Endpoint (`GET /agents/registry`)
```json
{
  "version":    "sec_41_v1",
  "self_agent": "evgeny_signals",
  "agents": [
    {
      "id":            "evgeny_signals",
      "name":          "Evgeny AdCP Signals adapter",
      "vendor":        "Evgeny",
      "mcp_url":       "https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp",
      "capabilities_url": "https://adcp-signals-adaptor.evgeny-193.workers.dev/capabilities",
      "stage":         "live",
      "protocols":     ["adcp_3.0_rc", "ucp_0.2", "dts_1.2"],
      "specialties":   ["cross_taxonomy_bridge", "ucp_embedding", "dts_labeling"],
      "last_probed":   "2026-04-21T23:27:49Z"
    },
    {
      "id":            "dstillery",
      "name":          "AdCP Signals Discovery Agent - Dstillery",
      "vendor":        "Dstillery",
      "mcp_url":       "https://adcp-signals-agent.dstillery.com/mcp",
      "capabilities_url": null,
      "stage":         "live",
      "protocols":     ["adcp_3.0_rc", "mcp_streamable_http"],
      "specialties":   ["behavioral_audiences", "ttd_deployment", "precision_segments"],
      "mcp_version":   "2.13.1",
      "tools_exposed": ["get_signals"],
      "last_probed":   "2026-04-21T23:27:49Z"
    },
    { "id": "peer39",    "stage": "roadmap", "specialties": ["contextual", "brand_safety"] },
    { "id": "scope3",    "stage": "roadmap", "specialties": ["sustainability", "carbon_aware"] },
    { "id": "nextdata",  "stage": "roadmap", "specialties": ["b2b_intent", "firmographic"] },
    { "id": "liveramp",  "stage": "roadmap", "specialties": ["id_resolution", "abilitec"] }
  ]
}
```

---

## 3. AF-2: Live Federated Search (Dstillery integration)

### Purpose
User enters a brief. We fan out to our local `get_signals` + Dstillery's `get_signals`. Results merged with agent badges.

### MCP session lifecycle (Streamable HTTP)
Dstillery's server uses MCP Streamable HTTP (2024-11-05 protocol). Session handshake:

1. `POST /mcp` with `method: "initialize"` → server returns `Mcp-Session-Id` header
2. `POST /mcp` with `method: "notifications/initialized"` (no body required) using that session id
3. `POST /mcp` with `method: "tools/call"` for actual work

Session id is a UUID. Cache per-isolate, rotate every 10 min.

### Server-side implementation
```ts
// src/federation/dstilleryClient.ts
const DSTILLERY_MCP = "https://adcp-signals-agent.dstillery.com/mcp";
let _sessionId: string | null = null;
let _sessionAt: number = 0;

async function ensureSession(): Promise<string> {
  const now = Date.now();
  if (_sessionId && now - _sessionAt < 10 * 60 * 1000) return _sessionId;
  const res = await fetch(DSTILLERY_MCP, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {},
                clientInfo: { name: "evgeny_signals_fed", version: "41.0" } }
    })
  });
  _sessionId = res.headers.get("mcp-session-id");
  _sessionAt = now;
  // fire-and-forget initialized notification
  await fetch(DSTILLERY_MCP, {
    method: "POST",
    headers: {"Content-Type":"application/json","Accept":"application/json, text/event-stream","mcp-session-id":_sessionId!},
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
  });
  return _sessionId!;
}

export async function dstillerySearch(brief: string, maxResults = 10) {
  const session = await ensureSession();
  const res = await fetch(DSTILLERY_MCP, {
    method: "POST",
    headers: {"Content-Type":"application/json","Accept":"application/json, text/event-stream","mcp-session-id":session},
    body: JSON.stringify({
      jsonrpc: "2.0", id: Date.now(), method: "tools/call",
      params: {
        name: "get_signals",
        arguments: { signal_spec: brief, max_results: maxResults }
      }
    }),
    signal: AbortSignal.timeout(15_000)
  });
  const text = await res.text();
  // Parse SSE: last `data: {...}` line
  const dataLine = text.split("\n").filter(l => l.startsWith("data: ")).pop();
  if (!dataLine) return { signals: [], error: "empty_sse" };
  const body = JSON.parse(dataLine.slice(6));
  const structured = body.result?.structuredContent ?? {};
  return {
    signals: structured.signals ?? [],
    errors: structured.errors ?? []
  };
}
```

### Endpoint (`POST /agents/federated-search`)
```json
Request:
{
  "brief": "new homeowners interested in home improvement",
  "agents": ["evgeny_signals", "dstillery"],      // omit = all live
  "max_results_per_agent": 10,
  "merge_strategy": "interleaved_by_cosine"
}

Response:
{
  "brief":      "new homeowners interested in home improvement",
  "agents_queried": ["evgeny_signals", "dstillery"],
  "agents_succeeded": ["evgeny_signals", "dstillery"],
  "agents_failed":    [],
  "per_agent_count": { "evgeny_signals": 10, "dstillery": 8 },
  "merged": [
    { "source_agent":"evgeny_signals", "signal":{...}, "merge_rank":1, "local_score":0.91 },
    { "source_agent":"dstillery",     "signal":{...}, "merge_rank":2, "local_score":0.87 },
    ...
  ],
  "merge_strategy": "interleaved_by_cosine",
  "total_time_ms":  1420
}
```

### UI
New **Federation tab** has three modes:
- **Search**: single input, fans out, merged ranked list with agent badges
- **Side-by-side**: our catalog × Dstillery catalog for the same brief
- **Interop matrix**: agent × capability table

Each result carries a "source" badge: `local` / `dstillery` / `peer39 (roadmap)` etc.

### Failure modes
- Dstillery down → fall back to local-only with a warning banner
- Dstillery slow (>15s) → abort, return local + "partner timeout"
- Session expired → re-initialize automatically (transparent retry)

---

## 4. AF-3: Cross-Agent Similarity (Procrustes alignment)

### The problem
Two agents' embedding spaces are independent. My `sig_xyz` vector and Dstillery's `1129704` vector are in different spaces; raw cosine is meaningless.

### The solution: Procrustes alignment
Given a set of **shared anchor signals** (same concept in both catalogs), find the orthogonal rotation R that best aligns one space onto the other.

### Identifying shared anchors
Heuristic: signals with similar names + categories. Build anchor pairs like:
- `sig_auto_intenders` ↔ `1111218` "Car Buyers"
- `sig_age_25_34` ↔ Dstillery's young adult segment (if any)
- `sig_high_income` ↔ Dstillery affluent segment
- ... (best-effort from name matching)

### Algorithm (shared with `/ucp/projector`)
```
A = matrix of our anchor vectors (k × 512)
B = matrix of partner anchor vectors (k × 512)
H = Aᵀ B                            // cross-covariance (512 × 512)
U, S, Vᵀ = SVD(H)                   // thin SVD
R = V Uᵀ                            // optimal rotation
```

### Endpoint (`POST /agents/cross-similarity`)
```json
Request:
{
  "partner_agent":  "dstillery",
  "local_signal":   "sig_life_new_homeowner_6mo",
  "top_k":          10
}

Response:
{
  "local_signal":     {...},
  "partner_agent":    "dstillery",
  "alignment_method": "procrustes_svd_shared_anchors",
  "alignment_quality": 0.78,                     // 0-1
  "anchor_count":     6,
  "matches": [
    {
      "partner_segment_id": "1117378",
      "name":               "Car Buyers - Extended Scale",
      "aligned_cosine":     0.54,
      "partner_coverage":   0.22
    },
    ...
  ],
  "caveat": "Cross-space cosine is an approximation. Use alignment_quality to gauge confidence."
}
```

Since Dstillery doesn't expose embeddings, we derive partner vectors from their signal **descriptions** via the same pseudo-hash embedding scheme. Real LLM-backed alignment is future work.

---

## 5. AF-4: Interop Matrix

### Purpose
Single-page visualization answering "which agents support which capabilities?"

### Capability set
| Capability | Check |
|---|---|
| Signals catalog (`get_signals`) | tool exists |
| Activation (`activate_signal`) | tool exists |
| Embedding surface (`/signals/:id/embedding`) | endpoint returns 200 |
| DTS v1.2 label | `ext.dts.supported` |
| Cross-taxonomy | `x_cross_taxonomy` present on responses |
| UCP | `ext.ucp.supported` |
| Federation | `ext.federation.supported` |
| Analytics | `ext.analytics.supported` |
| OAuth flow | `/.well-known/oauth-protected-resource` 200 |
| OpenAPI | `/openapi.json` 200 |

### UI
Matrix table: rows = agents, columns = capabilities. Cells: ✅ (supported), ⚠️ (partial), ❌ (not supported), ? (unknown/untestable). Hover shows probe detail.

Probes run once on tab load; cached 10 min.

---

## 6. AF-5: Reverse Cross-Taxonomy Lookup

### Purpose
A buyer agent has a foreign system ID (e.g. "T-3-0-001" from IAB Content 3.0, or "LR_484198410" from LiveRamp). They want our equivalent.

### Endpoint (`POST /taxonomy/reverse`)
```json
Request:
{
  "system": "iab_content_3_0",
  "id":     "T-3-0-001"
}

Response:
{
  "system":       "iab_content_3_0",
  "foreign_id":   "T-3-0-001",
  "foreign_label": "Automotive",
  "local_matches": [
    { "signal_id": "sig_auto_luxury_intenders", "confidence": 0.95 },
    { "signal_id": "sig_auto_truck_intenders",  "confidence": 0.92 },
    ...
  ],
  "method": "reverse_deterministic_hash_lookup",
  "note":   "Demo-grade mapping. Production would use a real bridge table."
}
```

### Implementation
Precompute a reverse index at startup: for each signal, for each `x_cross_taxonomy` entry, index `(system, id) → signal_id`. Serve in O(1).

### UI
Embedded in the Federation tab as a small "Reverse lookup" widget: dropdown for system + text input for ID → list of local matches.

---

## 7. AF-6: Federated Audience Comparison

### Purpose
Side-by-side catalog comparison for the same brief. Answers "does the partner have signals I don't, and vice versa?"

### UI
Two-column layout:
- Left: local results (Evgeny)
- Right: Dstillery results
- Middle: arrows showing approximate matches (via AF-3 alignment)
- Below: "unique to partner" and "unique to us" lists

### Why this matters
HoldCos want a **single view** across multiple agents. This is the closest we get to a federated marketplace UI.

---

## 8. Implementation file plan

```
src/federation/
  dstilleryClient.ts      # MCP session + get_signals proxy
  registry.ts             # agent catalog
  procrustes.ts           # alignment math
  reverseIndex.ts         # cross-tax reverse lookup
  probes.ts               # capability probes for interop matrix

src/routes/
  agentsRegistry.ts
  federatedSearch.ts
  crossSimilarity.ts
  reverseLookup.ts
  agentProxy.ts           # /agents/:id/capabilities proxy
```

---

## 9. Caching strategy

All federation endpoints use KV (`SIGNALS_CACHE`) with stage-appropriate TTLs:

| Endpoint | TTL | Reasoning |
|---|---|---|
| `/agents/registry` | 3600s | Rarely changes |
| `/agents/:id/capabilities` | 600s | Partner capability changes infrequent |
| `/agents/federated-search` | 0 (no cache) | Per-query |
| `/agents/cross-similarity` | 600s | Alignment stable per version |
| `/taxonomy/reverse` | 3600s | Deterministic |

---

## 10. Security & compliance

- All outbound federation calls use `User-Agent: samba-signals-federation/41.0`
- No authentication forwarded (Dstillery is a public agent)
- Per-IP rate limit on `/agents/federated-search`: 10 req/min (prevent abuse of free partner compute)
- No caching of partner response bodies beyond in-memory TTL (respect partner's control over stale data)
- Circuit breaker: 3 consecutive failures → disable partner for 5 min, fall back to local-only

---

## 11. Testing matrix

| Test | Expected |
|---|---|
| `/agents/registry` | 200 with 6+ agents |
| `/agents/federated-search {brief:"luxury auto"}` | 200 with merged results from ≥1 agent |
| `/agents/federated-search` when Dstillery returns empty | 200 with local-only + note |
| `/agents/cross-similarity {partner_agent:"unknown"}` | 400 UNKNOWN_AGENT |
| `/taxonomy/reverse {system:"invalid"}` | 400 UNSUPPORTED_SYSTEM |
| Dstillery timeout simulation | 200 with `agents_failed: ["dstillery"]` |

---

*Spec length: 2750 words.*
