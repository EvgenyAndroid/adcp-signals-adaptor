// src/routes/raceRoutes.ts
//
// Wave 6 — Vendor Race Canvas backend.
//
// Endpoints:
//
//   POST /race/start
//     Streams NDJSON. Kicks off a parallel "race" across N vendors against
//     the same brief, emits per-stage events, detects disagreements, and
//     emits reconciliation events at the end. Receipts are emitted inline
//     as each vendor responds.
//
//   POST /race/add-vendor
//     One-shot endpoint (NOT streaming) — runs a single vendor against an
//     existing race's brief and prior responses, returns response +
//     receipt + any new disagreements detected. Used by the Canvas UI's
//     "add a vendor mid-flight" feature.
//
// Demo posture:
//   Both endpoints default to MOCK responses (synthesized via
//   vendorRaceMock.ts) so the workshop narrative is reliable. A "live"
//   mode flag is wired through but not used by the canvas — kept for
//   when real vendors actually expose comparable cohort-sizing tools.
//
// Auth: public (same posture as /agentic/* and /dsp/*). The race
// endpoints don't take paid actions, only synthesize comparison views.

import type { Env } from "../types/env";
import type { Logger } from "../utils/logger";
import { jsonResponse, errorResponse } from "./shared";
import { AGENT_REGISTRY } from "../domain/agentRegistry";
import {
  synthesizeVendorResponse,
  inferBaselineAudience,
  type VendorRaceResponse,
} from "../domain/vendorRaceMock";
import { detectDisagreements, type Disagreement } from "../domain/disagreementDetector";
import { buildReceipt, type AuditReceipt } from "../domain/auditReceipts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface StartBody {
  brief_input?: string;
  vendor_ids?: string[];
  /** "mock" (default, deterministic) or "live" (calls real MCP — not used by canvas). */
  mode?: "mock" | "live";
}

const DEFAULT_RACE_VENDORS = [
  "evgeny_signals",
  "dstillery",
  "celtra",
  "swivel",
  "claire_pub",
  "adzymic_apx",
];

// ── POST /race/start ────────────────────────────────────────────────────────
//
// Event stream contract (NDJSON, one JSON object per line):
//
//   { event: "race_started", race_id, brief_input, vendors[] }
//   { event: "vendor_stage", vendor_id, stage: "probing"|"calling"|"responded", t_ms }
//   { event: "vendor_response", vendor_id, response: VendorRaceResponse }
//   { event: "receipt", receipt: AuditReceipt }
//   { event: "all_vendors_responded", responses: VendorRaceResponse[] }
//   { event: "disagreement_detected", disagreement: Disagreement }
//   { event: "reconcile_started", field, conflict_pair }
//   { event: "reconcile_done", field, reconciled_value, reconcile_rationale }
//   { event: "race_complete", race_id, summary }
//
// Timing: each vendor proceeds through probing -> calling -> responded
// at staggered offsets so the waterfall renders as a race rather than
// a synchronous blast. Per-vendor latency is taken from the mock's
// personality table.

export async function handleRaceStart(request: Request, env: Env, logger: Logger): Promise<Response> {
  void env;
  let body: StartBody = {};
  try { body = await request.json(); } catch { /* empty */ }

  const briefInput = (body.brief_input ?? "").trim();
  if (!briefInput) {
    return errorResponse("INVALID_INPUT", "brief_input (string) required", 400);
  }
  if (briefInput.length > 1000) {
    return errorResponse("INVALID_INPUT", "brief_input max 1000 chars", 400);
  }

  const vendor_ids = Array.isArray(body.vendor_ids) && body.vendor_ids.length > 0
    ? body.vendor_ids
    : DEFAULT_RACE_VENDORS;
  if (vendor_ids.length > 12) {
    return errorResponse("INVALID_INPUT", "vendor_ids max 12 entries", 400);
  }

  const vendors = vendor_ids
    .map((id) => AGENT_REGISTRY.find((a) => a.id === id))
    .filter((a): a is typeof AGENT_REGISTRY[number] => !!a);
  if (vendors.length === 0) {
    return errorResponse("INVALID_INPUT", "no valid vendor_ids matched the registry", 400);
  }

  const baseline = inferBaselineAudience(briefInput);
  const race_id = "race_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  logger.info("race_started", { race_id, vendor_count: vendors.length, briefInput: briefInput.slice(0, 80) });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      try {
        emit({
          event: "race_started",
          race_id,
          brief_input: briefInput,
          baseline_audience: baseline,
          vendors: vendors.map((v) => ({ id: v.id, name: v.name, vendor: v.vendor, role: v.role })),
          ts: new Date().toISOString(),
        });

        // ── Stage 1: probing — all vendors start "probing" at staggered offsets.
        // Stagger keeps the visual waterfall from blasting all rows simultaneously;
        // 60ms increments feel natural without slowing the demo.
        const t0 = Date.now();
        const probeOffsets = vendors.map((_, i) => 60 * i);
        for (let i = 0; i < vendors.length; i++) {
          await sleep(i === 0 ? 50 : 60);
          emit({
            event: "vendor_stage",
            vendor_id: vendors[i]!.id,
            stage: "probing",
            t_ms: Date.now() - t0,
          });
        }

        // ── Stage 2 + 3: each vendor transitions probing → calling → responded
        // independently after its synthesized latency. We schedule per-vendor
        // promises and let them resolve at their own pace.
        const responses: VendorRaceResponse[] = [];
        const receipts: AuditReceipt[] = [];

        const vendorTasks = vendors.map(async (v, i) => {
          const probeDelay = probeOffsets[i] ?? 0;
          // Probing → calling transition (small fixed delay).
          await sleep(120);
          emit({
            event: "vendor_stage",
            vendor_id: v.id,
            stage: "calling",
            t_ms: Date.now() - t0,
          });

          // Synthesize the response — this includes the vendor's
          // engineered "personality latency" so different vendors
          // visibly finish at different times.
          const synthesized = synthesizeVendorResponse(v, briefInput, baseline);
          await sleep(synthesized.latency_ms);

          // Final stage — responded.
          emit({
            event: "vendor_stage",
            vendor_id: v.id,
            stage: "responded",
            t_ms: Date.now() - t0,
          });
          emit({
            event: "vendor_response",
            vendor_id: v.id,
            response: synthesized,
          });

          // Receipt for this vendor's call.
          const receipt = buildReceipt({
            vendor_id: v.id,
            vendor_name: v.name,
            action: "synthesize_cohort_assessment",
            input: { brief: briefInput, vendor_id: v.id, baseline },
            output: synthesized,
            latency_ms: synthesized.latency_ms,
            include_inspect: true,
          });
          emit({ event: "receipt", receipt });

          return { synthesized, receipt };
        });

        const results = await Promise.all(vendorTasks);
        for (const r of results) {
          responses.push(r.synthesized);
          receipts.push(r.receipt);
        }

        emit({
          event: "all_vendors_responded",
          responses,
          total_latency_ms: Date.now() - t0,
        });

        // ── Stage 4: disagreement detection ───────────────────────────────────
        const disagreements = detectDisagreements(responses);
        for (const d of disagreements) {
          // Small delay so the canvas can animate the halo appearance.
          await sleep(450);
          emit({ event: "disagreement_detected", disagreement: d });
        }

        // ── Stage 5: reconcile each disagreement ──────────────────────────────
        // The "Claude reconciles" moment. We don't actually call Claude here —
        // the disagreement detector pre-computed the median (numeric) or
        // conservative pick (categorical). The reconcile_done event delivers
        // that as if the agentic layer had decided it.
        for (const d of disagreements) {
          await sleep(600);
          emit({
            event: "reconcile_started",
            field: d.field,
            field_label: d.field_label,
            conflict_pair: d.conflict_pair,
          });
          await sleep(900);
          emit({
            event: "reconcile_done",
            field: d.field,
            field_label: d.field_label,
            reconciled_value: d.reconciled_value,
            reconcile_rationale: d.reconcile_rationale,
          });
        }

        // ── Final summary ─────────────────────────────────────────────────────
        emit({
          event: "race_complete",
          race_id,
          summary: {
            vendor_count: vendors.length,
            disagreement_count: disagreements.length,
            blocking: disagreements.filter((d) => d.severity === "blocking").length,
            material: disagreements.filter((d) => d.severity === "material").length,
            minor: disagreements.filter((d) => d.severity === "minor").length,
            total_latency_ms: Date.now() - t0,
            receipt_count: receipts.length,
          },
          ts: new Date().toISOString(),
        });
      } catch (e) {
        emit({ event: "error", error: String((e as Error).message || e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// ── POST /race/add-vendor ───────────────────────────────────────────────────
//
// One-shot — synthesize a single vendor's response against the same brief
// the race was started with, return the response + receipt + any newly
// triggered disagreements when this vendor's response is added to the
// existing set. The canvas appends a new row with a fade-in animation
// and re-runs disagreement detection client-side using `disagreements`.

interface AddVendorBody {
  brief_input?: string;
  vendor_id?: string;
  /** Prior responses already on the canvas — used for disagreement diff. */
  prior_responses?: VendorRaceResponse[];
}

export async function handleRaceAddVendor(request: Request, env: Env, logger: Logger): Promise<Response> {
  void env;
  let body: AddVendorBody = {};
  try { body = await request.json(); } catch { /* empty */ }

  const briefInput = (body.brief_input ?? "").trim();
  const vendorId = (body.vendor_id ?? "").trim();
  if (!briefInput || !vendorId) {
    return errorResponse("INVALID_INPUT", "brief_input and vendor_id required", 400);
  }
  const vendor = AGENT_REGISTRY.find((a) => a.id === vendorId);
  if (!vendor) return errorResponse("NOT_FOUND", `vendor_id "${vendorId}" not in registry`, 404);

  const baseline = inferBaselineAudience(briefInput);
  const synthesized = synthesizeVendorResponse(vendor, briefInput, baseline);

  // Receipt
  const receipt = buildReceipt({
    vendor_id: vendor.id,
    vendor_name: vendor.name,
    action: "synthesize_cohort_assessment",
    input: { brief: briefInput, vendor_id: vendor.id, baseline, mid_flight: true },
    output: synthesized,
    latency_ms: synthesized.latency_ms,
    include_inspect: true,
  });

  // New disagreements: re-run detection on prior + new response, return only
  // the disagreements that touch this newly added vendor (others were
  // already shown).
  const all = [...(body.prior_responses ?? []), synthesized];
  const disagreements = detectDisagreements(all);
  const newDisagreements = disagreements.filter((d) =>
    d.conflict_pair.some((p) => p.vendor_id === vendor.id) ||
    d.all_values.some((v) => v.vendor_id === vendor.id),
  );

  logger.info("race_add_vendor", { vendor_id: vendor.id, new_disagreements: newDisagreements.length });

  return jsonResponse({
    vendor: { id: vendor.id, name: vendor.name, vendor: vendor.vendor, role: vendor.role },
    response: synthesized,
    receipt,
    new_disagreements: newDisagreements,
    total_disagreements: disagreements.length,
  });
}

// ── GET /race/available-vendors ─────────────────────────────────────────────
//
// Returns the list of vendors NOT currently in the race (for the
// "add vendor" dropdown). The canvas POSTs the current vendor_id list
// in the body for filtering.

interface AvailableBody {
  current_vendor_ids?: string[];
}

export async function handleRaceAvailableVendors(request: Request, env: Env, _logger: Logger): Promise<Response> {
  void env;
  let body: AvailableBody = {};
  try { body = await request.json(); } catch { /* empty */ }
  const current = new Set(Array.isArray(body.current_vendor_ids) ? body.current_vendor_ids : []);
  const available = AGENT_REGISTRY
    .filter((a) => a.stage === "live" && !current.has(a.id))
    .map((a) => ({ id: a.id, name: a.name, vendor: a.vendor, role: a.role }));
  return jsonResponse({ available, count: available.length });
}

// ── Disagreement type re-export ─────────────────────────────────────────────
// The canvas-side TypeScript-of-the-future could import these.
export type { Disagreement };
