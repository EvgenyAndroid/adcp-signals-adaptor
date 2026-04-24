// tests/genericMcpClient.test.ts
// Unit tests for the generic MCP Streamable-HTTP client (Sec-48 Part 1).
//
// The transport is stubbed via global fetch. We cover:
//   - SSE last-data-line parsing
//   - Plain-JSON response parsing (some servers return JSON for tools/list)
//   - probeAgent: session init + initialized notification + tools/list
//   - Protocol-version fallback: 2025-03-26 rejected → retry 2024-11-05
//   - callTool: happy path, session retry on stale-session errors
//
// We avoid relying on module-level state by clearing the session cache
// between tests.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseMcpResponse,
  probeAgent,
  callTool,
  __clearSessionCacheForTests,
} from "../src/federation/genericMcpClient";

function sseBody(obj: unknown): string {
  return `event: message\ndata: ${JSON.stringify(obj)}\n\n`;
}

function sseResponse(obj: unknown, headers: Record<string, string> = {}): Response {
  return new Response(sseBody(obj), {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      ...headers,
    },
  });
}

function jsonResponse(obj: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

describe("parseMcpResponse", () => {
  it("parses the last data: line from an SSE body", () => {
    const body = sseBody({ jsonrpc: "2.0", id: 1, result: { tools: [] } });
    const parsed = parseMcpResponse(body) as { result?: { tools: unknown[] } };
    expect(parsed?.result?.tools).toEqual([]);
  });

  it("parses plain JSON when content isn't SSE", () => {
    const parsed = parseMcpResponse('{"jsonrpc":"2.0","id":5,"result":{"ok":true}}') as {
      result?: { ok: boolean };
    };
    expect(parsed?.result?.ok).toBe(true);
  });

  it("returns null on empty or malformed input", () => {
    expect(parseMcpResponse("")).toBeNull();
    expect(parseMcpResponse("not json\n")).toBeNull();
  });

  it("takes the last data: line when multiple events are present", () => {
    const body =
      sseBody({ first: true }) + sseBody({ jsonrpc: "2.0", id: 2, result: { final: true } });
    const parsed = parseMcpResponse(body) as { result?: { final: boolean } };
    expect(parsed?.result?.final).toBe(true);
  });
});

describe("probeAgent", () => {
  const URL = "https://example.test/mcp";

  beforeEach(() => {
    __clearSessionCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("performs initialize + initialized + tools/list and returns discovered tools", async () => {
    const calls: Array<{ body: Record<string, unknown>; hadSession: boolean }> = [];
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      const headers = init!.headers as Record<string, string>;
      calls.push({ body, hadSession: Boolean(headers["mcp-session-id"]) });
      if (body.method === "initialize") {
        return sseResponse(
          {
            jsonrpc: "2.0",
            id: body.id,
            result: {
              protocolVersion: "2025-03-26",
              serverInfo: { name: "demo", version: "0.1.0" },
              capabilities: {},
            },
          },
          { "mcp-session-id": "sess-abc" },
        );
      }
      if (body.method === "notifications/initialized") {
        return new Response("", { status: 202 });
      }
      if (body.method === "tools/list") {
        return sseResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              { name: "get_signals", description: "find signals" },
              { name: "activate_signal", description: "activate" },
            ],
          },
        });
      }
      throw new Error(`unexpected method ${body.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await probeAgent({ url: URL });

    expect(r.ok).toBe(true);
    expect(r.protocol_version).toBe("2025-03-26");
    expect(r.server_info?.name).toBe("demo");
    expect(r.tools.map((t) => t.name)).toEqual(["get_signals", "activate_signal"]);
    expect(calls.map((c) => c.body.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
    ]);
    expect(calls[0]!.hadSession).toBe(false);
    expect(calls[1]!.hadSession).toBe(true);
    expect(calls[2]!.hadSession).toBe(true);
  });

  it("falls back to 2024-11-05 if 2025-03-26 is rejected", async () => {
    const attempts: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      if (body.method === "initialize") {
        attempts.push(body.params.protocolVersion);
        if (body.params.protocolVersion === "2025-03-26") {
          return sseResponse({
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32602, message: "Unsupported protocol version" },
          });
        }
        return sseResponse(
          {
            jsonrpc: "2.0",
            id: body.id,
            result: { protocolVersion: "2024-11-05", serverInfo: { name: "older" } },
          },
          { "mcp-session-id": "sess-fallback" },
        );
      }
      if (body.method === "notifications/initialized") {
        return new Response("", { status: 202 });
      }
      if (body.method === "tools/list") {
        return sseResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: { tools: [{ name: "legacy_tool" }] },
        });
      }
      throw new Error("unexpected");
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await probeAgent({ url: URL });

    expect(attempts).toEqual(["2025-03-26", "2024-11-05"]);
    expect(r.ok).toBe(true);
    expect(r.protocol_version).toBe("2024-11-05");
    expect(r.tools).toHaveLength(1);
  });

  it("returns ok:false with session_init_failed if no session header is returned", async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32600, message: "boom" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await probeAgent({ url: URL });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("session_init_failed");
    expect(r.tools).toEqual([]);
  });

  it("accepts a tools/list response delivered as plain JSON", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      if (body.method === "initialize") {
        return sseResponse(
          { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05" } },
          { "mcp-session-id": "sess-json" },
        );
      }
      if (body.method === "notifications/initialized") {
        return new Response("", { status: 202 });
      }
      if (body.method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: { tools: [{ name: "only_tool" }] },
        });
      }
      throw new Error("unexpected");
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await probeAgent({ url: URL });
    expect(r.ok).toBe(true);
    expect(r.tools.map((t) => t.name)).toEqual(["only_tool"]);
  });
});

describe("callTool", () => {
  const URL = "https://example.test/mcp";

  beforeEach(() => {
    __clearSessionCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns structuredContent unwrapped in data on success", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      if (body.method === "initialize") {
        return sseResponse(
          { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05" } },
          { "mcp-session-id": "sess-1" },
        );
      }
      if (body.method === "notifications/initialized") return new Response("", { status: 202 });
      if (body.method === "tools/call") {
        return sseResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: { structuredContent: { signals: [{ id: "s1" }] } },
        });
      }
      throw new Error("unexpected");
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await callTool({ url: URL }, "get_signals", { signal_spec: "luxury travel" });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ signals: [{ id: "s1" }] });
  });

  it("retries once with a fresh session when tools/call reports a session error", async () => {
    let sessionCounter = 0;
    let toolsCallCount = 0;
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      if (body.method === "initialize") {
        sessionCounter += 1;
        return sseResponse(
          { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05" } },
          { "mcp-session-id": `sess-${sessionCounter}` },
        );
      }
      if (body.method === "notifications/initialized") return new Response("", { status: 202 });
      if (body.method === "tools/call") {
        toolsCallCount += 1;
        if (toolsCallCount === 1) {
          return sseResponse({
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32000, message: "Invalid session id" },
          });
        }
        return sseResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: { structuredContent: { ok: true } },
        });
      }
      throw new Error("unexpected");
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await callTool({ url: URL }, "get_signals", {});
    expect(r.ok).toBe(true);
    expect(toolsCallCount).toBe(2);
    expect(sessionCounter).toBe(2);
  });
});
