// tests/comply-test-controller.test.ts
//
// comply_test_controller + list_tasks — see src/domain/complianceController.ts
// for full scope rationale. Two layers:
//   - Domain-level: handleComplyTestController + the three hooks
//     (checkAndConsumeGetSignalsArm, getComplianceTask, listComplianceTasks)
//     against a real in-memory KV fake, no MCP transport involved.
//   - MCP-level: the two new tool dispatches (comply_test_controller,
//     list_tasks) and the two interception hooks wired into
//     get_signals/get_operation_status in src/mcp/server.ts, via
//     handleMcpRequest end-to-end.

import { describe, it, expect, vi } from "vitest";

// callGetSignals unconditionally calls getWholesaleFeedVersion(db) near the
// top of every get_signals call (to have a token ready to echo even on the
// non-wholesale path) — before the comply_test_controller arm-check hook
// under test ever runs. The MCP-level tests below need that call, and the
// full search path for the un-armed case, to work without a real D1 binding
// — same mocking idiom as tests/get-signals-exact-lookup.test.ts.
vi.mock("../src/domain/signalService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/domain/signalService")>();
  return {
    ...actual,
    getWholesaleFeedVersion: async () => "wf_comply_test_token",
    searchSignalsService: async () => ({ signals: [], totalCount: 0, hasMore: false }),
  };
});

import {
  handleComplyTestController,
  checkAndConsumeGetSignalsArm,
  getComplianceTask,
  listComplianceTasks,
  SUPPORTED_SCENARIOS,
} from "../src/domain/complianceController";

function makeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(k: string, type?: string) {
      const v = store.get(k);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(k: string, v: string) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async list() { return { keys: [...store.keys()].map((name) => ({ name })), list_complete: true } as never; },
    async getWithMetadata() { return { value: null, metadata: null } as never; },
  } as unknown as KVNamespace;
}

const OP_A = "operator_aaaaaaaaaaaa";
const OP_B = "operator_bbbbbbbbbbbb";

function makeEnv(kv: KVNamespace, extra: Record<string, unknown> = {}) {
  return { SIGNALS_CACHE: kv, ...extra } as unknown as import("../src/types/env").Env;
}

describe("handleComplyTestController — request-shape gate", () => {
  it("rejects a request without account.sandbox === true", async () => {
    const env = makeEnv(makeKv());
    const result = await handleComplyTestController(env, { scenario: "list_scenarios" }, OP_A);
    expect(result).toEqual({ success: false, error: "INVALID_PARAMS", error_detail: expect.any(String) });
  });

  it("rejects account.sandbox: false explicitly (not just missing)", async () => {
    const env = makeEnv(makeKv());
    const result = await handleComplyTestController(
      env,
      { scenario: "list_scenarios", account: { sandbox: false } },
      OP_A,
    );
    expect(result.success).toBe(false);
  });

  it("rejects a missing scenario", async () => {
    const env = makeEnv(makeKv());
    const result = await handleComplyTestController(env, { account: { sandbox: true } }, OP_A);
    expect(result).toEqual({ success: false, error: "INVALID_PARAMS", error_detail: expect.any(String) });
  });

  it("list_scenarios reports exactly the two implemented scenarios", async () => {
    const env = makeEnv(makeKv());
    const result = await handleComplyTestController(
      env,
      { scenario: "list_scenarios", account: { sandbox: true } },
      OP_A,
    );
    expect(result).toEqual({ success: true, scenarios: [...SUPPORTED_SCENARIOS] });
  });

  it("an unimplemented scenario returns UNKNOWN_SCENARIO, not an error thrown", async () => {
    const env = makeEnv(makeKv());
    const result = await handleComplyTestController(
      env,
      { scenario: "force_creative_status", account: { sandbox: true } },
      OP_A,
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("UNKNOWN_SCENARIO");
  });
});

describe("force_get_signals_arm / checkAndConsumeGetSignalsArm", () => {
  it("rejects params.arm values other than 'submitted'", async () => {
    const env = makeEnv(makeKv());
    const result = await handleComplyTestController(
      env,
      { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "input-required", task_id: "t1" } },
      OP_A,
    );
    expect(result).toEqual({ success: false, error: "INVALID_PARAMS", error_detail: expect.any(String) });
  });

  it("rejects a missing task_id", async () => {
    const env = makeEnv(makeKv());
    const result = await handleComplyTestController(
      env,
      { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted" } },
      OP_A,
    );
    expect(result).toEqual({ success: false, error: "INVALID_PARAMS", error_detail: expect.any(String) });
  });

  it("arming then consuming returns the forced task_id exactly once", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    const armed = await handleComplyTestController(
      env,
      { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: "task_forced_1" } },
      OP_A,
    );
    expect(armed).toEqual({ success: true, forced: { arm: "submitted", task_id: "task_forced_1" } });

    const first = await checkAndConsumeGetSignalsArm(env, OP_A, undefined);
    expect(first).toEqual({ status: "submitted", task_id: "task_forced_1" });

    const second = await checkAndConsumeGetSignalsArm(env, OP_A, undefined);
    expect(second).toBeNull();
  });

  it("an arm for one operator is invisible to a different operator", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    await handleComplyTestController(
      env,
      { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: "task_x" } },
      OP_A,
    );
    const result = await checkAndConsumeGetSignalsArm(env, OP_B, undefined);
    expect(result).toBeNull();
  });

  it("consuming an arm records the task under getComplianceTask/listComplianceTasks", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    await handleComplyTestController(
      env,
      { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: "task_rec" } },
      OP_A,
    );
    await checkAndConsumeGetSignalsArm(env, OP_A, undefined);

    const lookup = await getComplianceTask(env, OP_A, "task_rec");
    expect(lookup.found).toBe(true);
    if (lookup.found && lookup.owned) {
      expect(lookup.task.status).toBe("submitted");
      expect(lookup.task.task_type).toBe("get_signals");
    }

    const listed = await listComplianceTasks(env, OP_A);
    expect(listed.map((t) => t.task_id)).toEqual(["task_rec"]);
  });

  it("no arm pending → null, get_signals proceeds normally", async () => {
    const env = makeEnv(makeKv());
    const result = await checkAndConsumeGetSignalsArm(env, OP_A, undefined);
    expect(result).toBeNull();
  });
});

describe("force_task_completion", () => {
  it("NOT_FOUND for a task_id that was never armed/consumed", async () => {
    const env = makeEnv(makeKv());
    const result = await handleComplyTestController(
      env,
      { scenario: "force_task_completion", account: { sandbox: true }, params: { task_id: "ghost" } },
      OP_A,
    );
    expect(result).toEqual({ success: false, error: "NOT_FOUND", error_detail: expect.any(String) });
  });

  it("NOT_FOUND for a task_id that belongs to a different operator", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    await handleComplyTestController(
      env,
      { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: "task_cross" } },
      OP_A,
    );
    await checkAndConsumeGetSignalsArm(env, OP_A, undefined);

    const result = await handleComplyTestController(
      env,
      { scenario: "force_task_completion", account: { sandbox: true }, params: { task_id: "task_cross" } },
      OP_B,
    );
    expect(result.success).toBe(false);
  });

  it("completes a submitted task and reports previous_state/current_state", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    await handleComplyTestController(
      env,
      { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: "task_complete" } },
      OP_A,
    );
    await checkAndConsumeGetSignalsArm(env, OP_A, undefined);

    const result = await handleComplyTestController(
      env,
      {
        scenario: "force_task_completion",
        account: { sandbox: true },
        params: { task_id: "task_complete", result: { signals: [] } },
      },
      OP_A,
    );
    expect(result).toEqual({ success: true, previous_state: "submitted", current_state: "completed" });

    const lookup = await getComplianceTask(env, OP_A, "task_complete");
    expect(lookup.found).toBe(true);
    if (lookup.found && lookup.owned) {
      expect(lookup.task.status).toBe("completed");
      expect(lookup.task.result).toEqual({ signals: [] });
    }
  });

  it("delivers the completion payload to an https push_notification_config.url", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await handleComplyTestController(
        env,
        { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: "task_webhook" } },
        OP_A,
      );
      await checkAndConsumeGetSignalsArm(env, OP_A, { url: "https://buyer.example/webhook" });

      await handleComplyTestController(
        env,
        {
          scenario: "force_task_completion",
          account: { sandbox: true },
          params: { task_id: "task_webhook", result: { ok: true } },
        },
        OP_A,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe("https://buyer.example/webhook");
      expect(JSON.parse(init.body)).toMatchObject({ task_id: "task_webhook", status: "completed" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does NOT deliver to a non-https push_notification_config.url", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await handleComplyTestController(
        env,
        { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: "task_http" } },
        OP_A,
      );
      await checkAndConsumeGetSignalsArm(env, OP_A, { url: "http://insecure.example/webhook" });

      await handleComplyTestController(
        env,
        { scenario: "force_task_completion", account: { sandbox: true }, params: { task_id: "task_http" } },
        OP_A,
      );

      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("getComplianceTask / listComplianceTasks", () => {
  it("found:false for a task_id that was never armed", async () => {
    const env = makeEnv(makeKv());
    const lookup = await getComplianceTask(env, OP_A, "never_existed");
    expect(lookup).toEqual({ found: false });
  });

  it("found:true, owned:false for another operator's task", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    await handleComplyTestController(
      env,
      { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: "task_shared" } },
      OP_A,
    );
    await checkAndConsumeGetSignalsArm(env, OP_A, undefined);

    const lookup = await getComplianceTask(env, OP_B, "task_shared");
    expect(lookup).toEqual({ found: true, owned: false });
  });

  it("listComplianceTasks is empty for an operator with no tasks", async () => {
    const env = makeEnv(makeKv());
    const listed = await listComplianceTasks(env, OP_A);
    expect(listed).toEqual([]);
  });

  it("listComplianceTasks returns multiple tasks for the same operator", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    for (const id of ["task_1", "task_2"]) {
      await handleComplyTestController(
        env,
        { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: id } },
        OP_A,
      );
      await checkAndConsumeGetSignalsArm(env, OP_A, undefined);
    }
    const listed = await listComplianceTasks(env, OP_A);
    expect(listed.map((t) => t.task_id).sort()).toEqual(["task_1", "task_2"]);
  });
});

// ── Account scoping — get_signals_async.yaml's list_signals_task_wrong_account /
// get_signals_task_status_wrong_account steps use ONE shared credential and
// simulate "different account" purely via a different `account` object on the
// request body. operatorId (token-derived) alone can't tell those apart; these
// tests exercise the account_key dimension added on top of it.

const ACCOUNT_NOVA = { brand: { domain: "novamotors.example" }, operator: "pinnacle-agency.example", sandbox: true };
const ACCOUNT_OTHER = { brand: { domain: "otherbrand.example" }, operator: "other-operator.example", sandbox: true };

async function armConsumeAs(env: import("../src/types/env").Env, taskId: string, account?: unknown) {
  await handleComplyTestController(
    env,
    { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: taskId } },
    OP_A,
  );
  return checkAndConsumeGetSignalsArm(env, OP_A, undefined, account);
}

describe("account scoping — same operatorId, different account object", () => {
  it("a task created under one account is owned:false when queried under a different account (same operatorId)", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    await armConsumeAs(env, "task_acct_1", ACCOUNT_NOVA);

    const sameAccount = await getComplianceTask(env, OP_A, "task_acct_1", ACCOUNT_NOVA);
    expect(sameAccount).toMatchObject({ found: true, owned: true });

    const differentAccount = await getComplianceTask(env, OP_A, "task_acct_1", ACCOUNT_OTHER);
    expect(differentAccount).toEqual({ found: true, owned: false });
  });

  it("a task created WITHOUT an account object is unaffected by account scoping (backward compat)", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    await armConsumeAs(env, "task_no_acct", undefined);

    // Neither side declares an account — today's operatorId-only behavior.
    const noAccountEither = await getComplianceTask(env, OP_A, "task_no_acct");
    expect(noAccountEither).toMatchObject({ found: true, owned: true });

    // Caller declares one, task doesn't — still owned:true. The mismatch
    // check only fires when BOTH sides declared an account (see the
    // ACCOUNT SCOPING module note in complianceController.ts).
    const callerOnly = await getComplianceTask(env, OP_A, "task_no_acct", ACCOUNT_NOVA);
    expect(callerOnly).toMatchObject({ found: true, owned: true });
  });

  it("listComplianceTasks excludes a different-account task but includes matching/unscoped ones", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    await armConsumeAs(env, "task_nova", ACCOUNT_NOVA);
    await armConsumeAs(env, "task_other", ACCOUNT_OTHER);
    await armConsumeAs(env, "task_unscoped", undefined);

    const asNova = await listComplianceTasks(env, OP_A, ACCOUNT_NOVA);
    expect(asNova.map((t) => t.task_id).sort()).toEqual(["task_nova", "task_unscoped"]);

    const asOther = await listComplianceTasks(env, OP_A, ACCOUNT_OTHER);
    expect(asOther.map((t) => t.task_id).sort()).toEqual(["task_other", "task_unscoped"]);

    // No account declared by the caller at all — every task visible, matching
    // today's behavior for the common single-account-per-token case.
    const noAccountDeclared = await listComplianceTasks(env, OP_A);
    expect(noAccountDeclared.map((t) => t.task_id).sort()).toEqual(["task_nova", "task_other", "task_unscoped"]);
  });
});

// ── MCP-level wiring ──────────────────────────────────────────────────────────
// handleMcpRequest end-to-end: tool dispatch for comply_test_controller/
// list_tasks, plus the two interception hooks spliced into get_signals and
// get_operation_status.

import { handleMcpRequest } from "../src/mcp/server";
import { createLogger } from "../src/utils/logger";

const KEY = "demo-key-comply-test";
const logger = createLogger("comply-test-req");

// get_task_status's D1 fallback (a task_id absent from compliance-KV) calls
// getOperationService -> findOperationById -> db.prepare(...).bind(...).first(),
// which throws TypeError on an undefined DB binding rather than resolving to
// null. A conformant "not found" fake keeps that path exercising the REAL
// NotFoundError -> REFERENCE_NOT_FOUND mapping instead of crashing on a
// missing test fixture.
function makeEmptyDb() {
  return {
    prepare(_sql: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() { return { success: true, meta: {} }; },
      };
    },
  } as unknown as import("../src/types/env").Env["DB"];
}

function makeMcpEnv(kv: KVNamespace, apiKey: string = KEY) {
  return { DEMO_API_KEY: apiKey, SIGNALS_CACHE: kv, DB: makeEmptyDb() } as unknown as import("../src/types/env").Env;
}

async function callTool(env: import("../src/types/env").Env, name: string, args: Record<string, unknown>) {
  const req = new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const res = await handleMcpRequest(req, env, logger);
  return JSON.parse(await res.text());
}

describe("MCP dispatch — comply_test_controller / list_tasks", () => {
  it("comply_test_controller list_scenarios round-trips through the MCP envelope", async () => {
    const env = makeMcpEnv(makeKv());
    const body = await callTool(env, "comply_test_controller", {
      scenario: "list_scenarios",
      account: { sandbox: true },
    });
    const sc = body.result?.structuredContent;
    expect(sc.success).toBe(true);
    expect(sc.scenarios).toEqual([...SUPPORTED_SCENARIOS]);
  });

  it("list_tasks starts empty and reflects a forced+consumed arm", async () => {
    const kv = makeKv();
    const env = makeMcpEnv(kv);

    const empty = await callTool(env, "list_tasks", {});
    expect(empty.result?.structuredContent.tasks).toEqual([]);

    await callTool(env, "comply_test_controller", {
      scenario: "force_get_signals_arm",
      account: { sandbox: true },
      params: { arm: "submitted", task_id: "mcp_task_1" },
    });
    await callTool(env, "get_signals", { signal_spec: "anything" });

    const after = await callTool(env, "list_tasks", {});
    const tasks = after.result?.structuredContent.tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ task_id: "mcp_task_1", status: "submitted", task_type: "get_signals" });
  });

  it("an armed get_signals call short-circuits into a submitted task instead of the catalog", async () => {
    const kv = makeKv();
    const env = makeMcpEnv(kv);
    await callTool(env, "comply_test_controller", {
      scenario: "force_get_signals_arm",
      account: { sandbox: true },
      params: { arm: "submitted", task_id: "mcp_task_arm" },
    });

    const body = await callTool(env, "get_signals", { signal_spec: "anything" });
    const sc = body.result?.structuredContent;
    expect(sc.status ?? body.result?.status).toBeDefined();
    expect(sc.task_id ?? body.result?.task_id).toBe("mcp_task_arm");
  });

  it("get_operation_status resolves a forced task via the compliance hook, not D1", async () => {
    const kv = makeKv();
    const env = makeMcpEnv(kv);
    await callTool(env, "comply_test_controller", {
      scenario: "force_get_signals_arm",
      account: { sandbox: true },
      params: { arm: "submitted", task_id: "mcp_task_poll" },
    });
    await callTool(env, "get_signals", { signal_spec: "anything" });

    await callTool(env, "comply_test_controller", {
      scenario: "force_task_completion",
      account: { sandbox: true },
      params: { task_id: "mcp_task_poll", result: { signals: [] } },
    });

    const body = await callTool(env, "get_operation_status", { task_id: "mcp_task_poll" });
    const sc = body.result?.structuredContent;
    expect(sc.status ?? body.result?.status).toBeTruthy();
  });

  it("account.sandbox: false is rejected as a domain-level INVALID_PARAMS, not an MCP transport error", async () => {
    const kv = makeKv();
    const env = makeMcpEnv(kv);
    const body = await callTool(env, "comply_test_controller", {
      scenario: "list_scenarios",
      account: { sandbox: false },
    });
    expect(body.error).toBeUndefined();
    expect(body.result?.isError).not.toBe(true);
    expect(body.result?.structuredContent?.success).toBe(false);
    expect(body.result?.structuredContent?.error).toBe("INVALID_PARAMS");
  });

  it("comply_test_controller and list_tasks are rejected pre-dispatch without authentication", async () => {
    const kv = makeKv();
    const env = makeMcpEnv(kv);
    const req = new Request("https://example.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "comply_test_controller", arguments: { scenario: "list_scenarios", account: { sandbox: true } } },
      }),
    });
    const res = await handleMcpRequest(req, env, logger);
    expect(res.status).toBe(401);
  });

  it("get_signals with no armed task behaves exactly as before (unaffected by the hook)", async () => {
    const env = makeMcpEnv(makeKv());
    const body = await callTool(env, "get_signals", { signal_spec: "anything" });
    expect(body.error).toBeUndefined();
    expect(body.result?.isError).not.toBe(true);
  });
});

// ── get_task_status — the canonical AdCP 3.x tool, distinct from the ────────
// legacy get_operation_status shape. Added after the first production
// compliance run showed get_signals_async.yaml's required_tools gate checks
// for an advertised tool literally named get_task_status, and its steps
// assert task_type/protocol/created_at/updated_at fields get_operation_status
// never carried.

const OTHER_KEY = "demo-key-comply-test-OTHER-OPERATOR";

async function callToolAs(
  env: import("../src/types/env").Env,
  authKey: string,
  name: string,
  args: Record<string, unknown>,
) {
  const req = new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authKey}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const res = await handleMcpRequest(req, env, logger);
  return JSON.parse(await res.text());
}

async function armAndConsume(
  env: import("../src/types/env").Env,
  taskId: string,
  pushNotificationConfig?: Record<string, unknown>,
) {
  await callTool(env, "comply_test_controller", {
    scenario: "force_get_signals_arm",
    account: { sandbox: true },
    params: { arm: "submitted", task_id: taskId },
  });
  await callTool(env, "get_signals", {
    signal_spec: "anything",
    ...(pushNotificationConfig ? { push_notification_config: pushNotificationConfig } : {}),
  });
}

describe("MCP dispatch — get_task_status", () => {
  it("returns the canonical envelope for a submitted task", async () => {
    const env = makeMcpEnv(makeKv());
    await armAndConsume(env, "task_canonical_submitted");

    const body = await callTool(env, "get_task_status", { task_id: "task_canonical_submitted" });
    const sc = body.result?.structuredContent;
    expect(sc).toMatchObject({
      task_id: "task_canonical_submitted",
      task_type: "get_signals",
      protocol: "signals",
      status: "submitted",
      has_webhook: false,
    });
    expect(sc.created_at).toBeTruthy();
    expect(sc.updated_at).toBeTruthy();
  });

  it("has_webhook is true when the get_signals call registered a push_notification_config", async () => {
    const env = makeMcpEnv(makeKv());
    await armAndConsume(env, "task_with_webhook", { url: "https://buyer.example/webhook" });

    const body = await callTool(env, "get_task_status", { task_id: "task_with_webhook" });
    expect(body.result?.structuredContent.has_webhook).toBe(true);
  });

  it("omits result by default, includes it only when include_result: true and completed", async () => {
    const env = makeMcpEnv(makeKv());
    await armAndConsume(env, "task_result_gate");
    await callTool(env, "comply_test_controller", {
      scenario: "force_task_completion",
      account: { sandbox: true },
      params: { task_id: "task_result_gate", result: { signals: [{ signal_agent_segment_id: "seg_1" }] } },
    });

    const withoutFlag = await callTool(env, "get_task_status", { task_id: "task_result_gate" });
    expect(withoutFlag.result?.structuredContent.status).toBe("completed");
    expect(withoutFlag.result?.structuredContent.result).toBeUndefined();

    const withFlag = await callTool(env, "get_task_status", { task_id: "task_result_gate", include_result: true });
    expect(withFlag.result?.structuredContent.result).toEqual({ signals: [{ signal_agent_segment_id: "seg_1" }] });
  });

  it("include_result: true on a still-submitted task returns no result (nothing to include yet)", async () => {
    const env = makeMcpEnv(makeKv());
    await armAndConsume(env, "task_not_yet_completed");

    const body = await callTool(env, "get_task_status", { task_id: "task_not_yet_completed", include_result: true });
    expect(body.result?.structuredContent.status).toBe("submitted");
    expect(body.result?.structuredContent.result).toBeUndefined();
  });

  it("a task_id owned by a different caller resolves to REFERENCE_NOT_FOUND, not the task", async () => {
    // Two envs sharing one KV store but with DIFFERENT DEMO_API_KEY values —
    // the same "provision a second secret" multi-operator model
    // complianceController.ts's own header describes. A single shared env
    // with two different bearer tokens can't simulate this: requireAuth
    // checks the token against ONE env.DEMO_API_KEY, so a token that isn't
    // that env's own key just fails auth (401) rather than resolving to a
    // second operator.
    const kv = makeKv();
    const envA = makeMcpEnv(kv);
    await armAndConsume(envA, "task_cross_caller");

    const envB = makeMcpEnv(kv, OTHER_KEY);
    const body = await callToolAs(envB, OTHER_KEY, "get_task_status", { task_id: "task_cross_caller" });
    expect(body.result?.isError).toBe(true);
    expect(body.result?.structuredContent?.adcp_error?.code).toBe("REFERENCE_NOT_FOUND");
  });

  it("a task_id that never existed resolves to REFERENCE_NOT_FOUND (no D1 binding, falls through cleanly)", async () => {
    const env = makeMcpEnv(makeKv());
    const body = await callTool(env, "get_task_status", { task_id: "task_never_existed" });
    expect(body.result?.isError).toBe(true);
    expect(body.result?.structuredContent?.adcp_error?.code).toBe("REFERENCE_NOT_FOUND");
  });

  it("get_task_status requires an authenticated caller", async () => {
    const env = makeMcpEnv(makeKv());
    const req = new Request("https://example.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "get_task_status", arguments: { task_id: "whatever" } },
      }),
    });
    const res = await handleMcpRequest(req, env, logger);
    expect(res.status).toBe(401);
  });
});

describe("MCP dispatch — list_tasks filters[]", () => {
  it("filters by task_ids and reports an exact total_matching/returned count", async () => {
    const env = makeMcpEnv(makeKv());
    await armAndConsume(env, "task_filter_a");
    await armAndConsume(env, "task_filter_b");

    const body = await callTool(env, "list_tasks", { filters: { task_ids: ["task_filter_a"] } });
    const sc = body.result?.structuredContent;
    expect(sc.query_summary).toEqual({ total_matching: 1, returned: 1 });
    expect(sc.tasks).toHaveLength(1);
    expect(sc.tasks[0].task_id).toBe("task_filter_a");
  });

  it("filters by has_webhook", async () => {
    const env = makeMcpEnv(makeKv());
    await armAndConsume(env, "task_no_hook");
    await armAndConsume(env, "task_has_hook", { url: "https://buyer.example/webhook" });

    const body = await callTool(env, "list_tasks", { filters: { has_webhook: true } });
    const sc = body.result?.structuredContent;
    expect(sc.tasks.map((t: { task_id: string }) => t.task_id)).toEqual(["task_has_hook"]);
    expect(sc.tasks[0].has_webhook).toBe(true);
  });

  it("filters by task_type and returns has_webhook: false when no webhook was registered", async () => {
    const env = makeMcpEnv(makeKv());
    await armAndConsume(env, "task_typed");

    const body = await callTool(env, "list_tasks", { filters: { task_type: "get_signals" } });
    const sc = body.result?.structuredContent;
    expect(sc.tasks).toHaveLength(1);
    expect(sc.tasks[0]).toMatchObject({ task_type: "get_signals", has_webhook: false });
  });

  it("an unmatched filter returns an empty page with a zero query_summary, not every task", async () => {
    const env = makeMcpEnv(makeKv());
    await armAndConsume(env, "task_unfiltered");

    const body = await callTool(env, "list_tasks", { filters: { task_ids: ["nope_missing"] } });
    const sc = body.result?.structuredContent;
    expect(sc.tasks).toEqual([]);
    expect(sc.query_summary).toEqual({ total_matching: 0, returned: 0 });
  });
});

// ── MCP-level — the exact get_signals_async.yaml shape: ONE shared bearer
// token throughout (this repo's compliance kit has no per-account
// credential), "different account" simulated purely via a different
// `account` object on the request body.

describe("MCP dispatch — account-scoped task isolation (shared credential)", () => {
  it("list_tasks under a different account (same token) does not see the task", async () => {
    const env = makeMcpEnv(makeKv());
    await callTool(env, "comply_test_controller", {
      scenario: "force_get_signals_arm",
      account: { sandbox: true },
      params: { arm: "submitted", task_id: "mcp_task_nova" },
    });
    await callTool(env, "get_signals", { signal_spec: "anything", account: ACCOUNT_NOVA });

    const ownAccount = await callTool(env, "list_tasks", {
      account: ACCOUNT_NOVA,
      filters: { task_ids: ["mcp_task_nova"] },
    });
    expect(ownAccount.result?.structuredContent.query_summary).toEqual({ total_matching: 1, returned: 1 });

    const wrongAccount = await callTool(env, "list_tasks", {
      account: ACCOUNT_OTHER,
      filters: { task_ids: ["mcp_task_nova"] },
    });
    expect(wrongAccount.result?.structuredContent.query_summary).toEqual({ total_matching: 0, returned: 0 });
  });

  it("get_task_status under a different account (same token) resolves to REFERENCE_NOT_FOUND", async () => {
    const env = makeMcpEnv(makeKv());
    await callTool(env, "comply_test_controller", {
      scenario: "force_get_signals_arm",
      account: { sandbox: true },
      params: { arm: "submitted", task_id: "mcp_task_status_nova" },
    });
    await callTool(env, "get_signals", { signal_spec: "anything", account: ACCOUNT_NOVA });

    const wrongAccount = await callTool(env, "get_task_status", {
      task_id: "mcp_task_status_nova",
      account: ACCOUNT_OTHER,
    });
    expect(wrongAccount.result?.isError).toBe(true);
    expect(wrongAccount.result?.structuredContent?.adcp_error?.code).toBe("REFERENCE_NOT_FOUND");

    const ownAccount = await callTool(env, "get_task_status", {
      task_id: "mcp_task_status_nova",
      account: ACCOUNT_NOVA,
    });
    expect(ownAccount.result?.isError).not.toBe(true);
    expect(ownAccount.result?.structuredContent?.task_id).toBe("mcp_task_status_nova");
  });
});
