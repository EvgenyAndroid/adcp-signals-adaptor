// tests/mcp-recent-no-arg-values.test.ts
// GET /mcp/recent is public. D1 stores each tool call's arguments
// (toolLogRepo.logCall), and the route used to return them verbatim as
// `argumentsJson` — so a buyer's push_notification_config credentials,
// briefs and other free text were readable by anyone. The route must
// return top-level argument KEYS only.
//
// The fake D1 below stores what logCall INSERTs and serves it back on
// SELECT, so the test runs the real write path and the real read path.
// It first asserts the secret really is in the stored row: the route,
// not the fake, has to be what strips it.

import { describe, it, expect } from "vitest";
import { handleToolLog } from "../src/routes/toolLog";
import { logCall } from "../src/storage/toolLogRepo";
import { createLogger } from "../src/utils/logger";
import type { Env } from "../src/types/env";

function makeToolLogDb(): { db: D1Database; rows: Record<string, unknown>[] } {
  const rows: Record<string, unknown>[] = [];
  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          bound = args;
          return this;
        },
        async run() {
          if (!sql.includes("INSERT INTO mcp_tool_calls")) throw new Error("unexpected write: " + sql);
          const [id, tool_name, arguments_json, response_size_bytes, status, error_message, duration_ms, caller, created_at] = bound;
          rows.push({ id, tool_name, arguments_json, response_size_bytes, status, error_message, duration_ms, caller, created_at });
          return { success: true, meta: {} } as unknown as D1Result;
        },
        async all<T>() {
          return { results: [...rows].reverse() as T[] };
        },
      };
    },
  } as unknown as D1Database;
  return { db, rows };
}

const CREDENTIAL = "buyer-webhook-credential-must-never-be-public-0123456789";
const WEBHOOK_URL = "https://buyer.example/webhooks/adcp?tenant=acme";
const BRIEF = "Confidential: Acme Q4 launch, target lapsed premium subscribers";
const SEGMENT_ID = "seg_private_buyer_42";

const activateArgs = {
  signal_agent_segment_id: SEGMENT_ID,
  destinations: [{ type: "platform", platform: "the-trade-desk" }],
  push_notification_config: {
    url: WEBHOOK_URL,
    authentication: { schemes: ["Bearer"], credentials: CREDENTIAL },
  },
};
const getSignalsArgs = { signal_spec: BRIEF, max_results: 5 };

async function fetchRecent(db: D1Database): Promise<{ text: string; body: { entries: Record<string, unknown>[] } }> {
  const res = await handleToolLog(
    new Request("https://agent.example/mcp/recent?limit=50"),
    { DB: db } as unknown as Env,
    createLogger("mcp-recent-test"),
  );
  expect(res.status).toBe(200);
  const text = await res.text();
  return { text, body: JSON.parse(text) };
}

describe("GET /mcp/recent — no argument values", () => {
  it("returns top-level arg keys and none of the values, including nested authentication.credentials", async () => {
    const { db, rows } = makeToolLogDb();
    await logCall(db, {
      toolName: "activate_signal",
      argumentsJson: JSON.stringify(activateArgs),
      responseSizeBytes: 512,
      status: "ok",
      durationMs: 12,
      caller: "authed",
    });
    await logCall(db, {
      toolName: "get_signals",
      argumentsJson: JSON.stringify(getSignalsArgs),
      responseSizeBytes: 2048,
      status: "ok",
      durationMs: 40,
      caller: "unauth",
    });

    // Precondition: the values are in storage, so the route is what must drop them.
    expect(String(rows[0]!.arguments_json)).toContain(CREDENTIAL);
    expect(String(rows[1]!.arguments_json)).toContain(BRIEF);

    const { text, body } = await fetchRecent(db);

    for (const value of [CREDENTIAL, WEBHOOK_URL, BRIEF, SEGMENT_ID, "the-trade-desk", "Bearer"]) {
      expect(text).not.toContain(value);
    }
    expect(text).not.toContain("argumentsJson");

    const activate = body.entries.find((e) => e.tool === "activate_signal")!;
    const getSignals = body.entries.find((e) => e.tool === "get_signals")!;
    expect(activate.argKeys).toEqual(["signal_agent_segment_id", "destinations", "push_notification_config"]);
    expect(getSignals.argKeys).toEqual(["signal_spec", "max_results"]);
    // Nested keys stay opaque too (argKeysOf is top-level only).
    expect(text).not.toContain("authentication");
    expect(text).not.toContain("credentials");
  });

  it("returns no keys and no partial payload for a row truncated at write time", async () => {
    const { db } = makeToolLogDb();
    const longBrief = BRIEF + " " + "x".repeat(5000);
    await logCall(db, {
      toolName: "get_signals",
      argumentsJson: JSON.stringify({ signal_spec: longBrief }),
      responseSizeBytes: 0,
      status: "error",
      errorMessage: "McpToolError: invalid",
      durationMs: 3,
      caller: "unauth",
    });

    const { text, body } = await fetchRecent(db);

    expect(text).not.toContain(BRIEF);
    expect(text).not.toContain("xxxxxxxx");
    expect(body.entries[0]!.argKeys).toEqual([]);
  });
});
