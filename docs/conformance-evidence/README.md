# AdCP conformance evidence

Captured runs of the official `@adcp/client storyboard run` against the live
worker. Kept in-tree as a checkable artifact for code review and demo
walk-throughs.

| File | What it captures | When |
|---|---|---|
| [storyboard_report_capability_discovery.json](storyboard_report_capability_discovery.json) | `--json` output of `storyboard run evgeny-signals capability_discovery` | First successful capability_discovery run after the AdCP HEAD-schema fixes (PR #13) |
| [storyboard_report_full.json](storyboard_report_full.json) | `--json` output of the full track run (capability_discovery + deterministic_testing + error_compliance + schema_validation + signals_baseline) | Post-Sec-11 deploy (engine-aware `/capabilities`) |
| [storyboard_report_post_upstream.json](storyboard_report_post_upstream.json) | Re-run after [adcp#2365](https://github.com/adcontextprotocol/adcp/pull/2365) merged upstream — Signals track still SKIP because `@adcp/client` v5.1.0 bundles the pre-fix storyboard. Pinned as evidence the gap is upstream, not ours. | 2026-04-20 |

## How to regenerate

The CLI is published; reproduce against the live worker with:

```bash
npx --yes @adcp/client --save-auth evgeny-signals \
  https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp \
  --auth $DEMO_API_KEY

API_KEY=$DEMO_API_KEY npx --yes @adcp/client storyboard run evgeny-signals --json \
  > storyboard_report_full.json
```

Once `@adcp/client v5.2.0` ships (carries the populated signals storyboard
from adcp#2365), the Signals track in `storyboard_report_full.json` should
flip from `(not applicable)` to **3 PASS scenarios**:
`capability_discovery`, `discovery`, `activation` (agent + platform).
The pre-validation in [tests/storyboard-conformance.test.ts](../../tests/storyboard-conformance.test.ts)
proves our agent already returns the shapes those scenarios expect.
