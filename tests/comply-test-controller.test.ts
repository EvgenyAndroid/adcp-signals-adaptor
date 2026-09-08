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

// ── MCP-level wiring ──────────────────────────────────────────────────────────
// handleMcpRequest end-to-end: tool dispatch for comply_test_controller/
// list_tasks, plus the two interception hooks spliced into get_signals and
// get_operation_status.

import { handleMcpRequest } from "../src/mcp/server";
import { createLogger } from "../src/utils/logger";

const KEY = "demo-key-comply-test";
const logger = createLogger("comply-test-req");

function makeMcpEnv(kv: KVNamespace) {
  return { DEMO_API_KEY: KEY, SIGNALS_CACHE: kv } as unknown as import("../src/types/env").Env;
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
