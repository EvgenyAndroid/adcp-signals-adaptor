// src/domain/complianceController.ts
//
// comply_test_controller — the deterministic-testing surface AdCP's hosted
// grader drives to force this agent into states it can assert on, plus the
// hooks that other tool handlers (get_signals, get_operation_status,
// list_tasks) consult to honor a forced state.
//
// SCOPE, decided from a full read of the AdCP 3.1.20 compliance cache, the
// vendored comply-test-controller schema, and the SDK's server/runner
// TypeScript types (2026-09-08) — not from the storyboard's own labeling of
// what's "missing":
//
//   - The hosted card's 11 `missing_test_controller` skips are ALL from
//     universal/idempotency.yaml, which is hardcoded end-to-end to
//     create_media_buy/get_media_buys. It has no comply_test_controller
//     call at all for a signals-only agent to satisfy — it never mentions
//     activate_signal. Building this tool does NOT clear those 11 skips;
//     they become `missing_tool` (agent lacks create_media_buy) instead,
//     which is not a regression, just a relabeling. Do not oversell this.
//   - universal/stale-response-advisory.yaml's controller-gated steps are
//     keyed to get_products (a tool this agent doesn't have) and are
//     `severity: advisory` even when they do run. Zero grading benefit;
//     not implemented.
//   - universal/deterministic-testing.yaml's controller_validation phase
//     IS universal (no protocol/capability gate) and its 4 steps are what
//     this tool actually unlocks: list_scenarios (real), plus three probes
//     dispatched via force_creative_status where the storyboard's own text
//     explicitly accepts UNKNOWN_SCENARIO as a valid response ("per-tenant
//     scenario registration is up to the seller ... both are valid"). We
//     don't implement force_creative_status; returning UNKNOWN_SCENARIO for
//     it is the honest, spec-sanctioned answer, not a shortfall.
//   - protocols/signals/scenarios/get_signals_async.yaml is the one
//     signals-native storyboard, and its only two comply_test_controller
//     calls are force_get_signals_arm and force_task_completion — the
//     SDK's own server-side scenario constants confirm no seed_signal or
//     force_signal_status scenario exists anywhere in the ecosystem, so
//     there is nothing else to build here without inventing surface no
//     grader calls.
//
// So SUPPORTED_SCENARIOS is deliberately just these two. Everything else
// dispatches to UNKNOWN_SCENARIO, which is the schema's own accepted answer
// for an unimplemented force_* scenario, not a workaround.
//
// LIVE-CALLER GATE — deliberately NOT built. universal/comply-controller-
// mode-gate.yaml's deny_live_caller step is the spec's own check for this,
// and its own text marks it `optional: true` "for two-deployment sellers
// whose sandbox endpoint doesn't gate by account mode." This deployment is
// single-endpoint, single-credential (one DEMO_API_KEY, confirmed against
// src/types/env.ts and src/utils/operatorId.ts — no sandbox/live principal
// concept exists anywhere in this codebase), which is exactly the case the
// storyboard exempts. Building a second "live" credential purely to satisfy
// an optional check that doesn't apply to this architecture would be
// invented complexity, not conformance. What IS still enforced: the
// vendored request schema requires `account.sandbox` to be the literal
// `true` (schema-invalid otherwise) — validated below as ordinary request
// shape, independent of the live-caller question.
//
// STATE MODEL — KV, not D1. The forced arm and the discovery task it
// produces are ephemeral, one-shot, compliance-test-only state: nothing a
// production migration should carry. This follows the same
// KV + deriveOperatorId(bearer) namespacing already used for LinkedIn OAuth
// state and workflow annotations (src/domain/runAnnotations.ts) rather than
// adding a D1 migration for state that exists only to be consumed once.
//
// ACCOUNT SCOPING (added 2026-09-08, after a live --with-webhooks run).
// get_signals_async.yaml's list_signals_task_wrong_account /
// get_signals_task_status_wrong_account steps use a SINGLE shared
// credential (this repo's compliance kit has one api_key, no per-account
// secret) and simulate "different account" purely via a different
// `account: {brand, operator}` object on the request body — per the
// spec's own text, "Sellers MUST scope task reconciliation to the
// authenticated account + principal pair," not the principal alone.
// operatorId (token-derived) was the only scoping dimension; two requests
// with the SAME token but DIFFERENT account objects were indistinguishable,
// so the "wrong account" case incorrectly found the task.
// deriveAccountKey folds the account object into a second scoping key,
// applied ADDITIVELY: a task created (or queried) with no account object
// at all keeps today's operatorId-only behavior exactly — this deployment
// is still "single credential, single account" by default, and the vast
// majority of real callers (including our own tests) never send one. The
// mismatch check only fires when BOTH sides declared an account and they
// differ, which is exactly the storyboard's own test shape.

import type { Env } from "../types/env";
import { signWebhookBody } from "./webhookSigning";

/**
 * Canonical key for an AdCP `account` object ({ brand: { domain }, operator }).
 * Returns undefined for anything that isn't a well-formed account object
 * (missing, malformed, or carrying neither field) — callers treat undefined
 * as "no account declared," never as a key that could collide with a real one.
 */
function deriveAccountKey(account: unknown): string | undefined {
  if (!account || typeof account !== "object" || Array.isArray(account)) return undefined;
  const a = account as Record<string, unknown>;
  const operator = typeof a["operator"] === "string" ? a["operator"] : "";
  const brand = a["brand"];
  const domain = brand && typeof brand === "object" && !Array.isArray(brand)
    ? (brand as Record<string, unknown>)["domain"]
    : undefined;
  const domainStr = typeof domain === "string" ? domain : "";
  if (!operator && !domainStr) return undefined;
  return `${domainStr}|${operator}`;
}

export const SUPPORTED_SCENARIOS = ["force_get_signals_arm", "force_task_completion"] as const;

const ARM_TTL_SECONDS = 600; // "typical turnaround 10 minutes" — matches the storyboard's own forced message text
const TASK_TTL_SECONDS = 3600; // generous compliance-run window; this is test-only state, never real data
const INDEX_TTL_SECONDS = 3600;

const armKey = (operatorId: string) => `compliance:arm:get_signals:${operatorId}`;
const taskKey = (operatorId: string, taskId: string) => `compliance:task:${operatorId}:${taskId}`;
const taskIndexKey = (operatorId: string) => `compliance:tasks:${operatorId}`;
// Reverse index so a task_id probed under the WRONG operator resolves to
// "exists, but not yours" (REFERENCE_NOT_FOUND) rather than "doesn't
// exist" — the storyboard's list_signals_task_wrong_account /
// get_signals_task_status_wrong_account steps assert exactly this
// distinction, and the two are different error conditions per the spec's
// own account-scoping language on get_task_status/list_tasks.
const taskOwnerKey = (taskId: string) => `compliance:task-owner:${taskId}`;

interface ComplianceTask {
  task_id: string;
  task_type: "get_signals";
  status: "submitted" | "completed";
  message?: string;
  result?: unknown;
  push_notification_config?: { url?: string } & Record<string, unknown>;
  created_at: string;
  completed_at?: string;
  /** Set from deriveAccountKey(account) at task-creation time (the
   *  get_signals call that consumed the arm). Undefined when that request
   *  carried no account object — see the ACCOUNT SCOPING module note. */
  account_key?: string;
}

export interface ControllerSuccess {
  success: true;
  [key: string]: unknown;
}
export interface ControllerError {
  success: false;
  error:
    | "INVALID_TRANSITION"
    | "INVALID_STATE"
    | "NOT_FOUND"
    | "UNKNOWN_SCENARIO"
    | "INVALID_PARAMS"
    | "FORBIDDEN"
    | "JCS_NON_FINITE_NUMBER"
    | "INTERNAL_ERROR";
  error_detail?: string;
}
export type ControllerResult = ControllerSuccess | ControllerError;

const ctlError = (error: ControllerError["error"], error_detail?: string): ControllerError =>
  error_detail ? { success: false, error, error_detail } : { success: false, error };

/**
 * comply_test_controller entry point. Mirrors the sales agent's
 * complyController.js shape deliberately: this response IS the schema's
 * ControllerError/*Success discriminated union, not the generic AdCP
 * adcp_error envelope — the vendored comply-test-controller-response
 * schema's failure branch is `{success:false, error:<enum>, error_detail?}`,
 * a response BRANCH, not a thrown transport error. Throwing here would
 * produce the wrong shape for the runner to parse.
 */
export async function handleComplyTestController(
  env: Env,
  args: Record<string, unknown>,
  operatorId: string,
): Promise<ControllerResult> {
  // Ordinary request-shape validation — see the module header on why this
  // is NOT a live-caller gate. Every valid request MUST assert
  // account.sandbox === true per the vendored schema's `const: true`.
  const account = args["account"];
  const sandbox =
    account && typeof account === "object" && !Array.isArray(account)
      ? (account as Record<string, unknown>)["sandbox"]
      : undefined;
  if (sandbox !== true) {
    return ctlError("INVALID_PARAMS", "account.sandbox must be true");
  }

  const scenario = typeof args["scenario"] === "string" ? args["scenario"] : "";
  if (!scenario) return ctlError("INVALID_PARAMS", "scenario is required");
  const params =
    args["params"] && typeof args["params"] === "object" && !Array.isArray(args["params"])
      ? (args["params"] as Record<string, unknown>)
      : {};

  switch (scenario) {
    case "list_scenarios":
      return { success: true, scenarios: [...SUPPORTED_SCENARIOS] };
    case "force_get_signals_arm":
      return forceGetSignalsArm(env, params, operatorId);
    case "force_task_completion":
      return forceTaskCompletion(env, params, operatorId);
    default:
      // The honest answer for anything not implemented — see module header.
      // The vendored schema and the SDK's own client type both say
      // "Runners and sellers MUST accept unknown scenario strings," and
      // deterministic-testing.yaml's own narrative accepts this as a valid
      // outcome for the scenarios we don't implement.
      return ctlError(
        "UNKNOWN_SCENARIO",
        `scenario not implemented: ${scenario}. Supported: ${SUPPORTED_SCENARIOS.join(", ")}.`,
      );
  }
}

async function forceGetSignalsArm(
  env: Env,
  params: Record<string, unknown>,
  operatorId: string,
): Promise<ControllerResult> {
  const arm = params["arm"];
  // "v1 supports 'submitted' for all three [force_*_arm] operations" —
  // per the vendored schema's own prose. 'input-required' exists for
  // create_media_buy only; force_get_signals_arm's schema branch accepts
  // only 'submitted'.
  if (arm !== "submitted") {
    return ctlError("INVALID_PARAMS", "params.arm must be 'submitted' for force_get_signals_arm");
  }
  const taskId = typeof params["task_id"] === "string" ? params["task_id"] : "";
  if (!taskId) return ctlError("INVALID_PARAMS", "params.task_id is required");
  const message = typeof params["message"] === "string" ? params["message"] : undefined;

  // Only the ARM is written here. The task record itself is created by
  // get_signals when it actually consumes the arm — this scenario just
  // registers "the next matching get_signals call short-circuits into the
  // submitted envelope," per ForcedDirectiveSuccess's one-shot semantics.
  await env.SIGNALS_CACHE.put(
    armKey(operatorId),
    JSON.stringify({ task_id: taskId, message }),
    { expirationTtl: ARM_TTL_SECONDS },
  );

  return { success: true, forced: { arm: "submitted", task_id: taskId } };
}

/**
 * Called from callGetSignals. Returns the forced submitted envelope's
 * payload if an arm is pending for this operator (and consumes it — one
 * shot, per ForcedDirectiveSuccess), else null to let get_signals proceed
 * normally. Callers pass the request's push_notification_config so
 * force_task_completion can deliver to it later; storing it here at
 * consumption time is the only point the two are naturally correlated.
 * `account` is the same request's account object — stamped onto the task
 * so a later get_task_status/list_tasks call under a DIFFERENT account
 * (same token) can be told apart. See the ACCOUNT SCOPING module note.
 */
export async function checkAndConsumeGetSignalsArm(
  env: Env,
  operatorId: string,
  pushNotificationConfig: unknown,
  account?: unknown,
): Promise<{ status: "submitted"; task_id: string } | null> {
  const raw = await env.SIGNALS_CACHE.get(armKey(operatorId), "json");
  if (!raw || typeof raw !== "object") return null;
  const { task_id, message } = raw as { task_id: string; message?: string };
  if (!task_id) return null;

  // Consume before creating the task record — if the KV delete lost the
  // race with a concurrent duplicate call, both created a task_id-keyed
  // record with identical content, which upserts to the same value below.
  // Idempotent by construction, no lost-update window that matters here.
  await env.SIGNALS_CACHE.delete(armKey(operatorId));

  const accountKey = deriveAccountKey(account);
  const task: ComplianceTask = {
    task_id,
    task_type: "get_signals",
    status: "submitted",
    ...(message ? { message } : {}),
    ...(pushNotificationConfig && typeof pushNotificationConfig === "object"
      ? { push_notification_config: pushNotificationConfig as { url?: string } & Record<string, unknown> }
      : {}),
    ...(accountKey ? { account_key: accountKey } : {}),
    created_at: new Date().toISOString(),
  };
  await Promise.all([
    env.SIGNALS_CACHE.put(taskKey(operatorId, task_id), JSON.stringify(task), {
      expirationTtl: TASK_TTL_SECONDS,
    }),
    env.SIGNALS_CACHE.put(taskOwnerKey(task_id), operatorId, { expirationTtl: TASK_TTL_SECONDS }),
    addToTaskIndex(env, operatorId, task_id),
  ]);

  return { status: "submitted", task_id };
}

async function forceTaskCompletion(
  env: Env,
  params: Record<string, unknown>,
  operatorId: string,
): Promise<ControllerResult> {
  const taskId = typeof params["task_id"] === "string" ? params["task_id"] : "";
  if (!taskId) return ctlError("INVALID_PARAMS", "params.task_id is required");
  const result = params["result"];

  const existing = (await env.SIGNALS_CACHE.get(taskKey(operatorId, taskId), "json")) as
    | ComplianceTask
    | null;
  if (!existing) {
    // Sandbox-scoped by construction: a task_id from another operator's
    // namespace, or one that was never armed, matches nothing here.
    return ctlError("NOT_FOUND", `no forced task ${taskId} for this account`);
  }
  const previous_state = existing.status;
  const completed: ComplianceTask = {
    ...existing,
    status: "completed",
    result,
    completed_at: new Date().toISOString(),
  };
  await env.SIGNALS_CACHE.put(taskKey(operatorId, taskId), JSON.stringify(completed), {
    expirationTtl: TASK_TTL_SECONDS,
  });

  // "The seller MUST deliver result verbatim to the buyer's
  // push_notification_config.url" — fire-and-log, not fire-and-retry: this
  // is a synchronous, single-shot compliance-test path (the storyboard
  // polls immediately after), not the durability-bearing activation
  // webhook pipeline in activationService.ts, so it deliberately doesn't
  // share that pipeline's 5-attempt backoff/D1-receipt machinery.
  const url = existing.push_notification_config?.url;
  if (typeof url === "string" && url.length > 0) {
    await deliverCompletionWebhook(env, url, {
      task_id: taskId,
      task_type: "get_signals",
      protocol: "signals",
      status: "completed",
      result,
    });
  }

  return { success: true, previous_state, current_state: "completed" };
}

async function deliverCompletionWebhook(
  env: Env,
  url: string,
  payload: Record<string, unknown>,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return; // unparseable — nothing to deliver to, nothing to retry
  }
  if (parsed.protocol !== "https:") return; // same https-only rule as the real activation webhook path

  const bodyString = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "adcp-signals-adaptor/1.0",
  };
  if (env.WEBHOOK_SIGNING_SECRET && env.WEBHOOK_SIGNING_SECRET.length > 0) {
    const sig = await signWebhookBody(env.WEBHOOK_SIGNING_SECRET, bodyString);
    headers["X-AdCP-Signature"] = sig.headerValue;
  }
  try {
    await fetch(url, { method: "POST", headers, body: bodyString });
  } catch {
    // Best-effort — the storyboard's assertion is on the delivered payload
    // reaching a runner-controlled webhook receiver in the same run, not
    // on retry behavior. A network failure here isn't recoverable by
    // retrying inside a synchronous tool call.
  }
}

async function addToTaskIndex(env: Env, operatorId: string, taskId: string): Promise<void> {
  const raw = (await env.SIGNALS_CACHE.get(taskIndexKey(operatorId), "json")) as string[] | null;
  const ids = Array.isArray(raw) ? raw : [];
  if (ids.includes(taskId)) return;
  await env.SIGNALS_CACHE.put(taskIndexKey(operatorId), JSON.stringify([...ids, taskId]), {
    expirationTtl: INDEX_TTL_SECONDS,
  });
}

export type ComplianceTaskLookup =
  | { found: true; owned: true; task: ComplianceTask }
  | { found: true; owned: false }
  | { found: false };

/**
 * Called from callGetOperation (get_operation_status / get_task_status)
 * before it falls through to the real D1 activation lookup. Distinguishes
 * "not a compliance task at all" (found:false — caller should proceed to
 * the normal lookup) from "exists, but under a different operator"
 * (found:true, owned:false — the caller MUST get REFERENCE_NOT_FOUND, not
 * silently fall through to a D1 lookup that would also 404 but for the
 * wrong reason).
 *
 * `callerAccount` is the current request's account object. When the task
 * was stamped with an account_key AND the caller also declared one AND
 * they differ, this reports owned:false — same as a genuinely different
 * operator — even though the token/operatorId matches. See the ACCOUNT
 * SCOPING module note for why this only fires when BOTH sides declared one.
 */
export async function getComplianceTask(
  env: Env,
  operatorId: string,
  taskId: string,
  callerAccount?: unknown,
): Promise<ComplianceTaskLookup> {
  const owner = await env.SIGNALS_CACHE.get(taskOwnerKey(taskId));
  if (!owner) return { found: false };
  if (owner !== operatorId) return { found: true, owned: false };
  const task = (await env.SIGNALS_CACHE.get(taskKey(operatorId, taskId), "json")) as
    | ComplianceTask
    | null;
  if (!task) return { found: false }; // owner index outlived the task record (TTL edge) — treat as absent
  const callerAccountKey = deriveAccountKey(callerAccount);
  if (task.account_key && callerAccountKey && task.account_key !== callerAccountKey) {
    return { found: true, owned: false };
  }
  return { found: true, owned: true, task };
}

/**
 * Called from the list_tasks tool. Lists this operator's compliance-test
 * discovery tasks. Deliberately does NOT also list real activation_jobs
 * rows: activation_jobs carries no operator_id column today (confirmed —
 * account_id is a bare free-text nullable string with no FK), so there is
 * no correct way to scope "this operator's activation jobs" yet. Merging
 * in "every activation job that exists" would be accurate only by
 * accident of this being a single-tenant demo today, and would silently
 * become wrong the moment a second operator_id is provisioned (which
 * operatorId.ts already documents as the intended next step) — the
 * dishonest-by-coincidence failure mode this project's own conventions
 * elsewhere (capabilities.js's specialism decisions) explicitly avoid.
 * Wiring in real activation-job listing is a separate, larger feature:
 * it needs operator_id threaded onto activation_jobs first.
 *
 * `callerAccount` mirrors getComplianceTask's account check: a task with a
 * stamped account_key is excluded when the caller declared a DIFFERENT
 * one. A task with no account_key (created without an account object), or
 * a caller that declares none, is never excluded on this basis — see the
 * ACCOUNT SCOPING module note.
 */
export async function listComplianceTasks(
  env: Env,
  operatorId: string,
  callerAccount?: unknown,
): Promise<ComplianceTask[]> {
  const raw = (await env.SIGNALS_CACHE.get(taskIndexKey(operatorId), "json")) as string[] | null;
  const ids = Array.isArray(raw) ? raw : [];
  const tasks = await Promise.all(
    ids.map((id) => env.SIGNALS_CACHE.get(taskKey(operatorId, id), "json")),
  );
  const found = tasks.filter((t): t is ComplianceTask => !!t && typeof t === "object");
  const callerAccountKey = deriveAccountKey(callerAccount);
  if (!callerAccountKey) return found;
  return found.filter((t) => !t.account_key || t.account_key === callerAccountKey);
}
