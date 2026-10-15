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
import { expectMatchesOutputSchema } from "./outputSchemaConformance";

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

describe("handleComplyTestController — live-caller gate", () => {
  it("refuses a live-mode principal with FORBIDDEN before the request-shape check", async () => {
    const env = makeEnv(makeKv());
    // No account at all: a sandbox principal would get INVALID_PARAMS here.
    const r = await handleComplyTestController(env, { scenario: "list_scenarios" }, OP_A, "live");
    expect(r).toMatchObject({ success: false, error: "FORBIDDEN" });
  });

  it("a live-mode principal cannot arm a forced state", async () => {
    const env = makeEnv(makeKv());
    const r = await handleComplyTestController(
      env,
      { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: "live_task" } },
      OP_A,
      "live",
    );
    expect(r).toMatchObject({ success: false, error: "FORBIDDEN" });
    expect(await checkAndConsumeGetSignalsArm(env, OP_A, undefined)).toBeNull();
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
      await checkAndConsumeGetSignalsArm(env, OP_A, {
        url: "https://buyer.example/webhook",
        operation_id: "op_test_terminal",
      });

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
      const body = JSON.parse(init.body);
      // mcp-webhook-payload.json requires idempotency_key, operation_id,
      // task_id, task_type, status, timestamp — found missing by a live
      // --with-webhooks run against expect_signals_terminal_webhook.
      expect(body).toMatchObject({ task_id: "task_webhook", status: "completed", operation_id: "op_test_terminal" });
      expect(body.idempotency_key).toMatch(/^[A-Za-z0-9_.:-]{16,255}$/);
      expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("omits operation_id from the webhook payload when the caller never registered one", async () => {
    const kv = makeKv();
    const env = makeEnv(kv);
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await handleComplyTestController(
        env,
        { scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: "task_no_opid" } },
        OP_A,
      );
      await checkAndConsumeGetSignalsArm(env, OP_A, { url: "https://buyer.example/webhook" });

      await handleComplyTestController(
        env,
        { scenario: "force_task_completion", account: { sandbox: true }, params: { task_id: "task_no_opid", result: { ok: true } } },
        OP_A,
      );

      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse(init.body);
      expect(body).not.toHaveProperty("operation_id");
      expect(body.idempotency_key).toBeTruthy();
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
  const body = JSON.parse(await res.text());
  if (body.result?.structuredContent) expectMatchesOutputSchema(name, body.result.structuredContent);
  return body;
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

  // The api_key the compliance bundle publishes in
  // test-kits/acme-outdoor-live.yaml (sandbox: false).
  const LIVE_KIT_KEY = "demo-acme-outdoor-live-v1";

  async function callToolAs(
    env: import("../src/types/env").Env,
    bearer: string,
    name: string,
    args: Record<string, unknown>,
  ) {
    const req = new Request("https://example.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
    const res = await handleMcpRequest(req, env, logger);
    return { status: res.status, body: JSON.parse(await res.text()) };
  }

  it("the live test-kit key gets ControllerError FORBIDDEN with context echoed (comply_controller_mode_gate/deny_live_caller)", async () => {
    const env = makeMcpEnv(makeKv());
    // The storyboard step's sample_request, verbatim.
    const { status, body } = await callToolAs(env, LIVE_KIT_KEY, "comply_test_controller", {
      scenario: "force_creative_status",
      params: { creative_id: "comply-live-mode-probe-000", status: "approved" },
      account: { sandbox: true },
      context: { correlation_id: "comply_controller_mode_gate--deny_live_caller" },
    });
    expect(status).toBe(200);
    expect(body.error).toBeUndefined();
    const sc = body.result?.structuredContent;
    expect(sc.success).toBe(false);
    expect(sc.error).toBe("FORBIDDEN");
    expect(sc.context).toEqual({ correlation_id: "comply_controller_mode_gate--deny_live_caller" });
  });

  it("the live test-kit key reaches other tools (parity), and its refused arm leaves nothing armed", async () => {
    const env = makeMcpEnv(makeKv());
    await callToolAs(env, LIVE_KIT_KEY, "comply_test_controller", {
      scenario: "force_get_signals_arm",
      account: { sandbox: true },
      params: { arm: "submitted", task_id: "live_arm" },
    });
    const { status, body } = await callToolAs(env, LIVE_KIT_KEY, "get_signals", { signal_spec: "anything" });
    expect(status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.result?.structuredContent?.task_id ?? body.result?.task_id).toBeUndefined();
  });

  it("only the exact live test-kit key is recognised", async () => {
    const env = makeMcpEnv(makeKv());
    const { status } = await callToolAs(env, `${LIVE_KIT_KEY}x`, "comply_test_controller", {
      scenario: "list_scenarios",
      account: { sandbox: true },
    });
    expect(status).toBe(401);
  });

  it("sandbox controller responses echo context too", async () => {
    const env = makeMcpEnv(makeKv());
    const body = await callTool(env, "comply_test_controller", {
      scenario: "list_scenarios",
      account: { sandbox: true },
      context: { correlation_id: "ctx-echo-1" },
    });
    expect(body.result?.structuredContent.success).toBe(true);
    expect(body.result?.structuredContent.context).toEqual({ correlation_id: "ctx-echo-1" });
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

// ── AdCP 3.2 (SERVE_ADCP_3_2): seed_account and operator_unit ───────────────
//
// 3.2.4 signals storyboards declare `controller_seeding: true` with account
// fixtures only — one sandbox:true and one sandbox:false per storyboard — and
// the runner seeds them all-or-nothing before the first step. No step reads a
// seeded account back. With the flag OFF none of this exists: seed_account is
// UNKNOWN_SCENARIO exactly as before (the golden pins the bytes).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join as joinPath, resolve as resolvePath, dirname as dirnamePath } from "node:path";
import { fileURLToPath as toPath } from "node:url";
import { supportedScenarios } from "../src/domain/complianceController";
import { ADCP_TOOLS } from "../src/mcp/tools";

const FLAG_ON = { SERVE_ADCP_3_2: "true" };

/** KV fake that also records every put's key and TTL. */
function makeRecordingKv() {
  const store = new Map<string, string>();
  const puts: Array<{ key: string; ttl: number | undefined }> = [];
  const kv = {
    async get(k: string, type?: string) {
      const v = store.get(k);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(k: string, v: string, opts?: { expirationTtl?: number }) {
      puts.push({ key: k, ttl: opts?.expirationTtl });
      store.set(k, v);
    },
    async delete(k: string) { store.delete(k); },
    async list() { return { keys: [...store.keys()].map((name) => ({ name })), list_complete: true } as never; },
    async getWithMetadata() { return { value: null, metadata: null } as never; },
  } as unknown as KVNamespace;
  return { kv, store, puts };
}

// signal_owned's fixtures, verbatim from the 3.2.4 bundle
// (specialisms/signal-owned/index.yaml, fixtures.accounts).
const OWNED_SANDBOX = {
  account_id: "acct_novamotors_example_sandbox_8d34b61fe263",
  fixture: {
    brand: { domain: "novamotors.example" },
    operator: "pinnacle-agency.example",
    operator_unit: { id: "compliance-signal_owned-9e5fc43a" },
    billing: "operator",
    status: "active",
    sandbox: true,
  },
};
const OWNED_LIVE = {
  account_id: "acct_novamotors_example_live_ee0c6730d618",
  fixture: { ...OWNED_SANDBOX.fixture, sandbox: false },
};

const seed = (params: Record<string, unknown>, account: unknown = { sandbox: true }) =>
  ({ scenario: "seed_account", account, params });

describe("seed_account — flag OFF is unchanged", () => {
  it("UNKNOWN_SCENARIO with today's exact error_detail, nothing written", async () => {
    const { kv, puts } = makeRecordingKv();
    const r = await handleComplyTestController(makeEnv(kv), seed(OWNED_SANDBOX), OP_A);
    expect(r).toEqual({
      success: false,
      error: "UNKNOWN_SCENARIO",
      error_detail: "scenario not implemented: seed_account. Supported: force_get_signals_arm, force_task_completion.",
    });
    expect(puts).toEqual([]);
  });

  it("list_scenarios, capabilities scenarios and the tools/list description are unchanged", async () => {
    const env = makeMcpEnv(makeKv());
    expect((await callTool(env, "comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true } })).result.structuredContent.scenarios)
      .toEqual(["force_get_signals_arm", "force_task_completion"]);
    expect((await callTool(env, "get_adcp_capabilities", {})).result.structuredContent.compliance_testing)
      .toEqual({ scenarios: ["force_get_signals_arm", "force_task_completion"] });
    const listed = await handleMcpRequest(new Request("https://example.com/mcp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }), env, logger);
    expect((JSON.parse(await listed.text())).result.tools).toEqual(JSON.parse(JSON.stringify(ADCP_TOOLS)));
    expect(supportedScenarios(env)).toEqual([...SUPPORTED_SCENARIOS]);
  });
});

describe("seed_account — flag ON", () => {
  it("is advertised by list_scenarios, capabilities compliance_testing and the tools/list description", async () => {
    const env = { ...makeMcpEnv(makeKv()), ...FLAG_ON } as import("../src/types/env").Env;
    const expected = ["force_get_signals_arm", "force_task_completion", "seed_account"];
    expect((await callTool(env, "comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true } })).result.structuredContent.scenarios)
      .toEqual(expected);
    expect((await callTool(env, "get_adcp_capabilities", {})).result.structuredContent.compliance_testing).toEqual({ scenarios: expected });
    const listed = await handleMcpRequest(new Request("https://example.com/mcp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }), env, logger);
    const tools = (JSON.parse(await listed.text())).result.tools as Array<{ name: string; description: string; inputSchema: unknown; outputSchema: unknown }>;
    const ctl = tools.find((t) => t.name === "comply_test_controller")!;
    expect(ctl.description).toContain("seed_account");
    const before = ADCP_TOOLS.find((t) => t.name === "comply_test_controller")!;
    expect(ctl.inputSchema).toEqual(JSON.parse(JSON.stringify(before.inputSchema)));
    expect(ctl.outputSchema).toEqual(JSON.parse(JSON.stringify(before.outputSchema)));
    // Every other tool is untouched.
    expect(tools.filter((t) => t.name !== "comply_test_controller")).toEqual(
      JSON.parse(JSON.stringify(ADCP_TOOLS.filter((t) => t.name !== "comply_test_controller"))),
    );
  });

  it.each([
    ["no params", undefined],
    ["no account_id", { fixture: OWNED_SANDBOX.fixture }],
    ["empty account_id", { account_id: "", fixture: OWNED_SANDBOX.fixture }],
    ["account_id over 190 bytes", { account_id: "a".repeat(191), fixture: OWNED_SANDBOX.fixture }],
    ["non-string account_id", { account_id: 42, fixture: OWNED_SANDBOX.fixture }],
    ["array fixture", { account_id: "acct_x", fixture: [1, 2] }],
    ["string fixture", { account_id: "acct_x", fixture: "x" }],
    ["fixture over 8 KiB", { account_id: "acct_x", fixture: { pad: "x".repeat(9 * 1024) } }],
  ])("%s → INVALID_PARAMS, nothing written", async (_label, params) => {
    const { kv, puts } = makeRecordingKv();
    const args = params === undefined ? { scenario: "seed_account", account: { sandbox: true } } : seed(params);
    const r = await handleComplyTestController(makeEnv(kv, FLAG_ON), args, OP_A);
    expect(r).toMatchObject({ success: false, error: "INVALID_PARAMS" });
    expect(puts).toEqual([]);
  });

  it("a fixture nested deeper than 32 levels → INVALID_PARAMS, not an internal error, nothing written", async () => {
    const nest = (n: number): unknown => { let v: unknown = 1; for (let i = 0; i < n; i++) v = [v]; return v; };
    const { kv, puts } = makeRecordingKv();
    // The fixture object is level 1, so { a: nest(31) } is 32 levels deep.
    for (const fixture of [{ deep: nest(5000) }, { a: nest(32) }]) {
      const r = await handleComplyTestController(makeEnv(kv, FLAG_ON), seed({ account_id: "acct_deep", fixture }), OP_A);
      expect(r).toMatchObject({ success: false, error: "INVALID_PARAMS" });
    }
    expect(puts).toEqual([]);
    expect(await handleComplyTestController(makeEnv(kv, FLAG_ON), seed({ account_id: "acct_deep", fixture: { a: nest(31) } }), OP_A))
      .toMatchObject({ success: true });
  });

  it("an account_id of exactly 190 bytes, and no fixture at all, are accepted", async () => {
    const { kv } = makeRecordingKv();
    expect(await handleComplyTestController(makeEnv(kv, FLAG_ON), seed({ account_id: "a".repeat(190) }), OP_A)).toMatchObject({ success: true });
  });

  it("signal_owned's two fixtures (sandbox true and false) both seed, under the caller's namespace, for 30 minutes", async () => {
    const { kv, store, puts } = makeRecordingKv();
    const env = makeEnv(kv, FLAG_ON);
    for (const f of [OWNED_SANDBOX, OWNED_LIVE]) {
      const r = await handleComplyTestController(env, seed(f), OP_A);
      expect(r).toEqual({ success: true, message: `seeded account ${f.account_id}` });
      // SeedSuccess (3.2.4) forbids these keys.
      for (const k of ["previous_state", "scenarios", "forced", "error"]) expect(r).not.toHaveProperty(k);
    }
    expect(puts).toEqual([
      { key: `compliance:account:${OP_A}:${OWNED_SANDBOX.account_id}`, ttl: 1800 },
      { key: `compliance:account:${OP_A}:${OWNED_LIVE.account_id}`, ttl: 1800 },
    ]);
    expect(JSON.parse(store.get(`compliance:account:${OP_A}:${OWNED_LIVE.account_id}`)!)).toEqual(OWNED_LIVE.fixture);
  });

  it("over MCP: the response matches the tool outputSchema and echoes context", async () => {
    const env = { ...makeMcpEnv(makeKv()), ...FLAG_ON } as import("../src/types/env").Env;
    const body = await callTool(env, "comply_test_controller", { ...seed(OWNED_SANDBOX), context: { correlation_id: "seed-ctx" } });
    expect(body.result.structuredContent).toMatchObject({
      status: "completed", adcp_version: "3.2", success: true, context: { correlation_id: "seed-ctx" },
    });
  });

  it("re-seed: an identical fixture (any key order) succeeds without writing; a diverging one is INVALID_PARAMS naming the fields", async () => {
    const { kv, store, puts } = makeRecordingKv();
    const env = makeEnv(kv, FLAG_ON);
    await handleComplyTestController(env, seed(OWNED_SANDBOX), OP_A);
    const key = `compliance:account:${OP_A}:${OWNED_SANDBOX.account_id}`;
    const stored = store.get(key);

    const same = await handleComplyTestController(env, seed(OWNED_SANDBOX), OP_A);
    expect(same).toMatchObject({ success: true });
    expect(same).not.toHaveProperty("previous_state");
    const reordered = Object.fromEntries(Object.entries(OWNED_SANDBOX.fixture).reverse());
    expect(await handleComplyTestController(env, seed({ account_id: OWNED_SANDBOX.account_id, fixture: reordered }), OP_A))
      .toMatchObject({ success: true });
    expect(puts).toHaveLength(1);

    const diverging = await handleComplyTestController(
      env, seed({ account_id: OWNED_SANDBOX.account_id, fixture: { ...OWNED_SANDBOX.fixture, status: "suspended" } }), OP_A,
    );
    expect(diverging).toMatchObject({ success: false, error: "INVALID_PARAMS" });
    expect((diverging as { error_detail: string }).error_detail).toContain("status");
    expect(store.get(key)).toBe(stored);
    expect(puts).toHaveLength(1);
  });

  it("is scoped per principal: two callers seed the same account_id with different fixtures", async () => {
    const { kv } = makeRecordingKv();
    const env = makeEnv(kv, FLAG_ON);
    expect(await handleComplyTestController(env, seed(OWNED_SANDBOX), OP_A)).toMatchObject({ success: true });
    expect(await handleComplyTestController(env, seed({ account_id: OWNED_SANDBOX.account_id, fixture: OWNED_LIVE.fixture }), OP_B))
      .toMatchObject({ success: true });
    expect(await handleComplyTestController(env, seed(OWNED_SANDBOX), OP_A)).toMatchObject({ success: true });
  });

  it("a live principal is refused with FORBIDDEN and writes nothing; a request without account.sandbox is INVALID_PARAMS", async () => {
    const { kv, puts } = makeRecordingKv();
    const env = makeEnv(kv, FLAG_ON);
    expect(await handleComplyTestController(env, seed(OWNED_SANDBOX), OP_A, "live")).toMatchObject({ success: false, error: "FORBIDDEN" });
    expect(await handleComplyTestController(env, seed(OWNED_SANDBOX, { brand: { domain: "novamotors.example" } }), OP_A))
      .toMatchObject({ success: false, error: "INVALID_PARAMS" });
    expect(puts).toEqual([]);

    // The same through MCP with the live test-kit key.
    const mcpKv = makeRecordingKv();
    const mcpEnv = { ...makeMcpEnv(mcpKv.kv), ...FLAG_ON } as import("../src/types/env").Env;
    const live = await callToolAs(mcpEnv, "demo-acme-outdoor-live-v1", "comply_test_controller", seed(OWNED_SANDBOX));
    expect(live.result.structuredContent).toMatchObject({ success: false, error: "FORBIDDEN" });
    expect(mcpKv.puts).toEqual([]);
  });

  it("anti-gaming: seeding changes nothing get_signals returns for that account", async () => {
    const env = { ...makeMcpEnv(makeKv()), ...FLAG_ON } as import("../src/types/env").Env;
    const query = { signal_spec: "owned audiences", account: { brand: OWNED_SANDBOX.fixture.brand, operator: OWNED_SANDBOX.fixture.operator, operator_unit: OWNED_SANDBOX.fixture.operator_unit, sandbox: true } };
    const before = (await callTool(env, "get_signals", query)).result.structuredContent;
    await callTool(env, "comply_test_controller", seed(OWNED_SANDBOX));
    await callTool(env, "comply_test_controller", seed(OWNED_LIVE));
    const after = (await callTool(env, "get_signals", query)).result.structuredContent;
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it("anti-gaming: the seeded-account namespace is read and written by exactly one src file", () => {
    const root = resolvePath(dirnamePath(toPath(import.meta.url)), "../src");
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
      const p = joinPath(d, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
    });
    const users = walk(root).filter((p) => readFileSync(p, "utf8").includes("compliance:account:"));
    expect(users.map((p) => p.replace(/\\/g, "/").replace(/^.*\/src\//, "src/"))).toEqual(["src/domain/complianceController.ts"]);
  });
});

describe("operator_unit in compliance-task scoping (AdCP 3.2 account natural key)", () => {
  const UNIT_1 = { ...ACCOUNT_NOVA, operator_unit: { id: "unit-1" } };
  const UNIT_2 = { ...ACCOUNT_NOVA, operator_unit: { id: "unit-2" } };

  async function armUnder(env: import("../src/types/env").Env, taskId: string, account: unknown) {
    await callTool(env, "comply_test_controller", {
      scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: taskId },
    });
    await callTool(env, "get_signals", { signal_spec: "anything", account });
  }

  it("flag ON: a task created under unit 1 is found with unit 1 only — not with unit 2, not without a unit", async () => {
    const env = { ...makeMcpEnv(makeKv()), ...FLAG_ON } as import("../src/types/env").Env;
    await armUnder(env, "task_unit_1", UNIT_1);

    const own = await callTool(env, "get_task_status", { task_id: "task_unit_1", account: UNIT_1 });
    expect(own.result.structuredContent.task_id).toBe("task_unit_1");
    for (const other of [UNIT_2, ACCOUNT_NOVA]) {
      const r = await callTool(env, "get_task_status", { task_id: "task_unit_1", account: other });
      expect(r.result.structuredContent.adcp_error.code).toBe("REFERENCE_NOT_FOUND");
      const listed = await callTool(env, "list_tasks", { account: other, filters: { task_ids: ["task_unit_1"] } });
      expect(listed.result.structuredContent.query_summary).toEqual({ total_matching: 0, returned: 0 });
    }
    const listedOwn = await callTool(env, "list_tasks", { account: UNIT_1, filters: { task_ids: ["task_unit_1"] } });
    expect(listedOwn.result.structuredContent.query_summary).toEqual({ total_matching: 1, returned: 1 });
  });

  it("flag OFF: units are ignored, as before", async () => {
    const env = makeMcpEnv(makeKv());
    await armUnder(env, "task_unit_off", UNIT_1);
    const r = await callTool(env, "get_task_status", { task_id: "task_unit_off", account: UNIT_2 });
    expect(r.result.structuredContent.task_id).toBe("task_unit_off");
  });
});
