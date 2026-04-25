# Workshop Block 1 Exhibits — Signal Definition, Boundaries, Trust

**For:** Mini Governance & Signals Workshop · May 7, 2026 · iHeartMedia NYC
**Use:** Drop-in materials for Block 1 ("What Is a Signal and What Makes It Trusted?") — three exhibits the room can react to instead of starting from a blank whiteboard.

---

## Exhibit A — The Signal Definition Card

**One-sentence answer (proposal):**

> A signal is a structured, addressable description of an audience or context — produced by an agent, consumed by another agent — carrying enough metadata for the consumer to decide whether to trust it, what to pay for it, and where it can be activated.

**Anatomy of a signal as it lives on the wire today** — drawn from the `get_signals` response of the live `adcp-signals-adaptor`:

| Field | What it is | Why it matters for trust |
|---|---|---|
| `signal_agent_segment_id` | Stable identifier in the agent's namespace | Reproducibility, auditability |
| `name` + `description` | Human-readable | Human review |
| `data_provider` | Who built/owns the signal | **Provenance** |
| `signal_type` | "audience" / "contextual" / "behavioral" / etc. | Categorical taxonomy |
| `coverage_percentage` | Quantified reach against addressable universe | **Quality** |
| `estimated_audience_size` | Absolute reach number | Quality |
| `pricing` | `{cpm, currency}` | Commercial contract |
| `deployments[]` | Per-platform `{platform, scope, is_live, decisioning_platform_segment_id}` | **Where it can be activated** |
| `x_cross_taxonomy[]` | Same signal expressed across IAB / LiveRamp / TTD / AppNexus / etc. (9 systems today) | Producer ↔ consumer mapping across vendor namespaces |
| `x_consent.category` | Consent posture (e.g. `"explicit_opt_in"`, `"legitimate_interest"`) | **Consent** |
| `x_freshness.window_days` | How fresh the underlying behavior data is | **Freshness** |
| `x_dts_version` | DTS label-spec version | Auditability |
| `ext.compliance` | Per-signal in-band compliance block | Governance handoff |

**Producer ↔ consumer separation** — the UCP Concept Registry pattern:
- **Concepts** are the vocabulary: *what behavior is being described* (e.g. "in-market for full-size SUV", normalized across taxonomies).
- **Signals** are instances: *a producer's specific implementation* of a concept, with their own coverage / pricing / deployment metadata.
- Consumers discover via concept similarity (semantic embedding) OR by cross-taxonomy ID lookup.

This separation lets the room talk about "the same audience" abstractly without conflating two vendors' competing operational claims.

---

## Exhibit B — What Signals Are NOT (Boundary Map)

```
                                    ┌─────────────────────┐
                                    │   GOVERNANCE         │
                                    │  (consent rules,     │
                                    │   compliance policy, │
                                    │   activation rights) │
                                    └─────────┬───────────┘
                                              │ ext.compliance,
                                              │ x_consent
                                              ▼
┌─────────────────┐                 ┌─────────────────────┐                 ┌──────────────────┐
│   IDENTITY      │  resolves to    │      SIGNALS         │   activates to  │   MEDIA BUY       │
│ (LiveRamp,      │ ──────────────▶ │  (this agent type)   │ ──────────────▶ │ (Adzymic, Claire, │
│  clean rooms,   │  x_cross_       │                      │  deployments[], │  Swivel, ...)     │
│  ID resolution) │  taxonomy IDs   │                      │  activate_signal│                   │
└─────────────────┘                 └─────────┬────────────┘                 └──────────────────┘
                                              │
                                              │ feeds into
                                              ▼
                                    ┌─────────────────────┐
                                    │   MEASUREMENT        │
                                    │ (DV, IAS, Comscore,  │
                                    │  Nielsen, lift,      │
                                    │  attribution)        │
                                    └─────────────────────┘

                                    ┌─────────────────────┐
                                    │   IVT / FRAUD        │
                                    │  (Human, DV)         │
                                    └─────────────────────┘
                                              │
                                              │ filter applied
                                              │ BEFORE signals attach
                                              │ — operates on inventory,
                                              │ not on signals themselves
                                              ▼

                                    ┌─────────────────────┐
                                    │   ATTENTION /        │
                                    │   QUALITY (Triton,   │
                                    │   IAS attention)     │
                                    └─────────────────────┘
                                              │
                                              │ in-flight signals
                                              │ that COULD feed
                                              │ into the signals
                                              │ contract (TBD)
                                              ▼
```

**Hard boundaries (signals does NOT do):**

- **IVT / fraud filtering** — a signal saying "this segment is fraud-clean" is not a signal at all; fraud filtering operates on inventory, not on the audience descriptor. The signal-side doesn't validate the inventory side.
- **Measurement / attribution / lift** — signals carry consent + holdout *posture* (DTS labels say what holdout was applied); they don't *verify* lift.
- **Identity resolution** — signals consume identity primitives (`x_cross_taxonomy`); they don't resolve them.
- **Activation execution** — signals declare *where* they can be activated (`deployments[]`); they don't execute the buy. Buying agents do.
- **Governance enforcement** — signals carry policy *posture* (`ext.compliance`, `x_consent`); they don't enforce the policy. Privacy gates and audit infrastructure do.

**Soft boundaries (likely a signal but discuss):**

- **Brand suitability score**: probably a signal (it's a metadata attribute of inventory or content).
- **"Don't run next to alcohol content"**: NOT a signal — it's a governance directive carried alongside a signal.
- **Attention score for inventory**: probably a signal (real-time, in-flight). But the architecture is different from batch audience signals — see real-time-vs-batch axis.
- **Brand lift result**: probably NOT a signal (output of measurement). But the *hypothesis input* to lift might be.

---

## Exhibit C — Trust Contract Strawman

**Proposal:** the minimum metadata a consumer needs to *trust* a signal enough to put budget behind it.

Five fields, all carried in DTS v1.2 labels on every signal in the live `adcp-signals-adaptor` today:

| # | Field | Question it answers | Today (live) |
|---|---|---|---|
| 1 | `data_provider` | **Provenance** — who built this? | ✓ |
| 2 | `x_consent.category` | **Consent** — under what user-permission posture was it built? | ✓ |
| 3 | `x_freshness.window_days` + last-updated | **Freshness** — how stale is the underlying behavior? | ✓ |
| 4 | `coverage_percentage` + `estimated_audience_size` | **Quality** — how much of the universe does it actually cover? | ✓ |
| 5 | `deployments[]` with `is_live` + `activation_key` | **Where** — what platforms can actually use it? | ✓ |

**What's NOT here yet** (gaps to discuss):

| Question | Why missing | Possible direction |
|---|---|---|
| **Auditability** — can a third party verify the producer's claims? | DTS labels are self-attested today; no signing / attestation infrastructure. | DV/IAS-validated signal labels? Signed JWT-style attestations? |
| **Lineage** — was this signal derived from another signal? | No `derived_from` field; transformations are opaque. | Add `lineage[]` to signal shape. |
| **Holdout posture validation** — DTS declares what holdout was applied; nothing verifies it was actually held out. | Trust is one-sided. | Measurement-vendor co-sign? |
| **Real-time vs. batch declaration** — what's the latency contract for in-flight optimization signals? | Whole-protocol gap; `get_signals` is sync batch. | Separate streaming primitive. |

**Provocation for the room:** *"Which of these five fields would you remove? Which would you add before you'd put budget behind it?"*

---

## How to use these in Block 1

- **Open with Exhibit A** as a 5-minute walkthrough — pulls a real signal out of the wire, names every field. The room reacts; their reactions seed the definition exercise.
- **Pivot to Exhibit B** when the boundary question comes up ("is X a signal?"). Use the diagram, mark up disagreements live.
- **Land with Exhibit C** as the trust requirements section. Frame DTS v1.2 as a strawman, NOT a finished standard. The provocation question forces the room to commit to a list.

If they want to revise: the doc lives at `docs/WORKSHOP_BLOCK1_EXHIBITS.md` in the public repo. PRs welcome — that's the bridge into the working committee.
