# Registry-sync bar — before & after PR #114

Demonstrates that the agentic-advertising registry and our local
`AGENT_REGISTRY` are in sync (after URL normalization + 3-vendor
backfill).

## Before (PR #112 baseline)

```
registry=22, local=19, only_in_registry=7, only_in_local=1
```

The 7 "missing" entries broke down as:

| Cause | Count | Examples |
|---|---|---|
| URL trailing-slash drift | 4 | Celtra `/mcp/` vs `/mcp`; Claire scope3 listed twice (`/` and `/mcp` variants); Content Ignite bare root vs `/mcp/` |
| Genuine new vendors | 3 | Setupad gatavocom + wheelrandom; Mamamia (AU publisher) |

## After (PR #114 deploy + cache bust)

```
registry=22, local=22, only_in_registry=0, only_in_local=0
```

Two-part fix:

1. **Diff normalization** in `src/routes/registryRoutes.ts` — strip
   trailing slashes and `/mcp` suffix before set comparison; dedupe
   within the registry side.
2. **Backfill** in `src/domain/agentRegistry.ts` — added 3 vendor
   entries with best-guess specialties; tool surfaces TBD until first
   orchestrator probe.

## Workshop talking point

The Canvas registry-sync bar is a **freshness signal**. Any non-zero
`+N new` pill in the future means the registry has grown faster than
our snapshot. The watcher cron picks this up automatically the next
day.
