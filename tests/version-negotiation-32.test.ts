// tests/version-negotiation-32.test.ts
//
// AdCP 3.2 version negotiation behind SERVE_ADCP_3_2 (src/constants/specVersion.ts).
// With the flag ON the agent advertises ["3.0","3.1","3.2"] and resolves
// every pin per versioning.mdx (adcp main, "Version negotiation"):
//   - exact release → that release; a later release in major 3 → the
//     highest supported release ≤ the pin (downshift), so "3.3" → "3.2";
//   - prerelease pins match exactly, and none is advertised → VERSION_UNSUPPORTED;
//   - patch precision or any other malformed wire value → VERSION_UNSUPPORTED;
//   - another major, or adcp_major_version disagreeing with adcp_version →
//     VERSION_UNSUPPORTED;
//   - omitted (or major only) → the default / highest release, "3.2".
// get_adcp_capabilities is never refused (the recovery carve-out). The echo is
// the release actually served, on the wire and in the recorded trace. With the
// flag OFF nothing here changes: tests/version-unsupported.test.ts and the
// golden (tests/flag-off-golden.test.ts) pin that.

import { describe, it, expect, vi } from "vitest";

vi.mock("../src/domain/signalService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/domain/signalService")>();
  return {
    ...actual,
    getWholesaleFeedVersion: async () => "wf_v32_token",
    searchSignalsService: async () => ({ signals: [], totalCount: 0, hasMore: false }),
  };
});

import { handleMcpRequest } from "../src/mcp/server";
import worker from "../src/index";
import { createLogger } from "../src/utils/logger";
import { COMPLIANCE_STATE } from "../src/constants/complianceState";
import { SPEC_VERSION } from "../src/constants/specVersion";
import type { Env } from "../src/types/env";

const KEY = "demo-key-v32-test";
const logger = createLogger("v32-test");

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

function makeEmptyDb(): D1Database {
  return {
    prepare() {
      return {
        bind() { return this; },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() { return { success: true, meta: {} }; },
      };
    },
    async batch() { return []; },
  } as unknown as D1Database;
}

function makeEnv(on: boolean) {
  const kv = makeKv();
  const env = {
    ENVIRONMENT: "test",
    API_VERSION: "3.1",
    DEMO_API_KEY: KEY,
    LINKEDIN_CLIENT_ID: "c",
    LINKEDIN_CLIENT_SECRET: "s",
    LINKEDIN_REDIRECT_URI: "https://example.com/cb",
    LINKEDIN_AD_ACCOUNT_ID: "1",
    SIGNALS_CACHE: kv.kv,
    DB: makeEmptyDb(),
    ...(on ? { SERVE_ADCP_3_2: "true" } : {}),
  } as unknown as Env;
  return { env, kv: kv.store };
}

type Sc = {
  status?: string;
  adcp_version?: string;
  adcp_error?: {
    code?: string; message?: string; recovery?: string; supported_major_versions?: number[];
    details?: { supported_versions?: string[]; supported_majors?: number[] };
  };
  adcp?: { supported_versions?: string[] };
  [k: string]: unknown;
};

async function rpc(env: Env, body: unknown): Promise<any> {
  const res = await handleMcpRequest(new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  }), env, logger);
  return JSON.parse(await res.text());
}

async function tool(env: Env, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; sc: Sc }> {
  const body = await rpc(env, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  return { isError: body.result?.isError === true, sc: body.result?.structuredContent ?? {} };
}

const SUPPORTED_ON = ["3.0", "3.1", "3.2"];
const REFUSED = "VERSION_UNSUPPORTED";

// [label, pin args, served release or REFUSED]
const TABLE: Array<[string, Record<string, unknown>, string]> = [
  ["omitted", {}, "3.2"],
  ["empty adcp_version", { adcp_version: "" }, "3.2"],
  ["adcp_major_version 3", { adcp_major_version: 3 }, "3.2"],
  ["adcp_major_version '3'", { adcp_major_version: "3" }, "3.2"],
  ["adcp_major_version 99", { adcp_major_version: 99 }, REFUSED],
  ["adcp_major_version 3.5", { adcp_major_version: 3.5 }, REFUSED],
  ["exact 3.0", { adcp_version: "3.0" }, "3.0"],
  ["exact 3.1", { adcp_version: "3.1" }, "3.1"],
  ["exact 3.2", { adcp_version: "3.2" }, "3.2"],
  ["later release 3.3 (downshift)", { adcp_version: "3.3" }, "3.2"],
  ["later release 3.10 (downshift, numeric minor)", { adcp_version: "3.10" }, "3.2"],
  ["prerelease on 3.1", { adcp_version: "3.1-beta.5" }, REFUSED],
  ["prerelease 3.2-rc.0", { adcp_version: "3.2-rc.0" }, REFUSED],
  ["prerelease 3.3-beta.1", { adcp_version: "3.3-beta.1" }, REFUSED],
  ["patch precision 3.1.20", { adcp_version: "3.1.20" }, REFUSED],
  ["malformed v3.1", { adcp_version: "v3.1" }, REFUSED],
  ["major only '3'", { adcp_version: "3" }, REFUSED],
  ["leading zero 3.01", { adcp_version: "3.01" }, REFUSED],
  ["non-string 3.1", { adcp_version: 3.1 }, REFUSED],
  ["other major 4.0", { adcp_version: "4.0" }, REFUSED],
  ["other major 2.1", { adcp_version: "2.1" }, REFUSED],
  ["major 3 with 3.0 (agree)", { adcp_major_version: 3, adcp_version: "3.0" }, "3.0"],
  ["major 3 with 4.0 (disagree)", { adcp_major_version: 3, adcp_version: "4.0" }, REFUSED],
  ["major 4 with 3.1 (disagree)", { adcp_major_version: 4, adcp_version: "3.1" }, REFUSED],
];

describe("flag ON: get_signals resolves every pin class", () => {
  it.each(TABLE)("%s → %s", async (_label, pin, expected) => {
    const { env } = makeEnv(true);
    const { isError, sc } = await tool(env, "get_signals", { signal_spec: "anything", ...pin });
    if (expected === REFUSED) {
      expect(isError).toBe(true);
      expect(sc.adcp_error?.code).toBe(REFUSED);
      expect(sc.adcp_error?.recovery).toBe("correctable");
      expect(sc.adcp_error?.supported_major_versions).toEqual([3]);
      expect(sc.adcp_error?.details?.supported_versions).toEqual(SUPPORTED_ON);
      expect(sc.adcp_error?.details?.supported_majors).toEqual([3]);
      expect(sc.adcp_error?.message).toContain("3.0, 3.1, 3.2");
      // Nothing was served, so the echo is the default release.
      expect(sc.adcp_version).toBe("3.2");
    } else {
      expect(isError).toBe(false);
      expect(sc.status).toBe("completed");
      expect(sc.adcp_version).toBe(expected);
    }
  });

  it("a non-string adcp_version is refused as a type error, not as a malformed version string", async () => {
    const { env } = makeEnv(true);
    for (const [pin, kind] of [[3.1, "a number"], [["3.1"], "an array"]] as const) {
      const { sc } = await tool(env, "get_signals", { signal_spec: "anything", adcp_version: pin });
      expect(sc.adcp_error?.message).toContain(`adcp_version must be a string "MAJOR.MINOR", not ${kind}.`);
    }
  });

  it("the same resolution applies to every tool, not only get_signals (activate_signal, controller)", async () => {
    const { env } = makeEnv(true);
    const act = await tool(env, "activate_signal", { signal_agent_segment_id: "s", adcp_version: "3.1-beta.5" });
    expect(act.sc.adcp_error?.code).toBe(REFUSED);
    const ctl = await tool(env, "comply_test_controller", { scenario: "list_scenarios", account: { sandbox: true }, adcp_version: "3.0" });
    expect(ctl.sc.adcp_version).toBe("3.0");
  });

  it("an error raised after resolution echoes the resolved release; an unknown tool echoes the default", async () => {
    const { env } = makeEnv(true);
    const noTaskId = await tool(env, "get_task_status", { adcp_version: "3.0" });
    expect(noTaskId.sc.adcp_error?.code).toBe("INVALID_REQUEST");
    expect(noTaskId.sc.adcp_version).toBe("3.0");
    const unknown = await tool(env, "no_such_tool", { adcp_version: "3.0" });
    expect(unknown.sc.adcp_error?.code).toBe("UNSUPPORTED_FEATURE");
    expect(unknown.sc.adcp_version).toBe("3.2");
  });

  it("a batch resolves each message on its own pin", async () => {
    const { env } = makeEnv(true);
    const body = await rpc(env, [
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_signals", arguments: { signal_spec: "a", adcp_version: "3.0" } } },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_signals", arguments: { signal_spec: "a", adcp_version: "3.1" } } },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_signals", arguments: { signal_spec: "a" } } },
    ]);
    const byId = Object.fromEntries((body as any[]).map((m) => [m.id, m.result.structuredContent.adcp_version]));
    expect(byId).toEqual({ 1: "3.0", 2: "3.1", 3: "3.2" });
  });

  it("the echo is also what the recorded get_signals trace says (wire and trace agree)", async () => {
    const { env, kv } = makeEnv(true);
    await tool(env, "get_signals", { signal_spec: "anything", adcp_version: "3.0" });
    const traces = [...kv.entries()]
      .filter(([k]) => k.startsWith("sigtrace:st_"))
      .map(([, v]) => JSON.parse(v) as { response: { payload: { adcp_version?: string } } });
    expect(traces).toHaveLength(1);
    expect(traces[0]!.response.payload.adcp_version).toBe("3.0");
  });
});

describe("flag ON: get_adcp_capabilities is never refused", () => {
  it.each(TABLE)("%s → served", async (_label, pin, expected) => {
    const { env } = makeEnv(true);
    const { isError, sc } = await tool(env, "get_adcp_capabilities", { ...pin });
    expect(isError).toBe(false);
    expect(sc.adcp?.supported_versions).toEqual(SUPPORTED_ON);
    expect(sc.adcp_version).toBe(expected === REFUSED ? "3.2" : expected);
  });
});

describe("the refusal's supported_versions is what capabilities advertises, in both flag states", () => {
  it.each([[false, ["3.0", "3.1"]], [true, SUPPORTED_ON]] as const)("SERVE_ADCP_3_2 %s", async (on, list) => {
    const { env } = makeEnv(on);
    const caps = await tool(env, "get_adcp_capabilities", {});
    const refused = await tool(env, "get_signals", { signal_spec: "anything", adcp_version: "4.0" });
    expect(caps.sc.adcp?.supported_versions).toEqual(list);
    expect(refused.sc.adcp_error?.details?.supported_versions).toEqual(list);
  });
});

describe("flag ON: self-description reports 3.2", () => {
  const ctx = { waitUntil(p: Promise<unknown>) { void p.catch(() => {}); }, passThroughOnException() {} } as unknown as ExecutionContext;

  it("initialize serverInfo.version", async () => {
    const on = await rpc(makeEnv(true).env, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } });
    const off = await rpc(makeEnv(false).env, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } });
    expect(on.result.serverInfo.version).toBe("3.2");
    expect(off.result.serverInfo.version).toBe("3.1");
  });

  it("/health version and adcp_version; the vendored corpus pin stays 3.1.x", async () => {
    const res = await worker.fetch(new Request("https://adcp.signal-stack.io/health"), makeEnv(true).env, ctx);
    const body = (await res.json()) as Record<string, string>;
    expect(body["version"]).toBe("3.2");
    expect(body["adcp_version"]).toBe("3.2");
    expect(body["adcp_spec_version"]).toMatch(/^3\.1\./);
    expect(res.headers.get("X-AdCP-Version")).toBe("3.2");
  });

  it("REST X-AdCP-Version, on a success and on an auth error", async () => {
    const { env } = makeEnv(true);
    const ok = await worker.fetch(new Request("https://adcp.signal-stack.io/capabilities", { headers: { Authorization: `Bearer ${KEY}` } }), env, ctx);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("X-AdCP-Version")).toBe("3.2");
    expect(((await ok.json()) as Sc).adcp?.supported_versions).toEqual(SUPPORTED_ON);
    const denied = await worker.fetch(new Request("https://adcp.signal-stack.io/signals/search"), env, ctx);
    expect(denied.status).toBe(401);
    expect(denied.headers.get("X-AdCP-Version")).toBe("3.2");
  });

  it("MCP responses still carry no X-AdCP-Version header", async () => {
    const res = await worker.fetch(new Request("https://adcp.signal-stack.io/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }), makeEnv(true).env, ctx);
    expect(res.headers.get("X-AdCP-Version")).toBeNull();
  });
});

// The surfaces #345 left labelled 3.1 with the flag ON. A label that names the
// release served follows defaultServedVersion; the corpus pin and the recorded
// compliance run do not change with the flag, so they keep saying 3.1 (the
// /health corpus pin is pinned in the describe above).
describe("flag ON: the labels #345 left at 3.1", () => {
  const ctx = { waitUntil(p: Promise<unknown>) { void p.catch(() => {}); }, passThroughOnException() {} } as unknown as ExecutionContext;
  const get = async (on: boolean, path: string): Promise<any> => {
    const res = await worker.fetch(new Request(`https://adcp.signal-stack.io${path}`), makeEnv(on).env, ctx);
    expect(res.status).toBe(200);
    const { _trace, ...body } = (await res.json()) as Record<string, unknown>;
    void _trace; // per-request timings
    return body;
  };
  const caps = async (on: boolean): Promise<any> => (await tool(makeEnv(on).env, "get_adcp_capabilities", {})).sc;
  const selfProtocols = (tag: string) => [tag, "ucp_0.2", "dts_1.2", "mcp_streamable_http"];

  it("ext.governance.audience_bias_governance_schema.version names the release served", async () => {
    expect((await caps(false)).ext.governance.audience_bias_governance_schema.version).toBe("adcp_3.1");
    expect((await caps(true)).ext.governance.audience_bias_governance_schema.version).toBe("adcp_3.2");
  });

  it.each([
    ["/agents/registry", "agents", "id"],
    ["/agents/directory", "agents", "id"],
    ["/vendor-health/snapshot?probe=false", "rows", "agent_id"],
  ] as const)("%s: the self entry's protocols name the release served; peers are unchanged", async (path, list, id) => {
    const off = (await get(false, path))[list] as Array<Record<string, unknown>>;
    const on = (await get(true, path))[list] as Array<Record<string, unknown>>;
    // vendor-health rows carry the time of the call
    const peers = (rows: Array<Record<string, unknown>>) =>
      rows.filter((a) => a[id] !== "evgeny_signals").map((a) => ({ ...a, snapshot_ts: undefined }));
    expect(off.find((a) => a[id] === "evgeny_signals")?.["protocols"]).toEqual(selfProtocols("adcp_3.1"));
    expect(on.find((a) => a[id] === "evgeny_signals")?.["protocols"]).toEqual(selfProtocols("adcp_3.2"));
    expect(peers(on)).toEqual(peers(off));
  });

  it("ext.compliance still describes the recorded run: its line, not the release served", async () => {
    const recorded = (await caps(true)).ext.compliance;
    expect(recorded).toEqual((await caps(false)).ext.compliance);
    expect(recorded.compliance_line).toBe(COMPLIANCE_STATE.compliance_line);
    expect(recorded.spec_version).toBe(`adcp_${COMPLIANCE_STATE.compliance_line.split(".").slice(0, 2).join(".")}`);
  });

  it("/openapi.json is the same document in both states; info.version is the corpus patch", async () => {
    const on = await get(true, "/openapi.json");
    expect(on).toEqual(await get(false, "/openapi.json"));
    expect(on.info.version).toBe(SPEC_VERSION);
  });
});

describe("capabilities cache key", () => {
  it("ON uses its own key; the OFF key is unchanged (ON = OFF + _adcp32)", async () => {
    const off = makeEnv(false);
    const on = makeEnv(true);
    await tool(off.env, "get_adcp_capabilities", {});
    await tool(on.env, "get_adcp_capabilities", {});
    const offKeys = [...off.kv.keys()].filter((k) => k.startsWith("adcp_capabilities_"));
    const onKeys = [...on.kv.keys()].filter((k) => k.startsWith("adcp_capabilities_"));
    expect(offKeys).toHaveLength(1);
    expect(offKeys[0]).toMatch(/_ws-off$/);
    expect(onKeys).toEqual([`${offKeys[0]}_adcp32`]);
  });

  it("a blob cached by one flag state is never served to the other", async () => {
    const shared = makeKv();
    const off = { ...makeEnv(false).env, SIGNALS_CACHE: shared.kv } as Env;
    const on = { ...makeEnv(true).env, SIGNALS_CACHE: shared.kv } as Env;
    expect((await tool(off, "get_adcp_capabilities", {})).sc.adcp?.supported_versions).toEqual(["3.0", "3.1"]);
    expect((await tool(on, "get_adcp_capabilities", {})).sc.adcp?.supported_versions).toEqual(SUPPORTED_ON);
    expect((await tool(off, "get_adcp_capabilities", {})).sc.adcp?.supported_versions).toEqual(["3.0", "3.1"]);
  });
});

describe("the flag is ON only for the exact string \"true\"", () => {
  it.each(["false", "TRUE", "1", "yes", ""])("SERVE_ADCP_3_2=%j behaves as OFF", async (value) => {
    const env = { ...makeEnv(false).env, SERVE_ADCP_3_2: value } as Env;
    const { sc } = await tool(env, "get_adcp_capabilities", {});
    expect(sc.adcp?.supported_versions).toEqual(["3.0", "3.1"]);
    expect(sc.adcp_version).toBe("3.1");
  });
});
