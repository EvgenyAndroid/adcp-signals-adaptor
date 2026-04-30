# DSP buy-side live coverage matrix (post-#121 + #123)

Captured 2026-04-30 against `https://adcp-signals-adaptor.evgeny-193.workers.dev/dsp/agents/coverage` (deploy version `8a1a1048`).

```bash
curl -s https://adcp-signals-adaptor.evgeny-193.workers.dev/dsp/agents/coverage | jq
```

## Per-tool coverage across all live buying agents

| Tool | Supported / Total | Spec status |
|---|---|---|
| `create_media_buy` | **7 / 11** | spec lifecycle |
| `update_media_buy` | **7 / 11** | spec lifecycle |
| `get_media_buy_delivery` | **7 / 11** | spec lifecycle |
| `get_media_buys` | **6 / 11** | spec lifecycle |
| `cancel_media_buy` | 0 / 11 | spec lifecycle (no vendor advertises) |
| `pause_media_buy` | 0 / 11 | spec lifecycle (no vendor advertises) |
| `resume_media_buy` | 0 / 11 | spec lifecycle (no vendor advertises) |
| **`submit_bid_strategy`** | **0 / 11** | **unspec'd in 3.0 GA** |
| **`get_bid_opportunities`** | **0 / 11** | **unspec'd in 3.0 GA** |
| **`get_pacing_status`** | **0 / 11** | **unspec'd in 3.0 GA** |
| **`optimize_strategy`** | **0 / 11** | **unspec'd in 3.0 GA** |

## Per-agent breakdown

| Agent | Alive | Tools advertised |
|---|---|---|
| `adzymic_apx` | ✅ | 4/11 (create + update + get_delivery + get_media_buys) |
| `adzymic_sph` | ✅ | 4/11 |
| `adzymic_tsl` | ✅ | 4/11 |
| `adzymic_mediacorp` | ✅ | 4/11 |
| `content_ignite` | ✅ | 4/11 |
| `claire_pub` | ✅ | 4/11 |
| `claire_scope3` | ⚠️ unreachable | 0/11 |
| `swivel` | ✅ | 3/11 (no `get_media_buys`) |
| `setupad_gatavocom` | ⚠️ silent | 0/11 |
| `setupad_wheelrandom` | ⚠️ silent | 0/11 |
| `mamamia` | ⚠️ silent | 0/11 |

## Workshop framing

**Two distinct gaps surface at this layer:**

1. **Spec lifecycle, not yet implemented** — `cancel_media_buy` / `pause_media_buy` / `resume_media_buy`. Spec defines them; no vendor advertises them. Suggests an immutability posture across the directory.

2. **Real-time bid + optimization, not in spec** — `submit_bid_strategy` / `get_bid_opportunities` / `get_pacing_status` / `optimize_strategy`. **0 / 11 across the board.** This is the largest spec gap remaining in 3.0 GA: the buy-side discovery and plan-level buy is in the spec; the real-time control loop is not.

**Talking point:**

> The buy-side has the post-buy discovery (8 of 11 buying agents will tell you about media-buys you've created) but not the pre-buy strategy. AdCP today says "tell me what you bought"; doesn't say "tell me how to bid". When that gap closes — same posture as the governance and brand-rights primitives — buyer agents become first-class participants in the auction layer.

**Plan-level buy works live:**
- Fire `create_media_buy` from the Brand Canvas → real call to vendor (auth-gated for our default trio, which is itself a workshop story)
- Update the buy from the Campaign Canvas's Lane 5 → real `update_media_buy` call
- Pull delivery from `get_media_buy_delivery` → real pacing data on capable vendors

**Bid-time control loop is mocked:**
- Lane 1 (bid strategy) shows synthetic algo + modifiers + dayparting
- Lane 2 (bid stream) shows synthetic 60-min sparkline of QPS in/out + win rate
- Lane 4 (pacing) and Lane 5 (attribution) blend mock + real where available
- Each lane's data-source pill explicitly says LIVE or MOCK · 0 live agents
