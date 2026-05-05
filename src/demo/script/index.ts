// src/demo/script/index.ts
//
// Orchestrator for the inlined demo browser-script bundle.
//
// Imports each feature fragment from ./fragments/* and concatenates
// them in the original source order to reproduce the pre-refactor
// <script>...</script> block byte-for-byte. Byte-equivalence is
// enforced by tests/demo-render-snapshot.test.ts (SHA-256 of body).
//
// Adding a new feature pane:
//   1. Create src/demo/script/fragments/<feature>.ts exporting a
//      string (or function returning string) that contains valid
//      browser JS, escape-aware (\${} and backtick inside the inner
//      JS must be backslash-escaped).
//   2. Import it below and add a slot in the concatenation chain.
//   3. Update the snapshot test if the rendered output legitimately
//      changes: `npx vitest run -u tests/demo-render-snapshot.test.ts`.
//
// Order matters: browser-side functions share a single global scope,
// so all fragments end up in one IIFE-style script. Keep this order
// stable to preserve declaration ordering.

import { bootstrapJs } from "./fragments/bootstrap";
import { utilsJs } from "./fragments/utils";
import { authJs } from "./fragments/auth";
import { uiStateJs } from "./fragments/ui-state";
import { traceInspectorJs } from "./fragments/trace-inspector";
import { tabsRouterJs } from "./fragments/tabs-router";
import { discoverJs } from "./fragments/discover";
import { catalogJs } from "./fragments/catalog";
import { detailPanelJs } from "./fragments/detail-panel";
import { treemapJs } from "./fragments/treemap";
import { builderJs } from "./fragments/builder";
import { overlapJs } from "./fragments/overlap";
import { capabilitiesJs } from "./fragments/capabilities";
import { activationsJs } from "./fragments/activations";
import { toolLogJs } from "./fragments/tool-log";
import { devkitJs } from "./fragments/devkit";
import { embeddingLabJs } from "./fragments/embedding-lab";
import { portfolioJs } from "./fragments/portfolio";
import { composerJs } from "./fragments/composer";
import { journeyJs } from "./fragments/journey";
import { plannerJs } from "./fragments/planner";
import { snapshotsJs } from "./fragments/snapshots";
import { freshnessJs } from "./fragments/freshness";
import { expressionTreeJs } from "./fragments/expression-tree";
import { workflowHandlersJs } from "./fragments/workflow-handlers";
import { orchestratorJs } from "./fragments/orchestrator";
import { workflowCanvasJs } from "./fragments/workflow-canvas";
import { brandCanvasJs } from "./fragments/brand-canvas";
import { federationJs } from "./fragments/federation";
import { campaignJs } from "./fragments/campaign";
import { explainBadgesJs } from "./fragments/explain-badges";
import { agenticStreamJs } from "./fragments/agentic-stream";
import { signalsGlossaryJs } from "./fragments/signals-glossary";
import { signalsTraceViewerJs } from "./fragments/signals-trace-viewer";

export function SCRIPT_TAG(safeKey: string): string {
  return `<script type="module">
${bootstrapJs(safeKey)}${utilsJs}${authJs}${uiStateJs}${traceInspectorJs}${signalsGlossaryJs}${signalsTraceViewerJs}${tabsRouterJs}${discoverJs}${catalogJs}${detailPanelJs}${treemapJs}${builderJs}${overlapJs}${capabilitiesJs}${activationsJs}${toolLogJs}${devkitJs}${embeddingLabJs}${portfolioJs}${composerJs}${journeyJs}${plannerJs}${snapshotsJs}${freshnessJs}${expressionTreeJs}${workflowHandlersJs}${orchestratorJs}${workflowCanvasJs}${brandCanvasJs}${federationJs}${campaignJs}${explainBadgesJs}${agenticStreamJs}</script>`;
}
