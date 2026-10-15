// tests/grader-api-key.test.ts
//
// GRADER_API_KEY — a PRIVATE sandbox bearer the owner hands only to AAO's
// hosted grader (src/mcp/server.ts, graderApiKey). Under AdCP 3.2 every
// signals storyboard seeds accounts through comply_test_controller
// seed_account, stored per operatorId (derived from the bearer) with a
// diverging re-seed refused. With only the public DEMO_API_KEY, anyone could
// pre-seed a diverging fixture and break the grader's seeding. The grader key
// is a sandbox principal with exactly the demo key's MCP privileges in its own
// operatorId namespace, MCP only, never live mode, and nothing at all when
// unset, empty, or equal to a public key.
//
// Every key below is an obviously fake test value except the live test-kit
// key, which is a public spec fixture (test-kits/acme-outdoor-live.yaml).

import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { handleMcpRequest } from "../src/mcp/server";
import worker from "../src/index";
import { createLogger, type Logger } from "../src/utils/logger";
import { deriveOperatorId } from "../src/utils/operatorId";
import type { Env } from "../src/types/env";

const DEMO = "fake-demo-key-grader-test";
const GRADER = "fake-grader-key-grader-test-0000";
const LIVE = "demo-acme-outdoor-live-v1";
const FLAG_ON = { SERVE_ADCP_3_2: "true" };
const logger = createLogger("grader-key-test");

function makeKv() {
  const store = new Map<string, string>();
  const kv = {
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
  return { kv, store };
}

// Unsigned MCP traffic never touches D1; get_adcp_capabilities and the
// worker entrypoint get a conformant "nothing here" fake.
function makeEmptyDb() {
  return {
    prepare(_sql: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() { return { success: true, meta: { changes: 0 } }; },
      };
    },
  } as unknown as D1Database;
}

function makeEnv(extra: Record<string, unknown> = { GRADER_API_KEY: GRADER }) {
  const { kv, store } = makeKv();
  const env = { DEMO_API_KEY: DEMO, SIGNALS_CACHE: kv, DB: makeEmptyDb(), ...extra } as unknown as Env;
  return { env, store };
}

function mcpReq(rpc: unknown, authorization?: string): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization !== undefined) headers.set("Authorization", authorization);
  return new Request("https://example.com/mcp", { method: "POST", headers, body: JSON.stringify(rpc) });
}

async function callToolAs(env: Env, bearer: string, name: string, args: Record<string, unknown>, log: Logger = logger) {
  const res = await handleMcpRequest(
    mcpReq({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, `Bearer ${bearer}`),
    env,
    log,
  );
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text), text };
}

const LIST = { scenario: "list_scenarios", account: { sandbox: true } };
const arm = (taskId: string) => ({
  scenario: "force_get_signals_arm", account: { sandbox: true }, params: { arm: "submitted", task_id: taskId },
});

// signal_owned's sandbox fixture (3.2.4 bundle), and a diverging one for the
// same account_id — the pre-seeding attack the private key exists to defeat.
const ACCOUNT_ID = "acct_novamotors_example_sandbox_8d34b61fe263";
const FIXTURE = {
  brand: { domain: "novamotors.example" },
  operator: "pinnacle-agency.example",
  operator_unit: { id: "compliance-signal_owned-9e5fc43a" },
  billing: "operator",
  status: "active",
  sandbox: true,
};
const DIVERGING = { ...FIXTURE, status: "suspended" };
const seed = (fixture: Record<string, unknown>) =>
  ({ scenario: "seed_account", account: { sandbox: true }, params: { account_id: ACCOUNT_ID, fixture } });

describe("GRADER_API_KEY — an MCP sandbox principal", () => {
  it("authenticates MCP tools/call as a sandbox caller (list_scenarios succeeds; live would be FORBIDDEN, unknown 401)", async () => {
    const { env } = makeEnv();
    const { status, body } = await callToolAs(env, GRADER, "comply_test_controller", LIST);
    expect(status).toBe(200);
    expect(body.result.structuredContent.success).toBe(true);
    expect(body.result.structuredContent.scenarios).toEqual(["force_get_signals_arm", "force_task_completion"]);
  });

  it("its operatorId derives from its own key, not the demo key's", async () => {
    const { env, store } = makeEnv();
    const graderOp = await deriveOperatorId(GRADER);
    const demoOp = await deriveOperatorId(DEMO);
    expect(graderOp).not.toBe(demoOp);

    const r = await callToolAs(env, GRADER, "comply_test_controller", arm("grader_arm"));
    expect(r.body.result.structuredContent.success).toBe(true);
    expect([...store.keys()]).toEqual([`compliance:arm:get_signals:${graderOp}`]);

    await callToolAs(env, DEMO, "comply_test_controller", arm("demo_arm"));
    expect([...store.keys()].sort()).toEqual(
      [`compliance:arm:get_signals:${graderOp}`, `compliance:arm:get_signals:${demoOp}`].sort(),
    );
  });

  it("seed_account (flag ON): a diverging fixture pre-seeded under the public demo key does not touch the grader's", async () => {
    const { env, store } = makeEnv({ GRADER_API_KEY: GRADER, ...FLAG_ON });
    const pre = await callToolAs(env, DEMO, "comply_test_controller", seed(DIVERGING));
    expect(pre.body.result.structuredContent).toMatchObject({ success: true });

    const grader = await callToolAs(env, GRADER, "comply_test_controller", seed(FIXTURE));
    expect(grader.body.result.structuredContent).toMatchObject({ success: true, message: `seeded account ${ACCOUNT_ID}` });

    expect(JSON.parse(store.get(`compliance:account:${await deriveOperatorId(GRADER)}:${ACCOUNT_ID}`)!)).toEqual(FIXTURE);
    expect(JSON.parse(store.get(`compliance:account:${await deriveOperatorId(DEMO)}:${ACCOUNT_ID}`)!)).toEqual(DIVERGING);
    // Each namespace still refuses its own diverging re-seed.
    expect((await callToolAs(env, GRADER, "comply_test_controller", seed(DIVERGING))).body.result.structuredContent)
      .toMatchObject({ success: false, error: "INVALID_PARAMS" });
  });

  it("seed_account (flag ON), vice versa: the grader's fixture does not block the demo key's diverging seed", async () => {
    const { env, store } = makeEnv({ GRADER_API_KEY: GRADER, ...FLAG_ON });
    expect((await callToolAs(env, GRADER, "comply_test_controller", seed(FIXTURE))).body.result.structuredContent)
      .toMatchObject({ success: true });
    expect((await callToolAs(env, DEMO, "comply_test_controller", seed(DIVERGING))).body.result.structuredContent)
      .toMatchObject({ success: true });
    // The grader's identical re-seed still succeeds: its fixture is intact.
    expect((await callToolAs(env, GRADER, "comply_test_controller", seed(FIXTURE))).body.result.structuredContent)
      .toMatchObject({ success: true });
    expect(store.size).toBe(2);
    expect((await callToolAs(env, DEMO, "comply_test_controller", seed(FIXTURE))).body.result.structuredContent)
      .toMatchObject({ success: false, error: "INVALID_PARAMS" });
  });

  it("comply_test_controller accepts it as sandbox while the live test-kit key is still refused (FORBIDDEN), flag ON", async () => {
    const { env, store } = makeEnv({ GRADER_API_KEY: GRADER, ...FLAG_ON });
    const live = await callToolAs(env, LIVE, "comply_test_controller", seed(FIXTURE));
    expect(live.status).toBe(200);
    expect(live.body.result.structuredContent).toMatchObject({ success: false, error: "FORBIDDEN" });
    expect(store.size).toBe(0);

    const grader = await callToolAs(env, GRADER, "comply_test_controller", seed(FIXTURE));
    expect(grader.body.result.structuredContent).toMatchObject({ success: true });
    expect(store.size).toBe(1);
  });

  it("never yields live mode: every controller scenario dispatches for it (a live principal is refused before dispatch)", async () => {
    const { env, store } = makeEnv({ GRADER_API_KEY: GRADER, ...FLAG_ON });
    for (const args of [LIST, arm("never_live"), seed(FIXTURE)]) {
      const r = await callToolAs(env, GRADER, "comply_test_controller", args);
      expect(r.body.result.structuredContent.success).toBe(true);
      expect(r.body.result.structuredContent.error).toBeUndefined();
    }
    expect(store.size).toBe(2);
  });

  it("async get_signals: the demo key re-using the storyboard's fixed task_id does not hide the grader's task", async () => {
    const { env } = makeEnv();
    const TASK = "task_async_signals_nova_ev"; // fixed literal in get_signals_async.yaml
    const ACCT = { brand: { domain: "novamotors.example" }, operator: "novamotors.example" };
    const getSignals = { signal_spec: { brief: "likely EV buyers" }, account: ACCT };
    const status = async (bearer: string) =>
      (await callToolAs(env, bearer, "get_task_status", { task_id: TASK, account: ACCT })).body;

    expect((await callToolAs(env, GRADER, "comply_test_controller", arm(TASK))).body.result.structuredContent.success).toBe(true);
    await callToolAs(env, GRADER, "get_signals", getSignals);
    expect((await status(GRADER)).result.structuredContent).toMatchObject({ status: "submitted", task_id: TASK });

    // The public-key holder arms and consumes the same task_id.
    expect((await callToolAs(env, DEMO, "comply_test_controller", arm(TASK))).body.result.structuredContent.success).toBe(true);
    await callToolAs(env, DEMO, "get_signals", getSignals);
    expect((await status(DEMO)).result.structuredContent).toMatchObject({ status: "submitted", task_id: TASK });

    expect((await status(GRADER)).result.structuredContent).toMatchObject({ status: "submitted", task_id: TASK });
    const done = await callToolAs(env, GRADER, "comply_test_controller", {
      scenario: "force_task_completion", account: { sandbox: true }, params: { task_id: TASK, result: { signals: [] } },
    });
    expect(done.body.result.structuredContent.success).toBe(true);
    expect((await status(GRADER)).result.structuredContent).toMatchObject({ status: "completed", task_id: TASK });
  });
});

describe("GRADER_API_KEY — unset, empty, or equal to a public key adds no principal", () => {
  const listAs = (env: Env, authorization: string) =>
    handleMcpRequest(mcpReq({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "comply_test_controller", arguments: LIST } }, authorization), env, logger);

  it.each([
    ["unset", {}],
    ["empty", { GRADER_API_KEY: "" }],
  ])("%s: no bearer the grader would send authenticates, and the public keys keep today's semantics", async (_label, extra) => {
    const { env } = makeEnv(extra);
    for (const authorization of [`Bearer ${GRADER}`, "Bearer ", "Bearer", "ApiKey ", "Bearer x"]) {
      expect((await listAs(env, authorization)).status).toBe(401);
    }
    expect((await callToolAs(env, DEMO, "comply_test_controller", LIST)).body.result.structuredContent.success).toBe(true);
    expect((await callToolAs(env, LIVE, "comply_test_controller", LIST)).body.result.structuredContent.error).toBe("FORBIDDEN");
    // Contrast: the only difference from a working grader key is the config.
    expect((await callToolAs(makeEnv().env, GRADER, "comply_test_controller", LIST)).status).toBe(200);
  });

  it("equal to DEMO_API_KEY: ignored and logged once per isolate (no value in the log); the demo key is unchanged", async () => {
    vi.resetModules();
    const fresh = await import("../src/mcp/server");
    const log = createLogger("grader-key-misconfig-demo");
    const warn = vi.spyOn(log, "warn");
    const { env, store } = makeEnv({ GRADER_API_KEY: DEMO });
    for (let i = 0; i < 2; i++) {
      const res = await fresh.handleMcpRequest(
        mcpReq({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "comply_test_controller", arguments: arm(`d${i}`) } }, `Bearer ${DEMO}`),
        env,
        log,
      );
      expect(JSON.parse(await res.text()).result.structuredContent.success).toBe(true);
    }
    expect([...store.keys()]).toEqual([`compliance:arm:get_signals:${await deriveOperatorId(DEMO)}`]);
    const ignored = warn.mock.calls.filter(([event]) => event === "grader_api_key_ignored");
    expect(ignored).toEqual([["grader_api_key_ignored", { reason: "equals DEMO_API_KEY" }]]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(DEMO);
  });

  it("equal to the live test-kit key: ignored and logged once; the live key stays live (FORBIDDEN), never sandbox", async () => {
    vi.resetModules();
    const fresh = await import("../src/mcp/server");
    const log = createLogger("grader-key-misconfig-live");
    const warn = vi.spyOn(log, "warn");
    const { env, store } = makeEnv({ GRADER_API_KEY: LIVE, ...FLAG_ON });
    for (const args of [LIST, seed(FIXTURE)]) {
      const res = await fresh.handleMcpRequest(
        mcpReq({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "comply_test_controller", arguments: args } }, `Bearer ${LIVE}`),
        env,
        log,
      );
      expect(JSON.parse(await res.text()).result.structuredContent).toMatchObject({ success: false, error: "FORBIDDEN" });
    }
    expect(store.size).toBe(0);
    const ignored = warn.mock.calls.filter(([event]) => event === "grader_api_key_ignored");
    expect(ignored).toEqual([["grader_api_key_ignored", { reason: "equals the live test-kit key" }]]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(LIVE);
  });
});

describe("GRADER_API_KEY — MCP only: every DEMO_API_KEY-gated route refuses it", () => {
  const ctx = {
    waitUntil(p: Promise<unknown>) { void p.catch(() => {}); },
    passThroughOnException() {},
  } as unknown as ExecutionContext;

  const GATED: Array<[string, string]> = [
    ["GET", "/signals/search?q=auto"],
    ["POST", "/signals/search"],
    ["POST", "/signals/query"],
    ["POST", "/signals/activate"],
    ["POST", "/signals/activate/linkedin"],
    ["POST", "/signals/generate"],
    ["GET", "/operations"],
    ["GET", "/snapshots"],
    ["GET", "/ucp/projector"],
    ["POST", "/ucp/concepts/seed"], // public prefix; conceptHandler's own gate
    ["POST", "/admin/reseed"],
    ["POST", "/admin/purge"],
    ["POST", "/admin/sync-synaptic"],
    ["GET", "/auth/linkedin/init"],
    ["GET", "/auth/linkedin/status"],
  ];

  it("the same env authenticates the grader key on /mcp through the worker, and 401s it on every gated REST, ucp, admin and auth route", async () => {
    const { env } = makeEnv();
    const viaWorker = await worker.fetch(
      mcpReq({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "comply_test_controller", arguments: LIST } }, `Bearer ${GRADER}`),
      env,
      ctx,
    );
    expect(viaWorker.status).toBe(200);
    expect(JSON.parse(await viaWorker.text()).result.structuredContent.success).toBe(true);

    for (const [method, path] of GATED) {
      const res = await worker.fetch(
        new Request(`https://example.com${path}`, {
          method,
          headers: { Authorization: `Bearer ${GRADER}`, "Content-Type": "application/json" },
          ...(method === "POST" ? { body: "{}" } : {}),
        }),
        env,
        ctx,
      );
      expect({ method, path, status: res.status }).toEqual({ method, path, status: 401 });
    }
  });

  it("is never served to a client: discovery, capabilities and the demo pages don't carry it", async () => {
    const { env } = makeEnv();
    expect((await callToolAs(env, GRADER, "comply_test_controller", LIST)).status).toBe(200);
    const bodies: string[] = [];
    for (const rpc of [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_adcp_capabilities", arguments: {} } },
    ]) {
      bodies.push(await (await handleMcpRequest(mcpReq(rpc, `Bearer ${GRADER}`), env, logger)).text());
    }
    for (const path of ["/", "/race-canvas", "/vendor-health", "/ecosystem"]) {
      const res = await worker.fetch(new Request(`https://example.com${path}`), env, ctx);
      expect(res.status).toBe(200);
      bodies.push(await res.text());
    }
    for (const b of bodies) {
      expect(b).not.toContain(GRADER);
      expect(b).not.toContain("GRADER_API_KEY");
    }
  });
});

// Last-seen marker: neither the AAO registry (it shows only auth_type bearer)
// nor the agent's logs show which bearer the hosted grader actually sends, so
// a request authenticated by GRADER_API_KEY records when it was seen, its
// JSON-RPC method and, for tools/call, the tool. Written through
// ctx.waitUntil, at most once a minute per isolate, never on any other path.
describe("GRADER_API_KEY — last-seen marker in SIGNALS_CACHE", () => {
  const LAST_SEEN = "auth:grader:last_seen";
  const THIRTY_DAYS = 30 * 24 * 60 * 60;

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fresh server module, so each test starts with its per-isolate throttle unset. */
  async function freshServer() {
    vi.resetModules();
    return (await import("../src/mcp/server")).handleMcpRequest;
  }

  function makeCtx() {
    const pending: Array<Promise<unknown>> = [];
    const ctx = {
      waitUntil(p: Promise<unknown>) { pending.push(p); },
      passThroughOnException() {},
    } as unknown as ExecutionContext;
    return { ctx, pending, settle: () => Promise.all(pending) };
  }

  const markerPuts = (put: { mock: { calls: unknown[][] } }) => put.mock.calls.filter(([k]) => k === LAST_SEEN);
  const listRpc = (id: number) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "comply_test_controller", arguments: LIST } });
  const initialize = { jsonrpc: "2.0", id: 3, method: "initialize", params: { protocolVersion: "2024-11-05" } };

  it.each([
    ["flag OFF", {}],
    ["flag ON", FLAG_ON],
  ])("%s: a grader-key tools/call records {at, method, tool} with a 30-day TTL, and no key, hash, operatorId, args or IP", async (_label, flag) => {
    const handle = await freshServer();
    const { env, store } = makeEnv({ GRADER_API_KEY: GRADER, ...flag });
    const put = vi.spyOn(env.SIGNALS_CACHE, "put");
    const { ctx, settle } = makeCtx();
    const IP = "203.0.113.77";
    const req = mcpReq(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "comply_test_controller", arguments: arm("marker_args_probe") } },
      `Bearer ${GRADER}`,
    );
    req.headers.set("CF-Connecting-IP", IP);
    req.headers.set("X-Forwarded-For", IP);

    const before = Date.now();
    const res = await handle(req, env, logger, ctx);
    expect(JSON.parse(await res.text()).result.structuredContent.success).toBe(true);
    await settle();
    const after = Date.now();

    const calls = markerPuts(put);
    expect(calls).toHaveLength(1);
    expect(calls[0]![2]).toEqual({ expirationTtl: THIRTY_DAYS });
    const raw = store.get(LAST_SEEN)!;
    const marker = JSON.parse(raw);
    expect(Object.keys(marker).sort()).toEqual(["at", "method", "tool"]);
    expect(marker).toEqual({ at: new Date(Date.parse(marker.at)).toISOString(), method: "tools/call", tool: "comply_test_controller" });
    expect(Date.parse(marker.at)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(marker.at)).toBeLessThanOrEqual(after);

    const digest = createHash("sha256").update(GRADER, "utf8").digest();
    for (const secret of [
      GRADER,
      digest.toString("hex"),
      digest.toString("base64"),
      digest.toString("base64url"),
      await deriveOperatorId(GRADER),
      "marker_args_probe",
      "force_get_signals_arm",
      IP,
    ]) {
      expect(raw).not.toContain(secret);
    }
  });

  it("demo, live test-kit, unauthenticated and wrong bearers never write it; a grader request afterwards does", async () => {
    const handle = await freshServer();
    const { env, store } = makeEnv();
    const put = vi.spyOn(env.SIGNALS_CACHE, "put");
    const { ctx, settle } = makeCtx();
    const capabilities = { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_adcp_capabilities", arguments: {} } };

    const statuses: number[] = [];
    for (const [rpc, authorization] of [
      [listRpc(1), `Bearer ${DEMO}`],
      [initialize, `Bearer ${DEMO}`],
      [listRpc(1), `Bearer ${LIVE}`],
      [initialize, `Bearer ${LIVE}`],
      [listRpc(1), undefined],
      [capabilities, undefined],
      [initialize, undefined],
      [listRpc(1), "Bearer wrong-key"],
      [listRpc(1), `Bearer ${GRADER}x`],
      [[listRpc(1), initialize], `Bearer ${DEMO}`],
    ] as Array<[unknown, string | undefined]>) {
      statuses.push((await handle(mcpReq(rpc, authorization), env, logger, ctx)).status);
    }
    await settle();
    expect(statuses).toEqual([200, 200, 200, 200, 401, 200, 200, 401, 401, 200]);
    expect(markerPuts(put)).toEqual([]);
    expect(store.has(LAST_SEEN)).toBe(false);

    // Contrast: the same isolate writes it for the grader key.
    await handle(mcpReq(listRpc(1), `Bearer ${GRADER}`), env, logger, ctx);
    await settle();
    expect(markerPuts(put)).toHaveLength(1);
    expect(JSON.parse(store.get(LAST_SEEN)!)).toMatchObject({ method: "tools/call", tool: "comply_test_controller" });
  });

  // A misconfigured GRADER_API_KEY is no principal (graderApiKey returns
  // null), so the bearer it equals must not write the marker either.
  it.each([
    ["equal to DEMO_API_KEY", DEMO],
    ["equal to the live test-kit key", LIVE],
  ])("GRADER_API_KEY %s: that bearer never writes it (tools/call, initialize, batch); a configured grader key afterwards does", async (_label, key) => {
    const handle = await freshServer();
    const { env, store } = makeEnv({ GRADER_API_KEY: key });
    const put = vi.spyOn(env.SIGNALS_CACHE, "put");
    const { ctx, settle } = makeCtx();

    for (const rpc of [listRpc(1), initialize, [listRpc(2), initialize]]) {
      expect((await handle(mcpReq(rpc, `Bearer ${key}`), env, logger, ctx)).status).toBe(200);
    }
    await settle();
    expect(markerPuts(put)).toEqual([]);
    expect(store.has(LAST_SEEN)).toBe(false);

    // Contrast: the same isolate's throttle is untouched, so a correctly
    // configured grader key still writes it.
    const ok = makeEnv();
    await handle(mcpReq(listRpc(1), `Bearer ${GRADER}`), ok.env, logger, ctx);
    await settle();
    expect(JSON.parse(ok.store.get(LAST_SEEN)!)).toMatchObject({ method: "tools/call", tool: "comply_test_controller" });
  });

  it("throttle: two grader requests within 60 s write once; the first one after 60 s writes again (a discovery method has no tool)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const T0 = Date.parse("2026-10-15T12:00:00.000Z");
    const handle = await freshServer();
    const { env, store } = makeEnv();
    const put = vi.spyOn(env.SIGNALS_CACHE, "put");
    const { ctx, settle } = makeCtx();

    vi.setSystemTime(T0);
    await handle(mcpReq(listRpc(1), `Bearer ${GRADER}`), env, logger, ctx);
    vi.setSystemTime(T0 + 59_999);
    await handle(mcpReq(initialize, `Bearer ${GRADER}`), env, logger, ctx);
    await settle();
    expect(markerPuts(put)).toHaveLength(1);
    expect(JSON.parse(store.get(LAST_SEEN)!)).toEqual({ at: "2026-10-15T12:00:00.000Z", method: "tools/call", tool: "comply_test_controller" });

    vi.setSystemTime(T0 + 60_000);
    await handle(mcpReq(initialize, `Bearer ${GRADER}`), env, logger, ctx);
    await settle();
    expect(markerPuts(put)).toHaveLength(2);
    expect(JSON.parse(store.get(LAST_SEEN)!)).toEqual({ at: "2026-10-15T12:01:00.000Z", method: "initialize" });
  });

  it("a batch records method \"batch\", a non-JSON-RPC body \"invalid\", and caller-supplied names are capped at 64 chars", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const T0 = Date.parse("2026-10-15T12:00:00.000Z");
    const handle = await freshServer();
    const { env, store } = makeEnv();
    const { ctx, settle } = makeCtx();
    const marker = async (at: number, rpc: unknown) => {
      vi.setSystemTime(at);
      await handle(mcpReq(rpc, `Bearer ${GRADER}`), env, logger, ctx);
      await settle();
      return JSON.parse(store.get(LAST_SEEN)!);
    };

    expect(await marker(T0, [listRpc(1), initialize])).toEqual({ at: "2026-10-15T12:00:00.000Z", method: "batch" });
    expect(await marker(T0 + 60_000, { hello: "world" })).toEqual({ at: "2026-10-15T12:01:00.000Z", method: "invalid" });
    const long = "x".repeat(500);
    expect(await marker(T0 + 120_000, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: long, arguments: {} } }))
      .toEqual({ at: "2026-10-15T12:02:00.000Z", method: "tools/call", tool: "x".repeat(64) });
    expect(await marker(T0 + 180_000, { jsonrpc: "2.0", id: 1, method: long }))
      .toEqual({ at: "2026-10-15T12:03:00.000Z", method: "x".repeat(64) });
  });

  it.each([
    ["throws synchronously", () => { throw new Error("kv boom secret-detail"); }],
    ["rejects", () => Promise.reject(new Error("kv boom secret-detail"))],
  ])("a KV put that %s leaves the response unchanged and is logged with no details", async (_label, failingPut) => {
    const respond = async (kvPut?: () => unknown) => {
      const handle = await freshServer();
      const { env } = makeEnv();
      const put = kvPut
        ? vi.spyOn(env.SIGNALS_CACHE, "put").mockImplementation(kvPut as never)
        : vi.spyOn(env.SIGNALS_CACHE, "put");
      const log = createLogger("grader-last-seen-kv-failure");
      const warn = vi.spyOn(log, "warn");
      const debug = vi.spyOn(log, "debug");
      const { ctx, settle } = makeCtx();
      const res = await handle(mcpReq(listRpc(7), `Bearer ${GRADER}`), env, log, ctx);
      const out = { status: res.status, headers: [...res.headers], text: await res.text() };
      await expect(settle()).resolves.toBeDefined();
      return { out, put, warn, debug };
    };

    const ok = await respond();
    const failed = await respond(failingPut);
    expect(markerPuts(failed.put)).toHaveLength(1); // the failure path really ran
    expect(failed.out).toEqual(ok.out);
    expect(JSON.parse(failed.out.text).result.structuredContent.success).toBe(true);
    const logged = [...failed.warn.mock.calls, ...failed.debug.mock.calls].filter(([event]) => event === "grader_last_seen_write_failed");
    expect(logged).toEqual([["grader_last_seen_write_failed"]]);
    expect(JSON.stringify([failed.warn.mock.calls, failed.debug.mock.calls])).not.toMatch(/kv boom|secret-detail/);
    expect(ok.warn.mock.calls.filter(([event]) => event === "grader_last_seen_write_failed")).toEqual([]);
  });

  it("the write goes through ctx.waitUntil: the response is returned while the put is still pending; without a ctx nothing is written", async () => {
    const handle = await freshServer();
    const { env, store } = makeEnv();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const put = vi.spyOn(env.SIGNALS_CACHE, "put").mockImplementation((async (k: string, v: string) => {
      if (k === LAST_SEEN) await gate;
      store.set(k, v);
    }) as never);
    const { ctx, pending } = makeCtx();

    const res = await Promise.race([
      handle(mcpReq(listRpc(1), `Bearer ${GRADER}`), env, logger, ctx),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 2_000)),
    ]);
    expect(res).not.toBe("timeout");
    expect(JSON.parse(await (res as Response).text()).result.structuredContent.success).toBe(true);
    expect(markerPuts(put)).toHaveLength(1);
    expect(store.has(LAST_SEEN)).toBe(false);

    let settled = false;
    const all = Promise.all(pending).then(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false); // waitUntil holds the pending put
    release();
    await all;
    expect(JSON.parse(store.get(LAST_SEEN)!)).toMatchObject({ method: "tools/call", tool: "comply_test_controller" });

    // No ExecutionContext, so no way to defer the write: nothing is written.
    const handle2 = await freshServer();
    const fresh = makeEnv();
    const put2 = vi.spyOn(fresh.env.SIGNALS_CACHE, "put");
    expect((await handle2(mcpReq(listRpc(1), `Bearer ${GRADER}`), fresh.env, logger)).status).toBe(200);
    expect(markerPuts(put2)).toEqual([]);
  });
});
